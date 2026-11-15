#!/usr/bin/env bash
# Build, install and open the debug app on the local emulator, with Metro
# (JS/TS changes hot-reload; Kotlin/native changes need running this again).
#
#   scripts/android-emulator.sh             # build + install + Metro
#   scripts/android-emulator.sh --prebuild  # regenerate android/ first
#
# android/ is generated (git-ignored). It is regenerated automatically when it
# does not exist; use --prebuild after changing app.json, config plugins or
# native dependencies.
#
# Env: AVD (default noticioso-test), ANDROID_HOME (default: Homebrew SDK).
set -euo pipefail

cd "$(dirname "$0")/.."

export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
AVD="${AVD:-noticioso-test}"

if [[ "${1:-}" == "--prebuild" || ! -f android/app/build.gradle ]]; then
  echo "==> expo prebuild (android)"
  npx expo prebuild --platform android --no-install
fi

# Debug build installs as com.ggsalas.noticiosoandroid.debug next to production
node scripts/prepare-android-debug.js

echo "==> build + install on $AVD (boots it if needed), then Metro"
npx expo run:android --device "$AVD" --app-id com.ggsalas.noticiosoandroid.debug
