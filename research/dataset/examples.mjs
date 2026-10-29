// node examples.mjs <report.samples.jsonl> <cause-substring> [n] - print damaged samples with truth vs predicted per line
import fs from 'fs';
const [file, cause, n = 3] = process.argv.slice(2);
const samples = new Map(fs.readFileSync(new URL('./samples.jsonl', import.meta.url), 'utf8').trim().split('\n').map(l => { const o = JSON.parse(l); return [o.id, o]; }));
let shown = 0; const seen = new Set();
for (const line of fs.readFileSync(file, 'utf8').trim().split('\n')) {
  const r = JSON.parse(line);
  const hit = (r.damagedLines || r.damaged || []).filter(d => JSON.stringify(d).includes(cause));
  if (!hit.length || !samples.has(r.id)) continue;
  const reply = r.id.replace(/-w\d+-/, '-').replace(/-(whole|block|midline|partial|spill|multi)-\d+$/, '');
  if (seen.has(reply)) continue; seen.add(reply);
  const s = samples.get(r.id), pred = (r.pred || []).map(x => ({ type: String(x).replace('+', ''), cont: String(x).endsWith('+') }));
  console.log(`\n##### ${r.id}  (${hit.length} damaged)`);
  s.input.split('\n').slice(0, 40).forEach((t, i) => {
    const tr = s.lines[i], p = pred[i] || {};
    const mark = hit.some(d => (d.line ?? d.i) === i) ? '!!' : (tr.type !== p.type ? '~ ' : '  ');
    console.log(`${mark}${tr.type.padEnd(7)}${tr.cont ? '+' : ' '} ${String(p.type || '').padEnd(7)}${p.cont ? '+' : ' '}| ${t.slice(0, 110)}`);
  });
  if (++shown >= n) break;
}
