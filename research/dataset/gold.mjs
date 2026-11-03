// Gold set: the maintainer's real copies (corpus/<timestamp>-copy/input.txt), located in a tmux render of their
// source session and labeled exactly like samples.jsonl (kind "gold"). Writes gold.jsonl.
//
// Renders: python3 render_gold.py <sid>:<cwd>:<w1,w2,...>  (renders/gold/<sid>-w<width>.txt)
// Sources were found by searching main session transcripts (~/.claude/projects/*/*.jsonl) for
// distinctive fragments of each copy (the session that produced this dataset is excluded: it contains
// the copies as tool output). Widths: T231008-T231040 were copied at 153 (the maintainer); for the rest the
// width is inferred as the render width in which the copy occurs, preferring 153 when several do.
import fs from 'node:fs';
import { loadReplies, processRender } from './build.mjs';
import { makeSample } from './lib/sample.mjs';
import { key } from './lib/md.mjs';

// Label a copy that is the render's text with some newlines/padding changed: each copy line takes the
// label of the render line holding its first non-whitespace character.
function joinedSample(p, input, meta) {
  const text = p.ctx.text;
  const pos = []; // render offset of each non-whitespace char
  for (let i = 0; i < text.length; i++) if (!/\s/.test(text[i])) pos.push(i);
  const rk = pos.map((i) => text[i]).join('');
  const ck = key(input);
  const k0 = rk.lastIndexOf(ck);
  const start = pos[k0], end = pos[k0 + ck.length - 1] + 1;
  const lineAt = (o) => { let l = 0; while (l + 1 < p.ctx.offs.length && p.ctx.offs[l + 1] <= o) l++; return l; };
  const l0 = lineAt(start), l1 = lineAt(end - 1);
  const base = makeSample(p.ctx, { l0, c0: start - p.ctx.offs[l0], l1, c1: end - p.ctx.offs[l1] }, meta);
  let kc = 0;
  const lines = input.split('\n').map((cl, i) => {
    const n = key(cl).length;
    if (!n) return { type: 'blank', block: null, cont: false };
    const rl = lineAt(pos[k0 + kc]) - l0;
    kc += n;
    const x = base.lines[rl];
    return { type: x.type, block: x.block, cont: i === 0 ? false : x.cont };
  });
  // drop blocks no copy line points at (their lines were joined into another block's line), reindex
  const used = [...new Set(lines.map((l) => l.block).filter((b) => b !== null))].sort((a, b) => a - b);
  const remap = new Map(used.map((b, i) => [b, i]));
  lines.forEach((l) => { if (l.block !== null) l.block = remap.get(l.block); });
  const touched = [...new Set(p.info.slice(l0, l1 + 1).map((x) => x.reply).filter((r) => r !== null))];
  return { id: meta.id, session: meta.session, width: meta.width, reply: touched[0] ?? null, kind: 'gold', input, lines, blocks: used.map((b) => base.blocks[b]) };
}

const CORPUS = '../../corpus';
// Directory holding the source sessions' transcripts (~/.claude/projects/<project>/), local only
const VAULT = process.env.GOLD_SESSIONS_DIR;
const BD = 'bd2226b8-2a89-479f-a2b8-e40e13013599', TB = '6152c5f5-0c7c-4dc8-8b7e-967156d3fbb7';
const SOURCE = {
  T225439: BD, T225442: BD, T225455: TB, T225535: BD, T225547: TB, T225554: TB, T225558: TB, T225611: TB,
  T225635: BD, T225643: TB, T225645: TB, T225659: BD, T225710: BD, T225727: BD, T225733: BD, T225804: TB,
  T225847: BD, T225859: BD, T225904: BD, T230808: BD, T230914: BD, T230917: TB, T230919: TB,
};
const FIXED_153 = (ts) => ts >= 'T231008' && ts <= 'T231040';

const dirs = fs.readdirSync(CORPUS).filter((d) => /^2026-10-12T\d{6}-copy$/.test(d)).sort();
const inScope = (ts) => (ts >= 'T225439' && ts <= 'T230919') || FIXED_153(ts);

const replyCache = {}, procCache = {};
const proc = (sid, W) => {
  const k = `${sid}:${W}`;
  if (!procCache[k]) {
    replyCache[sid] ??= loadReplies(`${VAULT}/${sid}.jsonl`);
    procCache[k] = processRender(fs.readFileSync(`renders/gold/${sid}-w${W}.txt`, 'utf8'), W, replyCache[sid]);
  }
  return procCache[k];
};
const widthsFor = (sid) => fs.readdirSync('renders/gold').map((f) => f.match(new RegExp(`^${sid}-w(\\d+)\\.txt$`))).filter(Boolean).map((m) => +m[1]).sort((a, b) => a - b);

const out = [], report = [];
for (const d of dirs) {
  const ts = d.slice(10, 17);
  if (ts === 'T231004') { report.push({ ts, status: 'skipped: marker' }); continue; }
  if (!inScope(ts)) { if (ts > 'T231040') report.push({ ts, status: 'skipped: after the briefed range' }); continue; }
  const input = fs.readFileSync(`${CORPUS}/${d}/input.txt`, 'utf8');
  const sid = FIXED_153(ts) ? BD : SOURCE[ts];
  if (!sid) { report.push({ ts, status: 'skipped: no source session found' }); continue; }
  const widths = FIXED_153(ts) ? [153] : widthsFor(sid);
  const hits = widths.filter((W) => fs.readFileSync(`renders/gold/${sid}-w${W}.txt`, 'utf8').includes(input));
  if (!hits.length) {
    // Copies whose table lines arrived padded to the pane width and joined (pane resized since the reply
    // was drawn): locate by non-whitespace characters, then map each copy line back to render lines.
    const ck = key(input);
    const wsHits = widths.filter((W) => key(fs.readFileSync(`renders/gold/${sid}-w${W}.txt`, 'utf8')).includes(ck));
    if (!wsHits.length) {
      report.push({ ts, status: `skipped: not found (even ignoring whitespace) in renders of ${sid.slice(0, 8)} at widths ${widths[0]}-${widths[widths.length - 1]}` });
      continue;
    }
    const W = wsHits.includes(153) ? 153 : wsHits[0];
    const s = joinedSample(proc(sid, W), input, { id: `gold-${ts}`, session: sid, width: W, kind: 'gold' });
    out.push(s);
    report.push({ ts, status: 'ok (joined: matched ignoring whitespace)', sid: sid.slice(0, 8), W, widths: wsHits.join(','), lines: s.lines.length });
    continue;
  }
  const W = hits.includes(153) ? 153 : hits[0];
  const p = proc(sid, W);
  const text = p.ctx.text;
  const all = [];
  for (let at = text.indexOf(input); at >= 0; at = text.indexOf(input, at + 1)) all.push(at);
  const at = all[all.length - 1]; // the latest occurrence: what was on screen when the maintainer copied
  const end = at + input.length;
  const lineAt = (o) => { let l = 0; while (l + 1 < p.ctx.offs.length && p.ctx.offs[l + 1] <= o) l++; return l; };
  const l0 = lineAt(at), l1 = lineAt(end);
  const sel = { l0, c0: at - p.ctx.offs[l0], l1, c1: end - p.ctx.offs[l1] };
  const touched = [...new Set(p.info.slice(l0, l1 + 1).map((x) => x.reply).filter((r) => r !== null))];
  const s = makeSample(p.ctx, sel, { id: `gold-${ts}`, session: sid, width: W, reply: touched[0] ?? null, kind: 'gold' });
  const widthsMatching = hits.length > 8 ? `${hits[0]}-${hits[hits.length - 1]} (${hits.length})` : hits.join(',');
  const unaligned = p.info.slice(l0, l1 + 1).filter((x) => x.type === 'chrome').length;
  out.push(s);
  report.push({ ts, status: 'ok', sid: sid.slice(0, 8), W, widths: widthsMatching, lines: s.lines.length, chrome: unaligned, occurrences: all.length });
}
fs.writeFileSync('gold.jsonl', out.map((s) => JSON.stringify(s)).join('\n') + '\n');
fs.mkdirSync('aligned', { recursive: true });
fs.writeFileSync('aligned/gold-report.json', JSON.stringify(report, null, 1));
for (const r of report) console.log(JSON.stringify(r));
console.log(`gold: ${out.length}`);
