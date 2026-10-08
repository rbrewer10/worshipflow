import { describe, expect, it } from 'vitest'
import { hiddenLayerNotice, layerTogglePatch } from './liveLayersUi'

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
