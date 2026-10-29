# round 11: from the favorite (tint content, white fragments, ring r320 x572): fragment height x lens content x ring weight; gloss pulled off the top line
import sys, os
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "make6.py")).read().split("\ndef sheet(")[0]
src = src.replace("sw = round(56 * r / 240)", "sw = round(SW * r / 240)")
src = src.replace("arc(205, 262, inner-26*r/240, 20*r/240", "arc(200, 250, inner-14*r/240, 16*r/240")            # rim highlight hugs the rim
src = src.replace("cx-inner*0.45}\" cy=\"{cy-inner*0.50}", "cx-inner*0.60}\" cy=\"{cy-inner*0.66}").replace("rotate(-38 {cx-inner*0.45} {cy-inner*0.50})", "rotate(-38 {cx-inner*0.60} {cy-inner*0.66})")  # hot spot above the text
SW = 56; exec(src)
MESS0 = MESS
MESS_TALL = [(120, 240, 60), (196, 240, 50), (100, 306, 90), (206, 306, 40), (130, 372, 116), (110, 438, 50), (176, 438, 70), (140, 504, 80), (100, 570, 96), (212, 570, 34), (124, 636, 70), (150, 702, 56)]
TEXT = [(370,345,190,62,'#d9f3ff'),(370,432,280,34,'#a9dcff'),(370,486,240,34,'#a9dcff'),(370,540,160,34,'#8ec9ff')]
_shapes = shapes
shapes = lambda k: "".join(R(x,y,w,h,f) for x,y,w,h,f in TEXT) if k == "text" else _shapes(k)
def V(frag, content, sw):
    global MESS, SW
    MESS = MESS_TALL if frag == "tall" else MESS0; SW = 38 if sw == "thin" else 56
    out = build("blue", "gloss", "ring", 3, 320, 572, 512, 0, "tint", "white", "text" if content == "text" else None)
    import shutil, os; new = out.replace(".png", f"-{frag}-{sw}.png"); shutil.move(out, new); return new
rows = [("bars", "ring"), ("bars", "thin"), ("text", "ring"), ("text", "thin")]
cells = [[V(f, c, s) for f in ("now", "tall")] for c, s in rows]
json.dump({"out": "sheet16-round11.png", "rows": [f"{c}/{s}" for c, s in rows], "cols": ["fragments now", "fragments tall"], "cells": cells}, open("sheet16-round11.json", "w"))
