# usage: python3 make.py   -> renders body x tier (blue) and palette x body (tier 3), one icon only (no dark variant)
import json, os, shutil, subprocess, sys
ICT = "/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool"
H = '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">'
MESS = [(120,300,60),(196,300,50),(100,380,90),(206,380,40),(130,460,116),(110,540,50),(176,540,70),(140,620,80)]
DOC = [(380.5,338,225,64),(380.5,434,279,56),(380.5,520,193.5,56)]
PAL = {  # name: (top, bottom, glyph ink or None=white)  rgb floats for fill, hex for svg
 "blue":     ("0.30,0.62,1.0", "0.04,0.30,0.95", "#fff", "#4d9eff", "#0a4df2"),
 "aurora":   ("0.55,0.40,1.0", "0.05,0.55,0.95", "#fff", "#8c66ff", "#0d8cf2"),
 "mint":     ("0.30,0.90,0.75", "0.02,0.45,0.60", "#fff", "#4de6bf", "#05738f"),
 "graphite": ("0.30,0.31,0.35", "0.05,0.05,0.07", "#fff", "#4d4f59", "#0d0d12"),
 "porcelain":("1.0,1.0,1.0",   "0.80,0.85,0.97", "#2a62f0", "#ffffff", "#ccd9f7"),
}
def svg(b, d=""): return H + (f"<defs>{d}</defs>" if d else "") + b + "</svg>"
def lg(id, stops, x2=0, y2=1): return f'<linearGradient id="{id}" x1="0" y1="0" x2="{x2}" y2="{y2}">' + "".join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o,c,a in stops) + "</linearGradient>"
def wrap(body, s): return f'<g transform="translate(512 512) scale({s}) translate(-512 -512)">{body}</g>'
def glyphs(ink, s):
    m = "".join(f'<rect x="{x}" y="{y}" width="{w}" height="40" rx="20" fill="{ink}" opacity="0.7"/>' for x,y,w in MESS)
    l = f'<circle cx="520" cy="450" r="225" fill="none" stroke="{ink}" stroke-width="60"/><line x1="695" y1="625" x2="801" y2="731" stroke="{ink}" stroke-width="92" stroke-linecap="round"/>'
    d = "".join(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h/2}" fill="{ink}"/>' for x,y,w,h in DOC)
    return {"mess.svg": svg(wrap(m,s)), "lens.svg": svg(wrap(l,s)), "doc.svg": svg(wrap(d,s))}
def L(n, glass=False, **k): d = {"image-name": n, "name": n[:-4], "glass": glass}; d.update(k); return d
def G(ls, sh=0, tr=0, **k): d = {"layers": ls, "shadow": {"kind": "neutral" if sh else "none", "opacity": sh}, "translucency": {"enabled": tr>0, "value": tr}}; d.update(k); return d


def lensparts(kind, tier, cx, cy, r):
    """kind: handle | ring | disc | thick. Returns SVG layers (bottom->top) for the lens; mess/doc come from glyphs()."""
    A = {}
    if kind == "handle": return A
    sw = round(56 * r / 240)
    inner = r - sw/2
    ring = f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#fff" stroke-width="{sw}"/>'
    if tier == 3: ring += f'<circle cx="{cx}" cy="{cy}" r="{inner}" fill="none" stroke="#000" stroke-opacity="0.18" stroke-width="{max(4, sw//9)}"/>'
    A["ring.svg"] = svg(ring)
    if kind in ("disc", "thick") and tier > 1:
        A["disc.svg"] = svg(f'<circle cx="{cx}" cy="{cy}" r="{inner}" fill="url(#d)"/>', '<radialGradient id="d"><stop offset="0.55" stop-color="#fff" stop-opacity="0.04"/><stop offset="1" stop-color="#fff" stop-opacity="0.30"/></radialGradient>')
    if tier > 1:
        def arc(a0, a1, rad, w, col, op, blur=0):
            import math
            p = lambda a: (cx + rad*math.cos(math.radians(a)), cy + rad*math.sin(math.radians(a)))
            (x0,y0),(x1,y1) = p(a0), p(a1)
            f = f' filter="url(#b)"' if blur else ""
            return f'<path d="M{x0:.0f} {y0:.0f} A{rad} {rad} 0 0 1 {x1:.0f} {y1:.0f}" fill="none" stroke="{col}" stroke-opacity="{op}" stroke-width="{w}" stroke-linecap="round"{f}/>'
        defs = '<filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>' + lg("t", [(0,"#fff",0.55),(1,"#fff",0.0)]) + f'<clipPath id="c"><circle cx="{cx}" cy="{cy}" r="{inner-4}"/></clipPath>'
        sh = f'<g clip-path="url(#c)"><ellipse cx="{cx}" cy="{cy-inner*0.52}" rx="{inner*0.92}" ry="{inner*0.55}" fill="url(#t)"/></g>'   # top gloss sheet
        if tier == 3:
            sh += arc(205, 262, inner-26*r/240, 20*r/240, "#fff", 0.85)                       # crisp rim highlight, top-left
            sh += f'<ellipse cx="{cx-inner*0.45}" cy="{cy-inner*0.50}" rx="{46*r/240:.0f}" ry="{20*r/240:.0f}" transform="rotate(-38 {cx-inner*0.45} {cy-inner*0.50})" fill="#fff" fill-opacity="0.9"/>'  # hot spot
            sh += arc(15, 95, inner-30*r/240, 30*r/240, "#bfe6ff", 0.5, blur=1)               # caustic, bottom-right
        A["shine.svg"] = svg(sh, defs)
    return A


ALT = {'blue': '#7a5cff', 'aurora': '#ff7ad9', 'mint': '#5cd6ff', 'graphite': '#5b6bff', 'porcelain': '#ffb3d9'}
CONTENT = {   # inside-the-lens line fills: [heading, body, last]
 'white': ['#fff', '#fff', '#fff'],
 'spectrum': ['url(#sp)', 'url(#sp)', 'url(#sp)'],
 'structured': ['url(#am)', '#fff', '#6ef2c4'],
 'tint': ['#d9f3ff', '#a9dcff', '#8ec9ff'],
}
SPEC = lg('sp', [(0,'#7df9ff',1),(0.5,'#b18cff',1),(1,'#ff8ad8',1)], 1, 0).replace('x1="0" y1="0" x2="1" y2="0"', 'gradientUnits="userSpaceOnUse" x1="380" y1="0" x2="660" y2="0"') + lg('am', [(0,'#ffe27a',1),(1,'#ffa63d',1)], 1, 0).replace('x1="0" y1="0" x2="1" y2="0"', 'gradientUnits="userSpaceOnUse" x1="380" y1="0" x2="660" y2="0"')
FRAG = {'white': ('#fff', 0.7), 'gray': ('#d5dbe6', 0.42), 'warm': ('#ffe3b0', 0.55)}
def build(pal, body, lens, tier, r=240, cx=548, cy=512, overlap=0, content='white', frag='white'):
    top, bot, ink, hx_top, hx_bot = PAL[pal]; A = {}; gs = []
    fill = {"solid": f"srgb:{bot},1"} if tier == 1 else {"linear-gradient": [f"srgb:{top},1", f"srgb:{bot},1"]}
    g = glyphs(ink, 1.0)
    if pal != 'porcelain':
        cols = CONTENT[content]
        g['doc.svg'] = svg(wrap("".join(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h/2}" fill="{cols[i]}"/>' for i,(x,y,w,h) in enumerate(DOC)), 1.0), SPEC)
        fc, fo = FRAG[frag]
        g['mess.svg'] = svg(wrap("".join(f'<rect x="{x}" y="{y}" width="{w}" height="40" rx="20" fill="{fc}" opacity="{fo}"/>' for x,y,w in MESS), 1.0))
    # no handle: recenter text in the lens (magnified for the disc), scale with lens size; fragments sit left of the lens, tucked `overlap` px behind it
    k = r / 240
    mag = 1.12 * k if lens == "disc" else k
    place = lambda sv, c, dx, dy, s: sv.replace('<g transform="translate(512 512) scale(1.0) translate(-512 -512)">', f'<g transform="translate({dx:.0f} {dy:.0f}) translate({c[0]} {c[1]}) scale({s:.3f}) translate({-c[0]} {-c[1]})">')
    g["doc.svg"] = place(g["doc.svg"], (520, 457), cx - 520, cy - 457, mag)
    sm = min(max(k, 0.9), 1.15)
    g["mess.svg"] = place(g["mess.svg"], (173, 480), (cx - r - 28 + overlap) - 14 - 246 - (1-sm)*0, cy - 480, sm)
    g.pop("lens.svg")
    A.update(g); A.update(lensparts(lens, tier, cx, cy, r))
    fx = dict(sh=0.5*(tier>1), tr=0.35*(tier>1), **({"specular": True} if tier==3 else {}))
    if body == "mesh" and tier > 1:   # soft color blobs under the gloss: depth from hue, not just white
        A["mesh.svg"] = svg(f'<g filter="url(#m)"><circle cx="200" cy="200" r="300" fill="{hx_top}"/><circle cx="880" cy="260" r="260" fill="{ALT[pal]}" opacity="0.8"/><circle cx="640" cy="900" r="340" fill="{hx_bot}"/></g>', '<filter id="m" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="90"/></filter>')
        gs.append(G([L("mesh.svg")]))
    if body in ("gloss", "mesh") and tier > 1:
        A["gloss.svg"] = svg('<path d="M0 0H1024V430C800 500 224 500 0 430Z" fill="url(#g)"/>', lg("g", [(0,"#fff",0.5),(1,"#fff",0.04)]))
        gs.append(G([L("gloss.svg")]))
        if tier == 3:
            A["base.svg"] = svg('<ellipse cx="512" cy="1060" rx="640" ry="300" fill="url(#r)"/>', '<radialGradient id="r"><stop offset="0" stop-color="#fff" stop-opacity="0.6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>')
            gs.append(G([L("base.svg", opacity=0.6)]))
    front = [L("mess.svg")] + ([L("disc.svg", True)] if "disc.svg" in A else []) + [L("doc.svg", tier>1)] + [L("lens.svg" if lens == "handle" else "ring.svg", tier>1)]
    gs.append(G(front, **fx))
    if "shine.svg" in A: gs.append(G([L("shine.svg")]))
    if body == "grain" and tier > 1:   # fine film grain over everything
        A["grain.svg"] = svg('<rect width="1024" height="1024" filter="url(#n)" opacity="0.22"/>', '<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>')
        gs.append(G([L("grain.svg")]))
    gs = [dict(g, layers=g["layers"][::-1]) for g in gs][::-1]   # icon.json lists top-first
    name = f"{pal}-{body}-{lens}-{tier}-r{r}-x{cx}-y{cy}-o{overlap}-{content}-{frag}"; d = f"{name}.icon"; shutil.rmtree(d, ignore_errors=True); os.makedirs(d + "/Assets")
    for f, s in A.items(): open(f"{d}/Assets/{f}", "w").write(s)
    json.dump({"fill": fill, "groups": gs, "supported-platforms": {"squares": ["macOS"]}}, open(d + "/icon.json", "w"), indent=1)
    os.makedirs("png", exist_ok=True); out = f"png/{name}.png"
    r = subprocess.run([ICT, d, "--export-image", "--output-file", out, "--platform", "macOS", "--rendition", "Default", "--width", "512", "--height", "512", "--scale", "1"], capture_output=True, text=True)
    if not os.path.exists(out): print("FAIL", name, r.stderr[-200:])
    return out


def sheet(name, rows, cols, cell):
    json.dump({"out": name + ".png", "rows": [str(x) for x in rows], "cols": [str(c) for c in cols], "cells": [[cell(r, c) for c in cols] for r in rows]}, open(name + ".json", "w"))
R, CX = 320, 548 + 80*0.30   # shape locked: r=320, centered; ring is the lead, disc kept as candidate
def B(pal="blue", body="gloss", lens="ring", content="white", frag="white"): return build(pal, body, lens, 3, R, round(CX), 512, 0, content, frag)
sheet("sheet7-content-x-fragments", list(CONTENT), list(FRAG), lambda r, c: B(content=r, frag=c))
sheet("sheet8-content-x-palette", ["spectrum", "structured", "tint"], ["blue", "aurora", "mint", "graphite"], lambda r, c: B(c, content=r, frag="gray"))
sheet("sheet9-texture-x-palette", ["gloss", "mesh", "grain"], ["blue", "aurora", "mint", "graphite"], lambda r, c: B(c, body=r, content="structured", frag="gray"))
sheet("sheet10-ring-vs-disc-colored", ["ring", "disc"], ["white", "structured", "spectrum"], lambda r, c: B(lens=r, content=c, frag="gray"))
