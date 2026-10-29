// Glimpse format layer: clipboard text in, readable markdown out, plus a per-input-line trace.
// Runs inline in the panel's web view and in node (scoring harness). Contract: docs/dataset.md.
//
//   format(text, { parseMermaid }) -> Promise<{ markdown, lines: [{ type, cont }] }>
//
// Two input modes: raw markdown (has fences / # headings / | --- | tables / **bold**) goes to marked
// mostly as-is; terminal-rendered text (Claude Code's TUI already stripped the syntax) is rebuilt
// line by line. When unsure, keep line structure: never worse than the original.

(function () {
  'use strict';

  // ---------- character width (CJK and emoji take two terminal columns) ----------

  function charWidth(cp) {
    if (cp >= 0x1100 && (cp <= 0x115f || cp === 0x2329 || cp === 0x232a ||
        (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) || (cp >= 0xac00 && cp <= 0xd7a3) ||
        (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
        (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x3fffd))) return 2;
    return 1;
  }
  function width(s) { let w = 0; for (const ch of s) w += charWidth(ch.codePointAt(0)); return w; }
  const maxOf = (arr, init = 0) => arr.reduce((m, x) => (x > m ? x : m), init);   // no spread: huge inputs overflow the stack
  const minOf = (arr, init = Infinity) => arr.reduce((m, x) => (x < m ? x : m), init);

  // ---------- terminal UI (chrome) ----------

  const TOOL_CALL = /^\s*⏺\s+[A-Za-z_][\w.-]*\(/;             // ⏺ Bash(...), ⏺ Read(...): needs the call shape (⏺ Done. is a reply)
  const TOOL_OUT = /^\s*⎿/;
  const PROMPT = /^\s*❯/;
  const EXPAND = /^\s*…\s*\+\d+ lines?\b|ctrl\+o to expand/;
  const STATUSBAR = /^\s*(model\s+\S|⏵⏵|⏸|\?\s+for shortcuts|esc to interrupt|auto mode|accept edits|bypass permissions)/;
  const POWERLINE = /^\s*(~|\/|[\ue0a0-\ue0d4]|\S+@\S+).*[\ue0a0-\ue0d4]/;  // shell prompt line with powerline glyphs
  const RULE_CHARS = /^\s*[─━═]{8,}\s*$/;

  const NOTICE = /^\s*⏺\s+(Teammate\s+@|Agent\s+"|Background command\s+"|\d+\s+background\s+(agents?|tasks?|commands?)|Interrupted|Compacted)/;
  const TREE = /^\s*[├└│]\s+@\S/;

  // `termish` = the input shows Claude Code terminal evidence. Without it, lines like "model accuracy..." are text.
  function isChromeStart(line, termish) {
    if (NOTICE.test(line) || TOOL_CALL.test(line) || TOOL_OUT.test(line) || PROMPT.test(line)) return true;
    return termish && (TREE.test(line) || EXPAND.test(line) || STATUSBAR.test(line) || POWERLINE.test(line) || /^\s*[✻✢✳✶✽✺]\s/.test(line));
  }

  // ---------- glued full-width lines ----------

  // A box-table row exactly as wide as the terminal makes the terminal join it with the next row on copy.
  // Cut such a line back at the table's width (top border ┌...┐ or first row border).
  function unglue(lines) {
    // indent of box rows that arrived on their own lines (Claude Code uses 2)
    const counts = {};
    lines.forEach(l => { const m = l.match(/^( *)[┌├└│]/); if (m && l.length < 400) counts[m[1].length] = (counts[m[1].length] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const indent = top ? +top[0] : 2;
    const out = [], origin = [];
    lines.forEach((line, i) => {
      const p0 = line.search(/[┌├└]/);
      const close = p0 < 0 ? -1 : line.slice(p0).search(/[┐┤┘]/);
      const r0 = Math.max(0, p0 - indent);   // a selection can start mid-row, with less than the full indent
      if (close > 0 && !line.slice(r0, p0).trim()) {
        // Rows are space-padded to the terminal width before the next one is glued on: the period runs
        // from this row's first box character to the next row's.
        const c = p0 + close;
        const next = line.slice(c + 1).search(/[┌├└│]/);
        const w = next < 0 ? 0 : c + 1 + next - p0;
        const chunks = [];
        if (w > 0) for (let k = r0; k < line.length; k += w) chunks.push(line.slice(k, k + w).replace(/\s+$/, ''));
        if (chunks.length > 1 && chunks.every(ch => !ch.trim() || /^[ \t]*[┌├└│]/.test(ch))) {
          const prefix = line.slice(0, r0).replace(/\s+$/, '');
          if (prefix.trim()) { out.push(prefix); origin.push(i); }
          chunks.forEach(ch => { out.push(ch); origin.push(i); });
          return;
        }
      }
      out.push(line); origin.push(i);
    });
    return { lines: out, origin };
  }

  // ---------- raw markdown mode ----------

  function looksLikeMarkdown(text) {
    let score = 0;
    if (/^[ \t]*```/m.test(text)) score += 2;
    if (/^#{1,6}[ \t]+\S/m.test(text)) score += 2;
    if (/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$/m.test(text)) score += 2;
    if (/\*\*[^*\n]+\*\*/.test(text)) score += 1;
    if (/\[[^\]\n]+\]\([^)\s]+\)/.test(text)) score += 1;
    if (/`[^`\n]+`/.test(text)) score += 1;
    return score >= 1;   // the terminal strips links, backticks and ** - any one proves raw markdown
  }

  // ---------- mermaid ----------

  const MERMAID_HEAD = /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|sankey(-beta)?|xychart(-beta)?|block(-beta)?|packet(-beta)?|kanban|architecture(-beta)?|requirementDiagram|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|radar(-beta)?|treemap(-beta)?)\b/;

  // ---------- block classification (terminal mode) ----------

  const BULLET = /^(\s*)([-*+•◦▪‣]|\d{1,3}[.)]|[a-zA-Z][.)])\s+\S/;
  const QUOTE = /^\s*▎/;
  const BOX = /^\s*[┌├└│┬┴┼]/;

  const CODE_START = /^\s*(def |class |func |fn |function\b|return\b|import |from \S+ import|package |const |let |var |if\s*\(|for\s*\(|while\s*\(|switch\b|case\b|#include|#!\/|SELECT\b|FROM\b|WHERE\b|WITH\b|INSERT\b|UPDATE\b|CREATE\b|JOIN\b|GROUP BY|ORDER BY|\$ |>>> |\w+\s*:=|\w+\s*=\s*\S|[}\])]\s*[;,)]?\s*$|\/\/|--\s|@\w+)/;
  const SHELL = /^\s*(git|gh|cd|ls|cat|grep|rg|sed|awk|curl|npm|npx|node|python3?|pip|go|cargo|make|docker|kubectl|gcloud|bq|brew|claude|tmux|ssh|export|echo|sudo|chmod|mkdir|rm|cp|mv)\s+\S/;

  function lineCodeScore(raw) {
    const t = raw.trim();
    if (!t) return 0;
    let ls = 0;
    if (CODE_START.test(raw) || SHELL.test(raw)) ls += 1.2;
    if (/[;{}]\s*$|[({[,]\s*$|^\s*[)}\]]/.test(t)) ls += 1;
    if (/^[{[]/.test(t) && /[}\]],?$/.test(t)) ls += 1;                     // JSON-ish line
    if (/^\[?\d{4}-\d{2}-\d{2}[T ]\d|^\[?\d{2}:\d{2}:\d{2}/.test(t)) ls += 1.5;     // log timestamp
    if (/\b(INFO|WARN(ING)?|ERROR|DEBUG|TRACE|FATAL)\b/.test(t)) ls += 0.6;
    if (/^[^\s,]+(,[^\s,]*){2,}$/.test(t)) ls += 1.5;                          // CSV row
    if (/^<!--|^<\/?[a-zA-Z][\w-]*(\s[^>]*)?>/.test(t)) ls += 1.5;         // HTML / comment
    if (/^-{1,2}[a-zA-Z][\w-]*(\s|=|$)/.test(t) && /['"=\\]/.test(t)) ls += 1.2; // CLI flag line
    if (/\S\s+\/\/\s/.test(t) && /[.(]/.test(t.split('//')[0])) ls += 1;         // trailing // comment
    if (/^\w[\w.]*\.\w+\(.*\)/.test(t)) ls += 0.8;                         // method chain call
    if (/(==|!=|=>|->|::|&&|\|\||\+=|<-|:=)/.test(t)) ls += 0.6;
    if (/\w\(.*\)/.test(t) && !/\s\w+\s\w+\s\w+\s\w+/.test(t.replace(/\(.*\)/, ''))) ls += 0.5;
    if (/^[a-z_]+[A-Z]\w*|\b[a-z]+_[a-z_]+\b/.test(t) && !/[.!?]$/.test(t)) ls += 0.3;
    if (/\S {3,}\S/.test(t)) ls += 1.5;                                   // aligned columns: prose never has 3+ inner spaces
    const sym = (t.match(/[{}()[\];=<>|&$#@\\/*+]/g) || []).length / t.length;
    ls += Math.min(1, sym * 6);
    if (/[.!?]["')]?$/.test(t) && /\b(the|a|an|is|are|and|to|of|we|it|this|that)\b/i.test(t)) ls -= 1.2;
    if ((t.match(/\b[A-Za-z]+\b/g) || []).length >= 8 && sym < 0.05) ls -= 1;
    return ls;
  }

  function codeScore(lines) {
    const real = lines.filter(l => l.trim());
    if (!real.length) return 0;
    const avg = real.reduce((a, l) => a + lineCodeScore(l), 0) / real.length;
    const base = lines[0].search(/\S/);
    const deep = real.filter(l => l.search(/\S/) >= base + 6).length;
    return avg + (deep >= 2 && deep >= real.length * 0.25 ? 0.8 : 0);
  }

  // Greedy wrap test: a break is a soft wrap only if the next line's first word could NOT have fit
  // on the previous line. `avail` is the estimated wrap width for this block's text.
  function isSoftWrap(prev, next, avail, nextIndentOk) {
    if (!nextIndentOk) return false;
    const firstWord = next.trim().replace(/^▎\s*/, '').split(/\s+/)[0] || '';
    if (!firstWord) return false;
    // CJK text wraps per character: the next "word" is its first character.
    const unit = charWidth(firstWord.codePointAt(0)) === 2 ? firstWord[0] : firstWord;
    return width(prev.trimEnd()) + 1 + width(unit) > avail;
  }

  function escapeInline(s) {
    return s.replace(/\\/g, '\\\\').replace(/([`*_<>\[\]#|~&])/g, '\\$1');
  }

  // ---------- terminal mode ----------

  async function formatTerminal(inputLines, opts) {
    const N = inputLines.length;
    const trace = inputLines.map(() => ({ type: 'blank', cont: false }));

    // 1. chrome
    const isChrome = new Array(N).fill(false);
    const termish = /^[ \t]*[⏺❯⎿▎┌│]/m.test(inputLines.join('\n')) || inputLines.some(l => RULE_CHARS.test(l));
    // Your typed prompt has a background color, so its lines are padded to the full width. Only trust that
    // right after a ❯ prompt line: a resized pane pads every line, reply text included.
    const padW = maxOf(inputLines.map(l => width(l)));
    const padded = l => /\S {3,}$/.test(l) && width(l) >= padW - 1 && padW >= 40;
    for (let i = 0; i < N; i++) {
      if (!PROMPT.test(inputLines[i])) continue;
      for (let j = i + 1; j < N && inputLines[j].trim() && padded(inputLines[j]); j++) isChrome[j] = true;
    }
    for (let i = 0; i < N; i++) {
      const l = inputLines[i];
      if (isChromeStart(l, termish)) {
        isChrome[i] = true;
        // continuation of a chrome block: deeper-indented lines right after a tool call / output / prompt
        const ind = l.search(/\S/);
        let j = i + 1;
        while (j < N && inputLines[j].trim() && inputLines[j].search(/\S/) > ind && !/^\s*⏺/.test(inputLines[j]) &&
               (TOOL_CALL.test(l) || TOOL_OUT.test(l) || PROMPT.test(l))) { isChrome[j] = true; j++; }
      }
      if (RULE_CHARS.test(l)) {
        const near = inputLines.slice(Math.max(0, i - 2), i + 3).some(x => PROMPT.test(x) || STATUSBAR.test(x));
        if (near || width(l.trim()) >= 60 && (i === N - 1 || PROMPT.test(inputLines[i + 1] || '') || i > 0 && PROMPT.test(inputLines[i - 1]))) isChrome[i] = true;
      }
    }
    for (let i = 0; i < N; i++) if (isChrome[i]) trace[i] = { type: 'chrome', cont: false };

    // 2. content lines: strip the reply marker, then dedent
    const content = inputLines.map((l, i) => isChrome[i] ? null : l.replace(/^(\s*)⏺ /, '$1  ').replace(/\s+$/, ''));
    // A selection that starts mid-line leaves its first line with less indent than the rest:
    // take the indent from the other lines, and remember the first line was truncated.
    const contentIdx = content.map((l, i) => l && l.trim() ? i : -1).filter(i => i >= 0);
    const restIndents = contentIdx.slice(1).map(i => content[i].search(/\S/));
    const firstIndent = contentIdx.length ? content[contentIdx[0]].search(/\S/) : 0;
    const truncatedFirst = restIndents.length > 0 && firstIndent < minOf(restIndents);
    const cut = restIndents.length ? minOf(restIndents, truncatedFirst ? Infinity : firstIndent) : firstIndent;
    const body = content.map(l => l == null ? null : l.slice(Math.min(cut, l.search(/\S/) < 0 ? l.length : l.search(/\S/))));

    // wrap width: prompt-box rules give the terminal width exactly; else the longest line is a lower bound.
    const maxW = maxOf(inputLines.map(l => width(l.trimEnd())));
    const ruleW = maxOf(inputLines.filter(l => RULE_CHARS.test(l)).map(l => width(l.trimEnd())).filter(w => w >= maxW - 2));
    const termW = ruleW || maxW;
    // Joining soft wraps needs evidence a terminal wrapped this text (Claude Code's 2-space reply indent,
    // its markers or UI, box drawing). Plain text from other apps keeps every line break.
    const terminal = cut >= 2 || isChrome.some(Boolean) || ruleW > 0 || termish;
    const avail = terminal ? termW - cut - (ruleW ? 1 : 0) : Infinity;

    // 3. blocks: runs of non-blank content lines
    const blocks = [];
    let cur = null;
    for (let i = 0; i < N; i++) {
      if (body[i] == null || !body[i].trim()) { cur = null; continue; }
      if (!cur) { cur = { idx: [] }; blocks.push(cur); }
      cur.idx.push(i);
    }

    // Diagrams contain blank lines between sections: after a mermaid header, absorb following blocks
    // that still look like diagram body (deeper indent, arrows, subgraph/end/style/class lines).
    const MERMAID_BODY = /-->|-\.->|==>|---|\|.*\||^\s*(subgraph|end|style|classDef|class|linkStyle|participant|actor|note|loop|alt|else|opt|par|rect|section|title|direction)\b|^\s*\w+[\[({]|^\s*\w+\s*:/;
    for (let k = 0; k < blocks.length; k++) {
      const b = blocks[k];
      const h = /^\s*mermaid\s*$/.test(body[b.idx[0]]) ? 1 : 0;
      if (!(b.idx.length > h && MERMAID_HEAD.test(body[b.idx[h]]))) continue;
      const headInd = body[b.idx[h]].search(/\S/);
      while (k + 1 < blocks.length) {
        const n = blocks[k + 1];
        const looks = n.idx.every(i => body[i].search(/\S/) > headInd || /^\s*end\s*$/.test(body[i])) &&
          n.idx.filter(i => MERMAID_BODY.test(body[i])).length >= n.idx.length * 0.6;
        if (!looks || n.idx[0] - b.idx[b.idx.length - 1] > 3) break;
        for (let i = b.idx[b.idx.length - 1] + 1; i < n.idx[0]; i++) b.idx.push(i);  // keep inner blank lines
        b.idx.push(...n.idx);
        blocks.splice(k + 1, 1);
      }
    }

    // A list often follows its lead-in sentence with no blank line: split the block where bullets start.
    // Same for a "Header: value" table's separators, which stay inside the block on purpose.
    for (let k = 0; k < blocks.length; k++) {
      const b = blocks[k];
      if (codeScore(b.idx.map(i => body[i])) >= 0.5) continue;
      const at = b.idx.findIndex((i, j) => j > 0 && BULLET.test(body[i]) && !BULLET.test(body[b.idx[j - 1]]) &&
        body[i].search(/\S/) <= body[b.idx[0]].search(/\S/) && !KV_LINE.test(body[b.idx[0]]));
      if (at > 0) blocks.splice(k + 1, 0, { idx: b.idx.splice(at) });
    }

    for (let k = 0; k < blocks.length; k++) {
      const b = blocks[k];
      const at = b.idx.findIndex((i, j) => j > 0 && /:\s*$/.test(body[b.idx[j - 1]]) && lineCodeScore(body[i]) >= 1.5 &&
        codeScore(b.idx.slice(j).map(x => body[x])) >= 0.9 && lineCodeScore(body[b.idx[j - 1]]) < 1.2);
      if (at > 0) blocks.splice(k + 1, 0, { idx: b.idx.splice(at) });
    }

    const out = [];
    let lastCodeEnd = -1;
    for (const b of blocks) {
      const ls = b.idx.map(i => body[i] == null ? '' : body[i]);
      const first = ls[0];

      // diagram: optional bare "mermaid" line, then a mermaid header; the parser decides
      let mStart = /^\s*mermaid\s*$/.test(first) ? 1 : 0;
      if (ls.length > mStart && MERMAID_HEAD.test(ls[mStart])) {
        const src = dedent(ls.slice(mStart).map(l => l == null ? '' : l)).join('\n').replace(/\n{3,}/g, '\n\n');
        const ok = opts.parseMermaid ? await opts.parseMermaid(src) : false;
        if (ok) {
          b.idx.forEach(i => trace[i] = { type: 'diagram', cont: false });
          out.push('```mermaid\n' + src + '\n```');
          continue;
        }
      }

      // "Header: value" table: Claude Code's layout for a table too wide for the terminal.
      // Rows are separated by a short ──── rule; every row repeats the same headers in order.
      const kv = kvTable(ls);
      if (kv) {
        b.idx.forEach(i => trace[i] = { type: 'table', cont: false });
        kv.contAt.forEach(k => trace[b.idx[k]].cont = true);
        out.push(kv.markdown);
        continue;
      }

      // horizontal rule inside the reply
      if (ls.length === 1 && (RULE_CHARS.test(first) || /^\s*([-*_])\1{2,}\s*$/.test(first))) {
        trace[b.idx[0]] = { type: 'rule', cont: false };
        out.push('---');
        continue;
      }

      // table: box drawing
      if (ls.filter(l => BOX.test(l)).length >= Math.max(2, ls.length * 0.6)) {
        // text glued to the table (no blank line between) stays as its own lines, never discarded
        // a row fragment (selection started mid-row) has cell separators: it belongs to the table
        const inTable = l => BOX.test(l) || (l.match(/│/g) || []).length >= 2;
        const fb = ls.findIndex(inTable), lb = ls.length - 1 - [...ls].reverse().findIndex(inTable);
        const text = (a, z) => { for (let k = a; k < z; k++) trace[b.idx[k]] = { type: 'para', cont: false };
          return ls.slice(a, z).map(l => escapeInline(l.trim())).join('  \n'); };
        if (fb > 0) out.push(text(0, fb));
        for (let k = fb; k <= lb; k++) trace[b.idx[k]] = { type: 'table', cont: false };
        out.push(boxTable(ls.slice(fb, lb + 1)));
        if (lb < ls.length - 1) out.push(text(lb + 1, ls.length));
        continue;
      }

      // quote
      if (ls.every(l => QUOTE.test(l))) {
        const merged = joinLines(b.idx, ls, avail, trace, 'quote').map(t => t.replace(/^▎\s?/, '').replace(/ ▎\s?/g, ' '));
        out.push(merged.map(t => '> ' + escapeInline(t)).join('\n>\n'));
        continue;
      }

      // list: first line has a bullet / number, or most lines do
      const bulletCount = ls.filter(l => BULLET.test(l)).length;
      const bi = blocks.indexOf(b);
      const isListBlock = x => x && BULLET.test(body[x.idx[0]] || '');
      if (ls.length === 1 && /^\s*\d{1,2}[.)]\s+\S/.test(first) && width(first.trim()) <= 80 && !/[.;]$/.test(first.trim()) &&
          !isListBlock(blocks[bi - 1]) && !isListBlock(blocks[bi + 1]) && bi < blocks.length - 1) {
        trace[b.idx[0]] = { type: 'heading', cont: false };
        out.push('### ' + escapeInline(first.trim()));
        continue;
      }
      if (BULLET.test(first) && codeScore(ls) < 0.9) {
        out.push(listBlock(b.idx, ls, avail, trace));
        continue;
      }

      if (ls.length === 1 && /^\s*https?:\/\/\S+\s*$/.test(first)) {
        trace[b.idx[0]] = { type: 'para', cont: false };
        out.push(first.trim());
        continue;
      }

      // code: rules of thumb; ties go to code (keeps line breaks)
      const cs = codeScore(ls);
      const proseLike = ls.length >= 2 && ls.slice(0, -1).every((l, k) => isSoftWrap(l, ls[k + 1], avail, true));
      if (cs >= 0.9 || (cs >= 0.5 && !proseLike) || (bulletCount === 0 && hasCodeIndentation(ls) && cs >= 0.3)) {
        b.idx.forEach(i => trace[i] = { type: 'code', cont: false });
        const prev = out.length && out[out.length - 1];
        if (prev && prev.startsWith('```\n') && lastCodeEnd >= 0 && b.idx[0] - lastCodeEnd <= 3) {
          for (let i = lastCodeEnd + 1; i < b.idx[0]; i++) trace[i] = { type: 'code', cont: false };
          const gap = '\n'.repeat(b.idx[0] - lastCodeEnd - 1);
          out[out.length - 1] = prev.slice(0, -4) + '\n' + gap + dedent(ls).join('\n') + '\n```';
        } else out.push('```\n' + dedent(ls).join('\n') + '\n```');
        lastCodeEnd = b.idx[b.idx.length - 1];
        continue;
      }

      // heading: a single short line without sentence punctuation, followed by more content
      if (ls.length === 1 && width(first.trim()) <= 80 && !/[.,;:!]$/.test(first.trim()) &&
          /^[\p{Lu}\p{N}\d"'`(\[]/u.test(first.trim()) && b !== blocks[blocks.length - 1]) {
        trace[b.idx[0]] = { type: 'heading', cont: false };
        out.push('### ' + escapeInline(first.trim()));
        continue;
      }

      // paragraph
      const paras = joinLines(b.idx, ls, avail, trace, 'para', truncatedFirst && b.idx[0] === contentIdx[0] ? 0 : -1);
      out.push(paras.map(escapeInline).join('  \n'));
    }

    return { markdown: out.join('\n\n'), lines: trace };
  }

  const KV_LINE = /^\s*([^\s:│][^:│]{0,40}?):\s+\S/;
  const SHORT_RULE = /^\s*─{10,}\s*$/;

  // Returns { markdown, contAt } for a block shaped like
  //   H1: value / H2: value (wrapped lines continue a value) / ──── / H1: value / H2: value ...
  function kvTable(ls) {
    const groups = [[]];
    ls.forEach((l, k) => { if (SHORT_RULE.test(l)) groups.push([]); else groups[groups.length - 1].push(k); });
    const full = groups.filter(g => g.length);
    if (full.length < 2) return null;
    const label = k => (ls[k].match(KV_LINE) || [])[1];
    // headers: the label sequence of a complete row, i.e. one that starts with a label
    const ref = full.find(g => label(g[0])) || [];
    const headers = ref.map(label).filter(Boolean);
    if (headers.length < 2) return null;
    const known = new Set(headers);
    const rows = [], contAt = [];
    let ok = 0;
    for (const g of full) {
      const row = {};
      let cur = null;
      for (const k of g) {
        const h = label(k);
        if (h && known.has(h)) { cur = h; row[h] = ls[k].slice(ls[k].indexOf(':') + 1).trim(); }
        else if (cur) { row[cur] += ' ' + ls[k].trim(); contAt.push(k); }
        else { row[headers[0]] = ls[k].trim(); cur = headers[0]; }  // row cut by the selection
      }
      if (Object.keys(row).filter(h => known.has(h)).length >= 2) ok++;
      rows.push(row);
    }
    if (ok < Math.max(1, full.length - 1)) return null;
    const cell = c => escapeInline(c || '').replace(/\|/g, '\\|');
    const md = ['| ' + headers.map(cell).join(' | ') + ' |', '|' + ' --- |'.repeat(headers.length),
      ...rows.map(r => '| ' + headers.map(h => cell(r[h])).join(' | ') + ' |')].join('\n');
    return { markdown: md, contAt };
  }

  function dedent(ls) {
    const ind = ls.filter(l => l.trim()).map(l => l.search(/\S/));
    const c = ind.length ? minOf(ind) : 0;
    return ls.map(l => l.slice(Math.min(c, Math.max(0, l.search(/\S/)))).replace(/\s+$/, ''));
  }

  function hasCodeIndentation(ls) {
    const ind = ls.map(l => l.search(/\S/));
    return new Set(ind).size >= 2 && ind.some((x, k) => k > 0 && x > ind[0]);
  }

  // Join soft-wrapped lines; returns the logical lines. Marks trace for each input line.
  // `truncatedAt` = index (in idx) of a line whose start was cut off by the selection: its visible
  // width says nothing about where it wrapped, so its end is treated as a wrap point.
  function joinLines(idx, ls, avail, trace, type, truncatedAt = -1) {
    const logical = [];
    ls.forEach((l, k) => {
      const t = l.trim();
      const cont = k > 0 && (k - 1 === truncatedAt ? !BULLET.test(l)
        : isSoftWrap(ls[k - 1], l, avail, l.search(/\S/) <= ls[k - 1].search(/\S/) + 1));
      trace[idx[k]] = { type, cont };
      if (cont) logical[logical.length - 1] += ' ' + t; else logical.push(t);
    });
    return logical;
  }

  function listBlock(idx, ls, avail, trace) {
    const items = [];   // { indent, marker, text }
    ls.forEach((l, k) => {
      const m = l.match(BULLET);
      if (m) {
        const marker = /\d/.test(m[2]) ? m[2].replace(')', '.') : '-';
        items.push({ indent: m[1].length, marker, text: l.slice(m[0].length - 1).trim() });
        trace[idx[k]] = { type: 'list', cont: false };
      } else if (items.length) {
        const it = items[items.length - 1];
        const prev = ls[k - 1];
        const cont = isSoftWrap(prev, l, avail, true);
        trace[idx[k]] = { type: 'list', cont };
        it.text += (cont ? ' ' : '  \n') + l.trim();
      } else {
        trace[idx[k]] = { type: 'para', cont: false };
        items.push({ indent: 0, marker: '', text: l.trim() });
      }
    });
    // nesting: map distinct indents to levels
    const levels = [...new Set(items.map(i => i.indent))].sort((a, b) => a - b);
    return items.map(it => {
      const lvl = levels.indexOf(it.indent);
      const text = escapeInline(it.text).replace(/\\ \\ \n/g, '  \n');
      return it.marker ? '   '.repeat(lvl) + it.marker + ' ' + text : text;
    }).join('\n');
  }

  function boxTable(ls) {
    const rowsRaw = [];
    let group = [];
    let separators = 0;
    const flush = () => { if (group.length) rowsRaw.push(group); group = []; };
    for (const l of ls) {
      const t = l.trim();
      if (t.startsWith('│')) group.push(t.split('│').slice(1, -1).map(c => c.trim()));
      else if (/^[├┼]/.test(t)) { separators++; flush(); }
      else if (/^[┌└]/.test(t)) flush();
    }
    flush();
    let rows;
    if (rowsRaw.length > 1 && separators >= rowsRaw.length - 1) {
      rows = rowsRaw.map(g => (g[0] || []).map((_, c) => g.map(r => r[c] || '').filter(Boolean).join(' ')));
    } else {
      rows = rowsRaw.flat();
    }
    if (!rows.length) return ls.join('\n');
    const cols = maxOf(rows.map(r => r.length));
    const cell = c => (c || '').replace(/\|/g, '\\|');
    const line = r => '| ' + Array.from({ length: cols }, (_, c) => cell(r[c])).join(' | ') + ' |';
    return [line(rows[0]), '|' + ' --- |'.repeat(cols), ...rows.slice(1).map(line)].join('\n');
  }

  // ---------- markdown mode ----------

  async function formatMarkdown(inputLines, opts) {
    // Fence unfenced mermaid blocks (bare "mermaid" line or header line), keep everything else as-is.
    const N = inputLines.length;
    const trace = inputLines.map(l => ({ type: l.trim() ? 'para' : 'blank', cont: false }));
    const out = [];
    let i = 0, inFence = false;
    while (i < N) {
      const l = inputLines[i];
      if (/^\s*```/.test(l)) {
        const lang = l.trim().slice(3).trim();
        const start = i;
        i++;
        while (i < N && !/^\s*```\s*$/.test(inputLines[i])) i++;
        const type = lang === 'mermaid' ? 'diagram' : 'code';
        for (let k = start; k <= Math.min(i, N - 1); k++) trace[k] = { type, cont: false };
        out.push(...inputLines.slice(start, i + 1));
        i++;
        continue;
      }
      // unfenced mermaid block
      const mStart = /^\s*mermaid\s*$/.test(l) ? 1 : 0;
      if (MERMAID_HEAD.test(inputLines[i + mStart] || '') && (mStart || !l.match(/\s\w+\s\w+\s\w+\s\w+/))) {
        let j = i + mStart;
        while (j < N && inputLines[j].trim()) j++;
        const src = dedent(inputLines.slice(i + mStart, j)).join('\n');
        if (opts.parseMermaid && await opts.parseMermaid(src)) {
          for (let k = i; k < j; k++) trace[k] = { type: 'diagram', cont: false };
          out.push('```mermaid', src, '```');
          i = j;
          continue;
        }
      }
      // markdown semantics for the trace
      const t = l.trim();
      if (/^#{1,6}\s/.test(t)) trace[i] = { type: 'heading', cont: false };
      else if (/^\|/.test(t)) trace[i] = { type: 'table', cont: false };
      else if (BULLET.test(l)) trace[i] = { type: 'list', cont: false };
      else if (/^>/.test(t)) trace[i] = { type: 'quote', cont: false };
      else if (/^([-*_])\s*\1\s*\1[\s\-*_]*$/.test(t)) trace[i] = { type: 'rule', cont: false };
      else if (t && i > 0 && inputLines[i - 1].trim() && !/^\s*```/.test(inputLines[i - 1])) {
        const pt = trace[i - 1].type;
        trace[i] = { type: pt === 'heading' || pt === 'table' || pt === 'rule' ? 'para' : pt, cont: pt === 'para' || pt === 'list' || pt === 'quote' };
      }
      out.push(l);
      i++;
    }
    return { markdown: out.join('\n'), lines: trace };
  }

  // ---------- entry ----------

  async function format(text, opts = {}) {
    const raw = String(text).replace(/\r\n?/g, '\n');
    const inputLines = raw.split('\n');
    const outsideFences = raw.replace(/^[ \t]*```[^\n]*\n[\s\S]*?^[ \t]*```[ \t]*$/gm, '');
    if (looksLikeMarkdown(raw) && !/^[ \t]*[┌│]/m.test(outsideFences) && !/^[ \t]*⏺/m.test(outsideFences)) {
      return formatMarkdown(inputLines, opts);
    }
    const { lines, origin } = unglue(inputLines);
    const res = await formatTerminal(lines, opts);
    if (lines.length === inputLines.length) return res;
    // map traces of split lines back to the original input lines
    const trace = inputLines.map(() => null);
    origin.forEach((o, k) => { if (!trace[o]) trace[o] = res.lines[k]; });
    return { markdown: res.markdown, lines: trace.map(t => t || { type: 'blank', cont: false }) };
  }

  const api = { format, width, looksLikeMarkdown };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.GlimpseFormat = api;
})();
