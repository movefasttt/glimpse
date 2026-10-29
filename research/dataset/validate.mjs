// Validate samples.jsonl and gold.jsonl against the spec, print counts and an eyeball table.
//   node validate.mjs [N=12] [seed]
import fs from 'node:fs';
import { rng } from './build.mjs';

const TYPES = new Set(['heading', 'para', 'list', 'quote', 'table', 'code', 'diagram', 'rule', 'blank', 'chrome']);
const KINDS = new Set(['whole', 'block', 'midline', 'partial', 'spill', 'multi', 'gold']);
const renders = {};
const renderOf = (s) => {
  for (const f of [`renders/${s.session}-w${s.width}.txt`, `renders/gold/${s.session}-w${s.width}.txt`]) {
    if (fs.existsSync(f)) return (renders[f] ??= fs.readFileSync(f, 'utf8'));
  }
  return null;
};

function check(file) {
  if (!fs.existsSync(file)) return [];
  const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const errs = [];
  const ids = new Set();
  for (const s of rows) {
    const e = (m) => errs.push(`${s.id}: ${m}`);
    if (ids.has(s.id)) e('duplicate id'); ids.add(s.id);
    if (!KINDS.has(s.kind)) e(`kind ${s.kind}`);
    const n = s.input.split('\n').length;
    if (s.lines.length !== n) e(`lines ${s.lines.length} != ${n}`);
    s.lines.forEach((l, i) => {
      if (!TYPES.has(l.type)) e(`type ${l.type}`);
      if ((l.type === 'blank' || l.type === 'chrome') !== (l.block === null)) e(`line ${i} block/type mismatch`);
      if (l.block !== null && !(l.block >= 0 && l.block < s.blocks.length)) e(`line ${i} block ${l.block} out of range`);
      if (l.block !== null && s.blocks[l.block].type !== l.type) e(`line ${i} type ${l.type} != block type ${s.blocks[l.block].type}`);
      if (l.cont && (i === 0 || s.lines[i - 1].block === null && s.lines[i - 1].type !== 'blank')) e(`line ${i} cont after non-block`);
      if (l.cont && l.block !== null && s.lines.findIndex((x) => x.block === l.block) === i) e(`line ${i} first line of block has cont`);
    });
    s.blocks.forEach((b, i) => {
      if (!s.lines.some((l) => l.block === i)) e(`block ${i} unused`);
      if (b.type === 'table' ? !Array.isArray(b.rows) : typeof b.text !== 'string') e(`block ${i} shape`);
    });
    const r = renderOf(s);
    if (s.kind !== 'gold' && (!r || !r.includes(s.input))) e('input not a substring of its render');
    if (s.kind === 'gold' && (!r || !r.replace(/\s+/g, '').includes(s.input.replace(/\s+/g, '')))) e('gold copy not found in its render');
  }
  return { rows, errs };
}

const N = +(process.argv[2] || 12);
for (const file of ['samples.jsonl', 'gold.jsonl']) {
  const { rows, errs } = check(file);
  if (!rows) continue;
  console.log(`\n== ${file}: ${rows.length} samples, ${errs.length} errors`);
  errs.slice(0, 20).forEach((x) => console.log('  ' + x));
  const by = (f) => rows.reduce((m, s) => { for (const k of [].concat(f(s))) m[k] = (m[k] || 0) + 1; return m; }, {});
  console.log('per kind', by((s) => s.kind));
  console.log('per width', by((s) => s.width));
  console.log('samples containing type', by((s) => [...new Set(s.lines.map((l) => l.type))]));
  console.log('lines per type', by((s) => s.lines.map((l) => l.type)));
  console.log('cont=true lines', rows.reduce((n, s) => n + s.lines.filter((l) => l.cont).length, 0));
}

if (N > 0) {
  const rows = fs.readFileSync('samples.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const R = rng(process.argv[3] || 'eyeball');
  for (let k = 0; k < N; k++) {
    const s = R.pick(rows);
    console.log(`\n--- ${s.id}`);
    s.input.split('\n').forEach((l, i) => {
      const x = s.lines[i];
      if (i >= 40) return;
      console.log(`${l.slice(0, 90).padEnd(90)} | ${x.type.padEnd(7)} | ${String(x.block).padEnd(4)} | ${x.cont ? 'C' : ''}`);
    });
    if (s.input.split('\n').length > 40) console.log(`... (${s.input.split('\n').length} lines)`);
    console.log('blocks:', JSON.stringify(s.blocks).slice(0, 600));
  }
}
