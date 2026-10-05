#!/usr/bin/env node
/**
 * pull-android-db.js
 *
 * Copies the app's SQLite database off a connected Android device/emulator into
 * the repository so it can be inspected with `sqlite3` or DB Browser for SQLite.
 *
 * Remote path note: expo-sqlite on Android opens databases in the app's
 * `filesDir/SQLite` directory, NOT the conventional `databases/` location. The
 * path passed to `run-as` is therefore `files/SQLite/noticioso.db` (relative to
 * the app data directory).
 *
 * CONSISTENCY WARNING: close the app, or leave it completely idle, while
 * exporting. SQLite may be mid-transaction and the -wal/-journal side files are
 * not copied, so a snapshot taken during writes can be inconsistent.
 *
 * Usage:
 *   npm run pull:android-db
 *   (equivalently: node scripts/pull-android-db.js; output goes to .local-db/noticioso.db)
 *
 * Environment:
 *   ANDROID_APP_ID  Package id to read from
 *                   (default: com.ggsalas.noticiosoandroid.debug)
 *   ANDROID_SERIAL  Device serial; forwarded to adb as `-s <serial>`
 *   ANDROID_HOME    If set and $ANDROID_HOME/platform-tools/adb exists it is used,
 *                   otherwise plain `adb` from PATH is used.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DB_NAME = 'noticioso.db';
// expo-sqlite Android default: <app filesDir>/SQLite/<DB_NAME>
const REMOTE_DB_PATH = `files/SQLite/${DB_NAME}`;
const DEFAULT_APP_ID = 'com.ggsalas.noticiosoandroid.debug';

const OUTPUT_DIR = path.join(__dirname, '..', '.local-db');
const OUTPUT_FILE = path.join(OUTPUT_DIR, DB_NAME);

/**
 * Locate the adb executable: prefer the platform-tools binary under ANDROID_HOME,
 * fall back to whatever is on PATH.
 *
 * @returns {string}
 */
function resolveAdb() {
  const androidHome = process.env.ANDROID_HOME;
  if (androidHome) {
    const candidate = path.join(androidHome, 'platform-tools', 'adb');
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'adb';
}

function main() {
  const appId = process.env.ANDROID_APP_ID || DEFAULT_APP_ID;
  const serial = process.env.ANDROID_SERIAL;
  const adb = resolveAdb();

  const adbArgs = [];
  if (serial) adbArgs.push('-s', serial);
  adbArgs.push('exec-out', 'run-as', appId, 'cat', REMOTE_DB_PATH);

  console.log('Exporting the Android database snapshot. Keep the app closed/idle.');
  console.log(`  adb:       ${adb}${serial ? ` (serial: ${serial})` : ''}`);
  console.log(`  package:   ${appId}`);
  console.log(`  read from: ${REMOTE_DB_PATH}`);

  /** @type {Buffer} */
  let data;
  try {
    // No shell is involved, so quoting cannot be abused; the raw bytes come back
    // on stdout as a Buffer (encoding is intentionally left unset).
    data = execFileSync(adb, adbArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 512 * 1024 * 1024,
    });
  } catch (error) {
    console.error(`Error: could not read ${REMOTE_DB_PATH} from ${appId}.`);
    const stderr = error.stderr ? error.stderr.toString().trim() : '';
    if (stderr) console.error(stderr);
    console.error('');
    console.error('Common causes:');
    console.error('  - No device/emulator connected or unauthorized -> check `adb devices`.');
    console.error(`  - ${appId} is not installed, or is a release build (run-as only works on debuggable apps).`);
    console.error(`  - The database has not been created yet -> open the app once so expo-sqlite creates ${REMOTE_DB_PATH}.`);
    console.error('  - adb not found -> install platform-tools or set ANDROID_HOME.');
    console.error('');
    console.error(`No file was written. ${OUTPUT_FILE} was left untouched.`);
    process.exit(1);
    return;
  }

  // Only create the output directory once the device read succeeded, so a failed
  // run never leaves a stale/empty database behind.
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, data);

  const absoluteOutput = path.resolve(OUTPUT_FILE);
  console.log(`  wrote:     ${absoluteOutput} (${data.length} bytes)`);
  console.log('');
  console.log(`Open it with, for example: sqlite3 '${absoluteOutput}' 'SELECT name FROM sqlite_master;'`);
  console.log('If the app was active during the export, the snapshot may be inconsistent.');
}

main();
