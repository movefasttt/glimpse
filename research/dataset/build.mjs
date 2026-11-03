// Build the labeled Glimpse dataset (spec: docs/dataset.md).
//
//   cd research/dataset && npm run dataset      (= node build.mjs && node gold.mjs && node validate.mjs 12)
//
// Prerequisite renders (cached, only needed once):
//   python3 render.py                            -> renders/<sid>-w{100,150}.txt
//   python3 render_gold.py 6152c5f5-0c7c-4dc8-8b7e-967156d3fbb7:<cwd>:95,...,160 \
//                          bd2226b8-2a89-479f-a2b8-e40e13013599:<cwd>:95,...,160
//                                                -> renders/gold/<sid>-w<width>.txt (gold.mjs picks the width)
//
// Inputs: sessions.json, the renders, the session transcripts (read-only).
// Outputs: samples.jsonl, aligned/coverage.json (alignment coverage + labeling stats).
// Pipeline: lib/md.mjs (markdown -> blocks + per-source-line segments, as the terminal shows them) ->
// lib/align.mjs (match each reply to its screen lines) -> lib/label.mjs (per-line labels) ->
// selection below -> lib/sample.mjs (spec schema).
// Deterministic: every random choice comes from a RNG seeded by the sample's identity.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { readReplies } from './lib/transcript.mjs';
import { parseReply } from './lib/md.mjs';
import { prepare, alignAll } from './lib/align.mjs';
import { labelRender } from './lib/label.mjs';
import { renderCtx, makeSample } from './lib/sample.mjs';

const WIDTHS = [100, 150];
const TARGET_REPLIES = 300;
const MIN_PER_FEATURE = 35;

export function rng(seed) {
  let a = crypto.createHash('md5').update(String(seed)).digest().readUInt32LE(0);
  const next = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), pick: (arr) => arr[Math.floor(next() * arr.length)] };
}

export function loadReplies(file) {
  return readReplies(file).map((r) => { const p = parseReply(r.text); return { ...r, ...p, units: prepare(p) }; });
}

// Align + label one render; returns everything selection needs.
export function processRender(text, W, replies) {
  const screen = text.split('\n');
  screen.W = W;
  const { chosen } = alignAll(screen, replies);
  const lab = labelRender(screen, W, replies, chosen);
  const ctx = renderCtx(text, W, lab.info, replies);
  return { chosen, ...lab, ctx };
}

function features(rep) {
  const types = new Set(rep.blocks.map((b) => b.type));
  return {
    table: types.has('table'), code: types.has('code'), diagram: types.has('diagram'), nested: !!rep.nested,
    korean: /[가-힣]/.test(rep.text), quote: types.has('quote'), heading: types.has('heading'),
    long: rep.blocks.some((b) => b.type === 'para' && b.text.length >= 350),
  };
}

// code-point boundaries of a string, in UTF-16 indices
const bounds = (s) => { const b = [0]; let i = 0; for (const ch of s) { i += ch.length; b.push(i); } return b; };
const indentEnd = (l) => { const m = l.match(/^(⏺ )?\s*/); return m[0].length; };

function main() {
  const sessions = JSON.parse(fs.readFileSync('sessions.json'));
  const renders = {}; // sid -> width -> processed
  const replyCache = {};
  const coverage = { perWidth: {}, perRender: [], stats: {} };
  for (const s of sessions) {
    const replies = loadReplies(s.file);
    replyCache[s.sid] = replies;
    renders[s.sid] = {};
    for (const W of WIDTHS) {
      const f = `renders/${s.sid}-w${W}.txt`;
      if (!fs.existsSync(f)) continue;
      const p = processRender(fs.readFileSync(f, 'utf8'), W, replies);
      renders[s.sid][W] = p;
      const r0 = p.chosen[0]?.r ?? Infinity;
      const attempted = replies.filter((r) => r.idx >= r0).length;
      const cw = (coverage.perWidth[W] ||= { aligned: 0, attempted: 0, transcriptReplies: 0 });
      cw.aligned += p.chosen.length; cw.attempted += attempted; cw.transcriptReplies += replies.length;
      coverage.perRender.push({ sid: s.sid, W, aligned: p.chosen.length, attempted, transcript: replies.length });
      for (const [k, v] of Object.entries(p.stats)) coverage.stats[k] = (coverage.stats[k] || 0) + v;
    }
  }

  // ---- choose replies: unique text, stratified ----
  const pool = new Map(); // hash -> {sid, idx, widths, feat}
  for (const s of sessions) {
    for (const r of replyCache[s.sid]) {
      const widths = WIDTHS.filter((W) => renders[s.sid][W]?.chosen.some((c) => c.r === r.idx));
      if (!widths.length) continue;
      const h = crypto.createHash('md5').update(r.text).digest('hex');
      const prev = pool.get(h);
      if (!prev || widths.length > prev.widths.length) pool.set(h, { sid: s.sid, idx: r.idx, widths, feat: features(r), len: r.text.length });
    }
  }
  const all = [...pool.values()].sort((a, b) => (a.sid + a.idx).localeCompare(b.sid + b.idx));
  const R = rng('choose');
  const chosenSet = new Set();
  const take = (x) => chosenSet.add(`${x.sid}:${x.idx}`);
  all.filter((x) => x.feat.diagram || x.feat.korean).forEach(take);
  for (const f of ['table', 'code', 'nested', 'long', 'quote']) {
    const cand = all.filter((x) => x.feat[f]);
    let have = cand.filter((x) => chosenSet.has(`${x.sid}:${x.idx}`)).length;
    const rest = cand.filter((x) => !chosenSet.has(`${x.sid}:${x.idx}`));
    while (have < MIN_PER_FEATURE && rest.length) { take(rest.splice(Math.floor(R.next() * rest.length), 1)[0]); have++; }
  }
  const rest = all.filter((x) => !chosenSet.has(`${x.sid}:${x.idx}`));
  while (chosenSet.size < TARGET_REPLIES && rest.length) take(rest.splice(Math.floor(R.next() * rest.length), 1)[0]);
  const picked = all.filter((x) => chosenSet.has(`${x.sid}:${x.idx}`));

  // ---- generate selections ----
  const samples = [];
  const skipped = {};
  for (const x of picked) {
    for (const W of x.widths) {
      const p = renders[x.sid][W];
      for (const kind of kindsFor(x, p)) {
        let s = null;
        // structurally impossible kinds (no adjacent aligned reply, no partial-able block) fall back
        const chain = { multi: ['multi', 'spill', 'block'], spill: ['spill', 'multi', 'block'], partial: ['partial', 'block'] }[kind] || [kind];
        for (const k of chain) for (let attempt = 0; attempt < 6 && !s; attempt++) s = select(k, x, W, p, replyCache[x.sid], attempt);
        if (s) samples.push(s); else skipped[kind] = (skipped[kind] || 0) + 1;
      }
    }
  }
  fs.mkdirSync('aligned', { recursive: true });
  fs.writeFileSync('samples.jsonl', samples.map((s) => JSON.stringify(s)).join('\n') + '\n');
  coverage.replies = { pool: all.length, picked: picked.length, features: Object.fromEntries(['table', 'code', 'diagram', 'nested', 'long', 'korean', 'quote', 'heading'].map((f) => [f, picked.filter((x) => x.feat[f]).length])) };
  coverage.skipped = skipped;
  fs.writeFileSync('aligned/coverage.json', JSON.stringify(coverage, null, 1));
  console.log(JSON.stringify({ perWidth: coverage.perWidth, stats: coverage.stats, replies: coverage.replies, skipped, samples: samples.length }, null, 1));
}

function kindsFor(x, p) {
  const R = rng(`kinds:${x.sid}:${x.idx}`);
  const ks = ['whole', 'block', 'midline'];
  ks.push(R.next() < 0.5 ? 'spill' : 'multi');
  if (x.feat.code || x.feat.table || x.feat.diagram) ks.push('partial');
  else ks.push(R.pick(['block', 'midline', 'spill', 'multi']));
  return ks;
}

function regionOf(p, r) { return p.regions.find((g) => g.r === r); }
function blockLines(p, r) {
  const m = new Map();
  const g = regionOf(p, r);
  for (let li = g.i0; li < g.end; li++) {
    const x = p.info[li];
    if (x.reply !== r || x.block === null) continue;
    if (!m.has(x.block)) m.set(x.block, []);
    m.get(x.block).push(li);
  }
  return [...m.entries()].map(([b, lines]) => ({ b, lines, type: p.info[lines[0]].type, tkind: p.info[lines[0]].tkind }));
}

const counters = {};
function meta(x, W, kind) {
  const base = `${x.sid.slice(0, 8)}-w${W}-r${x.idx}-${kind}`;
  counters[base] = (counters[base] || 0) + 1;
  return { id: `${base}-${counters[base]}`, session: x.sid, width: W, reply: x.idx, kind };
}

function select(kind, x, W, p, replies, attempt) {
  const R = rng(`${kind}:${x.sid}:${x.idx}:${W}:${counters[`${x.sid.slice(0, 8)}-w${W}-r${x.idx}-${kind}`] || 0}:${attempt}`);
  const L = p.ctx.lines;
  const g = regionOf(p, x.idx);
  const whole = (l0, l1, c0 = 0) => ({ l0, c0, l1, c1: L[l1].length });
  const bl = blockLines(p, x.idx);
  let sel;
  if (kind === 'whole') sel = whole(g.i0, g.end - 1);
  else if (kind === 'block') {
    const nonPara = bl.filter((b) => b.type !== 'para' && b.type !== 'rule');
    const b = nonPara.length && R.next() < 0.5 ? R.pick(nonPara) : R.pick(bl.filter((b) => b.type !== 'rule').length ? bl.filter((b) => b.type !== 'rule') : bl);
    const l0 = b.lines[0], l1 = b.lines[b.lines.length - 1];
    sel = whole(l0, l1, R.next() < 0.3 ? indentEnd(L[l0]) : 0);
  } else if (kind === 'midline') {
    const cuttable = (b) => ['para', 'list', 'heading', 'quote', 'code'].includes(b.type);
    const starts = bl.map((b, i) => i).filter((i) => cuttable(bl[i]));
    if (!starts.length) return null;
    const i = R.pick(starts);
    let j = Math.min(bl.length - 1, i + R.int(0, 3));
    while (j > i && !cuttable(bl[j])) j--;
    const sl = R.pick(bl[i].lines.filter((li) => L[li].trim()));
    const el = R.pick(bl[j].lines.filter((li) => li >= sl && L[li].trim()));
    if (sl === undefined || el === undefined) return null;
    const sb = bounds(L[sl]).filter((c) => c >= indentEnd(L[sl]) && c < L[sl].length);
    let c0 = R.next() < 0.15 ? 0 : R.pick(sb);
    let eb = bounds(L[el]).filter((c) => c > (el === sl ? c0 : indentEnd(L[el])));
    if (!eb.length) return null;
    let c1 = R.next() < 0.15 ? L[el].length : R.pick(eb);
    if (c0 <= indentEnd(L[sl]) && c1 === L[el].length) c1 = R.pick(eb); // at least one real mid-line cut
    sel = { l0: sl, c0, l1: el, c1 };
    const picked = p.ctx.text.slice(p.ctx.offs[sl] + c0, p.ctx.offs[el] + c1);
    if (picked.trim().length < 20) { // too small to be a realistic copy: extend to the end of the line
      sel.c1 = L[el].length;
      if (p.ctx.text.slice(p.ctx.offs[sl] + c0, p.ctx.offs[el] + sel.c1).trim().length < 12) return null;
    }
  } else if (kind === 'partial') {
    const elig = bl.filter((b) => ['code', 'table', 'diagram'].includes(b.type) && b.lines.length >= 2 && !(b.type === 'table' && b.lines.length < 4));
    if (!elig.length) return null;
    const b = R.pick(elig);
    let a, z;
    if (b.type === 'table') {
      // row-aligned: units are rows (border line above + content lines)
      const units = [];
      let cur = [];
      for (const li of b.lines) {
        const row = p.info[li].row;
        cur.push(li);
        if (row !== null && row !== undefined) {
          const nxt = p.info[li + 1];
          const sameRow = nxt && nxt.block === p.info[li].block && nxt.reply === x.idx && nxt.row === row;
          if (!sameRow) { units.push(cur); cur = []; }
        }
      }
      if (cur.length && units.length) units[units.length - 1].push(...cur);
      if (units.length < 2) return null;
      let u0 = R.int(0, units.length - 1), u1 = R.int(u0, units.length - 1);
      if (u0 === 0 && u1 === units.length - 1) { if (R.next() < 0.5) u0 = 1; else u1 = units.length - 2; }
      if (u1 < u0) return null;
      a = units[u0][0]; z = units[u1][units[u1].length - 1];
      if (b.tkind === 'vertical') { // skip the leading separator of a vertical row group
        while (a < z && /^\s*─+\s*$/.test(L[a])) a++;
      }
      if (b.tkind === 'box' && R.next() < 0.5 && z + 1 <= b.lines[b.lines.length - 1]) z++; // include the border below
    } else {
      const n = b.lines.length;
      do { a = R.int(0, n - 1); z = R.int(a, n - 1); } while (a === 0 && z === n - 1);
      while (a < z && !L[b.lines[a]].trim()) a++;
      while (z > a && !L[b.lines[z]].trim()) z--;
      a = b.lines[a]; z = b.lines[z];
    }
    sel = whole(a, z);
  } else if (kind === 'spill') {
    const order = p.regions.map((r) => r.r);
    const k = order.indexOf(x.idx);
    const prev = p.regions[k - 1], next = p.regions[k + 1];
    const later = replies.filter((r) => r.idx > x.idx).length;
    const canBefore = prev && prev.r === x.idx - 1;
    const canAfter = (next && next.r === x.idx + 1) || (!next && later === 0);
    if (!canBefore && !canAfter) return null;
    const mode = canBefore && canAfter ? R.pick(['before', 'after', 'both']) : canBefore ? 'before' : 'after';
    let l0 = g.i0, l1 = g.end - 1, c0 = 0;
    if (mode !== 'after') {
      const gapStart = prev.end;
      l0 = Math.max(gapStart, g.i0 - R.int(1, 6));
      while (l0 > gapStart && !L.slice(l0, g.i0).some((l) => l.trim())) l0--;
      if (!L.slice(l0, g.i0).some((l) => l.trim())) return null;
      if (R.next() < 0.3 && L[l0].trim()) c0 = R.pick(bounds(L[l0]).filter((c) => c < L[l0].length));
    }
    if (mode !== 'before') {
      const gapEnd = next ? next.i0 : L.length;
      l1 = Math.min(gapEnd - 1, g.end - 1 + R.int(1, 6));
      while (l1 < gapEnd - 1 && !L.slice(g.end, l1 + 1).some((l) => l.trim())) l1++;
      if (!L.slice(g.end, l1 + 1).some((l) => l.trim())) return null;
    }
    sel = { l0, c0, l1, c1: L[l1].length };
  } else if (kind === 'multi') {
    const order = p.regions.map((r) => r.r);
    const k = order.indexOf(x.idx);
    const n = R.next() < 0.6 ? 2 : 3;
    let last = k;
    for (let t = 1; t < n; t++) if (p.regions[k + t] && p.regions[k + t].r === x.idx + t) last = k + t; else break;
    if (last === k) return null;
    while (last > k && p.regions[last].end - g.i0 > 250) last--;
    if (last === k) return null;
    sel = whole(g.i0, p.regions[last].end - 1);
  }
  // a cut that keeps only a list marker leaves a block with no text: not a useful sample, redraw
  const peek = makeSample(p.ctx, sel, {});
  if (peek.blocks.some((b) => (b.type === 'table' ? !b.rows.length : b.type !== 'rule' && !b.text))) return null;
  return makeSample(p.ctx, sel, meta(x, W, kind));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
