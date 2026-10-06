import { defineConfig } from '@playwright/test'

// Electron E2E tests — launches the real built app (out/main/index.js), so
// `npm run build` must run first. Each test gets its own throwaway profile
// (temp --user-data-dir + temp cwd, see tests/e2e/electronApp.ts), never the
// developer's real WorshipFlow database.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false, // each test launches its own Electron process — keep it simple/sequential
  workers: process.env.CI ? 1 : undefined,
  retries: 0,
  reporter: 'list'
})
