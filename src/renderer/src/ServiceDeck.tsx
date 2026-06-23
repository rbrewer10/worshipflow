import { useState } from 'react'
import type { ServiceFull, ServiceItem, SongSummary } from '../../shared/types'
import SlideThumb from './SlideThumb'

const ICON: Record<ServiceItem['type'], string> = {
  song: '🎵', scripture: '📖', text: '📝', countdown: '⏱', image: '🖼', welcome: '👋', ticker: '📰'
}

// Songs need a chosen song at creation; other types create empty and are filled in the panel.
const ADD_TYPES: { type: ServiceItem['type']; label: string }[] = [
  { type: 'scripture', label: '📖 Scripture' }, { type: 'text', label: '📝 Text' },
  { type: 'image', label: '🖼 Image' }, { type: 'countdown', label: '⏱ Countdown' },
  { type: 'welcome', label: '👋 Welcome' }, { type: 'ticker', label: '📰 Ticker' }
]

function ServiceDeck({ service, songs, liveItemId, selectedId, onSelect, onAdd, onAddSong, onGoLive, onDelete, onReordered }: {
  service: ServiceFull
  songs: SongSummary[]
  liveItemId: number | null
  selectedId: number | null
  onSelect: (id: number) => void
  onAdd: (type: ServiceItem['type']) => void
  onAddSong: (songId: number) => void
  onGoLive: (item: ServiceItem) => void
  onDelete: (item: ServiceItem) => void
  onReordered: () => void
}): JSX.Element {
  const [dragId, setDragId] = useState<number | null>(null)
  const items = service.items

  const onDrop = (targetId: number): void => {
    if (dragId == null || dragId === targetId) return
    const ids = items.map((i) => i.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    ids.splice(to, 0, ids.splice(from, 1)[0])
    setDragId(null)
    window.wf.serviceReorder(service.id, ids).then(onReordered)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <select
          value=""
          onChange={(e) => { if (e.target.value) onAddSong(Number(e.target.value)) }}
          className="rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1.5 text-xs font-semibold outline-none hover:bg-white/[0.12]"
        >
          <option value="">+ 🎵 Song…</option>
          {songs.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
        {ADD_TYPES.map((a) => (
          <button
            key={a.type}
            onClick={() => onAdd(a.type)}
            className="rounded-lg border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-xs font-semibold hover:bg-white/[0.12]"
          >
            + {a.label}
          </button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-auto pr-1 sm:grid-cols-3">
        {items.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-slate-500">Empty service — add items above.</p>
        )}
        {items.map((it, i) => (
          <div
            key={it.id}
            draggable
            onDragStart={() => setDragId(it.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(it.id)}
            onClick={() => onSelect(it.id)}
            className={`group relative cursor-pointer rounded-lg border p-1.5 transition-colors ${
              selectedId === it.id ? 'border-blue-500 ring-1 ring-blue-500/40' : 'border-white/10 hover:border-white/25'
            } ${dragId === it.id ? 'opacity-50' : ''}`}
          >
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(it) }}
              className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs font-bold text-white/70 opacity-0 transition-opacity hover:bg-red-600 hover:text-white group-hover:opacity-100"
              title="Delete this card"
            >
              ✕
            </button>
            <SlideThumb
              label={it.title || ICON[it.type]}
              itemStyle={it.style}
              serviceTheme={service.theme}
              serviceColors={service.themeColors}
            />
            <div className="mt-1 flex items-center gap-1">
              <span className="w-4 text-center text-[10px] text-slate-500">{i + 1}</span>
              <span className="text-xs">{ICON[it.type]}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">{it.title}</span>
              {liveItemId === it.id ? (
                <span className="text-[10px] font-bold text-emerald-400">● LIVE</span>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); onGoLive(it) }}
                  className="text-[11px] text-slate-500 hover:text-emerald-300"
                  title="Go live"
                >
                  ▶
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ServiceDeck
