// Parameterized copy of research/other/adversarial.mjs (cases unchanged): node adversarial-gate.mjs [formatter.js]
// Regression checks from the 2026-10-13 cold review: no text loss, no hangs.
import { toHtml } from './score.mjs';
import path from 'node:path';
import { loadFormatter } from './score.mjs';
const format = await loadFormatter(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), '../../format.js'));
const cases = [
  ['one-word reply kept', '⏺ Done.\n  format.js now gates joins\n  main.swift unchanged', ['Done', 'gates joins', 'main.swift unchanged']],
  ['list after one-word reply kept', '⏺ Summary\n  - first item\n  - second item\n\n  Closing note.', ['Summary', 'first item', 'second item', 'Closing note']],
  ['"model ..." text kept (plain)', 'Results:\nmodel accuracy improved to 94% after retraining\nauto mode was disabled for the test', ['model accuracy', 'auto mode was disabled']],
  ['"model ..." text kept (indented)', '  We retrained overnight.\n  model weights saved to gs://bucket/run-7\n  Next we evaluate.', ['model weights saved']],
  ['padded longest line kept', 'This is the longest line of the pasted note, ending in spaces   \nsecond line', ['longest line of the pasted note', 'second line']],
  ['powerline glyph in text kept', 'Status  branch is main and the text continues', ['branch is main']],
  ['entities stay literal', 'Escape it as &amp; and &lt;div&gt; in HTML.', ['&amp;', '&lt;div&gt;']],
  ['prose with box chars not chopped', 'Legend: ├ marks a start ┤ and │ marks the middle of the tree in this long description of the layout', ['marks a start', 'marks the middle of the tree']],
];
let fail = 0;
const plain = md => md.replace(/\\(.)/g, '$1');
for (const [name, input, must] of cases) {
  const r = await format(input, { toHtml });
  const miss = must.filter(m => !plain(r.markdown).includes(m));
  if (miss.length || r.lines.length !== input.split('\n').length) { fail++; console.log('FAIL', name, '| missing:', miss, '| out:', JSON.stringify(r.markdown)); }
  else console.log('ok  ', name);
}
// Round-4 cold review: raw HTML reaches the parser only where v1 also parsed the text as markdown.
const live = /<img|<script|href="javascript:/i;
for (const [name, input] of [
  ['strikethrough is not markdown evidence', '~~old~~ text\n~~older~~ <img src=x onerror=alert(1)>'],
  ['indented # is not a heading', '  # foo\nbar <img src=x onerror=alert(1)>'],
  ['unclosed fence keeps terminal evidence', '**a** `b` <img src=x onerror=alert(1)>\n```\n⏺ foo'],
  ['unclosed fence keeps terminal evidence (link)', '**a** `b` [x](javascript:alert(1))\n```\n⏺ foo'],
  ['escaped tag inside an emphasis span (round 6)', 'We expect the parser to show *the \\<img src=x onerror=alert(1)> tag* in this reply, and that is the whole point of the test.'],
  ['escaped tag inside a bold span (round 6)', 'Show **the \\<img src=x onerror=alert(1)> tag** here.'],
  ['escaped tag inside a link label (round 6)', 'See [the \\<img src=x onerror=alert(1)> tag](http://example.com) now.'],
  ['4-backtick close does not hide terminal marks (round 7)', '**bold** <img src=x onerror=alert(1)>\n```\n⏺ hi\n````'],
  ['tilde fence is not markdown evidence (v1)', 'Config notes\n\n~~~\nkey = value\n~~~\n\nSet <img src=x onerror=alert(1)> then reload.'],
  ['NBSP heading is not markdown evidence (v1)', '#\u00a0Notes\nSet <img src=x onerror=alert(1)>'],
]) {
  const r = await format(input, { toHtml });
  if (live.test(toHtml(r.markdown))) { fail++; console.log('FAIL', name, '| out:', JSON.stringify(r.markdown)); } else console.log('ok  ', name);
}
// Round-5 cold review: a `~~~ text` line keeps its words; a pointer under code stays in the code block, in its column;
// a long run of blank-separated code lines merges in linear time.
for (const [name, input, must] of [
  ['tilde line keeps its words', 'Status\n~~~ waiting on review from the team\nnext: merge', ['waiting on review from the team', 'next: merge']],
  ['tilde line in markdown keeps its words', 'See **below**.\n\n~~~ section two ~~~\n\nMore `text` here.', ['section two', 'More']],
]) {
  const r = await format(input, { toHtml }), shown = toHtml(r.markdown).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const miss = must.filter(m => !shown.includes(m));
  if (miss.length) fail++; console.log(miss.length ? 'FAIL' : 'ok  ', name, miss.length ? JSON.stringify(r.markdown) : '');
}
{
  const r = await format('⏺ X\n\n  result = fetch(url, timeout=5)\n                      └── seconds, not ms', { toHtml });
  const ok = /```\nresult = fetch\(url, timeout=5\)\n {20}└── seconds, not ms\n```/.test(r.markdown);
  if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', 'pointer under code stays in the code block', ok ? '' : JSON.stringify(r.markdown));
}
for (const [name, input, re] of [
  ['caret under code stays code, in its column (round 6)', 'Traceback (most recent call last):\n  File "a.py", line 1, in <module>\n    print(1/0)\n          ~^~\nZeroDivisionError: division by zero', /```\n[^]*\n {6,}~\^~\n/],
  ['emphasis-only plain text stays literal, as in v1 (round 6)', 'see the *important* note here', /\\\*important\\\*/],
]) {
  const r = await format(input, { toHtml }), ok = re.test(r.markdown);
  if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : JSON.stringify(r.markdown));
}
{
  const t = Array.from({ length: 3000 }, (_, i) => `x${i} = foo(${i});`).join('\n\n'), t0 = Date.now();
  await format(t, { toHtml }); const ms = Date.now() - t0;
  if (ms >= 300) fail++; console.log(ms < 300 ? 'ok  ' : 'FAIL', `3k blank-separated code lines: ${ms} ms`);
}
// Glued box rows (a terminal copy joins a full-width row with the next): restored to a table from any source,
// with the terminal width read from the glue - copy trims the padding, so no line is T wide.
{
  // a bare selection (no Claude Code marks), every row glued, padding to the terminal width trimmed by the copy
  const rows = ['├──────┼────────┤', '│ 1234 │ open   │', '├──────┼────────┤', '│ 5678 │ merged │', '├──────┼────────┤', '│ 9012 │ draft  │', '└──────┴────────┘'];
  const T = 40, glued = rows.map(r => (' ' + r).padEnd(T)).join('').trimEnd();
  const r = await format(glued + '\nnext line', { toHtml }), html = toHtml(r.markdown);
  const ok = /<table>/.test(html) && /merged/.test(html) && (html.match(/<tr>/g) || []).length === 3;
  if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', 'glued box rows become a table', ok ? '' : JSON.stringify(r.markdown));
}
// A placeholder the parser would eat stays visible and its pipe table stays a table.
{
  const input = '# Setup\n\n**Note:** fill in `cfg`.\n\n| Field | Value |\n| --- | --- |\n| owner | <name> |\n| repo | glimpse |';
  const r = await format(input, { toHtml }), html = toHtml(r.markdown);
  const ok = /<table>/.test(html) && html.includes('&lt;name&gt;');
  if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', 'placeholder in pipe table: kept and still a table', ok ? '' : JSON.stringify(r.markdown));
}
for (const [name, input] of [['100x100 spaces', 'a\n' + (' '.repeat(100) + '\n').repeat(100) + 'b'], ['2000x4 spaces', 'a\n' + '    \n'.repeat(2000) + 'b'], ['50k empty lines', '\n'.repeat(50000) + 'x'], ['150k lines', 'line\n'.repeat(150000)]]) {
  const t = Date.now(); const r = await format(input, { toHtml }); const ms = Date.now() - t;
  const ok = ms < 2000 && r.lines.length === input.split('\n').length;
  if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', `${name}: ${ms} ms`);
}
console.log(fail ? `${fail} FAILED` : 'all adversarial checks passed'); process.exit(fail ? 1 : 0);
