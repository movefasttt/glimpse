// Align parsed replies (lib/md.mjs) to a tmux -J screen capture.
// A reply is matched as a stream of non-whitespace characters against consecutive screen lines, starting
// at a `⏺ ` line. Box tables are matched as a unit (character multiset, since wrapped cells interleave);
// tables too wide for the terminal are drawn as "Header: value" lines and matched as a stream.
import { key } from './md.mjs';

const BOX = /[┌┐└┘├┤┬┴┼─│]/g;
export const LIST_MARK = /^(?:[-*+•◦▪▸‣·]|\d{1,3}[.)]|[a-z][.)]|[ivx]{1,5}[.)])\s+/;
export const QUOTE_MARK = /^▎\s?/;

export const isBlank = (l) => !l.trim();
const content = (l) => l.replace(/^⏺ ?/, '').replace(/^\s+/, '');

// terminal display width (wide = 2 columns)
export function dwidth(s) {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c === 0x200d || (c >= 0xfe00 && c <= 0xfe0f) || (c >= 0x300 && c <= 0x36f)) continue;
    w += (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x1f300 && c <= 0x1f64f) || (c >= 0x1f900 && c <= 0x1f9ff) ||
      (c >= 0x20000 && c <= 0x3fffd) || c === 0x2705 || c === 0x274c ? 2 : 1;
  }
  return w;
}

function streamUnit(segs) {
  const u = { kind: 'stream', segs: [], stream: '' };
  for (const s of segs) {
    s.k = s.kind === 'tsep' ? '' : key(s.text);
    s.start = u.stream.length; u.stream += s.k; s.end = u.stream.length;
    u.segs.push(s);
  }
  return u;
}

export function prepare(parsed) {
  const units = [];
  let run = [];
  parsed.segs.forEach((s, si) => { s.si = si; });
  for (const s of parsed.segs) {
    if (s.kind === 'table') {
      if (run.length) units.push(streamUnit(run)); run = [];
      s.vertical.forEach((v, i) => { v.si = `${s.si}.${i}`; v.parent = s.si; });
      units.push({ kind: 'table', seg: s, alt: streamUnit(s.vertical) });
    } else run.push(s);
  }
  if (run.length) units.push(streamUnit(run));
  return units;
}

const sortedChars = (s) => [...s].sort().join('');

// Match one stream unit from line j. Pushes {li, seg, off} into out (blank lines inside are pushed with seg=null).
function matchStream(lines, j, unit, out, i0) {
  const { segs, stream } = unit;
  let pos = 0, si = 0;
  const W = lines.W;
  while (si < segs.length) {
    const s = segs[si];
    if (s.k.length === 0 && s.kind !== 'tsep' && s.kind !== 'rule') {
      // empty code line: belongs to the code block only if we're already inside it
      const prev = out[out.length - 1];
      if (j < lines.length && isBlank(lines[j]) && prev && prev.seg && prev.seg.block === s.block) {
        out.push({ li: j, seg: s, off: 0 }); j++;
      }
      si++; continue;
    }
    if (s.k.length > 0 && pos >= s.end) { si++; continue; }
    if (j >= lines.length) return { j, fail: 'eof' };
    const line = lines[j];
    const inside = pos > s.start && pos < s.end;
    if (isBlank(line) || (/^\s*▎\s*$/.test(line) && s.type === 'quote' && !inside)) {
      if (j === i0) return { j, fail: 'blank first' };
      // a line exactly as wide as the terminal is followed by an empty row in the tmux capture
      const artifact = j > 0 && dwidth(lines[j - 1]) >= W;
      if (inside && !artifact) return { j, fail: `blank inside segment @${j}` };
      out.push({ li: j, seg: null, artifact }); j++; continue;
    }
    let c = content(line);
    if ((s.kind === 'rule' || s.kind === 'tsep') && pos === s.start) {
      const ok = s.kind === 'rule' ? /^[-─━*_]{3,}$/.test(key(c)) : /^─{3,}$/.test(key(c));
      if (!ok) return { j, fail: `rule @${j}: ${JSON.stringify(c.slice(0, 40))}` };
      out.push({ li: j, seg: s, off: 0 }); j++; si++; pos = s.end; continue;
    }
    if (s.kind === 'code' || s.kind === 'label') c = line.replace(/^⏺ ?/, '');
    const texts = [c];
    if (s.type === 'quote') { const m = c.match(QUOTE_MARK); if (m) texts.unshift(c.slice(m[0].length)); }
    if (pos === s.start && s.li) for (const t of [...texts]) { const m = t.match(LIST_MARK); if (m) texts.unshift(t.slice(m[0].length)); }
    const k = texts.map(key).find((x) => x.length && stream.startsWith(x, pos));
    if (k === undefined) return { j, fail: `mismatch @${j}: ${JSON.stringify(c.slice(0, 60))} vs ${JSON.stringify(stream.slice(pos, pos + 60))}` };
    out.push({ li: j, seg: s, off: pos - s.start, keyLen: k.length, spans: s.k.length > 0 && pos + k.length > s.end });
    pos += k.length; j++;
  }
  return { j };
}

// Try to align a reply starting at screen line i0. Returns {lines:[...], end} or {fail, prog}.
export function alignAt(lines, i0, units) {
  const out = [];
  let j = i0;
  for (const unit of units) {
    if (unit.kind === 'table') {
      if (j !== i0) while (j < lines.length && isBlank(lines[j])) { out.push({ li: j, seg: null }); j++; }
      if (j < lines.length && /^┌/.test(content(lines[j]))) {
        let chars = '', done = false;
        while (j < lines.length && !done) {
          const c = content(lines[j]);
          if (!/^[┌├│└]/.test(c)) return { prog: out.length, fail: `table body @${j}` };
          chars += key(c.replace(BOX, ''));
          out.push({ li: j, seg: unit.seg, off: 0 });
          if (/└[─┴]*┘\s*$/.test(c)) done = true;
          j++;
        }
        if (!done) return { prog: out.length, fail: 'table unterminated' };
        if (sortedChars(chars) !== sortedChars(key(unit.seg.text))) return { prog: out.length, fail: `table chars @${j}` };
      } else if (j < lines.length && /^\|/.test(content(lines[j]))) {
        // table nested in a list item: drawn as an aligned pipe table
        let chars = '';
        while (j < lines.length && /^\|/.test(content(lines[j]))) {
          const c = content(lines[j]);
          if (!/^\|[-:| ]+\|$/.test(c.trim())) chars += key(c.replace(/\|/g, ''));
          out.push({ li: j, seg: unit.seg, off: 0 }); j++;
        }
        if (sortedChars(chars) !== sortedChars(key(unit.seg.text.replace(/\|/g, '')))) return { prog: out.length, fail: `pipe table chars @${j}` };
      } else {
        const r = matchStream(lines, j, unit.alt, out, i0);
        if (r.fail) return { prog: out.length, fail: 'vtable ' + r.fail };
        j = r.j;
      }
      continue;
    }
    const r = matchStream(lines, j, unit, out, i0);
    if (r.fail) return { prog: out.length, fail: r.fail };
    j = r.j;
  }
  while (out.length && out[out.length - 1].seg === null) out.pop();
  if (!out.length) return { prog: 0, fail: 'empty' };
  return { lines: out, end: out[out.length - 1].li + 1 };
}

// Align every reply; pick a consistent increasing set (weighted LIS over candidate placements).
export function alignAll(lines, replies) {
  const starts = [];
  lines.forEach((l, i) => { if (l.startsWith('⏺')) starts.push(i); });
  const cands = [];
  const fails = {};
  for (const r of replies) {
    if (!r.units.length) continue;
    let any = false;
    for (const i of starts) {
      const a = alignAt(lines, i, r.units);
      if (a.lines) { cands.push({ r: r.idx, i0: i, end: a.end, lines: a.lines }); any = true; }
      else if (a.prog > 0 && (!fails[r.idx] || a.prog > fails[r.idx].prog)) fails[r.idx] = { prog: a.prog, fail: a.fail, i0: i };
    }
    if (any) delete fails[r.idx];
  }
  cands.sort((a, b) => a.i0 - b.i0 || a.r - b.r);
  const best = cands.map((c) => ({ w: c.lines.length, prev: -1 }));
  for (let x = 0; x < cands.length; x++) {
    for (let y = 0; y < x; y++) {
      if (cands[y].r < cands[x].r && cands[y].end <= cands[x].i0 && best[y].w + cands[x].lines.length > best[x].w) {
        best[x] = { w: best[y].w + cands[x].lines.length, prev: y };
      }
    }
  }
  let bi = -1;
  best.forEach((b, x) => { if (bi < 0 || b.w > best[bi].w) bi = x; });
  const chosen = [];
  for (let x = bi; x >= 0; x = best[x].prev) chosen.unshift(cands[x]);
  return { chosen, fails };
}
