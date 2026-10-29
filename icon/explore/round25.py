# round 25: round 24 set the lens bars to plain white (regression, my mistake). Restore the tint: original blue tint (#d9f3ff/#a9dcff/#8ec9ff)
# vs a tint mixed from the tile's own top color. Journal leads (the maintainer: "sleek"); Mail, Keynote, Freeform for comparison. No lens fill (the maintainer).
import os, sys
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "round24.py")).read().split("\nnames = list(S)")[0]
exec(src)
def mix(h, t): return "#" + "".join(f"{round(int(h[i:i+2],16)*(1-t)+255*t):02x}" for i in (1, 3, 5))
BT = ["#d9f3ff", "#a9dcff", "#8ec9ff"]
def hue(top): return [mix(top, 0.85), mix(top, 0.62), mix(top, 0.48)]
base = {k: S[k] for k in ("Journal", "Mail", "Keynote", "Freeform")}
S2 = {}
for k, s in base.items():
    S2[f"{k} blue tint"] = s[:6] + (BT,) + s[7:]
    S2[f"{k} own tint"] = s[:6] + (hue(s[0]),) + s[7:]
names = list(S2); grid = [names[i:i+4] for i in range(0, 8, 4)]
cells = [[make(n, S2[n]) for n in row] for row in grid]
json.dump({"out": "sheet-r25.png", "rows": ["Journal | Mail", "Keynote | Freeform"], "cols": ["blue tint", "own tint", "blue tint", "own tint"], "cells": cells}, open("sheet-r25.json", "w"))
