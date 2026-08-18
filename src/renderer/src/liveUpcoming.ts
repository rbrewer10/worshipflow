import type { ServiceItem, TrackId } from '../../shared/types'
import { canGoLive } from './liveActions'

export interface UpcomingSlide {
  itemId: number
  itemTitle: string
  slideIndex: number
  text: string
}

// Flattens every go-live-able item's slides (in service order, current track
// only) into one sequence, finds where the live cursor currently sits in that
// sequence, and returns the next two entries — crossing item boundaries
// transparently. This is the client-side equivalent of what a "next slide"
// preview means once you stop thinking item-by-item and start thinking of the
// whole service as one long deck, which is exactly the mental model the
// CURRENT/NEXT/AFTER-NEXT triptych is asking the operator to adopt.
export function resolveUpcoming(
  items: ServiceItem[],
  track: TrackId,
  slidesByItemId: Record<number, string[]>,
  liveItemId: number | null,
  liveIndex: number
): { next: UpcomingSlide | null; afterNext: UpcomingSlide | null } {
  const eligible = items.filter((it) => it.track === track).filter(canGoLive)

  const flat: UpcomingSlide[] = []
  for (const it of eligible) {
    // Same fallback SlideGrid.tsx uses when an item's slides haven't loaded
    // yet (or genuinely has none) — one empty-text slot rather than skipping
    // the item entirely, so the flat sequence's indices still line up with
    // what SlideGrid/the live engine consider "slide 0" of that item.
    const rawSlides = slidesByItemId[it.id]
    const slides = rawSlides && rawSlides.length > 0 ? rawSlides : ['']
    slides.forEach((text, slideIndex) => {
      flat.push({ itemId: it.id, itemTitle: it.title, slideIndex, text })
    })
  }

  if (liveItemId == null) {
    // Nothing live yet: "next" is the very first eligible slide in the
    // service, "after next" the one after that — lets the triptych show a
    // useful preview before the operator has pressed anything.
    return { next: flat[0] ?? null, afterNext: flat[1] ?? null }
  }

  const pos = flat.findIndex((s) => s.itemId === liveItemId && s.slideIndex === liveIndex)
  if (pos === -1) {
    // The live item/slide isn't in this track's eligible flat sequence at all
    // (e.g. it went live from a source this function doesn't see, or the
    // service changed underneath it) — nothing meaningful to preview rather
    // than guessing.
    return { next: null, afterNext: null }
  }

  return { next: flat[pos + 1] ?? null, afterNext: flat[pos + 2] ?? null }
}
