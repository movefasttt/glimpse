
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
