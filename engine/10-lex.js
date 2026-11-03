
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
