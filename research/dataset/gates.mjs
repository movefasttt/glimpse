#!/usr/bin/env node
// Engine v2 go/no-go: the Gates table of docs/engine-v2.md (revision 3), baseline vs candidate.
//
//   node gates.mjs <baseline-formatter.js> <candidate-formatter.js> [--no-panel] [--panel-n 100]
//
// Splits: samples-tune.jsonl / samples-heldout.jsonl (node split.mjs; written here if missing). "Samples" gates use the
// tune split, as the doc's Splits section says; held-out and all-samples numbers are printed alongside.
// Exit 0 when every gate passes.
import { toHtml } from './score.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { marked } from 'marked';
import { fileURLToPath } from 'node:url';
import { loadFormatter, scoreFile, metrics, readJsonl, lostWords } from './score.mjs';
import { makeParseMermaid } from './lib/mermaid-node.mjs';
import { writeSplit } from './split.mjs';
import { rawmdGate, rawReplies, rawmdLoss } from './rawmd-gate.mjs';
import { ruleBudget } from './rule-budget.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const P = f => path.join(HERE, f);
const args = process.argv.slice(2);
const pos = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--panel-n');
const flag = f => args.includes(f);
const panelN = args.includes('--panel-n') ? +args[args.indexOf('--panel-n') + 1] : 100;
if (pos.length < 2) { console.log('usage: node gates.mjs <baseline.js> <candidate.js> [--no-panel] [--panel-n N]'); process.exit(2); }
const [basePath, candPath] = pos.map(p => path.resolve(p));

const f1 = v => (v == null || Number.isNaN(v) ? '-' : v.toFixed(1));
const log = (...a) => process.stderr.write(a.join(' ') + '\n');   // progress on stderr, table on stdout

// ---- run a child process, capture output (no `timeout` on macOS: kill from a timer) ----
function run(cmd, argv, { env, timeoutMs = 120000 } = {}) {
  return new Promise(resolve => {
    const ch = spawn(cmd, argv, { cwd: HERE, env: { ...process.env, ...env } });
    let out = '';
    ch.stdout.on('data', d => (out += d));
    ch.stderr.on('data', d => (out += d));
    const t = setTimeout(() => { ch.kill('SIGKILL'); out += '\n[killed: timeout]'; }, timeoutMs);
    ch.on('close', code => { clearTimeout(t); resolve({ code, out }); });
  });
}
async function pool(items, n, fn) {
  const res = new Array(items.length);
  let k = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (k < items.length) { const i = k++; res[i] = await fn(items[i], i); } }));
  return res;
}

// ---- pathological inputs (latency gate) ----
function pathological() {
  const words = 'the formatter keeps every word of the input and decides structure by evidence not by order'.split(' ');
  const prose = n => Array.from({ length: n }, (_, i) => words.map((w, k) => words[(k + i) % words.length]).join(' ').slice(0, 60 + (i % 37)));
  return [
    ['10k lines of prose', prose(10000).map(l => '  ' + l).join('\n')],
    ['one 200k-char line', words.join(' ').repeat(Math.ceil(200000 / 90)).slice(0, 200000)],
    ['5k box-table rows', ['  ┌──────┬────────────┐', '  │ id   │ name       │', '  ├──────┼────────────┤',
      ...Array.from({ length: 5000 }, (_, i) => `  │ ${String(i).padEnd(4)} │ row ${String(i).padEnd(6)} │`), '  └──────┴────────────┘'].join('\n')],
    ['3k backticks', Array.from({ length: 100 }, (_, i) => Array.from({ length: 30 }, (_, k) => `w${i}${k}\``).join(' ')).join('\n')],
    ['deeply indented code', Array.from({ length: 2000 }, (_, i) => ' '.repeat(i % 400) + (i % 2 ? 'if (x' + i + ') {' : '}')).join('\n')],
    ['2k ⏺ Bash( tool calls', Array.from({ length: 2000 }, (_, i) => `⏺ Bash(ls -la /tmp/dir${i} | grep foo)`).join('\n')],
    ['3k blank-separated code lines', Array.from({ length: 3000 }, (_, i) => `x${i} = foo(${i});`).join('\n\n')],
    ['10k-line Claude Code reply', '⏺ ' + Array.from({ length: 10000 }, (_, i) => `  The quick brown fox jumps over the lazy dog near the river bank ${i}`).join('\n')],
    ['glued line of 3k box rows', Array.from({ length: 3000 }, (_, i) => ('  │ ' + String(i).padEnd(6) + '│      │ x │').padEnd(60)).join('')],
    ['mixed CJK', Array.from({ length: 5000 }, (_, i) => ['  한국어 문장과 English words 섞인 줄 ' + i, '  中文字符和 mixed ASCII 文本 ' + i, '  日本語のテキスト and more ' + i][i % 3].repeat(1 + (i % 3))).join('\n')],
  ];
}

async function evalFormatter(file, label, ctx) {
  log(`[${label}] scoring ${path.basename(file)}`);
  const fmt = await loadFormatter(file);
  const opts = { parseMermaid: ctx.parseMermaid, toHtml };   // the panel's configuration
  const tune = await scoreFile(fmt, P('samples-tune.jsonl'), { ...opts, set: 'samples' });
  const held = await scoreFile(fmt, P('samples-heldout.jsonl'), { ...opts, set: 'samples' });
  const gold = await scoreFile(fmt, P('gold.jsonl'), { ...opts, set: 'gold' });
  const r = { tune, held, gold, m: { tune: metrics(tune), held: metrics(held), all: metrics([...tune, ...held]), gold: metrics(gold) } };

  const ms = [...tune, ...held].filter(x => !x.error).map(x => x.ms).sort((a, b) => a - b);
  r.p99 = ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.99))] : null;
  r.patho = [];
  for (const [name, input] of ctx.patho) {
    const t = [];
    let err = null;
    for (let k = 0; k < 3; k++) {
      const t0 = process.hrtime.bigint();
      try { await fmt(input, opts); } catch (e) { err = String(e).slice(0, 80); }
      t.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    t.sort((a, b) => a - b);
    r.patho.push({ name, median: t[1], max: t[2], err });
  }

  // other-sources set (research/other/*.txt, unlabeled): reported, not gated
  r.other = [];
  for (const f of ctx.otherFiles) {
    const text = fs.readFileSync(f, 'utf8');
    try {
      const o = await fmt(text, opts);
      r.other.push({ file: path.basename(f), lost: lostWords(text, o.markdown, o.lines).length, len: o.lines.length === text.split('\n').length });
    } catch (e) { r.other.push({ file: path.basename(f), threw: String(e).slice(0, 60) }); }
  }

  log(`[${label}] adversarial`);
  r.adv = await run('node', [P('adversarial-gate.mjs'), file], { timeoutMs: 120000 });
  r.advFails = (r.adv.out.match(/^FAIL.*$/gm) || []);
  log(`[${label}] raw markdown`);
  r.raw = await rawmdGate(file, { parseMermaid: ctx.parseMermaid, texts: ctx.rawTexts });
  if (ctx.panelFiles) {
    log(`[${label}] panel x${ctx.panelFiles.length}`);
    const res = await pool(ctx.panelFiles, Math.max(2, Math.min(8, os.cpus().length - 2)), f =>
      run('node', [path.join(HERE, '../harness/panel.mjs'), f], { env: { GLIMPSE_FORMAT: file }, timeoutMs: 60000 }));
    r.panelErr = res.map((x, i) => ({ f: path.basename(ctx.panelFiles[i]), x })).filter(({ x }) => x.code !== 0 || !/^errors: none$/m.test(x.out))
      .map(({ f, x }) => `${f}: ${(x.out.match(/^errors: .*$/m) || [x.out.trim().split('\n').pop()])[0].slice(0, 140)}`);
    // template.html catches a formatter throw and silently shows the source in a bare <pre>: no page error. Flag it when
    // the formatter's own markdown (run here in node) is not a single code block, i.e. the panel can't have meant a <pre>.
    for (const [i, x] of res.entries()) {
      if ((x.out.match(/^blocks: (.*)$/m) || [])[1] !== 'PRE') continue;
      let md = null;
      try { md = (await fmt(fs.readFileSync(ctx.panelFiles[i], 'utf8'), opts)).markdown; } catch { /* threw in node too */ }
      const toks = md == null ? [] : marked.lexer(md).filter(t => t.type !== 'space');
      if (!(toks.length === 1 && toks[0].type === 'code')) r.panelErr.push(`${path.basename(ctx.panelFiles[i])}: silent fallback (formatter threw in the panel)`);
    }
  }
  log(`[${label}] rule budget`);
  r.budget = await ruleBudget(file);
  return r;
}

function panelInputs(n) {
  const dir = P('panel-inputs');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
  const samples = readJsonl(P('samples.jsonl')), gold = readJsonl(P('gold.jsonl'));
  const nGold = Math.min(gold.length, Math.round(n / 4)), nS = n - nGold;
  const pick = (arr, k) => Array.from({ length: k }, (_, i) => arr[Math.floor((i * arr.length) / k)]);
  return [...pick(samples, nS), ...pick(gold, nGold)].map((s, i) => {
    const f = path.join(dir, `${String(i).padStart(3, '0')}-${s.id.replace(/[^\w.-]/g, '_').slice(0, 60)}.txt`);
    fs.writeFileSync(f, s.input);
    return f;
  });
}

// ---- main ----
if (!fs.existsSync(P('samples-tune.jsonl')) || !fs.existsSync(P('samples-heldout.jsonl'))) writeSplit(P('samples.jsonl'));
const ctx = {
  parseMermaid: await makeParseMermaid(),
  patho: pathological(),
  rawTexts: rawReplies(),
  otherFiles: fs.readdirSync(path.join(HERE, '../other')).filter(f => f.endsWith('.txt')).map(f => path.join(HERE, '../other', f)),
  panelFiles: flag('--no-panel') ? null : panelInputs(panelN),
};
const B = await evalFormatter(basePath, 'baseline', ctx);
const C = await evalFormatter(candPath, 'candidate', ctx);

const rows = [];
const gate = (name, base, cand, threshold, pass) => rows.push([name, base, cand, threshold, pass === null ? 'n/a' : pass ? 'PASS' : 'FAIL']);
const ge = (set, key, slack = 0) => C.m[set][key] >= B.m[set][key] - slack;

for (const [set, label] of [['tune', 'tune'], ['held', 'held-out'], ['gold', 'gold']])
  gate(`Never-worse (${label}) %`, f1(B.m[set].neverWorse), f1(C.m[set].neverWorse), '>= baseline', ge(set, 'neverWorse'));

const lostOf = r => [...r.tune, ...r.held, ...r.gold].filter(x => x.lost?.length);
const lostB = lostOf(B), lostC = lostOf(C);
gate('Lost words (samples+gold, samples with any)', String(lostB.length), String(lostC.length), '= 0', lostC.length === 0);

for (const [key, label] of [['lineAcc', 'line type accuracy'], ['joinP', 'join precision'], ['joinR', 'join recall'], ['blockRec', 'block recovery'], ['chrome', 'terminal UI recognized']])
  gate(`Floor: ${label} (tune) %`, f1(B.m.tune[key]), f1(C.m.tune[key]), '>= baseline - 1', ge('tune', key, 1));
gate('Floor: gold block recovery %', f1(B.m.gold.blockRec), f1(C.m.gold.blockRec), '>= baseline - 1', ge('gold', 'blockRec', 1));

// Held-out (docs/engine-v2.md, 2026-10-13): candidate minus baseline never-worse on sessions never tuned on, resampled by
// session (a reply recurs up to ~12 times across selection kinds and widths, so samples are not independent).
const gap = r => r.m.held.neverWorse - r.m.tune.neverWorse;
function pairedBootstrap(bRecs, cRecs, n = 2000) {
  const clean = r => !r.error && !r.damage;
  const bySession = new Map();
  bRecs.forEach((b, i) => {
    const sid = b.id.split('-w')[0], d = Number(clean(cRecs[i])) - Number(clean(b));
    if (!bySession.has(sid)) bySession.set(sid, [0, 0]);
    const x = bySession.get(sid); x[0] += d; x[1]++;
  });
  const S = [...bySession.values()];
  const mean = xs => 100 * xs.reduce((a, x) => a + x[0], 0) / xs.reduce((a, x) => a + x[1], 0);
  let seed = 1;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const draws = Array.from({ length: n }, () => mean(S.map(() => S[Math.floor(rnd() * S.length)]))).sort((a, b) => a - b);
  return { diff: mean(S), lo: draws[Math.floor(n * 0.025)], hi: draws[Math.floor(n * 0.975)], sessions: S.length };
}
const ho = pairedBootstrap(B.held, C.held);
gate(`Held-out minus baseline, never-worse (${ho.sessions} sessions, 95% session bootstrap)`, '-', `${ho.diff >= 0 ? '+' : ''}${f1(ho.diff)} [${f1(ho.lo)}, ${f1(ho.hi)}]`, 'lower bound >= -1', ho.lo >= -1);

const advCases = r => `${(r.adv.out.match(/^(ok|FAIL)\b/gm) || []).length - r.advFails.length}/${(r.adv.out.match(/^(ok|FAIL)\b/gm) || []).length} ok`;
gate('Adversarial checks', advCases(B), advCases(C), 'all pass', C.adv.code === 0 && C.advFails.length === 0);

const rawWorse = rawmdLoss(ctx.rawTexts, B.raw, C.raw);
gate('Raw markdown: replies losing words or blocks vs baseline', '-', `${rawWorse.length}/${C.raw.n}`, '= 0', rawWorse.length === 0);

if (ctx.panelFiles) gate(`Panel errors (${ctx.panelFiles.length} inputs)`, String(B.panelErr.length), String(C.panelErr.length), '= 0', C.panelErr.length === 0);
else gate('Panel errors', 'skipped', 'skipped', '= 0', null);

gate('Latency p99, all samples (ms)', f1(B.p99), f1(C.p99), '< 50', C.p99 < 50);
const worst = r => r.patho.reduce((a, x) => (x.median > a.median ? x : a));
gate('Latency pathological, worst median (ms)', `${f1(worst(B).median)} (${worst(B).name})`, `${f1(worst(C).median)} (${worst(C).name})`, 'each < 500',
  C.patho.every(x => x.median < 500 && !x.err));

const budgetPass = typeof C.budget.count === 'number' && typeof B.budget.count === 'number' && C.budget.method.includes('policy') ? C.budget.count < B.budget.count : false;
gate('Rule budget (named weights + thresholds)', String(B.budget.count), C.budget.method.includes('policy') ? String(C.budget.count) : 'n/a (no exported policy)', '< baseline', budgetPass);

// ---- print ----
const head = ['Gate', 'Baseline', 'Candidate', 'Threshold', 'Result'];
const w = head.map((h, k) => Math.max(h.length, ...rows.map(r => r[k].length)));
const line = r => '| ' + r.map((c, k) => c.padEnd(w[k])).join(' | ') + ' |';
console.log(`\nGates (docs/engine-v2.md rev 3): baseline ${path.relative(HERE, basePath)}  vs  candidate ${path.relative(HERE, candPath)}\n`);
console.log(line(head));
console.log('|' + w.map(x => '-'.repeat(x + 2)).join('|') + '|');
rows.forEach(r => console.log(line(r)));

console.log('\nPer split (baseline / candidate): never-worse, line acc, join R, block rec, terminal UI recognized');
for (const set of ['tune', 'held', 'all', 'gold']) {
  const s = m => [m.neverWorse, m.lineAcc, m.joinR, m.blockRec, m.chrome].map(f1).join(' ');
  console.log(`  ${set.padEnd(5)} n=${String(C.m[set].samples).padEnd(5)} base ${s(B.m[set])}   cand ${s(C.m[set])}   (errors ${B.m[set].errors}/${C.m[set].errors})`);
}

if (lostC.length) {
  const freq = {};
  lostC.forEach(x => x.lost.forEach(wd => (freq[wd] = (freq[wd] || 0) + 1)));
  console.log(`\nLost words, candidate: ${lostC.length} samples (tune ${C.tune.filter(x => x.lost?.length).length}, held-out ${C.held.filter(x => x.lost?.length).length}, gold ${C.gold.filter(x => x.lost?.length).length})`);
  console.log('  top words: ' + Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k}(${v})`).join(' '));
  lostC.slice().sort((a, b) => b.lost.length - a.lost.length).slice(0, 6).forEach(x => console.log(`  ${x.id}: ${x.lost.slice(0, 8).join(' ')}${x.lost.length > 8 ? ` ... (+${x.lost.length - 8})` : ''}`));
}
if (C.advFails.length) console.log('\nAdversarial failures, candidate:\n  ' + C.advFails.join('\n  '));
console.log(`\nRaw markdown (reported): identical tokens, baseline ${B.raw.bothSame}/${B.raw.n}, candidate ${C.raw.bothSame}/${C.raw.n}; tune-gap held-out minus tune, candidate ${f1(gap(C))}`);
if (rawWorse.length) console.log('Raw markdown replies worse than baseline:\n  ' + rawWorse.slice(0, 10).map(x => `#${x.k}: ${x.why}`).join('\n  '));
if (C.panelErr?.length) console.log('\nPanel errors, candidate:\n  ' + C.panelErr.slice(0, 10).join('\n  '));
console.log('\nPathological latency, candidate (median / max of 3 runs, ms): ' + C.patho.map(x => `${x.name} ${f1(x.median)}/${f1(x.max)}${x.err ? ' THREW ' + x.err : ''}`).join('; '));
console.log('Other-sources set (research/other, unlabeled; reported, not gated), candidate lost words per file: ' +
  C.other.map(o => `${o.file} ${o.threw ? 'THREW' : o.lost + (o.len ? '' : ' (bad lines length)')}`).join(', '));
console.log(`Rule budget: baseline ${B.budget.count} [${B.budget.method}; ${B.budget.detail}]; candidate ${C.budget.count} [${C.budget.method}; ${C.budget.detail}]`);
if (B.budget.audit) {   // the baseline is v1: its per-literal list is the audit trail for the budget it sets
  fs.writeFileSync(P('rule-budget-v1.txt'), B.budget.audit);
  console.log(`  per-literal audit: ${P('rule-budget-v1.txt')}`);
}

const fails = rows.filter(r => r[4] === 'FAIL').length;
console.log(`\n${fails ? `NO-GO: ${fails} gate(s) FAIL` : 'GO: every gate passes'}`);
process.exit(fails ? 1 : 0);
