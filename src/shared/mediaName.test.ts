import { describe, it, expect } from 'vitest'
import { mediaDisplayName, storedMediaStem, isStoredMediaPath } from './mediaName'

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
