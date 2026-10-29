#!/usr/bin/env node
// Glimpse formatter scorer. Spec: docs/dataset.md ("Formatter contract", "Metrics").
//
//   node score.mjs <formatter.mjs> [samples.jsonl] [--gold gold.jsonl] [--out report.md] [--show N] [--no-mermaid]
//
// Writes <out> (markdown report) and <out minus .md>.samples.jsonl (per-sample results), prints a summary.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { lexBlocks, alignBlocks } from './lib/mdblocks.mjs';
import { marked } from 'marked';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TYPES = ['heading', 'para', 'list', 'quote', 'table', 'code', 'diagram', 'rule', 'blank', 'chrome', 'verbatim'];
// `verbatim` (engine v2 floor): neither correct nor damage - it never equals a truth type and is in no damage class.
const JOINABLE = new Set(['para', 'list', 'quote', 'heading']);
const PROSE = new Set(['para', 'list', 'quote', 'heading']);
const STRUCT = new Set(['code', 'table', 'diagram']);
const NOJOIN = new Set(['code', 'table', 'diagram', 'list', 'heading']);

export function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim()).map((l, k) => {
    try { return JSON.parse(l); } catch (e) { throw new Error(`${file}:${k + 1}: ${e.message}`); }
  });
}

export async function loadFormatter(file) {
  const mod = await import(pathToFileURL(path.resolve(file)).href);
  const fn = typeof mod.default === 'function' ? mod.default
    : typeof mod.format === 'function' ? mod.format
    : mod.default && typeof mod.default.format === 'function' ? mod.default.format : null;
  if (!fn) throw new Error(`${file}: no default export or named "format" function`);
  return fn;
}

// Damage (spec "Never-worse rate"): structure read as prose, a line that must start fresh joined to the previous one,
// or reply content classified as chrome (formatters drop chrome lines, so that is deleted text - the worst kind of worse).
// A chrome line with `demoted: true` stays in the output (dimmed): reply content predicted demoted is a type error, not deletion.
export function damageReason(truth, pred) {
  if (truth.type !== 'chrome' && truth.type !== 'blank' && pred.type === 'chrome' && !pred.demoted) return `${truth.type} deleted`;
  if (STRUCT.has(truth.type) && PROSE.has(pred.type)) return `${truth.type}->${pred.type}`;
  if ((truth.type === 'code' || truth.type === 'diagram') && pred.type === 'table') return `${truth.type}->table`;
  if (!truth.cont && NOJOIN.has(truth.type) && pred.cont) return `${truth.type} joined`;
  return null;
}

// Words of the input missing from the output (spec: "any input word missing from the output").
// Words = letter/number runs, so markers a formatter rewrites on purpose (⏺, ▎, bullets, box lines, markdown syntax) never count.
// Lines the formatter marked chrome (and did not demote) are excluded: dropping real content that way is already counted
// per line. Demoted chrome lines are in the output, so their words must be too.
const WORD = /[\p{L}\p{N}]+/gu;
const unescape = md => md.replace(/\\([\\`*_{}\[\]()#+\-.!|<>&~])/g, '$1');
// Rendered text: what the panel shows after marked (tags stripped, entities decoded). Words are checked there, not in
// the markdown source, so text the parser eats (raw HTML, a doubly escaped cell bar) counts as lost.
// Same definition as the engine's shownText (engine/70-render.js), so the scorer and the panel agree on what is shown.
export const toHtml = md => marked.parse(md || '', { gfm: true, breaks: false });
export const renderText = md => toHtml(md).replace(/<[^>]*>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');
export function lostWords(input, markdown, predLines) {
  // not counted: list-marker numbers (shown as the list's numbering) and Claude Code's bare `mermaid` tag line
  const kept = input.split('\n').filter((l, i) => !(predLines?.[i]?.type === 'chrome' && !predLines[i].demoted) && !/^\s*(⏺\s+)?mermaid\s*$/.test(l))
    .map(l => l.replace(/^(\s*(?:⏺\s+)?)([-*+•◦▪‣]|\d{1,3}[.)])\s+/, '$1')).join('\n');
  // Distinct words, not counts: a Label: table legitimately states each repeated label once, as a column header.
  const have = new Set(renderText(markdown).match(WORD) || []);
  return [...new Set(kept.match(WORD) || [])].filter(w => !have.has(w));
}

// Score one sample. Returns a self-contained record (also written to the per-sample JSONL).
export async function scoreSample(fmt, sample, opts) {
  const inLines = sample.input.split('\n');
  const rec = { id: sample.id, kind: sample.kind, set: opts.set || 'samples', error: null, ms: 0 };
  if (!Array.isArray(sample.lines) || sample.lines.length !== inLines.length) {
    rec.error = `invalid sample: ${sample.lines?.length} labels for ${inLines.length} input lines`;
    rec.invalidSample = true;
    return rec;
  }
  let out;
  const t0 = process.hrtime.bigint();
  try { out = await fmt(sample.input, { parseMermaid: opts.parseMermaid, toHtml }); }
  catch (e) { rec.error = `formatter threw: ${String(e && e.stack || e).split('\n').slice(0, 2).join(' / ')}`; }
  rec.ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (!rec.error && (!out || !Array.isArray(out.lines))) rec.error = 'formatter returned no lines array';
  else if (!rec.error && out.lines.length !== inLines.length) rec.error = `wrong lines length: ${out.lines.length}, expected ${inLines.length}`;
  if (rec.error) return rec;

  rec.lines = sample.lines.map((t, i) => {
    const p = out.lines[i] || {};
    return { t: t.type, tc: Boolean(t.cont), p: String(p.type), pc: Boolean(p.cont), pd: p.type === 'chrome' && Boolean(p.demoted) };
  });
  rec.damaged = [];
  rec.lines.forEach((l, i) => {
    const why = damageReason({ type: l.t, cont: l.tc }, { type: l.p, cont: l.pc, demoted: l.pd });
    if (why) rec.damaged.push({ i, why });
  });
  rec.lost = lostWords(sample.input, typeof out.markdown === 'string' ? out.markdown : '', out.lines);
  rec.damage = rec.damaged.length > 0 || rec.lost.length > 0;

  const truthBlocks = sample.blocks || [];
  let predBlocks = [];
  try { predBlocks = lexBlocks(typeof out.markdown === 'string' ? out.markdown : ''); }
  catch (e) { rec.blockError = String(e.message || e); }
  const matched = alignBlocks(truthBlocks, predBlocks);
  rec.blocks = truthBlocks.map((b, k) => ({ type: b.type, ok: matched.has(k) }));
  rec.predBlocks = predBlocks.length;
  rec.markdown = typeof out.markdown === 'string' ? out.markdown : '';
  return rec;
}

const pct = (a, b) => (b ? (100 * a) / b : null);
const fmtPct = v => (v === null || v === undefined ? '-' : v.toFixed(1));

// Aggregate metrics over scored records. `onlyType` restricts line/block metrics to that truth type.
export function metrics(recs, onlyType = null) {
  const ok = recs.filter(r => !r.error);
  const m = {
    samples: recs.length, errors: recs.filter(r => r.error && !r.invalidSample).length,
    invalid: recs.filter(r => r.invalidSample).length,
  };
  let lines = 0, right = 0, chromeT = 0, chromeR = 0, tp = 0, fp = 0, fn = 0, bTot = 0, bOk = 0, dmgLines = 0;
  const perType = {};
  let withType = 0, cleanOnType = 0;
  for (const r of ok) {
    let has = false, dmg = false;
    for (const [i, l] of r.lines.entries()) {
      if (onlyType && l.t !== onlyType) continue;
      if (onlyType) has = true;
      if (l.t !== 'blank') {
        lines++;
        if (l.p === l.t) right++;
        perType[l.t] ??= [0, 0];
        perType[l.t][0]++;
        if (l.p === l.t) perType[l.t][1]++;
      }
      if (l.t === 'chrome') { chromeT++; if (l.p === 'chrome') chromeR++; }   // recognized whether demoted or dropped
      if (JOINABLE.has(l.t)) {
        if (l.tc && l.pc) tp++; else if (!l.tc && l.pc) fp++; else if (l.tc && !l.pc) fn++;
      }
      if (r.damaged.some(d => d.i === i)) { dmgLines++; dmg = true; }
    }
    for (const b of r.blocks) {
      if (onlyType && b.type !== onlyType) continue;
      bTot++; if (b.ok) bOk++;
    }
    if (onlyType && has) { withType++; if (!dmg) cleanOnType++; }
  }
  const macroVals = Object.values(perType).map(([n, k]) => k / n);
  Object.assign(m, {
    lines, lineAcc: pct(right, lines),
    macroAcc: macroVals.length ? (100 * macroVals.reduce((a, b) => a + b, 0)) / macroVals.length : null,
    joinP: pct(tp, tp + fp), joinR: pct(tp, tp + fn), joinTP: tp, joinFP: fp, joinFN: fn,
    blocks: bTot, blockRec: pct(bOk, bTot),
    chromeLines: chromeT, chrome: pct(chromeR, chromeT),
    damagedLines: dmgLines,
  });
  if (onlyType) {
    m.samplesWithType = withType;
    m.neverWorse = pct(cleanOnType, withType);   // share of samples containing the type with no damage on its lines
  } else {
    // Errored samples (formatter threw / wrong length) count as damaged: no evidence they are safe.
    const scored = recs.filter(r => !r.invalidSample);
    m.neverWorse = pct(scored.filter(r => !r.error && !r.damage).length, scored.length);
    const ms = ok.map(r => r.ms).sort((a, b) => a - b);
    m.msMean = ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null;
    m.msP95 = ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))] : null;
  }
  return m;
}

export async function scoreFile(fmt, file, opts) {
  const recs = [];
  for (const s of readJsonl(file)) recs.push(await scoreSample(fmt, s, opts));
  return recs;
}

// ---- report -------------------------------------------------------------------------------------------------

const MAIN_COLS = [
  ['n', m => String(m.samples)], ['err', m => String(m.errors + m.invalid)],
  ['never-worse %', m => fmtPct(m.neverWorse)], ['line acc %', m => fmtPct(m.lineAcc)], ['macro acc %', m => fmtPct(m.macroAcc)],
  ['join P %', m => fmtPct(m.joinP)], ['join R %', m => fmtPct(m.joinR)], ['block rec %', m => fmtPct(m.blockRec)],
  ['chrome %', m => fmtPct(m.chrome)], ['ms mean', m => (m.msMean == null ? '-' : m.msMean.toFixed(1))],
];
const TYPE_COLS = [
  ['lines', m => String(m.lines)], ['type acc %', m => fmtPct(m.lineAcc)], ['join P %', m => fmtPct(m.joinP)], ['join R %', m => fmtPct(m.joinR)],
  ['blocks', m => String(m.blocks)], ['block rec %', m => fmtPct(m.blockRec)], ['damaged lines', m => String(m.damagedLines)],
  ['samples w/ type', m => String(m.samplesWithType)], ['never-worse on type %', m => fmtPct(m.neverWorse)],
];

function mdTable(head, rows) {
  return [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n');
}

export function sections(recs) {
  const rows = [['all', metrics(recs)]];
  const kinds = [...new Set(recs.map(r => r.kind))].sort();
  for (const k of kinds) rows.push([`kind: ${k}`, metrics(recs.filter(r => r.kind === k))]);
  const present = TYPES.filter(t => t !== 'blank' && recs.some(r => r.lines?.some(l => l.t === t)));
  const types = present.map(t => [t, metrics(recs, t)]);
  // confusion matrix: truth (rows) x predicted (cols), non-blank truth lines
  const conf = {};
  for (const r of recs) for (const l of r.lines || []) if (l.t !== 'blank') { conf[l.t] ??= {}; conf[l.t][l.p] = (conf[l.t][l.p] || 0) + 1; }
  return { rows, types, conf };
}

function renderSet(title, recs) {
  const { rows, types, conf } = sections(recs);
  const predTypes = [...new Set(Object.values(conf).flatMap(o => Object.keys(o)))].sort((a, b) => TYPES.indexOf(a) - TYPES.indexOf(b));
  const errs = recs.filter(r => r.error);
  const dmgWhy = {};
  for (const r of recs) for (const d of r.damaged || []) dmgWhy[d.why] = (dmgWhy[d.why] || 0) + 1;
  const lostN = recs.filter(r => r.lost?.length).length;
  if (lostN) dmgWhy['samples with lost words'] = lostN;
  return [
    `## ${title}`, '',
    mdTable(['set', ...MAIN_COLS.map(c => c[0])], rows.map(([name, m]) => [name, ...MAIN_COLS.map(c => c[1](m))])), '',
    `### Per truth content type (${title})`, '',
    mdTable(['type', ...TYPE_COLS.map(c => c[0])], types.map(([t, m]) => [t, ...TYPE_COLS.map(c => c[1](m))])), '',
    `### Damage by cause (${title})`, '',
    Object.keys(dmgWhy).length ? mdTable(['cause', 'lines'], Object.entries(dmgWhy).sort((a, b) => b[1] - a[1])) : 'No damaged lines.', '',
    `### Confusion, truth x predicted (${title}, non-blank lines)`, '',
    mdTable(['truth \\ pred', ...predTypes], Object.keys(conf).sort((a, b) => TYPES.indexOf(a) - TYPES.indexOf(b))
      .map(t => [t, ...predTypes.map(p => String(conf[t][p] || ''))])), '',
    errs.length ? `### Errors (${title}): ${errs.length}\n\n` + errs.slice(0, 30).map(r => `- \`${r.id}\`: ${r.error}`).join('\n') + '\n' : '',
  ].join('\n');
}

export function renderReport({ formatter, sampleFile, goldFile, recs, gold }) {
  return [
    `# Score: ${path.basename(formatter)}`, '',
    `Samples: \`${sampleFile}\`${goldFile ? `; gold: \`${goldFile}\`` : ''}. Generated ${new Date().toISOString()}.`, '',
    'Definitions: docs/dataset.md "Metrics". never-worse = samples with no damaged line (formatter errors count as damaged). ' +
      'line acc = non-blank lines with predicted type = truth type; macro = mean of per-type accuracy. ' +
      'join P/R = predicted cont vs truth cont over truth para/list/quote/heading lines. ' +
      'block rec = truth blocks matched exactly (type + normalized text/rows) by in-order alignment against blocks lexed from the formatter markdown. ' +
      'Per-type "never-worse on type" = samples containing the type with no damage on that type\'s lines.', '',
    renderSet('Samples', recs),
    gold ? renderSet('Gold (Darwin\'s real copies)', gold) : '',
  ].join('\n');
}

export function printSummary(label, recs) {
  const { rows } = sections(recs);
  const head = ['set', ...MAIN_COLS.map(c => c[0])];
  const body = rows.map(([name, m]) => [name, ...MAIN_COLS.map(c => c[1](m))]);
  const w = head.map((h, k) => Math.max(h.length, ...body.map(r => r[k].length)));
  console.log(`\n${label}`);
  console.log(head.map((h, k) => h.padEnd(w[k])).join('  '));
  for (const r of body) console.log(r.map((c, k) => c.padEnd(w[k])).join('  '));
}

export function showWorst(recs, samplesById, n) {
  const ranked = recs.filter(r => !r.invalidSample).map(r => ({
    r, key: r.error ? Infinity : r.damaged.length,
    acc: r.error ? 0 : r.lines.filter(l => l.t !== 'blank' && l.t === l.p).length / Math.max(1, r.lines.filter(l => l.t !== 'blank').length),
  })).sort((a, b) => b.key - a.key || a.acc - b.acc).slice(0, n);
  for (const { r, acc } of ranked) {
    const s = samplesById.get(r.id);
    console.log(`\n=== ${r.id}  kind=${r.kind}  ${r.error ? 'ERROR: ' + r.error : `damaged=${r.damaged.length}  typeAcc=${(100 * acc).toFixed(0)}%  blocks=${r.blocks.filter(b => b.ok).length}/${r.blocks.length}`}`);
    const inLines = s.input.split('\n');
    const dm = new Map((r.damaged || []).map(d => [d.i, d.why]));
    inLines.forEach((text, i) => {
      const t = s.lines[i] || {};
      const p = r.lines ? r.lines[i] : null;
      const tl = `${t.type}${t.cont ? '+' : ''}`, pl = p ? `${p.p}${p.pc ? '+' : ''}` : '?';
      const mark = dm.has(i) ? '!!' : p && p.p !== t.type && t.type !== 'blank' ? ' ~' : '  ';
      console.log(`${String(i).padStart(3)} ${tl.padEnd(9)} ${pl.padEnd(9)}${mark} ${text.length > 110 ? text.slice(0, 107) + '...' : text}`);
    });
  }
  if (ranked.length) console.log('\n(columns: line, truth type, predicted type; "+" = cont; !! = damage, ~ = type mismatch)');
}

// ---- CLI ----------------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const a = { pos: [], show: 0, mermaid: true };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--gold') a.gold = argv[++i];
    else if (x === '--out') a.out = argv[++i];
    else if (x === '--show') a.show = Number(argv[++i]);
    else if (x === '--no-mermaid') a.mermaid = false;
    else if (x === '-h' || x === '--help') a.help = true;
    else a.pos.push(x);
  }
  return a;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.help || !a.pos[0]) {
    console.log('usage: node score.mjs <formatter.mjs> [samples.jsonl] [--gold gold.jsonl] [--out report.md] [--show N] [--no-mermaid]');
    process.exit(a.help ? 0 : 2);
  }
  const formatter = a.pos[0];
  const sampleFile = a.pos[1] || path.join(HERE, 'samples.jsonl');
  const out = a.out || path.join(HERE, `${path.basename(formatter).replace(/\.[mc]?js$/, '')}-report.md`);
  const fmt = await loadFormatter(formatter);
  const parseMermaid = a.mermaid ? await (await import('./lib/mermaid-node.mjs')).makeParseMermaid() : undefined;

  const recs = await scoreFile(fmt, sampleFile, { parseMermaid, set: 'samples' });
  const gold = a.gold ? await scoreFile(fmt, a.gold, { parseMermaid, set: 'gold' }) : null;

  fs.writeFileSync(out, renderReport({ formatter, sampleFile, goldFile: a.gold, recs, gold }));
  const perSample = out.replace(/\.md$/, '') + '.samples.jsonl';
  fs.writeFileSync(perSample, [...recs, ...(gold || [])].map(r => JSON.stringify({
    id: r.id, set: r.set, kind: r.kind, error: r.error, ms: Number(r.ms.toFixed(2)),
    damage: r.error ? null : r.damage, damaged: r.damaged || [], lost: r.lost || [],
    blocks: r.blocks ? `${r.blocks.filter(b => b.ok).length}/${r.blocks.length}` : null,
    missedBlocks: r.blocks ? r.blocks.map((b, k) => (b.ok ? null : `${k}:${b.type}`)).filter(Boolean) : [],
    pred: r.lines ? r.lines.map(l => l.p + (l.pc ? '+' : '')) : null,
    demoted: r.lines ? r.lines.flatMap((l, i) => (l.pd ? [i] : [])) : [],
  })).join('\n') + '\n');

  printSummary(`Samples (${sampleFile})`, recs);
  if (gold) printSummary(`Gold (${a.gold})`, gold);
  console.log(`\nreport: ${out}\nper-sample: ${perSample}`);
  if (a.show > 0) {
    const byId = new Map([...readJsonl(sampleFile), ...(a.gold ? readJsonl(a.gold) : [])].map(s => [s.id, s]));
    showWorst([...recs, ...(gold || [])], byId, a.show);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(e => { console.error(e); process.exit(1); });
}
