// Headless check of the panel HTML exactly as main.swift assembles it (no app launch).
// node panel.mjs <input.txt> [out.png]  -> prints rendered block summary, JS errors, optional screenshot.
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
// Mirror main.swift exactly: replacingOccurrences replaces every occurrence; JSONEncoder escapes "/", and Swift adds "<" -> \u003c.
const all = (s, a, b) => s.split(a).join(b);
const json = JSON.stringify(text).replace(/\//g, '\\/').replace(/</g, '\\u003c');
const html = all(all(all(all(read('template.html'),
  '/*MARKED*/', read('vendor/marked.min.js')),
  '/*FORMAT*/', formatJs),
  '/*MERMAID*/', hint ? read('vendor/mermaid.min.js') : ''),
  '/*SOURCE*/', json)
  .replace('window.webkit.messageHandlers.size.postMessage(', 'window.__post(')
  .replace('window.webkit.messageHandlers.rendered.postMessage(', '(() => {})(')
  .replace('<head>', '<head><script>window.__post = h => { window.__h = h; };</script>');
const browser = await webkit.launch();
// GLIMPSE_SCHEME=dark renders the dark appearance (default light).
const page = await browser.newPage({ viewport: { width: 680, height: 900 }, deviceScaleFactor: 2, colorScheme: process.env.GLIMPSE_SCHEME || 'light' });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.setContent(html);
await page.waitForFunction(() => window.__h !== undefined, null, { timeout: 15000 }).catch(() => errors.push('no size message (render never finished)'));
const summary = await page.evaluate(() => [...document.querySelectorAll('#doc > *')].map(e => e.tagName + (e.className ? '.' + e.className : '')).join(' '));
console.log('blocks:', summary || '(empty)');
console.log('height:', await page.evaluate(() => window.__h));
console.log('errors:', errors.length ? errors : 'none');
if (process.argv[3]) await page.screenshot({ path: process.argv[3], fullPage: true });
await browser.close();
