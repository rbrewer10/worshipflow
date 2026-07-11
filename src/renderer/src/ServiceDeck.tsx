import { useState } from 'react'
import type { ComponentType } from 'react'
import { Music, BookOpen, Type, Timer, Image as ImageIcon, Hand, ScrollText, Megaphone, GripVertical, Play, X, Plus, ListMusic } from 'lucide-react'
import type { ServiceFull, ServiceItem, SongSummary } from '../../shared/types'

type IconType = ComponentType<{ size?: number | string; className?: string }>

const TYPE_ICON: Record<ServiceItem['type'], IconType> = {
  song: Music, scripture: BookOpen, text: Type, countdown: Timer, image: ImageIcon, welcome: Hand, ticker: ScrollText, announcement: Megaphone
}

const ADD_TYPES: { type: ServiceItem['type']; label: string; Icon: IconType }[] = [
  { type: 'scripture', label: 'Scripture', Icon: BookOpen },
  { type: 'text',      label: 'Text',      Icon: Type },
  { type: 'countdown', label: 'Countdown', Icon: Timer },
  { type: 'image',     label: 'Image/Video', Icon: ImageIcon },
  { type: 'welcome',   label: 'Welcome',   Icon: Hand },
  { type: 'ticker',    label: 'Ticker',    Icon: ScrollText },
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
            <ListMusic size={28} className="mb-3 text-slate-400" />
            <p className="text-sm text-slate-500">Your service is empty</p>
            <p className="mt-1 text-xs text-slate-400">Click &quot;Add item&quot; below to get started</p>
          </div>
        )}
        {items.map((it, i) => {
          const preview = itemPreview(it)
          const Icon = TYPE_ICON[it.type]
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
                  ? 'border-emerald-500/30 bg-emerald-500/[0.07] ring-1 ring-emerald-500/30'
                  : 'border-slate-200 bg-white hover:bg-slate-100'
              } ${dragId === it.id ? 'opacity-40' : ''}`}
            >
              <div className="flex w-5 flex-shrink-0 flex-col items-center">
                <GripVertical size={13} className="text-slate-400 group-hover:text-slate-600" />
              </div>
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <Icon size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">{it.title || it.type}</div>
                <div className="truncate text-xs text-slate-600">
                  {it.type} · #{i + 1}{preview ? ` · ${preview}` : ''}
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {liveItemId === it.id ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    LIVE
                  </span>
                ) : (
                  <>
                    <button
                      onClick={() => onGoLive(it)}
                      className="text-slate-400 opacity-0 hover:text-emerald-700 group-hover:opacity-100"
                      title="Go live"
                    ><Play size={14} /></button>
                    <button
                      onClick={() => onDelete(it)}
                      className="text-slate-400 opacity-0 hover:text-red-600 group-hover:opacity-100"
                      title="Delete"
                    ><X size={14} /></button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {showAdd ? (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900">What do you want to add?</span>
            <button onClick={() => setShowAdd(false)} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
              <X size={12} /> Close
            </button>
          </div>
          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Song from library</label>
            <select
              value=""
              onChange={(e) => { if (e.target.value) { onAddSong(Number(e.target.value)); setShowAdd(false) } }}
              className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-900 outline-none hover:bg-slate-200"
            >
              <option value="">Choose a song…</option>
              {songs.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>
          <div className="mb-1.5 text-xs font-semibold text-slate-600">Or add another item type</div>
          <div className="grid grid-cols-3 gap-2">
            {ADD_TYPES.map((a) => (
              <button
                key={a.type}
                onClick={() => { onAdd(a.type); setShowAdd(false) }}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                <a.Icon size={13} />
                {a.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-emerald-500/50 hover:text-emerald-700"
        >
          <Plus size={15} /> Add item
        </button>
      )}
    </div>
  )
}

export default ServiceDeck
