
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
