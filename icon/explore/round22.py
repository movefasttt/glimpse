# round 22: color. Shape locked (2a / 2c from round 21). Body palettes; lens-content tint derived from each palette's top hue
# (rule: any color in the lens comes from the body hue). Rows: palettes; cols: 2a (pills 0.7), 2c (pills 0.55).
import os, json
D = os.path.dirname(os.path.abspath(__file__))
exec(open(f"{D}/round21.py").read().split("\nrows = [")[0])
def h2f(h): return ",".join(f"{int(h[i:i+2],16)/255:.2f}" for i in (1, 3, 5))
def mix(h, t): return "#" + "".join(f"{round(int(h[i:i+2],16)*(1-t)+255*t):02x}" for i in (1, 3, 5))
NEW = {  # name: (top, bottom)
 "blue":    ("#4d9eff", "#0a4df2"),
 "sky":     ("#7cc4ff", "#2f7fe0"),
 "indigo":  ("#6a7bff", "#2a1fb8"),
 "violet":  ("#a58bff", "#5b2fd6"),
 "teal":    ("#4fe0d0", "#087a8f"),
 "ink":     ("#3a4a7a", "#0b1230"),
 "graphite":("#5a5f6b", "#15171c"),
 "sunset":  ("#ff9a6b", "#d63a6a"),
}
for n, (t, b) in NEW.items():
    PAL[n] = (h2f(t), h2f(b), "#fff", t, b)
    CONTENT[f"tint-{n}"] = [mix(t, 0.85), mix(t, 0.6), mix(t, 0.45)]
def VP(pal, op):
    global build
    _b = build
    build = lambda *a, **k: _b(pal, "gloss", "ring", 3, R0, CX, 512, 0, f"tint-{pal}", "white")
    try: return V(f"{pal}-{op}", 3, RA, op=op)
    finally: build = _b
cells = [[VP(p, 0.7), VP(p, 0.55)] for p in NEW]
json.dump({"out": "sheet-r22.png", "rows": list(NEW), "cols": ["2a pills 0.7", "2c pills 0.55"], "cells": cells}, open("sheet-r22.json", "w"))
