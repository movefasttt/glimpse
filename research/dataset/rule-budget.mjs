#!/usr/bin/env node
// Rule budget (docs/engine-v2.md "Gates": named weights and thresholds, counted the same way for v1 and v2).
//
//   node rule-budget.mjs <formatter.js> [audit.txt]
//
// A formatter that exports `policy` (engine v2: the object from engine/policy.js) is counted as the numeric leaves of
// that object. Otherwise its source is counted by the literal method below and the per-literal list is written for audit.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const acorn = require('acorn');
const walk = require('acorn-walk');

export const METHOD = `Counting method (v1 literal method): every numeric literal occurrence in the formatter source that acts
as a weight or threshold, counted once per occurrence (the same value used in two places is two decisions).
Source is parsed with acorn (comments and string contents are never counted). EXCLUDED:
  1. the values 0 and 1, including their negations (-1): identities, sentinels, off-by-one adjustments;
  2. array / string indices: a literal that is the computed property of a member access (m[1], top[0]);
  3. character codes and unicode ranges: hex literals (0x1100 ...), every literal inside charWidth() (the terminal
     double-width table and its return value 2), and a literal compared with a charWidth(...) result (=== 2);
  4. regex quantifiers ({3,}, {8,}, {1,2} ...): regex literals are not numeric literals; their count is listed below
     for information only, not added to the budget;
  5. string-syntax offsets: a literal (or negated literal) passed directly to .slice(), which cuts known markdown
     syntax off a string (slice(3) after a \`\`\` fence, slice(0, -4) before "\\n\`\`\`"); window arithmetic such as
     slice(i - 2, i + 3) is an expression, not a direct argument, so its literals ARE counted.`;

const numericLeaves = (o, seen = new Set()) => {
  if (typeof o === 'number') return 1;
  if (!o || typeof o !== 'object' || seen.has(o)) return 0;
  seen.add(o);
  return Object.values(o).reduce((a, v) => a + numericLeaves(v, seen), 0);
};
const numericLeafValues = (o, out = [], seen = new Set()) => {
  if (typeof o === 'number') out.push(o);
  else if (o && typeof o === 'object' && !seen.has(o)) { seen.add(o); Object.values(o).forEach(v => numericLeafValues(v, out, seen)); }
  return out;
};

export function countLiterals(src) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', locations: true, allowReturnOutsideFunction: true });
  const lines = src.split('\n');
  const counted = [], excluded = {};
  const ex = why => { excluded[why] = (excluded[why] || 0) + 1; };
  let quantifiers = 0;
  const isCharWidthCall = n => n && n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'charWidth';
  walk.ancestor(ast, {
    Literal(n, _s, anc) {
      if (n.regex) { quantifiers += (n.regex.pattern.match(/\{\d+(,\d*)?\}/g) || []).length; return; }
      if (typeof n.value !== 'number') return;
      const p = anc[anc.length - 2];
      const gp = anc[anc.length - 3];
      const neg = p.type === 'UnaryExpression' && p.operator === '-';
      const host = neg ? gp : p;   // node that uses the (possibly negated) literal
      if (n.value === 0 || n.value === 1) return ex('0 / 1');
      if (p.type === 'MemberExpression' && p.computed && p.property === n) return ex('index');
      if (/^0x/i.test(n.raw)) return ex('char code (hex)');
      if (anc.some(a => a.type === 'FunctionDeclaration' && a.id?.name === 'charWidth')) return ex('char code (charWidth)');
      if (host.type === 'BinaryExpression' && (isCharWidthCall(host.left) || isCharWidthCall(host.right))) return ex('char code (charWidth)');
      if (host.type === 'CallExpression' && host.callee.type === 'MemberExpression' && host.callee.property.name === 'slice' && host.arguments.includes(neg ? p : n)) return ex('slice offset');
      counted.push({ line: n.loc.start.line, value: (neg ? '-' : '') + n.raw, code: lines[n.loc.start.line - 1].trim() });
    },
  });
  return { count: counted.length, counted, excluded, quantifiers };
}

// -> { count, method, detail, audit? }
export async function ruleBudget(formatterPath) {
  const file = path.resolve(formatterPath);
  let mod = null;
  try { mod = await import(pathToFileURL(file).href); } catch { /* counted from source below */ }
  const policy = mod?.policy ?? mod?.default?.policy;
  if (policy && typeof policy === 'object') {
    const vals = numericLeafValues(policy);
    return { count: numericLeaves(policy), method: 'numeric leaves of exported policy', detail: `${vals.filter(v => v !== 0 && v !== 1).length} excluding 0/1 values` };
  }
  const r = countLiterals(fs.readFileSync(file, 'utf8'));
  const audit = [
    `# Rule budget audit: ${path.basename(file)} (${new Date().toISOString().slice(0, 10)})`, '', METHOD, '',
    `Excluded occurrences: ${Object.entries(r.excluded).map(([k, v]) => `${k} ${v}`).join(', ')}. Regex quantifiers (info, not counted): ${r.quantifiers}.`,
    `COUNTED: ${r.count}`, '', 'line  value  code',
    ...r.counted.map(c => `${String(c.line).padStart(4)}  ${c.value.padEnd(5)}  ${c.code.slice(0, 120)}`), '',
  ].join('\n');
  return { count: r.count, method: 'v1 literal method (no exported policy)', detail: `excluded ${JSON.stringify(r.excluded)}, regex quantifiers ${r.quantifiers} (info)`, audit };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const r = await ruleBudget(process.argv[2] || '../../format.js');
  console.log(`${r.count}  (${r.method}; ${r.detail})`);
  if (r.audit && process.argv[3]) { fs.writeFileSync(process.argv[3], r.audit); console.log(`audit: ${process.argv[3]}`); }
}
