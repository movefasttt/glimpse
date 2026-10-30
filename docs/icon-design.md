# Icon design method (Glimpse)

Direction: macOS 26 Liquid Glass feel, not a flat tile. One icon only, no separate dark-mode art (the maintainer, 2026-10-29). Scripts: `icon/explore/` (`make5.py` is current; `sheet.swift` draws grids). Renders go through Icon Composer's `ictool`, one Default rendition.

## Method
Split the design into independent axes, vary one at a time, render a grid, decide, lock, move on. Decide **shape/composition first, color last** (color is cheap to swap, shape is not). Keep two or three live candidates until the data separates them; cut with a stated reason. Always check 128/64/32/16 px before liking something.

## Decided (the maintainer)
| Call | Date | Why |
|------|------|-----|
| Keep the story: torn text fragments left, a glass lens with clean text inside | 10-29 | It is the product (messy in, readable out) |
| Cut the **rim/bezel** body | 10-29 | Too close to Ghostty, whose icon is a terminal bezel. A bezel of our own could return |
| Cut the **handle** | 10-29 | Reads as a lens, not as "search" |
| Cut **thick** rim | 10-29 | Text crowds the rim |
| Cut **overlap** (fragments tucked behind the lens) and **low-right** position | 10-29 | Turns to noise at 64 px / looks off |
| Lens radius **320**, bigger and not dead-center | 10-29 | The glass should be the hero |
| **Never shrink the lens** (r320) or move it off its right-of-center position (x572); free space only by thinning the rim | 10-29 | the maintainer, after rounds 13-16 traded lens size for margin |
| Palette is a late decision | 10-29 | Decide shape and texture first |
| **Mandate**: lens radius 320, center x572 (right of center), original rim width (stroke 56*r/240 = 75 px) | 10-29 | Do not shrink, move or thin the lens to make room; work around it |
| Lens content: the three tint bars, left-aligned (no heading+text, no curved bar edges) | 10-29 | Bars kept after rounds 11-12 |
| Fragments: one pill per row on both sides, every row filled | 10-29 | Multi-piece rows scaled into vertical dots; empty rows look broken |
| **7 rows**, pill height 52, step 84 | 10-29 | 6 too sparse, 8 boxes the lens in (round 20) |
| Undecided: whether pills tuck under the rim (overlap); if they do, clip vs opaque rim | 10-29 | Rounds 18-19 |

## Still open (live candidates)
- **ring vs disc**: the maintainer leans ring (disc looks fuzzy; its 1.12x magnified text crowds the rim). Disc is a fallback.
- **centered vs right**: the maintainer leans centered; they differ by about 40 px.
- **Favorite (the maintainer 10-29, next session)**: tint lens content + white fragments (`lens/png/...-tint-white.png`). Fragments need more vertical spread (top and bottom). Color still bad; fix after shape/texture.
- Content inside the lens: tint leads, white is the baseline; colored variants rejected. Fragment tone (gray leads), body texture, palette: see the idea map.

## What worked
- Gloss body (top sheet + base glow) plus glass layers: the strongest Liquid Glass read.
- Lens tier 3: rim highlight, hot spot, bottom caustic, inner hairline, gloss sheet clipped to the lens.
- **Tint content inside the lens** (lines in pale blue-white tints, calm) was the only content color the maintainer found worth keeping (2026-10-29). Gray fragments outside gave the best contrast; white fragments compete with the lens, warm ones look muddy.
- Fragments are unreadable below 64 px in every variant, so the small sizes were expected to read as the lens and its content alone. **Measured 2026-10-29 on the shipped `.icns` and it is the other way round**: `iconutil -c iconset` expands the real per-size slices (16/32/64 are distinct renders, not downscales), and printed as a luminance map, the 32 px slice shows the lens ring and its bars clearly, while the 16 px slice loses the *lens content* - the bright marks sit in the upper third, the lower half is near-uniform tile. Fragments survive; the lens does not. Worth knowing if a future round changes the composition: check the expanded 16 px slice, not a downscale.

## What did not work
- Flat tiles with a thin edge highlight (our first render): glass without depth.
- **Multi-color content inside the lens** (the maintainer, 2026-10-29: "the color palette really doesn't suit the design"): structured amber/white/mint and spectrum cyan-violet-pink both rejected. My earlier note that structured was best was wrong. Keep content to white or tint; any color in the lens must come from the body hue, not a new palette.
- Pane (frosted panel behind the glyphs): neutral, adds little.
- Tier 1 on dark bodies and dark-mode renditions: collapse to near-black; moot now (one icon).
- SVG `feGaussianBlur` on big shapes and `feTurbulence` grain are **ignored by ictool** (mesh blobs came out hard-edged, grain invisible). Small blurs (glows) do render. Real texture needs raster PNG layers.

## Tool facts and traps
- `actool` fails with a plug-in load error until `xcodebuild -runFirstLaunch`; build the `.icns` from `ictool` renders instead.
- `icon.json` lists layers and groups top-first; authoring bottom-up without reversing hides the background layers.
- A `.replace` on a transform string (`scale(1.0)` vs `scale(1)`) silently skipped the recentering: check the render, not the exit code.
- Another session may write into `research/icons/`; use a separate subfolder per round.
- Ghostty's own icon (read from the installed app): aluminum rim, black bezel, glossy CRT screen, glowing ghost. Borrow the idea of a physical object with a glowing glyph, not the bezel.

## Idea map (systematic brainstorm, 2026-10-29)
Zones of the icon, each with candidate details. Mark each idea as a render axis or a one-off. Not yet rendered unless noted.

| Zone | Ideas | Expected effect / risk |
|------|-------|------------------------|
| 1. Body surface | gloss (done); soft mesh gradient (raster); film grain (raster); subtle diagonal light sweep; inner vignette; paper/linen micro-texture; frosted edge band | Depth from hue and tactility. Mesh and grain need PNG layers |
| 2. Body color logic | single hue; two-hue diagonal; analogous triad; hue that shifts toward the lens (light "from" the lens); duotone with a warm accent | Palette is last, but color logic (how many hues, where) is a shape-level choice |
| 3. Lens rim | white glass (done); tinted glass (rim picks up body hue); two-tone rim (outer light, inner dark); rim with a gradient sweep (like polished metal); rim with an aperture-notch or tick marks (camera/viewfinder); thin double ring | Rim carries the Liquid Glass read; ticks risk reading as a camera or a watch |
| 4. Lens interior glass | clear (done); slight magnification (disc); chromatic edge (red/cyan fringe near the rim, real lens refraction); inner shadow ring; depth gradient (lighter at the top, darker at the bottom) | Refraction cues are the most "real glass" detail; fuzziness is the risk (the disc) |
| 5. Content inside | white lines (done); tint (done, liked); structured amber/white/mint and spectrum (done, rejected: palette clashes); real markdown shapes: heading + bullets, a table grid, a code line, a checkmark list; line weights that vary; one line "typed" with a cursor; a tiny diagram node; colored by meaning (heading, code, quote) | The strongest storytelling zone. Table/diagram say "renders structure", not just "text" |
| 6. Fragments outside | white (done); gray (best so far); fewer/larger pieces; slanted or rotated pieces; fading with distance; a few broken glyph shapes (`|`, `+--`, `>`) instead of pills; motion streak toward the lens | Fragments are invisible below 64 px, so spend little here; broken box-drawing glyphs would make the "mess" literal and distinctly about terminals |
| 7. The transition | none (done); a soft beam or caustic from fragments into the lens; fragments curving along the lens edge; one fragment already "inside" half-formatted | Connects mess to clean; risk: clutter |
| 8. Light and shadow | top gloss (done); colored shadow under the lens; drop shadow onto the body; light leak / flare at the rim; reflected body color at the lens bottom (done, caustic) | Separation and mood; macOS adds its own shadow |
| 9. Edge and frame | system squircle only (done); inner 1 px highlight line on the squircle; subtle outer glow in body hue | Cheap polish; the system mostly handles it |
| 10. Scale behavior | check 128/64/32/16; separate simplified artwork for tiny sizes (fewer lines, thicker rim) | The Dock and menu use small sizes; icon must hold with only the lens |
| 11. System modes | tinted and clear renditions come free from Icon Composer if layers are separated; verify they stay legible | One icon, but macOS 26 will tint it anyway |

### Suggested order (cheapest signal first)
1. Content inside (zone 5): table/heading/code shapes, in white or tint only (no new hues), since it carries the story and costs only SVG.
2. Lens interior (zone 4): chromatic edge and depth gradient, at ring first.
3. Lens rim (zone 3): tinted and two-tone rims.
4. Fragments (zone 6): glyph-shaped fragments instead of pills, gray, at most three variants.
5. Body texture (zone 1): needs raster PNG layers; do after the shape is locked.
6. Palette and color logic (zone 2): last.

## Shape locked (the maintainer, 2026-10-29)
Mandate: lens radius 320, center x572 (right of center), original rim stroke, three tinted bars inside. Fragments: one white pill per row, 6 rows x 52 px, both sides, left/right ends of the inner side on the lens curve, outer margin 40, original texture (glass front group). Script: `icon/explore/round21.py`, sheet `research/icons/r21-final/sheet-r21.png`.

Final candidates (all kept on record):
| # | Variant | Status |
|---|---------|--------|
| 1 | all rows, ragged A (as chosen / other left / softer / other right) | candidate |
| 2a | one missing (row 3), ragged A, as chosen (pills 0.7) | **CHOSEN** |
| 2c | one missing (row 3), ragged A, softer pills (0.55) | **CHOSEN** |
| 2b, 2d | other left pattern / missing row 2 | candidate |
| 3 | one missing, jag small (all four columns) | candidate |

Next: color and styling, on 2a and 2c.

## Color locked (the maintainer, 2026-10-29)
Final color candidate set: round 27's 20-step scale (`research/icons/r27-scale/sheet-r27.png`, hex per tile in `colors.txt`), anchors sampled from Ghostty's icon (cobalt, deep, dusk) and Apple's Journal. **Chosen: 01 (#1346cc->#0630a3) or 02 (#1246c2->#073099).** Lens content: own tint (tile hue, low saturation, full brightness). Pills white 0.5. No gloss sheet, no lens fill.

Next: rim color and texture.

## FINAL (the maintainer, 2026-10-29)
**Artifact**: `icon/final/Glimpse.icon` (Icon Composer bundle) + `icon/final/Glimpse-512.png`. Reproduce: `icon/explore/round29.py` cell "06 white->tint x0.5".
| Part | Spec |
|------|------|
| Tile | linear gradient #1346cc -> #0630a3 (color 01, sampled from Ghostty's screen). No gloss sheet, no base glow |
| Lens | r320, center x572 y512, ring stroke 75 (56*r/240), clear (no fill), tier-3 shine (rim highlight, hot spot, caustic) |
| Rim | linear gradient top->bottom: white -> tint midpoint of #dbe5ff..#85a2f2 ("06 lighter") |
| Inside | three bars (round 21 2a geometry), own tint #dbe5ff / #aabffa / #85a2f2 (tile hue, low saturation, full value) |
| Pills | one white pill per row, 6 rows x 52 px, both sides, inner ends on the lens curve, outer margin 40, ragged A, right row 3 missing, opacity 0.5, inside the glass front group |
Not done yet: whether the 16 px slice reads as Glimpse to a person (see "What worked"), and the menu bar glyph in a real menu bar (mock sheet only).

## Process that worked (reproduce this)
1. **Lock a mandate list and re-read it before every round.** Each decision (lens r320, x572, original rim, bars, tint) goes into a table the moment the maintainer makes it. I broke locked decisions three times (moved the lens, shrank it, dropped the tint) and each cost a round.
2. **Shape -> fragments -> color -> rim, one axis per round.** Each round varies one or two axes across a grid; everything else is copied from the previous chosen cell, never from script defaults (the tint regression came from rebuilding from defaults).
3. **Survivor loop.** Wide grid -> the maintainer names survivors -> 4-20 variations of only the survivors (intensity steps, a continuous scale between anchors) -> pick. 29 rounds in a day.
4. **Numbered sheets, one link.** `sheet.swift` grids with numbered/labelled cells; the maintainer replies with numbers from his phone.
5. **Compute geometry, then show it.** When a request collides with a constraint (pills both sides at r320), solve it numerically, print the margins, and render the failing case too, rather than arguing.
6. **Never invent a palette; sample one.** Hand-picked hex looked dated twice (rounds 22-23). Sampling tile colors from installed Apple icons and Ghostty's icon (`sips` -> PNG, `NSBitmapImageRep.colorAt`) fixed it in one round.
7. **Apple's coloring rules (measured from 52 system icons)**: one hue per tile, brighter at the top, never two hues; glyph in white glass; no painted gloss (Liquid Glass supplies depth); neutral tiles get neutral glyph tints.
8. **Random must break structure.** Ragged ends that shrink with the lens curve just trace the curve again; alternate long/short against it.

## Script traps (explore scripts)
- Scripts `exec` `make6.py`; its globals `H` (SVG header) and `G()` (group builder) get silently shadowed by short local names. Prefix locals.
- Another session may render into the same folder or append to the same script: one new script and folder per round, never edit an old round in place.
- A look that changes unexpectedly (thin rim in round 17): grep the generated SVG's stroke values before trusting the render.

## Log
- 2026-10-29 rounds 1-3: four palettes x three tiers; five body styles (bezel, neon, frost, porcelain, gloss). Liked: porcelain, gloss/glass bodies, aurora and mint palettes.
- Round 4: handle removed, lens treatments (ring, disc, thick), gloss on the lens itself.
- Round 5: lens radius, position and overlap; shortlist of six, decided radius 320, cut overlap and low-right.
- Round 6: content colors, fragment tone, texture. Colored content rejected by the maintainer, only tint kept; gray fragments win; texture failed on tooling (see above).
- Round 7: decisions recorded, idea map written. Session wrapped; the maintainer resumes in a new session. Next: content-inside shapes (white/tint), then lens interior and rim.
- Round 11 (`round11.py`, `research/icons/r11/`): from the tint+white favorite, fragment height (now/tall) x lens content (bars/heading+3 text lines) x ring (stroke 56/38); rim highlight and hotspot moved toward the rim so they clear the top line. Ring stays right of center (the maintainer). My lean: text + thin + tall.
- Round 12 (`round12.py`, `research/icons/r12/`): gloss reverted (the round-11 move didn't help, the maintainer). Fragments 6/7 rows with the right edge on the lens curve; bars kept, left edge or both ends on the inner lens curve. The curve on the bars is subtle because they sit near the center of the lens.
- Round 13 (`round13.py`, `research/icons/r13/`): fragments with a flush left edge, either ragged on the right or stretched to the lens curve, at 6/7 rows.
- Round 13 (`round13.py`, `research/icons/r13/`): bars locked (the maintainer). Fragments on both sides, both on the lens curve, lens x solved for equal outer margins (1024-px canvas): r320 cannot fit (margin 3-28), r290 outer-rows 64, r260 mid 70 / outer 100. Lean: r290 with right fragments only in the outer rows.
- Round 14 (`round14.py`, `research/icons/r14/`): r320, fragments on both sides in all rows, 6 rows at 52 px (same 472 px span as 7x40). Scaling multi-piece rows to fit the margins turns them into vertical dots (sheet19, rejected). One pill per row filling curve-to-margin (sheet20) works; the middle rows shrink to dots because the lens is widest there. Lean: margin 56, gap 14.
- Round 15 (`round15.py`, `research/icons/r15/`): margin 56 locked (the maintainer). 9 placement variants at r320 centered, gap 14, pieces under 1.3x height dropped. Lean: 'swell to center' (balanced, no gaps) and 'line behind lens' (tells the story: one line passing under the glass).
- Round 15b (`round15b.py`, sheet22): every row must keep a pill on both sides (the maintainer: missing middle rows are a regression). Pieces clamp to a minimum pill width instead of dropping.
- Lens x vs both-side fragments: at r320, margin 56, every row filled, the lens can shift right at most ~24 px (x536) before the middle-right pills fall under minimum width. The original x572 is incompatible with right fragments. Renders: `round15c.py`, sheet23-x524/x536.
- Round 15 (`round15.py`, `research/icons/r15/`): lesson from round 14: keep locked decisions (lens x572, multi-pill left) when testing a new axis. Only the right side changes: pills fit between the lens curve and a right margin equal to the left (41 px). With the lens at x572 the middle rows have only about 40 px of room, so right pills appear only in the top and bottom rows.
- Round 15 (`round14.py` with R15=1, `r14/sheet21-round15.png`): lens back at its decided right position x572 (the maintainer: don't re-litigate). Single pill per row, both sides, equal outer margins 40/56/72, rows with less than one pill height of room skipped. Right side keeps only the top/bottom rows. Lean: margin 56, gap 14.
- Round 16 (R16=1, `r14/sheet22-round16.png`): every row has a pill on both sides (the maintainer: required). Lens center stays at x572, lens-to-pill gap 10, min pill width 64; margin solved from the tightest right row, same on the left. Margin by lens radius: r320 27, r300 49, r280 72, r260 95. Lean: r300.
- Round 17 (R17=1, `r14/sheet23-round17.png`): r320 and x572 locked; only the rim thins (stroke 75/59/45/32 px). Pill in every row; margin solved from the tightest right row: 27/35/42/48. Lean: 45 px rim.
- Round 17 A/B/C (`round17abc.py`, `research/icons/r17abc/`): MANDATE (the maintainer): lens r320, center x572, original rim stroke (75 px). A left pills only; B right pills, rows without room skipped; C every row filled, margin from the tightest right row. Row 1 margin 56 (C: 23), row 2 margin 40 (C: 41, smaller min pill). The other round-17 (thinner rim, commit 607fd83) violates the mandate.
- Round 18 (`round18.py`, `research/icons/r18/`): lens r320 + original rim nudged up-right to (600, 470), margin 40, gap 10. Only the bottom row gains room on the right: one lone pill. The lens (714 px across) is taller than the pill block (472 px), so moving it 42 px up only clears the last row.
- Round 18 tuck (`round17abc.py`, `r17abc/sheet-tuck.png`): all rows filled, pills start 40 px under the rim so no rounded cap at the lens edge. The glass rim is translucent, so the tucked ends show faintly through it (reads as passing behind glass). Variants: right only vs both sides; min pill 64 (margin 23) vs 40 (margin 51).
- Round 19 (`round19.py`, `research/icons/r19/`): tucked pills hidden behind the rim (the maintainer: rim must not show them). Works: clip the pills at the ring's outer edge (ring keeps its glass look); lens group translucency off (rim turns flat white); both. Fails: ring layer non-glass alone, and an opaque backer ring (the lens group's translucency still lets the pills through). Lean: clip.
- Round 20 (`round20.py` NROWS=6/7/8, `research/icons/r20/`): clip mode, same pill height and spacing, 1-2 extra rows. At 8 rows the top and bottom rows nearly span the icon, framing the lens; 7 is the middle ground.
- Round 21 (`round21.py`, `research/icons/r21/`): 7 rows, tucked + clipped. Right ends varied (they were near-vertical): ragged, stagger, arc (ends on a curve that bulges at the middle row), arc+ragged. Short stubs in the middle rows almost disappear under the rim. Lean: arc.
- Round 18 (`round18.py`, `research/icons/r18-pills/`): pills take the original fragment texture (in the glass front group, white 0.7; the field layer outside the glass at 0.8 read brighter). Round 17's all-rows margin bug: the margin was solved from a min pill width in the tightest right row and then applied to both sides, shrinking it to 23. Fixed: margin fixed, tight rows take their full room (51 px at m40, 43 at m48).
- Round 19 (`round19.py`, `research/icons/r19-pills/`): margin 40, original texture. Right pills ragged: width = room minus a per-row trim, minimum 52 (small/medium/large trim sets; the middle rows have only 51 px so they stay round). Few missing now skips exactly one row (the maintainer: at most one).
- Round 20 (`round19.py`, `r19-pills/sheet-r20.png`): round 19's trims made the right ends trace a curve parallel to the lens (the maintainer: not random). New trims alternate long/short so the ends break the curve. Limit: the two middle rows have only 51 px of room, so they stay round pills at the margin.
- Round 21 (`round21.py`, `research/icons/r21-final/`): final shortlist (the maintainer): all rows + ragged A, one missing + ragged A, one missing + jag small. Each varied one axis: other left trim pattern, softer pills (0.55), other right trims / other missing row (row 2 vs 3).
- Round 22 (`round22.py`, `research/icons/r22-color/`): color pass on 2a/2c. Eight body palettes (blue, sky, indigo, violet, teal, ink, graphite, sunset); lens tint mixed from each palette's top hue. My read: indigo and teal strongest; ink/graphite premium but close to Ghostty's dark; sunset distinctive, pills go pink-muddy.
- Round 23 (`round23.py`, `research/icons/r23-style/`): Apple-style color pass, shape untouched. Gloss sheet and base glow removed (the dated part); tile = subtle same-hue lightening; color carried by a new lens-fill glass layer. 12 styles: A light tile (white/pale blue/warm paper; blue, indigo, clear lens; one yellow-accent line), B single-hue tonal (blue, indigo, teal; tinted or white ring), C dark neutral (blue, indigo lens). My lean: A1, then B4.
- Round 24 (`round24.py`, `research/icons/r24-apple/`): the maintainer: round 22/23 color combinations 'horrendous'. Root cause: invented hex values (our blue drifted purple and went far darker at the bottom). Fix: tile gradients sampled from Apple's own icons (Mail #00adff->#0090ff, Weather #3db0ff->#1d89e2, App Store, Keynote, Freeform, Shortcuts, Podcasts, Journal, Passwords #404040->#191919); white glass glyphs, clear lens. **Rule: never invent a palette; sample a proven one.**
- Round 25 (`round25.py`, `research/icons/r25-tint/`): the maintainer: no colored lens fill (round 24 #10/#11 out); Journal navy (#3e4664->#2a3048) 'pretty sleek'. Round 24 regressed the lens bars to plain white (I set them white); tint is part of the locked design, restored: original blue tint vs a tint mixed from the tile's own hue, on Journal/Mail/Keynote/Freeform. Lean: Journal + blue tint.
- Round 26 (`round26.py`, `research/icons/r26-dark/`): the maintainer: simple, own tint, darker (Ghostty-like dark blue, not Mail blue). Ghostty screen sampled from its installed icon (#1346cc->#0630a3; deep #0f468a; dusk #4c5983). Own tint = tile hue at low saturation, full brightness; neutral tiles get a neutral tint. 8 tiles: Ghostty cobalt/deep/dusk, Journal, Freeform teal, Shortcuts violet, Stocks slate, Passwords black. Lean: Ghostty deep.
- Round 27 (`round27.py`, `research/icons/r27-scale/`, hex per tile in `colors.txt`): top row of round 26 survives. 20 tiles on a continuous scale through the four sampled anchors cobalt (01) -> deep (07-08) -> dusk (14) -> Journal (20).
- Round 28 (`round28.py`, `research/icons/r28-rim/`): rim paint only, on color 01. 12: white, white 80%, frosted 55%, tint lightest, tint mid, white->tint, aluminum, chrome, diagonal sheen, graphite, deep navy (recessed), tile-hue light. Lean: 06 white->tint or 04.
- Round 29 (`round29.py`, `research/icons/r29-rim/`): rim survivors 02 white-opacity, 04 tint, 06 white->tint, 09 diagonal sheen (the maintainer). Four intensity steps each on color 01.

## Menu bar icon (2026-10-29)
Current: SF Symbol `doc.text.magnifyingglass` (main.swift buildStatusItem). Round 1: `icon/menubar/menubar.swift` -> `sheet.png`: 7 template glyphs distilled from the final app icon (ring + three bars, text pills), previewed at 7x and in mock light/dark menu bars at @2x. Lean: 2 (lens + left pills), mirrors the app icon; 1 as the minimal fallback.
- **Decided (the maintainer, 2026-10-29): variant 1**, ring + three left-aligned bars, 18 pt template, drawn in code (`main.swift` `statusGlyph`). Shipped with the app icon in the same commit.
