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

def build(pal, body, tier):
    top, bot, ink, hx_top, hx_bot = PAL[pal]; A = {}; gs = []
    fill = {"solid": f"srgb:{bot},1"} if tier == 1 else {"linear-gradient": [f"srgb:{top},1", f"srgb:{bot},1"]}
    scale = 0.84 if body == "rim" else 1.0
    A.update(glyphs(ink, scale)); front = [L("mess.svg"), L("lens.svg", tier>1), L("doc.svg", tier>1)]
    fx = dict(sh=0.5*(tier>1), tr=0.35*(tier>1), **({"specular": True} if tier==3 else {}))
    if body == "gloss" and tier > 1:
        A["gloss.svg"] = svg('<path d="M0 0H1024V430C800 500 224 500 0 430Z" fill="url(#g)"/>', lg("g", [(0,"#fff",0.5),(1,"#fff",0.04)]))
        gs.append(G([L("gloss.svg")]))
        if tier == 3:
            A["base.svg"] = svg('<ellipse cx="512" cy="1060" rx="640" ry="300" fill="url(#r)"/>', '<radialGradient id="r"><stop offset="0" stop-color="#fff" stop-opacity="0.6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>')
            gs.append(G([L("base.svg", opacity=0.6)]))
    if body == "rim":  # Ghostty-style: light metal rim, dark hairline, inset panel in the palette color
        fill = {"linear-gradient": ["srgb:0.97,0.97,0.99,1", "srgb:0.55,0.55,0.60,1"]}
        A["ring.svg"] = svg('<rect x="64" y="64" width="896" height="896" rx="215" fill="#0b0b0f" opacity="0.85"/>')
        A["panel.svg"] = svg(f'<rect x="84" y="84" width="856" height="856" rx="196" fill="url(#p)"/>', lg("p", [(0,hx_top,1),(1,hx_bot,1)]))
        gs.append(G([L("ring.svg"), L("panel.svg", tier==3)]))
        if tier == 3:
            A["sheen.svg"] = svg('<ellipse cx="512" cy="150" rx="400" ry="130" fill="url(#h)"/>', lg("h", [(0,"#fff",0.4),(1,"#fff",0)]))
            gs.append(G([L("sheen.svg")]))
    if body == "pane":  # frosted pane behind the composition
        A["pane.svg"] = svg('<rect x="150" y="150" width="724" height="724" rx="150" fill="#fff" opacity="0.16"/>')
        gs.append(G([L("pane.svg", tier>1)], sh=0.3*(tier>1), tr=0.7*(tier>1), **({"blur-material": 0.6} if tier==3 else {})))
    gs.append(G(front, **fx))
    gs = [dict(g, layers=g["layers"][::-1]) for g in gs][::-1]   # icon.json lists top-first
    name = f"{pal}-{body}-{tier}"; d = f"{name}.icon"; shutil.rmtree(d, ignore_errors=True); os.makedirs(d + "/Assets")
    for f, s in A.items(): open(f"{d}/Assets/{f}", "w").write(s)
    json.dump({"fill": fill, "groups": gs, "supported-platforms": {"squares": ["macOS"]}}, open(d + "/icon.json", "w"), indent=1)
    os.makedirs("png", exist_ok=True); out = f"png/{name}.png"
    r = subprocess.run([ICT, d, "--export-image", "--output-file", out, "--platform", "macOS", "--rendition", "Default", "--width", "512", "--height", "512", "--scale", "1"], capture_output=True, text=True)
    if not os.path.exists(out): print("FAIL", name, r.stderr[-200:])
    return out

BODIES = ["flat", "gloss", "rim", "pane"]
sheets = {
 "sheet1-body-x-tier": {"rows": BODIES, "cols": [1,2,3], "cell": lambda r,c: build("blue", r, c)},
 "sheet2-palette-x-body": {"rows": list(PAL), "cols": BODIES, "cell": lambda r,c: build(r, c, 3)},
}
for sn, s in sheets.items():
    json.dump({"out": sn + ".png", "rows": s["rows"], "cols": [str(c) for c in s["cols"]], "cells": [[s["cell"](r, c) for c in s["cols"]] for r in s["rows"]]}, open(sn + ".json", "w"))
