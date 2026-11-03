// Stub v2 formatter for panel tests while the engine is being built: ignores the input and returns
// fixed markdown exercising the v2 HTML blocks (docs/dataset.md). GLIMPSE_FORMAT=research/harness/stub-v2.js
(function () {
  'use strict';
  const markdown = [
    '## Reply heading',
    '',
    'The reply paragraph reads louder than the tool output around it, with `inline code`.',
    '',
    '<div class="g-demoted">⏺ Bash(git status --short)',
    '  ⎿  M template.html',
    '&#8203;',
    '     … +3 lines (ctrl+o to expand)</div>',
    '',
    '- a list item after the demoted block',
    '- second item',
    '',
    '<div class="g-verbatim">VERBATIM first line kept as-is',
    '    indented second line with a &lt;tag&gt; &amp; ampersand',
    '&#8203;',
    'line after an empty line</div>',
    '',
    'Closing paragraph with **bold**.',
    '',
    '<div class="g-demoted">✻ Cogitated for 12s</div>',
  ].join('\n');
  const api = { format: async () => ({ markdown, lines: [] }) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.GlimpseFormat = api;
})();
