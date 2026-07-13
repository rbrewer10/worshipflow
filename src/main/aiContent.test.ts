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
