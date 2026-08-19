import { Plus, Trash2 } from 'lucide-react'
import type { ZoneId } from '../../../shared/types'
import type { ZoneSlide, ZoneSlot } from '../../../shared/zoneSlides'
import { resolveSlot } from '../../../shared/zoneSlides'

// slideSummary (in shared/zoneSlides.ts) prefers zone 3 (Lyrics TVs), falling
// back to zone 1 — reasonable when zone 3 carries content, but these decks
// hold zone 3 on the logo and zone 1 on a title card that repeats across the
// whole deck. Every slide's label came out as the sermon title. Back Right (2)
// is the screen actually carrying different words on every slide, so it's
// what the strip should read from — Stage (4) as a fallback, title last.
const STRIP_LABEL_ZONES: ZoneId[] = [2, 4, 1]

function stripSlotText(slot: ZoneSlot, source: string[]): string {
  if (slot.kind === 'slide') return source[slot.index ?? -1] ?? ''
  if (slot.kind === 'text') return slot.text ?? ''
  if (slot.kind === 'scripture') return slot.reference ?? ''
  if (slot.kind === 'sermon') return slot.text ?? ''
  return ''
}

function stripLabel(slides: ZoneSlide[], index: number, source: string[]): string {
  for (const zoneId of STRIP_LABEL_ZONES) {
    const text = stripSlotText(resolveSlot(slides, index, zoneId), source)
    if (text) return text
  }
  return ''
}

// The strip of DECK slides — distinct from ZoneSlideFilmstrip, which shows
// the item's raw resolved SOURCE slides. Selecting one here picks which
// deck slide the zone cards and slot editors above are authoring. Fully
// controlled, like ZoneSlideFilmstrip.
export default function ZoneDeckStrip({ slides, source, selected, onSelect, onAdd, onDelete }: {
  slides: ZoneSlide[]
  source: string[]
  selected: number
  onSelect: (index: number) => void
  onAdd: () => void
  onDelete: (index: number) => void
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-content-tertiary">
        {slides.length} slide{slides.length === 1 ? '' : 's'}
      </span>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {slides.map((_slide, i) => (
          <div
            key={i}
            className={`group relative flex h-14 w-24 shrink-0 flex-col justify-between rounded-lg border-2 p-1.5 text-left transition-colors ${
              i === selected ? 'border-blue-500 bg-blue-500/10' : 'border-border bg-panel hover:border-border-strong'
            }`}
          >
            <button onClick={() => onSelect(i)} className="flex-1 text-left">
              <span className="line-clamp-2 text-[9px] leading-tight text-content-secondary">{stripLabel(slides, i, source) || '—'}</span>
            </button>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-semibold text-content-tertiary">{i + 1}</span>
              {slides.length > 1 && (
                <button
                  onClick={() => onDelete(i)}
                  aria-label={`Delete slide ${i + 1}`}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Trash2 size={10} className="text-red-500" />
                </button>
              )}
            </div>
          </div>
        ))}
        <button
          onClick={onAdd}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-border-strong text-content-tertiary hover:border-blue-500/60 hover:text-blue-400"
          aria-label="Add slide"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}
