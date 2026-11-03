// Headless check of the panel's button hooks (main.swift calls these via evaluateJavaScript): no app launch.
// node toggle.mjs <input.txt>  -> raw toggle round-trip, size message after each flip, copy payload (and its stability at the rendered message), (demoted out, verbatim kept), JS errors.
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(new URL('../mermaid/package.json', import.meta.url));
const { webkit } = require('playwright');
const G = new URL('../../', import.meta.url).pathname;
const read = f => fs.readFileSync(G + f, 'utf8');
// GLIMPSE_FORMAT=<path> swaps the formatter (e.g. the v2 bundle); relative paths resolve from the cwd.
const formatJs = fs.readFileSync(process.env.GLIMPSE_FORMAT || G + 'format.js', 'utf8');
const text = fs.readFileSync(process.argv[2], 'utf8');
const hint = /^\s*(mermaid|graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|sankey|xychart|block|packet|kanban|architecture|requirement|C4|radar|treemap)\b/m.test(text);
const all = (s, a, b) => s.split(a).join(b);
const json = JSON.stringify(text).replace(/\//g, '\\/').replace(/</g, '\\u003c');
const html = all(all(all(all(read('template.html'),
  '/*MARKED*/', read('vendor/marked.min.js')),
  '/*FORMAT*/', formatJs),
  '/*MERMAID*/', hint ? read('vendor/mermaid.min.js') : ''),
  '/*SOURCE*/', json)
  .replace('window.webkit.messageHandlers.size.postMessage(', 'window.__post(')
  .replace('window.webkit.messageHandlers.rendered.postMessage(', 'window.__rendered(')
  .replace('<head>', '<head><script>window.__posts = []; window.__post = h => window.__posts.push(h); window.__rendered = t => { window.__renderedToken = t; window.__atRendered = glimpseCopyPayload(); };</script>');
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 680, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.setContent(html);
const posts = n => page.waitForFunction(n => window.__posts.length >= n, n, { timeout: 15000 }).then(() => true, () => false);
const fail = [];
if (!await posts(1)) fail.push('no size message after render');
// The formatted view's visible text with demoted terminal UI hidden (computed independently of the template's clone).
const formattedText = await page.evaluate(() => {
  // ...and empty verbatim lines copied empty, not as the U+200B placeholder
  const st = document.head.appendChild(document.createElement('style'));
  st.textContent = '#doc .g-demoted { display: none !important; }';
  const t = document.getElementById('doc').innerText;
  st.remove();
  return t.replace(/^\u200B$/gm, '');
});
const blocks = await page.evaluate(() => ({
  demoted: [...document.querySelectorAll('#doc .g-demoted')].map(e => e.innerText),
  verbatim: [...document.querySelectorAll('#doc .g-verbatim')].map(e => e.innerText.replace(/^\u200B$/gm, '')),
}));
const view = () => page.evaluate(() => ({
  docHidden: document.getElementById('doc').hidden, rawHidden: document.getElementById('raw').hidden,
  rawText: document.getElementById('raw').textContent,
  rawStyle: (s => s.fontFamily + ' / ' + s.whiteSpace)(getComputedStyle(document.getElementById('raw'))),
}));

const r1 = await page.evaluate(() => glimpseToggleRaw());
if (!await posts(2)) fail.push('no size message after toggle to raw');
const v1 = await view();
if (r1 !== true || !v1.docHidden || v1.rawHidden) fail.push('toggle 1 did not show raw ' + JSON.stringify({ r1, ...v1, rawText: undefined }));
if (v1.rawText !== text) fail.push('raw text differs from the source');
const payloadRaw = await page.evaluate(() => glimpseCopyPayload());
// formattedText (visible text) is kept for the empty-payload and demoted checks; the text flavor itself is markdown
if (!(await page.evaluate(() => document.getElementById('doc').hidden))) fail.push('copy payload un-hid the formatted view');

const r2 = await page.evaluate(() => glimpseToggleRaw());
if (!await posts(3)) fail.push('no size message after toggle back');
const v2 = await view();
if (r2 !== false || v2.docHidden || !v2.rawHidden) fail.push('toggle 2 did not restore formatted');
const payload = await page.evaluate(() => glimpseCopyPayload());
// Empty is right only when the panel shows nothing but demoted terminal UI (e.g. a copied prompt line): no push then.
if (formattedText.trim() && !payload.text) fail.push('copy payload empty in formatted view');
if (payloadRaw.text !== payload.text) fail.push('copy payload depends on the raw toggle');
if (formattedText.trim() && !payload.text.trim()) fail.push('copy text empty while the panel shows text');
// The copy is markdown, not the visible text: every link target on the page must survive in it.
// GFM autolinks (bare URLs, emails) are compared as the reader wrote them: no mailto:, no %5C from a parser escape.
for (const href of (await page.evaluate(() => [...document.querySelectorAll('#doc a[href]')].map(a => a.getAttribute('href')))).map(m => m.replace(/&amp;/g, '&').replace(/^mailto:/, '').replace(/%5C/gi, '')))
  if (!payload.text.includes(href)) fail.push('link target missing from copy text: ' + href.slice(0, 80));

// The ⌘C⌘C auto-push (main.swift) copies on the `rendered` message: what it would copy then must be the final result
// (nothing still rendering, e.g. a mermaid diagram) and never empty.
await page.waitForFunction(() => window.__atRendered, null, { timeout: 15000 }).catch(() => {});
const atFirst = await page.evaluate(() => window.__atFirst = window.__atRendered);
if (await page.evaluate(() => window.__renderedToken) !== 0) fail.push('rendered message did not carry the load token');
if (!atFirst || (formattedText.trim() && !atFirst.text)) fail.push('payload at the rendered message is empty');
else if (atFirst.text !== payload.text) fail.push('payload at the rendered message differs from the final one (auto-push would copy a half-rendered page)');

// Over the size cap (template.html MAX_FORMAT_BYTES) the panel shows the original verbatim, unformatted.
if (Buffer.byteLength(text) > 400000) {
  const only = await page.evaluate(() => [...document.getElementById('doc').children].map(e => e.tagName + ':' + e.textContent.length));
  if (only.length !== 1 || only[0] !== 'PRE:' + text.length) fail.push('oversize input was not shown verbatim: ' + JSON.stringify(only));
}

// Demoted text reaches a copy as plain text, line by line as it arrived (the maintainer, 2026-10-28); so does verbatim text.
for (const [view, p] of [['raw', payloadRaw], ['formatted', payload]]) {
  for (const d of blocks.demoted) if (d.trim() && !p.text.includes(d.trim())) fail.push(view + ': demoted text missing from copy text: ' + d.slice(0, 60));
  if (p.text.includes('\u200B')) fail.push(view + ': U+200B placeholder in copy text');
  for (const v of blocks.verbatim) if (!p.text.includes(v.replace(/\n+$/, ''))) fail.push(view + ': verbatim block missing or reflowed in copy text: ' + v.slice(0, 60));
}

const h = await page.evaluate(() => window.__posts);
console.log('heights (formatted, raw, formatted):', h.join(', '), '| raw style:', v1.rawStyle);
console.log('payload: text', payload.text.length, 'chars | demoted blocks', blocks.demoted.length, 'verbatim blocks', blocks.verbatim.length);
console.log('errors:', errors.length ? errors : 'none');
console.log(fail.length || errors.length ? 'FAIL ' + JSON.stringify(fail) : 'PASS');
await browser.close();
process.exit(fail.length || errors.length ? 1 : 0);
