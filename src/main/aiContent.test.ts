import { describe, it, expect } from 'vitest'
import { buildSrt, type TranscriptSegment } from './aiContent'

describe('buildSrt', () => {
  it('formats segments as standard SRT with comma-millisecond timestamps', () => {
    const segs: TranscriptSegment[] = [
      { start: 0, end: 2.5, text: 'Good morning.' },
      { start: 2.5, end: 5, text: 'Let us pray.' }
    ]
    expect(buildSrt(segs)).toBe(
      '1\n00:00:00,000 --> 00:00:02,500\nGood morning.\n\n' +
      '2\n00:00:02,500 --> 00:00:05,000\nLet us pray.\n'
    )
  })
  it('handles hours and trims text', () => {
    const out = buildSrt([{ start: 3661.2, end: 3662, text: '  hi  ' }])
    expect(out).toContain('01:01:01,200 --> 01:01:02,000')
    expect(out).toContain('\nhi\n')
  })
})

import { buildChapters } from './aiContent'
import type { RecordingMarker } from '../shared/types'

function mk(kind: RecordingMarker['kind'], label: string, offsetMs: number): RecordingMarker {
  return { id: offsetMs, recordingId: 1, itemId: null, kind, label, offsetMs }
}

describe('buildChapters', () => {
  it('shifts marker offsets by the trim start and forces a 0:00 first line', () => {
    const markers = [
      mk('item', 'Countdown', 0),
      mk('song', 'Opener', 300000),   // 5:00 raw
      mk('sermon', 'The Prodigal Son', 1800000) // 30:00 raw
    ]
    // trim started at 5:00 (300000ms): Opener→0:00, sermon→25:00
    expect(buildChapters(markers, 300000)).toBe('0:00 Opener\n25:00 The Prodigal Son')
  })

  it('prepends "0:00 Intro" when the first kept marker is not at zero', () => {
    const markers = [mk('song', 'Opener', 60000)]
    expect(buildChapters(markers, 0)).toBe('0:00 Intro\n1:00 Opener')
  })

  it('drops markers before the trim start and formats past an hour', () => {
    const markers = [mk('item', 'pre', 0), mk('sermon', 'Msg', 3700000)]
    expect(buildChapters(markers, 100000)).toBe('0:00 Intro\n1:00:00 Msg')
  })
})
