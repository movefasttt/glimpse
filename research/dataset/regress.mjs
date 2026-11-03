// Regression cases from real copies (neutral rewrites, same shape): `node regress.mjs [format.js]` exits non-zero on failure.
// Each case in regressions.jsonl names the line types the formatter must produce, in order, runs collapsed;
// `expect.markdown`, when given, is the exact output (negative controls: the text must come out as before).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonl } from './score.mjs';
import { makeParseMermaid } from './lib/mermaid-node.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { format } = (await import(path.resolve(process.argv[2] || path.join(HERE, '../../format.js')))).default;
const parseMermaid = await makeParseMermaid();
let fails = 0;
for (const c of readJsonl(path.join(HERE, 'regressions.jsonl'))) {
  const r = await format(c.input, { parseMermaid });
  const got = r.lines.map(l => l.type).filter((t, i, a) => t !== 'blank' && t !== a[i - 1]);
  const ok = JSON.stringify(got) === JSON.stringify(c.expect.types) && (c.expect.markdown == null || r.markdown === c.expect.markdown);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.id}${ok ? '' : `  expected ${c.expect.types.join(',')}, got ${got.join(',')}`}`);
  if (!ok) fails++;
}
process.exit(fails ? 1 : 0);
