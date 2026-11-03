// Raw markdown (what Claude Code's /copy gives) must pass through intact: same marked tokens,
// except unfenced mermaid getting fenced. Reports any reply whose structure changed.
import fs from 'fs';
import { marked } from 'marked';
import { makeParseMermaid } from './lib/mermaid-node.mjs';
const parseMermaid = await makeParseMermaid();
const { format } = (await import(new URL('../../format.js', import.meta.url))).default;
const sessions = JSON.parse(fs.readFileSync('sessions.json', 'utf8'));
const shape = md => marked.lexer(md).filter(t => t.type !== 'space').map(t => t.type + (t.type === 'code' ? ':' + (t.lang || '') : ''));
let n = 0, md = 0, same = 0; const bad = [];
for (const s of sessions) for (const line of fs.readFileSync(s.file, 'utf8').split('\n')) {
  let o; try { o = JSON.parse(line); } catch { continue; }
  if (o.type !== 'assistant' || o.isSidechain) continue;
  for (const c of o.message?.content || []) {
    if (c?.type !== 'text' || c.text.length < 200) continue;
    n++;
    const r = await format(c.text, { parseMermaid });
    const a = shape(c.text).join(' '), b = shape(r.markdown).join(' ');
    if (r.lines.length !== c.text.split('\n').length) bad.push(['LEN', c.text.slice(0, 80)]);
    else if (a === b) same++;
    else bad.push([a.slice(0, 120), b.slice(0, 120), c.text]);
  }
}
console.log(`raw replies: ${n}, structure identical: ${same} (${(100 * same / n).toFixed(1)}%), changed: ${bad.length}`);
bad.slice(0, 8).forEach(([a, b]) => console.log('  in :', a, '\n  out:', b));
if (process.argv[2]) bad.slice(0, +process.argv[2]).forEach(b => console.log('\n-----\n' + (b[2] || '').slice(0, 700)));
