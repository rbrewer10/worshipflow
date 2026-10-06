import { describe, it, expect } from 'vitest'
import { updateInstallBlockReason, parseAutoUpdateMode } from './updatePolicy'

const idle = { tracks: [{ hasLiveContent: false, mode: 'lyrics' }], obsStreaming: false, obsRecording: false, stageRehearsalActive: false }

describe('updateInstallBlockReason (QA A-H6: never install while outputs are live)', () => {
  it('allows installing on a pristine, idle app', () => {
    expect(updateInstallBlockReason(idle)).toBeNull()
  })

  it('allows installing when the screens are on black or the logo hold', () => {
    expect(updateInstallBlockReason({ ...idle, tracks: [{ hasLiveContent: true, mode: 'black' }] })).toBeNull()
    expect(updateInstallBlockReason({ ...idle, tracks: [{ hasLiveContent: true, mode: 'logo' }] })).toBeNull()
  })

  it('blocks while lyrics, a countdown, an announcement or a live call are showing', () => {
    for (const mode of ['lyrics', 'countdown', 'announcement', 'livecall']) {
      expect(updateInstallBlockReason({ ...idle, tracks: [{ hasLiveContent: true, mode }] })).toMatch(/live/)
    }
  })

  it('blocks when the second track is live even if main is idle', () => {
    expect(updateInstallBlockReason({ ...idle, tracks: [{ hasLiveContent: false, mode: 'lyrics' }, { hasLiveContent: true, mode: 'lyrics' }] })).not.toBeNull()
  })

  it('blocks while OBS is streaming or recording, or stage rehearsal runs', () => {
    expect(updateInstallBlockReason({ ...idle, obsStreaming: true })).toMatch(/streaming/)
    expect(updateInstallBlockReason({ ...idle, obsRecording: true })).toMatch(/recording/)
    expect(updateInstallBlockReason({ ...idle, stageRehearsalActive: true })).toMatch(/rehearsal/)
  })
})

describe('parseAutoUpdateMode', () => {
  it('defaults to download-only, and honours off', () => {
    expect(parseAutoUpdateMode(null)).toBe('download')
    expect(parseAutoUpdateMode('anything')).toBe('download')
    expect(parseAutoUpdateMode('off')).toBe('off')
  })
})
