import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Megaphone } from 'lucide-react'
import type { AnnouncementSummary } from '../../shared/types'

/**
 * Picks the announcements in one block, in the order the pastor reads them.
 *
 * Selection order IS reading order, so this keeps its own ordered array rather
 * than deriving it from the library list. Content itself is owned by the
 * Announcements library — this only chooses and sequences.
 */
export default function AnnouncementItemEditor({
  refId, refIds, onChange, fontScale, onFontScaleChange,
}: {
  refId: number | null
  refIds: number[]
  onChange: (refIds: number[]) => void
  fontScale: number
  onFontScaleChange: (scale: number) => void
}): JSX.Element {
  const [library, setLibrary] = useState<AnnouncementSummary[]>([])

  useEffect(() => {
    void window.wf.announcementsList('').then(setLibrary).catch(() => setLibrary([]))
  }, [])

  // Seeding rule: an existing single-announcement item has no refIds, so fall
  // back to its ref_id. This is what keeps every already-built service
  // rendering exactly as it does today.
  const selected = refIds.length ? refIds : refId != null ? [refId] : []

  const toggle = (id: number): void => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  const move = (index: number, delta: number): void => {
    const next = [...selected]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  const titleOf = (id: number): string => library.find((a) => a.id === id)?.title ?? `#${id}`

  return (
    <div className="space-y-3">
      <div>
        <div className="section-header mb-2 flex items-center gap-1.5">
          <Megaphone size={12} /> Reading order
        </div>
        {selected.length === 0 ? (
          <p className="text-[11px] text-slate-400">Nothing picked yet.</p>
        ) : (
          <ol className="space-y-1">
            {selected.map((id, i) => (
              <li key={id} className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5 text-[12px]">
                <span className="w-4 text-right text-slate-400">{i + 1}</span>
                <span className="flex-1 truncate">{titleOf(id)}</span>
                <button
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  aria-label="Move down"
                  disabled={i === selected.length - 1}
                  onClick={() => move(i, 1)}
                  className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                >
                  <ChevronDown size={14} />
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div>
        <div className="section-header mb-2">Announcements library</div>
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {library.map((a) => (
            <label key={a.id} className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggle(a.id)} />
              <span className="truncate">{a.title}</span>
              {a.expired && <span className="text-[10px] text-amber-600">expired</span>}
            </label>
          ))}
        </div>
      </div>

      <p className="text-[11px] leading-snug text-slate-400">
        {selected.length === 1
          ? 'One announcement.'
          : `${selected.length} announcements — Next walks through them one at a time.`}
        {' '}Edit the text itself in the <b>Announcements</b> tab.
      </p>

      <div className="border-t border-slate-200 pt-3">
        <label htmlFor="announcement-font-size" className="mb-1.5 flex items-center justify-between text-[11px] text-slate-600">
          <span>Font size</span>
          <span className="font-mono text-slate-900">{fontScale} vw</span>
        </label>
        <input id="announcement-font-size" type="range" min={3} max={14} step={0.5}
          value={fontScale}
          onChange={(e) => onFontScaleChange(Number(e.target.value))}
          aria-label="Font size slider from 3 to 14"
          className="w-full accent-blue-600" />
      </div>
    </div>
  )
}
