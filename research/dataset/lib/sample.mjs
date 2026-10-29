// Turn a selection (start/end line+column in a labeled render) into a sample in the spec schema.
import { key, norm } from './md.mjs';

export function renderCtx(text, W, info, replies) {
  const lines = text.split('\n');
  const offs = [];
  let o = 0;
  for (const l of lines) { offs.push(o); o += l.length + 1; }
  return { text, lines, offs, W, info, byIdx: new Map(replies.map((r) => [r.idx, r])) };
}

// substring of `text` covering non-whitespace characters [ks, ke), whitespace-normalized
export function sliceByKey(text, ks, ke) {
  let n = 0, out = '';
  for (const ch of text) {
    const ws = /\s/.test(ch);
    if (!ws) { if (n >= ks && n < ke) out += ch; n++; } else if (n > ks && n < ke) out += ch;
  }
  return norm(out);
}

const CONTENT = new Set(['heading', 'para', 'list', 'quote', 'table', 'code', 'diagram', 'rule']);

// sel = {l0, c0, l1, c1}: from (l0, c0) to (l1, c1) exclusive; c1 = line length for a whole last line
export function makeSample(ctx, sel, meta) {
  const { lines, offs, info } = ctx;
  const { l0, c0, l1, c1 } = sel;
  const input = ctx.text.slice(offs[l0] + c0, offs[l1] + c1);
  const blockIds = new Map(); // "reply:block" -> sample index
  const out = [];
  const touched = []; // per sample block: {reply, block, lines:[{li, from, to}]}
  for (let li = l0; li <= l1; li++) {
    const x = info[li];
    const from = li === l0 ? c0 : 0;
    const to = li === l1 ? c1 : lines[li].length;
    const piece = lines[li].slice(from, to);
    const blankCode = (x.type === 'code' || x.type === 'diagram') && !piece.trim();
    if (!CONTENT.has(x.type) || (!piece.trim() && !blankCode)) {
      // chrome stays chrome; anything whitespace-only (incl. a cut that leaves only indent) is blank
      out.push({ type: x.type === 'chrome' && piece.trim() ? 'chrome' : 'blank', block: null, cont: false });
      continue;
    }
    const k = `${x.reply}:${x.block}`;
    const isNew = !blockIds.has(k);
    if (isNew) { blockIds.set(k, touched.length); touched.push({ reply: x.reply, block: x.block, lines: [] }); }
    const b = blockIds.get(k);
    touched[b].lines.push({ li, from, to, x });
    out.push({ type: x.type, block: b, cont: li === l0 || isNew || blankCode ? false : !!x.cont });
  }
  const blocks = touched.map((t) => blockText(ctx, t));
  return { ...meta, input, lines: out, blocks };
}

function blockText(ctx, t) {
  const rep = ctx.byIdx.get(t.reply);
  const src = rep.blocks[t.block];
  const type = src.type;
  if (type === 'rule') return { type, text: '' };
  if (type === 'table') {
    const all = new Set(), rows = new Set();
    let tkind = null;
    for (const { x } of t.lines) { tkind = x.tkind; if (x.row !== null && x.row !== undefined) rows.add(x.row); }
    // every line of the table selected -> all rows
    const tableLines = ctx.info.map((x, i) => (x.reply === t.reply && x.block === t.block ? i : -1)).filter((i) => i >= 0);
    const full = tableLines.every((i) => t.lines.some((l) => l.li === i && l.from === 0 && l.to === ctx.lines[i].length));
    if (full) return { type, rows: src.rows };
    if (tkind === 'vertical') rows.add(0); // header names are printed on every vertical line
    return { type, rows: [...rows].sort((a, b) => a - b).map((r) => src.rows[r]).filter(Boolean) };
  }
  if (type === 'code' || type === 'diagram') {
    // verbatim from the screen (tabs already expanded), reply indent and common indent removed
    const ls = t.lines.filter(({ x }) => x.kind !== 'label');
    const raw = ls.map(({ li, from, to }) => {
      const line = ctx.lines[li];
      const body = line.startsWith('⏺ ') ? '  ' + line.slice(2) : line;
      // a start that only skipped indentation is not a cut: keep the line's indent for dedenting
      return body.slice(0, from).trim() ? { text: body.slice(from, to), cut: true } : { text: body.slice(0, to), cut: false };
    });
    const strip = (s) => (s.startsWith('  ') ? s.slice(2) : s.replace(/^\s+/, ''));
    const full = raw.map((r) => (r.cut ? null : strip(r.text)));
    const ind = Math.min(...full.filter((s) => s !== null && s.trim()).map((s) => s.match(/^ */)[0].length), 1e9);
    let res = raw.map((r, i) => (r.cut ? r.text.replace(/^\s+/, '') : full[i].slice(ind === 1e9 ? 0 : ind)).replace(/\s+$/, ''));
    while (res.length && !res[0]) res.shift();
    while (res.length && !res[res.length - 1]) res.pop();
    return { type, text: res.join('\n') };
  }
  // flow blocks: source text, cut by non-whitespace character offsets
  let ks = Infinity, ke = -Infinity;
  for (const { li, from, to, x } of t.lines) {
    const line = ctx.lines[li];
    const n0 = key(line.slice(0, from)).length, n1 = key(line.slice(0, to)).length;
    const s = x.bko + Math.max(0, n0 - x.prefixLen);
    const e = x.bko + Math.min(x.keyLen, Math.max(0, n1 - x.prefixLen));
    ks = Math.min(ks, s); ke = Math.max(ke, e);
  }
  const total = key(src.text).length;
  if (ks <= 0 && ke >= total) return { type, text: src.text };
  return { type, text: sliceByKey(src.text, ks, ke) };
}
