// Regression checks from the 2026-10-13 cold review: no text loss, no hangs. node adversarial.mjs
const { format } = (await import(new URL('../../format.js', import.meta.url))).default;
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
  const r = await format(input, {});
  const miss = must.filter(m => !plain(r.markdown).includes(m));
  if (miss.length || r.lines.length !== input.split('\n').length) { fail++; console.log('FAIL', name, '| missing:', miss, '| out:', JSON.stringify(r.markdown)); }
  else console.log('ok  ', name);
}
for (const [name, input] of [['100x100 spaces', 'a\n' + (' '.repeat(100) + '\n').repeat(100) + 'b'], ['2000x4 spaces', 'a\n' + '    \n'.repeat(2000) + 'b'], ['50k empty lines', '\n'.repeat(50000) + 'x'], ['150k lines', 'line\n'.repeat(150000)]]) {
  const t = Date.now(); const r = await format(input, {}); const ms = Date.now() - t;
  const ok = ms < 2000 && r.lines.length === input.split('\n').length;
  if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', `${name}: ${ms} ms`);
}
console.log(fail ? `${fail} FAILED` : 'all adversarial checks passed'); process.exit(fail ? 1 : 0);
