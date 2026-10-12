import { describe, it, expect } from 'vitest'
import { importLyrics } from './lyricImport'
import { isChordLine, stripChordOnlyLines } from './chordLines'
import { parseReflowText, isSectionLabel } from './reflowText'
import { parseSetlist } from './setlistImport'

// Cases from QA pass B's parser probe (b-extra/parse-probe.ts).

describe('QA B6: pasted lyrics with a © footer keep every lyric line', () => {
  const pasted = 'Verse 1\nAmazing grace how sweet the sound\nThat saved a wretch like me\n\nChorus\nMy chains are gone\n\n© 2006 worshiptogether.com songs'
  it('"Verse 1" is not the title and the first lyric line is not the author', () => {
    const song = importLyrics(pasted)!
    expect(song.title).not.toBe('Verse 1')
    expect(song.author).toBeUndefined()
    expect(song.sections[0].label).toBe('Verse 1')
    expect(song.sections[0].lyrics).toBe('Amazing grace how sweet the sound\nThat saved a wretch like me')
    expect(song.copyright).toBe('2006 worshiptogether.com songs')
  })
  it('a © paste with no labels keeps its first line as lyrics', () => {
    const song = importLyrics('Amazing grace how sweet the sound\nThat saved a wretch like me\n\nI once was lost\n\n© Public Domain')!
    expect(song.author).toBeUndefined()
    expect(song.sections[0].lyrics.startsWith('Amazing grace how sweet the sound')).toBe(true)
  })
  it('a real SongSelect export still reads title, author, CCLI and copyright', () => {
    const song = importLyrics('10,000 Reasons (Bless The Lord)\nMatt Redman | Jonas Myrin\n\nVerse 1\nThe sun comes up\n\nChorus\nBless the Lord\n\nCCLI Song # 6016351\n© 2011 Thankyou Music\nFor use solely with the SongSelect® Terms of Use.\nCCLI License # 1234567')!
    expect(song.title).toBe('10,000 Reasons (Bless The Lord)')
    expect(song.author).toBe('Matt Redman | Jonas Myrin')
    expect(song.ccli).toBe('6016351')
    expect(song.copyright).toBe('2011 Thankyou Music')
    expect(song.sections.map((s) => s.lyrics)).toEqual(['The sun comes up', 'Bless the Lord'])
  })
})

describe('QA B7: chord lines are not projected', () => {
  it('drops chord-over-lyric lines and does not use them as the title', () => {
    const song = importLyrics('Verse 1\nG          C        G\nAmazing grace how sweet the sound\n    D           G\nThat saved a wretch like me')!
    expect(song.title).toBe('Amazing grace how sweet the sound')
    expect(song.sections[0].lyrics).toBe('Amazing grace how sweet the sound\nThat saved a wretch like me')
  })
  it('recognises chord lines', () => {
    for (const l of ['G          C        G', '    D           G', 'Am7  F/C  G  Csus4', 'C | G | Am | F', 'Bb', 'Em7']) expect(isChordLine(l), l).toBe(true)
  })
  it('leaves lyrics alone, including lines starting with chord letters', () => {
    for (const l of ['Amazing grace', 'A mighty fortress', 'Be Thou my vision', 'A', 'Every blessing', 'Come Thou fount']) expect(isChordLine(l), l).toBe(false)
  })
  it('keeps slide breaks', () => {
    expect(stripChordOnlyLines('G  C\nline one\n\nD  G\nline two')).toBe('line one\n\nline two')
  })
})

describe('QA B8: section label variants', () => {
  it('splits every variant into its own section, none projected as lyrics', () => {
    const sections = parseReflowText('Verse 1:\nline a\n\nPre-Chorus\nline b\n\n[Chorus]\nline c\n\nCHORUS\nline d\n\nRefrain\nline e\n\nBridge (x2)\nline f\n\nInterlude\n\nOutro\nline g')
    expect(sections.map((s) => s.label)).toEqual(['Verse 1:', 'Pre-Chorus', '[Chorus]', 'CHORUS', 'Refrain', 'Bridge (x2)', 'Interlude', 'Outro'])
    expect(sections.map((s) => s.kind)).toEqual(['verse', 'section', 'chorus', 'chorus', 'chorus', 'bridge', 'section', 'ending'])
    expect(sections.every((s) => !/chorus|refrain|bridge|interlude|outro|verse/i.test(s.lyrics))).toBe(true)
  })
  it('more variants', () => {
    for (const l of ['Chorus x2', 'Chorus 2 (Repeat)', '(Bridge)', 'Pre Chorus 2', 'prechorus', 'Tag:', 'Ending', 'Verse 10', 'Instrumental']) expect(isSectionLabel(l), l).toBe(true)
  })
  it('does not swallow lyric lines', () => {
    for (const l of ['Chorus of angels sing', 'Bridge over troubled water', 'chorus            99', 'Verse by verse we read', 'Outro outro outro outro']) expect(isSectionLabel(l), l).toBe(false)
  })
})

describe('QA B9: ChordPro {c:} is a comment, not copyright', () => {
  it('does not put "Repeat chorus twice" in the CCLI footer', () => {
    const song = importLyrics('{title: Test Song}\n{c: Repeat chorus twice}\n{soc}\n[G]Holy [C]holy\n{eoc}')!
    expect(song.copyright).toBeUndefined()
    expect(song.sections.map((s) => s.lyrics).join('\n')).not.toContain('Repeat chorus twice')
  })
  it('{copyright:} still sets the copyright', () => {
    expect(importLyrics('{title: X}\n{copyright: 2020 Someone}\n[G]Holy')!.copyright).toBe('2020 Someone')
  })
})

describe('QA B16: setlist paste classifies songs and service elements', () => {
  it('songs that start with Word/Message stay songs', () => {
    expect(parseSetlist('Word of God Speak\nMessage of the Cross')).toEqual([
      { kind: 'song', title: 'Word of God Speak' },
      { kind: 'song', title: 'Message of the Cross' },
    ])
  })
  it('sermon lines need a separator (or the bare word)', () => {
    expect(parseSetlist('Sermon: The Cross\nMessage - Hope\nSermon')).toEqual([
      { kind: 'sermon', title: 'The Cross' },
      { kind: 'sermon', title: 'Hope' },
      { kind: 'sermon', title: 'Sermon' },
    ])
  })
  it('service elements become elements (headers), not song placeholders', () => {
    expect(parseSetlist('Welcome / Announcements\nCommunion\nOffering\nPastoral Prayer\nBenediction\nTeaching moment').every((e) => e.kind === 'element')).toBe(true)
    expect(parseSetlist('Order of Worship')).toEqual([])
  })
})
