# Glimpse - design history

The dated record of how the design was reached (2026-10-12 to 2026-10-13): the research findings, the
format layer's scores, the cold review, and the direction set after the first build.
The living design record - thesis, principles, decisions, vectors - is in [design.md](./design.md);
the engine's own spec is [engine-v2.md](./engine-v2.md); the friction log is
[friction-log.md](./friction-log.md).


## Research findings

### Unfenced code detection (2026-10-12)

Agent survey plus hands-on tests on the real mermaid sample and 12 written snippets; key results re-run and confirmed. Raw material: `research/detect/` (gitignored).

- **Mermaid is detectable with no language line at all**, deterministically: header keyword (`flowchart`, `graph`, `sequenceDiagram`... about 40 in mermaid 12.1) plus `mermaid.parse()`. Untagged sample: parses as `flowchart-v2` in 6-20ms. Prose that starts with a header word ("graph theory is fun", "pie is", "journey") matches the keyword but the parser rejects it. A truncated diagram is rejected. The bare `mermaid` line must be stripped first, or detection fails.
- **Statistical language guessers cannot tell code from prose.** highlight.js auto-detect (already bundled): flowchart → CSS, prose → VB.NET with a higher score than real shell. The full 193-language build is worse. flourite: prose → C++. VS Code's detector (`@vscode/vscode-languagedetection`, ~1.8MB): rejects all prose at VS Code's own 0.2 gate, but also rejects real Python (0.10) and JSON (0.16). Guessers are only usable to pick a language for text already known to be code.
- **No product found that does fence-free code segmentation** (thin evidence: web search only).
- Parser validation is clean for JSON (`JSON.parse`) and diffs (strict line shape): no false positives on the other samples.

Proposed approach, pending the maintainer: **proven before formatted** - (1) invert Claude Code's code-block display (bare info-string line over an indented block); (2) parser-confirmed formats (mermaid, JSON, diff); (3) segment mixed text by blank lines and indentation, each block a candidate; (4) anything unconfirmed renders as plain monospace with line breaks kept. Language guessing only colors blocks already confirmed as code. *Superseded 2026-10-12: code vs not-code only, no language guessing - see Decisions.*

### Mermaid renderer (2026-10-12)

Agent survey, test pages rendered in WebKit with the sample in light and dark, screenshots checked by eye. Raw material and screenshots: `research/mermaid/` (gitignored).

| Option | Size | Load + first render | Coverage (22 types tested) | Look |
|---|---|---|---|---|
| **mermaid 12.1.0**, `theme: 'base'` + `themeCSS` on Glimpse's CSS variables | 5.49MB (1.57MB gz) | ~95 + ~112ms; warm ~25ms | 22/22 | Matches the panel: nodes styled like the code wells, SF text, hairlines, right-angle edges, follows light/dark with no re-render |
| @mermaid-js/tiny 12.1.0, same theme | 2.81MB | ~53 + ~35ms | 20/22 (no mindmap, architecture) | Same styling, but diagonal edges |
| beautiful-mermaid 1.1.3 | 1.56MB bundled | ~25 + ~60ms | 6/22 | Clean style, but on our sample an edge runs through a node and a line strikes through a label; always imports a Google Font |
| mermaid stock themes | - | - | - | Lavender boxes, mid-word wraps - look pasted in |

Lean: mermaid 12.1.0 with the base theme, colors in `themeCSS` only (mermaid's color math breaks on `transparent`), loaded only when a diagram is detected. Unverified: timings inside the real WKWebView (measured in Playwright WebKit), label-chip contrast on the real panel material, styling of diagram types other than flowchart.

### Dataset feasibility and calibration (2026-10-12)

**Goal** (the maintainer): a large, realistic, dirty dataset with known answers, so every change to the formatting logic gets a score instead of an impression. 100% is impossible by nature, and people select and prefer differently.

**What Claude Code's terminal does to markdown** (rendered from a known source, 2026-10-12):

| Markdown | What lands on the clipboard |
|---|---|
| `## Heading` | `Heading` - `#` gone |
| `**bold**`, `` `code` `` | markers gone |
| `[text](url)` | `text` - **URL lost** (unrecoverable) |
| ```` ```python ```` block | indented code, no fence, **no language line** |
| ```` ```mermaid ```` block | bare `mermaid` line, then the code |
| table | box drawing, centered headers |
| `> quote` | `▎ quote` |
| paragraph | **hard-wrapped** at terminal width |
| reply | first line prefixed `⏺`, the rest indented 2 spaces |

**Terminal copy behavior**: a line that fills the terminal's full width is joined with the next on copy (soft-wrap semantics). A table as wide as the terminal arrives as **one line with no newlines** (corpus `2026-10-12T225643-copy`: row borders every 238 chars = 2 x 119 columns). Recoverable by cutting at the table width. Text rows glue too, after a resize: Claude Code redraws with rows padded to the new width, and the copied newline does not reset the column (rows carry on from where the previous content ended). Corpus `2026-10-22T222202-copy`, `2026-10-12T230919-copy`.

**Calibration** (the maintainer made 17 deliberately fuzzy copies from a resumed session):
- 18/18 copies are exact slices of `cmux read-screen --scrollback` of the same tab (17 byte-exact, 1 after trailing-space trim). A copy is a slice of the screen's logical lines.
- 16/17 reproduce exactly in a hidden `tmux` render of the same session at the same width (153 columns), captured with `capture-pane -p -J`. The miss included the user's shell prompt line, which exists only in the real tab.
- So: **dataset input = slices of a tmux `-J` capture of a resumed session**; **known answer = the raw markdown in the session transcript**. Resuming with `--fork-session` is read-only (nothing persisted).

**Synthetic sessions** (hand-written session files with chosen markdown) render correctly, but writing into Claude Code's session folder is blocked by the auto-mode classifier as transcript tampering. Not needed: real sessions are the realistic distribution.

**Selection patterns to simulate** (observed in the calibration copies): whole reply, single block, mid-line start and end (e.g. starting inside `ROW_NUMBER()`), partial diagram, spill-over into tool output and the shell prompt.



`format.js` replaces the Swift Tidy pass and highlight.js. One file, run inline in the panel and in node for scoring. Pipeline:

1. **Mode**: raw markdown (any of: fence, `#` heading, `| --- |` row, `**bold**`, link, inline code - the terminal strips all of these, so one is proof) goes to a light path that only fences unfenced mermaid. Everything else is treated as terminal or plain text.
2. **Chrome**: Claude Code UI is recognized and dropped - tool calls/output, prompts, status, notices (`⏺ Agent "…" was stopped`), agent tree lines, prompt-box rules, and user-prompt lines (padded with spaces to the full width because the prompt has a background color).
3. **Unglue**: full-width box tables glued into one line by the terminal are cut back at the row period (terminal width, not table width - rows are space-padded).
4. **Blocks**: blank-line runs, then splits where Claude Code leaves no blank: a list after its lead-in sentence, a code block after a line ending in `:`. Diagrams absorb following blocks across their internal blank lines.
5. **Classify**: diagram (header keyword + mermaid's parser) → `Header: value` table (Claude Code's layout for tables too wide for the terminal) → rule (`---`) → box table → quote (`▎`) → numbered section heading → list → URL → code (per-line rules of thumb: syntax, symbols, aligned columns, JSON/HTML/CLI/log/CSV shapes) → heading → paragraph.
6. **Joins**: the greedy-wrap test - a break is a soft wrap only if the next line's first word could not have fit on the previous line (CJK measured in display columns; quote prefix skipped; a selection's truncated first line counts as a wrap point). **Gated on terminal evidence** (2-space reply indent, Claude Code markers/UI, box drawing): text from other apps keeps every line break.

## Format layer and its scores (2026-10-12)

**Scores** (2,977 labeled samples from 60 real sessions at widths 100 and 150, six selection kinds; gold = 39 of the maintainer's real copies):

| | Baseline (old pipeline) | format.js v1 | format.js final |
|---|---|---|---|
| **Never-worse** | 81.7% | 90.8% | **94.7%** |
| Line type accuracy | 60.2% | 77.4% | **92.2%** |
| Type accuracy, macro | 45.6% | 62.6% | **87.9%** |
| Join precision / recall | 96.9 / 99.2% | 97.8 / 86.5% | **99.8 / 96.9%** |
| Block recovery | 80.3% | 86.3% | **90.6%** |
| Terminal UI recognized | 0% | 91.8% | **96.1%** |
| Gold never-worse | 71.8% | 94.9% | **100%** |

Raw markdown (all 1,706 replies fed as `/copy` would give them): 1,705 structurally identical after formatting. Other-app samples (JSON, stack trace, logs, CSV, Slack text, Korean, URL, word): line structure preserved.

**Known, accepted residue** (judged inherent, not bugs): prose that the author put inside a code fence reads as prose once the fence is stripped (most of the remaining code→para/list damage); a heading at the very end of a selection is indistinguishable from a one-line paragraph; a single `Header: value` group selected without its `────` separators stays as separate lines; partial diagrams that no longer parse fall back to code.

**Eval workflow** (from `research/dataset/`): `python3 render.py` (hidden tmux renders) → `npm run dataset` (labels + selections + gold) → `node score.mjs <formatter> samples.jsonl --gold gold.jsonl` → `node examples.mjs <report>.samples.jsonl "<cause>"` to see failures. Every formatter change is kept only if never-worse does not drop.



## Cold review (2026-10-13) and where it leaves us

One cold reviewer (correctness tracer) reproduced every reported number, then found what the metric could not see.

**The metric was blind to deleted text.** Lines classified as terminal UI are dropped from the output, but the scorer never counted that as damage, so a reply like `⏺ Done.` followed by its text rendered as an empty panel while scoring as "never worse". The scorer now counts reply content dropped as chrome as damage (docs/dataset.md). Honest score before the fixes: 93.4% (not 94.7%).

**Fixed (trivial, local)**: tool calls need the `Name(` call shape; status-bar/spinner/powerline rules only apply to text with terminal evidence; padded "prompt" lines only right after a `❯` line; text adjacent to a table is kept; glued tables are cut from the first row start (your "Wave 2" copy); `\s` → `[ \t]` in multiline regexes (a 1.7 s to ~7.6 h backtracking hang is now 2-19 ms); `<` escaped in the injected text (`<!--<script` blanked the panel); any render error falls back to showing the raw text; `&` escaped; mermaid hint has a word boundary; harness mirrors the app's escaping; dead code removed. All reviewer repros are regression checks in `research/other/adversarial.mjs`.

**Scores after the fixes** (deleted text now counted): samples never-worse **94.0%**, line type 92.1%, joins 99.8 / 97.0%, block recovery 90.7%; gold (real copies) never-worse **100%**, block recovery 79.2%; raw markdown 1,705/1,706; 101 headless panel renders with 0 errors.

**Deliberately not fixed - for the step-back review** (each is a design question, not a patch):
1. **Join confidence on short selections.** With no prompt-box border, the longest line is taken as the wrap width, so a 2-3 line selection like `Status: done…` / `Owner: me` joins. Needs a principled notion of "confident enough to join", not another threshold.
2. **Markdown-mode trigger.** One backtick, `**`, or link flips the whole paste to raw markdown, which loses single line breaks in plain text and treats `Vec<String>` as an HTML tag. Related: raw HTML passes through marked into the page, and the panel does not block navigations. the maintainer ruled sanitization out as a security concern (2026-10-12); escaping HTML for *correct display* is a separate question.
3. **Chrome detection on real copies.** Gold chrome recognition dropped to 0% after the safety fixes (prompt lines without a `❯` line are now kept as text - safe, but noisy). The chrome classifier is a pile of patterns; it deserves its own design.
4. **The architecture of format.js itself.** It grew by measured rule additions (~550 lines): classification order, block splits and joins interact. Before more rules: is a scored-candidates design (each block type scores itself, best wins) cleaner than an ordered cascade?
5. **Inherent residue**: prose inside code fences, headings at the end of a selection, a single `Header: value` group, partial diagrams.
6. Minor: `Hi Bob` stays a paragraph now, but setext `===`, `Foo_(bar)` URLs as code.

## Direction after the first build (2026-10-13)

**the maintainer's read**: the rules are drifting toward overfitted stitch-and-fix; the dataset will always be biased (one person, one tool); fuzzy questions have no correct answer, so they need principles, not more thresholds; next is design, not more data.

### Design principles for the format engine v2 (proposed, to be ratified)

1. **One pipeline, no modes.** Today there are two paths - raw markdown and terminal text - picked by a guess. v2 has one: markdown syntax (fences, `#`, `| --- |`) is just strong evidence inside the same decision, not a mode switch.
2. **Scored candidates, not an ordered cascade.** Each block gets every plausible reading (prose, list, table, code, diagram, heading, quote, terminal UI); each reading scores its evidence; best wins. A new rule adds evidence to one reading - it can't silently pre-empt others by sitting earlier in a chain.
3. **Act in proportion to the risk of being wrong.** ("Risk" = the reading damage a wrong call does, never money.) There is no correct answer, so decide by asymmetric risk. Every transformation has a risk class, and the evidence needed scales with it:
   - *Delete text*: never. Terminal UI is **demoted** (dimmed in place), not removed - readable at a glance.
   - *Join lines*: medium cost - only with real width evidence (prompt-box border, several lines near one width).
   - *Restyle* (heading, list, table): low cost - modest evidence is enough.
   - Ties go to the cheapest mistake: keep lines, keep text.
4. **Few, general evidence sources.** Geometry (widths, indentation, alignment), syntax (markup, code symbols), validators (parsers: mermaid, JSON). Tool knowledge (Claude Code's UI shapes) lives in a small, separate **source profile**, so the core never overfits to one tool and another tool is a new profile, not new core rules.
5. **One-keystroke escape hatch instead of perfection.** The original text is always one key away (raw toggle). Fuzzy problems get a trust valve, not more rules.
6. **The eval is a guard rail, not a target.** Never-worse, gold copies and adversarial checks gate every change; an equal score with less code wins. Against single-user bias: a small hand-picked set from other sources (Codex CLI, Slack, web pages, logs), not more Claude Code data.

### Execution plan

| Step | What | How |
|---|---|---|
| 1 | **Design doc: format engine v2** - principles above made concrete (candidate readings, evidence features, cost classes, source profile, demote-not-delete rendering) | Write, one cold doc reviewer, the maintainer ratifies. No code. **Done: revision 3 ratified 2026-10-13** (docs/engine-v2.md) |
| 2 | **Build v2 beside v1**, same contract | v1 stays as the baseline. v2 must match or beat v1 on every guard rail with fewer rules. Agents in parallel: engine core, evidence features, Claude Code profile. **Done: v2 is live, 2026-10-13** (`format.js` is the engine bundle; v1 kept as the gate baseline in `research/baseline/format-v1.js`) |
| 2' | **Features**, in parallel with 2 (Swift + panel only, no format code) | Copy formatted / markdown / image, raw toggle |
| 3 | **De-bias the eval** | ~50 hand-picked samples from other sources into a separate set |
| Later | Polish | Speed (warm web view), placement, light-mode check, pin |

