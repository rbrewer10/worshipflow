import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { shouldClearHiddenText } from './layerReset'

describe('shouldClearHiddenText (QA B2 / A-N4)', () => {
  it('C pressed before Go Live is cleared by the new item (B2)', () => {
    // C at generation 4; Go Live starts load 5.
    expect(shouldClearHiddenText(4, 5)).toBe(true)
  })
  it('C pressed while a slow scripture lookup is in flight stays hidden when the verse lands (A-N4)', () => {
    // Load 5 started (generation already 5), then C → recorded at 5.
    expect(shouldClearHiddenText(5, 5)).toBe(false)
  })
  it('a C from long ago never blocks clearing', () => expect(shouldClearHiddenText(-1, 1)).toBe(true))
})

describe('wiring (source guard)', () => {
  const main = readFileSync(join(__dirname, '..', 'main', 'index.ts'), 'utf8')
  it('setLayers records when C was pressed', () => {
    expect(main).toMatch(/textHiddenAtGeneration = tracks\[track\]\.loadGeneration/)
  })
  it('the async loaders pass the generation their load started at', () => {
    const scripture = main.slice(main.indexOf('async function doLoadScripture'), main.indexOf('async function doLoadScripture') + 4000)
    expect(scripture).toMatch(/resetPerItemLayers\(track, generation\)/)
  })
})
