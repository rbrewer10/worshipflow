import { describe, expect, it } from 'vitest'
import { isLookMode, liveLookFor, lookRouting, LOOK_MODES } from './liveLook'
import type { LiveLook } from './liveLook'
import { expandScene, starterConfig } from './zoneScenes'
import { DEFAULT_MODE_MAPPING, resolveModeScene } from './serviceControlModes'

// Ryan's decision #7: Looks are one-time only.
describe('one-time Looks (Ryan\'s decision #7)', () => {
  const config = starterConfig()
  const look: LiveLook = { itemId: 7, generation: 3, mode: 'invitation', routing: { 1: 'lyrics', 2: 'lyrics', 3: 'lyrics', 4: 'lyrics' } as never }

  it('holds while the same item stays live in the same load (Next / Prev do not reload)', () => {
    expect(liveLookFor(look, { serviceItemId: 7, loadGeneration: 3 })).toBe(look)
  })
  it('lapses when a different item goes live', () => {
    expect(liveLookFor(look, { serviceItemId: 8, loadGeneration: 4 })).toBeNull()
  })
  it('lapses when the same item is sent live again (a fresh load)', () => {
    expect(liveLookFor(look, { serviceItemId: 7, loadGeneration: 4 })).toBeNull()
  })
  it('lapses when nothing is live', () => {
    expect(liveLookFor(look, { serviceItemId: null, loadGeneration: 3 })).toBeNull()
    expect(liveLookFor(null, { serviceItemId: 7, loadGeneration: 3 })).toBeNull()
  })
  it('a Look shows exactly the scene it is mapped to in Setup, for the live item\'s type', () => {
    for (const mode of LOOK_MODES) {
      const scene = resolveModeScene(mode, DEFAULT_MODE_MAPPING, config)!
      expect(scene, mode).toBeTruthy()
      for (const type of ['song', 'scripture', 'sermon'] as const) {
        expect(lookRouting(mode, DEFAULT_MODE_MAPPING, config, type)).toEqual(expandScene(scene, type))
      }
    }
    expect(lookRouting('worship', DEFAULT_MODE_MAPPING, null, 'song')).toBeNull()
  })
  it('only the three Looks are accepted over IPC', () => {
    expect(LOOK_MODES).toEqual(['worship', 'sermon', 'invitation'])
    expect(isLookMode('sermon')).toBe(true)
    expect(isLookMode('logo')).toBe(false)
    expect(isLookMode(undefined)).toBe(false)
  })
})
