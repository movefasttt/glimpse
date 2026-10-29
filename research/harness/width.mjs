// Panel width rule over every corpus/ copy (docs/design.md, 2026-10-26): render headlessly, take the width the page
// posts, re-render at that width clamped to 680..CAP, and check that nothing which fits still overflows or shrinks.
//   node width.mjs [cap=1468] [copy-id,copy-id  -> screenshots width-<id>.png]
// 1468 = 85% of a 1728-pt laptop screen, 2280 = 85% of a 2683-pt external one.
import { createRequire } from 'module'; import fs from 'fs';
const require = createRequire(new URL('../mermaid/package.json', import.meta.url)); const { webkit } = require('playwright');
const G=new URL('../../', import.meta.url).pathname, read=f=>fs.readFileSync(G+f,'utf8'), all=(s,a,b)=>s.split(a).join(b);
const mer=read('vendor/mermaid.min.js'), CAP=+process.argv[2]||1468, shots=(process.argv[3]||'').split(',');
const b=await webkit.launch(); const res=[]; let errs=0;
for (const d of fs.readdirSync(G+'corpus')) { const f=G+'corpus/'+d+'/input.txt'; if(!fs.existsSync(f)) continue;
  const src=fs.readFileSync(f,'utf8'); const json=JSON.stringify(src).replace(/\//g,'\\/').replace(/</g,'\\u003c');
  let html=all(all(read('template.html'),'/*MARKED*/',read('vendor/marked.min.js')),'/*FORMAT*/',read('format.js'));
  html=all(html,'/*MERMAID*/',/^\s*(⏺\s+)?(mermaid|graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline)\b/m.test(src)?mer:'');
  html=all(html,'/*SOURCE*/',json).replace('window.webkit.messageHandlers.size.postMessage(','((v)=>window.__h=v)(').replace('window.webkit.messageHandlers.rendered.postMessage(','((v)=>window.__r=1)(').replace('window.webkit?.messageHandlers?.width?.postMessage(','((v)=>window.__w=v)(');
  const p=await b.newPage({viewport:{width:680,height:900}}); const pe=[]; p.on('pageerror',e=>pe.push(String(e)));
  await p.setContent(html); await p.waitForFunction(()=>window.__r,null,{timeout:20000}).catch(()=>pe.push('no rendered'));
  const w=await p.evaluate(()=>window.__w); const width=Math.round(Math.min(Math.max(w||0,680),CAP));
  await p.setViewportSize({width,height:900}); await p.waitForTimeout(150);
  const chk=await p.evaluate(()=>{const doc=document.getElementById('doc');
    const over=[...doc.querySelectorAll('pre, .g-verbatim')].filter(e=>e.scrollWidth>e.clientWidth+1).length;
    const shrunk=[...doc.querySelectorAll('.diagram svg')].filter(e=>e.viewBox&&e.getBoundingClientRect().width+1<e.viewBox.baseVal.width).length;
    const prose=Math.max(0,...[...doc.querySelectorAll(':scope > p')].map(e=>e.getBoundingClientRect().width));
    return {over,shrunk,prose:Math.round(prose)};});
  if (pe.length) { errs++; console.log('ERR', d, pe[0].slice(0,120)); }
  if (shots.includes(d)) await p.screenshot({path:`width-${d}.png`, fullPage:false});
  await p.close(); res.push({d,w,width,...chk});
}
await b.close();
const grown=res.filter(r=>r.width>680), capped=res.filter(r=>r.w>CAP);
const bad=res.filter(r=>r.w<=CAP && (r.over||r.shrunk));
console.log({cap:CAP, copies:res.length, stay680:res.length-grown.length, grown:grown.length, atCap:capped.length,
  fitButStillOverflow:bad.length, maxProseWidth:Math.max(...res.map(r=>r.prose)), pageErrors:errs});
bad.slice(0,5).forEach(r=>console.log('  overflow despite fit', r));
