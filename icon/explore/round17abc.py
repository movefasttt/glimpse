# round 17 (A/B/C): mandate = lens r320 at x572, original rim (stroke 56*r/240). Single pill per row, 6 rows x 52 px.
# A: left pills only. B: right pills, rows with < 0.8 pill height of room skipped. C: every row, min pill width WMIN, margin from the tightest row.
import os, math, json
D = os.path.dirname(os.path.abspath(__file__))
exec(open(f"{D}/make6.py").read().split("\ndef sheet(")[0])
N, FH, CX, R0 = 6, 52, 572, 320
STEP = (6 * 72 + 40 - FH) / (N - 1)
TRIM = [0.0, 0.35, 0.1, 0.45, 0.0, 0.3]
RO = R0 + 28 * R0 / 240
def halfs(): mid = (N - 1) / 2; return [((i - mid) * STEP, math.sqrt(RO**2 - (abs((i - mid) * STEP) + FH / 2)**2)) for i in range(N)]
def pills(kind, m, g, wmin):
    out = []
    for i, (dy, h) in enumerate(halfs()):
        y = 512 - FH / 2 + dy
        w = (CX - h - g - m) * (1 - TRIM[i]); out.append((CX - h - g - w, y, w))
        if kind == "A": continue
        room = 1024 - m - (CX + h + g); w = room * (1 - TRIM[(i + 3) % N])
        if kind == "B" and w < FH * 0.8: continue
        out.append((CX + h + g, y, max(w, wmin)))
    return out
def V(kind, m, g, wmin):
    global fieldsvg
    if kind == "C": m = math.floor(1024 - (CX + max(h for _, h in halfs()) + g) - wmin)
    ps = pills(kind, m, g, wmin)
    fieldsvg = lambda k, cx, cy, r: svg("".join(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{FH}" rx="{FH/2:.0f}" fill="#fff" opacity="0.8"/>' for x, y, w in ps))
    return build("blue", "gloss", "ring", 3, R0, CX, 512, 0, "tint", "white", None, f"abc{kind}m{m}g{g}w{wmin}"), m
rows = [(56, 14, 64), (40, 10, 50)]; cells, ms = [], []
for m, g, w in rows:
    r = [V(k, m, g, w) for k in "ABC"]; cells.append([c for c, _ in r]); ms.append([x for _, x in r])
json.dump({"out": "sheet-abc.png", "rows": [f"margin {a}/{c}" for a, b, c in ms], "cols": ["A: no right pills", "B: few missing", "C: all rows"], "cells": cells}, open("sheet-abc.json", "w"))
print(ms)

# C-tuck: every row filled, pills run UNDER the ring (start inside the rim stroke) so no rounded cap shows at the lens edge
TUCK = 40   # px under the ring; the rim stroke is 75 px wide, so the pill end stays hidden
def Vt(m, g, wmin, both):
    global fieldsvg
    m = math.floor(1024 - (CX + max(h for _, h in halfs()) + g) - wmin) if m is None else m
    ps = []
    for i, (dy, h) in enumerate(halfs()):
        y = 512 - FH / 2 + dy
        w = (CX - h - g - m) * (1 - TRIM[i]); ps.append((CX - h - g - w, y, w + (g + TUCK if both else 0)))
        w = max((1024 - m - (CX + h + g)) * (1 - TRIM[(i + 3) % N]), wmin) + g + TUCK; ps.append((CX + h - TUCK, y, w))
    fieldsvg = lambda k, cx, cy, r: svg("".join(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{FH}" rx="{FH/2:.0f}" fill="#fff" opacity="0.8"/>' for x, y, w in ps))
    return build("blue", "gloss", "ring", 3, R0, CX, 512, 0, "tint", "white", None, f"tuck{'2' if both else '1'}m{m}w{wmin}")
cells = [[Vt(None, 14, 64, False), Vt(None, 14, 64, True)], [Vt(None, 10, 40, False), Vt(None, 10, 40, True)]]
json.dump({"out": "sheet-tuck.png", "rows": ["min pill 64", "min pill 40"], "cols": ["right pills tucked", "both sides tucked"], "cells": cells}, open("sheet-tuck.json", "w"))
