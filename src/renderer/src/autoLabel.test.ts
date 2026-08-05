import { describe, it, expect } from 'vitest'
import { analyzeAndLabelSections, previewAutoLabels } from './autoLabel'

describe('analyzeAndLabelSections', () => {
  it('returns an empty array for empty input', () => {
    expect(analyzeAndLabelSections('')).toEqual([])
  })

  it('detects an explicit "Verse"/"Chorus" marker with high confidence', () => {
    const text = 'Verse\nOne two three\n\nChorus\nFour five six'
    const analyses = analyzeAndLabelSections(text)
    expect(analyses).toHaveLength(2)
    expect(analyses[0].detectedKind).toBe('verse')
    expect(analyses[0].confidence).toBe(0.95)
    expect(analyses[0].reason).toContain('explicit')
    expect(analyses[1].detectedKind).toBe('chorus')
    expect(analyses[1].confidence).toBe(0.95)
  })

  it('detects a repeated block as chorus when it is not the first/last block', () => {
    // Middle two blocks are >4 lines so they skip the short-block intro/ending heuristic,
    // and the identical chorus text repeats, so repetition detection should fire.
    const text = [
      'Verse one line one',
      'Verse one line two',
      'Verse one line three',
      'Verse one line four',
      'Verse one line five'
    ].join('\n')
    const chorus = ['Chorus line one', 'Chorus line two', 'Chorus line three', 'Chorus line four', 'Chorus line five'].join('\n')
    const verse2 = [
      'Verse two line one',
      'Verse two line two',
      'Verse two line three',
      'Verse two line four',
      'Verse two line five'
    ].join('\n')
    const full = [text, chorus, verse2, chorus].join('\n\n')

    const analyses = analyzeAndLabelSections(full)
    expect(analyses).toHaveLength(4)
    // Both chorus occurrences (index 1 and 3) should be detected as repeated -> chorus.
    expect(analyses[1].detectedKind).toBe('chorus')
    expect(analyses[1].reason).toContain('appears 2x')
    expect(analyses[3].detectedKind).toBe('chorus')
  })

  it('labels a short opening block as intro', () => {
    const text = 'Short intro\nline two\n\nA proper full verse\nwith several\nmore lines\nof real lyric content\nhere too'
    const analyses = analyzeAndLabelSections(text)
    expect(analyses[0].detectedKind).toBe('intro')
    expect(analyses[0].reason).toBe('short opening section')
  })

  it('labels a short closing block as ending', () => {
    const text = 'A proper full verse\nwith several\nmore lines\nof real lyric content\nhere too\n\nShort outro\nline two'
    const analyses = analyzeAndLabelSections(text)
    const last = analyses[analyses.length - 1]
    expect(last.detectedKind).toBe('ending')
    expect(last.reason).toBe('short closing section')
  })

  it('produces a confidence score between 0 and 1 for every section', () => {
    const text = 'Verse\nlyric a\n\nSome unlabeled block\nwith lyric content\nspanning multiple\nlines of text\nhere as well'
    const analyses = analyzeAndLabelSections(text)
    for (const a of analyses) {
      expect(a.confidence).toBeGreaterThan(0)
      expect(a.confidence).toBeLessThanOrEqual(1)
    }
  })

  it('assigns sequential ordinals matching block order', () => {
    const text = 'a\n\nb\n\nc'
    const analyses = analyzeAndLabelSections(text)
    expect(analyses.map((a) => a.ordinal)).toEqual([0, 1, 2])
  })
})

describe('previewAutoLabels', () => {
  it('prepends the detected label to blocks with no existing label', () => {
    const text = 'Amazing grace how sweet\nthe sound that saved\n\nTwas grace that taught\nmy heart to fear'
    const analyses = analyzeAndLabelSections(text)
    const preview = previewAutoLabels(text, analyses)
    // First and last (only) blocks are short -> intro / ending per the heuristics.
    expect(preview).toBe(
      'Intro\nAmazing grace how sweet\nthe sound that saved\n\nEnding\nTwas grace that taught\nmy heart to fear'
    )
  })

  it('leaves a block unchanged if it already has an explicit label', () => {
    const text = 'Verse\nAmazing grace\n\nChorus\nHow sweet'
    const analyses = analyzeAndLabelSections(text)
    const preview = previewAutoLabels(text, analyses)
    expect(preview).toBe(text)
  })

  it('returns an empty string for empty input', () => {
    expect(previewAutoLabels('', [])).toBe('')
  })

  it('does not fragment an already-labeled section by prepending a label to its continuation slide', () => {
    // "Lord God almighty" is a second slide of the Chorus (a blank-line slide
    // break under the Reflow model), not a fresh stanza — it must not gain a
    // synthesized label, or re-parsing the applied preview would split one
    // chorus into two sections.
    const text = 'Chorus\nHoly holy holy\n\nLord God almighty'
    const analyses = analyzeAndLabelSections(text)
    const preview = previewAutoLabels(text, analyses)
    expect(preview).toBe(text)
  })
})
