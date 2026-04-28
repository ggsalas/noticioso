#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const GRADLE_FILE = path.join(__dirname, '..', 'android', 'app', 'build.gradle');

if (!fs.existsSync(GRADLE_FILE)) {
  console.error('Error: android/app/build.gradle not found. Run expo prebuild first.');
  process.exit(1);
}

let content = fs.readFileSync(GRADLE_FILE, 'utf8');

const suffix = 'applicationIdSuffix ".debug"';
const appName = 'resValue "string", "app_name", "NoticiosoDEV"';

function addToBuildType(source, type) {
  const pattern = new RegExp(`(\\b${type}\\s*\\{)(\\n)`);
  if (source.match(pattern) && !source.match(new RegExp(`${type}\\s*\\{[^}]*applicationIdSuffix`))) {
    source = source.replace(pattern, `$1\n            ${suffix}\n            ${appName}$2`);
    console.log(`  - Added suffix to ${type} build type`);
  }
  return source;
}

content = addToBuildType(content, 'debug');
content = addToBuildType(content, 'release');

fs.writeFileSync(GRADLE_FILE, content);

console.log('Android configured for local development:');
console.log('  - Package: com.ggsalas.noticiosoandroid.debug');
console.log('  - App name: NoticiosoDEV');
