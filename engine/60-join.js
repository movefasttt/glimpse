
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
