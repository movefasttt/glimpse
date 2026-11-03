exec(open("make4.py").read().split("LENSES = ")[0])
POS = ["centered", "right", "overlap"]
def at(lens, r, pos):
    cx = 548 + (r-240)*0.30; dx, dy, ov = {"centered": (0,0,0), "right": (40,0,0), "overlap": (40,0,70)}[pos]
    return build("blue", "gloss", lens, 3, r, round(cx+dx), 512+dy, ov)
cells = {(l, p): at(l, 320, p) for l in ("ring", "disc") for p in POS}
json.dump({"out": "final-big.png", "rows": ["ring", "disc"], "cols": POS, "cells": [[cells[(l, p)] for p in POS] for l in ("ring", "disc")]}, open("final-big.json", "w"))
json.dump({k[0] + "-" + k[1]: v for k, v in cells.items()}, open("final-cells.json", "w"))
