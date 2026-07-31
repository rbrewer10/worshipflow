import { defineConfig } from '@playwright/test'

// Electron E2E tests — launches the real built app (out/main/index.js), so
// `npm run build` must run first. Each test gets its own throwaway
// --user-data-dir (see tests/e2e/electronApp.ts), never the developer's real
// WorshipFlow database.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false, // each test launches its own Electron process — keep it simple/sequential
  retries: 0,
  reporter: 'list'
})
