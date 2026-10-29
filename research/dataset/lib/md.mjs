// Markdown reply -> blocks (spec schema) + segments (one per source logical line, as the terminal shows it).
// A segment is the unit of soft-wrap: every screen line inside a segment after its first is a continuation.
import { Marked } from 'marked';

// Claude Code does not treat single tildes as strikethrough ("~62M" stays literal), so neither do we:
// only ~~x~~ is a del token. Returning undefined (not false) stops marked from falling back to its own rule.
const marked = new Marked({
  tokenizer: {
    del(src) {
      const m = /^~~(?=\S)([\s\S]*?\S)~~(?!~)/.exec(src);
      if (m) return { type: 'del', raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) };
      return undefined;
    },
  },
});

export const norm = (s) => s.replace(/\s+/g, ' ').trim();
export const key = (s) => s.replace(/\s+/g, '');

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENT[m]);

// Visible inline text, the way Claude Code's terminal shows it: markers gone, link URLs gone, newlines kept.
export function inline(tokens) {
  let out = '';
  for (const t of tokens || []) {
    switch (t.type) {
      case 'text': out += t.tokens ? inline(t.tokens) : decode(t.text); break;
      case 'strong': case 'em': case 'del': case 'link': out += inline(t.tokens); break;
      case 'codespan': out += decode(t.text); break;
      case 'escape': out += t.text; break;
      case 'br': out += '\n'; break;
      case 'image': out += `${t.text || ''} (${t.href})`; break; // Claude Code shows "alt (src)"
      case 'html': out += t.text; break;
      case 'checkbox': break;
      default: out += t.text ?? t.raw ?? '';
    }
  }
  return out;
}

export function parseReply(md) {
  const blocks = []; // {type, text?|rows?}
  const segs = [];   // {block, type, kind, text}
  const addBlock = (b) => (blocks.push(b), blocks.length - 1);
  const flow = (type, text, blockExtra = {}) => {
    const lines = text.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim());
    if (!lines.length) return;
    const b = addBlock({ type, text: norm(lines.join(' ')) });
    let bko = 0; // offset of this segment's key within the block's key (non-whitespace chars)
    lines.forEach((l, i) => { segs.push({ block: b, type, kind: 'flow', text: l, first: i === 0, li: !!blockExtra.li && i === 0, bko }); bko += key(l).length; });
  };

  let nested = false;
  const walk = (tokens, ctx) => {
    for (const t of tokens) {
      switch (t.type) {
        case 'space': case 'def': break;
        case 'heading': flow(ctx.quote ? 'quote' : 'heading', inline(t.tokens)); break;
        case 'paragraph': flow(ctx.quote ? 'quote' : ctx.item ? 'list' : 'para', inline(t.tokens)); break;
        case 'text': flow(ctx.quote ? 'quote' : ctx.item ? 'list' : 'para', t.tokens ? inline(t.tokens) : decode(t.text)); break;
        case 'html': flow(ctx.quote ? 'quote' : 'para', t.text); break;
        case 'hr': {
          const b = addBlock({ type: 'rule', text: '' });
          segs.push({ block: b, type: 'rule', kind: 'rule', text: '---', first: true });
          break;
        }
        case 'blockquote': walk(t.tokens, { ...ctx, quote: true }); break;
        case 'list':
          if (ctx.item) nested = true;
          for (const it of t.items) {
            // the item's own text (first text/paragraph tokens) is one block; nested lists etc. are their own blocks
            let own = '';
            const rest = [];
            let seenOther = false;
            for (const c of it.tokens) {
              if (!seenOther && (c.type === 'text' || c.type === 'paragraph')) own += (own ? '\n' : '') + (c.tokens ? inline(c.tokens) : decode(c.text));
              else if (c.type === 'space' && !seenOther) continue;
              else { seenOther = true; rest.push(c); }
            }
            if (it.task) own = (it.checked ? '[x] ' : '[ ] ') + own;
            flow(ctx.quote ? 'quote' : 'list', own, { li: true });
            walk(rest, { ...ctx, item: true });
          }
          break;
        case 'code': {
          const lang = (t.lang || '').trim().split(/\s+/)[0].toLowerCase();
          const type = lang === 'mermaid' ? 'diagram' : 'code';
          const b = addBlock({ type, text: null }); // text filled from the screen (verbatim, tabs expanded)
          if (type === 'diagram') segs.push({ block: b, type, kind: 'label', text: 'mermaid', first: true });
          const lines = t.text.split('\n');
          lines.forEach((l, i) => segs.push({ block: b, type, kind: 'code', text: l, first: type === 'code' && i === 0 }));
          break;
        }
        case 'table': {
          const rows = [t.header.map((c) => norm(inline(c.tokens))), ...t.rows.map((r) => r.map((c) => norm(inline(c.tokens))))];
          const b = addBlock({ type: 'table', rows });
          // Claude Code draws a box table when it fits, else one "Header: value" line per cell, rows split by ────
          const vertical = [];
          rows.slice(1).forEach((r, ri) => {
            if (ri > 0) vertical.push({ block: b, type: 'table', kind: 'tsep', text: '', first: false });
            r.forEach((v, ci) => vertical.push({ block: b, type: 'table', kind: 'tcell', text: rows[0][ci] ? `${rows[0][ci]}: ${v}` : v, first: ri === 0 && ci === 0, row: ri + 1 }));
          });
          segs.push({ block: b, type: 'table', kind: 'table', text: rows.flat().join(''), first: true, vertical });
          break;
        }
        default:
          if (t.tokens) walk(t.tokens, ctx); else if (t.text) flow('para', t.text);
      }
    }
  };
  walk(marked.lexer(md), {});
  return { blocks, segs, nested };
}
