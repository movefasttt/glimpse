// Markdown -> block list in the dataset spec's vocabulary (docs/dataset.md "Sample schema").
// One block per heading / paragraph / list item (nested items are their own blocks, pre-order) /
// blockquote / table / code / diagram (```mermaid code) / rule.
import { marked } from 'marked';

const ws = s => s.replace(/\s+/g, ' ').trim();

// Inline tokens -> the text the terminal shows: syntax markers gone, link URLs gone.
export function plainText(tokens) {
  if (!tokens) return '';
  let out = '';
  for (const t of tokens) {
    switch (t.type) {
      case 'text': out += t.tokens ? plainText(t.tokens) : t.text; break;
      case 'escape': case 'codespan': out += t.text; break;
      case 'br': out += ' '; break;
      case 'image': out += t.text || ''; break;
      case 'html': out += t.raw; break;
      case 'checkbox': break;
      default:
        if (t.tokens) out += plainText(t.tokens);
        else if (typeof t.text === 'string') out += t.text;
    }
  }
  return out;
}

// Spec normalization for code/diagram: lines joined by \n, common indent removed, trailing spaces trimmed.
// Leading/trailing blank lines are dropped too (both sides get the same treatment, so this only adds tolerance).
export function normCode(text) {
  let lines = text.replace(/\r\n/g, '\n').split('\n').map(l => l.replace(/[ \t]+$/, ''));
  while (lines.length && lines[0] === '') lines.shift();
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  const ind = lines.filter(l => l !== '').map(l => l.match(/^[ \t]*/)[0].length);
  const cut = ind.length ? Math.min(...ind) : 0;
  return lines.map(l => l.slice(cut)).join('\n');
}
export const normText = s => ws(s || '');
export const normRows = rows => (rows || []).map(r => r.map(c => ws(String(c))));

// Canonical form used for equality between truth and predicted blocks (applied to both sides).
export function blockKey(b) {
  if (b.type === 'table') return 'table\u0000' + JSON.stringify(normRows(b.rows));
  if (b.type === 'code' || b.type === 'diagram') return b.type + '\u0000' + normCode(b.text || '');
  if (b.type === 'rule') return 'rule';
  return b.type + '\u0000' + normText(b.text);
}

function listItems(list, out) {
  for (const item of list.items) {
    const own = [], after = [];
    for (const t of item.tokens || []) {
      if (t.type === 'list') after.push(() => listItems(t, out));
      else if (t.type === 'code' || t.type === 'table' || t.type === 'blockquote' || t.type === 'heading')
        after.push(() => blockTokens([t], out));
      else own.push(t.tokens ? plainText(t.tokens) : (t.text || ''));
    }
    out.push({ type: 'list', text: normText(own.join(' ')) });
    after.forEach(f => f());
  }
}

function blockTokens(tokens, out) {
  for (const t of tokens) {
    switch (t.type) {
      case 'heading': out.push({ type: 'heading', text: normText(plainText(t.tokens)) }); break;
      case 'paragraph': out.push({ type: 'para', text: normText(plainText(t.tokens)) }); break;
      case 'text': out.push({ type: 'para', text: normText(t.tokens ? plainText(t.tokens) : t.text) }); break;
      case 'html': if (t.text.trim()) out.push({ type: 'para', text: normText(t.text) }); break;
      case 'list': listItems(t, out); break;
      case 'blockquote': {
        const inner = [];
        blockTokens(t.tokens, inner);
        out.push({ type: 'quote', text: normText(inner.map(b => b.text || (b.rows || []).flat().join(' ')).join(' ')) });
        break;
      }
      case 'table':
        out.push({ type: 'table', rows: [t.header.map(c => normText(plainText(c.tokens))),
          ...t.rows.map(r => r.map(c => normText(plainText(c.tokens))))] });
        break;
      case 'code': {
        const lang = (t.lang || '').trim().split(/\s+/)[0].toLowerCase();
        out.push({ type: lang === 'mermaid' ? 'diagram' : 'code', text: normCode(t.text) });
        break;
      }
      case 'hr': out.push({ type: 'rule', text: '' }); break;
      default: break; // space, def
    }
  }
  return out;
}

export function lexBlocks(markdown) {
  return blockTokens(marked.lexer(markdown || '', { gfm: true, breaks: false }), []);
}

// Max number of in-order exact matches (LCS) between truth and predicted blocks.
// Returns the matched truth indices.
export function alignBlocks(truth, pred) {
  const a = truth.map(blockKey), b = pred.map(blockKey);
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const matched = new Set();
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { matched.add(i); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return matched;
}
