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
import { parseReferenceList } from '../shared/scriptureRefs'

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

  // Intro slide: the message title on BOTH back screens and no verses yet. The
  // sermon starts by announcing itself, and jumping straight into verse 1 gave
  // the room no moment to see what the message even is. Next begins the reading.
  const introCard: ZoneSlot = { kind: 'sermon', text: title, reference: passage }
  const intro = slide(introCard, introCard, LOGO, introCard)

  const reading = ranges.map((range) => {
    const reference = subReference(result.reference ?? passage, range.from, range.to)
    const verse: ZoneSlot = { kind: 'scripture', reference }
    // Back Left keeps the designed card up and moves its reference along with
    // the reading; the stage monitor carries the same words the pastor reads.
    return slide({ kind: 'sermon', text: title, reference }, verse, LOGO, verse)
  })

  return [intro, ...reading]
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

async function scriptureDeck(item: ServiceItem, deps: AutoDeckDeps): Promise<ZoneSlide[] | null> {
  const references = parseReferenceList((item.payload.reference as string | undefined) ?? '')
  if (!references.length) return null

  const slides: ZoneSlide[] = []
  for (const reference of references) {
    const result = await deps.lookupScripture(reference)
    // One bad reference in a reading must not lose the passages either side of
    // it — the same "a deleted announcement drops out, the rest still works"
    // contract announcementDeck uses.
    if (!result.ok || !result.verses?.length) continue

    for (const range of chunkVerses(result.verses, deps.budget)) {
      const ref = subReference(result.reference ?? reference, range.from, range.to)
      const verse: ZoneSlot = { kind: 'scripture', reference: ref }
      // Back Left carries the reference on its own, so the room can always see
      // where the reading is even once the text has scrolled on. Unlike the
      // sermon deck, the Lyrics TVs get the verse rather than the logo: that is
      // the screen the congregation actually reads scripture from, and blanking
      // it during a reading is the exact mistake computeZoneStates already had
      // to fix once for Quick Scripture.
      slides.push(slide({ kind: 'text', text: ref }, verse, verse, verse))
    }
  }

  return slides.length ? slides : null
}

export async function autoDeckFor(item: ServiceItem, deps: AutoDeckDeps): Promise<ZoneSlide[] | null> {
  if (item.type === 'sermon') return sermonDeck(item, deps)
  if (item.type === 'scripture') return scriptureDeck(item, deps)
  if (item.type === 'announcement') return announcementDeck(item, deps)
  return null
}
