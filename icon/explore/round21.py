# round 21: final shortlist variations. Survivors: all rows + ragged A, one missing + ragged A, one missing + jag small.
# Columns vary one thing each: as chosen / other left trim pattern / softer pills (0.55) / other missing row (or, for all rows, other right trims).
import os, math, json, subprocess
D = os.path.dirname(os.path.abspath(__file__))
exec(open(f"{D}/make6.py").read().split("\ndef sheet(")[0])
N, FH, CX, R0, GP, M, WMIN = 6, 52, 572, 320, 10, 40, 52
STEP = (472 - FH) / (N - 1); RO = R0 + 28 * R0 / 240
TRIM, TRIM2 = [0.0, 0.35, 0.1, 0.45, 0.0, 0.3], [0.3, 0.0, 0.4, 0.1, 0.35, 0.0]
RA, JS, RA2 = [60, 0, 0, 0, 25, 0], [20, 0, 0, 0, 30, 6], [0, 20, 0, 0, 0, 60]
def pills(miss, jag, trim):
    out = []; mid = (N - 1) / 2
    for i in range(N):
        dy = (i - mid) * STEP; y = 512 - FH / 2 + dy; h = math.sqrt(RO**2 - (abs(dy) + FH / 2)**2)
        w = (CX - h - GP - M) * (1 - trim[i]); out.append((CX - h - GP - w, y, w))
        if i == miss: continue
        room = 1024 - M - (CX + h + GP); out.append((CX + h + GP, y, max(room - jag[i], WMIN)))
    return out
def V(tag, miss, jag, trim=TRIM, op=0.7):
    out = build("blue", "gloss", "ring", 3, R0, CX, 512, 0, "tint", "white")
    d = out.replace("png/", "").replace(".png", ".icon"); nd = d.replace(".icon", f"-r21{tag}.icon")
    subprocess.run(["rm", "-rf", nd]); os.rename(d, nd)
    open(f"{nd}/Assets/mess.svg", "w").write(svg("".join(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{FH}" rx="{FH/2:.0f}" fill="#fff" opacity="{op}"/>' for x, y, w in pills(miss, jag, trim))))
    po = f"png/{nd[:-5]}.png"
    subprocess.run([ICT, nd, "--export-image", "--output-file", po, "--platform", "macOS", "--rendition", "Default", "--width", "512", "--height", "512", "--scale", "1"], capture_output=True)
    return po
rows = [("1 all rows, ragged A", None, RA, RA2), ("2 one missing, ragged A", 3, RA, None), ("3 one missing, jag small", 3, JS, None)]
cells = []
for name, miss, jag, alt in rows:
    t = name[0]
    cells.append([V(f"{t}a", miss, jag), V(f"{t}b", miss, jag, TRIM2), V(f"{t}c", miss, jag, op=0.55),
                  V(f"{t}d", miss, alt) if alt else V(f"{t}d", 2, jag)])
json.dump({"out": "sheet-r21.png", "rows": [r[0] for r in rows], "cols": ["as chosen", "other left pattern", "softer pills", "other right/missing row"], "cells": cells}, open("sheet-r21.json", "w"))
