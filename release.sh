#!/bin/bash
# Build a Developer ID-signed, notarized Glimpse DMG.
# Signing only works where the Developer ID private key lives (the maintainer's login keychain).
# The identity string is not in the repo: export IDENTITY, or write it into the gitignored .signing-identity.
# SKIP_NOTARIZE=1 ./release.sh   signed DMG, no Apple round trip
set -euo pipefail
cd "$(dirname "$0")"
# Same toolchain as build.sh: the Command Line Tools ship notarytool and stapler; xcrun under Xcode 16 exits 69
# until its license is accepted.
export DEVELOPER_DIR=/Library/Developer/CommandLineTools

IDENTITY="${IDENTITY:-$( [ -f .signing-identity ] && cat .signing-identity )}"
[ -n "$IDENTITY" ] || { echo "Set IDENTITY or .signing-identity to your Developer ID string" >&2; exit 1; }
PROFILE="${PROFILE:-glimpse-notary}"
KEYCHAIN="${KEYCHAIN:-$HOME/Library/Keychains/login.keychain-db}"
VERSION=$(sed -n 's/^VERSION=\([0-9.]*\).*/\1/p' build.sh)
BUILD=$(sed -n 's/^BUILD=\([0-9]*\).*/\1/p' build.sh)
APP=build/Glimpse.app
DMG="build/Glimpse.dmg"   # stable name: README links releases/latest/download/Glimpse.dmg

[ -n "$VERSION" ] && [ -n "$BUILD" ] || { echo "Could not read VERSION/BUILD from build.sh" >&2; exit 1; }

GJ_BUILD_ONLY=1 ./build.sh

# Hardened runtime + secure timestamp: both are notarization requirements. No entitlements needed.
codesign --force --sign "$IDENTITY" --options runtime --timestamp "$APP"
codesign --verify --strict --verbose=2 "$APP"

# Notarize the app first, so the copy that goes into the image carries its own ticket.
# Stapling after packaging would leave the .app inside the DMG unstamped.
if [ "${SKIP_NOTARIZE:-0}" = "1" ]; then
  NOTARIZED=0
else
  # Zip keeps the bundle intact for the submission (notarytool does not take a bare .app).
  rm -f build/Glimpse.zip
  ditto -c -k --keepParent "$APP" build/Glimpse.zip
  # notarytool only finds the profile when the keychain is named explicitly.
  xcrun notarytool submit build/Glimpse.zip --keychain-profile "$PROFILE" --keychain "$KEYCHAIN" --wait
  xcrun stapler staple "$APP"
  xcrun stapler validate "$APP"
  NOTARIZED=1
fi

# Drag-to-Applications disk image via dmgbuild (writes the Finder layout itself: icon slots,
# volume icon, no toolbar/sidebar; no Finder automation). Settings: packaging/dmg_settings.py.
VENV=build/dmgvenv
[ -x "$VENV/bin/dmgbuild" ] || { python3 -m venv "$VENV" && "$VENV/bin/pip" install -q dmgbuild; }
rm -f "$DMG"
"$VENV/bin/dmgbuild" -s packaging/dmg_settings.py -D app="$APP" "Glimpse" "$DMG" >/dev/null
codesign --force --sign "$IDENTITY" --timestamp "$DMG"

if [ "$NOTARIZED" = "0" ]; then
  echo "Signed, not notarized: $DMG"
  exit 0
fi

xcrun notarytool submit "$DMG" --keychain-profile "$PROFILE" --keychain "$KEYCHAIN" --wait
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"
spctl -a -t open --context context:primary-signature -v "$DMG"
spctl -a -t exec -v "$APP"

echo "Release ready: $DMG"
