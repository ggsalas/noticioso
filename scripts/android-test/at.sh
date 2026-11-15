#!/usr/bin/env bash
# at.sh — tiny adb harness to drive and inspect the debug app on an emulator.
#
# Requires an emulator whose image allows `adb root` (google_apis, not playstore).
# Usage: scripts/android-test/at.sh <command> [args]
#
#   boot                 Start the AVD headless (AVD name: $AVD, default noticioso-test) and wait
#   launch               Start (or bring to foreground) the app
#   kill                 Force-stop the app (simulates process death / full close)
#   bg                   Press HOME (app goes to background)
#   shot [file]          Screenshot to file (default $OUT_DIR/shot.png)
#   ui                   Dump visible texts from the UI hierarchy
#   tap X Y              Tap at coordinates
#   back                 Press BACK
#   db "<sql>"           Run SQL against the app's SQLite DB (noticioso.db)
#   state                Print refresh pointers, generations, jobs and HTML file count
#   stale [hours]        Move last_fetch_completion N hours into the past (default 2)
#   seed-feeds <json>    Write a feed list JSON array into AsyncStorage (app is killed first)
#   logs                 Tail native + JS logs
#
# Env: ANDROID_SERIAL, APP_ID (default com.ggsalas.noticiosoandroid.debug), OUT_DIR (default /tmp)
set -euo pipefail

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/opt/homebrew/share/android-commandlinetools}}"
ADB="$SDK/platform-tools/adb"; [ -x "$ADB" ] || ADB=adb
APP_ID="${APP_ID:-com.ggsalas.noticiosoandroid.debug}"
ACTIVITY="com.ggsalas.noticiosoandroid.MainActivity"
AVD="${AVD:-noticioso-test}"
OUT_DIR="${OUT_DIR:-/tmp}"
DATA="/data/data/$APP_ID"
DB="$DATA/files/SQLite/noticioso.db"
RKDB="$DATA/databases/RKStorage"

adb_() { "$ADB" "$@"; }
root_() { adb_ root >/dev/null 2>&1 || true; adb_ wait-for-device; }
# Run SQL by pushing it as a file (avoids nested shell quoting of JSON/quotes)
sql_() {
  root_
  local tmp; tmp="$(mktemp)"; printf '%s\n' "$2" >"$tmp"
  adb_ push "$tmp" /data/local/tmp/q.sql >/dev/null 2>&1; rm -f "$tmp"
  adb_ shell "sqlite3 -header -column $1 < /data/local/tmp/q.sql"
}

cmd="${1:-help}"; shift || true
case "$cmd" in
  boot)
    "$SDK/emulator/emulator" -avd "$AVD" -no-window -no-audio -no-boot-anim -no-snapshot-save >"$OUT_DIR/emulator.log" 2>&1 &
    adb_ wait-for-device
    until [ "$(adb_ shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 2; done
    adb_ shell settings put global window_animation_scale 0
    adb_ shell settings put global transition_animation_scale 0
    adb_ shell settings put global animator_duration_scale 0
    echo "booted" ;;
  launch) adb_ shell am start -n "$APP_ID/$ACTIVITY" >/dev/null && echo launched ;;
  kill)   adb_ shell am force-stop "$APP_ID" && echo killed ;;
  bg)     adb_ shell input keyevent KEYCODE_HOME && echo background ;;
  back)   adb_ shell input keyevent KEYCODE_BACK ;;
  tap)    adb_ shell input tap "$1" "$2" ;;
  shot)   f="${1:-$OUT_DIR/shot.png}"; adb_ exec-out screencap -p >"$f"; echo "$f" ;;
  ui)
    adb_ shell uiautomator dump /sdcard/ui.xml >/dev/null
    adb_ exec-out cat /sdcard/ui.xml | tr '>' '\n' | grep -oE 'text="[^"]+"|content-desc="[^"]+"|bounds="[^"]+"' \
      | paste - - 2>/dev/null | grep -vE '^bounds' || true ;;
  db) sql_ "$DB" "$1" ;;
  state)
    sql_ "$DB" "SELECT 'active' k, refresh_id, applied_at t FROM active_refresh UNION ALL SELECT 'pending', refresh_id, ready_at FROM pending_refresh UNION ALL SELECT 'last_fetch', '', completed_at FROM last_fetch_completion;"
    echo
    sql_ "$DB" "SELECT substr(id,1,8) id, state, created_at, completed_at FROM refreshes ORDER BY created_at;"
    echo
    sql_ "$DB" "SELECT substr(refresh_id,1,8) refresh, status, count(*) n FROM article_download_jobs GROUP BY 1,2 ORDER BY 1;"
    echo
    sql_ "$DB" "SELECT count(*) article_metadata_rows FROM article_metadata;"
    echo "html files: $(adb_ shell "ls $DATA/cache/article-html 2>/dev/null | wc -l" | tr -d '\r ')" ;;
  stale)
    h="${1:-2}"
    sql_ "$DB" "UPDATE last_fetch_completion SET completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now','-$h hours');"
    sql_ "$DB" "SELECT completed_at FROM last_fetch_completion;" ;;
  seed-feeds)
    json="$(tr -d '\n' <"$1" | sed "s/'/''/g")"
    adb_ shell am force-stop "$APP_ID"
    sql_ "$RKDB" "CREATE TABLE IF NOT EXISTS catalystLocalStorage (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT OR REPLACE INTO catalystLocalStorage VALUES ('@noticioso-feedList', '$json');"
    echo seeded ;;
  logs) adb_ logcat -v time -s FeedRefreshModule:* ReactNativeJS:* ;;
  *) sed -n '2,22p' "$0" ;;
esac
