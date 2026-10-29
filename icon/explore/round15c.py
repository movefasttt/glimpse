# round 15: r320 centered, margin 56, gap 14, 6 rows x 52 px. Fragment placement variants on both sides; pieces under MINW are dropped (no dots).
import os, math, json
D = os.path.dirname(os.path.abspath(__file__))
exec(open(f"{D}/make6.py").read().split("\ndef sheet(")[0])
N, FH, M, GP, R0, CX = 6, 52, 56, 14, 320, 512
import sys; CX = int(sys.argv[1])
STEP = (472 - FH) / (N - 1); RO = R0 + 28 * R0 / 240; MINW = 1.3 * FH; SP = 14
def rooms(i):
    dy = (i - (N - 1) / 2) * STEP; half = math.sqrt(RO**2 - (abs(dy) + FH / 2)**2)
    return 512 - FH / 2 + dy, (CX - half - GP - M, 1024 - M - CX - half - GP)   # y, (left room, right room)
# each variant: per row, (left pieces, right pieces); pieces as fractions of the room, laid out from an anchor
# anchor 'out' = start at the outer margin, 'in' = start at the lens curve
def lay(y, room, fracs, anchor, side):
    out = []; x = 0
    fracs = [f for f in fracs if f > 0] or [1]
    if len(fracs) > 1 and min(fracs) * room < MINW: fracs = [max(sum(fracs), 0.6)]     # too tight for two words: one pill
    for f in fracs:
        w = min(max(f * room, MINW), room - x); out.append((x, w)); x += w + SP        # every row keeps a pill, never a dot
    if not out: return []
    res = []
    for x0, w in out:
        d = x0 if anchor == "out" else x0   # distance from the anchor edge
        if side == "L": X = M + d if anchor == "out" else (M + room) - d - w
        else:           X = 1024 - M - d - w if anchor == "out" else (1024 - M - room) + d
        res.append((X, y, w))
    return res
V = {
 "1 one pill, ragged in":      ([[1],[.7],[.9],[.6],[1],[.75]], "out", [[.75],[1],[.6],[.9],[.7],[1]], "out"),
 "2 one pill, ragged out":     ([[1],[.7],[.9],[.6],[1],[.75]], "in",  [[.75],[1],[.6],[.9],[.7],[1]], "in"),
 "3 line behind lens":         ([[1],[1],[1],[1],[1],[1]], "out", [[.8],[.55],[1],[.7],[.9],[.45]], "in"),
 "4 two-word rows":            ([[.45,.4],[.7],[.3,.55],[.85],[.5,.35],[.65]], "in", [[.6],[.4,.45],[.8],[.35,.5],[.7],[.45,.3]], "in"),
 "5 mirror":                   ([[.9],[.6],[1],[.7],[.85],[.55]], "in", [[.9],[.6],[1],[.7],[.85],[.55]], "in"),
 "6 outer rows only right":    ([[1],[.7],[.9],[.6],[1],[.75]], "in", [[1],[.7],[0],[0],[.75],[1]], "in"),
 "7 taper to center":          ([[1],[.8],[.6],[.6],[.8],[1]], "in", [[1],[.8],[.6],[.6],[.8],[1]], "in"),
 "8 swell to center":          ([[.55],[.8],[1],[1],[.8],[.55]], "in", [[.55],[.8],[1],[1],[.8],[.55]], "in"),
 "9 diagonal flow":            ([[1],[.85],[.7],[.55],[.4],[.3]], "in", [[.3],[.4],[.55],[.7],[.85],[1]], "in"),
}
CUR = {}
def fieldsvg(kind, cx, cy, r):
    L, la, Rr, ra = V[CUR["k"]]; rs = []
    for i in range(N):
        y, room = rooms(i); rs += lay(y, room[0], L[i], la, "L") + lay(y, room[1], Rr[i], ra, "R")
    return svg("".join(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{FH}" rx="{FH/2:.0f}" fill="#fff" opacity="0.8"/>' for x, y, w in rs))
def cell(k):
    CUR["k"] = k; return build("blue", "gloss", "ring", 3, R0, CX, 512, 0, "tint", "white", None, f"r15c{CX}-" + k.split()[0])
cells = [[cell(k) for k in ("2 one pill, ragged out", "8 swell to center")]]
json.dump({"out": f"sheet23-x{CX}.png", "rows": [f"lens x {CX}"], "cols": ["a2", "c2"], "cells": cells}, open(f"sheet23-x{CX}.json", "w"))
