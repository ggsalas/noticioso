#!/usr/bin/env node
/**
 * prepare-android-debug.js
 *
 * Injects applicationIdSuffix ".debug" and resValue "app_name" into the
 * buildTypes { debug {} } and buildTypes { release {} } blocks so local
 * debug builds install alongside production with a distinct package name
 * and app label.
 *
 * SAFETY:
 *  - Only edits inside the buildTypes { ... } block (brace-matched).
 *  - Removes any applicationIdSuffix/resValue lines that were mistakenly
 *    placed inside signingConfigs { debug {} } by a previous version of
 *    this script.
 *  - Idempotent: running twice produces the same output.
 */

const fs = require('fs');
const path = require('path');

const GRADLE_FILE = path.join(__dirname, '..', 'android', 'app', 'build.gradle');

if (!fs.existsSync(GRADLE_FILE)) {
  console.error('Error: android/app/build.gradle not found. Run expo prebuild first.');
  process.exit(1);
}

let content = fs.readFileSync(GRADLE_FILE, 'utf8');

const SUFFIX_LINE = 'applicationIdSuffix ".debug"';
const APPNAME_LINE = 'resValue "string", "app_name", "NoticiosoDEV"';

/**
 * Given a source string, find a top-level named block starting at or after
 * `startFrom` and return the {start, end} character indices of the content
 * between the opening { and closing } (both excluded).
 *
 * Uses brace-depth counting which is safe for Gradle DSL files that don't
 * contain { or } inside string literals at the block level.
 *
 * @param {string} source
 * @param {string} blockName
 * @param {number} [startFrom=0]
 * @returns {{ start: number, end: number } | null}
 */
function findBlockRange(source, blockName, startFrom = 0) {
  const pattern = new RegExp(`\\b${blockName}\\s*\\{`);
  const rest = source.slice(startFrom);
  const m = rest.match(pattern);
  if (!m) return null;

  const bracePos = startFrom + m.index + m[0].length - 1; // index of '{'
  let depth = 1;
  let i = bracePos + 1;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    i++;
  }
  // Content is between { and } (exclusive of both braces)
  return { start: bracePos + 1, end: i - 1 };
}

// ---------------------------------------------------------------------------
// Step 1 — Clean up: remove any incorrectly placed suffix/resValue lines
//          from signingConfigs { debug { ... } } (left by a buggy version).
// ---------------------------------------------------------------------------
const signingConfigsRange = findBlockRange(content, 'signingConfigs');
if (signingConfigsRange) {
  const signingDebugRange = findBlockRange(content, 'debug', signingConfigsRange.start);
  if (signingDebugRange) {
    const original = content.slice(signingDebugRange.start, signingDebugRange.end);
    const lines = original.split('\n');
    const filtered = lines.filter((line) => {
      const t = line.trim();
      return t !== SUFFIX_LINE && t !== APPNAME_LINE;
    });
    if (filtered.length !== lines.length) {
      content =
        content.slice(0, signingDebugRange.start) +
        filtered.join('\n') +
        content.slice(signingDebugRange.end);
      console.log('  - Removed incorrectly placed suffix/resValue from signingConfigs.debug');
    }
  }
}

// ---------------------------------------------------------------------------
// Step 2 — Ensure buildTypes { debug {} } and buildTypes { release {} }
//          each contain applicationIdSuffix and resValue.
// ---------------------------------------------------------------------------

/**
 * Add the suffix/resValue lines to a named build type inside buildTypes,
 * if not already present. Returns the updated source.
 *
 * @param {string} source
 * @param {'debug' | 'release'} typeName
 * @returns {string}
 */
function ensureBuildTypeConfig(source, typeName) {
  const buildTypesRange = findBlockRange(source, 'buildTypes');
  if (!buildTypesRange) {
    console.error(`  - Warning: buildTypes block not found — skipping`);
    return source;
  }

  const typeRange = findBlockRange(source, typeName, buildTypesRange.start);
  if (!typeRange) {
    console.error(`  - Warning: ${typeName} block not found inside buildTypes — skipping`);
    return source;
  }

  const typeContent = source.slice(typeRange.start, typeRange.end);

  const hasSuffix = typeContent.includes('applicationIdSuffix');
  const hasAppName = /resValue\s+"string",\s+"app_name"/.test(typeContent);

  const linesToAdd = [];
  if (!hasSuffix) linesToAdd.push(SUFFIX_LINE);
  if (!hasAppName) linesToAdd.push(APPNAME_LINE);

  if (linesToAdd.length === 0) {
    console.log(`  - ${typeName}: already configured, skipping`);
    return source;
  }

  // Insert after the first newline inside the block (right after `typeName {`)
  const firstNewline = typeContent.indexOf('\n');
  if (firstNewline === -1) {
    console.error(`  - Warning: could not find insertion point in ${typeName}`);
    return source;
  }

  // Insert the new lines (with a trailing newline so the next existing line stays on its own line)
  const insertText = linesToAdd.map((l) => `            ${l}`).join('\n') + '\n';
  const insertPos = typeRange.start + firstNewline + 1;
  source = source.slice(0, insertPos) + insertText + source.slice(insertPos);
  console.log(`  - Added to buildTypes.${typeName}: ${linesToAdd.join(', ')}`);

  return source;;
}

content = ensureBuildTypeConfig(content, 'debug');
content = ensureBuildTypeConfig(content, 'release');

fs.writeFileSync(GRADLE_FILE, content);

console.log('Android configured for local development:');
console.log('  - Package: com.ggsalas.noticiosoandroid.debug');
console.log('  - App name: NoticiosoDEV');
