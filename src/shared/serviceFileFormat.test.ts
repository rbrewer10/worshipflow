import { describe, it, expect } from 'vitest'
import { serviceFileFromArgv, chooseExportFormat, describeExport, exportDialogOptions, IMPORT_FILTERS, BUNDLE_FILTER, SERVICE_FILTER } from './serviceFileFormat'

// QA B12-N2: .wfservice is always plain JSON; a service with media saves as .wfbundle.
describe('service file formats', () => {
  it('offers both, the bundle first (default) when the service has media', () => {
    const withMedia = exportDialogOptions('Sunday: 10/12', true)
    expect(withMedia.defaultPath).toBe('Sunday- 10-12.wfbundle')
    expect(withMedia.filters).toEqual([BUNDLE_FILTER, SERVICE_FILTER])
    expect(BUNDLE_FILTER.name).toBe('With pictures & videos (.wfbundle, needs WorshipFlow 0.20.3+)')
    expect(SERVICE_FILTER.name).toBe('Without media (.wfservice, works on older versions)')
    const plain = exportDialogOptions('Sunday', false)
    expect(plain.defaultPath).toBe('Sunday.wfservice')
    expect(plain.filters[0]).toBe(SERVICE_FILTER)
  })
  it('the extension decides; none gets the default appended', () => {
    expect(chooseExportFormat('E:\\Sunday.wfservice', true)).toEqual({ filePath: 'E:\\Sunday.wfservice', format: 'wfservice' })
    expect(chooseExportFormat('E:\\Sunday.WFBUNDLE', false)).toEqual({ filePath: 'E:\\Sunday.WFBUNDLE', format: 'wfbundle' })
    expect(chooseExportFormat('/media/stick/Sunday', true)).toEqual({ filePath: '/media/stick/Sunday.wfbundle', format: 'wfbundle' })
    expect(chooseExportFormat('/media/stick/Sunday.txt', false)).toEqual({ filePath: '/media/stick/Sunday.txt.wfservice', format: 'wfservice' })
  })
  it('import accepts both extensions', () => {
    expect(IMPORT_FILTERS[0].extensions).toEqual(['wfbundle', 'wfservice'])
  })
})

// QA B12-N6: the save toast names the real reason for each file, once.
describe('export toast', () => {
  it('groups what is not carried by reason', () => {
    const r = describeExport({
      fileName: 'Sunday.wfbundle', format: 'wfbundle', mediaCount: 2, leftOut: 0,
      skipped: [{ name: 'sermon.mp4', reason: 'tooBig' }, { name: 'loop.mp4', reason: 'network' }, { name: 'fake.png', reason: 'notMedia' }, { name: 'gone.jpg', reason: 'missing' }, { name: 'gone.jpg', reason: 'missing' }]
    })
    expect(r.warn).toBe(true)
    expect(r.text).not.toMatch(/\([^()]*\(/) // QA B13-N8: no nested brackets
    expect(r.text).toBe('Saved Sunday.wfbundle with 2 picture/video files (opens in WorshipFlow 0.20.3 or newer). Not in the file: sermon.mp4 (over 8 GB, too big to carry); loop.mp4 (on a network share — copy it onto this computer first); fake.png (not a real picture or video); gone.jpg (not found on this computer).')
    expect(r.text).not.toMatch(/sermon\.mp4[^;]*not found/)
  })
  it('a plain .wfservice says media was left out and how to carry it', () => {
    const r = describeExport({ fileName: 'Sunday.wfservice', format: 'wfservice', mediaCount: 0, leftOut: 3, skipped: [] })
    expect(r).toEqual({ text: 'Saved Sunday.wfservice. It doesn’t include the 3 picture/video files the service uses — save as .wfbundle to carry them.', warn: true })
    expect(describeExport({ fileName: 'a.wfservice', format: 'wfservice', mediaCount: 0, leftOut: 0, skipped: [] })).toEqual({ text: 'Saved a.wfservice.', warn: false })
  })
})

describe('opening a service file from Explorer (QA B12-N2)', () => {
  it('finds the .wfbundle/.wfservice in argv, ignoring the exe and flags', () => {
    expect(serviceFileFromArgv(['C:\\WF\\WorshipFlow Pro.exe', 'E:\\Sunday.wfbundle'])).toBe('E:\\Sunday.wfbundle')
    expect(serviceFileFromArgv(['WorshipFlow Pro.exe', '--allow-file-access-from-files', 'E:\\Old.WFSERVICE'])).toBe('E:\\Old.WFSERVICE')
    expect(serviceFileFromArgv(['C:\\x\\evil.wfservice'])).toBeNull() // argv[0] is the app itself
    expect(serviceFileFromArgv(['app.exe', '--flag=x.wfbundle', 'notes.txt'])).toBeNull()
  })
})

describe('file associations (QA B12-N2)', () => {
  it('electron-builder registers both extensions', async () => {
    const { readFileSync } = await import('fs')
    const yml = readFileSync(new URL('../../electron-builder.yml', import.meta.url), 'utf8')
    expect(yml).toMatch(/fileAssociations:\s*\n\s*- ext: wfbundle[\s\S]*- ext: wfservice/)
  })
})
