#!/usr/bin/env node
// TEMPORARY diagnostic script for CI electron-install investigation (2026-08-19).
// Mirrors node_modules/electron/install.js's call into @electron/get but with
// full instrumentation, so we can see exactly what happens instead of
// install.js's silent success/failure swallowing.
'use strict';

const { downloadArtifact } = require('@electron/get');
const { Cache } = require('@electron/get/dist/cjs/Cache');
const fs = require('fs');
const path = require('path');

const electronPkg = require('electron/package.json');
const version = electronPkg.version;
const checksums = require('electron/checksums.json');

console.log('=== electron install diagnostics ===');
console.log('node version:', process.version);
console.log('platform/arch:', process.platform, process.arch);
console.log('electron version:', version);
console.log('checksums.json entries:', Object.keys(checksums).length);
console.log('env ELECTRON_SKIP_BINARY_DOWNLOAD:', JSON.stringify(process.env.ELECTRON_SKIP_BINARY_DOWNLOAD));
console.log('env electron_config_cache:', JSON.stringify(process.env.electron_config_cache));
console.log('env electron_mirror:', JSON.stringify(process.env.electron_mirror));
console.log('env npm_config_electron_mirror:', JSON.stringify(process.env.npm_config_electron_mirror));
console.log('env ELECTRON_GET_USE_PROXY:', JSON.stringify(process.env.ELECTRON_GET_USE_PROXY));
console.log('env HTTP_PROXY/HTTPS_PROXY/NO_PROXY:', JSON.stringify(process.env.HTTP_PROXY), JSON.stringify(process.env.HTTPS_PROXY), JSON.stringify(process.env.NO_PROXY));

const cache = new Cache(process.env.electron_config_cache);
console.log('resolved cacheRoot:', cache.cacheRoot);
try {
  console.log('cacheRoot exists:', fs.existsSync(cache.cacheRoot));
  if (fs.existsSync(cache.cacheRoot)) {
    console.log('cacheRoot contents (recursive, top 50):');
    const walk = (dir, depth) => {
      if (depth > 4) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        console.log('  ', p, entry.isDirectory() ? '<dir>' : `${fs.statSync(p).size} bytes`);
        if (entry.isDirectory()) walk(p, depth + 1);
      }
    };
    walk(cache.cacheRoot, 0);
  }
} catch (e) {
  console.log('cacheRoot walk failed:', e.message);
}

const start = Date.now();
console.log('--- calling downloadArtifact() ---');
downloadArtifact({
  version,
  artifactName: 'electron',
  force: process.env.force_no_cache === 'true',
  cacheRoot: process.env.electron_config_cache,
  checksums,
  platform: process.platform,
  arch: process.arch,
}).then(zipPath => {
  const ms = Date.now() - start;
  const exists = fs.existsSync(zipPath);
  console.log('RESOLVED:', zipPath, `(${ms}ms)`, exists ? `${fs.statSync(zipPath).size} bytes` : 'MISSING');
}).catch(err => {
  const ms = Date.now() - start;
  console.log('REJECTED:', `(${ms}ms)`);
  console.log(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
