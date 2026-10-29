# round 29: rim survivors 02 white-opacity, 04 tint, 06 white->tint, 09 diagonal sheen (the maintainer). Four intensity steps of each on color 01.
import os
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "round28.py")).read().split("\nRIMS = {")[0]
exec(src)
src28 = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "round28.py")).read()
exec("def rim(" + src28.split("\ndef rim(")[1].split("\nnames = list(RIMS)")[0])
def mix(a, b, t): return "#" + "".join(f"{round(int(a[i:i+2],16)*(1-t)+int(b[i:i+2],16)*t):02x}" for i in (1, 3, 5))
R = {}
for o in (0.9, 0.8, 0.7, 0.6):       R[f"02 white {int(o*100)}%"] = (None, "#ffffff", o)
for t in (0.0, 0.35, 0.65, 1.0):     R[f"04 tint {int(t*100)}"] = (None, mix(TN[0], TN[1], t), 1)
for t in (0.5, 1.0, 1.5, 2.0):       R[f"06 white->tint x{t}"] = (lg([(0, "#ffffff", 1), (1, mix(TN[0], TN[2], min(t / 2, 1)), 1)]), "url(#rg)", 1)
for a in (0.15, 0.35, 0.55, 0.8):    R[f"09 sheen {int(a*100)}"] = (lg([(0, "#ffffff", 1), (0.5, mix("#ffffff", "#9fb4e6", a), 1), (1, "#ffffff", 1 - a / 3)], 1, 1), "url(#rg)", 1)
names = list(R); grid = [names[i:i+4] for i in range(0, 16, 4)]
cells = [[rim(n, *R[n]) for n in row] for row in grid]
json.dump({"out": "sheet-r29.png", "rows": ["02 white opacity", "04 tint", "06 white->tint", "09 sheen"], "cols": ["lighter", "", "", "stronger"], "cells": cells}, open("sheet-r29.json", "w"))
