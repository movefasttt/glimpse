// Read assistant text replies (raw markdown) from a Claude Code transcript, in file order.
import fs from 'node:fs';
export function readReplies(file) {
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    if (r.type !== 'assistant' || r.isSidechain) continue;
    const content = r.message?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) if (c.type === 'text' && c.text && c.text.trim()) out.push({ text: c.text, uuid: r.uuid });
  }
  return out.map((r, i) => ({ ...r, idx: i }));
}
