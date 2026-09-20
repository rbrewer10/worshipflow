import { describe, it, expect } from 'vitest'
import { applyAudienceLayers, defaultLayerFlags } from './layers'

describe('applyAudienceLayers', () => {
  const shown = { line: 'Amazing grace', background: '/bg.mp4' }

  it('passes content through when nothing is cleared', () => {
    expect(applyAudienceLayers(shown, defaultLayerFlags())).toEqual(shown)
  })

  it('hides lyrics on the house but keeps the motion background', () => {
    expect(applyAudienceLayers(shown, { textHidden: true, bgHidden: false })).toEqual({
      line: '',
      background: '/bg.mp4',
    })
  })

  it('hides the background but keeps the words', () => {
    expect(applyAudienceLayers(shown, { textHidden: false, bgHidden: true })).toEqual({
      line: 'Amazing grace',
      background: null,
    })
  })

  it('never blanks the stage monitor', () => {
    expect(applyAudienceLayers(shown, { textHidden: true, bgHidden: true }, { isStage: true })).toEqual(shown)
  })
})
