/**
 * Builds a zone deck from a service item, so a sermon reading or an
 * announcement block lays itself out without weekly authoring.
 *
 * Dependencies are injected rather than imported: this needs a scripture lookup
 * and the announcements table, and taking them as arguments keeps the module
 * testable without a network or a database.
 *
 * Returning null means "no generated deck" — the item then behaves exactly as it
 * did before this feature existed. That is the safe outcome for every failure.
 */
import type { ScriptureResult, ServiceItem, ZoneId } from '../shared/types'
import type { ZoneSlide, ZoneSlot } from '../shared/zoneSlides'
import { chunkProse, chunkVerses } from '../shared/chunkText'

export interface AutoDeckAnnouncement {
  id: number
  title: string
  body: string
}

export interface AutoDeckDeps {
  budget: number
  lookupScripture: (reference: string) => Promise<ScriptureResult>
  getAnnouncement: (id: number) => Promise<AutoDeckAnnouncement | null>
}

const LOGO: ZoneSlot = { kind: 'logo' }

function slide(z1: ZoneSlot, z2: ZoneSlot, z3: ZoneSlot, z4: ZoneSlot): ZoneSlide {
  return { zones: { 1: z1, 2: z2, 3: z3, 4: z4 } as Record<ZoneId, ZoneSlot> }
}

/** "John 3" from "John 3:16-18" — the book/chapter part a sub-reference reuses. */
function bookChapter(reference: string): string | null {
  const match = reference.match(/^(.*?)\s*:\s*\d/)
  return match ? match[1].trim() : null
}

function subReference(reference: string, from: number, to: number): string {
  const base = bookChapter(reference)
  if (!base) return reference
  return from === to ? `${base}:${from}` : `${base}:${from}-${to}`
}

async function sermonDeck(item: ServiceItem, deps: AutoDeckDeps): Promise<ZoneSlide[] | null> {
  const passage = (item.payload.passage as string | undefined)?.trim()
  if (!passage) return null

  const result = await deps.lookupScripture(passage)
  if (!result.ok || !result.verses?.length) return null

  const title = ((item.payload.title as string | undefined) || item.title || '').trim()
  const ranges = chunkVerses(result.verses, deps.budget)
  if (!ranges.length) return null

  return ranges.map((range) => {
    const reference = subReference(result.reference ?? passage, range.from, range.to)
    const verse: ZoneSlot = { kind: 'scripture', reference }
    // Back Left keeps the designed card up and moves its reference along with
    // the reading; the stage monitor carries the same words the pastor reads.
    return slide({ kind: 'sermon', text: title, reference }, verse, LOGO, verse)
  })
}

async function announcementDeck(item: ServiceItem, deps: AutoDeckDeps): Promise<ZoneSlide[] | null> {
  // Deliberately NOT falling back to item.ref_id. Every announcement item ever
  // built has a ref_id and no refIds, so honouring it here would silently
  // re-lay-out every existing service the first time this shipped. A block is
  // opt-in: it exists once the operator has picked announcements in the editor.
  const fromPayload = item.payload.refIds
  const ids = Array.isArray(fromPayload)
    ? fromPayload.filter((n): n is number => typeof n === 'number')
    : []
  if (!ids.length) return null

  const slides: ZoneSlide[] = []
  for (const id of ids) {
    const announcement = await deps.getAnnouncement(id)
    // A deleted announcement drops out; the rest of the block still works.
    if (!announcement) continue
    for (const chunk of chunkProse(announcement.body ?? '', deps.budget)) {
      const text: ZoneSlot = { kind: 'text', text: chunk }
      // The heading is authored once and held by 'same' for the whole block.
      const heading: ZoneSlot = slides.length === 0
        ? { kind: 'text', text: 'Announcements' }
        : { kind: 'same' }
      slides.push(slide(heading, text, LOGO, text))
    }
  }
  return slides.length ? slides : null
}

export async function autoDeckFor(item: ServiceItem, deps: AutoDeckDeps): Promise<ZoneSlide[] | null> {
  if (item.type === 'sermon') return sermonDeck(item, deps)
  if (item.type === 'announcement') return announcementDeck(item, deps)
  return null
}
