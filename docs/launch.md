# Glimpse - launch plan

Living plan for taking Glimpse public. Product decisions still go in `docs/design.md`; this file is the launch sequence, its status, and the open calls. Started 2026-10-14.


## Thesis for launch

- **Name and slogan locked (the maintainer, 2026-10-27)**: name **Glimpse** ("it doesn't matter. no one is going to complain"; the collision with the Show HN markdown reader is accepted). Line 1: **"Glimpse: Format & render terminal text, anywhere."** Line 2: **"From broken lines to tables to Mermaid diagrams."** This is the one source for the slogan, one-liner, README hero, promo and Show HN title. **Not the in-app card** (the maintainer, 2026-10-28: the user is already installed; pitch belongs before the install).

- **Wedge**: developers who read AI coding CLI output (Claude Code, Codex, Gemini CLI) in a terminal. One shared, vocal pain: long answers, tables, code and diagrams are unreadable there.
- **Not a markdown viewer.** That shelf is full and every entry opens files (MacMD Viewer, MDViewer, Open Markdown, MarkViewer). Glimpse needs no file: select anywhere, summon, read. The moat is repairing terminal damage (hard wraps, box tables, stripped fences, mermaid), with measured evidence.
- **Messaging never mentions copying or the clipboard** (the maintainer, 2026-10-14: "that is just the workaround"). The impression is: it works anywhere on the desktop.
- **Trust line - locked (the maintainer, 2026-10-27): "Open source. Offline."** "Never writes anything" dropped (the ⌘C⌘C push writes the clipboard); "no permissions" dropped (the opt-in ⌘C-on-nothing needs Input Monitoring).


## Pick up here (2026-10-28, handed over from another machine)

Product is done (the maintainer, 2026-10-26). Name, slogan and trust line are locked (Thesis above). Everything is pushed; `git pull` first.

| Next | Who | Notes |
|---|---|---|
| Welcome/settings card (1c/1g) | Agent, then the maintainer picks | **Direction B chosen (the maintainer, 2026-10-28), "Try it first"**: first run opens with a messy sample already selected and one instruction (press ⌘C ⌘C), then a check and the controls; later opens go straight to the controls. No slogan or pitch in the card. Controls: Launch at Login, ⌘C-on-nothing, shortcut recorder (replaces the `defaults write` path), Sponsor link in the footer. **Built in source 2026-10-28** (`WelcomeCard.swift`, wired in `main.swift`; typechecks, not yet run by hand): two screens in one window (the maintainer, 2026-10-28) - a demo ("Drag to select the text below, then press ⌘C twice.", unselected sample, Skip / Continue) then settings (Done); first run shows both, every later open (reopen, Settings… ⌘,) only settings; no divider lines; one toggle, "⌘C with nothing selected renders clipboard" (opt-in, tied to ⌘C because detection reads "the app copied nothing"; static label; Input Monitoring note under it). **The custom-shortcut recorder was cut for 1.0 (the maintainer, 2026-10-28)**: a global hotkey cannot read the selection without Accessibility (or synthesizing ⌘C), so it could only render the clipboard - ⌘C ⌘C with an extra step. It may return only if it reads the selected text; live Input Monitoring state; shortcut recorder (needs ⌃, ⌥ or ⇧⌘); Sponsor link points at `github.com/sponsors/movefasttt` (live, verified 200 on 2026-10-29). Sample is a placeholder: the real one should mimic broken TUI output (hard-wrapped lines, malformed table, mermaid). Mocks: `research/card-mocks/` (local) |
| About window + donation surfaces (1f #5, #6) | Agent; the maintainer sets up GitHub Sponsors on `movefasttt` | Version, license, repo, Sponsor link |
| Pasteboard privacy steps 2-3 (1a) | the maintainer, personal laptop | Fresh user account + notarized build (`release.sh`, personal laptop only) |
| Homebrew cask + release notes (1f #4) | Agent | **Cask skipped for the first release (the maintainer, 2026-10-29): DMG only.** Release notes still needed |
| README (phase 2) | Agent | **Simple draft written 2026-10-29** (`README.md`). Hero from the locked words. Trust line removed from the README (the maintainer, 2026-10-29); install = one DMG link; line 2 "From broken lines to tables to Mermaid diagrams." judged unintuitive, replaced (the maintainer, 2026-10-29, "we will keep touching on it") by: "Turn broken AI output into paste-ready Markdown. From broken lines and tables to Mermaid diagrams." How-it-works says "Drag text", not "Select text" **Candidate headline phrase (the maintainer, 2026-10-29): "<xxx> to paste-ready Markdown"**, xxx like "broken AI output" - may become the slogan/headliner later; not yet in the README |

Checks on a new machine: `cd research/mermaid && npm install && npx playwright install webkit` once. The corpus harnesses (`payload-fidelity.mjs`, `width.mjs`, `toggle.mjs <copy>`) read the local, gitignored `corpus/` - a machine without it runs only the committed cases.

## Phases

| # | Phase | Exit criterion | Status |
|---|---|---|---|
| 0 | **Trivials**: one squashed commit, personal repo, license, scrub non-public content | Private `movefasttt/glimpse`, MIT, no work references in tracked files | **Done 2026-10-14** |
| 1 | **The app, ready for strangers** (detail: [app-readiness.md](./app-readiness.md), [product-direction.md](./product-direction.md)): name, slogan, icon, first run, options, support link, distributable build | A stranger downloads, opens, and summons a panel in under a minute with no dialog, no README | Product done (the maintainer, 2026-10-26: "the product itself is finished"): auto-push with markdown payload, width rule, zoom; the 1a blockers are all fixed in code (CSP, concealed text on Services, hotkey conflict shown, force unwrap, `LSHandlerRank`). Status 2026-10-29: name/slogan locked (10-27), welcome/settings card built (recorder cut 10-28), icon + menu bar glyph shipped (10-29), Sponsors live. README drafted, release notes in docs/release-notes.md, About window skipped for 1.0 (the maintainer, 2026-10-29). Still open: pasteboard privacy steps 2-3 (the maintainer, on the notarized DMG) |
| 2 | **Repo**: README (hero loop, install, trust, how it works), contributing notes, third-party licenses, flip to public | Repo reads well cold | - |
| 3 | **Assets and promo copy**: demo (hero loop 8-12 s showing "anything": fuzzy terminal text, markdown, mermaid; 30 s captioned video), before/after stills, one-page site + domain; promo texts: README hero copy, Show HN title + first comment, X/Threads thread, Reddit posts, FAQ (incl. "why not Claude Code's `/copy`?") | All made from real copies, rendered headlessly where possible | Later (the maintainer, 2026-10-20) |
| 4 | **Private beta**: 10-20 heavy AI-CLI users; iTerm, Ghostty, Warp, VS Code terminal, Codex CLI; macOS 14-27 | Friction log empty of blockers; 3-5 quotes | - |
| 5 | **Launch day** (Tue/Wed): Show HN 8-9am PT, X + Threads thread with video, r/ClaudeAI + r/ClaudeCode | Present in every thread all day | - |
| 6 | **Follow-through** (week +1): r/macapps, r/commandline, awesome-claude-code PRs, Homebrew cask, newsletters, Discord showcases; second launch = the "no vibe-coding" essay from design.md | - | - |


## Order of work

1. **Auto-push the formatted result on ⌘C⌘C (1h, decided 2026-10-24, ASAP** - [product-direction.md](./product-direction.md)**)** - the format-copy lane's core move, and the one thing that makes the reframe felt rather than cosmetic.
2. Pasteboard privacy test (1a, steps 1-2 - [app-readiness.md](./app-readiness.md); decides whether the watcher design changes), then the other 1a blockers.
3. the maintainer's calls: name, slogan, icon concept, bundle id, Developer ID. **Plus the 1h framing calls** ([product-direction.md](./product-direction.md)) (what the product is, slogan, payload flavors, naming) - they are the same call, made later, so do not re-litigate the slogan separately.
4. Icon into build.sh, with an output assert (1f #1, #9); About/version/menu (1f #6, #7).
5. Welcome/settings card + shortcut recorder + shortcut consolidation (1g).
6. release.sh, notices, DMG layout and volume icon (1f #2, #3), staple both (1f #8), cask.
7. Update path and donation ladder (1f #4, #5).
8. Panel sizing and window handling (1i - [product-direction.md](./product-direction.md)).
9. 1e, then phase 2. ([app-readiness.md](./app-readiness.md) holds 1a-1g.)


## Open decisions (the maintainer)

| Decision | Options | Lean |
|---|---|---|
| Name | - | **Decided**: Glimpse (the maintainer, 2026-10-20) |
| Slogan | - | **Locked (the maintainer, 2026-10-27)**: "Glimpse: Format & render terminal text, anywhere." / "From broken lines to tables to Mermaid diagrams." Supersedes "Drag & Render — Anything, Anywhere." (2026-10-20) |
| Icon | - | **Decided**: L1 "render lens" (messy fragments enter a loupe, clean lines inside), `research/launch/round2/` |
| Settings surface | - | **Decided** (the maintainer, 2026-10-21): one card for first run + settings (Settings… ⌘, and reopening Glimpse open it), plus menu toggles. **Direction B "Try it first" and no promotion in the card** (the maintainer, 2026-10-28) |
| Support platform | - | **Decided**: GitHub Sponsors (0% fee on sponsorships from personal accounts, up to 6% from organizations). Tiers: 99¢ default, $3, $5, $10, custom - Sponsors tiers may be whole dollars only (unverified): then $1 default |
| Bundle id / label | - | **Decided**: label BlueBall (the maintainer, 2026-10-20: "as in sonic blue ball, move fast"), bundle id `com.blueball.glimpse`. No domain planned |
| Apple Developer ID ($99/yr) | - | **Purchased and installed 2026-10-20** (the maintainer): "Developer ID Application (team 33KR3UXR4D)", valid to 2027-11-20. Next: notarytool credentials |
| Launch date | - | No fixed date (the maintainer, 2026-10-20: "doesn't matter"): launch when phases 1-4 are done |
| **Product framing (1h** - [product-direction.md](./product-direction.md)**)** | reader / repairer / both | **Open (the maintainer, 2026-10-24)**: lean is both, repair lane leading. The engine already formats; the copy button already ships it out. Auto-push on ⌘C⌘C is decided and goes first |
| **Slogan (1h)** | - | **Locked 2026-10-27** - see the Slogan row |
| **Naming (1h)** | - | **Locked 2026-10-27: Glimpse.** the maintainer: "Glimpse has the best name ... it doesn't matter. no one is going to complain on that." Collision accepted |
| **Format-copy payload (1h** - [product-direction.md](./product-direction.md)**)** | - | **Decided (the maintainer, 2026-10-26; HTML flavor removed 2026-10-28)**: plain text only = the engine's markdown without parser escapes (design.md) |
| **Panel sizing (1i** - [product-direction.md](./product-direction.md)**)** | - | **Decided (the maintainer, 2026-10-26)**: widest non-paragraph block sets the width, 680..85% of the screen (design.md) |
| **Panel moving (1i** - [product-direction.md](./product-direction.md)**)** | - | **Decided (the maintainer, 2026-10-26)**: keep opening at the cursor; no remembered position; the panel already stays open once engaged; non-activating kept, so Rectangle shortcuts do not apply |
| Release signing | - | **Decided**: by hand on the personal laptop (`release.sh`), no CI (the maintainer, 2026-10-20) |
| Empty-selection command ⌘C | default-on / opt-in | **Decided (the maintainer, 2026-10-25): opt-in**, so no Input Monitoring dialog on first run |
| Default hotkey ⌃⌥M | keep configurable / merge into ⌘C-on-nothing / drop | **Decided (the maintainer, 2026-10-25): deprecate ⌃⌥M.** The empty-selection render command replaces it: default ⌘C (on nothing), user-configurable, and a user-chosen shortcut completely replaces ⌘C (⌘C-on-nothing then stops firing). ⌘C⌘C stays the main lane, never configurable (1g). Open for the build: ⌘C default needs Input Monitoring, a custom combo does not |
| Update mechanism for 1.0 | Homebrew + Releases / in-app Sparkle / manual check | Lean: Homebrew cask + GitHub Releases + a "Check for Updates…" item that opens the browser. Keeps "no network" literally true. Sparkle only if the promise is revised (1f #4) |
| Donation surfaces | first-run only / + menu + About + release notes / + render counter | Lean: first-run, menu bar, About, release notes. **No render counter** - it contradicts the no-nag trust line (1f #5) |
| Version number | 0.1 / 1.0 | **Decided (the maintainer, 2026-10-25): 1.0.** Set `build.sh` to 1.0 (1f #14) |


## Backlog (cut from phase 1, the maintainer 2026-10-25)

| Item | Why it is not blocking | Revisit when |
|---|---|---|
| Pasteboard privacy hedge (decide the double press from `changeCount` timing, read text once) | Privacy hardening, no visible change; the retest on the maintainer's Mac showed no alert | Steps 2-3 of the pasteboard test (fresh user account, notarized build) show an alert on a stranger's Mac |
| VoiceOver labels and keyboard reach on panel buttons (1e) | Accessibility polish | Beta |
| Advanced copy options (rich HTML for Slack/Docs/Notion, RTF, other flavors) | 1.0 copies plain markdown only; the HTML flavor that shipped by accident was removed (the maintainer, 2026-10-28), "we MAY offer advanced copy options later" | After 1.0, if users ask for rich paste |

## Decisions

| Decision | Why | Evidence |
|---|---|---|
| Personal repo `movefasttt/glimpse`, private until phase 2; history squashed to one commit; commits use the movefasttt noreply address | the maintainer, 2026-10-14 | Work references removed from tracked files first (sample texts, vault paths) |
| License: MIT | the maintainer, 2026-10-14 | Vendored marked and mermaid are MIT |
| Code from any machine; Developer ID signing and notarization only on the maintainer's personal laptop | the maintainer, 2026-10-20 | The key lives only in that laptop's keychain; also keeps release work off the work laptop |
