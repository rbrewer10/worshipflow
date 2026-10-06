import { describe, expect, it } from 'vitest'
import type { ServiceFull, SongSummary } from '../../shared/types'
import { computeServiceReadiness } from './serviceReadiness'

const songs: SongSummary[] = [{ id: 1, title: 'Amazing Grace', author: null, background: null }]

function service(overrides: Partial<ServiceFull> = {}): ServiceFull {
  return {
    id: 1,
    name: 'Sunday Worship',
    service_date: '2026-08-23',
    theme: null,
    themeColors: null,
    team: { people: [], assignments: {} },
    items: [{ id: 1, ordinal: 1, type: 'song', ref_id: 1, payload: {}, title: 'Amazing Grace', notes: null, style: null, zoneRouting: null, track: 'main' }],
    ...overrides
  }
}

describe('computeServiceReadiness', () => {
  it('blocks publishing an undated service with placeholders', () => {
    const result = computeServiceReadiness(service({ service_date: null, items: [{ id: 4, ordinal: 1, type: 'placeholder', ref_id: null, payload: { label: 'Opening' }, title: 'Opening', notes: null, style: null, zoneRouting: null, track: 'main' }] }), songs)
    expect(result.ready).toBe(false)
    expect(result.blocking.map((issue) => issue.id)).toEqual(expect.arrayContaining(['date', 'placeholder-4']))
  })

  it('allows a complete plan to publish while surfacing non-blocking guidance', () => {
    const result = computeServiceReadiness(service({ team: { people: [{ id: 'p1', name: 'Jordan', role: 'Worship leader', status: 'confirmed' }], assignments: {} } }), songs)
    expect(result.ready).toBe(true)
    expect(result.warnings.map((issue) => issue.id)).toContain('background-1')
  })

  // QA B2-N1: a picture the projector can't load must not pass review silently.
  it('blocks an image item whose file is missing or outside the media folder', () => {
    const img = (id: number, mediaProblem?: 'missing' | 'outside') => ({ id, ordinal: id, type: 'image' as const, ref_id: null, payload: { path: `/home/me/Pictures/p${id}.jpg` }, title: `Photo ${id}`, notes: null, style: null, zoneRouting: null, track: 'main' as const, mediaProblem })
    const result = computeServiceReadiness(service({ items: [img(1, 'outside'), img(2, 'missing'), img(3)] }), songs)
    expect(result.blocking.map((i) => i.id)).toEqual(expect.arrayContaining(['media-1', 'media-2']))
    expect(result.issues.map((i) => i.id)).not.toContain('media-3')
    expect(result.blocking.find((i) => i.id === 'media-2')?.label).toMatch(/Re-link/)
  })
})

describe('QA B4-N1: a reference that won\'t resolve blocks publishing', () => {
  const scripture = (reference: string): ServiceFull['items'][number] => ({ id: 7, ordinal: 2, type: 'scripture', ref_id: null, payload: { reference }, title: reference, notes: null, style: null, zoneRouting: null, track: 'main' })
  const team = { people: [{ id: 'p1', name: 'Jordan', role: 'Worship leader', status: 'confirmed' as const }], assignments: {} }

  it.each(['Mark 4:35–41', 'Psalm 23-24', 'John 3:35-4:3', 'Psalm 23, 24', 'Jude 3', 'John 3:16; Romans 8:1'])('%s is fine', (ref) => {
    expect(computeServiceReadiness(service({ team, items: [scripture(ref)] }), songs).ready).toBe(true)
  })

  it.each([
    ['Hezekiah 4:1', /Unknown book/],
    ['Psalm 151', /no chapter 151/],
    ['John 3:16-14', /backwards/],
    ['Romans', /Add a chapter/],
    ['John 3:16 (KJV) extra words', /Could not read|Unknown book/],
  ])('%s blocks with the reason', (ref, why) => {
    const r = computeServiceReadiness(service({ team, items: [scripture(ref)] }), songs)
    expect(r.ready).toBe(false)
    expect(r.blocking[0].label).toContain(ref)
    expect(r.blocking[0].detail).toMatch(why)
  })

  it('one bad passage in a multi-passage reading is named on its own', () => {
    const r = computeServiceReadiness(service({ team, items: [scripture('John 3:16; Hezekiah 1:1; Psalm 23')] }), songs)
    expect(r.blocking.map((i) => i.label)).toEqual(['Fix the reference “Hezekiah 1:1”'])
  })

  it('a sermon passage that won\'t resolve is a warning (the card still shows)', () => {
    const r = computeServiceReadiness(service({ team, items: [{ id: 9, ordinal: 3, type: 'sermon', ref_id: null, payload: { title: 'Hope', passage: 'Hezekiah 4' }, title: 'Hope', notes: null, style: null, zoneRouting: null, track: 'main' }] }), songs)
    expect(r.ready).toBe(true)
    expect(r.warnings.map((i) => i.id)).toContain('sermon-ref-9')
  })
})
