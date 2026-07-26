// Authored per-slide, per-zone content for an item. Pure module: no DB, no
// Electron. A deck lets one slide show different things on different screens —
// e.g. Back Left holding a sermon title while Back Right cycles verses.

import type { ZoneId } from './types'

export type ZoneSlotKind = 'slide' | 'text' | 'scripture' | 'logo' | 'black' | 'image' | 'same'

export interface ZoneSlot {
  kind: ZoneSlotKind
  index?: number      // kind 'slide' — into the item's own resolved source slides
  text?: string       // kind 'text'
  reference?: string  // kind 'scripture'
  path?: string       // kind 'image'
}

export interface ZoneSlide {
  zones: Record<ZoneId, ZoneSlot>
}

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]
const KINDS: ZoneSlotKind[] = ['slide', 'text', 'scripture', 'logo', 'black', 'image', 'same']

const BLACK: ZoneSlot = { kind: 'black' }

// 'same' means "hold whatever this screen showed on the previous slide", so a
// sermon title spanning six slides is authored once. Resolution walks back to
// the nearest real slot; nothing before it means there is nothing to hold, so
// the screen goes black rather than rendering an undefined slot.
export function resolveSlot(slides: ZoneSlide[], index: number, zoneId: ZoneId): ZoneSlot {
  if (index < 0 || index >= slides.length) return BLACK
  for (let i = index; i >= 0; i--) {
    const slot = slides[i]?.zones?.[zoneId]
    if (!slot) return BLACK
    if (slot.kind !== 'same') return slot
  }
  return BLACK
}

// `source` is the item's own resolved slides — a 'slide' slot is just an index
// into them, so the deck stays in sync when the underlying item is edited.
function slotText(slot: ZoneSlot | undefined, source: string[] = []): string {
  if (!slot) return ''
  if (slot.kind === 'slide') return source[slot.index ?? -1] ?? ''
  if (slot.kind === 'text') return slot.text ?? ''
  if (slot.kind === 'scripture') return slot.reference ?? ''
  return ''
}

// The one-line label for this slide in the slide grid and the Live tab rail.
// Zone 3 (Lyrics TVs) wins because it is the screen the congregation reads.
export function slideSummary(slide: ZoneSlide, source: string[] = []): string {
  const preferred = slotText(slide.zones?.[3], source)
  if (preferred) return preferred
  for (const zoneId of ZONE_IDS) {
    const text = slotText(slide.zones?.[zoneId], source)
    if (text) return text
  }
  return ''
}

export function validateZoneSlides(value: unknown): value is ZoneSlide[] {
  if (!Array.isArray(value) || value.length === 0) return false
  for (const slide of value) {
    if (typeof slide !== 'object' || slide === null) return false
    const zones = (slide as ZoneSlide).zones
    if (typeof zones !== 'object' || zones === null) return false
    for (const zoneId of ZONE_IDS) {
      const slot = zones[zoneId]
      if (typeof slot !== 'object' || slot === null) return false
      if (!KINDS.includes(slot.kind)) return false
    }
  }
  return true
}

// Never throws; anything unusable means "no deck", and the caller falls back to
// the item's normal single-content behaviour.
export function parseZoneSlides(json: string | null): ZoneSlide[] | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json)
    return validateZoneSlides(parsed) ? parsed : null
  } catch {
    return null
  }
}
