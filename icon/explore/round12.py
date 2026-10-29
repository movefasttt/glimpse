# round 12: favorite (tint bars, white fragments, ring r320 x572, original gloss). Fragments 6/7 rows with the right edge on the lens curve;
# bars keep their shape but their left edge (or both ends) follows the inner lens curve.
import os, math, json
D = os.path.dirname(os.path.abspath(__file__))
exec(open(f"{D}/make6.py").read().split("\ndef sheet(")[0])
src2 = open(f"{D}/extent2.py").read().split("\ndef E(")[0].split("\n", 2)[2]
CX, CY, R_ = 572, 512, 320
exec(src2.replace("CXF = 1024 - M - RO", "CXF = CX"))
k = R_ / 240; RI = (R_ - round(56 * k) / 2) / k          # inner lens radius in pre-scale doc coords (doc is scaled by k about (520,457))
def curved(both):
    o = ""; cols = CONTENT["tint"]
    for i, (x, y, w, h) in enumerate(DOC):
        d = abs(y + h / 2 - 457) + h / 2; half = math.sqrt(RI**2 - d**2)
        left = 520 - half + 34
        right = 520 + half - 34 if both else left + w
        o += R(left, y, right - left, h, cols[i])
    return o
_shapes = shapes
shapes = lambda s: curved(s == "curve2") if s in ("curve1", "curve2") else _shapes(s)
def V(n, bars):
    return build("blue", "gloss", "ring", 3, R_, CX, CY, 0, "tint", "white", None if bars == "now" else bars, f"col{n}")
rows, cols = [6, 7], ["now", "curve1", "curve2"]
json.dump({"out": "sheet17-round12.png", "rows": [f"{n} rows" for n in rows], "cols": ["bars now", "left edge curved", "both ends curved"], "cells": [[V(n, b) for b in cols] for n in rows]}, open("sheet17-round12.json", "w"))
