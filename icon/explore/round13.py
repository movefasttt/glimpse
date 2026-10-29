# round 13: bars locked. Fragments on both sides of the lens, right edge of the left column and left edge of the right column on the lens curve;
# lens x solved so the outer margins (left of left fragments, right of right fragments) are equal. Varies lens radius x which rows get right fragments.
import os, math, json
D = os.path.dirname(os.path.abspath(__file__))
exec(open(f"{D}/make6.py").read().split("\ndef sheet(")[0])
PAT = [((0,60),(76,50)), ((-20,90),(86,40)), ((10,116),), ((-10,50),(56,70)), ((20,80),), ((-20,96),(92,34)), ((0,70),)]
RPAT = [(50,), (40,34), (70,), (34,50), (60,), (44,30), (56,)]   # right side: shorter pieces, left-aligned to the curve
N, STEP, GAP, FH = 7, 72, 24, 40
def rects(cx, cy, r, right_rows):
    RO = r + 28 * r / 240; out = []; mid = (N - 1) / 2
    for i in range(N):
        dy = (i - mid) * STEP; y = cy - 20 + dy; half = math.sqrt(RO**2 - (abs(dy) + 20)**2)
        edge = cx - half - GAP
        out += [(edge - 146 + dx, y, w) for dx, w in PAT[i]]
        if i in right_rows:
            x = cx + half + GAP
            for w in RPAT[i]: out.append((x, y, w)); x += w + 16
    return out
def solve_cx(r, right_rows):
    rs = rects(0, 512, r, right_rows); a = min(x for x, y, w in rs); b = max(x + w for x, y, w in rs)
    cx = (1024 - b - a) / 2; return round(cx), round(a + cx)
_f = fieldsvg
def fieldsvg(kind, cx, cy, r):
    if not kind.startswith("both"): return _f(kind, cx, cy, r)
    rows = ROWS[kind[5:]]
    return svg("".join(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w}" height="{FH}" rx="20" fill="#fff" opacity="0.8"/>' for x, y, w in rects(cx, cy, r, rows)))
ROWS = {"outer": {0, 1, 5, 6}, "mid": {2, 3, 4}, "all": set(range(7))}
log = {}
def V(r, rk):
    cx, m = solve_cx(r, ROWS[rk]); log[f"r{r}-{rk}"] = dict(cx=cx, margin=m)
    return build("blue", "gloss", "ring", 3, r, cx, 512, 0, "tint", "white", None, f"both-{rk}")
radii, kinds = [320, 290, 260], ["outer", "mid", "all"]
cells = [[V(r, k) for r in radii] for k in kinds]
json.dump({"out": "sheet18-round13.png", "rows": [f"right: {k}" for k in kinds], "cols": [f"lens r{r}" for r in radii], "cells": cells}, open("sheet18-round13.json", "w"))
print(json.dumps(log))
