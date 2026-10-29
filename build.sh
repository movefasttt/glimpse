#!/bin/bash
# Build Glimpse.app and install to ~/Applications. Re-run after edits.
set -euo pipefail
cd "$(dirname "$0")"
# Xcode 16 here only has the macOS 15 SDK, so the system look never applies. The Command Line Tools carry the 26/27 SDKs
# (verified 2026-10-28): link against them and standard controls adopt the current look on macOS 26+, unchanged below.
export DEVELOPER_DIR=/Library/Developer/CommandLineTools

APP=build/Glimpse.app
VERSION=1.0   # user-facing; one source of truth for the plist
BUILD=5       # bump for every release Apple notarizes
rm -rf build
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# Universal binary for the deployment target: a bare swiftc inherits the host SDK's minos (27 here).
swiftc -O -swift-version 5 -target arm64-apple-macos14.0 main.swift WelcomeCard.swift CardView.swift -o build/Glimpse-arm64
swiftc -O -swift-version 5 -target x86_64-apple-macos14.0 main.swift WelcomeCard.swift CardView.swift -o build/Glimpse-x86_64
lipo -create build/Glimpse-arm64 build/Glimpse-x86_64 -output "$APP/Contents/MacOS/Glimpse"
# format.js is the engine bundle (docs/engine-v2.md "Code layout"): sections of one IIFE, concatenated in order
cat engine/*.js > format.js
cp template.html format.js vendor/* THIRD_PARTY_NOTICES.md "$APP/Contents/Resources/"
# App icon: actool ignores .icon documents on this toolchain (exits 0, writes nothing), so the .icns is
# rendered from icon/AppIcon.icon by icon/make-icns.sh (needs Icon Composer) and committed.
cp icon/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>com.blueball.glimpse</string>
  <key>CFBundleName</key><string>Glimpse</string>
  <key>CFBundleExecutable</key><string>Glimpse</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <!-- CFBundleIconFile only: no Assets.car is built, and CFBundleIconName would win on 26+ and point at nothing. -->
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundleShortVersionString</key><string>__VERSION__</string>
  <key>CFBundleVersion</key><string>__BUILD__</string>
  <key>NSHumanReadableCopyright</key><string>MIT licensed, 2026</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSServices</key>
  <array><dict>
    <key>NSMenuItem</key><dict><key>default</key><string>Render with Glimpse</string></dict>
    <key>NSMessage</key><string>renderService</string>
    <key>NSPortName</key><string>Glimpse</string>
    <key>NSSendTypes</key><array><string>public.utf8-plain-text</string></array>
    <key>NSRequiredContext</key><dict/>
  </dict></array>
  <key>CFBundleDocumentTypes</key>
  <array><dict>
    <key>CFBundleTypeRole</key><string>Viewer</string>
    <key>LSHandlerRank</key><string>Alternate</string>
    <key>LSItemContentTypes</key><array><string>net.daringfireball.markdown</string><string>public.plain-text</string></array>
  </dict></array>
  <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
</dict>
</plist>
PLIST
sed -i '' -e "s/__VERSION__/$VERSION/" -e "s/__BUILD__/$BUILD/" "$APP/Contents/Info.plist"

# set -e cannot catch a tool that exits 0 having written nothing: actool did exactly that,
# so the plist named an icon that was never in the bundle. Assert the outputs instead.
for f in "$APP/Contents/MacOS/Glimpse" "$APP/Contents/Info.plist" \
         "$APP/Contents/Resources/template.html" "$APP/Contents/Resources/format.js" \
         "$APP/Contents/Resources/marked.min.js" "$APP/Contents/Resources/mermaid.min.js" \
         "$APP/Contents/Resources/AppIcon.icns" "$APP/Contents/Resources/THIRD_PARTY_NOTICES.md"; do
  [ -e "$f" ] || { echo "MISSING from bundle: $f" >&2; exit 1; }
done

# Glimpse used to be ad-hoc because it needed no TCC permission and the Developer ID key prompts for the keychain
# password (choose "Always Allow" once). The opt-in ⌘C-on-nothing needs Input Monitoring, so identity now matters:
# A stable identity keeps Input Monitoring grants across rebuilds (an ad-hoc signature is a new identity every build,
# and the app may not list in System Settings > Privacy at all); ad-hoc only where no Developer ID exists.
IDENT=$(security find-identity -v -p codesigning | grep -o '"Developer ID Application[^"]*"' | head -1 | tr -d '"' || true)
codesign --force --sign "${IDENT:--}" "$APP"

if [ "${GJ_BUILD_ONLY:-0}" = "1" ]; then echo "Built $APP"; exit 0; fi

pkill -x Glimpse || true
mkdir -p ~/Applications
rm -rf ~/Applications/Glimpse.app
cp -R "$APP" ~/Applications/
/System/Library/CoreServices/pbs -update
open ~/Applications/Glimpse.app
echo "Installed ~/Applications/Glimpse.app"
