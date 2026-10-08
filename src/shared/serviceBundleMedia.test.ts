import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseServiceBundle, bundleMediaPaths, archiveEntryName, rewriteMediaPaths, describeImport, BUNDLE_VERSION, type ImportSummary } from './serviceBundle'

// Ryan's decision (Oct 2026): a .wfservice carries every picture, background
// and video (main/serviceArchive.ts). These are the shared halves.
const isMedia = (p: string): boolean => /\.(png|jpe?g|gif|webp|bmp|mp4|webm|mov|m4v)$/i.test(p)

describe('.wfservice media manifest (v3)', () => {
  it('version 3; the media list is parsed; a v2 file has none and still imports', () => {
    expect(BUNDLE_VERSION).toBe(3)
    const v3 = parseServiceBundle(JSON.stringify({ version: 3, name: 'S', items: [], media: [{ path: 'C:\\p\\a.jpg', file: 'media/0001-a.jpg', size: 3 }, { path: 1 }, 'x'] }))
    expect(v3.ok && v3.bundle.media).toEqual([{ path: 'C:\\p\\a.jpg', file: 'media/0001-a.jpg', size: 3 }])
    expect(v3.ok && v3.newerVersion).toBe(false)
    const fixture = readFileSync(join(__dirname, '__fixtures__', 'sample-sunday.wfservice'), 'utf8')
    const v2 = parseServiceBundle(fixture)
    expect(v2.ok).toBe(true)
    if (v2.ok) { expect(v2.bundle.media).toEqual([]); expect(v2.bundle.items.length).toBeGreaterThan(0) }
  })
  it('finds every absolute media path anywhere: payloads, image decks, styles, song and announcement backgrounds, the theme', () => {
    const bundle = {
      theme: '/srv/themes/hills.mp4',
      items: [
        { payload: { background: 'C:\\Media\\sky.mp4', path: 'D:/Pics/cross.jpg', label: 'C:\\not media.txt' }, style: { bg: { image: '\\\\booth\\share\\wall.png' } }, song: { background: '/home/ryan/Videos/loop.webm' } },
        { payload: { slides: [{ image: 'C:\\Deck\\s1.png' }, { image: 'C:\\Deck\\s2.png' }], background: 'theme:sanctuary', icon: 'icon:bell', rel: 'relative/x.png' } }
      ],
      announcements: { 7: { background: 'C:\\Ann\\bg.jpg', icon: 'C:\\Ann\\icon.png' } }
    } as unknown as Parameters<typeof bundleMediaPaths>[0]
    expect(bundleMediaPaths(bundle, isMedia).sort()).toEqual([
      '/home/ryan/Videos/loop.webm', '/srv/themes/hills.mp4', 'C:\\Ann\\bg.jpg', 'C:\\Ann\\icon.png', 'C:\\Deck\\s1.png', 'C:\\Deck\\s2.png',
      'C:\\Media\\sky.mp4', 'D:/Pics/cross.jpg', '\\\\booth\\share\\wall.png'
    ].sort())
  })
  it('entry names are short, safe and numbered', () => {
    expect(archiveEntryName(0, 'C:\\Users\\Pastor\\Pictures\\Easter: Cross (2).JPG')).toBe('media/0001-Easter- Cross -2-.jpg')
    expect(archiveEntryName(41, '/x/.hidden.mp4')).toBe('media/0042-hidden.mp4')
    expect(archiveEntryName(2, `/x/${'a'.repeat(300)}.mp4`).length).toBeLessThanOrEqual(100)
  })
  it('import rewrites every reference to the copy on this PC, leaving everything else alone', () => {
    const map = new Map([['C:\\Media\\sky.mp4', '/ud/imported-media/sky-1.mp4']])
    const items = [{ payload: { background: 'C:\\Media\\sky.mp4', n: 3, deck: [{ bg: 'C:\\Media\\sky.mp4' }], other: 'C:\\Media\\other.mp4' } }]
    expect(rewriteMediaPaths(items, map)).toEqual([{ payload: { background: '/ud/imported-media/sky-1.mp4', n: 3, deck: [{ bg: '/ud/imported-media/sky-1.mp4' }], other: 'C:\\Media\\other.mp4' } }])
    expect(items[0].payload.background).toBe('C:\\Media\\sky.mp4') // input untouched
  })
  it('the import summary says what was copied, refused and still missing', () => {
    const s: ImportSummary = { serviceName: 'S', renamedFrom: null, items: 3, skipped: [], songsAdded: 0, songsMatched: 0, songsUpdated: [], songsKept: [], songsCopied: [], missingMedia: ['C:\\x\\gone.mp4'], mediaRestored: 2, mediaRefused: ['evil.png'] }
    const text = describeImport(s)
    expect(text).toMatch(/2 picture\/video files copied onto this computer/)
    expect(text).toMatch(/Left out 1 file that isn’t a real picture or video: evil\.png/)
    expect(text).toMatch(/1 picture\/video file isn’t on this computer or in the file: gone\.mp4/)
  })
})

describe('.wfservice media wiring in main (source guard)', () => {
  const main = readFileSync(join(__dirname, '..', 'main', 'index.ts'), 'utf8').replace(/\r\n/g, '\n')
  const handler = (name: string): string => { const at = main.indexOf(`ipcMain.handle('${name}'`); return main.slice(at, main.indexOf('\n})\n', at)) }
  it('export plans the media from a deep walk and streams a tar when there is any (plain JSON otherwise), reporting what was not carried', () => {
    const fn = handler('wf:services:export')
    expect(fn).toMatch(/planExportMedia\(bundleMediaPaths\(bundle, \(p\) => hasMediaExtension\(p\)\)\)/)
    expect(fn).toMatch(/if \(plan\.entries\.length\) await writeServiceArchive\(filePath, json, plan\.entries\)\n\s*else writeFileSync\(filePath, json, 'utf-8'\)/)
    expect(fn).toMatch(/missingMedia: plan\.missing/)
  })
  it('import detects a tar, restores media before creating anything, rewrites references and undoes copies on failure', () => {
    const fn = handler('wf:services:import')
    expect(fn).toMatch(/if \(await isServiceArchive\(filePaths\[0\]\)\)/)
    expect(fn.indexOf('restoreArchiveMedia(')).toBeGreaterThan(-1)
    expect(fn.indexOf('restoreArchiveMedia(')).toBeLessThan(fn.indexOf('createService('))
    expect(fn).toMatch(/rewriteMediaPaths\(bundle\.items, restored\.map\)/)
    expect(fn).toMatch(/rewriteMediaPaths\(bundle\.announcements, restored\.map\)/)
    expect(fn).toMatch(/for \(const f of restored\.created\) \{ try \{ unlinkSync\(f\) \}/)
    expect(fn).toMatch(/mediaRestored: restored\.map\.size/)
  })
})
