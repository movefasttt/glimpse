# Glimpse

Native macOS panel that renders the clipboard as readable formatted text (⌘C⌘C anywhere, or ⌃⌥M). Design record - thesis, principles, decisions, vectors: `docs/design.md`; friction log: `docs/friction-log.md`; dated research and cold review: `docs/design-history.md`. Read it before changing behavior; record decisions there before coding. Launch plan: `docs/launch.md` (sequence and open calls), `docs/app-readiness.md` (1a-1g), `docs/product-direction.md` (1h framing, 1i panel).

## Before any change
- **Research, don't jump.** Non-trivial choice (library, algorithm, detection, UX) = survey prior art + open source first, parallel agents, hands-on tests on real samples (`corpus/`), comparison table, then Darwin decides. First working idea = hypothesis.
- **Cause before fix.** Capture/log/read source until the cause is known. No guess-based patches.
- **Smallest sufficient change.** Delete what no longer earns its place.

## Product tests (every change must pass)
- Native and like magic: user never thinks about how it works.
- Universal over clever: works in every app.
- Never worse than the original: when unsure, keep source line structure.
- Instant. Predictable. Disposable. Read-only toward the world: never synthesizes input, and never writes the clipboard except in answer to the user's own gesture (the ⌘C⌘C auto-push, decided 2026-10-24 - see docs/design.md).
- Evidence over vibes: corpus, measured number, or friction log.

## Mechanics
- Build + install: `./build.sh` (ad-hoc signed, restarts the app). No Xcode project. Sources: `main.swift`, `WelcomeCard.swift` (window glue) and `CardView.swift` (SwiftUI card). Check without installing (**set `DEVELOPER_DIR=/Library/Developer/CommandLineTools`, as build.sh does; plain `swiftc` exits 69 on the Xcode license and a `| grep error` filter hides it - confirm with `echo $?` or a deliberate break**): `swiftc -typecheck -swift-version 5 -target arm64-apple-macos14.0 main.swift WelcomeCard.swift CardView.swift`. **Review the card as snapshots, not by launching**: `research/harness/card-snapshot.sh <outdir>`, then look at the PNGs (rules: loom `context/shared/native-mac-ui.md`).
- **Release signing and notarization happen only on Darwin's personal laptop** (Darwin, 2026-10-20): the Developer ID key lives there. Code may be written and pushed from any machine; never try to sign or notarize elsewhere. Pull before working, push when done: more than one machine pushes to `main`.
- Formatting lives in `format.js` (panel + node). Score every change: `cd research/dataset && node score.mjs ../../format.js samples.jsonl --gold gold.jsonl`; failures: `node examples.mjs <report>.samples.jsonl "<cause>"`. Keep a change only if never-worse doesn't drop. Also `node regress.mjs` (regression cases from real copies, neutral rewrites in `regressions.jsonl`; add one per fixed friction-log bug), `node rawmd-check.mjs` (raw markdown) and `../harness/panel.mjs <file>` (headless panel, JS errors); `../harness/toggle.mjs <file>` checks the button hooks (raw toggle round-trip, size message, copy payload); `../harness/payload-fidelity.mjs` checks that the copy payload loses no word outside demoted terminal chrome, over the regression cases, fixtures and every `corpus/` copy - the gate for the auto-push. `../harness/width.mjs [cap]` checks the panel width rule over the corpus (nothing that fits overflows or shrinks). The copy's plain-text flavor is the engine's `copy` output (its markdown without parser escapes), never the page's visible text. Spec: docs/dataset.md. Data (renders, samples) is local and gitignored.
- The headless harnesses need Playwright with WebKit: `cd research/mermaid && npm install && npx playwright install webkit` (that dir is gitignored; it holds the runtime deps for the harnesses).
- Dogfood capture: `defaults write com.blueball.glimpse captureDir <dir>` saves input / cleaned / panel.png per render. Corpus lives in `corpus/` (gitignored, may hold private clipboard text - never commit). Research scratch: `research/` (gitignored).
- **Testing = programmatic output** (Darwin, 2026-10-12, until he says otherwise): check the formatted text / HTML the pipeline produces, from a script. Do NOT launch the app or read panel captures to test. If an image helps, render it headlessly from that output. In-app rendering is touched up separately.
- Verify triggers with positive AND negative controls (same text twice fires; different texts, concealed, 1s apart never fire).
