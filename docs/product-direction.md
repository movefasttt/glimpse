# Glimpse - product direction: the framing shift and the panel

Phase 1 of the launch plan ([launch.md](./launch.md)): the two open product questions the maintainer raised on
2026-10-24 - what Glimpse is (reader, repairer, or both) and how the panel behaves as a window.
The app-readiness items live in [app-readiness.md](./app-readiness.md).

### 1h. Framing shift: from "render" to "format" (the maintainer, 2026-10-24) - settled 2026-10-27

**Name and slogan locked (the maintainer, 2026-10-27)**: name **Glimpse** ("it doesn't matter. no one is going to complain"; the collision with the Show HN markdown reader is accepted). Line 1: **"Glimpse: Format & render text from anywhere."** Line 2: **"From broken lines to tables to Mermaid diagrams."** This is the one source for the slogan, one-liner, README hero, promo, first-run card and Show HN title. "Format" is the text you take away, "render" is what you see - both lanes in two words.

the maintainer's observation, 2026-10-24: the only *rendering* problem a TUI has is mermaid and occasional breaks. The bigger use case is **formatting** - Glimpse already formats to render correctly, and the copy button already ships that formatting out, but the feature is under-served. His own usage: copying a message from Claude Code into another app, which he found himself doing a lot. The framing in the slogan ("Drag & Render - Anything, Anywhere") describes the reader, not the thing he actually reaches for.

**The record already leans this way.** Measured from the repo, 2026-10-24:

| Evidence | Says |
|---|---|
| design.md thesis | "**The core capability is flexible format handling, not markdown rendering**" - the maintainer's own words, 2026-10-12. The *capability* was always repair |
| design.md vector C | "Format handling (the core). Open; **the main body of work**" |
| launch.md moat line | "**The moat is repairing terminal damage** (hard wraps, box tables, stripped fences, mermaid), with measured evidence" - already a repair sentence, in the launch plan |
| The friction log | 6 of 11 entries are repair of copied text, and all 6 are *terminal damage* (mermaid, glued PR tables, box-drawn mockups). The other 5 are panel behavior. The product's own history is mostly repair |
| The gates | Every measured number is a repair number: never-worse rate, lost words, join precision/recall, block recovery. There is no "looks good" metric, because there is no test for it |
| What the maintainer uses | The copy button, constantly - "copy a message from Claude Code into another app" |

**So the slogan is the outlier, not the product.** "Drag & Render" describes the panel; the engine, the moat sentence, the gates and the friction log all describe a repairer. The change is to align the public words with what is already built and measured - not to rewrite the product.

**This is a positioning change, not a rewrite of the product.** The engine already does the formatting; the copy button already ships the formatted text out. What changes is (a) which lane the product leads with, (b) how the format-copy path feels, (c) the public words.

#### Decided now (ASAP TODO, not a question)

| Item | Decision | Notes |
|---|---|---|
| **⌘C⌘C pushes the formatted result to the clipboard immediately** | the maintainer, 2026-10-24: "cmd+c twice -> immediate push the formatted version on the clipboard, rather than requiring the click in the panel" | Replaces the click in the panel as the way the formatted text gets out. The panel still opens (it is the preview and the proof). Watch out: the watcher must not read its own write (it already has `skipOwnWrite()`), and the *original* text must stay recoverable - the "never worse than the original" floor and the raw toggle still hold. |
| **Format-copy becomes a first-class lane, not a side button** | The copy button is currently one of three in the drag strip, discoverable only if you look | What the lane looks like is open below. |

#### Open calls (the maintainer)

| Question | Why it matters | Lean |
|---|---|---|
| **What is the product?** Reader, repairer, or both with one lane leading? | Decides slogan, one-liner, README hero, Show HN title | **Both, with the repair lane leading.** The reader is the demo and the moat is repair; the format-copy lane is the daily habit. "Drag & Render" sells the reader, but the habit is the copy. |
| **Slogan** | Public words are decided in one place and reused everywhere (slogan, one-liner, README, promo, card) | Current: "Drag & Render - Anything, Anywhere." **Survey landed (below): lead with what the engine does that a regex cannot, not with the gesture** - the gesture is now commodity. Do not re-decide before reading the survey. |
| **What does the format-copy lane produce?** HTML, plain text, markdown, RTF, image? | The payload is the product here | **Decided 2026-10-26 (the maintainer), HTML part reversed 2026-10-28**: plain text only = the engine's markdown, unescaped; the HTML flavor was an unintended bug and is gone. Before 2026-10-26 the plain flavor was the page's visible text. See design.md Decisions |
| **Does auto-push need a guard?** | Pushing the clipboard on every ⌘C⌘C means a copy can be replaced without a paste ever happening | Consider: push only when the formatted output differs from the original, and keep a one-keystroke path back to the original text. |
| **Does the raw/verbatim floor survive an auto-push?** | "Never worse than the original" is the strongest promise the app has | **Settled by the maintainer, 2026-10-24: it does not matter.** "They can copy again if it's not good." The user can always re-copy the original. The floor still holds for the *engine* (it never loses a word), but a suboptimal paste is the user's to redo, not a blocker. The one thing that must hold is that the auto-push never *loses* content - `research/harness/payload-fidelity.mjs` gates that. |
| **Naming** | "Glimpse" reads as a viewer; the repair lane is about what happens *after* the copy | **The survey found a concrete collision**: a native macOS markdown reader already ships as **Glimpse** (Mac App Store, subscription, Show HN ~5 months ago). Different feature, same name, same platform, adjacent category. This raises the question from "reads as a viewer" to "already in use" - see below. |

**the maintainer's calls, 2026-10-24 (settled, not open):**

- **The trust line is not a blocker.** "Very trivial! I don't care. we will push. it's already decided." So the launch plan's trust line gets reworded before it is printed, and the reframe proceeds without it being a gate.
- **The "never worse" claim is not a gate either.** "Doesn't matter. They can copy again if it's not good." The user can re-copy the original; the floor is the engine's, not the paste's.
- **Terminal chrome stays out of copies.** "I'm fine with it if it's just how Glimpse behaves at this point."

**So what is left open in 1h:** only the *words* - what the product is called, the slogan, the one-liner, the name, the payload flavors. The behavior is decided.

#### Framing prior art, surveyed 2026-10-24 (the framing question is settled; the moat question is not)

the maintainer's instinct is confirmed by the market - and that confirmation has a cost. Six shipped products solve the format-copy moment, and one solves it with Glimpse's exact gesture.

| Product | What it does | Price / platform | Why it matters here |
|---|---|---|---|
| **Duopy&Paste** ([Mac App Store](https://apps.apple.com/si/app/duopy-paste/id6774124909?mt=12)) | Cleans text copied from terminals and AI coding assistants. **Double ⌘C within 1.5s** replaces the clipboard with the cleaned version: hard wraps, shared indentation, quote bars and table borders removed, code blocks and list structure preserved. Menu-bar panel shows the last 10 cleans as original-vs-cleaned side by side. | €0.99, macOS 13+ | Glimpse's trigger, Glimpse's auto-push and Glimpse's side-by-side preview - already shipped for under a euro |
| **PipeCleaner** ([Mac App Store](https://apps.apple.com/us/app/pipecleaner-fix-text-tables/id6778206022?mt=12)) | "Auto-clean Terminal Output" - "the missing translation layer between your developer tools and your documentation". Detects box and whitespace tables, shell prompts, log timestamps, ANSI codes, dividers; emits **destination-aware** output (a real table in Word, cells in Excel, Markdown for GitHub), configurable per app. No AI, no network. | $9.99, macOS 15+ | The closest strategic competitor. Differentiated on *destination*, which Glimpse does not do |
| **Trimmy** ([GitHub](https://github.com/steipete/Trimmy)) | Flattens multi-line shell snippets so they paste and run - joins `\` continuations, strips prompt gutters; "Paste Trimmed" hotkey. | free, MIT, macOS 15+ | The same repair, scoped to commands instead of prose |
| **ai-clean** ([GitHub](https://github.com/TheAndruu/ai-clean)) | Cleans borders, padding and wrapped lines from AI CLI output - names Claude Code, Copilot CLI, Cursor, Gemini CLI. | free, open source | Names our exact wedge: the AI CLI, not "the terminal" |
| **pastecleaner / unwrap-terminal-text / clipfix** ([PyPI](https://pypi.org/project/pastecleaner/)) | CLI filters that strip gutters and unwrap prose while preserving fences. | free | The trivial version of the engine: regex, no geometry |
| **claude-copy** ([Korben](https://korben.info/en/claude-copy-clean-clipboard-claude-code.html)) | Hammerspoon hook that intercepts ⌘C and cleans with confidence tiers - low confidence means hands off. | free | The "confidence tier" is the same instinct as demote-not-delete |

Two platform moves also erode the wedge from below:

- **cmux** - the maintainer's own terminal - merged native soft-wrap joining on copy on **2026-09-26** ([PR #6923](https://github.com/manaflow-ai/cmux/pull/6923)): "Copying a line Ghostty soft-wrapped now pastes as one line", with heuristic hard-wrap reflow behind an off-by-default setting.
- Apple Notes on macOS 27 adds **Copy as Markdown**; VS Code, Chrome and Scrappy all ship paste/copy-as-markdown.

Verified by fetching the four load-bearing pages directly (Duopy&Paste, PipeCleaner, the cmux PR, the Show HN item). Trimmy, ai-clean and claude-copy rest on search summaries only - **unverified**.

**What this changes:**

1. **the maintainer's framing read is right.** Format-copy is the daily use case, and the market says so. No further argument is needed on *what the product is for*.
2. **But format-copy is not a moat.** It is a crowded, cheap shelf (€0.99-9.99), and the terminal is fixing the easy half itself. Leading the launch with "Glimpse formats your copy" puts it in a price fight it cannot win and does not want, as free software.
3. **The moat is what none of them do**: the geometry/evidence engine (box tables, glued PR tables, mermaid, reply reconstruction) and a panel that *shows* what it did. Every competitor is a strip-and-join heuristic. None reconstructs a table's columns or parses a diagram.
4. **So the honest position is "the reader that repairs."** The panel is the proof and the copy is the payoff - which is exactly the framing already in design.md, and exactly what the current slogan undersells. The slogan should lead with what the engine can do that a regex cannot. The gesture is commodity, so it cannot be the headline.
5. **The name risk is now concrete.** A native macOS markdown reader called **Glimpse** was on [Show HN](https://news.ycombinator.com/item?id=48236111) about five months ago and is on the Mac App Store (subscription, on-device AI). Different feature, same name, same platform, adjacent category. The naming question is no longer "does it read as a viewer" - it is "is it already taken."

**Two gaps the survey surfaced** (for the roadmap, the maintainer keeps or drops):

- [ ] **Destination-aware output** - PipeCleaner's real differentiator. A table should paste as a table in Word and as Markdown on GitHub. Glimpse ships one payload today.
- [ ] **An explicit undo/compare affordance** - Duopy&Paste's original-vs-cleaned panel. Glimpse has the raw toggle; the survey says the comparison is what users look at.

#### Checklist rows this spawns (each is an assert, a script step, or a checklist row - never prose)



- [ ] Auto-push the formatted result on ⌘C⌘C, no click (ASAP, decided).
- [ ] The watcher never pairs its own write; the original text stays reachable.
- [ ] Auto-push never degrades the copy: measured against the corpus (never-worse gate).
- [ ] The format-copy lane is discoverable without reading the README.
- [ ] Public words (slogan, one-liner, README hero, first-run card, Show HN title) updated to whichever framing is decided - one source, reused.
- [ ] Launch thesis rewritten for the decided framing, in docs/launch.md and docs/design.md.

**Is the terminal-chrome exclusion ad-hoc? (the maintainer asked, 2026-10-24: "is that an ad-hoc rule for the copy, or is it just how Glimpse behaves at this point?")**

It is **how Glimpse behaves**, and it is one general rule with a profile behind it - not a per-case patch. Traced in the code:

- The *decision* to demote lives in the engine: `engine/02-profiles.js` holds a `source profile` per tool, whose `ui` block lists the terminal-UI line shapes (tool call `⏺ Name(`, output `⎿`, prompt `❯`, status spinner, powerline prompt) and the rules for when they need extra evidence. `engine/90-entry.js` turns those lines into `ui` atoms and emits them as a `g-demoted` block - **dimmed in place, never deleted** (docs/engine-v2.md: "Terminal UI is demoted, never deleted... Because a wrong demotion only dims text that stays readable, it is a cheap mistake and needs modest evidence, not high").
- **Reversed 2026-10-28 (the maintainer)**: chrome stays HTML in the render (dimmed) but every copy keeps it as plain text, exactly as it arrived (`engine/90-entry.js`, the `ui` atom's `copy.push`): "I don't want anything to be stripped." Until then copies left it out ("Demoted lines are left out of every copy action").

So the behavior is deliberate and general: **terminal UI is a separate category, shown dimmed in the panel and copied verbatim as plain text.** The profile is the one place a tool's shapes live, so a new tool is a new profile rather than new rules (docs/engine-v2.md, "Few, general evidence sources").

One consequence worth knowing for the auto-push: copying a reply that *contains* tool output puts only the reply prose on the clipboard. That is the intent, and it is the same for every trigger - the hotkey, the button, and the auto-push.

**Where the words live** (so the change is one edit, not a hunt). Verified 2026-10-24:

| Surface | File | Current wording |
|---|---|---|
| Slogan | `docs/launch.md` (one source) | "Glimpse: Format & render text from anywhere." / "From broken lines to tables to Mermaid diagrams." |
| One-liner (GitHub About) | `docs/app-readiness.md` 1b | "Select text anywhere on your Mac and read it as a clean document - rejoined lines, real tables, code, diagrams." |
| Launch thesis (wedge, moat) | `docs/launch.md` "Thesis for launch" | "developers who read AI coding CLI output ... unreadable there" / "The moat is repairing terminal damage" |
| Menu item (user-facing) | `main.swift` `buildStatusItem` | "Render Clipboard  ⌃⌥M" |
| Services item (user-facing) | `main.swift` `renderService` | "Render with Glimpse" |
| README, promo, card | not written yet | - |

Note the two menu strings say "Render" to the user today, so a framing change touches shipped code, not just docs.

### 1i. Panel sizing and window handling (the maintainer, 2026-10-24) - open

**Decided (the maintainer, 2026-10-26): the panel stays non-activating, so the Rectangle shortcut gap is accepted as a consequence.** Cause not measured: the working hypothesis is that a non-activating panel never makes Glimpse the frontmost app, so Rectangle acts on the window behind it. Being non-activating is what keeps focus in the app the user copied from, which is the "like magic" behavior; giving it up is not worth Rectangle support. Not re-opening unless it shows up in beta.

**Status 2026-10-26 (the maintainer) - supersedes the 2026-10-25 "remember position and size" line.**

| Question | Outcome |
|---|---|
| Remember position / size between runs | **Dropped.** Keep the simple behavior: the panel opens at the cursor every time. Considered and rejected: "moving pins it" rule (remembered spot, update-in-place when visible, Reset item) - more machinery than the use cases earn |
| Stay open while reading | **Already built, nothing to do.** `GlimpsePanel.engaged` is set by the first click, scroll or key; from then on losing focus no longer closes it |
| Rectangle shortcuts | **Accepted gap, stays non-activating.** Source evidence: Rectangle takes `NSWorkspace.shared.frontmostApplication` first, then that app's focused window (read via a fetch summary of `AccessibilityElement.swift`, not line by line). A non-activating panel never makes Glimpse frontmost. Live test inconclusive (frontmost app on the test machine was `loginwindow`). Not strictly exclusive - activating the app on first interaction would make it work after engagement - but declined |
| Content-adaptive width | **Decided and shipped 2026-10-26**: one width rule - see design.md Decisions. The proposal below is superseded |

**Proposal: content-adaptive width.** Today height adapts and width is a fixed 680. Prose stays at a readable measure and never widens the panel; wide blocks (tables, code, box-drawn terminal rows, mermaid diagrams, which are squeezed to 100% width today) set it: width = clamp(widest block's natural width, 680, cap). Short content stays 680 so the panel does not wobble between summons. The page measures natural widths after render (independent of the panel width, so no resize feedback loop) and posts width with height; a manual resize switches auto-sizing off for that open; the panel still centers on the cursor and clamps to the screen. Open calls: the cap (about 85% of the visible screen width vs a hard width like 1100) and whether diagrams drive width too.

**Superseded:** Next up (2026-10-25): remember the panel's position and size between runs. Dragging by the top strip already works and needs no change.

**What was already known (so this is not all new).** Checked against the record, 2026-10-24:

| Gap | Already known? | Where |
|---|---|---|
| The panel is too small | **Partly.** Height was already made content-adaptive (2026-10-12: "panel never shrank" -> measure the body). Width was never questioned - it has been a fixed 680pt constant. The "too small" complaint is therefore about **width**, and is new | design.md friction log 2026-10-12; `Viewer.width` in main.swift |
| The panel cannot be panned / moved | **Yes, and it was "fixed" - but unverified.** The friction log records "tried to drag the panel: the web view swallows drags, titlebar included" -> fixed with a 28pt drag strip over the titlebar, marked "unverified by hand". So the mechanism exists and the strip has never been checked by hand; the maintainer's report says the current handle is not good enough | design.md friction log 2026-10-12; `DragStrip` in main.swift |
| The panel is always on top | **By design**, not a gap: `level = .floating` plus `isMovableByWindowBackground = true`. the maintainer wants the stickiness kept and the moving added | main.swift `Viewer.init` |
| Placement (opens near the mouse every time) | **Known and still open** as vector B: "the panel may cover the copied text. Candidate: last user position/size" | design.md vector B |
| Formatting as the real use case | **Known as vector F**, but parked as "explicitly out of scope until rendering is solid". the maintainer is un-parking it | design.md vector F |

**So: the *window* gaps are mostly a re-report of things the record already flagged (one of them as a fix that was never verified by hand), and the *framing* gap is a real change of direction.** The sizing part of 1i is the genuinely new observation.

**The answer to the maintainer's question - "is it possible to make it sticky yet support panning?" - is yes, and the research says the tension he felt is not real.** From the prior-art survey (`research/launch/_app-behavior-prior-art.md`, sources cited there):

1. **Sticky and movable are not in tension.** Every app in the survey that floats also lets the user move it. The window *level* is not the constraint. Glimpse already sets `isMovableByWindowBackground = true` - it is already movable in principle.
2. **The blocker is the content, not the window.** A `WKWebView` is opaque, so `mouseDownCanMoveWindow` is false across it and it consumes the drag (Apple's own doc for that property: it defaults to `true` only for non-opaque views). The shipped pattern for a titlebar-less panel that drags by background is exactly this: an opaque child blocks it, and the fix is a child-view override - AltTab does `override var mouseDownCanMoveWindow: Bool { false }` on its interactive children so the window can drag from them.
3. **The unusual half is not "sticky", it is "always at the cursor".** Every *persistent* native panel sits at a fixed or remembered spot (Spotlight, Alfred, Raycast, Xcode's Products, Activity Monitor's Process Inspector); only *transient* popovers track the cursor, and those close on focus loss. Glimpse's combination - always at the cursor, always-on-top, persistent - has no native precedent.
4. **The native contract for "the user positions it once" is `NSWindow Frame <name>`** (AppKit frame autosave, `setFrameAutosaveName` / `setFrameUsingName`). It is universal and invisible: Font Book, TextEdit, Preview, Xcode, Activity Monitor, Terminal, Safari, Mail, Notes and the Shortcuts app all persist it, position *and* size together. Caveat from a shipped app: `setFrameAutosaveName` **immediately applies** the persisted frame, so a corrupt one can throw and abort the app - use a guarded variant.
5. **No keyboard nudge to imitate.** macOS has no arrow-key nudge for a panel; the only native keyboard window movement is tiling presets (green button / `Fn-Control`+arrows) and VoiceOver's move mode. Any nudge would be new ground.
6. **Launchers refuse free-form resizing.** Raycast's size is a preset (Default/Large/Larger + Compact), Alfred likewise. A remembered *width* would depart from launcher convention; a remembered *position* is the convention.

**Sizing - "currently size is often too small".** Facts from the code: height is already content-adaptive (the page posts its body height; the panel resizes to it, clamped to 85% of the screen's visible height). Width is a fixed constant, `Viewer.width = 680`. So a wide table or a long code line is cramped while a two-line paragraph gets the same 680pt of space.

- [ ] Measure content width, not just height, and size the panel to the content (with min/max clamps and a measure cap so prose does not run past ~70ch).
- [ ] Decide whether width adapts to content *type* (a table gets more room than prose) or whether one rule covers it.
- [ ] Remember the user's last size - but note the convention: launchers use a *preset* size and remember only position. Either follow them (preset width) or depart knowingly.
- [ ] Survey finding to weigh: Spotlight remembers size (`windowHeight = 430` persisted), and native floating panels persist both - so "remember both" is defensible even though Raycast and Alfred do not.
- [ ] Survey finding already in hand (`research/launch/_app-behavior-prior-art.md`): what native panels do (Spotlight, Alfred, Raycast, TextSniper, PastePal, Quick Look) - summarised in the numbered list above.

**the maintainer's correction (2026-10-24): the panel IS draggable and resizable.** "It is draggable and resizable. But it doesn't register rectangle shortcuts that resize the pane and I think that's how sticky windows behave in macOS." So the 2026-10-12 drag strip works - hand-verified now, which closes that friction entry's "unverified by hand" note.

**The Rectangle gap: what was tested, and what was not.** the maintainer's hypothesis is that a sticky (always-on-top) window not registering Rectangle's resize shortcuts is how macOS behaves. Measured on this machine, 2026-10-24:

- Rectangle **is** installed here (`/Applications/Rectangle.app`, `com.knollsoft.Rectangle`).
- The panel is a real on-screen window: `CGWindowList` shows it at **layer 3** (the floating layer, above the 14 normal windows), 680x200, alpha 1.0.
- **Whether AX can see it is UNVERIFIED.** An AX probe of the app returned `AXUIElementCopyAttributeValue(kAXWindows)` -> error **-25211** (not trusted) - the probe process lacks Accessibility permission, so this machine cannot answer the question without the maintainer granting it. This is *not* evidence that AX cannot see the panel.
- What the survey does establish: Rectangle's actions are **AX-driven** (the same `AXUIElement` position/size calls the probe attempted), and Rectangle's own docs list its actions as screen-edge placements. If the panel is not AX-visible as a window, no AX shortcut can move it - which would make the maintainer's hypothesis right, and would also mean *no* window manager (Rectangle, Loop, Yabai) can manage the panel.

**So the question is now sharp and testable, and it is the maintainer's to answer with one permission grant:** does the system (and therefore Rectangle) see the panel as a window? Until that is measured, the Rectangle gap stays **unverified**, and the fix is not obvious - it may be a style-mask or accessibility property rather than code.

**Moving it - "it is sticky, and appears on top of other tabs".** The panel is `level = .floating` with a 28pt drag strip over the titlebar, because the web view swallows drags (text selection). So it is draggable, but only from that strip, and it is always-on-top.

- [ ] **Decide the interaction.** The survey's answer: drag-by-background is the standard for a titlebar-less panel, and the shipped way to get it under a web view is the child-view override. But text selection in the panel is a feature of the reader lane, so a full background drag would fight it. Options, in order of native precedent: (a) keep the strip but make it obviously a handle and make it work everywhere it is visible; (b) `mouseDownCanMoveWindow` override so the web view's chrome (not its text) drags the window; (c) modifier-drag. the maintainer decides.
- [ ] Keep it always-on-top (`.floating`) - the survey found no native app that floats and does not move, so this costs nothing.
- [ ] **Persist the frame** with `setFrameAutosaveName` (the `NSWindow Frame <name>` contract), guarded against a corrupt persisted frame.
- [ ] **Reconsider cursor-following** - this is the half with no precedent. Either keep it and add a reset affordance (Raycast ships "Reset Raycast Window Position"), or place the panel at a remembered spot. This overlaps vector B, which is still open.
- [ ] Do not break text selection in the panel - that is a feature of the reader lane.

