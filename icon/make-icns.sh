#!/bin/bash
# Regenerate icon/AppIcon.icns from the Icon Composer document icon/AppIcon.icon.
# Needs Xcode's Icon Composer (ictool); the .icns is committed so build.sh does not.
# (actool ignores .icon documents on this toolchain - verified 2026-10-21.)
set -euo pipefail
cd "$(dirname "$0")"
ICT="/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool"
T=$(mktemp -d); SET=$T/AppIcon.iconset; mkdir -p "$SET"
# ictool renders the tile full-bleed; pad-icon.swift puts it on the 824/1024 app-icon grid.
"$ICT" AppIcon.icon --export-image --output-file "$T/full.png" --platform macOS --rendition Default --width 1024 --height 1024 --scale 1 >/dev/null
[ -s "$T/full.png" ] || { echo "ictool wrote nothing" >&2; exit 1; }
for s in 16 32 128 256 512; do
  swift pad-icon.swift "$T/full.png" "$SET/icon_${s}x${s}.png" $s
  swift pad-icon.swift "$T/full.png" "$SET/icon_${s}x${s}@2x.png" $((s * 2))
done
iconutil -c icns "$SET" -o AppIcon.icns
echo "wrote icon/AppIcon.icns"
