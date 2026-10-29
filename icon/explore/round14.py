# round 14: r320 lens, bars, fragments on both sides in every row. 6 rows, taller pieces (same total height as 7 rows x 40 px).
# Fragment widths scale down until both outer margins hit the target; lens x solved so left margin == right margin.
import os, math, json
D = os.path.dirname(os.path.abspath(__file__))
exec(open(f"{D}/make6.py").read().split("\ndef sheet(")[0])
PAT = [((0,60),(76,50)), ((-20,90),(86,40)), ((10,116),), ((-10,50),(56,70)), ((20,80),), ((-20,80),(76,60))]   # left: (offset, width), right-anchored at 146
RPAT = [(50,34), (70,), (34,50), (60,), (44,30), (56,)]
N, FH, GAP, R0 = 6, 52, 24, 320
STEP = (6 * 72 + 40 - FH) / (N - 1)          # 6 rows span what 7 rows of 40 px spanned (472 px)
def rects(cx, cy, r, s, rs):
    RO = r + 28 * r / 240; out = []; mid = (N - 1) / 2
    for i in range(N):
        dy = (i - mid) * STEP; y = cy - FH / 2 + dy; half = math.sqrt(RO**2 - (abs(dy) + FH / 2)**2)
        edge = cx - half - GAP
        out += [(edge - (146 - dx) * s, y, w * s) for dx, w in PAT[i]]
        x = cx + half + GAP
        for w in RPAT[i]: out.append((x, y, w * s * rs)); x += (w + 16) * s * rs
    return out
def solve(r, m, rs):
    lo, hi = 0.2, 1.5
    for _ in range(40):
        s = (lo + hi) / 2; rr = rects(0, 512, r, s, rs); a = min(x for x,y,w in rr); b = max(x+w for x,y,w in rr)
        if 1024 - (b - a) > 2 * m: lo = s
        else: hi = s
    return s, round((1024 - b - a) / 2)
CUR = {}
def fieldsvg(kind, cx, cy, r):
    s, rs = CUR["s"], CUR["rs"]
    return svg("".join(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{FH}" rx="{FH/2:.0f}" fill="#fff" opacity="0.8"/>' for x, y, w in rects(cx, cy, r, s, rs)))
log = {}
def V(m, rs):
    s, cx = solve(R0, m, rs); CUR.update(s=s, rs=rs); log[f"m{m}-rs{rs}"] = dict(scale=round(s, 2), cx=cx)
    out = build("blue", "gloss", "ring", 3, R0, cx, 512, 0, "tint", "white", None, f"r14m{m}rs{rs}")
    return out
margins, ratios = [56, 72, 88], [1.0, 0.7]
cells = [[V(m, rs) for m in margins] for rs in ratios]
json.dump({"out": "sheet19-round14.png", "rows": ["right = left width", "right 70%"], "cols": [f"margin {m}" for m in margins], "cells": cells}, open("sheet19-round14.json", "w"))
print(json.dumps(log))

# variant B: one pill per row per side, filling the room between the lens curve and a fixed outer margin (lens centered); ragged via per-row trim
TRIM = [0.0, 0.35, 0.1, 0.45, 0.0, 0.3]
def rectsB(cx, cy, r, m, g):
    RO = r + 28 * r / 240; out = []; mid = (N - 1) / 2
    for i in range(N):
        dy = (i - mid) * STEP; y = cy - FH / 2 + dy; half = math.sqrt(RO**2 - (abs(dy) + FH / 2)**2)
        room = cx - half - g - m; w = room * (1 - TRIM[i]); out.append((cx - half - g - w, y, w))
        room = 1024 - m - (cx + half + g); w = room * (1 - TRIM[(i + 3) % N]); out.append((cx + half + g, y, w))
    return out
def VB(m, g):
    global fieldsvg
    fieldsvg = lambda kind, cx, cy, r: svg("".join(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{FH}" rx="{FH/2:.0f}" fill="#fff" opacity="0.8"/>' for x, y, w in rectsB(cx, cy, r, m, g)))
    return build("blue", "gloss", "ring", 3, R0, 512, 512, 0, "tint", "white", None, f"r14Bm{m}g{g}")
cells = [[VB(m, g) for m in (56, 72)] for g in (14, 24)]
json.dump({"out": "sheet20-round14b.png", "rows": ["gap 14", "gap 24"], "cols": ["margin 56", "margin 72"], "cells": cells}, open("sheet20-round14b.json", "w"))

# variant C (round 15): same single pill per row, lens back at its decided right position (x572); a row whose room is under one pill height is skipped
def rectsC(cx, cy, r, m, g):
    out = []
    for x, y, w in rectsB(cx, cy, r, m, g):
        if w >= FH * 0.8: out.append((x, y, max(w, FH)))
    return out
def VC(m, g, cx=572):
    global fieldsvg
    fieldsvg = lambda kind, cx, cy, r: svg("".join(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{FH}" rx="{FH/2:.0f}" fill="#fff" opacity="0.8"/>' for x, y, w in rectsC(cx, cy, r, m, g)))
    return build("blue", "gloss", "ring", 3, R0, cx, 512, 0, "tint", "white", None, f"r15m{m}g{g}")
if os.environ.get("R15"):
    cells = [[VC(m, g) for m in (40, 56, 72)] for g in (14, 24)]
    json.dump({"out": "sheet21-round15.png", "rows": ["gap 14", "gap 24"], "cols": ["margin 40", "margin 56", "margin 72"], "cells": cells}, open("sheet21-round15.json", "w"))

# variant D (round 16): every row gets a pill on both sides. Lens center stays at x572; margin solved so the tightest right row still fits a
# pill of WMIN; same margin on the left. Varies lens radius.
WMIN, GD = 64, 10
def marginD(cx, r):
    RO = r + 28 * r / 240; mid = (N - 1) / 2
    half = max(math.sqrt(RO**2 - (abs((i - mid) * STEP) + FH / 2)**2) for i in range(N))
    return math.floor(1024 - (cx + half + GD) - WMIN)
def rectsD(cx, cy, r, m):
    return [(x, y, max(w, WMIN)) for x, y, w in rectsB(cx, cy, r, m, GD)]
def VD(r, cx=572):
    global fieldsvg
    m = marginD(cx, r); LOGD[r] = m
    fieldsvg = lambda kind, cx, cy, rr: svg("".join(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{FH}" rx="{FH/2:.0f}" fill="#fff" opacity="0.8"/>' for x, y, w in rectsD(cx, cy, rr, m)))
    return build("blue", "gloss", "ring", 3, r, cx, 512, 0, "tint", "white", None, f"r16m{m}")
LOGD = {}
if os.environ.get("R16"):
    radii = [[320, 300], [280, 260]]
    cells = [[VD(r) for r in row] for row in radii]
    json.dump({"out": "sheet22-round16.png", "rows": ["", ""], "cols": ["", ""], "cells": cells}, open("sheet22-round16.json", "w"))
    lab = json.load(open("sheet22-round16.json")); lab["rows"] = [f"r{radii[0][0]}/r{radii[0][1]}", f"r{radii[1][0]}/r{radii[1][1]}"]; json.dump(lab, open("sheet22-round16.json", "w"))
    print(LOGD)

# variant E (round 17): lens radius locked at 320 and center at x572 (Darwin: never shrink the lens). Only the rim gets thinner; the ring's
# outer edge moves in, which frees room for the right-side pills. Every row has a pill; margin solved as in variant D.
_ls = open(f"{D}/make6.py").read().split("def lensparts(")[1].split("\n\n")[0]
exec("def lensparts(" + _ls.replace("sw = round(56 * r / 240)", "sw = round(SWK * r / 240)"))
SWK = 56
def VE(swk, cx=572, r=320):
    global fieldsvg, SWK
    SWK = swk; RO = r + swk / 2 * r / 240
    mid = (N - 1) / 2
    half = max(math.sqrt(RO**2 - (abs((i - mid) * STEP) + FH / 2)**2) for i in range(N))
    m = math.floor(1024 - (cx + half + GD) - WMIN); LOGE[swk] = dict(stroke=round(swk * r / 240), margin=m)
    def rr(cx, cy, r):
        out = []
        for i in range(N):
            dy = (i - mid) * STEP; y = cy - FH / 2 + dy; h = math.sqrt(RO**2 - (abs(dy) + FH / 2)**2)
            w = (cx - h - GD - m) * (1 - TRIM[i]); out.append((cx - h - GD - w, y, max(w, WMIN)))
            w = (1024 - m - (cx + h + GD)) * (1 - TRIM[(i + 3) % N]); out.append((cx + h + GD, y, max(w, WMIN)))
        return out
    fieldsvg = lambda kind, cx, cy, r: svg("".join(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{FH}" rx="{FH/2:.0f}" fill="#fff" opacity="0.8"/>' for x, y, w in rr(cx, cy, r)))
    out = build("blue", "gloss", "ring", 3, r, cx, 512, 0, "tint", "white", None, f"r17sw{swk}")
    return out
LOGE = {}
if os.environ.get("R17"):
    ks = [[56, 44], [34, 24]]
    cells = [[VE(k) for k in row] for row in ks]
    json.dump({"out": "sheet23-round17.png", "rows": [f"rim {round(row[0]*320/240)} / {round(row[1]*320/240)} px" for row in ks], "cols": ["", ""], "cells": cells}, open("sheet23-round17.json", "w"))
    print(LOGE)
