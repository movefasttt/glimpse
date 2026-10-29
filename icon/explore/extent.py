exec(open("make6.py").read().split("\ndef sheet(")[0])
PAT = [((0,60),(76,50)), ((-20,90),(86,40)), ((10,116),), ((-10,50),(56,70)), ((20,80),)]   # x offsets relative to the original column (right edge 246 = 0 here)
def col(n, cx, cy, r, step=72, fade=True):
    right = cx - r - 42; o = ""; mid = (n - 1) / 2
    for i in range(n):
        y = cy - 20 + (i - mid) * step; op = 0.8 if not fade else 0.8 - 0.35 * (abs(i - mid) / max(mid, 1)) ** 1.5
        for dx, w in PAT[i % 5]: o += f'<rect x="{right - 146 + dx}" y="{y:.0f}" width="{w}" height="40" rx="20" fill="#fff" opacity="{op:.2f}"/>'
    return svg(o)
_old = fieldsvg
fieldsvg = lambda kind, cx, cy, r: col(int(kind[3:].split("-")[0]), cx, cy, r, fade=kind.endswith("fade")) if kind.startswith("col") else _old(kind, cx, cy, r)
def E(n, lens="ring", fade=False): return build("blue", "gloss", lens, 3, 320, round(548 + 80*0.30), 512, 0, "white", "white", "bars", f"col{n}" + ("-fade" if fade else ""))
def sheet(name, rows, cols, cell):
    json.dump({"out": name + ".png", "rows": [str(x) for x in rows], "cols": [str(c) for c in cols], "cells": [[cell(r, c) for c in cols] for r in rows]}, open(name + ".json", "w"))
sheet("sheet14-column-extent", ["5 rows (original)", "7 rows", "9 rows", "11 rows"], ["ring", "disc", "ring, edges fade"], lambda r, c: E(int(r.split()[0]), "disc" if c == "disc" else "ring", "fade" in c))
