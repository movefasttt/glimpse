# round 18: mandate r320 / x572 / original rim. Pills get the original fragment texture: drawn in mess.svg inside the glass front group,
# white at 0.7 (the field layer sat outside the glass group at 0.8, which read brighter). B: rows without room skipped. C: every row; the
# margin stays fixed on both sides and the tightest right rows take whatever room they have (round 17 shrank both margins to fit a min width).
import os, math, json, subprocess
D = os.path.dirname(os.path.abspath(__file__))
exec(open(f"{D}/make6.py").read().split("\ndef sheet(")[0])
N, FH, CX, R0, GP = 6, 52, 572, 320, 10
STEP = (472 - FH) / (N - 1)
TRIM = [0.0, 0.35, 0.1, 0.45, 0.0, 0.3]
RO = R0 + 28 * R0 / 240
def pills(kind, m):
    out = []; mid = (N - 1) / 2
    for i in range(N):
        dy = (i - mid) * STEP; y = 512 - FH / 2 + dy; h = math.sqrt(RO**2 - (abs(dy) + FH / 2)**2)
        w = (CX - h - GP - m) * (1 - TRIM[i]); out.append((CX - h - GP - w, y, w))
        room = 1024 - m - (CX + h + GP)
        if kind == "B":
            w = room * (1 - TRIM[(i + 3) % N])
            if w >= FH * 0.8: out.append((CX + h + GP, y, w))
        else:
            w = room * (1 - TRIM[(i + 3) % N]) if room * (1 - TRIM[(i + 3) % N]) >= FH else room   # tight rows keep their full room
            out.append((CX + h + GP, y, w))
    return out
def V(kind, m):
    out = build("blue", "gloss", "ring", 3, R0, CX, 512, 0, "tint", "white")
    d = out.replace("png/", "").replace(".png", ".icon"); nd = d.replace(".icon", f"-r18{kind}m{m}.icon")
    subprocess.run(["rm", "-rf", nd]); os.rename(d, nd)
    open(f"{nd}/Assets/mess.svg", "w").write(svg("".join(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{FH}" rx="{FH/2:.0f}" fill="#fff" opacity="0.7"/>' for x, y, w in pills(kind, m))))
    po = f"png/{nd[:-5]}.png"
    subprocess.run([ICT, nd, "--export-image", "--output-file", po, "--platform", "macOS", "--rendition", "Default", "--width", "512", "--height", "512", "--scale", "1"], capture_output=True)
    return po
cols = [("B", 40), ("B", 56), ("C", 40), ("C", 48)]
json.dump({"out": "sheet-r18.png", "rows": ["original texture"], "cols": [f"{'few missing' if k == 'B' else 'all rows'}, m{m}" for k, m in cols], "cells": [[V(k, m) for k, m in cols]]}, open("sheet-r18.json", "w"))
