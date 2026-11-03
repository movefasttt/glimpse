// Self-test for score.mjs: positive/negative controls on fixtures.jsonl. `node selftest.mjs` exits non-zero on failure.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonl, scoreFile, metrics, printSummary } from './score.mjs';
import { lexBlocks, blockKey } from './lib/mdblocks.mjs';
import { makeParseMermaid } from './lib/mermaid-node.mjs';
import baseline from './baseline.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures.jsonl');
const fixtures = readJsonl(FIX);
const byInput = new Map(fixtures.map(s => [s.input, s]));
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++; };
const r1 = v => (v == null ? 'null' : v.toFixed(1));

// Markdown that a perfect formatter would emit for the truth blocks.
function truthMarkdown(blocks) {
  return blocks.map(b => {
    switch (b.type) {
      case 'heading': return '## ' + b.text;
      case 'list': return '- ' + b.text;
      case 'quote': return '> ' + b.text;
      case 'code': return '```\n' + b.text + '\n```';
      case 'diagram': return '```mermaid\n' + b.text + '\n```';
      case 'rule': return '---';
      case 'table': return [b.rows[0], b.rows[0].map(() => '---'), ...b.rows.slice(1)]
        .map(r => '| ' + r.map(c => c.replace(/\|/g, '\\|')).join(' | ') + ' |').join('\n');
      default: return b.text;
    }
  }).join('\n\n');
}

const truthFmt = async text => {
  const s = byInput.get(text);
  return { markdown: truthMarkdown(s.blocks), lines: s.lines.map(l => ({ type: l.type, cont: l.cont })) };
};
const allParaFmt = async text => ({ markdown: text, lines: text.split('\n').map((_, i) => ({ type: 'para', cont: i > 0 })) });
const wrongLenFmt = async text => ({ markdown: text, lines: [{ type: 'para', cont: false }, ...text.split('\n').map(() => ({ type: 'para', cont: false }))] });

const parseMermaid = await makeParseMermaid();
const opts = { parseMermaid };
const byId = recs => new Map(recs.map(r => [r.id, r]));

// 0. block extractor round-trip: truth blocks -> markdown -> lexBlocks gives the same keys
{
  let ok = 0;
  for (const s of fixtures) {
    const got = lexBlocks(truthMarkdown(s.blocks)).map(blockKey).join('\n#\n');
    if (got === s.blocks.map(blockKey).join('\n#\n')) ok++; else console.log('  round-trip mismatch:', s.id);
  }
  check(ok === fixtures.length, `block extractor round-trips truth blocks (${ok}/${fixtures.length})`);
  const md = '# Title **bold**\n\nSee [the docs](https://x.y) and `code`.\n\n- a\n  - b\n\n```mermaid\ngraph LR\n```\n\n| h | i |\n|---|---|\n| 1 | 2 |';
  const keys = lexBlocks(md).map(b => b.type + ':' + (b.text ?? JSON.stringify(b.rows)));
  check(JSON.stringify(keys) === JSON.stringify(['heading:Title bold', 'para:See the docs and code.', 'list:a', 'list:b', 'diagram:graph LR', 'table:[["h","i"],["1","2"]]']),
    `lexBlocks vocabulary + normalization: ${JSON.stringify(keys)}`);
}

// 1. positive control: truth labels score 100% everywhere, zero damage
{
  const recs = await scoreFile(truthFmt, FIX, opts);
  printSummary('truth formatter', recs);
  const m = metrics(recs);
  check(m.errors === 0 && m.neverWorse === 100 && m.lineAcc === 100 && m.macroAcc === 100 && m.joinP === 100 && m.joinR === 100 && m.blockRec === 100 && m.chrome === 100,
    `truth: never-worse ${r1(m.neverWorse)}, line acc ${r1(m.lineAcc)}, macro ${r1(m.macroAcc)}, join P/R ${r1(m.joinP)}/${r1(m.joinR)}, block rec ${r1(m.blockRec)}, chrome ${r1(m.chrome)}`);
}

// 2. negative control: every line para + cont -> damage on every code/table/diagram/list sample
{
  const recs = await scoreFile(allParaFmt, FIX, opts);
  printSummary('all-para formatter', recs);
  const m = metrics(recs);
  const structural = fixtures.filter(s => s.lines.some(l => ['code', 'table', 'diagram', 'list'].includes(l.type))).map(s => s.id);
  const R = byId(recs);
  const allDamaged = structural.every(id => R.get(id).damage);
  check(allDamaged, `all-para: every structural fixture damaged (${structural.filter(id => R.get(id).damage).length}/${structural.length})`);
  check(!R.get('fx-para-wrap').damage, 'all-para: plain wrapped paragraph is not damaged (damage is structure-only)');
  check(m.neverWorse < 30, `all-para: never-worse ${r1(m.neverWorse)}% (expect low)`);
  check(m.chrome === 0, `all-para: chrome handling ${r1(m.chrome)}% (expect 0)`);
}

// 3. wrong-length control: hard error per sample, counted
{
  const recs = await scoreFile(wrongLenFmt, FIX, opts);
  const m = metrics(recs);
  check(m.errors === fixtures.length && m.neverWorse === 0, `wrong length: ${m.errors}/${fixtures.length} errors, never-worse ${r1(m.neverWorse)}`);
}

// 4. baseline (today's pipeline) reproduces the known failures and keeps what it handles
{
  const recs = await scoreFile(baseline, FIX, opts);
  printSummary('baseline (with mermaid parser)', recs);
  const R = byId(recs);
  const errs = recs.filter(r => r.error);
  check(errs.length === 0, `baseline: no errors ${errs.map(r => r.id + ': ' + r.error).join('; ')}`);
  check(R.get('fx-code-plain').damage, 'baseline: plain code without fences is joined into a paragraph (damage)');
  check(R.get('fx-mermaid-partial-invalid').damage, 'baseline: unfenced mermaid that fails to parse is joined into a paragraph (damage)');
  check(R.get('fx-heading-para-code').damage, 'baseline: code lines after a paragraph are joined into it (damage)');
  check(!R.get('fx-mermaid-valid').damage && R.get('fx-mermaid-valid').blocks.every(b => b.ok), 'baseline: valid unfenced mermaid is detected as a diagram');
  check(!R.get('fx-para-wrap').damage && R.get('fx-para-wrap').blocks.every(b => b.ok), 'baseline: hard-wrapped paragraph joined, block recovered');
  for (const id of ['fx-box-table', 'fx-table-wrapped-cell'])
    check(!R.get(id).damage && R.get(id).blocks.every(b => b.ok), `baseline: ${id} rebuilt as a table, block recovered`);
  check(!R.get('fx-list').damage && R.get('fx-list').blocks.every(b => b.ok), 'baseline: list items kept separate, blocks recovered');
  const m = metrics(recs);
  check(m.chrome === 0, `baseline: chrome handling ${r1(m.chrome)}% (never classifies chrome)`);
  const p = metrics(recs.filter(r => r.id === 'fx-para-wrap'));
  check(p.joinR === 100, `baseline: join recall on the wrapped paragraph ${r1(p.joinR)}`);

  const noMm = await scoreFile(baseline, FIX, {});
  check(byId(noMm).get('fx-mermaid-valid').damage, 'baseline without a mermaid parser: valid diagram becomes a paragraph (damage)');
}

console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
