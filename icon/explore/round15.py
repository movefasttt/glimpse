# round 15: KEEP lens r320 at x572 and the left multi-pill column (6 rows x 52 px). Only new thing: right-side fragments,
# fitted between the lens curve and a right margin equal to the left margin. Rows with too little room get no pill (no dots).
import os, math, json
D = os.path.dirname(os.path.abspath(__file__))
exec(open(f"{D}/round14.py").read().split("\nmargins, ratios")[0])
CX = 572
def left(cx, cy, r): return [t for t in rects(cx, cy, r, 1.0, 1.0) if t[0] < cx]
M = round(min(x for x, y, w in left(CX, 512, R0)))
SPLIT = [(0.55, 0.3), (1.0,), (0.4, 0.45), (0.7,), (0.35, 0.5), (0.85,)]   # fractions of the room per row; two-piece rows mimic the left
def right(cx, cy, r, g, minw):
    RO = r + 28 * r / 240; out = []; mid = (N - 1) / 2
    for i in range(N):
        dy = (i - mid) * STEP; y = cy - FH / 2 + dy; half = math.sqrt(RO**2 - (abs(dy) + FH / 2)**2)
        x = cx + half + g; room = 1024 - M - x
        if room < minw: continue
        parts = SPLIT[i] if room >= 2 * minw + 16 else (1.0,)
        for f in parts:
            w = room * f
            if w < FH * 1.1: continue
            out.append((x, y, w)); x += w + 16
    return out
def V(g, minw):
    global fieldsvg
    fieldsvg = lambda kind, cx, cy, r: svg("".join(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{FH}" rx="{FH/2:.0f}" fill="#fff" opacity="0.8"/>' for x, y, w in left(cx, cy, r) + right(cx, cy, r, g, minw)))
    return build("blue", "gloss", "ring", 3, R0, CX, 512, 0, "tint", "white", None, f"r15g{g}w{minw}")
cells = [[V(g, w) for w in (60, 80)] for g in (14, 24)]
json.dump({"out": "sheet21-round15.png", "rows": ["gap 14", "gap 24"], "cols": ["min pill 60", "min pill 80"], "cells": cells}, open("sheet21-round15.json", "w"))
print("left margin", M)
