# Release notes

## 1.1
- The panel appears only once it is final: no size jump, and it always opens next to the cursor.
- Every ⌘C⌘C push says so: a green check on the copy button, and a short hint on the first pushes.
- The first-run card shows the result, not a promise.

- 2026-11-19: v1.1 build 7. The panel now measures itself before it appears (no size jump, and it opens next to the cursor every time); every ⌘C⌘C push says what happened (green check on the copy button, hint on the first pushes); the first-run headline is the result. Signed, notarized and stapled; asset `Glimpse.dmg` (4191229 bytes, sha256 `b25ccd69…a76c7e5`).

## 1.0 (first release)
- Select text anywhere, press ⌘C twice: a formatted panel opens at the cursor.
- Copy formatted Markdown or an image of the panel; toggle back to the original.
- Optional: ⌘C with nothing selected renders what you last copied.
- New app icon and menu bar icon.
- Install window with drag-to-Applications guide.

- 2026-10-29: v1.0 build 3 (new icon, DMG window card, Mermaid in the demo sample). Fresh-account privacy test passed (the maintainer); promoted to a full release, asset `Glimpse.dmg`.
- 2026-10-29: v1.0 build 4. DMG window drops the background card (Finder never scales it, so a fixed 640x400 image misfit the window); README shows the app icon. Signed, notarized and stapled; asset `Glimpse.dmg` replaced (4476345 bytes, sha256 `7fa7cf08…2e5fb77`).
- 2026-10-29: v1.0 build 5. Repo and release links in the app and README point at `movefasttt`; the account move also made `movefasttt/glimpse` the dev repo (history starts at the squashed launch commit). Notarized, asset `Glimpse.dmg` replaced (sha256 `f6e83851`).
- 2026-10-29: v1.0 build 6. Pre-launch scrub: no personal or company identifiers in the repo (licence, docs, code comments, research scripts, binaries) and the Developer ID identity moved out of `release.sh`. Notarized, asset `Glimpse.dmg` replaced (sha256 `2dceeff7`).
