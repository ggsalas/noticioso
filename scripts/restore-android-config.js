#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const GRADLE_FILE = path.join(__dirname, '..', 'android', 'app', 'build.gradle');
const BACKUP_FILE = GRADLE_FILE + '.bak';

if (!fs.existsSync(BACKUP_FILE)) {
  console.log('No backup found. Nothing to restore.');
  process.exit(0);
}

fs.copyFileSync(BACKUP_FILE, GRADLE_FILE);
fs.unlinkSync(BACKUP_FILE);

console.log('Restored original android/app/build.gradle');
