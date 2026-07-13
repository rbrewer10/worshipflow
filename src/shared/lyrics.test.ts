import { describe, it, expect } from 'vitest'
import { splitLyricLines } from './lyrics'

describe('splitLyricLines', () => {
  it('leaves already-short lines untouched', () => {
    const input = 'Amazing grace how sweet the sound\nThat saved a wretch like me'
    expect(splitLyricLines(input)).toBe(input)
  })

  it('breaks a crammed single-line verse into phrase lines', () => {
    const verse =
      'I once was lost in sin but Jesus took me in, And then a little light from heaven filled my soul; It bathed my heart in love and wrote my name above, And just a little talk with Jesus made me whole.'
    const out = splitLyricLines(verse).split('\n')
    expect(out).toEqual([
      'I once was lost in sin but Jesus took me in,',
      'And then a little light from heaven filled my soul;',
      'It bathed my heart in love and wrote my name above,',
      'And just a little talk with Jesus made me whole.'
    ])
  })

  it('is idempotent — running twice yields the same result', () => {
    const verse =
      'I once was lost in sin but Jesus took me in, And then a little light from heaven filled my soul; It bathed my heart in love and wrote my name above, And just a little talk with Jesus made me whole.'
    const once = splitLyricLines(verse)
    expect(splitLyricLines(once)).toBe(once)
  })

  it('never exceeds the hard wrap width even without punctuation', () => {
    const longNoPunct =
      'this is a very long unbroken lyric line with absolutely no punctuation to break on anywhere at all'
    for (const line of splitLyricLines(longNoPunct).split('\n')) {
      expect(line.length).toBeLessThanOrEqual(64)
    }
  })

  it('drops blank lines and trims whitespace', () => {
    expect(splitLyricLines('  hello  \n\n  world  ')).toBe('hello\nworld')
  })
})
