import { defineConfig } from 'vitest/config'

// Minimal config: pure TS logic tests only (no DOM/Electron environment needed).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
