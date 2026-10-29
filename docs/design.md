# Glimpse - design record

Living record for Glimpse (this repo). Product thesis, principles, decisions with evidence, open vectors, and the execution plan. Update this before changing behavior; every change should trace to an entry here or to the friction log ([friction-log.md](./friction-log.md)). The launch sequence lives in `docs/launch.md`; the dated research and the cold review are in [design-history.md](./design-history.md).

## Thesis

**Read AI- and terminal-produced text comfortably, right now, then get back to work.** The terminal (Claude Code's TUI above all) is bad at long prose, tables and code. Glimpse is a momentary reading surface: summoned in a beat, readable at a glance, gone without a thought. It is a lens, not a place - no documents, no history, no settings screen.

**The core capability is flexible format handling, not markdown rendering** (Darwin, 2026-10-12). Real clipboard text is malformed and mixed: hard-wrapped prose, TUI-rendered markdown with its syntax already stripped, box-drawn tables, logs, JSON, code without fences, all in one blob. Glimpse's value is a smart layer that turns any of that into the best readable version. Markdown is one input format among several, not the model.

**Public words, locked 2026-10-27**: "Glimpse: Format & render terminal text, anywhere." / "From broken lines to tables to Mermaid diagrams." (docs/launch.md). Earlier: **Framing under review (Darwin, 2026-10-24).** The thesis above already names *format handling* as the core capability, but the public words say *render*: the slogan is "Drag & Render", the one-liner is "read it as a clean document". Darwin's read: the panel is one consumer of the format layer; the bigger one is the text going *out* to another app - "when I copy a message from Claude Code into another app", which he found himself doing constantly. That promotes vector F from "later" to now, and it is the difference between a viewer and a repairer. Open calls and the checklist rows live in docs/product-direction.md (section 1h); the decision is Darwin's.

Darwin's priorities, in his words: lightweight, "usable anywhere", "feeling native like a preview", "one-off, disposable"; "I value universal approach more than anything"; smooth usability is crucial; avoid "something that looks like it's working but really breaks in so many places."

## Principles (the tests every change must pass)

0. **Native, and like magic** (Darwin, 2026-10-12 - the top principle). The user never knows how it works and never has to care: they use it, they don't think about how to use it, and it simply works. Like iCloud or iMessage. That takes careful orchestration behind the scenes, and that orchestration is our job, never the user's.
1. **Universal over clever.** A mechanism that works in every app beats a better one that works in some. Per-app adapters are a last resort.
2. **Never worse than the original.** When the format layer is unsure, it preserves the source's line structure. The worst case looks like the input, never a mangled version of it. The raw text is always one keystroke away.
3. **Instant.** Trigger to readable pixels must feel immediate. Latency is the feature.
4. **Predictable.** Same gesture, same result, same place.
5. **Disposable.** Opening and closing cost nothing, physically or mentally.
6. **Native and designed.** System typography, materials, light/dark, accent color, standard keys (Esc, ⌘W, ⌘C, ⌘A). Visual quality is a first-class vector, not polish.
7. **Read-only toward the world.** Glimpse never writes to the clipboard or synthesizes input. (The user's own copy is fine - Darwin, 2026-10-12: "it's fine to keep it there.") **Amended 2026-10-24**: the ⌘C⌘C gesture now pushes the formatted result to the clipboard (see Decisions). The principle survives as "no writes the user did not ask for", not "no writes" - the double-copy gesture is the ask.
8. **Evidence over vibes.** Behavior changes come from the real-text corpus, a measured number, or the friction log - not from what sounds good.

## How we make choices (process principles)

Darwin, 2026-10-12: "we need to research and carefully pick the right choice, instead of jumping to action." Great software takes consideration that can't be produced in one go; the shortcut is exactly how vibe-coded apps end up looking right and breaking everywhere.

1. **Research before choosing.** Any non-trivial choice - a library, an algorithm, a detection strategy, a UX pattern - starts with a survey of prior art and existing open source, not with code. The first idea that works is a hypothesis, not a decision.
2. **Fan out the research.** Independent questions go to parallel agents, each with a strict output format: recommendation, comparison table with sources, test log, and unknowns marked "unverified".
3. **Test hands-on with real samples.** Candidates are run against real captured text (the corpus), with outputs and screenshots - never judged from documentation or search snippets alone.
4. **Decide together, then record.** Findings come back as options with a lean; Darwin makes the call on anything that shapes the product's feel. The decision, its reason and its evidence go into the Decisions table before code is written.
5. **Fix the cause, not the symptom.** When something breaks, find out why (capture, log, read the source) before changing anything. Patches built on a guess get removed - as happened with the focus "grace period" and the clipboard fallbacks on 2026-10-12.
6. **Test the formatted output, not the app** (Darwin, 2026-10-12, until he says otherwise). Correctness is checked on what the pipeline produces - cleaned text and HTML - from a script; no launching the app and reading screenshots. Images, when useful, are rendered headlessly from that output. In-app rendering is polished separately.
7. **Smallest sufficient change.** Remove what is no longer needed (the signing certificate once no permission required it). Every line must earn its place.

## Decisions

| Decision | Why | Evidence |
|---|---|---|
| **Standalone personal project** at `~/glimpse` with its own git repo; design record lives here | Darwin, 2026-10-12: "this is a standalone project... personal, not work related" | Own repository since 2026-10-12 |
| **Public messaging never mentions copying or the clipboard** | Darwin, 2026-10-14: copying "is just the workaround"; the product should read as working anywhere on the desktop | Name, slogan, first run and README follow it; the mechanism (input = the clipboard) is unchanged |
| **Open source under MIT**, at `darwinj07/glimpse` | Darwin, 2026-10-14 | docs/launch.md |
| **⌘C⌘C pushes the formatted result to the clipboard; the panel shows it, no click needed** (2026-10-24) | Darwin, 2026-10-24: "we may make the UX more format-copy native. cmd+c twice -> immediate push the formatted version on the clipboard, rather than requiring the click in the panel." He found himself using the copy button constantly - "copy a message into another app from Claude Code" - so the format-copy lane is the real use case, and the "render" framing undersells it | The engine already produces the payload and the copy button already ships it (as plain text since 2026-10-28; it was HTML + plain before); the change is the trigger, not the engine. It makes the app write the clipboard, so principle 7 is amended ("no writes the user did not ask for"). Open: the pasteboard payload (HTML+plain, plus a markdown flavor?), whether the push happens only when the output differs from the original, and how the original text stays reachable. Checklist: docs/product-direction.md 1h |
| **Panel width: the widest block that is not a paragraph, at its natural width, clamped to 680..85% of the screen** (2026-10-26) | Darwin, 2026-10-26: "a simple mechanical rule that is sensible and not too complex ... simplicity and pragmatism"; "starting out wide is better than small"; minimum 680 kept | Code, verbatim, diagrams and tables (cells unwrapped) set the width; prose and demoted terminal UI never do, and prose keeps the 680 panel's measure. Past the cap code and verbatim scroll (verbatim no longer wraps - wrapping broke drawings), tables wrap, diagrams scale down. Height rule unchanged. Corpus, headless (231 copies): 99 stay at 680, 132 grow, 0 overflow when they fit; at the cap 53 (laptop, 1468) / 20 (external, 2280) |
| **Zoom: ⌘+ / ⌘- / ⌘0, remembered** (2026-10-26) | Darwin, 2026-10-26: "a basic feature" - was not on the plan | `WKWebView.pageZoom` in Safari's steps (50-300%); the level persists (how big the user reads, not a per-text choice); the panel's minimum width scales with it, so lines keep their length |
| **The ⌘C⌘C push is an opt-out setting, on by default; the panel's copy button copies what the panel shows** (2026-10-28) | Darwin, 2026-10-28: make the push opt-out, "this solves the 'we need to inform user' problem"; the copy button "for copying either the formatted version or the raw version ... depends on the mode user is in" | Settings: "Auto-copy formatted text on render" (`copyFormattedOnRender`, default true; the menu bar has no entry). Copy button: the formatted copy in the formatted view, the original text while the original shows; tooltip follows. Settings top: heading "Select text anywhere", line "Press ⌘C twice to render it.", and a "Try it" button that reopens the demo (Darwin, 2026-10-28; teaches the gesture outside the first-run card). Chrome: option A (Darwin, 2026-10-28) - stays demoted HTML in the render, but every copy keeps it as plain text, lines as they arrived (not joined or unwrapped), nothing stripped |
| **Every copy is plain text: the engine's markdown, unescaped; no HTML flavor** (2026-10-26; HTML removed 2026-10-28) | Darwin, 2026-10-26: "this is the lightest form of modification from raw text - just one step away. visible text is way too down the funnel" - the plain flavor was the page's `innerText`, which dropped link URLs, fences and diagram source | **2026-10-28 (Darwin): the HTML flavor was a bug he never intended or knew about; removed from the code and these docs. Advanced copy options may return later (docs/launch.md backlog).** Funnel: clipboard text -> engine markdown -> marked HTML -> mermaid -> panel; the copy is the engine's markdown, emitted a second time without the escapes that exist only for marked (`engine/70-render.js` `render(..., plain)`), demoted chrome left out. Escapes copied as-is would have hit 93 of 214 real copies (1,050 backslashes); unescaped, 2 remain (table-cell `\|`). Trade-off accepted: in a markdown target, a stray `*` or `_` in prose can be read as emphasis, the same as pasting the original text there |
| **Vector F is now, not later: formatting text for the way out** (2026-10-24) | The thesis already named format handling as the core capability; the copy lane is where that capability is used daily | Darwin, 2026-10-24. The panel is one consumer of the format layer; the text going out to another app is the other, and it is the one he reaches for. Framing, slogan, payload flavors and naming are open calls - docs/product-direction.md 1h |
| **Mermaid: detect and draw, with or without a language line** | Darwin: mermaid detection is a must; official mermaid for looks | Detection: header keyword + `mermaid.parse()`, on the whole copy first, then each blank-line block outside fences; a bare `mermaid` line (Claude Code's display of a fence) is dropped first. Drawing: mermaid 12.1.0, base theme with Apple system grays per appearance as `themeVariables` (covers every diagram type) plus the researched `themeCSS` for flowcharts. The 5.5MB bundle is inlined only when a line starts with a mermaid keyword. Tested 2026-10-12, dark mode: real sample with and without the tag line, fenced sequence diagram, diagram inside prose, state and class diagrams all render; prose starting with "graph"/"pie"/"Journey" stays text. Light mode and in-app latency not yet checked |
| **Code vs not-code only; no language detection, no syntax colors for now** | Darwin, 2026-10-12: "what matters is 'code or not code'"; one unified code-block style; highlight.js may return later for coloring | Guessers mislabel prose as code and code as the wrong language (research findings below) |
| ~~Ad-hoc rules are fine behind the scenes~~ **Superseded 2026-10-13**: still not perfect, but no stitch-and-fix (row "generality over granularity") | Darwin, 2026-10-12: "it doesn't have to be PERFECT... whatever we can do to make UX better." Darwin, 2026-10-13: "we don't aim for perfection. but we for sure will avoid stitch-and-fixing" | A known gap ships as a friction-log entry rather than a case rule (glued PR tables, 2026-10-13) |
| **Glued rows: one row model for every row kind; text cuts only where a validator confirms** (2026-10-22) | Darwin, 2026-10-22: a second width estimator with gates added one regression at a time is stitch-and-fix; asked for an orthogonal design. Cause confirmed by Darwin: Claude Code redraws on resize and pads rows to the new width, so copy joins them to the next row | A glued line is rows of exactly T columns (copy keeps a joined row's spaces, trims only the last row). Rows start at column 0, or carry on from where the previous content ended (the copied newline does not reset the column: T minus the previous end column equals the opening run in four copies); a copy's first and last line may be cut mid-row by the selection. One estimator replaces the box-only `unglue` and the padded-text pass: T is at least the widest box border run and explains the most row boundaries, an exact cut counting for it and an inexact one against it. One exactness test per row kind: table rows (box marks or pipe) restored whole, start mark to end mark; other rows meet at a run of 2+ spaces. **A glued text row reads the same as two aligned columns** (`kubectl` output, `path   <- note`): geometry cannot separate them, so table cuts apply in Lex (their marks prove them) and text cuts are only offered, to the diagram parser. Prose glue stays as copied until a validator exists. Data: friction log 2026-10-22 |
| **Close calls keep line breaks** | Mistaking code for text joins its lines (the mangled-mermaid failure); mistaking text for code only costs a monospace font | - |
| **No HTML sanitization** | It's the user's own clipboard; not a concern for this tool | Darwin, 2026-10-12 |
| **Input = the clipboard.** Triggers: ⌘C⌘C (two copies within 0.5s), ⌃⌥M (render current clipboard), Services right-click as a bonus | Copy is the only selection export every macOS app implements. Services and the Accessibility API both require app cooperation | Probed 2026-10-12: cmux exposes no AX selected-text attribute on any of its 389 AX elements; cmux's terminal view doesn't implement the Services protocol (manaflow-ai/cmux @ `570b6687`, no `writeSelection`/`validRequestor` in Sources), and 3/3 plain-shell Services calls arrived with an empty pasteboard |
| **No synthetic ⌘C, no Accessibility permission** | Violates read-only; clipboard managers record the synthetic copy; permission friction | Built and removed 2026-10-12 |
| **Opt-in: ⌘C with nothing selected shows the clipboard** (menu toggle, off by default) | Darwin, 2026-10-20. Most apps write nothing on an empty ⌘C, so only the keystroke shows it: a listen-only event tap (Input Monitoring) - reads keys, never blocks or synthesizes them, so read-only holds. Never collides with the double-copy path: it fires only if `changeCount` did not move within 0.2 s of ⌘C; any write means text was selected and belongs to ⌘C⌘C | "No permissions" becomes "no permissions by default". The 0.2 s settle is unmeasured: an app that writes later than that would show the previous clipboard (unverified; measure from dogfood) |
| **Double-copy detection by polling `changeCount` at 50ms** | No permissions, no key monitoring - same method clipboard managers use. Multiple writes from one copy land in one tick and count once | `pbcopy` = exactly +1 per write (measured); slow pair 1s apart: 0/3 triggers after one unexplained hit on the first run |
| **False-trigger guard: both copies must hold identical text; skip `org.nspasteboard.ConcealedType` / `TransientType`; a change without text is skipped, not a reset** | A deliberate double copy always repeats the same text; password managers mark their copies concealed; writers clear then write, and a poll can land in between | Built 2026-10-12. Controls 12/12 over 3 rounds: same text twice fires; different texts, concealed twice, same text 1s apart never fire. The first version reset on the empty in-between state and missed every real double copy |
| **Swift/AppKit, single file, `swiftc` + `build.sh`, no Xcode project** | Smallest thing that is truly native; trivially rebuildable | - |
| **Panel = non-activating floating NSPanel** (Spotlight/Alfred pattern) | Takes key focus without activating the app; an activating window got its focus bounced back by macOS's cooperative activation and closed itself | Observed 2026-10-12: shown then resigned 1.5s later with `NSApp.activate`; stable after switching to `.nonactivatingPanel` |
| **Throwaway by default** (Esc / click-away closes) **until the user engages**: any click, scroll or key inside the panel keeps it open after it loses focus; Esc, ⌘W or the close button still close it; each new render starts throwaway again | Darwin: "one-off, disposable"; Darwin, 2026-10-20: "make it persist when the user clicks on it / or interacts with it even just once" | A glance never touched is still gone on click-away; touching it is the signal to keep it. No pin button to learn. Supersedes the "keep-open control" open vector |
| **Ad-hoc code signing** | Glimpse needs no TCC permission (clipboard only), so a stable identity buys nothing; the self-signed key made every build prompt for the keychain password | Self-signed identity tried and removed 2026-10-12 |
| **Format engine v2: generality over granularity.** A new failure is answered by a general invariant or validator that covers its whole family, never by a rule for that case | Darwin, 2026-10-13: "a wise move is not more granularity, but generality and simplicity that can cover many cases. that is what great design is" | The UI-mockup copy (friction log) became two invariants - no lost word, geometry is content - instead of three case rules. docs/engine-v2.md revision 3 |
| **Terminal UI is shown as dimmed lines in place**, not a collapsed chip | Nothing to click or read; a wrong demotion leaves the text readable, so it is a cheap mistake | Real copies hold almost no terminal UI: 1 line in 39 of Darwin's copies; all 781 samples with it come from the constructed spill/multi kinds. Darwin, 2026-10-13 |
| Current renderer: WKWebView + marked (GFM) + mermaid, bundled offline (highlight.js is not bundled), plus a Tidy pre-pass (Claude Code markers, dedent, box tables) | MVP scaffolding | **Provisional.** Tidy was built against a hand-written sample, never a real copy. Both are superseded by the format layer (vector C) |

## Vectors

**C - Format handling (the core).** Open; the main body of work. Known sub-problems:
- *Line breaks:* single newlines are sometimes hard wraps (join them), sometimes structure (logs, plain lists, poetry, addresses).
- *TUI-rendered markdown:* Claude Code renders markdown before display, so a screen copy has lost `#`, code fences, emphasis markers; tables are box drawings. **Confirmed for code blocks** (n=1): fences dropped, the info string printed as a bare line above the indented code.
- *Unfenced code with no language hint:* detect the block and its language from content alone (Darwin, 2026-10-12: "what if the user copies it WITHOUT the mermaid"). Deterministic signals first (e.g. mermaid's header keywords, parsers), statistical only as fallback; when unsure, keep line structure. Claude Code's renderer is a deterministic function, so it may be *invertible* from its known rules rather than guessed at.
- *Mixed blobs:* prose + a log + a table in one copy. Classification must be per block, not per document.
- *Non-markdown inputs:* JSON, stack traces, diffs, CSV/TSV, SQL, ANSI escape codes, URLs, a single word.
- *Width and script:* CJK and emoji are double-width, which breaks column alignment in box tables and aligned text.
- *Trust:* a raw/rendered toggle so the user can always check what the layer did.

**E - Visual design.** Crucial; first-class. Typography, measure (~70ch), sizing and zoom, code and table styling, panel material and animation, keyboard scrolling without a click first. Judged by eye in a gallery, not by tests.

**A - Lifecycle.** Throwaway by default, kept open once the user interacts with the panel (decided 2026-10-20).

**B - Placement.** Currently opens below the mouse; after a keyboard ⌘C⌘C the mouse can be anywhere and the panel may cover the copied text. Candidate: last user position/size, upper-center on first run. Open.

**F - Future: format AI/TUI text for pasting** (fix hard line breaks and other copy damage on the way *out*, into Slack, docs, etc). Explicitly out of scope until rendering is solid; the format layer should be built so it could later serve this.

Smaller items (lean, not decided): measure latency and keep the web view warm if needed; lazy-load mermaid only when a mermaid block appears; ⌃⌥M stays until it conflicts.

## Pitfalls of vibe-coded apps (and the countermeasure for each)

| Pitfall | How it shows up here | Countermeasure |
|---|---|---|
| **Author-written test data** | Tidy was tested on a sample the author made up - it passes, and says nothing about real copies | A corpus of *real* text: raw markdown from session transcripts paired with what the terminal actually showed for it, plus real non-AI clipboard text |
| **Heuristic whack-a-mole** | Each regex fix breaks a case nobody re-checked | Every change runs the whole corpus; regressions are visible in a diff of outputs |
| **Happy-path only** | Empty input, 10k lines, CRLF, tabs, NBSP, ANSI codes, CJK, emoji | These are named corpus entries, not afterthoughts |
| **Silent failure** | A render error leaves a blank panel | Any failure falls back to the raw text, and says so |
| **Untestable logic** | Format logic tangled into UI code can only be checked by clicking | The format layer is a pure function (text in, document out) with a headless CLI |
| **"Looks native"** | Right look, wrong feel: scroll, focus, keyboard, multi-display, full-screen spaces | A manual feel checklist run on each release |
| **Performance cliff** | Regex backtracking on big input; reloading the web view per render | Corpus includes large inputs; latency is measured, with a budget |
| **Unreviewed agent output** | Agents report "done" on code that only works for their own examples | Every agent change gated by the corpus plus a cold reviewer; Darwin reviews the visual gallery |

## Execution plan

**Phase 1 - Ground truth, by dogfooding (Darwin, 2026-10-12).** Gathering samples agentically is likely hard, so the corpus starts from real use in-session: Darwin uses Glimpse, flags what's off. A debug capture (`defaults write com.blueball.glimpse captureDir <dir>`, off by default) saves each render - raw input, the cleaned text, and a snapshot of the panel - to gitignored `corpus/`, so every complaint arrives as a reproducible sample. The agentic tracks below stay available to widen the corpus later:
1. *Paired corpus:* raw markdown of assistant replies from session transcripts, matched with what the terminal actually showed for them (via `cmux read-screen --scrollback`). Gives input/expected pairs with known truth. Must establish how a real terminal copy treats soft-wrapped lines vs read-screen.
2. *Renderer spec:* exactly how Claude Code turns markdown into terminal text (headings, emphasis, code, lists, tables, links, wrapping), from its shipped bundle and live observation. Turns guessing into inversion.
3. *Real-life zoo:* non-Claude clipboard text - Slack, logs, JSON, stack traces, diffs, CSV, SQL, ANSI, CJK. Local only, secrets scrubbed.
4. *Prior art:* existing algorithms and libraries for format detection, hard-wrap reflow and table recovery; what other tools do.

**Phase 2 - Architecture (with Darwin).** The format layer's design: block segmentation, per-block classification, repair passes, confidence and the conservative fallback, raw toggle, implementation language. Reviewed cold before building.

**Phase 3 - Harness before features.** Headless CLI, corpus runner with output diffs, and a **visual gallery** (original vs rendered for every corpus entry on one page) as Darwin's review surface.

**Phase 4 - Build in parallel.** One agent per repair pass or block type, each gated by the full corpus and a cold reviewer. Small independent tracks run alongside: false-trigger guard, latency measurement.

**Phase 5 - Gate and dogfood.** Darwin reviews the gallery, uses it daily, and fills the friction log; the next round comes from that log.

### Quick-use features (proposed)

| Feature | Lean |
|---|---|
| **Copy formatted** | ⌘C in the panel with nothing selected copies the whole result as plain markdown text. Plus a hover button |
| **Copy clean markdown** | ⇧⌘C: the repaired text as markdown - joined lines, real tables, fenced code. This is vector F (fixing terminal copy damage for pasting) for free |
| **Copy as image** | ⌥⌘C: the panel's render as PNG, for tables and diagrams in Slack |
| **Raw toggle** | One key flips formatted ↔ original (principle 5) |
| Keep open (pin) | Vector A, when friction shows it |
| Auto-copy on ⌘C⌘C | **Decided 2026-10-24 (Darwin)**: the ⌘C⌘C gesture pushes the formatted result to the clipboard itself, no click in the panel. Reverses the earlier lean against it | Darwin: "cmd+c twice -> immediate push the formatted version on the clipboard, rather than requiring the click in the panel" - he uses the copy button constantly (copying a message from Claude Code into another app). The earlier worry ("writing the clipboard without an explicit action surprises") does not apply: the double-copy gesture *is* the explicit action, and the panel still opens as the preview. Guards that must hold: the watcher never pairs its own write, and the auto-push never degrades the copy (the "never worse than the original" floor still applies to what lands on the pasteboard) |

Copy actions are user-initiated, so they fit "read-only toward the world" (which forbids writing *without* user action). The double-copy watcher must ignore Glimpse's own writes.

**Built first as buttons (2026-10-13)** - Darwin: "users will have trouble learning shortcuts", so visual before keys; no new shortcuts yet. Three SF Symbol buttons top-right in the drag strip (recessed, outline on hover, tooltips): copy formatted (`doc.on.doc`), copy as image (`photo`), raw toggle (`chevron.left.forwardslash.chevron.right`, highlighted while the original shows). A copy swaps the icon to a checkmark for 1s. Decisions:
- **Copy formatted** writes plain text only (HTML flavor removed 2026-10-28; it shipped from the first commit, unintended). Superseded 2026-10-28: the button copies what the panel shows - formatted, or the original in the original view.
- **Copy as image** is the visible area: WebKit paints nothing outside the viewport (a taller snapshot rect comes back blank, tested offscreen), and stitching would flicker the panel.
- **Raw** wraps long lines (`pre-wrap`) rather than scrolling sideways; line breaks are kept exactly. Each new render starts formatted.
- The watcher syncs its change count after every button write, so a button copy can never pair into a re-render.

## Non-goals

Editing, history, file browsing, tabs, sync, a settings window, an Xcode project, a Dock icon.

*Under review 2026-10-14*: "a settings window" - Darwin wants options (shortcut, start at login, menu bar icon, some customizability) for the public release; the most native minimal surface is being researched (docs/launch.md, phase 1).

