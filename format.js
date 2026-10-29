// Glimpse format engine v2: clipboard text in, readable markdown out, plus a per-input-line trace.
// Design: docs/engine-v2.md (ratified revision 3). Contract: docs/dataset.md.
//
//   format(text, { parseMermaid }) -> Promise<{ markdown, lines: [{ type, cont, demoted? }], trace }>
//
// format.js is generated: `cat engine/*.js` (build.sh). Each file is one section of this IIFE, in name order:
// policy, profiles, lex, geometry, features, readings, segment + decide, join, render, entry.
(function () {
  'use strict';

  // ================================================================ policy
  // Every tunable number in the engine lives here, named. Stages read policy; they never hold a threshold.
  const policy = {
    // Geometry: how sure we are of the wrap width. Low confidence = no joins.
    width: {
      nearCols: 3,          // medium: at least `minNear` lines end within `nearCols` of one width...
      minNear: 1,           // ...and the text shows terminal evidence (1, measured: 2 drops join recall 97.1 -> 91.7, gold 100 -> 81.1, never-worse unchanged)
    },
    // Risk matrix classes: the reading damage of showing type A when the truth is type B (docs/engine-v2.md "Risk policy").
    risk: {
      proseSwap: 1,         // prose-family shown as another prose-family type (para as heading, list as para)
      proseAsStructure: 2,  // prose shown as code or table: right text, heavier styling, breaks kept
      verbatimProse: 1.5,   // the floor on prose: breaks kept, nothing restyled
      verbatimStructure: 3, // the floor on code/table/diagram: proportional font loses the alignment
      structureSwap: 3,     // code shown as diagram or the reverse
      structureAsProse: 10, // code/table/diagram shown as prose: lines run together, layout lost
    },
    // Evidence weights. A reading's score is sum(weight * flag); scores become likelihoods by softmax.
    validator: 12,          // a parser or exact inversion accepted it (mermaid, JSON, exact grid, Label: groups, fence, `#`, `▎`)
    code: {
      // per-line flags (v1's measured rules of thumb, kept as evidence)
      start: 1.2, statementEnd: 1, jsonLine: 1, logTime: 1.5, logLevel: 0.6, csv: 1.5, html: 1.5, cliFlag: 1.2,
      trailingComment: 1, methodCall: 0.8, operator: 0.6, callShape: 0.5, identifier: 0.3, edge: 1.5, drawing: 1.5, aligned: 1.5,
      symbols: 6,           // symbol density x this, capped at 1
      sentence: -1.2, wordy: -1, wordyWords: 8, wordySymbols: 0.05,   // wordy = many words, few symbols
      // atom flags
      deepIndent: 0.8, deepCols: 6, deepShare: 0.25,
      layout2d: 3,          // geometry is content: box drawing that is not an exact grid, pointers placed by column
      slope: 4, center: 0.9,   // code score = slope * (mean line score - center)
      wraps: -1.5,          // every break in the atom is a clean soft wrap: prose evidence
    },
    list: 2.5,              // first line carries a bullet marker
    heading: { score: 1.2, maxCols: 80 },
    mermaidGap: 3,          // a diagram may span blank-line runs up to this long
    kv: { labelMax: 40, ruleMin: 10 },
    ruleMin: 8,             // ──── run that is a horizontal rule or prompt-box border
    // Claude Code profile
    claude: { promptPadSlack: 1, promptPadMin: 40, borderMin: 60, promptNear: 2 },   // prompt-box border within promptNear lines of the prompt
  };

  // ================================================================ text helpers
  // CJK and emoji take two terminal columns.
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
  const indentOf = l => { const k = l.search(/\S/); return k < 0 ? l.length : k; };
  const WORD = /[\p{L}\p{N}]+/gu;

  // ================================================================ source profiles
  // Tool knowledge lives here as data, never in the stages. A new tool is a new profile.
  // `detect` gates every hint; `ui` holds the tool's terminal-UI line shapes (demoted, never deleted).
  const RULE_LINE = new RegExp('^\\s*[─━═]{' + policy.ruleMin + ',}\\s*$');
  const profiles = {
    plain: { name: 'plain', detect: () => false, hints: { quote: /^\s*>\s?/ } },
    'claude-code': {
      name: 'claude-code',
      // Claude Code's own marks: reply marker, prompt, tool output, quote bar, box drawing at line start.
      // ... and its display of a fenced diagram: a bare `mermaid` line over a diagram header
      detect: lines => lines.some((l, i) => /^[ \t]*[⏺❯⎿▎┌│]/.test(l) || RULE_LINE.test(l) || /^\s*mermaid\s*$/.test(l) && MERMAID_HEAD.test(lines[i + 1] || '')),
      ui: {
        always: [
          /^\s*⏺\s+[A-Za-z_][\w.-]*\(/,          // tool call: needs the call shape (⏺ Done. is a reply)
          /^\s*⎿/,                                 // tool output
          /^\s*❯/,                                 // prompt
          /^\s*⏺\s+(Teammate\s+@|Agent\s+"|Background command\s+"|\d+\s+background\s+(agents?|tasks?|commands?)|Interrupted|Compacted)/,
        ],
        withEvidence: [
          /^\s*[├└│]\s+@\S/,                       // agent tree
          /^\s*…\s*\+\d+ lines?\b|ctrl\+o to expand/,
          /^\s*(model\s+\S|⏵⏵|⏸|\?\s+for shortcuts|esc to interrupt|auto mode|accept edits|bypass permissions)/,
          /^\s*(~|\/|[-]|\S+@\S+).*[-]/,   // powerline shell prompt
          /^\s*[✻✢✳✶✽✺]\s/,                         // status / spinner
        ],
        // a call, its output, or a prompt owns the deeper-indented lines right after it
        owner: [/^\s*⏺\s+[A-Za-z_][\w.-]*\(/, /^\s*⎿/, /^\s*❯/],
        prompt: /^\s*❯/,
      },
      hints: { replyIndent: 2, promptBorder: true, langTagLine: true, labelTables: true, replyMarker: /^(\s*)⏺ /,
        quote: /^\s*(▎|>)\s?/, quoteBar: /^\s*▎/ },   // its terminal shows `> quote` as `▎ quote`
    },
  };
  const profileFor = lines => profiles['claude-code'].detect(lines) ? profiles['claude-code'] : profiles.plain;
  // Terminal marks: a tool's profile or box drawing at line start. Text without them has no terminal rows to recover.
  const terminalMarks = (lines, profile) => profile.name !== 'plain' || /^[ \t]*[┌├└│]/m.test(lines.join('\n'));

  // ================================================================ lex
  // Deterministic, before anything is scored: line endings, glued rows, fences, terminal-UI lines.

  // Glued rows. Copy joins a terminal row to the next when the row reached the terminal's width T: a box row as wide
  // as T, or a row the app padded to T when it redrew after a resize. The joined row keeps its spaces and only the last
  // row is trimmed, so a glued line is rows of exactly T columns, the next row starting with its own indent (T is never
  // a line width). Rows start at column 0, or carry on from where the previous content ended: the copied newline does
  // not reset the column, and the line opens with the rest of that row as padding (measured: T - previous end column
  // equals the opening run in four copies). A copy's first line may start mid-row (the selection's start): its first
  // row ends at its first exact cut; its last line may end mid-row.
  // One exactness test per row kind, content on both sides of the cut:
  //   table row (box marks anywhere, or a pipe row): an end mark, then (after any spaces) a start mark, and every piece
  //     a whole row from start mark to end mark - a table row is never split inside
  //   any other row: a run of 2+ spaces (the row's padding, the next row's indent, or both)
  // T is at least the widest box border run (one row), and is the width that explains the most row boundaries: each
  // boundary inside a line counts for T when the cut there is exact, against T when it is not (no terminal row is wider
  // than T). A line is cut only when all its boundaries are exact; T needs 2+ and a lead. Equal scores: the T whose
  // restored rows take the indent of their own or the next line, then the narrower.
  // Proven before formatted: a cut table row is checked by its own marks (and the grid validator later), so table rows
  // are cut here. A glued text row reads the same as two aligned columns (`name   <- note`), so text cuts are only
  // offered: `rows.cuts[i]` holds them per line, for a validator (the diagram parser) to accept or ignore.
  function unglue(lines, origin, profile) {
    const keep = { lines, origin, rows: null };
    // no cut is possible without a 2+ space run between content or a table end mark
    const CUTTABLE = /\S {2,}\S|[┐┤┘│|]/;
    if (!terminalMarks(lines, profile) || !lines.some(l => CUTTABLE.test(l))) return keep;
    const TABLE = /[┌┐└┘├┤│]|^\s*\|/, START = /[┌├└│|]/, END = /[┐┤┘│|]/;
    // per line: string index at each display column, content width, opening run, and the columns an exact cut can fall on
    const info = lines.map(line => {
      if (!CUTTABLE.test(line)) { const w = width(line.trimEnd()); return { line, w, lead: w ? indentOf(line) : 0, any: false }; }
      const ch = [], at = [];
      for (let k = 0; k < line.length;) {
        const cp = line.codePointAt(k), c = String.fromCodePoint(cp);
        at[ch.length] = k; ch.push(c);
        if (charWidth(cp) === 2) { at[ch.length] = -1; ch.push(''); }   // a wide character's second column: no cut
        k += c.length;
      }
      at[ch.length] = line.length;
      let w = ch.length; while (w && ch[w - 1] === ' ') w--;
      const exact = new Uint8Array(w + 1), table = TABLE.test(line);
      for (let p = -1, c = 0; c < w; c++) {
        if (ch[c] === ' ' || ch[c] === '') continue;
        if (p >= 0 && (table ? END.test(ch[p]) && START.test(ch[c]) : c - p - 1 >= 2)) for (let x = p + 1; x <= c; x++) exact[x] = 1;
        p = c + (ch[c + 1] === '' ? 1 : 0);
      }
      return { line, at, w, lead: w ? indentOf(line) : 0, exact, table, any: exact.indexOf(1) >= 0 };
    });
    if (!info.some(x => x.any)) return keep;   // no exact cut anywhere: nothing to restore
    const idx = (x, c) => x.at ? x.at[c] : c;   // a line with no exact cut is only ever cut inside its opening spaces
    const nextIndent = i => { for (let j = i + 1; j < lines.length; j++) if (lines[j].trim()) return indentOf(lines[j]); return -1; };
    // one line at width T: its row starts from phase 0 or the carried phase, the first one whose boundaries are all exact
    const rows = (x, T, end, first, last) => {
      if (!x.any) {   // no exact cut: one row after the previous row's padding, or every boundary is against T
        const ph = T - end;
        return end > 0 && ph <= x.lead && ph < x.w && ph + T >= x.w ? { cs: [ph], ok: 0, bad: 0 } : { cs: null, ok: 0, bad: Math.ceil(x.w / T) - 1 };
      }
      const phases = [0];
      if (end > 0 && T - end <= x.lead && T - end < x.w) phases.push(T - end);   // the opening run is the previous row's rest
      if (first) { const c0 = x.exact.indexOf(1); if (c0 > 0 && c0 < T) phases.push(-c0); }   // a selection starts mid-row: its first row ends at the first exact cut
      let worst = null;
      for (const p of phases) {
        const ph = Math.abs(p), pad = p > 0;   // pad: the first cut is the previous row's padding, no evidence of its own
        const cs = []; for (let m = ph || T; m < x.w; m += T) cs.push(m);
        let bad = cs.filter(c => !(c === ph && pad) && !x.exact[c]).length;
        // a table row is restored whole: start mark to end mark (the selection's first row may lack its start, its last row its end)
        if (!bad && x.table && cs.length) bad = [0, ...cs].filter((c, k) => {
          const piece = x.line.slice(x.at[c], k < cs.length ? x.at[cs[k]] : undefined).trim();
          return k === 0 && pad ? piece : !(piece.length >= 2 && (k === cs.length && last || END.test(piece[piece.length - 1])) && (k === 0 && p < 0 || START.test(piece[0])));
        }).length;
        if (!bad) return { cs, ok: cs.length - (pad ? 1 : 0), bad: 0 };
        if (!worst || bad < worst.bad) worst = { cs: null, ok: 0, bad };
      }
      return worst;
    };
    const plan = T => {
      let end = 0, score = 0, cuts = 0, fit = 0, first = true;
      const lastLine = info.map(x => x.w > 0).lastIndexOf(true);
      const cutAt = info.map((x, i) => {
        if (!x.w) return null;   // a blank line keeps the column (measured: one blank line in between, phase still carried)
        const isFirst = first; first = false;
        if (x.w <= T) { end = x.w; return null; }   // one row: phase 0 holds with no cut
        const r = rows(x, T, end, isFirst, i === lastLine);
        score += r.ok - r.bad;
        end = r.cs ? x.w - (r.cs.length ? r.cs[r.cs.length - 1] : 0) : (x.w - 1) % T + 1;
        if (!r.cs || !r.cs.length) return null;
        cuts += r.ok;
        const own = indentOf(lines[i]), next = nextIndent(i);
        r.cs.forEach(c => { const ind = indentOf(lines[i].slice(idx(x, c))); if (ind === own || ind === next) fit++; });
        return r.cs;
      });
      return { T, score, cuts, fit, cutAt };
    };
    // a box border run (first corner to the matching end corner) is one row, so T is at least the widest
    const minT = maxOf(lines.map(l => maxOf((l.match(/[┌├└][─┬┼┴]*[┐┤┘]/g) || []).map(width))), 2);
    let best = null;
    const maxW = maxOf(info.map(x => x.w));
    for (let T = minT; T < maxW; T++) {
      // bound first: at most every boundary of a line with an exact cut counts for T; a line without one that is
      // wider than T plus its opening run counts against it whatever the phase
      let up = 0, down = 0;
      for (const x of info) if (x.w > T) { if (x.any) up += Math.floor((x.w - 1) / T) + 1; else if (x.w > T + x.lead) down += Math.ceil(x.w / T) - 1; }
      if (up < 2 || up - down <= 0 || best && up - down < best.score) continue;
      const r = plan(T);
      if (r.cuts < 2 || r.score <= 0) continue;
      if (!best || r.score > best.score || r.score === best.score && (r.fit > best.fit || r.fit === best.fit && T < best.T)) best = r;
    }
    if (!best) return keep;
    const out = [], org = [], cuts = [];
    lines.forEach((line, i) => {
      const x = info[i], cs = best.cutAt[i] || [], at = c => idx(x, c);
      if (!x.table) { out.push(line); org.push(origin[i]); cuts.push(cs.map(at)); return; }
      [0, ...cs].forEach((c, k) => {
        const piece = line.slice(at(c), k < cs.length ? at(cs[k]) : undefined).trimEnd();
        if (piece.trim() || !cs.length) { out.push(cs.length ? piece : line); org.push(origin[i]); cuts.push([]); }
      });
    });
    return { lines: out, origin: org, rows: { T: best.T, cuts } };
  }

  // Terminal-UI lines from the profile's shapes. Marked for demotion: shown dimmed in place, never removed.
  function lexUI(lines, profile) {
    const ui = new Array(lines.length).fill(false);
    const shapes = profile.ui;
    if (!shapes) return ui;
    const evidence = profile.detect(lines);
    // Your typed prompt has a background color, so its lines are padded to the full width. Trust that only
    // right after a prompt line: a resized pane pads every line, reply text included.
    const padW = maxOf(lines.map(width));
    const padded = l => /\S {3,}$/.test(l) && width(l) >= padW - policy.claude.promptPadSlack && padW >= policy.claude.promptPadMin;
    for (let i = 0; i < lines.length; i++) {
      if (!shapes.prompt.test(lines[i])) continue;
      for (let j = i + 1; j < lines.length && lines[j].trim() && padded(lines[j]); j++) ui[j] = true;
    }
    const isPrompt = l => shapes.prompt.test(l);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (shapes.always.some(r => r.test(l)) || (evidence && shapes.withEvidence.some(r => r.test(l)))) {
        ui[i] = true;
        if (shapes.owner.some(r => r.test(l))) {
          const ind = indentOf(l);
          for (let j = i + 1; j < lines.length && lines[j].trim() && indentOf(lines[j]) > ind && !profile.hints.replyMarker.test(lines[j]); j++) ui[j] = true;
        }
      }
      // prompt-box border: a long rule next to the prompt or at the end of the copy
      if (RULE_LINE.test(l) && (lines.slice(Math.max(0, i - policy.claude.promptNear), i + policy.claude.promptNear + 1).some(isPrompt) ||
          width(l.trim()) >= policy.claude.borderMin && (i === lines.length - 1 || isPrompt(lines[i + 1] || '') || (i > 0 && isPrompt(lines[i - 1]))))) ui[i] = true;
    }
    return ui;
  }

  // Lines v1 hides from its terminal-evidence scan: an opening ``` line up to the next line that is exactly ``` (v1's
  // `outsideFences`). Markdown evidence is read v1's way, so this scan is too; rendering keeps CommonMark's fences.
  function v1Fenced(lines) {
    const hidden = new Array(lines.length).fill(false), nextClose = new Array(lines.length + 1).fill(lines.length);
    for (let k = lines.length - 1; k >= 0; k--) nextClose[k] = /^[ \t]*```[ \t]*$/.test(lines[k]) ? k : nextClose[k + 1];
    for (let i = 0; i < lines.length; i++) {
      if (!/^[ \t]*```/.test(lines[i])) continue;
      const j = nextClose[i + 1];
      if (j === lines.length) continue;   // never closed: proves nothing about the lines after it
      for (let k = i; k <= j; k++) hidden[k] = true;
      i = j;
    }
    return hidden;
  }

  // Fenced blocks (raw markdown): unsplittable atoms. Returns [{ from, to, lang }] with `to` inclusive.
  function lexFences(lines) {
    const fences = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^[ \t]*(`{3,})[ \t]*([^`\s]*)/);   // v1's fence: backticks only; `~~~` stays text
      if (!m) continue;
      let j = i + 1;
      while (j < lines.length && !new RegExp('^[ \\t]*`{' + m[1].length + ',}[ \\t]*$').test(lines[j])) j++;
      fences.push({ from: i, to: Math.min(j, lines.length - 1), lang: m[2].toLowerCase() });
      i = j;
    }
    return fences;
  }

  // ================================================================ geometry
  // Reply marker off, common indent off, wrap width with a confidence. Low confidence means no joins.
  function geometry(lines, ui, profile) {
    const marker = profile.hints.replyMarker;
    const content = lines.map((l, i) => ui[i] ? null : (marker ? l.replace(marker, '$1  ') : l).trimEnd());
    // A selection that starts mid-line leaves its first line with less indent than the rest:
    // take the indent from the other lines, and treat the first line's end as a wrap point.
    const idx = content.map((l, i) => l && l.trim() ? i : -1).filter(i => i >= 0);
    const rest = idx.slice(1).map(i => indentOf(content[i]));
    const firstIndent = idx.length ? indentOf(content[idx[0]]) : 0;
    const truncatedFirst = rest.length > 0 && firstIndent < minOf(rest) ? idx[0] : -1;
    const cut = rest.length ? minOf(rest, truncatedFirst >= 0 ? Infinity : firstIndent) : firstIndent;
    const body = content.map(l => l == null ? null : l.slice(Math.min(cut, indentOf(l))));

    const widths = lines.map(l => width(l.trimEnd()));
    const maxW = maxOf(widths);
    // high: a prompt-box border gives the terminal width exactly
    const borderW = profile.hints.promptBorder ? maxOf(lines.filter(l => RULE_LINE.test(l)).map(l => width(l.trimEnd())).filter(w => w >= maxW - 2)) : 0;
    const terminal = terminalMarks(lines, profile) || cut >= (profile.hints.replyIndent || 2);
    const near = widths.filter(w => w >= maxW - policy.width.nearCols).length;
    const confidence = borderW ? 'high' : terminal && near >= policy.width.minNear ? 'medium' : 'low';
    const termW = borderW || maxW;
    const avail = confidence === 'low' ? Infinity : termW - cut - (borderW ? 1 : 0);
    return { body, cut, avail, confidence, truncatedFirst, terminal, hints: profile.hints };
  }

  // ================================================================ features
  // One table of facts per line, computed once. Readings read only this table (and validators).
  const BULLET = /^(\s*)([-*+•◦▪‣]|\d{1,3}[.)]|[a-zA-Z][.)])\s+\S/;
  const BOX = /[┌┐└┘├┤┬┴┼│─]/;
  const BOX_START = /^\s*[┌├└│┬┴┼]/;
  const POINTER = /[▲▼◀▶↑↓←→]|─+┘|└─+|─+>/;
  const MERMAID_HEAD = /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|sankey(-beta)?|xychart(-beta)?|block(-beta)?|packet(-beta)?|kanban|architecture(-beta)?|requirementDiagram|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|radar(-beta)?|treemap(-beta)?)\b/;
  const MERMAID_BODY = /-->|-\.->|==>|---|\|.*\||^\s*(subgraph|end|style|classDef|class|linkStyle|participant|actor|note|loop|alt|else|opt|par|rect|section|title|direction)\b|^\s*\w+[\[({]|^\s*\w+\s*:/;
  const CODE_START = /^\s*(def |class |func |fn |function\b|return\b|import |from \S+ import|package |const |let |var |if\s*\(|for\s*\(|while\s*\(|switch\b|case\b|#include|#!\/|SELECT\b|FROM\b|WHERE\b|WITH\b|INSERT\b|UPDATE\b|CREATE\b|JOIN\b|GROUP BY|ORDER BY|\$ |>>> |\w+\s*:=|\w+\s*=\s*\S|[}\])]\s*[;,)]?\s*$|\/\/|--\s|@\w+)/;
  const SHELL = /^\s*(git|gh|cd|ls|cat|grep|rg|sed|awk|curl|npm|npx|node|python3?|pip|go|cargo|make|docker|kubectl|gcloud|bq|brew|claude|tmux|ssh|export|echo|sudo|chmod|mkdir|rm|cp|mv)\s+\S/;
  const INLINE = { bold: /\*\*[^*\n]+\*\*/, code: /`[^`\n]+`/, link: /\[[^\]\n]+\]\([^)\s]+\)/ };   // v1's evidence: nothing parses as markdown that v1 kept as text

  // Code evidence of one line: sum of named flags x policy weights (v1's measured rules of thumb).
  function lineCode(raw) {
    const t = raw.trim(), w = policy.code;
    if (!t) return 0;
    const sym = (t.match(/[{}()[\];=<>|&$#@\\/*+]/g) || []).length / t.length;
    const flags = {
      start: CODE_START.test(raw) || SHELL.test(raw),
      statementEnd: /[;{}]\s*$|[({[,]\s*$|^\s*[)}\]]/.test(t),
      jsonLine: /^[{[]/.test(t) && /[}\]],?$/.test(t),
      logTime: /^\[?\d{4}-\d{2}-\d{2}[T ]\d|^\[?\d{2}:\d{2}:\d{2}/.test(t),
      logLevel: /\b(INFO|WARN(ING)?|ERROR|DEBUG|TRACE|FATAL)\b/.test(t),
      csv: /^[^\s,]+(,[^\s,]*){2,}$/.test(t),
      html: /^<!--|^<\/?[a-zA-Z][\w-]*(\s[^>]*)?>/.test(t),
      cliFlag: /^-{1,2}[a-zA-Z][\w-]*(\s|=|$)/.test(t) && /['"=\\]/.test(t),
      trailingComment: /\S\s+\/\/\s/.test(t) && /[.(]/.test(t.split('//')[0]),
      methodCall: /^\w[\w.]*\.\w+\(.*\)/.test(t),
      operator: /(==|!=|=>|->|::|&&|\|\||\+=|<-|:=)/.test(t),
      callShape: /\w\(.*\)/.test(t) && !/\s\w+\s\w+\s\w+\s\w+/.test(t.replace(/\(.*\)/, '')),
      identifier: /^[a-z_]+[A-Z]\w*|\b[a-z]+_[a-z_]+\b/.test(t) && !/[.!?]$/.test(t),
      edge: /^\w+(\[[^\]]*\]|\([^)]*\)|\{[^}]*\})?\s*(-->|-\.->|==>|---|-\.|--)/.test(t),   // diagram edge, kept as code when it no longer parses
      drawing: /[─━═│┃┌┐└┘├┤┬┴┼]/.test(t) && !/[\p{L}\p{N}]/u.test(t),   // only drawing characters: no words to be prose
      aligned: /\S {3,}\S/.test(t),                          // prose never has 3+ inner spaces
      symbols: Math.min(1, sym * w.symbols),
      sentence: /[.!?]["')]?$/.test(t) && /\b(the|a|an|is|are|and|to|of|we|it|this|that)\b/i.test(t),
      wordy: (t.match(/\b[A-Za-z]+\b/g) || []).length >= w.wordyWords && sym < w.wordySymbols,
    };
    let s = 0;
    for (const k in flags) s += (k === 'symbols' ? 1 : w[k]) * Number(flags[k]);
    return s;
  }

  // Inline markdown syntax is markdown evidence, not code symbols: score code on the text without it.
  const stripInline = l => l.replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/`([^`\n]+)`/g, '$1').replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, '$1');

  function features(body, hints) {
    return body.map((l, i) => {
      if (l == null || !l.trim()) return null;
      const t = l.trim();
      return {
        indent: indentOf(l), cols: width(t),
        code: lineCode(stripInline(l)),
        bullet: BULLET.test(l),
        quote: hints.quote.test(l), quoteBar: Boolean(hints.quoteBar && hints.quoteBar.test(l)),
        boxStart: BOX_START.test(l), box: BOX.test(t), pointer: POINTER.test(t),
        // drawn (invariant 2): starts with drawing, or is placed - no letter or digit, deeper than the line above (a caret,
        // a pointer): its column is content. A wrapped remainder (`.` alone) sits at the text's own column.
        drawn: BOX_START.test(l) || /^\s*[▲▼↑↓]/.test(l) || (!/[\p{L}\p{N}]/u.test(t) && i > 0 && body[i - 1] != null && body[i - 1].trim() !== '' && indentOf(l) > indentOf(body[i - 1])),
        rule: RULE_LINE.test(l) || /^\s*([-*_])\1{2,}\s*$/.test(l),
        mdHeading: /^#{1,6}[ \t]+\S/.test(l),
        mdPipe: /^[ \t]*\|.*\|[ \t]*$/.test(l),
        mermaid: MERMAID_HEAD.test(l), langTag: /^\s*mermaid\s*$/.test(l),
        endsColon: /:\s*$/.test(t), endsSentence: /[.,;:!?]$/.test(t),
        inline: Object.keys(INLINE).filter(k => INLINE[k].test(t)),
      };
    });
  }

  // ================================================================ validators
  // Exact inversions: each returns the recovered structure or null. A validator flag carries a score by itself.

  // Box table whose grid is exact: every border line has the same junction columns, every content row the same
  // number of cell bars, at least two columns. A first row cut mid-line by the selection keeps its right part.
  // Anything else drawn with box characters (mockups, nested boxes, side-by-side boxes) is not a table.
  function gridTable(ls) {
    const border = t => /^[┌├└┬┴┼─┐┤┘ ]+$/.test(t) && /[┌├└┼┬┴]/.test(t);
    const junctions = t => { const cols = []; let c = 0; for (const ch of t) { if (/[┌├└┬┴┼┐┤┘]/.test(ch)) cols.push(c); c += charWidth(ch.codePointAt(0)); } return cols.join(','); };
    let ref = null, bars = 0, separators = 0, firstBars = 0;
    const groups = [];
    let group = [];
    for (let k = 0; k < ls.length; k++) {
      const t = ls[k].trim();
      if (border(t) || (k === 0 || k === ls.length - 1) && /^[┌├└┬┴┼─┐┤┘ ]+$/.test(t)) {
        // a first or last border line may be cut by the selection: it only has to be border characters
        const cutEdge = (k === 0 || k === ls.length - 1) && !/[┐┤┘]$/.test(t);
        const j = junctions(t);
        if (!cutEdge) { if (ref !== null && j !== ref) return null; ref = j; }
        if (/^[├┼]/.test(t)) separators++;
        if (group.length) groups.push(group);
        group = [];
        continue;
      }
      const n = (t.match(/│/g) || []).length;
      // the selection can cut the first row's start or the last row's end
      const head = k === 0 && !t.startsWith('│') && t.endsWith('│');
      const tail = k === ls.length - 1 && t.startsWith('│') && !t.endsWith('│');
      if (!head && !tail && !(t.startsWith('│') && t.endsWith('│'))) return null;
      const cells = t.split('│').slice(head ? 0 : 1, tail ? undefined : -1).map(c => c.trim());
      if (!head && !tail) {
        if (k === 0) firstBars = n;   // the first row may be cut by the selection: fewer cells, checked after the loop
        else { if (bars && n !== bars) return null; bars = n; }
      }
      group.push({ cells, truncated: head || k === 0 });
    }
    if (group.length) groups.push(group);
    if (!bars) bars = firstBars;
    if (firstBars > bars) return null;
    const cols = bars ? bars - 1 : ref ? ref.split(',').length - 1 : 0;
    if (cols < 2 || ref && ref.split(',').length - 1 !== cols || !groups.length) return null;
    const pad = r => r.truncated ? [...Array(Math.max(0, cols - r.cells.length)).fill(''), ...r.cells] : r.cells;
    // rows that wrap inside their cells are separated by ├ lines; otherwise every content line is a row
    const rows = groups.length > 1 && separators >= groups.length - 1
      ? groups.map(g => Array.from({ length: cols }, (_, c) => g.map(r => pad(r)[c] || '').filter(Boolean).join(' ')))
      : groups.flat().map(pad);
    return rows.length ? rows : null;
  }

  // Claude Code's layout for a table too wide for the terminal: `Header: value` groups separated by a short rule.
  const KV_LINE = new RegExp('^\\s*([^\\s:│][^:│]{0,' + policy.kv.labelMax + '}?):\\s+\\S');
  const KV_RULE = new RegExp('^\\s*─{' + policy.kv.ruleMin + ',}\\s*$');
  function kvTable(ls) {
    const groups = [[]];
    ls.forEach((l, k) => { if (KV_RULE.test(l)) groups.push([]); else groups[groups.length - 1].push(k); });
    const full = groups.filter(g => g.length);
    if (full.length < 2) return null;
    const label = k => (ls[k].match(KV_LINE) || [])[1];
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
        else { row[headers[0]] = ls[k].trim(); cur = headers[0]; }   // row cut by the selection
      }
      if (Object.keys(row).filter(h => known.has(h)).length >= 2) ok++;
      rows.push(headers.map(h => row[h] || ''));
    }
    if (ok < Math.max(1, full.length - 1)) return null;
    return { rows: [headers, ...rows], contAt };
  }

  // Markdown pipe table: rows of pipes with a | --- | separator. Returns its rows (cells unescaped), like gridTable.
  const PIPE_SEP = /^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$/;   // v1's pattern
  const pipeTable = ls => ls.length >= 2 && ls.every(l => /^[ \t]*\|.*\|[ \t]*$/.test(l)) && ls.some(l => PIPE_SEP.test(l))
    ? ls.filter(l => !PIPE_SEP.test(l)).map(l => l.trim().slice(1, -1).split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|')))
    : null;

  function jsonValid(text) {
    const t = text.trim();
    if (!/^[{[]/.test(t)) return false;
    try { JSON.parse(t); return true; } catch (e) { return false; }
  }

  // ================================================================ readings
  // Each reading reports evidence (named flags) for an atom; it never scores itself. `null` = not applicable.
  // ctx: { ls (lines), f (features), avail, last (atom is the copy's last), grid, kv, md }
  function isSoftWrap(prev, next, avail, quote = /^\s*>\s?/) {
    const firstWord = next.trim().replace(quote, '').split(/\s+/)[0] || '';
    if (!firstWord || avail === Infinity) return false;
    const unit = charWidth(firstWord.codePointAt(0)) === 2 ? firstWord[0] : firstWord;   // CJK wraps per character
    return width(prev.trimEnd()) + 1 + width(unit) > avail;
  }

  const readings = {
    para: () => ({}),
    code(c) {
      const real = c.f, n = real.length, w = policy.code;
      const mean = real.reduce((a, x) => a + x.code, 0) / n;
      const base = real[0].indent;
      const deep = real.filter(x => x.indent >= base + w.deepCols).length;
      return {
        lines: w.slope * (mean - w.center),
        deepIndent: deep >= 2 && deep >= n * w.deepShare,
        layout2d: !c.grid && (real.some(x => x.boxStart) || real.filter(x => x.box).length >= 2 || (n >= 2 && real.some(x => x.pointer))),
        json: jsonValid(c.ls.join('\n')),
        wraps: n >= 2 && c.ls.slice(0, -1).every((l, k) => isSoftWrap(l, c.ls[k + 1], c.avail)),
      };
    },
    // A lone numbered line between non-list blocks is a section title ("5. Why the old dedup..."), not a list.
    list(c) {
      if (c.ls.length === 1 && /^\s*\d{1,2}[.)]\s/.test(c.ls[0]) && c.alone) return null;
      const base = c.f[0].indent, bullets = c.f.filter(x => x.bullet && x.indent <= base).length;
      return c.f[0].bullet ? { bullet: 1 } : bullets ? { bullet: bullets / c.ls.length } : null;
    },
    heading(c) {
      if (c.ls.length !== 1) return null;
      if (c.f[0].mdHeading && !c.terminal) return { validator: true };
      const t = c.ls[0].trim();
      // a bare short line is a heading only where a renderer stripped its `#` (terminal evidence)
      return c.ls.length === 1 && !c.last && c.terminal && c.f[0].cols <= policy.heading.maxCols && !c.f[0].endsSentence &&
        /^[\p{Lu}\p{N}"'`(\[]/u.test(t) ? { short: true } : null;
    },
    quote: c => c.f.every(x => x.quote) ? { validator: true } : null,
    table: c => c.grid || c.kv || c.pipe ? { validator: true } : null,
    diagram: c => c.diagram ? { validator: true } : null,
    rule: c => c.ls.length === 1 && c.f[0].rule ? { validator: true } : null,
  };

  // One formula for every reading: score = sum(weight[flag] * flag).
  function score(type, ev) {
    const w = policy;
    switch (type) {
      case 'para': return 0;
      case 'code': return ev.lines + w.code.deepIndent * ev.deepIndent + w.code.layout2d * ev.layout2d + w.validator * ev.json + w.code.wraps * ev.wraps;
      case 'list': return w.list * ev.bullet;
      case 'heading': return ev.validator ? w.validator : w.heading.score;
      default: return w.validator;   // quote, table, diagram, rule: validator-backed only
    }
  }

  // ================================================================ segment + decide
  const PROSE = new Set(['para', 'list', 'quote', 'heading', 'rule']);
  const STRUCT = new Set(['code', 'table', 'diagram']);

  // Risk of showing type `s` when the truth is `t` (docs/engine-v2.md "Risk policy").
  // Structure shown as prose damages its line breaks (they run together, layout is lost), so that risk scales with
  // the share of lines that have a break before them: a one-line atom has none, and the two mistakes are symmetric.
  function risk(s, t, n) {
    const r = policy.risk;
    if (s === t) return 0;
    if (s === 'verbatim') return PROSE.has(t) ? r.verbatimProse : r.verbatimStructure;
    if (PROSE.has(s)) return PROSE.has(t) ? r.proseSwap : r.proseAsStructure + (r.structureAsProse - r.proseAsStructure) * (n - 1) / n;
    if (PROSE.has(t)) return r.proseAsStructure;
    return s === 'table' || t === 'table' ? r.structureAsProse : r.structureSwap;   // a drawing torn into cells
  }

  // Evidence -> likelihoods (softmax over applicable readings) -> the shown type with the lowest expected risk.
  // Returns candidates ordered by expected risk, so a render that fails an invariant falls to the next one.
  function decide(c) {
    const scores = {};
    for (const type in readings) {
      const ev = readings[type](c);
      if (ev) scores[type] = score(type, ev);
    }
    const top = maxOf(Object.values(scores), -Infinity);
    let z = 0;
    for (const t in scores) z += Math.exp(scores[t] - top);
    const p = {};
    for (const t in scores) p[t] = Math.exp(scores[t] - top) / z;
    const options = [...Object.keys(scores), 'verbatim'].map(s => {
      let er = 0;
      for (const t in p) er += p[t] * risk(s, t, c.ls.length);
      return { type: s, er };
    }).sort((a, b) => a.er - b.er);
    return { options, p };
  }

  function context(idx, body, feats, geo, last) {
    const ls = idx.map(i => body[i]);
    return { idx, ls, f: idx.map(i => feats[i]), avail: geo.avail, terminal: geo.terminal, terminalText: geo.terminalText, last,
      grid: gridTable(ls), kv: geo.hints.labelTables ? kvTable(ls) : null, pipe: !geo.terminalText && !geo.noMarkdown && pipeTable(ls) };   // pipe syntax is markdown: content in terminal text
  }

  // Candidate cuts (docs/engine-v2.md "Segment"): a bullet run starting, box drawing starting or ending,
  // a line ending in `:` followed by a code-shaped line. Each is scored, never assumed.
  function cutCandidate(f, j, base) {
    const a = f[j - 1], b = f[j];
    return (b.bullet && !a.bullet && b.indent <= base) || a.boxStart !== b.boxStart || (a.endsColon && b.code >= policy.code.center);
  }

  // Cut at every candidate, then merge neighbours whose best reading is the same type: a cut stands only where the
  // readings on its two sides differ. One decision per part and per merge, so linear in the atom's length.
  function cutAtom(idx, mk) {
    const whole = mk(idx);
    if (whole.grid || whole.kv || whole.pipe) return [idx];   // an exact inversion of the whole atom beats any cut
    const f = whole.f, base = f[0].indent;
    const parts = [[idx[0]]];
    for (let j = 1; j < idx.length; j++) {
      if (cutCandidate(f, j, base)) parts.push([]);
      parts[parts.length - 1].push(idx[j]);
    }
    if (parts.length === 1) return parts;
    const type = p => decide(mk(p)).options[0].type;
    const out = [parts[0]];
    let prev = type(parts[0]);
    for (const p of parts.slice(1)) {
      const t = type(p);
      if (t === prev && t !== 'table' && t !== 'heading') for (const i of p) out[out.length - 1].push(i);
      else { out.push(p); prev = t; }
    }
    return out;
  }

  // ================================================================ join
  // One per-line pass for every joinable type. A break is a soft wrap only with width confidence (geometry) and
  // when the next line's first word could not have fit (greedy-wrap test). A selection's truncated first line
  // says nothing about where it wrapped, so its end counts as a wrap point.
  // Returns logical lines plus `cont` per input line.
  // Where a line's text starts: after its bullet marker, so a hanging-indented continuation can follow it.
  const textStart = l => { const m = l.match(BULLET); return m ? m[0].length - 1 : indentOf(l); };
  function join(ls, idx, geo, isItemStart = () => false, strip = t => t) {
    const logical = [], cont = [];
    ls.forEach((l, k) => {
      const t = strip(l.trim());
      const c = k > 0 && !isItemStart(k) && (idx[k - 1] === geo.truncatedFirst ? geo.confidence !== 'low' && !BULLET.test(l)
        : indentOf(l) <= textStart(ls[k - 1]) + 1 && isSoftWrap(ls[k - 1], l, geo.avail, geo.hints.quote));
      cont.push(c);
      if (c) logical[logical.length - 1] += ' ' + t; else logical.push(t);
    });
    return { logical, cont };
  }

  // ================================================================ render
  // Every reading but the markdown-source one escapes all of its text, as v1's text mode does: markdown syntax and HTML
  // reach the parser only where the text is read as markdown. Line structure is never decided here (that is Join).
  // Line-start syntax too: a list number (`2.`), a `-`/`+` marker or an `=`/`-` heading underline.
  // A bare URL or email is written as a CommonMark autolink (`<...>`), whose text the parser takes literally: escaping
  // it would put the backslashes into the link (GFM's own autolinking does not undo them). Trailing punctuation and an
  // unbalanced `)` stay outside the URL, as in GFM; a URL holding `|` stays escaped text (it would split a table cell).
  const escapeText = s => s.replace(/\\/g, '\\\\').replace(/([`*_<>\[\]#|~&])/g, '\\$1');
  const URLISH = /\b(?:https?:\/\/|mailto:)[^\s<>]+|\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
  const count = (s, c) => s.split(c).length - 1;
  const urlEnd = u => {
    while (true) {
      const t = u.replace(/[.,;:!?'"*_~]+$/, '');
      if (t !== u) u = t;
      else if (u.endsWith(')') && count(u, '(') < count(u, ')')) u = u.slice(0, -1);
      else return u;
    }
  };
  const escapeRaw = s => {
    let out = '', at = 0;
    for (const m of s.matchAll(URLISH)) {
      const u = urlEnd(m[0]);
      if (!u || u.includes('|') || m.index < at) continue;
      out += escapeText(s.slice(at, m.index)) + '<' + u + '>';
      at = m.index + u.length;
    }
    return (out + escapeText(s.slice(at))).replace(/^(\s*\d+)([.)])/, '$1\\$2').replace(/^(\s*)([-+=])/, '$1\\$2');
  };
  const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Lines shown as they arrived, in an HTML block the panel styles (docs/dataset.md: verbatim and demoted).
  // A whitespace-only line would end the HTML block, so it is written as a zero-width space.
  const htmlBlock = (cls, ls) => `<div class="${cls}">` + ls.map(l => /^[ \t]*$/.test(l) ? '&#8203;' : escapeHtml(l)).join('\n') + '</div>';

  function dedent(ls) {
    const c = minOf(ls.filter(l => l.trim()).map(indentOf), 0);
    return ls.map(l => l.slice(Math.min(c, indentOf(l))).trimEnd());
  }
  function fence(ls, lang = '') {
    const ticks = '`'.repeat(Math.max(3, maxOf(ls.map(l => maxOf((l.match(/`+/g) || []).map(m => m.length))) ) + 1));
    return ticks + lang + '\n' + ls.join('\n') + '\n' + ticks;
  }
  const tableMd = (rows, esc) => {
    const cols = maxOf(rows.map(r => r.length));
    const cell = c => esc(c || '');
    const line = r => '| ' + Array.from({ length: cols }, (_, k) => cell(r[k])).join(' | ') + ' |';
    return [line(rows[0]), '|' + ' --- |'.repeat(cols), ...rows.slice(1).map(line)].join('\n');
  };

  // Render one decided atom. Returns { markdown, lines: [{ type, cont }] } for its input lines.
  // `plain`: the same structure for the copy's text flavor, minus the escaping that exists only for the panel's parser
  // (a table cell still escapes `|`, which is the table's own structure).
  function render(type, c, geo, md, plain = false) {
    const inl = plain ? (t => t) : escapeRaw, esc = md ? (t => t) : inl;
    const all = (t, cont) => c.ls.map((_, k) => ({ type: t, cont: Boolean(cont && cont[k]) }));
    switch (type) {
      case 'verbatim': return { markdown: plain ? dedent(c.ls).join('\n') : htmlBlock('g-verbatim', dedent(c.ls)), lines: all('verbatim') };
      case 'code': return { markdown: fence(dedent(c.ls)), lines: all('code') };
      case 'diagram': return { markdown: fence(c.diagram.split('\n'), 'mermaid'), lines: all('diagram') };
      case 'rule': return { markdown: '---', lines: all('rule') };
      case 'table': {
        // every reading escapes its text; only the markdown-source reading hands syntax to the parser
        const kv = !c.grid && !c.pipe && c.kv, rows = kv ? kv.rows : c.grid || c.pipe;
        const cont = c.ls.map((_, k) => Boolean(kv && kv.contAt.includes(k)));
        return { markdown: tableMd(rows, plain ? (t => t.replace(/\|/g, '\\|')) : inl), lines: all('table', cont) };
      }
      case 'heading':
        const m = !geo.noMarkdown && c.f[0].mdHeading && c.ls[0].trim().match(/^(#{1,6})\s+(.*)$/);
        return { markdown: m ? m[1] + ' ' + esc(m[2]) : '### ' + esc(c.ls[0].trim()), lines: all('heading') };
      case 'quote': {
        if (md) return { markdown: dedent(c.ls).join('\n'), lines: all('quote') };
        // the quote marker comes off each source line before joining, never from inside the text
        const { logical, cont } = join(c.ls, c.idx, geo, undefined, t => t.replace(geo.hints.quote, ''));
        return { markdown: logical.map(t => '> ' + inl(t)).join('\n>\n'), lines: all('quote', cont) };
      }
      case 'list': {
        if (md) return { markdown: dedent(c.ls).join('\n'), lines: all('list') };
        const { cont } = join(c.ls, c.idx, geo, k => c.f[k].bullet);
        const levels = [...new Set(c.ls.filter((_, k) => c.f[k].bullet).map(indentOf))].sort((a, b) => a - b);
        const items = [];
        c.ls.forEach((l, j) => {
          const m = c.f[j].bullet && l.match(BULLET);
          if (m) {
            // bullet glyphs become "-", numbers stay; a letter marker stays in the text so nothing is lost
            const mk = m[2], rest = l.slice(m[0].length - 1).trim();
            items.push({ lvl: levels.indexOf(indentOf(l)), marker: /^\d/.test(mk) ? mk.replace(')', '.') : '-',
              text: inl(/^[a-zA-Z][.)]$/.test(mk) ? mk + ' ' + rest : rest) });
          } else if (items.length) items[items.length - 1].text += (cont[j] ? ' ' : '  \n') + inl(l.trim());
          else items.push({ lvl: 0, marker: '', text: inl(l.trim()) });
        });
        const lead = c.f.findIndex(x => x.bullet);   // lines before the first bullet are the list's lead-in text
        return { markdown: items.map(it => it.marker ? '   '.repeat(it.lvl) + it.marker + ' ' + it.text : it.text).join('\n'),
          lines: c.ls.map((_, k) => ({ type: k < lead ? 'para' : 'list', cont: Boolean(cont[k]) })) };
      }
      default: {   // para
        if (md) return { markdown: dedent(c.ls).join('\n'), lines: c.ls.map((_, k) => ({ type: 'para', cont: k > 0 })) };
        const { logical, cont } = join(c.ls, c.idx, geo);
        return { markdown: logical.map(inl).join('  \n'), lines: all('para', cont) };
      }
    }
  }

  // Invariant 1 (docs/engine-v2.md): every word of the input survives. Distinct letter/number runs, so markers a
  // reading rewrites on purpose (⏺, ▎, bullets, box lines, markdown syntax) never count.
  const plainOf = md => md.replace(/\\([\\`*_{}\[\]()#+\-.!|<>&~])/g, '$1');
  // With `renderText` (markdown -> the text a reader sees; the panel passes marked) the check runs on what is shown,
  // so text the markdown parser would eat counts as lost. Words are counted, so a dropped duplicate line is caught.
  const HTML_TAG = /<\/?(a|abbr|b|blockquote|br|code|del|details|div|em|h[1-6]|hr|i|img|ins|kbd|li|mark|ol|p|pre|q|s|small|span|strong|sub|summary|sup|table|tbody|td|th|thead|tr|u|ul)\b[^<>]*>/gi;   // [^<>]: a tag never spans another `<`, which keeps the scan linear
  const countWords = s => { const m = new Map(); for (const w of s.match(WORD) || []) m.set(w, (m.get(w) || 0) + 1); return m; };
  // Shown text, defined once for every caller: tags become spaces (a <br> or block boundary separates words), entities decode.
  // A link's destination and an image's source and alt text count as shown (they are the link, the image); comments are hidden whole, an unclosed one to the end.
  const shownText = (toHtml, md) => toHtml(md).replace(/<!--[^]*?(-->|$)/g, ' ').replace(/<a\s[^>]*?href="([^"]*)"[^>]*>/g, ' $1 ')
    .replace(/<img\s[^>]*>/g, t => ' ' + (t.match(/\s(?:src|alt)="[^"]*"/g) || []).map(a => a.replace(/^\s\w+="|"$/g, '')).join(' ') + ' ').replace(/<[^>]*>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');
  // `markup`: the markdown went to the parser as written, so an HTML element's tag in it is markup, not a needed word.
  function keepsWords(ls, markdown, toHtml, distinct, markup) {
    const have = countWords(toHtml ? shownText(toHtml, markdown) : plainOf(markdown));
    // not needed: list-marker numbers (shown as numbering) and a fence's one-word info string (it becomes the block's language; more words are text the parser drops, so they stay needed)
    // nor, in markup, an HTML element's tag; an unknown tag-like word (<name>) is text and stays needed
    const need = countWords(ls.map(l => l.replace(/^(\s*(?:>\s*)*)([-*+•◦▪‣]|\d{1,3}[.)])\s+/, '$1').replace(/^([ \t]*`{3,})[ \t]*[^`\s]*[ \t]*$/, '$1'))
      .map(l => markup ? l.replace(HTML_TAG, ' ') : l).join('\n'));
    for (const [w, n] of need) if ((have.get(w) || 0) < (distinct ? 1 : n)) return false;
    return true;
  }

  // ================================================================ entry
  async function formatLines(lines, opts) {
    const N = lines.length;
    const profile = profileFor(lines);
    // Claude Code's terminal strips real fences and all markdown syntax, so in text its profile claims (outside
    // fence-looking blocks) a ``` line, a `# comment` or a backtick in a command is content, never markdown.
    let fences = opts.noMarkdown ? [] : lexFences(lines);
    const inFence = new Array(N).fill(false);
    // terminal marks count everywhere v1 would see them: outside v1's closed fences
    const v1Hidden = opts.noMarkdown ? inFence : v1Fenced(lines);
    const terminalText = profileFor(lines.filter((_, i) => !v1Hidden[i])).name !== 'plain';
    fences.forEach(f => { for (let i = f.from; i <= f.to; i++) inFence[i] = true; });
    if (terminalText) { fences = []; inFence.fill(false); }
    const ui = lexUI(lines, profile).map((u, i) => u && !inFence[i]);
    const geo = geometry(lines, ui, profile);
    geo.terminalText = geo.terminal;
    geo.noMarkdown = Boolean(opts.noMarkdown);   // terminal evidence (profile marks, reply indent, box drawing): literal markdown is content
    const { body } = geo;
    const feats = features(body, profile.hints);
    const trace = lines.map(() => ({ type: 'blank', cont: false }));
    // Markdown evidence is v1's: a fence, a `#` heading, a pipe table, or any one inline span (bold, code, link) -
    // the terminal strips all of them, so outside terminal text one proves markdown.
    const mdStrong = fences.length > 0 || feats.some(x => x && (x.mdHeading || x.inline.length)) || pipeTable(lines.filter(l => /^[ \t]*\|/.test(l)));
    const md = !opts.noMarkdown && !terminalText && geo.cut === 0 && mdStrong;   // a wholly indented text is terminal evidence too (geometry)

    // atoms: fences, runs of terminal-UI lines, blank-line runs of content
    const atoms = [], fenceAt = new Map(fences.map(f => [f.from, f]));
    for (let i = 0; i < N;) {
      const f = fenceAt.get(i);
      if (f) { atoms.push({ kind: 'fence', idx: range(f.from, f.to), lang: f.lang }); i = f.to + 1; continue; }
      if (ui[i]) { const s = i; while (i < N && ui[i]) i++; atoms.push({ kind: 'ui', idx: range(s, i - 1) }); continue; }
      if (!feats[i]) { i++; continue; }
      const s = i;
      while (i < N && feats[i] && !ui[i] && !fenceAt.has(i)) i++;
      atoms.push({ kind: 'text', idx: range(s, i - 1) });
    }

    // Exact grids are parser-confirmed blocks: Lex carves each run of box lines that validates out of its atom.
    for (let k = 0; k < atoms.length; k++) {
      const a = atoms[k];
      if (a.kind !== 'text') continue;
      const box = i => feats[i].boxStart || /│.*│\s*$/.test(body[i]);
      const s0 = a.idx.findIndex(box);
      if (s0 < 0) continue;
      let e0 = s0;
      while (e0 + 1 < a.idx.length && box(a.idx[e0 + 1])) e0++;
      if ((s0 === 0 && e0 === a.idx.length - 1) || !gridTable(a.idx.slice(s0, e0 + 1).map(i => body[i]))) continue;
      const parts = [a.idx.slice(0, s0), a.idx.slice(s0, e0 + 1), a.idx.slice(e0 + 1)].filter(x => x.length);
      atoms.splice(k, 1, ...parts.map(idx => ({ kind: 'text', idx })));
    }

    // Diagrams span blank lines: a mermaid header atom absorbs the following text atoms the parser accepts with it.
    for (let k = 0; k < atoms.length; k++) {
      const a = atoms[k];
      if (a.kind !== 'text') continue;
      const h = feats[a.idx[0]].langTag && profile.hints.langTagLine ? 1 : 0;
      if (!(a.idx.length > h && feats[a.idx[h]].mermaid) || !opts.parseMermaid) continue;
      // One candidate merge: following atoms within the gap that look like diagram body (deeper than the header,
      // or `end`, mostly diagram statements). The parser decides: merged first, then the header atom alone.
      const headInd = indentOf(body[a.idx[h]]);
      let take = 0;
      while (k + take + 1 < atoms.length) {
        const n = atoms[k + take + 1], prevEnd = atoms[k + take].idx[atoms[k + take].idx.length - 1];
        const looks = n.kind === 'text' && n.idx[0] - prevEnd - 1 <= policy.mermaidGap &&
          n.idx.every(i => indentOf(body[i]) > headInd || /^\s*end\s*$/.test(body[i])) &&
          n.idx.filter(i => MERMAID_BODY.test(body[i])).length * 2 > n.idx.length;
        if (!looks) break;
        take++;
      }
      // Each candidate is tried as copied, then with its terminal wraps undone: a statement longer than the terminal
      // breaks mid-edge, which mermaid rejects. A wrap passes the greedy-wrap test and restarts shallower than the
      // line it broke from (the terminal's margin); a new statement keeps its indent.
      const unwrap = (ls, avail) => ls.reduce((o, l, k) => {
        if (k && ls[k - 1] && l.trim() && indentOf(l) < indentOf(ls[k - 1]) && isSoftWrap(ls[k - 1], l, avail)) o[o.length - 1] += ' ' + l.trim();
        else o.push(l);
        return o;
      }, []);
      // ... and with the glued rows Lex offered cut at the terminal width T, whose wraps are then undone against T
      const unglued = idx => idx.flatMap(i => {
        const cs = opts.rows && opts.rows.cuts[i] || [];
        return [0, ...cs].map((c, k) => lines[i].slice(c, cs[k])).filter((p, k) => !cs.length || p.trim());
      });
      cands: for (const t of take ? [take, 0] : [0]) {
        const idx = range(a.idx[0], atoms[k + t].idx[atoms[k + t].idx.length - 1]);
        const ls = idx.slice(h).map(i => body[i] || ''), cut = unglued(idx.slice(h));
        const vs = [ls, unwrap(ls, geo.avail)];
        if (cut.length > ls.length) vs.push(cut, unwrap(cut, opts.rows.T));
        for (const v of vs.filter((v, j) => j % 2 === 0 || v.length < vs[j - 1].length)) {   // an unwrap that joined nothing is a repeat
          const src = dedent(v).join('\n').replace(/\n{3,}/g, '\n\n');
          if (await opts.parseMermaid(src)) { atoms.splice(k, t + 1, { kind: 'diagram', idx, src }); break cands; }
        }
      }
    }

    // out: markdown for the panel; copy: the same blocks for the copy's text flavor (unescaped; demoted chrome verbatim)
    const out = [], copy = [], blocks = [];
    const emit = (idx, r, type, reasons, plain = r.markdown) => {
      idx.forEach((i, k) => { trace[i] = r.lines[k]; });
      out.push(r.markdown);
      copy.push(plain);
      blocks.push({ type, lines: [idx[0], idx[idx.length - 1]], reasons, idx });
    };
    const textAtoms = atoms.filter(a => a.kind === 'text').length;
    let textK = 0;
    for (const a of atoms) {
      if (a.kind === 'ui') {
        a.idx.forEach(i => { trace[i] = { type: 'chrome', cont: false, demoted: true }; });
        out.push(htmlBlock('g-demoted', a.idx.map(i => lines[i].trimEnd())));
        copy.push(a.idx.map(i => lines[i].trimEnd()).join('\n'));   // the copy keeps chrome as plain text, exactly as it arrived
        blocks.push({ type: 'chrome', lines: [a.idx[0], a.idx[a.idx.length - 1]], reasons: 'profile shape', idx: a.idx });
        continue;
      }
      if (a.kind === 'fence') {
        const type = a.lang === 'mermaid' ? 'diagram' : 'code';
        emit(a.idx, { markdown: a.idx.map(i => lines[i]).join('\n'), lines: a.idx.map(() => ({ type, cont: false })) }, type, 'fence');
        continue;
      }
      if (a.kind === 'diagram') {
        const c = { ls: a.idx.map(i => body[i] || ''), diagram: a.src };
        emit(a.idx, render('diagram', c, geo, false), 'diagram', 'mermaid parser');
        continue;
      }
      const last = ++textK === textAtoms;
      const k0 = atoms.indexOf(a), isList = x => x && x.kind === 'text' && feats[x.idx[0]].bullet;
      const alone = !last && !isList(atoms[k0 - 1]) && !isList(atoms[k0 + 1]);
      const mk = idx => Object.assign(context(idx, body, feats, geo, last && idx[idx.length - 1] === a.idx[a.idx.length - 1]), { alone });
      // Markdown reading: in text that carries strong markdown evidence, an atom with no terminal-only shapes
      // (box drawing, the ▎ quote bar) is already in its best form. Its own syntax is the exact inversion:
      // render the source; the panel's markdown parser draws it. Trace types come from that syntax.
      const srcLines = a.idx.map(i => lines[i].slice(Math.min(geo.cut, indentOf(lines[i]))));
      if (md && !a.idx.some(i => feats[i].boxStart || feats[i].quoteBar) && keepsWords(srcLines, srcLines.join('\n'), opts.blockHtml, false, true)) {
        let prev = null;
        const lt = a.idx.map(i => {
          const x = feats[i];
          const t = x.mdHeading ? 'heading' : x.mdPipe ? 'table' : x.bullet ? 'list' : x.quote ? 'quote' : x.rule ? 'rule' : prev && prev !== 'heading' && prev !== 'table' && prev !== 'rule' ? prev : 'para';
          const r = { type: t, cont: t === prev && !x.bullet && (t === 'para' || t === 'list' || t === 'quote') };
          prev = t;
          return r;
        });
        // the original lines, trailing spaces included: two of them are a markdown hard break
        emit(a.idx, { markdown: srcLines.join('\n'), lines: lt }, lt[0].type, 'markdown source');
        continue;
      }
      for (const idx of cutAtom(a.idx, mk)) {
        const c = mk(idx);
        const { options, p } = decide(c);
        // Invariant 1: a render that loses a word is disqualified; the next-lowest-risk reading takes over.
        // Invariant 2: a drawn line keeps its column, so only structure readings (monospace) are options for its part
        // (adjacent code parts merge back below, so a pointer rejoins the code it points at).
        const drawn = c.f.some(x => x.drawn);
        let done = false;
        for (const o of options) {
          if (drawn && !STRUCT.has(o.type)) continue;
          const r = render(o.type, c, geo, false);
          if (!keepsWords(c.ls, r.markdown, opts.blockHtml, o.type === 'table' && !c.grid && !c.pipe)) continue;   // a Label: table states each label once
          emit(idx, r, o.type, { p, risk: o.er }, render(o.type, c, geo, false, true).markdown);
          done = true;
          break;
        }
        if (!done) emit(idx, render('verbatim', c, geo, false), 'verbatim', 'every reading lost a word', render('verbatim', c, geo, false, true).markdown);
      }
    }

    // Code that spans a blank line: adjacent code blocks merge back into one, keeping the blank lines.
    // Runs are found first and each is fenced once, so the merge stays linear.
    const mergeable = (a, b) => a.type === 'code' && b.type === 'code' && a.reasons !== 'fence' && b.reasons !== 'fence' &&
      b.lines[0] - a.lines[1] - 1 <= policy.mermaidGap;
    for (let k = 0; k < blocks.length; k++) {
      let e = k;
      while (e + 1 < blocks.length && mergeable(blocks[e], blocks[e + 1])) e++;
      if (e === k) continue;
      const idx = range(blocks[k].lines[0], blocks[e].lines[1]);
      out.splice(k, e - k + 1, fence(dedent(idx.map(i => body[i] == null ? '' : body[i]))));
      copy.splice(k, e - k + 1, out[k]);
      idx.forEach(i => { trace[i] = { type: 'code', cont: false }; });
      blocks.splice(k, e - k + 1, { type: 'code', lines: [blocks[k].lines[0], blocks[e].lines[1]], reasons: 'merged across blank lines', idx });
    }
    // In markdown text, blocks that touched in the source still touch: the separator follows the source.
    const sep = out.map((m, k) => k === 0 ? '' : md && blocks[k].lines[0] === blocks[k - 1].lines[1] + 1 && !/^<div/.test(m) && !/^<div/.test(out[k - 1]) ? '\n' : '\n\n');
    const markdown = out.map((m, k) => sep[k] + m).join('');
    const plain = copy.map((m, k) => m == null ? '' : sep[k] + m).join('').replace(/\n{3,}/g, '\n\n').trim();
    // `parsed`: some block handed its own syntax to the parser (markdown source or a fence); otherwise every character
    // was escaped by construction and the per-block checks already cover every word
    const parsed = blocks.some(b => b.reasons === 'markdown source' || b.reasons === 'fence');
    return { markdown, copy: plain, lines: trace, parsed, trace: blocks.map(({ type, lines, reasons }) => ({ type, lines, reasons })) };
  }
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k);

  async function format(text, opts = {}) {
    const input = String(text).replace(/\r\n?/g, '\n').split('\n');
    // glued rows: cut only where every cut is exact
    const { lines, origin, rows } = unglue(input, input.map((_, i) => i), profileFor(input));
    if (rows) opts = Object.assign({}, opts, { rows });
    let res;
    try {
      res = await formatLines(lines, opts);
      // Invariant 1 on the whole document: a block can swallow its neighbours (an unclosed `<!--`, a fence that never
      // closes). If any shown word is missing, render again with markdown off - every character escaped, nothing parsed.
      // demoted lines sit in their own HTML block; a diagram's bare tag line became its fence language (both consumed on purpose)
      const content = r => lines.filter((l, i) => !(r.lines[i] && (r.lines[i].demoted || r.lines[i].type === 'diagram' && /^\s*(⏺\s+)?mermaid\s*$/.test(l))));
      // Blocks are first checked on their source words (cheap); only if the document fails are they re-checked as
      // rendered, which picks a safer reading per block; markdown off is the last resort.
      const shown = r => keepsWords(content(r), r.markdown.replace(/<div class="g-demoted">[^]*?<\/div>/g, ''), opts.toHtml, true, true);   // distinct, as the scorer counts
      if (opts.toHtml && res.parsed && !shown(res)) {
        res = await formatLines(lines, Object.assign({}, opts, { blockHtml: opts.toHtml }));
        if (!shown(res)) res = await formatLines(lines, Object.assign({}, opts, { blockHtml: opts.toHtml, noMarkdown: true }));
      }
    }
    catch (e) {   // never a broken render: the floor is the original text
      res = { markdown: htmlBlock('g-verbatim', lines), copy: lines.join('\n'), lines: lines.map(() => ({ type: 'verbatim', cont: false })), trace: [{ type: 'verbatim', reasons: String(e) }] };
    }
    delete res.parsed;
    if (lines.length === input.length) return res;
    const trace = input.map(() => null);   // map split lines back to their input line
    origin.forEach((o, k) => { if (!trace[o]) trace[o] = res.lines[k]; });
    return { markdown: res.markdown, copy: res.copy, lines: trace.map(t => t || { type: 'blank', cont: false }), trace: res.trace };
  }

  const api = { format, width, policy };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.GlimpseFormat = api;
})();
