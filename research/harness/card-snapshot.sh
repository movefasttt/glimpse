#!/bin/bash
# Renders the card's states to PNGs (light + dark) headlessly. Usage: card-snapshot.sh <outdir>
set -euo pipefail
cd "$(dirname "$0")/../.."
export DEVELOPER_DIR=/Library/Developer/CommandLineTools  # same toolchain as build.sh: the macOS 26+ SDK
out=${1:?outdir}
mkdir -p "$out"
tmp=$(mktemp -d)
cp research/harness/card-snapshot.swift "$tmp/main.swift"  # top-level code is only legal in main.swift
swiftc -swift-version 5 -target arm64-apple-macos14.0 CardView.swift "$tmp/main.swift" -o "$tmp/card-snapshot"
"$tmp/card-snapshot" "$out"
