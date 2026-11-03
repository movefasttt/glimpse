# round 28: rim color/texture only. Base = color 01 (#1346cc->#0630a3), own tint, shape locked. Ring geometry untouched:
# only the stroke paint (solid / opacity / gradient) of ring.svg changes; the inner hairline stays.
import os, re
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "round26.py")).read().split("\nT = {")[0]
exec(src)
TOP, BOT = "#1346cc", "#0630a3"; TN = tint(BOT)
def lg(stops, x2=0, y2=1): return f'<linearGradient id="rg" x1="0" y1="0" x2="{x2}" y2="{y2}">' + "".join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o, c, a in stops) + "</linearGradient>"
RIMS = {
 "01 white (now)":          (None, "#ffffff", 1),
 "02 white 80%":            (None, "#ffffff", 0.8),
 "03 frosted glass 55%":    (None, "#ffffff", 0.55),
 "04 tint, lightest":       (None, TN[0], 1),
 "05 tint, mid":            (None, TN[1], 1),
 "06 white->tint":          (lg([(0, "#ffffff", 1), (1, TN[1], 1)]), "url(#rg)", 1),
 "07 aluminum":             (lg([(0, "#f5f6f8", 1), (0.5, "#c9ccd2", 1), (1, "#9a9ea6", 1)]), "url(#rg)", 1),
 "08 chrome":               (lg([(0, "#ffffff", 1), (0.35, "#b8bcc4", 1), (0.5, "#eef0f3", 1), (0.75, "#8d929b", 1), (1, "#d9dce1", 1)]), "url(#rg)", 1),
 "09 diagonal sheen":       (lg([(0, "#ffffff", 1), (0.5, "#d6e0f5", 1), (1, "#ffffff", 0.75)], 1, 1), "url(#rg)", 1),
 "10 graphite":             (lg([(0, "#5b616b", 1), (1, "#2a2e35", 1)]), "url(#rg)", 1),
 "11 deep navy (recessed)": (lg([(0, "#0b2a7a", 1), (1, "#051a52", 1)]), "url(#rg)", 1),
 "12 tile-hue light":       (lg([(0, "#5d86ec", 1), (1, "#2a55c8", 1)]), "url(#rg)", 1),
}
def rim(name, defs, paint, op):
    s = (TOP, BOT, "#ffffff", 1, None, None, TN, "#ffffff", 0.5, False)
    out = make(name, s); d = "r23-" + re.sub(r"\W+", "-", name) + ".icon"; f = f"{d}/Assets/ring.svg"
    r = open(f).read().replace('stroke="#ffffff" stroke-opacity="1"', f'stroke="{paint}" stroke-opacity="{op}"', 1)
    if defs: r = r.replace('viewBox="0 0 1024 1024">', 'viewBox="0 0 1024 1024"><defs>' + defs + '</defs>', 1)
    open(f, "w").write(r); os.remove(out)
    subprocess.run([ICT, d, "--export-image", "--output-file", out, "--platform", "macOS", "--rendition", "Default", "--width", "512", "--height", "512", "--scale", "1"], capture_output=True)
    return out
names = list(RIMS); grid = [names[i:i+4] for i in range(0, 12, 4)]
cells = [[rim(n, *RIMS[n]) for n in row] for row in grid]
json.dump({"out": "sheet-r28.png", "rows": ["01-04", "05-08", "09-12"], "cols": ["", "", "", ""], "cells": cells}, open("sheet-r28.json", "w"))
