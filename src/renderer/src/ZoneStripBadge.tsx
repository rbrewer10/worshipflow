import type { ZoneRouting, ZoneMode } from '../../shared/types'

// Tiny truthful visual of a ZoneRouting: Z1 Z2 (back screens), Z3 (lyrics TVs),
// narrow Z4 (stage). Emerald = the item's content is on that screen.
const CELL_COLOR: Record<ZoneMode, string> = {
  lyrics: 'bg-blue-600', text: 'bg-blue-600', countdown: 'bg-blue-600', image: 'bg-blue-600',
  sermon: 'bg-blue-600',
  logo: 'bg-slate-300',
  black: 'bg-slate-800',
  stage: 'bg-slate-500',
  off: 'bg-slate-200 border border-dashed border-slate-400',
}

export default function ZoneStripBadge({ routing, title }: { routing: ZoneRouting; title?: string }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-[2px] align-middle" title={title ?? `Back L: ${routing[1]} · Back R: ${routing[2]} · Lyrics TVs: ${routing[3]} · Stage: ${routing[4]}`}>
      <span className={`h-[10px] w-[15px] rounded-[2px] ${CELL_COLOR[routing[1]]}`} />
      <span className={`h-[10px] w-[15px] rounded-[2px] ${CELL_COLOR[routing[2]]}`} />
      <span className={`h-[10px] w-[15px] rounded-[2px] ${CELL_COLOR[routing[3]]}`} />
      <span className={`h-[10px] w-[9px] rounded-[2px] ${CELL_COLOR[routing[4]]}`} />
    </span>
  )
}
