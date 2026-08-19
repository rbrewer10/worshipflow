#!/usr/bin/env node
// TEMPORARY diagnostic: run AFTER `npm rebuild electron` to see the actual
// on-disk state it left behind, since npm reports "rebuilt dependencies
// successfully" even when the real result is broken.
'use strict';
const fs = require('fs');
const path = require('path');

const electronDir = path.join(__dirname, '..', 'node_modules', 'electron');
console.log('=== post-rebuild electron state ===');

const distDir = path.join(electronDir, 'dist');
console.log('dist dir exists:', fs.existsSync(distDir));
if (fs.existsSync(distDir)) {
  console.log('dist contents:', fs.readdirSync(distDir));
}

const pathTxt = path.join(electronDir, 'path.txt');
console.log('path.txt exists:', fs.existsSync(pathTxt));
if (fs.existsSync(pathTxt)) {
  console.log('path.txt contents:', JSON.stringify(fs.readFileSync(pathTxt, 'utf-8')));
}

const versionFile = path.join(distDir, 'version');
console.log('dist/version exists:', fs.existsSync(versionFile));
if (fs.existsSync(versionFile)) {
  console.log('dist/version contents:', JSON.stringify(fs.readFileSync(versionFile, 'utf-8')));
}

console.log('--- re-running install.js directly, capturing everything ---');
const { spawnSync } = require('child_process');
const result = spawnSync(process.execPath, [path.join(electronDir, 'install.js')], {
  cwd: path.join(__dirname, '..'),
  env: Object.assign({}, process.env, { DEBUG: '@electron/get*' }),
  encoding: 'utf-8',
});
console.log('exit code:', result.status);
console.log('signal:', result.signal);
console.log('stdout:', result.stdout);
console.log('stderr:', result.stderr);
if (result.error) console.log('spawn error:', result.error.stack);

console.log('--- state after direct re-run ---');
console.log('dist contents:', fs.existsSync(distDir) ? fs.readdirSync(distDir) : '<no dist dir>');
console.log('path.txt exists:', fs.existsSync(pathTxt));

console.log('--- trying require(electron) ---');
try {
  const p = require(electronDir);
  console.log('require(electron) resolved to:', p);
  console.log('that path exists on disk:', fs.existsSync(p));
} catch (e) {
  console.log('require(electron) threw:', e.message);
}
