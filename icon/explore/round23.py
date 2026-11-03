# round 23: color and texture only, shape locked (round 21 2a: one missing, ragged A). Apple-style coloring: quiet tile (subtle same-hue
# lightening, no gloss sheet, no base glow), color carried by the lens glass. Restyles a copy of the 2a .icon, then re-renders.
# A = light tile + colored lens, B = single-hue tonal, C = dark neutral + glowing lens.
import os, json, re, shutil, subprocess, glob
ICT = "/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool"
BASE = glob.glob(os.path.expanduser("~/glimpse/research/icons/r21-final/*r212a.icon"))[0]
def f(h): return ",".join(f"{int(h[i:i+2],16)/255:.3f}" for i in (1, 3, 5))
S = {  # tile top, tile bottom, ring, ring opacity, lens top, lens bottom, doc colors x3, pill color, pill opacity, keep gloss
 "A1 white, blue lens":     ("#ffffff", "#e9edf3", "#ffffff", 1, "#4c9bff", "#1f5fe0", ["#ffffff", "#e4efff", "#cfe2ff"], "#8e96a3", 0.55, False),
 "A2 white, indigo lens":   ("#ffffff", "#e9edf3", "#ffffff", 1, "#7a7dff", "#4338ca", ["#ffffff", "#e8e7ff", "#d6d4ff"], "#8e96a3", 0.55, False),
 "A3 white, clear lens":    ("#ffffff", "#e9edf3", "#2f7bf6", 1, "#f4f8ff", "#dde9fb", ["#2f7bf6", "#5d9bfa", "#8bb8fc"], "#9aa1ad", 0.5, False),
 "A4 white, blue + accent": ("#ffffff", "#e9edf3", "#ffffff", 1, "#4c9bff", "#1f5fe0", ["#ffd60a", "#e4efff", "#cfe2ff"], "#8e96a3", 0.55, False),
 "A5 pale blue tile":       ("#f4f8ff", "#d9e6fa", "#ffffff", 1, "#3d8bfd", "#1a56db", ["#ffffff", "#e4efff", "#cfe2ff"], "#7f8ea8", 0.5, False),
 "A6 warm paper, blue lens":("#fffdf8", "#efe9de", "#ffffff", 1, "#4c9bff", "#1f5fe0", ["#ffffff", "#e4efff", "#cfe2ff"], "#a39d92", 0.55, False),
 "B1 blue tonal":           ("#2f86ff", "#1660e6", "#a9d0ff", 0.9, "#4a98ff", "#1d6bf0", ["#ffffff", "#d7e9ff", "#b8d6ff"], "#a9d0ff", 0.55, False),
 "B2 indigo tonal":         ("#5b5cf0", "#4338ca", "#c7c6ff", 0.9, "#6d6ef5", "#4a40d6", ["#ffffff", "#e3e2ff", "#c9c7ff"], "#c7c6ff", 0.5, False),
 "B3 teal tonal":           ("#14a3a8", "#0b7d86", "#a6eef0", 0.9, "#22b3b8", "#0e8a92", ["#ffffff", "#d6f7f8", "#b4eef0"], "#a6eef0", 0.5, False),
 "B4 blue tonal, white ring":("#2f86ff", "#1660e6", "#ffffff", 1, "#4a98ff", "#1d6bf0", ["#ffffff", "#d7e9ff", "#b8d6ff"], "#ffffff", 0.5, False),
 "C1 dark, blue lens":      ("#2c2c2e", "#111113", "#e5e5ea", 1, "#3d8bfd", "#1a4fd0", ["#ffffff", "#dbe9ff", "#bcd6ff"], "#8e8e93", 0.5, False),
 "C2 dark, indigo lens":    ("#2c2c2e", "#111113", "#e5e5ea", 1, "#6d6ef5", "#3f37c9", ["#ffffff", "#e3e2ff", "#c9c7ff"], "#8e8e93", 0.5, False),
}
def make(name, s):
    t, b, ring, rop, lt, lb, doc, pc, po, gloss = s
    d = "r23-" + re.sub(r"\W+", "-", name) + ".icon"; shutil.rmtree(d, ignore_errors=True); shutil.copytree(BASE, d)
    j = json.load(open(f"{d}/icon.json"))
    j["fill"] = {"linear-gradient": [f"srgb:{f(t)},1", f"srgb:{f(b)},1"]}
    if not gloss: j["groups"] = [g for g in j["groups"] if g["layers"][0]["image-name"] not in ("gloss.svg", "base.svg")]
    A = f"{d}/Assets"
    r = open(f"{A}/ring.svg").read().replace('stroke="#fff"', f'stroke="{ring}" stroke-opacity="{rop}"', 1); open(f"{A}/ring.svg", "w").write(r)
    m = re.search(r'<circle cx="(\d+)" cy="(\d+)" r="([\d.]+)"', r); cx, cy, ri = m.group(1), m.group(2), float(m.group(3)) - 37
    open(f"{A}/lens.svg", "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><linearGradient id="l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{lt}"/><stop offset="1" stop-color="{lb}"/></linearGradient></defs><circle cx="{cx}" cy="{cy}" r="{ri}" fill="url(#l)"/></svg>')
    front = next(g for g in j["groups"] if any(l["image-name"] == "ring.svg" for l in g["layers"]))
    front["layers"].append({"image-name": "lens.svg", "name": "lens", "glass": True})          # bottom of the front group (listed top-first)
    dv = open(f"{A}/doc.svg").read(); fills = iter(doc)
    dv = re.sub(r'(<rect [^>]*fill=")[^"]*(")', lambda mm: mm.group(1) + next(fills) + mm.group(2), dv); open(f"{A}/doc.svg", "w").write(dv)
    mv = open(f"{A}/mess.svg").read().replace('fill="#fff"', f'fill="{pc}"'); mv = re.sub(r'opacity="[\d.]+"', f'opacity="{po}"', mv); open(f"{A}/mess.svg", "w").write(mv)
    json.dump(j, open(f"{d}/icon.json", "w"), indent=1)
    os.makedirs("png", exist_ok=True); out = f"png/{d[:-5]}.png"
    subprocess.run([ICT, d, "--export-image", "--output-file", out, "--platform", "macOS", "--rendition", "Default", "--width", "512", "--height", "512", "--scale", "1"], capture_output=True)
    if not os.path.exists(out): print("FAIL", name)
    return out
names = list(S); rows = [names[0:6], names[6:10], names[10:12]]
cells = [[make(n, S[n]) for n in row] for row in [names[0:3], names[3:6], names[6:9], names[9:12]]]
json.dump({"out": "sheet-r23.png", "rows": ["", "", "", ""], "cols": ["", "", ""], "cells": cells}, open("sheet-r23.json", "w"))
print("\n".join(" | ".join(r) for r in [names[0:3], names[3:6], names[6:9], names[9:12]]))
