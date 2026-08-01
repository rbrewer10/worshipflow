import { describe, it, expect } from 'vitest'
import { autoDeckFor } from './autoDeck'
import type { AutoDeckDeps } from './autoDeck'
import type { ServiceItem } from '../shared/types'
import { readFileSync } from 'fs'
import { join } from 'path'

const item = (over: Partial<ServiceItem>): ServiceItem => ({
  id: 1, ordinal: 0, type: 'sermon', ref_id: null, payload: {},
  title: 'Item', notes: null, style: null, zoneRouting: null, track: 'main',
  ...over,
})

const deps = (over: Partial<AutoDeckDeps> = {}): AutoDeckDeps => ({
  budget: 20,
  lookupScripture: async () => ({
    ok: true,
    reference: 'John 3:16-18',
    verses: [
      { n: 16, text: 'aaaaaaaa' },
      { n: 17, text: 'bbbbbbbb' },
      { n: 18, text: 'cccccccc' },
    ],
  }),
  getAnnouncement: async () => null,
  ...over,
})

describe('autoDeckFor — sermon', () => {
  it('opens with a title-only intro on BOTH back screens, no verses yet', async () => {
    const deck = await autoDeckFor(
      item({ type: 'sermon', payload: { title: 'The Gift', passage: 'John 3:16-18' } }),
      deps()
    )
    const card = { kind: 'sermon', text: 'The Gift', reference: 'John 3:16-18' }
    expect(deck![0].zones[1]).toEqual(card)
    expect(deck![0].zones[2]).toEqual(card)
    expect(deck![0].zones[4]).toEqual(card)
  })

  it('emits one slide per chunk after the intro, with sub-references', async () => {
    const deck = await autoDeckFor(
      item({ type: 'sermon', payload: { title: 'The Gift', passage: 'John 3:16-18' } }),
      deps()
    )
    expect(deck).not.toBeNull()
    // 1 intro + 2 chunks: 8+8=16 fits 20; the third verse starts a new chunk.
    expect(deck!.length).toBe(3)
    expect(deck![1].zones[2]).toEqual({ kind: 'scripture', reference: 'John 3:16-17' })
    expect(deck![2].zones[2]).toEqual({ kind: 'scripture', reference: 'John 3:18' })
  })

  it('holds the title on Back Left with the current reference', async () => {
    const deck = await autoDeckFor(
      item({ type: 'sermon', payload: { title: 'The Gift', passage: 'John 3:16-18' } }),
      deps()
    )
    expect(deck![1].zones[1]).toEqual({ kind: 'sermon', text: 'The Gift', reference: 'John 3:16-17' })
    expect(deck![2].zones[1]).toEqual({ kind: 'sermon', text: 'The Gift', reference: 'John 3:18' })
  })

  it('puts the words on the stage monitor and the logo on the Lyrics TVs', async () => {
    const deck = await autoDeckFor(
      item({ type: 'sermon', payload: { title: 'The Gift', passage: 'John 3:16-18' } }),
      deps()
    )
    expect(deck![1].zones[4]).toEqual({ kind: 'scripture', reference: 'John 3:16-17' })
    expect(deck![1].zones[3]).toEqual({ kind: 'logo' })
  })

  it('returns null when the sermon has no passage', async () => {
    expect(await autoDeckFor(item({ type: 'sermon', payload: { title: 'X' } }), deps())).toBeNull()
  })

  it('returns null when the lookup fails', async () => {
    const d = deps({ lookupScripture: async () => ({ ok: false, error: 'not found' }) })
    expect(await autoDeckFor(item({ type: 'sermon', payload: { passage: 'Nope 1:1' } }), d)).toBeNull()
  })

  it('falls back to the item title when the payload has none', async () => {
    const deck = await autoDeckFor(
      item({ type: 'sermon', title: 'Fallback', payload: { passage: 'John 3:16-18' } }),
      deps()
    )
    expect(deck![1].zones[1].text).toBe('Fallback')
  })
})

describe('autoDeckFor — announcement block', () => {
  const withAnnouncements = (bodies: Record<number, string>): AutoDeckDeps =>
    deps({
      getAnnouncement: async (id) =>
        bodies[id] === undefined ? null : { id, title: `A${id}`, body: bodies[id] },
    })

  it('walks the announcements in the order given', async () => {
    const deck = await autoDeckFor(
      item({ type: 'announcement', payload: { refIds: [2, 1] } }),
      withAnnouncements({ 1: 'One.', 2: 'Two.' })
    )
    expect(deck!.map((s) => s.zones[2].text)).toEqual(['Two.', 'One.'])
  })

  it('holds the heading on Back Left for the whole block', async () => {
    const deck = await autoDeckFor(
      item({ type: 'announcement', payload: { refIds: [1, 2] } }),
      withAnnouncements({ 1: 'One.', 2: 'Two.' })
    )
    expect(deck![0].zones[1]).toEqual({ kind: 'text', text: 'Announcements' })
    expect(deck![1].zones[1]).toEqual({ kind: 'same' })
  })

  it('mirrors the text onto the stage monitor', async () => {
    const deck = await autoDeckFor(
      item({ type: 'announcement', payload: { refIds: [1] } }),
      withAnnouncements({ 1: 'One.' })
    )
    expect(deck![0].zones[4]).toEqual({ kind: 'text', text: 'One.' })
    expect(deck![0].zones[3]).toEqual({ kind: 'logo' })
  })

  it('splits a long announcement across slides', async () => {
    const deck = await autoDeckFor(
      item({ type: 'announcement', payload: { refIds: [1] } }),
      withAnnouncements({ 1: 'Aaaa bbbb cccc. Dddd eeee ffff. Gggg hhhh iiii.' })
    )
    expect(deck!.length).toBeGreaterThan(1)
  })

  it('skips a missing announcement without losing the rest', async () => {
    const deck = await autoDeckFor(
      item({ type: 'announcement', payload: { refIds: [1, 99, 2] } }),
      withAnnouncements({ 1: 'One.', 2: 'Two.' })
    )
    expect(deck!.map((s) => s.zones[2].text)).toEqual(['One.', 'Two.'])
  })

  it('leaves a legacy single-announcement item alone', async () => {
    // ref_id with no refIds is every announcement item built before blocks
    // existed. Generating for it would silently re-lay-out existing services.
    const deck = await autoDeckFor(
      item({ type: 'announcement', ref_id: 1, payload: {} }),
      withAnnouncements({ 1: 'One.' })
    )
    expect(deck).toBeNull()
  })

  it('generates for a block of one, because that was picked on purpose', async () => {
    const deck = await autoDeckFor(
      item({ type: 'announcement', payload: { refIds: [1] } }),
      withAnnouncements({ 1: 'One.' })
    )
    expect(deck!.map((s) => s.zones[2].text)).toEqual(['One.'])
  })

  it('returns null when nothing resolves', async () => {
    const deck = await autoDeckFor(
      item({ type: 'announcement', payload: { refIds: [99] } }),
      withAnnouncements({})
    )
    expect(deck).toBeNull()
  })
})

describe('autoDeckFor — other types', () => {
  it('returns null for a song', async () => {
    expect(await autoDeckFor(item({ type: 'song', ref_id: 5 }), deps())).toBeNull()
  })
})

describe('autoDeckFor — scripture', () => {
  const scripture = { type: 'scripture' as const, payload: { reference: 'John 3:16-18' } }

  it('puts the reference alone on Back Left and the verse on Back Right', async () => {
    const deck = await autoDeckFor(item(scripture), deps())
    expect(deck).not.toBeNull()
    expect(deck![0].zones[1]).toEqual({ kind: 'text', text: 'John 3:16-17' })
    expect(deck![0].zones[2]).toEqual({ kind: 'scripture', reference: 'John 3:16-17' })
  })

  it('keeps the verse on the Lyrics TVs — the screen the congregation reads from', async () => {
    const deck = await autoDeckFor(item(scripture), deps())
    expect(deck![0].zones[3]).toEqual({ kind: 'scripture', reference: 'John 3:16-17' })
  })

  it('carries the verse to the stage monitor too', async () => {
    const deck = await autoDeckFor(item(scripture), deps())
    expect(deck![0].zones[4]).toEqual({ kind: 'scripture', reference: 'John 3:16-17' })
  })

  it('chunks a long passage and advances the reference with the reading', async () => {
    const deck = await autoDeckFor(item(scripture), deps())
    expect(deck).toHaveLength(2)
    expect(deck![1].zones[1]).toEqual({ kind: 'text', text: 'John 3:18' })
    expect(deck![1].zones[2]).toEqual({ kind: 'scripture', reference: 'John 3:18' })
  })

  it('has no intro card — a reading starts at the first verse', async () => {
    const deck = await autoDeckFor(item(scripture), deps())
    expect(deck![0].zones[2].kind).toBe('scripture')
  })

  it('generates nothing without a reference, so the item behaves as before', async () => {
    expect(await autoDeckFor(item({ type: 'scripture', payload: {} }), deps())).toBeNull()
  })

  it('generates nothing when the lookup fails', async () => {
    const failing = deps({ lookupScripture: async () => ({ ok: false }) })
    expect(await autoDeckFor(item(scripture), failing)).toBeNull()
  })
})

// Wiring guard. autoDeckFor can be perfectly correct and still do nothing at
// all if no live-load path calls it — which is exactly what happened when
// scriptureDeck shipped with passing unit tests and was never reachable: every
// test here called autoDeckFor directly, so none of them could tell that the
// two places in index.ts which trigger a deck load didn't mention 'scripture'.
//
// index.ts imports Electron and can't be loaded under this Node-only Vitest
// config, so this asserts against its SOURCE. Coarse, but it fails loudly the
// next time a type is added to autoDeckFor and not to the paths that invoke it.
describe('deck loading is actually wired up for every auto-decked type', () => {
  const source = readFileSync(join(__dirname, 'index.ts'), 'utf8')

  it('autoDeckFor really produces a deck for each type that should have one', async () => {
    const withAnnouncement = deps({
      getAnnouncement: async () => ({ id: 1, title: 'Notices', body: 'One. Two.' })
    })
    expect(await autoDeckFor(item({ type: 'sermon', payload: { title: 'T', passage: 'John 3:16-18' } }), deps())).not.toBeNull()
    expect(await autoDeckFor(item({ type: 'scripture', payload: { reference: 'John 3:16-18' } }), deps())).not.toBeNull()
    expect(await autoDeckFor(item({ type: 'announcement', payload: { refIds: [1] } }), withAnnouncement)).not.toBeNull()
  })

  it('autoDeckFor leaves types without a generated layout alone', async () => {
    expect(await autoDeckFor(item({ type: 'song', ref_id: 1, payload: {} }), deps())).toBeNull()
    expect(await autoDeckFor(item({ type: 'countdown', payload: { seconds: 300 } }), deps())).toBeNull()
  })

  it('the Go Live chokepoint (wf:live:setItemId) loads a deck for sermon and scripture', () => {
    // Announcements are excluded on purpose: doLoadAnnouncement already calls
    // loadDeckOnto with the item, so routing them through here too would build
    // the same deck twice.
    const chokepoint = source.match(/if \(item && \(item\.type === 'text'[^)]*\)\) \{\s*\n\s*void loadDeckOnto/)
    expect(chokepoint, 'the wf:live:setItemId deck-load chokepoint moved or changed shape').not.toBeNull()
    expect(chokepoint![0]).toContain("'sermon'")
    expect(chokepoint![0]).toContain("'scripture'")
  })

  it('doLoadScripture accepts the item, so Next/Prev can load its deck', () => {
    // Without the item parameter there is structurally no way for the tablet /
    // Next-Prev path to reach loadDeckOnto for a scripture item.
    expect(source).toMatch(/async function doLoadScripture\([^)]*item\?: ServiceItem \| null[^)]*\)/)
    expect(source).toMatch(/if \(item\) void loadDeckOnto\(track, item, generation\)/)
  })
})
