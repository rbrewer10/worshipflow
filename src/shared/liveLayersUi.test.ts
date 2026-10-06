import { describe, expect, it } from 'vitest'
import { activeLookMode, hiddenLayerNotice, layerTogglePatch } from './liveLayersUi'
import { expandScene, starterConfig } from './zoneScenes'
import { DEFAULT_MODE_MAPPING } from './serviceControlModes'

describe('C / G keys toggle like the buttons (QA B20)', () => {
  it('C hides, a second C shows again', () => {
    expect(layerTogglePatch({ textHidden: false }, 'text')).toEqual({ textHidden: true })
    expect(layerTogglePatch({ textHidden: true }, 'text')).toEqual({ textHidden: false })
  })
  it('G toggles only the background', () => {
    expect(layerTogglePatch({ bgHidden: true, textHidden: true }, 'bg')).toEqual({ bgHidden: false })
    expect(layerTogglePatch(null, 'bg')).toEqual({ bgHidden: true })
  })
})

describe('hidden-layer notice for the CURRENT preview / Volunteer mode (QA B20)', () => {
  it('shows when lyrics are hidden on a lyric slide', () => {
    expect(hiddenLayerNotice({ mode: 'lyrics', textHidden: true })).toBe('Lyrics hidden on the screens')
  })
  it('background hidden shows in any mode except black', () => {
    expect(hiddenLayerNotice({ mode: 'countdown', bgHidden: true })).toBe('Background hidden on the screens')
    expect(hiddenLayerNotice({ mode: 'black', bgHidden: true, textHidden: true })).toBeNull()
  })
  it('both', () => expect(hiddenLayerNotice({ mode: 'lyrics', textHidden: true, bgHidden: true })).toMatch(/Lyrics and background/))
  it('nothing hidden → no notice', () => expect(hiddenLayerNotice({ mode: 'lyrics' })).toBeNull())
})

describe('Looks highlight follows the live item (QA B19)', () => {
  const config = starterConfig()
  const scene = (id: string) => config.scenes.find((s) => s.id === id)!
  it('derives the chip from the item routing', () => {
    const everywhere = { type: 'song' as const, zoneRouting: expandScene(scene('everywhere'), 'song') }
    expect(activeLookMode(everywhere, config, DEFAULT_MODE_MAPPING)).toBe('invitation')
    const tvs = { type: 'song' as const, zoneRouting: expandScene(scene('lyrics-tvs-only'), 'song') }
    expect(activeLookMode(tvs, config, DEFAULT_MODE_MAPPING)).toBe('worship')
  })
  it('a different item (routing matching no look) highlights nothing — the old chip no longer sticks', () => {
    const custom = { type: 'song' as const, zoneRouting: { 1: 'lyrics', 2: 'logo', 3: 'logo', 4: 'logo' } as never }
    expect(activeLookMode(custom, config, DEFAULT_MODE_MAPPING)).toBeNull()
    expect(activeLookMode(null, config, DEFAULT_MODE_MAPPING)).toBeNull()
  })
})
