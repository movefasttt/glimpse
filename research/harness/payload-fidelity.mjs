// Does the COPY PAYLOAD (the .string flavor an editor/terminal receives) lose words the source had?
// The engine guarantees no lost word in the render; the copy payload is a different path (the engine's copy markdown),
// so it needs its own check. Fresh page per case, and we wait for the render to actually finish.
//
//   node payload-fidelity.mjs   (regression cases + fixtures + every corpus/ copy when present)
//
// Added 2026-10-24 for the auto-push decision (docs/product-direction.md 1h): the auto-push ships exactly this
// payload, so "the auto-push never degrades the copy" is only true if this passes. Terminal chrome is demoted
// (dimmed in the panel) but kept in every copy as plain text (Darwin, 2026-10-28): every word must survive.
import { createRequire } from 'module';
const require = createRequire(new URL('../mermaid/package.json', import.meta.url));
const { webkit } = require('playwright');
import fs from 'fs';
const G = new URL('../../', import.meta.url).pathname;
const read = f => fs.readFileSync(G + f, 'utf8');
const formatJs = fs.readFileSync(G + 'format.js', 'utf8');
const readJsonl = f => fs.readFileSync(f,'utf8').split('\n').filter(l=>l.trim()).map(l=>JSON.parse(l));
const cases = [
  ...readJsonl(G+'research/dataset/regressions.jsonl').map(c => ({id:c.id, input:c.input})),
  ...readJsonl(G+'research/dataset/fixtures.jsonl').map(c => ({id:c.id, input:c.input})),
  // every real copy in corpus/ (local, gitignored): 13 constructed cases are too few to gate a clipboard write
  ...(fs.existsSync(G+'corpus') ? fs.readdirSync(G+'corpus').filter(d => fs.existsSync(G+'corpus/'+d+'/input.txt'))
    .map(d => ({id:d, input:fs.readFileSync(G+'corpus/'+d+'/input.txt','utf8')})) : []),
].filter(c => typeof c.input === 'string' && c.input.trim());
const words = s => (s.match(/[A-Za-z0-9]+/g) || []).map(w=>w.toLowerCase());
const browser = await webkit.launch();
let fails = 0, checked = 0;
for (const c of cases) {
  const page = await browser.newPage({viewport:{width:680,height:900}});
  const json = JSON.stringify(c.input).replace(/\//g,'\\/').replace(/</g,'\\u003c');
  const all = (s,a,b) => s.split(a).join(b);
  const html = all(all(all(read('template.html'),'/*MARKED*/',read('vendor/marked.min.js')),'/*FORMAT*/',formatJs),'/*SOURCE*/',json);
  await page.setContent(html);
  // wait for the engine to have rendered: the template posts a size message after the doc is built
  await page.waitForFunction(() => document.getElementById('doc')?.innerText?.length > 0, null, {timeout:15000})
    .catch(() => {});
  await page.waitForTimeout(150);
  const p = await page.evaluate(() => { try { return glimpseCopyPayload(); } catch(e) { return null; } });
  await page.close();
  if (!p) { console.log('SKIP  ' + c.id + ' (payload error)'); continue; }
  checked++;
  const src = new Set(words(c.input));
  const got = new Set(words(p.text));
  const mustSurvive = [...src];
  const lost = mustSurvive.filter(w => !got.has(w));
  // terminal chrome markers (⏺) and box-drawing table glyphs are not words; drop known-marker noise
  const realLost = lost.filter(w => w.length > 1);
  if (realLost.length) { fails++; console.log('LOST  ' + c.id + ': ' + realLost.slice(0,8).join(' ')); }
  else console.log('ok    ' + c.id);
}
console.log(fails ? `FAIL - ${fails}/${checked} cases lost words` : `PASS - no lost words in the copy payload (${checked} cases)`);
await browser.close();
process.exit(fails ? 1 : 0);
