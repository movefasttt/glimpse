# Glimpse - phase 1: what a Mac app needs to be ready for strangers

Phase 1 of the launch plan ([launch.md](./launch.md)): the audit findings, the identity, the first run,
the distributable build, and the open fixes. The launch sequence and the order of work live in
[launch.md](./launch.md); the product-direction questions (framing, panel behavior) live in
[product-direction.md](./product-direction.md).



Research 2026-10-14: four parallel agents (name and slogan, icon, first run and settings, app readiness audit). Raw material and icon renders: `research/launch/` (gitignored). Two audit findings re-checked by hand: the shipped binary is arm64 only with `minos 27.0`, and the panel has no Content-Security-Policy.

### 1a. Blockers found by the audit (fix first, all small)

**Verified 2026-10-20 against the notarized DMG**, not the source: the two build fixes ship (binary is `minos 13.0`, universal `x86_64 arm64`; `CFBundleShortVersionString 0.1`, `CFBundleVersion 1`). The remaining rows are confirmed still open by grep - no CSP meta, no `LSHandlerRank`, `renderService` skips the concealed-type guard the hotkey path has, `RegisterEventHotKey`'s return is discarded, `NSScreen.main!` survives.

| Item | State | Fix |
|---|---|---|
| **Runs only on macOS 27** | `swiftc` has no `-target`; binary `minos 27.0`, arm64 only; plist claims 13.0 | `-target {arm64,x86_64}-apple-macos13.0` + `lipo` (both compile clean) |
| **Copied content can reach the network** | **Fixed and proven 2026-10-21.** CSP meta in `template.html`. Probed in WKWebView (the app's own engine) with a markdown image, a raw `<img>`, and an `onerror` handler: without the policy both external URLs are fetched (`performance.getEntriesByType('resource')` lists them) and the handler runs; with it, zero resource requests and zero handler execution. **The first CSP was insufficient** - `script-src 'unsafe-inline'` (required for the template's own inline blocks) also permits inline handler attributes, so `onerror` still ran (`leaked: 1`). `script-src-attr 'none'` is the directive that closes it. Mermaid still renders under the full policy (1 svg, 4 nodes, no violations), so no `unsafe-eval` is needed. Links still open through `decidePolicyFor`. **Re-proven independently 2026-10-24** with a negative control (policy removed -> the same probe fetches the URL and the `onerror` handler runs, so the probe can detect a fetch) and a mermaid check (1 svg, 4 nodes, 10 edge paths, 0 violations) |
| **Could become the default .md/.txt opener** | `CFBundleDocumentTypes` Viewer, no rank | `LSHandlerRank = Alternate` |
| **Concealed text on other paths** | Password-manager copies are skipped for ⌘C⌘C only; ⌃⌥M and Services render them | Same skip on every path |
| **Silent failures** | Hotkey registration result ignored (⌃⌥M taken = never works, no sign); force unwraps (`NSScreen.main!`); empty clipboard = beep only | Surface the hotkey conflict in the menu/settings; remove force unwraps |
| **Versioning** | No `CFBundleVersion`, no copyright | Add both, one source of truth in build.sh |
| **Pasteboard privacy (investigate first)** | The watcher reads the string on every clipboard change. macOS 26+ adds pasteboard access controls; if reads by a background app prompt the user, "like magic" breaks for strangers | Test on a clean user account. Design option: decide double-copy from `changeCount` timing alone and read text only when two changes land within 0.5 s, so Glimpse reads nothing unless summoned (also a stronger privacy line). Unverified |

**Pasteboard privacy test (step 1 of phase 1).** Facts (2026-10-20, macOS 27.0.1 SDK): the permission is a TCC record, service `kTCCServicePasteboard` (string in `tccd`), keyed to the app's identity, so reinstalling likely does not clear it. `NSPasteboard.accessBehavior` (macOS 15.4+) reads `.default` until the app first triggers an alert; only then is the app listed in System Settings' pasteboard pane. The default for the general pasteboard is "ask on programmatic access".

1. **Existing evidence**: is Glimpse listed in System Settings → Privacy & Security's pasteboard pane? Has an access alert ever appeared in daily use? Not listed + never seen = background reads have not prompted on 27.0.1 so far.
2. **Reset and retest**: `tccutil reset Pasteboard com.blueball.glimpse`, quit and reopen Glimpse, ⌘C ⌘C in Terminal, Safari and Slack; record any alert and whether Glimpse becomes listed.
3. **Closer to a stranger**: repeat in a fresh macOS user account (developer tools exempt Apple's Terminal paste warning; unknown whether they affect this alert), and again with the Developer ID notarized build before the beta (identity differs from ad-hoc).

**Result of step 1 (2026-10-20, the maintainer's Mac, macOS 27.0.1)**: no pasteboard section in Privacy & Security at all, no alert ever seen - no app, Glimpse included, has triggered an access alert here, so Glimpse's background reads have not prompted. Steps 2-3 still open (developer tools and the ad-hoc identity may differ from a stranger's Mac).

Hedge regardless of the result: decide the double press from `changeCount` alone and read the text once, only when two changes land within 0.5 s - Glimpse never reads the clipboard in the background. Open: the identical-text guard then rests on that one read; fallback is the type-only detection APIs (no alert). Record results here and the watcher decision in design.md.

### 1b. Identity

**Name - lean: keep Glimpse** ("Glimpse for Mac"). Peek is worse on every check: phw/peek (10.5k★ Linux GIF recorder), Apple's Quick Look / "Peek and Pop", a "Peek" Quick Look extension that already renders markdown. Glimpse's real collision is HazAT/glimpse (972★, npm `glimpseui`, a macOS WebView for scripts and agents - same audience); the bare `glimpse` Homebrew cask name is free. All obvious domains (glimpse.app, getglimpse.app, glimpse.so, glimpse.dev) are registered; sale status unverified. One alternative worth a thought: **Squint** ("stop squinting at your terminal"; no Mac/cask collision; squint.app listed for sale) - but it names the pain, not the payoff. Trademarks unverified.

**Slogan - locked 2026-10-27 (the maintainer): "Glimpse: Format & render terminal text, anywhere." / "From broken lines to tables to Mermaid diagrams."** Superseded below: ~~"Drag & Render — Anything, Anywhere."~~ (2026-10-20). Drag (the mouse drag that selects) is more intuitive than "highlight"; the emphasis is *render*: any kind of text - fuzzy terminal text, markdown, mermaid, tables. The revision binds the two actions with the ampersand and lets the dash introduce the payoff. Earlier research below.

Earlier: pattern of loved utilities: outcome + "any app" (PopClip "Instant text actions", Raycast "Your shortcut to everything", Hand Mirror "A quick camera check, right from the menu bar"). Shortlist:
1. **Highlight anything. Read it properly.** (lean)
2. A reading lens for your desktop.
3. Terminal output, as a document.

Others: "Every app gets a reader view", "Readable in a blink. Gone with Esc.", "Read what your AI actually wrote."

One-liner (GitHub About): *Select text anywhere on your Mac and read it as a clean document - rejoined lines, real tables, code, diagrams. Native, offline, read-only.*

**The gesture vs the no-copy rule.** The trigger is ⌘C⌘C, and every Mac user reads ⌘C as copy. Name, slogan and descriptions never say copy or clipboard; the gesture is shown as a keystroke, the way Quick Look shows Space ("Select text, press ⌘C ⌘C"). Claim "anywhere you can select text", not "anything on screen".

**Icon - lean: concept C, "Viewfinder"** (four corner brackets around three text lines, teal). It is the app-icon form of the menu-bar symbol already in use (`text.viewfinder`), so Finder, login items and menu bar read as one thing; it held up best of four concepts in all six appearances (default, dark, tinted, clear) and at 16 px. Risk: close to TextSniper and Live Text's glyph - color and the heading line must set it apart. Others: A loupe over lines (reads as search), B floating page (reads as Notes/Preview), D eye with a paragraph iris (Quick Look-like). Contact sheet: `research/launch/contact-sheet.png`; editable `.icon` files in `research/launch/concepts/`.

Toolchain (tested on this Mac): Icon Composer `.icon` → `xcrun actool --compile` in build.sh gives `Assets.car` (macOS 26+, Liquid Glass, all appearances) + `.icns` (13-15); set `CFBundleIconName` and `CFBundleIconFile`. Needs full Xcode (installed). A plain `.icns` alone lands in macOS 26+'s gray plate (confirmed in a test bundle). actool's `.icns` tops out at 256 px; export a 1024 PNG with `ictool` and `iconutil` for sharp large Finder icons on 13-15. Make it ourselves (flat shapes; the system adds depth); a designer polish pass is ~$750-950 if wanted.

### 1c. First run and options

**One small window serves both** - lean. On first launch it is a welcome card; afterwards the same card opens on relaunch from Finder/Spotlight (`applicationShouldHandleReopen`, the Rectangle/PopClip/AltTab pattern) and from "Settings…" (⌘,) in the menu. A narrowing of the "no settings window" non-goal: four controls, nothing that changes how text renders.

First run (3 steps):
1. The card opens as a popover attached to the menu-bar icon (shows where Glimpse lives), holding a short sample of messy terminal text - a box table and a hard-wrapped paragraph - already selected. One instruction: "Press ⌘C ⌘C."
2. The panel opens with the sample rendered. The card shows a check and "Works in any app." plus the controls below. Open at login off by default (unverified whether pre-checked is acceptable; off is safe).
2b. **Optional permission step** (the maintainer, 2026-10-20: the optional grant must go through in the first install): "⌘C on nothing shows the clipboard" offered on the card, off unless chosen. Choosing it requests Input Monitoring and, since macOS may refuse without a dialog, opens System Settings → Input Monitoring at Glimpse's switch; the card shows a live granted/not-yet state (poll `CGPreflightListenEventAccess`) and confirms when it works. Must be verified end to end with the notarized build on a clean account.
3. Done or Esc. It never reappears on its own; opening Glimpse again brings it back, which answers "where did it go?" (macOS 26+ can also hide any menu bar icon from System Settings, so reopen handling is needed regardless).

Options at 1.0:

| Option | How |
|---|---|
| Shortcut (default ⌃⌥M): record, clear, reset | Hand-rolled recorder (~80 lines) on the existing Carbon hotkey. KeyboardShortcuts (MIT) builds with plain swiftc (tested) but is 4.7k lines; fallback if conflict detection proves needed |
| ⌘C ⌘C gesture on/off | Bool default. Not remappable: the watcher never sees keys, and key monitoring needs a permission (rejected) |
| Open at login | Existing SMAppService toggle; show failure instead of a beep |
| Show menu bar icon | With Rectangle's caption: "Open Glimpse again to get here" |

Deferred (no friction-log entry yet): theme, font size, placement (vector B), double-press timing, per-app exclusions. Menu gains: About (version), Settings…, a help link. `captureDir` stays a hidden default.

**Support link - lean: GitHub Sponsors** (0% fees from personal accounts, `FUNDING.yml` adds a Sponsor button; Korea payout unverified). Ko-fi as a fallback (0% on tips). Placement: an optional, witty ask in the first-run card (the maintainer, 2026-10-20: "I dont see an issue with adding it in first run", e.g. a fake paywall that turns out to be a joke and a 99¢ tip), one quiet line in the card footer ("Glimpse 1.0 · GitHub · ♥ Sponsor"), a README section. Never in the panel or as a timed prompt. Check each platform's minimum tip (99¢ may be below it; unverified). Copy candidates: "Worth a second glance? Sponsor the next one." / "It took you a glance. It took a while to make. ♥" / "Reading glasses cost money. This pair doesn't. Tips welcome." / "No account, no subscription, no nag. Just this one line."

First-run gag (the maintainer, 2026-10-20): *"Enter your license key: [ ______ ]"* → *"…kidding, it's free. But feel free to tip 99 cents to help cover my token costs."* (the maintainer, 2026-10-20: "just say 99 cents", whatever the Sponsors minimum)

### 1c'. ⌘C with nothing selected shows the clipboard (the maintainer, 2026-10-20) - optional, opt-in; **parked**

**Parked 2026-10-20 (the maintainer).** Built (`EmptyCopyWatcher`, off by default) but macOS 27 refuses Input Monitoring for the ad-hoc build without showing a dialog (TCC `auth_reason=5` "Service Policy", even after `tccutil reset ListenEvent`); turning it on opens the Input Monitoring pane instead. Revisit with the Developer ID build: does the dialog appear then?

Cause: Glimpse sees only clipboard changes (`changeCount`), never keys. ⌘C with no selection writes nothing in most apps, so there is no event to see. Detecting the keystroke itself needs a key monitor (Input Monitoring or Accessibility permission, rejected) or grabbing ⌘C as a global hotkey (steals copy from every app). Permission-free ways to get the same result:

| Option | Cost |
|---|---|
| Click the menu bar icon = show the clipboard; right-click = menu | One click, no permission; changes the icon's click from menu to action |
| A better default hotkey than ⌃⌥M (settable in the card) | Already exists; a key to learn |
| Opt-in key monitor in settings ("⌘C on nothing shows the clipboard") | Asks for Input Monitoring: breaks "no permissions" for those who enable it |

**Decided (the maintainer, 2026-10-20): optional.** An off-by-default toggle on the settings card. When on: a listen-only event tap (Input Monitoring; reads keys, never synthesizes, so read-only holds) sees ⌘C; if `changeCount` has not moved ~150 ms later, nothing was selected, so Glimpse shows the current clipboard. Public claim becomes "no permissions by default". Built with the card.

### 1d. Distributable build

| Item | Plan |
|---|---|
| Signing | Developer ID Application + hardened runtime + timestamp; no entitlements needed (WKWebView JIT runs in WebKit's process; Carbon hotkey needs none). Ad-hoc stays for local dev builds |
| Notarization | `notarytool submit --wait` + `stapler staple`, in a separate `release.sh` (build.sh kills and reinstalls the maintainer's copy) |
| Package | DMG with drag-to-Applications; Homebrew cask `glimpse` once notarized |
| Updates | GitHub Releases + `brew upgrade` for 1.0 (keeps "no network"); Sparkle later if needed |
| Third-party notices | marked (MIT), mermaid (MIT) and what it bundles (DOMPurify Apache-2.0/MPL-2.0, d3 ISC, lodash, dagre, cytoscape…) into `THIRD_PARTY_NOTICES` |
| Bundle id | **`com.blueball.glimpse`** (decided 2026-10-20). Changing it after release would reset prefs and the login item |

**Re-release with icon and installer layout (done 2026-10-21, this laptop).** `build/Glimpse-0.1.dmg` (2.3 MB): one app submission plus one DMG submission, both `Accepted` (DMG id `dd83f4b8-6a18-4625-a018-093be6007fd3`), app and DMG both stapled and validated, `spctl` accepts both as `Notarized Developer ID`. The `.app` inside the mounted image is independently stapled. Installed copy: `~/Applications/Glimpse.app`, `Resources/AppIcon.icns` present.

**First notarized DMG (done 2026-10-20, this laptop).** `build/Glimpse-0.1.dmg`, 2.2 MB. `codesign -dv` shows Developer ID + secure timestamp + `Notarization Ticket=stapled`; `stapler validate` passes; `spctl -a -t open --context context:primary-signature` and `spctl -a -t exec` on the app both return `accepted / source=Notarized Developer ID`. The app inside the mounted DMG is `com.blueball.glimpse`, universal, hardened runtime, signature verifies strict. Note it is signed with the hardened runtime and no entitlements - the shape a stranger's Mac will check.

**Certificate setup (done 2026-10-20, this laptop).** Team ID `33KR3UXR4D`; identity `Developer ID Application (team 33KR3UXR4D)`. Gotcha: this Mac's System keychain had no Developer ID G2 intermediate, so the imported certificate showed "0 valid identities" until `DeveloperIDG2CA.cer` from [apple.com/certificateauthority](https://www.apple.com/certificateauthority/) was added to the login keychain. Expect the same on any fresh machine. The private key lives only in the login keychain now; export a `.p12` backup before it matters.

**Notary credential (done 2026-10-20).** Profile `glimpse-notary`, App Store Connect Team Key (Key ID `VM4947Z25Q`). The key is embedded in the profile; the `.p8` is deleted. Gotcha: `notarytool` must be given `--keychain ~/Library/Keychains/login.keychain-db` together with `--keychain-profile glimpse-notary`, or it reports `No Keychain password item found for profile` even though the item exists. Verified with `notarytool history` returning "No submission history" (authenticated).

### 1e. Should-fix (before beta)

**Done 2026-10-25**: light/dark headless check (body contrast 13.6 / 10.9; muted blockquote text 3.84 in light is under 4.5 - a design call, not fixed), `color-mix` fallbacks for Safari 16.1, mermaid under the CSP (rendered, 0 violations, negative control differs), `applicationShouldHandleReopen` (opens the menu until the settings card exists), size cap (400,000 bytes, verbatim above it, measured in WebKit). Earlier: `applicationShouldHandleReopen`; size cap with raw fallback for multi-MB input; VoiceOver labels and keyboard reach for the panel buttons; `color-mix` needs Safari 16.2 (macOS 13.0 has 16.1, unverified); **CSP re-proven 2026-10-24** (independently, with a negative control: under the shipped policy 0 external requests and no inline handler ran; with the policy removed the same probe fetched the URL and the `onerror` handler ran - so the probe can detect a fetch). Mermaid under the policy is still unverified. Done 2026-10-21: poll timer tolerance, CLI temp cleanup (the app owns its own `glimpse-*` drop), Services concealed-copy guard, hotkey-conflict warning, force unwrap removed. Later: localization (Korean is cheap: ~8 strings), sandbox/App Store.

### 1f. What a macOS app needs that we did not have (audit 2026-10-21)

Found by walking the notarized DMG and the built bundle, not from memory. This is the list the reusable macOS release checklist is extracted from (kept outside this repo, since it will go public).

| # | Requirement | Verified state 2026-10-21 | Fix |
|---|---|---|---|
| 1 | **App icon** | **Redesigned 2026-10-29** (docs/icon-design.md FINAL). `actool` ignores `.icon` documents on this toolchain (verified 2026-10-21), so `icon/make-icns.sh` renders `icon/AppIcon.icon` with Icon Composer's `ictool`, pads it onto the 824/1024 grid (`icon/pad-icon.swift`; ictool exports full-bleed) and writes `icon/AppIcon.icns`, which is committed; `build.sh` copies it. Menu bar glyph drawn in code (`statusGlyph`, template). `CFBundleIconName` stays removed | Done; `build.sh` hard-fails if the `.icns` is missing |
| 2 | **DMG window layout** | **Rebuilt 2026-10-29** (the maintainer: the image opened as a plain Finder folder). `release.sh` builds the image with `dmgbuild` (`packaging/dmg_settings.py`): icon slots on the default Finder background (no background image: Finder never scales it, and title/path bar height varies by macOS version and user setting, so a fixed card misfit), volume icon, no toolbar/sidebar/status bar, all written without Finder automation. Stable asset name `Glimpse.dmg` so the README links `releases/latest/download/Glimpse.dmg`. The downloaded `.dmg` file itself shows the generic disk-image icon: a custom file icon does not survive a browser download | Done |
| 3 | **DMG volume icon** | **Fixed 2026-10-21.** The read-write pass copies the app's `.icns` to `.VolumeIcon.icns` and sets the custom-icon flag (`GetFileInfo -a` shows uppercase `C`). Verified in the mounted image | Done |
| 4 | **Update path** | **Menu item done 2026-10-25** ("Check for Updates…" opens the releases page; works once the repo is public). Cask and release notes still open. Was: **None.** No update check, no appcast, no changelog | 1.0: Homebrew cask + GitHub Releases, plus a menu item "Check for Updates…" that opens the releases page in the browser (keeps "no network" literally true). Sparkle only if the promise is revised |
| 5 | **Donation surfaces** | One planned (first-run card) | Ladder: first-run card, menu bar item, About window, release notes. **No counter-based nag** - it contradicts the no-nag trust line |
| 6 | **About window** | **None.** `LSUIElement = true` removes the standard App menu, so there is no About, no Settings item | Small window: version, license, repo, Sponsor link |
| 7 | **`LSApplicationCategoryType`** | **Done 2026-10-21**: `public.app-category.productivity`, confirmed in the built plist | Done |
| 8 | **Staple the app, not only the DMG** | **Fixed 2026-10-21.** `release.sh` now zips and notarizes the `.app` first, staples and validates it, then builds the DMG from that stapled copy and notarizes the DMG. `stapler validate` on the app *inside* the mounted image passes | Done |
| 9 | **Build asserts its outputs** | **Done 2026-10-21.** `build.sh` checks every bundled file including `AppIcon.icns` and exits non-zero on any missing one. That is what turned the silent `actool` failure into a visible error | Done |
| 10 | **Localization scaffolding** | None | `en.lproj` now costs nothing; Korean later is ~8 strings |
| 11 | **README, THIRD_PARTY_NOTICES** | Neither tracked; marked, mermaid, DOMPurify, d3, lodash, dagre, cytoscape all ship | Phase 2, but license compliance |
| 12 | **Uninstall path** | Login item left behind if the app is dragged to Trash | Document it; `SMAppService` should self-clean |
| 13 | **Minimum-OS enforcement** | `LSMinimumSystemVersion = 14.0` declared (raised from 13.0 on 2026-10-28, the maintainer: SwiftUI card APIs), but nothing rejects an older install beyond Finder's warning | Acceptable; note it |
| 14 | **Version policy** | `0.1` in build.sh vs "Glimpse 1.0" in planned card copy | Decided 2026-10-25: 1.0 (build.sh set to 1.0) |

### 1g. Shortcut consolidation (the maintainer, 2026-10-21)

Three triggers exist today: ⌘C⌘C, ⌃⌥M, Services. **⌘C⌘C stays - it is the main lane.** The overlap the maintainer wants removed is between the **default hotkey ⌃⌥M** and the **⌘C-on-nothing** feature (parked, opt-in, needs Input Monitoring).

- **Decision: deprecate or merge the default hotkey into ⌘C-on-nothing.** The hotkey is not a separate feature for a stranger to learn; it is either the Settings-configurable accelerator for the same gesture, or it goes away entirely.
- Makes the hotkey **configurable** (the maintainer, 2026-10-21), recorder in the settings card.
- Keeps Services: the only path in apps that do not expose a selection.
- Consequence: ⌘C⌘C is never configurable (it is the gesture), and the background watcher stays. The privacy question therefore stays open - see 1a.
- Open: whether a configurable accelerator survives at all once ⌘C-on-nothing is granted Input Monitoring, since both produce "show me the clipboard".

