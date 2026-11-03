// Baseline formatter: today's Glimpse pipeline wrapped in the formatter contract (docs/dataset.md).
//   1. Tidy.run           - JS port of main.swift `Tidy` (marker swap, common dedent, trailing trim, box tables)
//   2. fenceDiagrams      - verbatim port of template.html (whole copy, then each blank-line block)
//   3. marked.lexer       - gfm: true, breaks: false (marked 15.0.12, same as vendor/marked.min.js)
// Every stage keeps an explicit input-line mapping so the result is labeled per input line.
import { marked } from 'marked';

// ---- 1. Tidy (main.swift) -------------------------------------------------------------------------------

// Swift CharacterSet.whitespaces = tab + Unicode Zs. Lines never hold newlines here.
const swiftTrim = s => s.replace(/^[\t\p{Zs}]+|[\t\p{Zs}]+$/gu, '');

function tidyLine(line) {
  let l = line.replace(/[ \t]+$/, '');
  // "⏺ " on replies, "⎿ " on tool output: swap the marker for a space so dedent still lines up.
  for (const marker of ['⏺', '⎿']) {
    const lead = l.match(/^ */)[0].length;
    if (l.startsWith(marker, lead)) l = l.slice(0, lead) + ' ' + l.slice(lead + marker.length);
  }
  return l;
}

// lines: [{ text, i }] (i = input line index). Returns [{ text, from: [input indices] }].
function rebuildBoxTables(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const t = swiftTrim(lines[i].text);
    if (!(t.startsWith('┌') || t.startsWith('│'))) { out.push({ text: lines[i].text, from: [lines[i].i] }); i++; continue; }
    const groups = [[]];             // groups of rows; a row = { cells, i }
    const consumed = [];             // { i, group, row? } every input line the table swallowed
    let separators = 0;
    while (i < lines.length) {
      const s = swiftTrim(lines[i].text);
      if (s.startsWith('│')) {
        const cells = s.split('│').slice(1, -1).map(swiftTrim);
        groups[groups.length - 1].push({ cells, i: lines[i].i });
        consumed.push({ i: lines[i].i, group: groups.length - 1, row: groups[groups.length - 1].length - 1 });
      } else if (s.startsWith('├')) {
        consumed.push({ i: lines[i].i, group: groups.length - 1 });   // separator closes the group above it
        separators += 1;
        groups.push([]);
      } else if (s.startsWith('┌') || s.startsWith('└')) {
        consumed.push({ i: lines[i].i, group: groups.length - 1 });   // borders: skipped by Tidy
      } else break;
      i += 1;
    }
    // filter empty groups, remembering where each original group went
    const keep = [];
    const gmap = groups.map(g => (g.length ? (keep.push(g), keep.length - 1) : -1));
    // Separator between every row => wrapped cells span lines; merge them. Otherwise one line = one row.
    const merge = separators >= keep.length - 1 && keep.length > 1;
    const rows = merge
      ? keep.map(g => {
          const n = Math.max(0, ...g.map(r => r.cells.length));
          return Array.from({ length: n }, (_, c) =>
            g.map(r => (c < r.cells.length ? r.cells[c] : null)).filter(x => x !== null && x !== '').join(' '));
        })
      : keep.flat().map(r => r.cells);
    if (rows.length === 0) continue;   // borders only: Tidy emits nothing, the lines are dropped
    // input line -> output row index
    const flatStart = []; { let k = 0; keep.forEach((g, gi) => { flatStart[gi] = k; k += g.length; }); }
    const rowOf = c => {
      let g = c.group;
      if (gmap[g] === -1) {   // empty group (border/separator only): attach to the nearest non-empty group above, else below
        let up = g; while (up >= 0 && gmap[up] === -1) up--;
        let dn = g; while (dn < groups.length && gmap[dn] === -1) dn++;
        g = up >= 0 ? up : dn;
        if (merge) return gmap[g];
        return up >= 0 ? flatStart[gmap[g]] + keep[gmap[g]].length - 1 : flatStart[gmap[g]];
      }
      if (merge) return gmap[g];
      if (c.row !== undefined) return flatStart[gmap[g]] + c.row;
      return flatStart[gmap[g]] + keep[gmap[g]].length - 1;   // border/separator after rows in this group
    };
    const from = rows.map(() => []);
    for (const c of consumed) from[rowOf(c)].push(c.i);
    const esc = c => c.replace(/\|/g, '\\|');
    const header = rows[0];
    out.push({ text: '| ' + header.map(esc).join(' | ') + ' |', from: from[0], table: true });
    out.push({ text: '|' + header.map(() => ' --- |').join(''), from: [], table: true });
    rows.slice(1).forEach((r, k) => out.push({ text: '| ' + r.map(esc).join(' | ') + ' |', from: from[k + 1], table: true }));
    out.push({ text: '', from: [] });
  }
  return out;
}

export function tidy(raw) {
  let lines = raw.replace(/\r\n/g, '\n').split('\n').map((text, i) => ({ text: tidyLine(text), i }));
  const indents = lines.filter(l => l.text !== '').map(l => l.text.match(/^ */)[0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  if (cut > 0) lines = lines.map(l => (l.text === '' ? l : { text: l.text.slice(cut), i: l.i }));
  const out = rebuildBoxTables(lines);
  // .trimmingCharacters(in: .newlines) on the joined string == drop leading/trailing empty lines
  let a = 0, b = out.length;
  while (a < b && out[a].text === '') a++;
  while (b > a && out[b - 1].text === '') b--;
  return out.slice(a, b);
}

// ---- 2. fenceDiagrams (template.html, verbatim apart from the injected parser) ----------------------------

// main.swift Viewer.mermaidHint: the mermaid bundle is only loaded when a line starts with one of these.
const MERMAID_HINT = /^\s*(mermaid|graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|sankey|xychart|block|packet|kanban|architecture|requirement|C4|radar|treemap)/m;
const MERMAID_HEAD = /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|sankey|xychart|block|packet|kanban|architecture|requirement|requirementDiagram|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|radar|treemap)\b/;

async function fenceDiagrams(src, parse) {
  const hasMermaid = Boolean(parse) && MERMAID_HINT.test(src);
  async function asDiagram(text) {
    if (!hasMermaid) return null;
    const body = text.replace(/^\s*mermaid[ \t]*\n/, '').replace(/^\n+|\s+$/g, '');
    if (!MERMAID_HEAD.test(body)) return null;
    return (await parse(body)) ? body : null;
  }
  const fence = d => '```mermaid\n' + d + '\n```';
  const whole = await asDiagram(src);
  if (whole) return fence(whole);
  const parts = src.split(/(^```[\s\S]*?^```[ \t]*$)/m);
  for (let i = 0; i < parts.length; i += 2) {
    const blocks = parts[i].split(/\n[ \t]*\n/);
    for (let j = 0; j < blocks.length; j++) {
      const d = await asDiagram(blocks[j]);
      if (d) blocks[j] = fence(d);
    }
    parts[i] = blocks.join('\n\n');
  }
  return parts.join('');
}

// Line-level LCS: a[i] -> index in b, or -1 if a[i] was removed.
function lineMap(a, b) {
  if (a.length === b.length && a.every((x, i) => x === b[i])) return a.map((_, i) => i);
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const map = new Array(n).fill(-1);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { map[i] = j; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return map;
}

// ---- 3. marked: per markdown line { type, cont } ----------------------------------------------------------

const LIST_MARKER = /^\s*([-+*]|\d{1,9}[.)])(\s|$)/;
const blankLine = s => /^[ \t]*$/.test(s);

export function labelMarkdownLines(md) {
  const mdLines = md.split('\n');
  const tokens = marked.lexer(md, { gfm: true, breaks: false });
  if (tokens.map(t => t.raw).join('') !== md) throw new Error('marked raw does not cover the source');
  // token ranges by character offset; each line belongs to the token containing its first character
  const starts = []; { let o = 0; for (const t of tokens) { starts.push(o); o += t.raw.length; } }
  const labels = [];
  let ti = 0, off = 0, curTok = -1, first = true, prevBlank = false;
  for (let L = 0; L < mdLines.length; L++) {
    while (ti + 1 < tokens.length && starts[ti + 1] <= off) ti++;
    const t = tokens[ti];
    const text = mdLines[L];
    off += text.length + 1;
    if (!t || blankLine(text)) { labels.push({ type: 'blank', cont: false }); prevBlank = true; continue; }
    if (ti !== curTok) { curTok = ti; first = true; prevBlank = false; }
    let lab;
    switch (t.type) {
      case 'paragraph': case 'text': case 'html': case 'def': lab = { type: 'para', cont: !first }; break;
      case 'heading': lab = { type: 'heading', cont: !first }; break;
      case 'blockquote': lab = { type: 'quote', cont: !first && !prevBlank }; break;
      // under breaks:false a list line without an item marker is a lazy/indented continuation of its item
      case 'list': lab = { type: 'list', cont: !first && !prevBlank && !LIST_MARKER.test(text) }; break;
      case 'code': lab = { type: (t.lang || '').trim().split(/\s+/)[0].toLowerCase() === 'mermaid' ? 'diagram' : 'code', cont: false }; break;
      case 'table': lab = { type: 'table', cont: false }; break;
      case 'hr': lab = { type: 'rule', cont: false }; break;
      default: lab = { type: 'blank', cont: false };
    }
    labels.push(lab);
    first = false; prevBlank = false;
  }
  return labels;
}

// ---- formatter contract ---------------------------------------------------------------------------------

const JOINABLE = new Set(['para', 'list', 'quote', 'heading']);

export async function format(text, opts = {}) {
  const inputLines = text.split('\n');
  const tidied = tidy(text);                                   // [{ text, from }]
  const cleaned = tidied.map(l => l.text).join('\n');
  const markdown = await fenceDiagrams(cleaned, opts.parseMermaid);
  const mdLines = markdown.split('\n');
  const toMd = lineMap(tidied.map(l => l.text), mdLines);
  const mdLab = labelMarkdownLines(markdown);

  // tidy line index -> markdown label (a line fenceDiagrams removed - the bare "mermaid" line - joins the diagram after it)
  const tidyLab = tidied.map((l, k) => {
    if (toMd[k] >= 0) return mdLab[toMd[k]];
    if (blankLine(l.text)) return { type: 'blank', cont: false };
    for (let q = k + 1; q < tidied.length; q++) if (toMd[q] >= 0 && mdLab[toMd[q]].type !== 'blank') return { type: mdLab[toMd[q]].type, cont: false };
    return { type: 'para', cont: false };
  });

  const lines = inputLines.map(() => ({ type: 'blank', cont: false }));
  const owner = new Array(inputLines.length).fill(-1);
  tidied.forEach((l, k) => l.from.forEach(i => { owner[i] = k; }));
  const seen = new Set();
  for (let i = 0; i < inputLines.length; i++) {
    const k = owner[i];
    if (k < 0) {
      // Not in Tidy's output: trimmed leading/trailing empties (blank), or a borders-only box (dropped).
      lines[i] = blankLine(inputLines[i]) ? { type: 'blank', cont: false } : { type: 'chrome', cont: false };
      continue;
    }
    const lab = tidyLab[k];
    if (tidied[k].table && tidied[k].from.length && lab.type !== 'blank') {
      // Several input lines folded into one table row (wrapped cells, borders): same row, table lines stay cont false.
      lines[i] = { type: lab.type, cont: seen.has(k) ? JOINABLE.has(lab.type) : lab.cont };
    } else {
      lines[i] = { type: lab.type, cont: lab.cont };
    }
    seen.add(k);
  }
  return { markdown, lines };
}

export default format;
