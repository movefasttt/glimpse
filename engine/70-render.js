
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
