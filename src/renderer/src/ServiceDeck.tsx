import { useState } from 'react'
import type { ServiceFull, ServiceItem, SongSummary } from '../../shared/types'

const TYPE_ICON: Record<ServiceItem['type'], string> = {
  song: '🎵', scripture: '📖', text: '📝', countdown: '⏱', image: '🖼', welcome: '👋', ticker: '📰'
}

const TYPE_BADGE: Record<ServiceItem['type'], string> = {
  song:       'bg-blue-500/15 text-blue-300',
  scripture:  'bg-pink-500/15 text-pink-300',
  text:       'bg-white/10 text-slate-400',
  countdown:  'bg-orange-500/15 text-orange-300',
  image:      'bg-emerald-500/15 text-emerald-300',
  welcome:    'bg-violet-500/15 text-violet-300',
  ticker:     'bg-white/10 text-slate-400',
}

const ADD_TYPES: { type: ServiceItem['type']; label: string; cls: string }[] = [
  { type: 'scripture', label: '📖 Scripture', cls: 'border-pink-500/30 bg-pink-500/10 text-pink-300 hover:bg-pink-500/20' },
  { type: 'text',      label: '📝 Text',      cls: 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10' },
  { type: 'countdown', label: '⏱ Countdown', cls: 'border-orange-500/30 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20' },
  { type: 'image',     label: '🖼 Image',     cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20' },
  { type: 'welcome',   label: '👋 Welcome',   cls: 'border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20' },
  { type: 'ticker',    label: '📰 Ticker',    cls: 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10' },
]

function itemPreview(it: ServiceItem): string {
  const p = it.payload ?? {}
  if (it.type === 'text') {
    const body = (p.body as string | undefined) ?? ''
    return body ? body.slice(0, 50) + (body.length > 50 ? '…' : '') : ''
  }
  if (it.type === 'scripture') return (p.reference as string | undefined) ?? ''
  if (it.type === 'countdown' || it.type === 'welcome') {
    const secs = (p.seconds as number | undefined) ?? 300
    const mins = Math.round(secs / 60)
    return `${mins} minute${mins !== 1 ? 's' : ''}`
  }
  if (it.type === 'ticker') return (p.text as string | undefined)?.slice(0, 50) ?? ''
  return ''
}

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
  const [showAdd, setShowAdd] = useState(false)
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
      <div className="min-h-0 flex-1 overflow-auto pr-1">
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-2 text-3xl">📋</div>
            <p className="text-sm text-slate-500">Your service is empty</p>
            <p className="mt-1 text-xs text-slate-600">Click &quot;+ Add item&quot; below to get started</p>
          </div>
        )}
        {items.map((it, i) => {
          const preview = itemPreview(it)
          return (
            <div
              key={it.id}
              draggable
              onDragStart={() => setDragId(it.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(it.id)}
              onClick={() => onSelect(it.id)}
              className={`group mb-1.5 flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                selectedId === it.id
                  ? 'border-indigo-500/30 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                  : 'border-white/[0.07] bg-[#15151a] hover:bg-white/[0.05]'
              } ${dragId === it.id ? 'opacity-40' : ''}`}
            >
              <div className="flex w-5 flex-shrink-0 flex-col items-center">
                <span className="text-[11px] leading-none text-slate-600 group-hover:text-slate-400">⋮⋮</span>
              </div>
              <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sm ${TYPE_BADGE[it.type]}`}>
                {TYPE_ICON[it.type]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-white">{it.title || it.type}</div>
                <div className="truncate text-xs text-slate-400">
                  {it.type} · #{i + 1}{preview ? ` · ${preview}` : ''}
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {liveItemId === it.id ? (
                  <span className="text-[10px] font-bold text-emerald-400">● LIVE</span>
                ) : (
                  <>
                    <button
                      onClick={() => onGoLive(it)}
                      className="text-xs text-slate-600 opacity-0 hover:text-emerald-400 group-hover:opacity-100"
                      title="Go live"
                    >▶</button>
                    <button
                      onClick={() => onDelete(it)}
                      className="text-xs text-slate-600 opacity-0 hover:text-red-400 group-hover:opacity-100"
                      title="Delete"
                    >✕</button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {showAdd ? (
        <div className="mt-2 rounded-xl border border-white/[0.07] bg-[#15151a] p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">What do you want to add?</span>
            <button onClick={() => setShowAdd(false)} className="text-xs text-slate-500 hover:text-slate-300">✕ Close</button>
          </div>
          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-semibold text-slate-400">Song from library</label>
            <select
              value=""
              onChange={(e) => { if (e.target.value) { onAddSong(Number(e.target.value)); setShowAdd(false) } }}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none hover:bg-black/40"
            >
              <option value="">🎵 Choose a song…</option>
              {songs.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>
          <div className="mb-1.5 text-xs font-semibold text-slate-400">Or add another item type</div>
          <div className="grid grid-cols-3 gap-2">
            {ADD_TYPES.map((a) => (
              <button
                key={a.type}
                onClick={() => { onAdd(a.type); setShowAdd(false) }}
                className={`rounded-lg border px-3 py-2.5 text-center text-xs font-semibold transition-colors ${a.cls}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-500/40 py-3 text-sm font-semibold text-indigo-400 transition-colors hover:border-indigo-500/60 hover:bg-indigo-500/5"
        >
          + Add item
        </button>
      )}
    </div>
  )
}

export default ServiceDeck
