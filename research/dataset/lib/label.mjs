// Per-line labels for a whole render: aligned reply lines get their content type, everything else is
// chrome or blank. Also carries what selection needs to cut blocks (key offsets, table rows).
import { key } from './md.mjs';
import { isBlank, dwidth } from './align.mjs';

export function labelRender(screen, W, replies, chosen) {
  const info = screen.map((l) => ({ type: isBlank(l) ? 'blank' : 'chrome', reply: null, block: null, cont: false }));
  const stats = { spans: 0, artifactBlanks: 0, artifactCont: 0, fullWidth: 0, vtables: 0, boxTables: 0, pipeTables: 0 };
  const byIdx = new Map(replies.map((r) => [r.idx, r]));
  const regions = [];
  for (const c of chosen) {
    const rep = byIdx.get(c.r);
    let afterArtifact = false;
    let tableRow = null, tableKind = null, tableBlock = null;
    for (const e of c.lines) {
      const li = e.li;
      const l = screen[li];
      if (dwidth(l) >= W) stats.fullWidth++;
      if (!e.seg) { // blank line between blocks, or the empty row after a full-width line
        info[li] = { type: 'blank', reply: c.r, block: null, cont: false };
        if (e.artifact) { stats.artifactBlanks++; afterArtifact = true; }
        continue;
      }
      const s = e.seg;
      const x = { type: s.type, reply: c.r, block: s.block, cont: false };
      if (s.kind === 'table') {
        // box or pipe table line: track rows (0 = header); borders/separators get row null
        const t = l.replace(/^⏺ ?/, '').trim();
        if (tableBlock !== s.block) { tableBlock = s.block; tableRow = 0; tableKind = t.startsWith('┌') ? 'box' : 'pipe'; tableKind === 'box' ? stats.boxTables++ : stats.pipeTables++; }
        if (tableKind === 'box') {
          if (t.startsWith('├')) { tableRow++; x.row = null; } else if (t.startsWith('│')) x.row = tableRow; else x.row = null;
        } else if (/^\|[-:| ]+\|$/.test(t)) { x.row = null; tableRow = 1; } else { x.row = tableRow; if (tableRow > 0) tableRow++; }
        x.tkind = tableKind;
      } else if (s.kind === 'tcell' || s.kind === 'tsep') {
        if (s.first) stats.vtables++;
        x.tkind = 'vertical'; x.row = s.kind === 'tcell' ? s.row : null;
        x.cont = e.off > 0; // a wrapped "Header: value" line
      } else if (s.kind === 'flow' || s.kind === 'code') {
        x.cont = e.off > 0;
      }
      if (s.kind === 'flow' || s.kind === 'tcell') {
        // where this line's matched text sits in the block's key, and how many leading key chars are markup
        x.bko = (s.bko || 0) + e.off;
        x.keyLen = e.keyLen;
        x.prefixLen = key(l).length - e.keyLen;
      }
      if (x.cont && afterArtifact) stats.artifactCont++;
      if (e.spans) stats.spans++;
      x.kind = s.kind;
      afterArtifact = false;
      info[li] = x;
    }
    regions.push({ r: c.r, i0: c.i0, end: c.end });
  }
  return { info, regions, stats };
}
