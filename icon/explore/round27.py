# round 27: top row of round 26 survives (Ghostty cobalt, deep, dusk, Journal). 20 tiles on a continuous scale through those four
# sampled anchors (top and bottom colors interpolated in sRGB along cobalt -> deep -> dusk -> Journal). Own tint as round 26.
import os
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "round26.py")).read().split("\nT = {")[0]
exec(src)
A = [("#1346cc", "#0630a3"), ("#0f468a", "#0a2f66"), ("#4c5983", "#35456d"), ("#3e4664", "#2a3048")]
def lerp(a, b, t): return "#" + "".join(f"{round(int(a[i:i+2],16)*(1-t)+int(b[i:i+2],16)*t):02x}" for i in (1, 3, 5))
pts = []
for n in range(20):
    u = n / 19 * 3; i = min(int(u), 2); t = u - i
    pts.append((lerp(A[i][0], A[i+1][0], t), lerp(A[i][1], A[i+1][1], t)))
S4 = {f"{n+1:02d}": (t, b, "#ffffff", 1, None, None, tint(b), "#ffffff", 0.5, False) for n, (t, b) in enumerate(pts)}
names = list(S4); grid = [names[i:i+5] for i in range(0, 20, 5)]
cells = [[make(n, S4[n]) for n in row] for row in grid]
json.dump({"out": "sheet-r27.png", "rows": [f"{r[0]}-{r[-1]}" for r in grid], "cols": ["", "", "", "", ""], "cells": cells}, open("sheet-r27.json", "w"))
for n, (t, b) in zip(names, pts): print(n, t, b)
