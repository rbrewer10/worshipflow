import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { describeImport, parseServiceBundle, referencedMediaPaths, sameSong, songContentDiffers, uniqueServiceName, type ImportSummary } from './serviceBundle'

// A real Sample Sunday export from the QA pass (b-extra/usb/export.wfservice).
const sample = readFileSync(join(__dirname, '__fixtures__/sample-sunday.wfservice'), 'utf8')
const good = JSON.parse(sample)

describe('parseServiceBundle (QA B12)', () => {
  it('round-trips a real export', () => {
    const r = parseServiceBundle(sample)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.bundle.name).toBe('Sample Sunday')
    expect(r.bundle.items).toHaveLength(good.items.length)
    expect(r.skipped).toEqual([])
    const ag = r.bundle.items.find((i) => i.song?.title === 'Amazing Grace')!
    expect(ag.song!.sections.length).toBeGreaterThan(0)
  })
  it('accepts a UTF-8 BOM (Windows Notepad "Save")', () => {
    const r = parseServiceBundle('\uFEFF' + sample)
    expect(r.ok).toBe(true)
  })
  it('truncated / not JSON → a friendly message, not a raw parser error', () => {
    const r = parseServiceBundle(sample.slice(0, 500))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toMatch(/isn’t a WorshipFlow service/)
      expect(r.error).not.toMatch(/Unexpected|JSON/)
    }
    expect(parseServiceBundle('').ok).toBe(false)
  })
  it('items not an array → friendly message', () => {
    const r = parseServiceBundle(JSON.stringify({ version: 2, name: 'x', items: {} }))
    expect(r.ok).toBe(false)
  })
  it('missing name → "Imported service" instead of an unhandled SQL bind error', () => {
    const r = parseServiceBundle(JSON.stringify({ ...good, name: undefined }))
    expect(r.ok && r.bundle.name).toBe('Imported service')
  })
  it('unknown item types and songs without words are skipped and reported', () => {
    const body = JSON.stringify({ ...good, name: 'Bad item', items: [good.items[4], { type: 'song', song: null, title: 'Lost Song' }, { type: 'bogus' }, { type: 'text' }, good.items[5]] })
    const r = parseServiceBundle(body)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.bundle.items.map((i) => i.type)).toEqual(['song', 'text', 'song'])
    expect(r.skipped).toHaveLength(2)
    expect(r.skipped.join(' ')).toMatch(/Lost Song.*words are missing/)
    expect(r.skipped.join(' ')).toMatch(/unknown item type “bogus”/)
  })
  it('keeps track and zone routing (QA B11)', () => {
    const items = [{ ...good.items[4], track: 'second', zoneRouting: { 1: 'lyrics', 2: 'logo', 3: 'lyrics', 4: 'stage' } }]
    const r = parseServiceBundle(JSON.stringify({ ...good, items }))
    expect(r.ok && r.bundle.items[0].track).toBe('second')
    expect(r.ok && r.bundle.items[0].zoneRouting).toEqual({ 1: 'lyrics', 2: 'logo', 3: 'lyrics', 4: 'stage' })
  })
})

describe('song conflict detection (QA B11)', () => {
  const r = parseServiceBundle(sample)
  const ag = r.ok ? r.bundle.items.find((i) => i.song?.title === 'Amazing Grace')!.song! : null!
  const local = { title: 'Amazing Grace', author: ag.author, ccli: ag.ccli, copyright: ag.copyright, sections: ag.sections, arrangement: ag.arrangement }

  it('the same words are not a conflict (whitespace / CRLF differences ignored)', () => {
    const crlf = { ...local, sections: local.sections.map((s) => ({ ...s, lyrics: s.lyrics.replace(/\n/g, '\r\n') + '  ' })) }
    expect(songContentDiffers(crlf, ag)).toBe(false)
  })
  it('QA repro: lyrics changed at home are detected', () => {
    const changed = { ...ag, sections: [{ kind: 'verse' as const, label: 'Verse 1', ordinal: 0, lyrics: 'UPDATED LYRICS FROM THE USB STICK' }] }
    expect(songContentDiffers(local, changed)).toBe(true)
  })
  it('same song by CCLI number even if the title differs; different CCLI = different song', () => {
    expect(sameSong({ title: 'Holy Spirit', ccli: '6087919' }, { title: 'Holy Spirit (Live)', ccli: 'CCLI# 6087919' })).toBe(true)
    expect(sameSong({ title: 'Holy Spirit', ccli: '6087919' }, { title: 'Holy Spirit', ccli: '9999999' })).toBe(false)
    expect(sameSong({ title: 'Amazing  grace', ccli: null }, { title: 'Amazing Grace', ccli: '22025' })).toBe(true)
  })
})

describe('media + naming + summary (QA B11, B24)', () => {
  it('lists absolute media paths so missing ones can be reported', () => {
    const items = [{ ...good.items[4], payload: { background: 'C:\\Users\\Pastor\\Pictures\\cross.jpg' } }, { type: 'image', payload: { path: '/home/x/a.png' } }, { type: 'text', payload: { background: 'preset:dawn' } }]
    const r = parseServiceBundle(JSON.stringify({ ...good, items }))
    expect(r.ok && referencedMediaPaths(r.bundle)).toEqual(['C:\\Users\\Pastor\\Pictures\\cross.jpg', '/home/x/a.png'])
  })
  it('re-importing the same file doesn’t create two identically named services', () => {
    expect(uniqueServiceName('Sample Sunday', ['Sample Sunday'])).toBe('Sample Sunday (2)')
    expect(uniqueServiceName('Sample Sunday', ['sample sunday', 'Sample Sunday (2)'])).toBe('Sample Sunday (3)')
    expect(uniqueServiceName('Easter', ['Sample Sunday'])).toBe('Easter')
  })
  it('summary mentions every thing the operator should know', () => {
    const s: ImportSummary = { serviceName: 'Sample Sunday (2)', renamedFrom: 'Sample Sunday', items: 9, skipped: ['item 2: unknown item type “bogus”'], songsAdded: 1, songsMatched: 2, songsUpdated: ['Amazing Grace'], songsKept: [], songsCopied: [], missingMedia: ['C:\\Users\\Pastor\\Pictures\\cross.jpg'] }
    const text = describeImport(s)
    expect(text).toMatch(/Imported “Sample Sunday \(2\)” — 9 items/)
    expect(text).toMatch(/already exists/)
    expect(text).toMatch(/Updated from the file: Amazing Grace/)
    expect(text).toMatch(/Skipped 1/)
    expect(text).toMatch(/cross\.jpg/)
  })
})
