import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { mediaDisplayName, storedMediaStem, isStoredMediaPath, disambiguateMediaTitles } from './mediaName'

// QA B12 watch item: an image item's title is the original file name; the
// hashed name is for the stored copy only, and it never grows per trip.
describe('media display names', () => {
  it('drops our hash suffix(es) for copies in imported-media', () => {
    expect(mediaDisplayName('C:\\Users\\r\\AppData\\Roaming\\WorshipFlow\\imported-media\\cross-0123456789.png')).toBe('cross.png')
    expect(mediaDisplayName('/home/r/.config/WorshipFlow/imported-media/cross-0123456789abcdef.png')).toBe('cross.png')
    expect(mediaDisplayName('/x/imported-media/Easter Sunday-0123456789-abcdef0123-0123456789abcdef.jpg')).toBe('Easter Sunday.jpg')
  })
  it('leaves names outside imported-media, and non-hash suffixes, alone', () => {
    expect(mediaDisplayName('C:\\Pics\\cross-0123456789.png')).toBe('cross-0123456789.png')
    expect(mediaDisplayName('/x/imported-media/song-2024.png')).toBe('song-2024.png')
    expect(mediaDisplayName('/x/imported-media/0123456789abcdef.png')).toBe('0123456789abcdef.png')
    expect(isStoredMediaPath('/x/imported-media')).toBe(false)
  })
  it('stored stems are filesystem-safe and hash-free', () => {
    expect(storedMediaStem('C:\\a\\Cross: Easter?.JPG')).toBe('Cross- Easter-')
    expect(storedMediaStem('/x/imported-media/cross-0123456789-0123456789abcdef.png')).toBe('cross')
    expect(storedMediaStem('/x/   .png')).toBe('media')
  })
})

describe('QA B13-N7: two different pictures never share one label', () => {
  const img = (path: string): { type: string; title: string; payload: Record<string, unknown> } => ({ type: 'image', title: mediaDisplayName(path), payload: { path } })
  it('a title standing for two files gets "(2)" on the second file, in running order; rows of the same file match', () => {
    const items = [
      img('/u/imported-media/cross-0123456789abcdef.png'),
      { type: 'text', title: 'cross.png', payload: {} },
      img('C:\\Pics\\cross.png'), // a different picture, also cross.png (e.g. missing on this PC)
      img('/u/imported-media/cross-0123456789abcdef.png'),
      img('/u/imported-media/cross-fedcba9876543210.png'),
      img('/u/imported-media/loop-0123456789abcdef.mp4')
    ]
    expect(disambiguateMediaTitles(items).map((i) => i.title)).toEqual(['cross.png', 'cross.png', 'cross.png (2)', 'cross.png', 'cross.png (3)', 'loop.mp4'])
  })
  it('leaves unique titles and the same file shown twice alone (and does not mutate the input)', () => {
    const items = [img('/u/imported-media/cross-0123456789abcdef.png'), img('/u/imported-media/cross-0123456789abcdef.png'), img('/u/a.png')]
    const out = disambiguateMediaTitles(items)
    expect(out.map((i) => i.title)).toEqual(['cross.png', 'cross.png', 'a.png'])
    expect(out[0]).toBe(items[0])
  })
  it('the service list the app shows goes through it', () => {
    const db = readFileSync(join(__dirname, '..', 'main', 'db.ts'), 'utf8')
    expect(db).toMatch(/return \{ \.\.\.svc, items: disambiguateMediaTitles\(items\) \}/)
  })
})
