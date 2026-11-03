import math
exec(open("make6.py").read().split("\ndef sheet(")[0])
PAT = [((0,60),(76,50)), ((-20,90),(86,40)), ((10,116),), ((-10,50),(56,70)), ((20,80),)]
R_LENS, M = 320, 79                       # lens radius (locked); side margin: left of fragments == right of lens
RO = R_LENS + 28                           # outer radius of the ring
CXF = 1024 - M - RO                        # lens center x so the right margin is M  (= 597)
def col(n, cx, cy, r, step=72, fade=False, gap=24):
    o = ""; mid = (n - 1) / 2
    for i in range(n):
        dy = (i - mid) * step; y = cy - 20 + dy
        right = cx - math.sqrt(RO**2 - (abs(dy) + 20)**2) - gap          # follows the lens curve: round, no vertical cut
        op = 0.8 if not fade else 0.8 - 0.35 * (abs(i - mid) / max(mid, 1)) ** 1.5
        for dx, w in PAT[i % 5]: o += f'<rect x="{right - 146 + dx:.0f}" y="{y:.0f}" width="{w}" height="40" rx="20" fill="#fff" opacity="{op:.2f}"/>'
    return svg(o)
_old = fieldsvg
fieldsvg = lambda kind, cx, cy, r: col(int(kind[3:].split("-")[0]), cx, cy, r, fade=kind.endswith("fade")) if kind.startswith("col") else _old(kind, cx, cy, r)
def E(n, fade=False): return build("blue", "gloss", "ring", 3, R_LENS, CXF, 512, 0, "white", "white", None, f"col{n}" + ("-fade" if fade else ""))
def sheet(name, rows, cols, cell):
    json.dump({"out": name + ".png", "rows": [str(x) for x in rows], "cols": [str(c) for c in cols], "cells": [[cell(r, c) for c in cols] for r in rows]}, open(name + ".json", "w"))
sheet("sheet15-round-edge", ["5 rows", "7 rows", "9 rows"], ["ring", "ring, outer rows fade"], lambda r, c: E(int(r.split()[0]), "fade" in c))
