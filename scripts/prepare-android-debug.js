#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const GRADLE_FILE = path.join(__dirname, '..', 'android', 'app', 'build.gradle');

if (!fs.existsSync(GRADLE_FILE)) {
  console.error('Error: android/app/build.gradle not found. Run expo prebuild first.');
  process.exit(1);
}

let content = fs.readFileSync(GRADLE_FILE, 'utf8');

// Check if already configured
if (content.includes('applicationIdSuffix ".debug"')) {
  console.log('Android already configured for debug build');
  process.exit(0);
}

// Find the debug block and add the config inside it
// Pattern: find "debug {" and add lines after the opening brace
content = content.replace(
  /(\n    buildTypes \{\n        debug \{)(\n)/,
  '$1\n            applicationIdSuffix ".debug"\n            resValue "string", "app_name", "NoticiosoDEV"$2'
);

fs.writeFileSync(GRADLE_FILE, content);

console.log('Android configured for debug build');
console.log('  - Package: com.ggsalas.noticiosoandroid.debug');
console.log('  - App name: NoticiosoDEV');
