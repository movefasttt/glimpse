# round 26: dark tiles, own tint (the maintainer: "simple is best", darker, Ghostty-like dark blue). Tiles are sampled, not invented:
# Ghostty screen (from /Applications/Ghostty.app icon), Journal, Freeform, Shortcuts, Stocks, Passwords, Xcode body.
# Own tint = the tile's hue at low saturation, full brightness (round 25's mix-with-white read gray on navy).
import os, colorsys
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "round24.py")).read().split("\nnames = list(S)")[0]
exec(src)
def tint(h):
    r, g, b = (int(h[i:i+2], 16) / 255 for i in (1, 3, 5)); hh, ss, _ = colorsys.rgb_to_hsv(r, g, b)
    k = 0 if ss < 0.15 else 1   # neutral tiles (slate, black) get a neutral tint, not a stray hue
    return ["#" + "".join(f"{round(c*255):02x}" for c in colorsys.hsv_to_rgb(hh, s * k, v)) for s, v in ((0.14, 1.0), (0.32, 0.98), (0.45, 0.95))]
T = {
 "Ghostty cobalt":   ("#1346cc", "#0630a3"),
 "Ghostty deep":     ("#0f468a", "#0a2f66"),
 "Ghostty dusk":     ("#4c5983", "#35456d"),
 "Journal":          ("#3e4664", "#2a3048"),
 "Freeform teal":    ("#007291", "#004c5c"),
 "Shortcuts violet": ("#5c31a6", "#3a2691"),
 "Stocks slate":     ("#43484f", "#313232"),
 "Passwords black":  ("#404040", "#191919"),
}
S3 = {k: (t, b, "#ffffff", 1, None, None, tint(b), "#ffffff", 0.5, False) for k, (t, b) in T.items()}
names = list(S3); grid = [names[0:4], names[4:8]]
cells = [[make(n, S3[n]) for n in row] for row in grid]
json.dump({"out": "sheet-r26.png", "rows": ["", ""], "cols": ["", "", "", ""], "cells": cells}, open("sheet-r26.json", "w"))
for n in names: print(n, tint(T[n][1]))
