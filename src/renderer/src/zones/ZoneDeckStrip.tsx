import { Plus, Trash2 } from 'lucide-react'
import type { ZoneSlide } from '../../../shared/zoneSlides'
import { slideSummary } from '../../../shared/zoneSlides'

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
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {slides.length} slide{slides.length === 1 ? '' : 's'}
      </span>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {slides.map((slide, i) => (
          <div
            key={i}
            className={`group relative flex h-14 w-24 shrink-0 flex-col justify-between rounded-lg border-2 p-1.5 text-left transition-colors ${
              i === selected ? 'border-blue-500 bg-blue-500/10' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <button onClick={() => onSelect(i)} className="flex-1 text-left">
              <span className="line-clamp-2 text-[9px] leading-tight text-slate-600">{slideSummary(slide, source) || '—'}</span>
            </button>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-semibold text-slate-400">{i + 1}</span>
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
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600"
          aria-label="Add slide"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}
