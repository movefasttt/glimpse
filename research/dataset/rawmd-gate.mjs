#!/usr/bin/env node
// Raw-markdown gate (docs/engine-v2.md "Gates": block AND inline tokens identical). Parameterized copy of rawmd-check.mjs.
//
//   node rawmd-gate.mjs [formatter.js] [show N]
//
// Input: every assistant text reply >= 200 chars in the sessions.json transcripts (what Claude Code's /copy gives).
// A reply passes when marked's token tree of the formatter's markdown equals the input's:
//   block  = top-level token types (+ code lang), as in rawmd-check.mjs;
//   inline = the full nested tree: every token's type (+ code lang, heading depth, list ordered) and its children
//            (tokens, list items, table header/rows cells). Adjacent text/escape tokens merge into one `text`, so
//            escaping a character that renders the same (`a\_b` for `a_b`) is not a change; reading `**x**` as
//            literal text, or `Vec<String>` as an html token, is.
import { toHtml, renderText } from './score.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { marked } from 'marked';
import { makeParseMermaid } from './lib/mermaid-node.mjs';
import { loadFormatter } from './score.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const blockShape = md => marked.lexer(md).filter(t => t.type !== 'space').map(t => t.type + (t.type === 'code' ? ':' + (t.lang || '') : '')).join(' ');

function tree(tokens) {
  const out = [];
  for (const t of tokens || []) {
    if (t.type === 'space') continue;
    if (t.type === 'text' && t.tokens) { out.push(...tree(t.tokens)); continue; }   // block-level text wrapper (tight list item)
    if (t.type === 'text' || t.type === 'escape') {
      if (out[out.length - 1] === 'text') continue;
      out.push('text'); continue;
    }
    let head = t.type;
    if (t.type === 'code') head += ':' + (t.lang || '');
    if (t.type === 'heading') head += ':' + t.depth;
    if (t.type === 'list') head += ':' + (t.ordered ? 'ol' : 'ul');
    const kids = [];
    if (t.tokens) kids.push(tree(t.tokens));
    if (t.items) kids.push(...t.items.map(i => tree(i.tokens)));
    if (t.header) kids.push(t.header.map(c => tree(c.tokens)));
    if (t.rows) kids.push(...t.rows.map(r => r.map(c => tree(c.tokens))));
    out.push(kids.length ? [head, kids] : head);
  }
  return out;
}
const inlineShape = md => JSON.stringify(tree(marked.lexer(md)));

export function rawReplies() {
  const sessions = JSON.parse(fs.readFileSync(path.join(HERE, 'sessions.json'), 'utf8'));
  const texts = [];
  for (const s of sessions) for (const line of fs.readFileSync(s.file, 'utf8').split('\n')) {
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.type !== 'assistant' || o.isSidechain) continue;
    for (const c of o.message?.content || []) if (c?.type === 'text' && c.text.length >= 200) texts.push(c.text);
  }
  return texts;
}

export async function rawmdGate(formatterPath, { parseMermaid, texts } = {}) {
  const format = await loadFormatter(formatterPath);
  parseMermaid ??= await makeParseMermaid();
  texts ??= rawReplies();
  let blockSame = 0, bothSame = 0, errors = 0;
  const bad = [], outs = [];
  for (const text of texts) {
    let r;
    outs.push(null);
    try { r = await format(text, { parseMermaid, toHtml }); } catch (e) { errors++; bad.push({ why: 'THREW ' + String(e).slice(0, 80), text }); continue; }
    outs[outs.length - 1] = r.markdown;
    if (!r || !Array.isArray(r.lines) || r.lines.length !== text.split('\n').length) { bad.push({ why: 'LEN', text }); continue; }
    const b = blockShape(text) === blockShape(r.markdown);
    const i = b && inlineShape(text) === inlineShape(r.markdown);
    if (b) blockSame++;
    if (i) bothSame++;
    else bad.push({ why: b ? 'inline' : 'block', in: b ? inlineShape(text) : blockShape(text), out: b ? inlineShape(r.markdown) : blockShape(r.markdown), text });
  }
  const n = texts.length;
  return { n, blockSame, bothSame, errors, blockPct: (100 * blockSame) / n, bothPct: (100 * bothSame) / n, bad, outs };
}

// The gate (docs/engine-v2.md, 2026-10-13): against the baseline, a candidate reply may not show fewer of any word, and
// where the baseline kept the source's block structure the candidate keeps it too. Identity is reported, not gated:
// the parser eating a `<placeholder>` or reading `~121s (~77s` as strikethrough is identical tokens and lost text.
const WORDS = s => { const m = new Map(); for (const w of s.match(/[\p{L}\p{N}]+/gu) || []) m.set(w, (m.get(w) || 0) + 1); return m; };
export function rawmdLoss(texts, base, cand) {
  const worse = [];
  texts.forEach((text, k) => {
    if (cand.outs[k] == null) { worse.push({ k, why: 'threw' }); return; }
    if (base.outs[k] == null) return;
    const b = WORDS(renderText(base.outs[k])), c = WORDS(renderText(cand.outs[k]));
    const lost = [...b].filter(([w, n]) => (c.get(w) || 0) < n).map(([w]) => w);
    const src = blockShape(text), structure = blockShape(base.outs[k]) === src && blockShape(cand.outs[k]) !== src;
    if (lost.length || structure) worse.push({ k, why: [lost.length && 'words ' + lost.slice(0, 5).join(' '), structure && 'blocks ' + src + ' -> ' + blockShape(cand.outs[k])].filter(Boolean).join('; ') });
  });
  return worse;
}

// First differing position of two shape strings, with context, for the report.
export function firstDiff(a, b, ctx = 50) {
  let k = 0;
  while (k < a.length && a[k] === b[k]) k++;
  return { in: a.slice(Math.max(0, k - 10), k + ctx), out: b.slice(Math.max(0, k - 10), k + ctx) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const fmt = process.argv[2] || path.join(HERE, '../../format.js');
  const r = await rawmdGate(fmt);
  console.log(`${path.basename(fmt)}: raw replies ${r.n}, block identical ${r.blockSame} (${r.blockPct.toFixed(1)}%), block+inline identical ${r.bothSame} (${r.bothPct.toFixed(1)}%), threw ${r.errors}`);
  for (const x of r.bad.slice(0, +(process.argv[3] || 6))) {
    const d = x.in ? firstDiff(x.in, x.out) : {};
    console.log(`  [${x.why}] in : ${d.in ?? ''}\n  ${' '.repeat(x.why.length + 2)} out: ${d.out ?? ''}`);
  }
}
