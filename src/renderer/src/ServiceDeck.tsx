import { useState } from 'react'
import type { ServiceFull, ServiceItem, SongSummary } from '../../shared/types'

const TYPE_ICON: Record<ServiceItem['type'], string> = {
  song: '🎵', scripture: '📖', text: '📝', countdown: '⏱', image: '🖼', welcome: '👋', ticker: '📰'
}

const TYPE_BADGE: Record<ServiceItem['type'], string> = {
  song:       'bg-blue-50 text-blue-700',
  scripture:  'bg-pink-50 text-pink-700',
  text:       'bg-gray-100 text-gray-600',
  countdown:  'bg-orange-50 text-orange-700',
  image:      'bg-emerald-50 text-emerald-700',
  welcome:    'bg-violet-50 text-violet-700',
  ticker:     'bg-gray-100 text-gray-600',
}

const ADD_TYPES: { type: ServiceItem['type']; label: string; cls: string }[] = [
  { type: 'scripture', label: '📖 Scripture', cls: 'border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100' },
  { type: 'text',      label: '📝 Text',      cls: 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100' },
  { type: 'countdown', label: '⏱ Countdown', cls: 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100' },
  { type: 'image',     label: '🖼 Image',     cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
  { type: 'welcome',   label: '👋 Welcome',   cls: 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100' },
  { type: 'ticker',    label: '📰 Ticker',    cls: 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100' },
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
            <p className="text-sm text-gray-500">Your service is empty</p>
            <p className="mt-1 text-xs text-gray-400">Click &quot;+ Add item&quot; below to get started</p>
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
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              } ${dragId === it.id ? 'opacity-40' : ''}`}
            >
              <div className="flex w-5 flex-shrink-0 flex-col items-center">
                <span className="text-[11px] leading-none text-gray-300 group-hover:text-gray-400">⋮⋮</span>
              </div>
              <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sm ${TYPE_BADGE[it.type]}`}>
                {TYPE_ICON[it.type]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-gray-900">{it.title || it.type}</div>
                <div className="truncate text-xs text-gray-400">
                  {it.type} · #{i + 1}{preview ? ` · ${preview}` : ''}
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {liveItemId === it.id ? (
                  <span className="text-[10px] font-bold text-emerald-600">● LIVE</span>
                ) : (
                  <>
                    <button
                      onClick={() => onGoLive(it)}
                      className="text-xs text-gray-300 opacity-0 hover:text-emerald-600 group-hover:opacity-100"
                      title="Go live"
                    >▶</button>
                    <button
                      onClick={() => onDelete(it)}
                      className="text-xs text-gray-300 opacity-0 hover:text-red-500 group-hover:opacity-100"
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
        <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">What do you want to add?</span>
            <button onClick={() => setShowAdd(false)} className="text-xs text-gray-400 hover:text-gray-600">✕ Close</button>
          </div>
          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">Song from library</label>
            <select
              value=""
              onChange={(e) => { if (e.target.value) { onAddSong(Number(e.target.value)); setShowAdd(false) } }}
              className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 outline-none hover:bg-blue-100"
            >
              <option value="">🎵 Choose a song…</option>
              {songs.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>
          <div className="mb-1.5 text-xs font-semibold text-gray-500">Or add another item type</div>
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
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 py-3 text-sm font-semibold text-blue-600 transition-colors hover:border-blue-400 hover:bg-blue-50"
        >
          + Add item
        </button>
      )}
    </div>
  )
}

export default ServiceDeck
