// Every slide this item will produce, as a clickable strip. Selecting one
// renders it across the four zone screens above, so a long passage can be
// checked slide by slide without going live. Fully controlled.
export default function ZoneSlideFilmstrip({ slides, selected, onSelect }: {
  slides: string[]
  selected: number
  onSelect: (index: number) => void
}): JSX.Element {
  if (slides.length <= 1) return <></>
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {slides.length} slides
      </span>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {slides.map((text, i) => (
          <button
            key={i}
            onClick={() => onSelect(i)}
            title={text}
            className={`flex h-14 w-24 shrink-0 flex-col justify-between rounded-lg border-2 p-1.5 text-left transition-colors ${
              i === selected ? 'border-blue-500 bg-blue-500/10' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <span className="line-clamp-2 text-[9px] leading-tight text-slate-600">{text}</span>
            <span className="text-[9px] font-semibold text-slate-400">{i + 1}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
