# round 24: tile colors sampled from Apple's own macOS 26 icons (sips + NSBitmapImageRep, top 13% / bottom 87% of the icon), not invented.
# Apple's colored tiles: one hue, brighter at the top, glyph in white glass. Shape locked (2a). Lens clear (no fill) unless noted.
import os, sys
sys.argv = [sys.argv[0]]
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "round23.py")).read().split("\nnames = list(S)")[0]
exec(src)
W = ["#ffffff", "#ffffff", "#ffffff"]
S = {  # name: tile top, tile bottom (sampled), ring, ring op, lens top/bottom (None = clear), doc, pill color, pill op, gloss
 "Mail":       ("#00adff", "#0090ff", "#ffffff", 1, None, None, W, "#ffffff", 0.55, False),
 "Weather":    ("#3db0ff", "#1d89e2", "#ffffff", 1, None, None, W, "#ffffff", 0.55, False),
 "App Store":  ("#00a4fa", "#1e7bee", "#ffffff", 1, None, None, W, "#ffffff", 0.55, False),
 "Keynote":    ("#21d2fd", "#1d82f4", "#ffffff", 1, None, None, W, "#ffffff", 0.55, False),
 "Freeform":   ("#007291", "#004c5c", "#bbfdff", 1, None, None, W, "#bbfdff", 0.5, False),
 "Shortcuts":  ("#5c31a6", "#3a2691", "#ffffff", 1, None, None, W, "#ffffff", 0.5, False),
 "Podcasts":   ("#a455cd", "#8e47b1", "#ffffff", 1, None, None, W, "#ffffff", 0.55, False),
 "Journal":    ("#3e4664", "#2a3048", "#ffffff", 1, None, None, W, "#ffffff", 0.45, False),
 "Passwords dark":("#404040", "#191919", "#ffffff", 1, None, None, W, "#ffffff", 0.4, False),
 "Dark + Mail lens":("#404040", "#191919", "#ffffff", 1, "#00adff", "#0090ff", W, "#ffffff", 0.4, False),
 "White + Mail lens":("#fffeff", "#efefef", "#ffffff", 1, "#00adff", "#0090ff", W, "#b0b0b5", 0.6, False),
 "Mail, gloss kept":("#00adff", "#0090ff", "#ffffff", 1, None, None, W, "#ffffff", 0.55, True),
}
_make = make
def make(name, s):
    if s[4] is None:   # clear lens: render via make, then drop the lens-fill layer and re-render
        out = _make(name, s[:4] + ("#000000", "#000000") + s[6:])
        d = "r23-" + re.sub(r"\W+", "-", name) + ".icon"; j = json.load(open(f"{d}/icon.json"))
        for g in j["groups"]: g["layers"] = [l for l in g["layers"] if l["image-name"] != "lens.svg"]
        json.dump(j, open(f"{d}/icon.json", "w"), indent=1); os.remove(out)
        subprocess.run([ICT, d, "--export-image", "--output-file", out, "--platform", "macOS", "--rendition", "Default", "--width", "512", "--height", "512", "--scale", "1"], capture_output=True)
        return out
    return _make(name, s)
names = list(S); grid = [names[i:i+4] for i in range(0, 12, 4)]
cells = [[make(n, S[n]) for n in row] for row in grid]
json.dump({"out": "sheet-r24.png", "rows": ["  ".join(r) for r in [["1","2","3","4"],["5","6","7","8"],["9","10","11","12"]]], "cols": ["", "", "", ""], "cells": cells}, open("sheet-r24.json", "w"))
for i, n in enumerate(names): print(i + 1, n)
