
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
