# round 19/20: mandate r320 / x572 / original rim; original pill texture; margin 40. Right pills get a ragged right end: width = room - JAG[i],
# floored at WMIN (a pill that would go under WMIN keeps WMIN and pushes into the margin). B skips only the single tightest row.
import os, math, json, subprocess
D = os.path.dirname(os.path.abspath(__file__))
exec(open(f"{D}/make6.py").read().split("\ndef sheet(")[0])
N, FH, CX, R0, GP, M, WMIN = 6, 52, 572, 320, 10, 40, 52
STEP = (472 - FH) / (N - 1)
TRIM = [0.0, 0.35, 0.1, 0.45, 0.0, 0.3]
RO = R0 + 28 * R0 / 240
JAGS = {"ragged A": [60, 0, 0, 0, 25, 0], "ragged B": [0, 24, 0, 0, 0, 70], "ragged C": [30, 0, 0, 0, 24, 82]}   # trims chosen so right ends do NOT trace the lens curve
def pills(kind, jag):
    out = []; mid = (N - 1) / 2
    for i in range(N):
        dy = (i - mid) * STEP; y = 512 - FH / 2 + dy; h = math.sqrt(RO**2 - (abs(dy) + FH / 2)**2)
        w = (CX - h - GP - M) * (1 - TRIM[i]); out.append((CX - h - GP - w, y, w))
        if kind == "B" and i == 3: continue
        room = 1024 - M - (CX + h + GP); out.append((CX + h + GP, y, max(room - jag[i], WMIN)))
    return out
def V(kind, jn):
    out = build("blue", "gloss", "ring", 3, R0, CX, 512, 0, "tint", "white")
    d = out.replace("png/", "").replace(".png", ".icon"); nd = d.replace(".icon", f"-r20{kind}-{jn.split()[1]}.icon")
    subprocess.run(["rm", "-rf", nd]); os.rename(d, nd)
    open(f"{nd}/Assets/mess.svg", "w").write(svg("".join(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{FH}" rx="{FH/2:.0f}" fill="#fff" opacity="0.7"/>' for x, y, w in pills(kind, JAGS[jn]))))
    po = f"png/{nd[:-5]}.png"
    subprocess.run([ICT, nd, "--export-image", "--output-file", po, "--platform", "macOS", "--rendition", "Default", "--width", "512", "--height", "512", "--scale", "1"], capture_output=True)
    return po
json.dump({"out": "sheet-r20.png", "rows": ["one missing", "all rows"], "cols": list(JAGS), "cells": [[V(k, j) for j in JAGS] for k in "BC"]}, open("sheet-r20.json", "w"))
