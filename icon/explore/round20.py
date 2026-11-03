# round 20: clip mode, rows 6/7/8 at the same pill height and step (adds rows top and bottom). Based on round 19: tucked pills (both sides, min 40, margin 51) with a rim that does not show them. Four mechanisms:
# clip = pills cut at the ring's outer edge (ring stays glass); solid = ring layer not glass; notr = lens group translucency off; backer = opaque body-blue ring under the glass ring
import os, math, json
D = os.path.dirname(os.path.abspath(__file__))
src = open(f"{D}/make6.py").read().split("\ndef sheet(")[0]
src = src.replace('L("lens.svg" if lens == "handle" else "ring.svg", tier>1)', 'L("lens.svg" if lens == "handle" else "ring.svg", tier>1 and MODE != "solid")')
src = src.replace('tr=0.35*(tier>1)', 'tr=0.35*(tier>1)*(MODE not in ("notr", "clipnotr"))')
src = src.replace('front = [L("mess.svg")]', 'front = ([L("backer.svg")] if MODE == "backer" else []) + [L("mess.svg")]')
MODE = ""; exec(src)
N, FH, CX, R0, GP, WMIN, TUCK = 6, 52, 572, 320, 10, 40, 40
STEP = (6 * 72 + 40 - FH) / 5; TRIM = [0.2, 0.0, 0.35, 0.1, 0.45, 0.0, 0.3, 0.15]
N = int(os.environ['NROWS'])
SW = round(56 * R0 / 240); RO = R0 + SW / 2
HS = [((i - (N - 1) / 2) * STEP, math.sqrt(RO**2 - (abs((i - (N - 1) / 2) * STEP) + FH / 2)**2)) for i in range(N)]
M = math.floor(1024 - (CX + max(h for _, h in HS) + GP) - WMIN)
PS = []
for i, (dy, h) in enumerate(HS):
    y = 512 - FH / 2 + dy
    w = (CX - h - GP - M) * (1 - TRIM[i % 8]); PS.append((CX - h - GP - w, y, w + GP + TUCK))
    w = max((1024 - M - (CX + h + GP)) * (1 - TRIM[(i + 3) % 8]), WMIN) + GP + TUCK; PS.append((CX + h - TUCK, y, w))
def V(mode, op=0.8):
    global MODE, fieldsvg
    MODE = mode
    clip = f'<clipPath id="k"><path clip-rule="evenodd" d="M0 0H1024V1024H0Z M{CX-RO} 512 a{RO} {RO} 0 1 0 {2*RO} 0 a{RO} {RO} 0 1 0 {-2*RO} 0Z"/></clipPath>' if mode.startswith("clip") else ""
    body = "".join(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{FH}" rx="{FH/2:.0f}" fill="#fff" opacity="{op}"/>' for x, y, w in PS)
    fieldsvg = lambda k, cx, cy, r: svg(f'<g clip-path="url(#k)">{body}</g>' if clip else body, clip)
    out = build("blue", "gloss", "ring", 3, R0, CX, 512, 0, "tint", "white", None, f"r19{mode}")
    if mode == "backer":   # rebuild with the backer asset present
        d = out.replace("png/", "").replace(".png", ".icon")
        open(f"{d}/Assets/backer.svg", "w").write(svg(f'<circle cx="{CX}" cy="512" r="{R0}" fill="none" stroke="#1d5cf2" stroke-width="{SW}"/>'))
        os.remove(out); subprocess.run([ICT, d, "--export-image", "--output-file", out, "--platform", "macOS", "--rendition", "Default", "--width", "512", "--height", "512", "--scale", "1"], capture_output=True)
    return out
print(V("clip"))
