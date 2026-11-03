
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
