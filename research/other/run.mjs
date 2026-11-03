import fs from 'fs';
const { format } = (await import(new URL('../../format.js', import.meta.url))).default;
for (const f of fs.readdirSync('.').filter(f => f.endsWith('.txt'))) {
  const r = await format(fs.readFileSync(f, 'utf8'), {});
  console.log(`\n=== ${f}  types: ${[...new Set(r.lines.map(l => l.type))].join(',')}`); console.log(r.markdown);
}
