import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { Music, BookOpen, Type, Timer, Image as ImageIcon, Hand, ScrollText, Megaphone, GripVertical, Play, X, Plus, ListMusic, Mic, FileQuestion, Minus, HelpCircle, Copy } from 'lucide-react'
import type { ServiceFull, ServiceItem, SongSummary, AnnouncementSummary, TrackId } from '../../shared/types'
import { NON_LIVE_TYPES } from '../../shared/types'
import type { SceneConfig } from '../../shared/zoneScenes'
import { effectiveRouting, matchScene } from '../../shared/zoneScenes'
import ZoneStripBadge from './ZoneStripBadge'
import type { ZoneTrackAssignment } from '../../shared/zoneTrack'

type IconType = ComponentType<{ size?: number | string; className?: string }>

const TYPE_ICON: Record<ServiceItem['type'], IconType> = {
  song: Music, scripture: BookOpen, text: Type, countdown: Timer, image: ImageIcon, welcome: Hand, ticker: ScrollText, announcement: Megaphone, sermon: Mic,
  header: Minus, placeholder: HelpCircle
}

const ADD_TYPES: { type: ServiceItem['type']; label: string; Icon: IconType }[] = [
  { type: 'scripture', label: 'Scripture', Icon: BookOpen },
  { type: 'text',      label: 'Text',      Icon: Type },
  { type: 'countdown', label: 'Countdown', Icon: Timer },
  { type: 'image',     label: 'Image/Video', Icon: ImageIcon },
  { type: 'welcome',   label: 'Welcome',   Icon: Hand },
  { type: 'ticker',    label: 'Ticker',    Icon: ScrollText },
  { type: 'sermon',    label: 'Sermon',    Icon: Mic },
  { type: 'header',      label: 'Section header', Icon: Minus },
  { type: 'placeholder', label: 'Placeholder (TBD)', Icon: HelpCircle },
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
  if (it.type === 'sermon') return (p.title as string | undefined) ?? 'Sermon'
  return ''
}

function ServiceDeck({ service, track, onTrackChange, trackAssignment, onTrackAssignmentChange, songs, announcements, liveItemId, selectedId, onSelect, onAdd, onAddSong, onAddAnnouncement, onGoLive, onDelete, onDuplicate, onBatchDelete, onReordered }: {
  service: ServiceFull
  track: TrackId
  onTrackChange: (track: TrackId) => void
  trackAssignment: ZoneTrackAssignment
  onTrackAssignmentChange: (next: ZoneTrackAssignment) => void
  songs: SongSummary[]
  announcements: AnnouncementSummary[]
  liveItemId: number | null
  selectedId: number | null
  onSelect: (id: number) => void
  onAdd: (type: ServiceItem['type']) => void
  onAddSong: (songId: number) => void
  onAddAnnouncement: (announcementId: number) => void
  onGoLive: (item: ServiceItem) => void
  onDelete: (item: ServiceItem) => void
  onDuplicate: (item: ServiceItem) => void
  onBatchDelete: (items: ServiceItem[]) => void
  onReordered: () => void
}): JSX.Element {
  const [dragId, setDragId] = useState<number | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  // Ctrl/Cmd/Shift-click selection for batch move (drag) and batch delete —
  // independent of `selectedId`, which drives the right-side editor panel.
  const [multiSelected, setMultiSelected] = useState<Set<number>>(new Set())
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null)
  const [sceneConfig, setSceneConfig] = useState<SceneConfig | null>(null)
  useEffect(() => { void window.wf.scenesGet().then(setSceneConfig) }, [service])
  const items = service.items.filter((it) => it.track === track)

  const onDrop = (targetId: number): void => {
    if (dragId == null) return
    const ids = items.map((i) => i.id)
    // Dragging a multi-selected row carries the whole selection as a block,
    // in its current relative order — not just the one row under the cursor.
    const movingSet = multiSelected.has(dragId) && multiSelected.size > 1 ? multiSelected : new Set([dragId])
    if (movingSet.has(targetId)) { setDragId(null); return } // dropped inside the block being moved
    const moving = ids.filter((id) => movingSet.has(id))
    const remaining = ids.filter((id) => !movingSet.has(id))
    const targetIndex = remaining.indexOf(targetId)
    remaining.splice(targetIndex, 0, ...moving)
    setDragId(null)
    window.wf.serviceReorder(service.id, track, remaining).then(onReordered)
  }

  // Plain click: normal single-select (opens the editor), clears any multi-
  // selection. Ctrl/Cmd-click: toggle this row in the batch selection.
  // Shift-click: extend the batch selection from the last anchor to this row.
  const handleRowClick = (it: ServiceItem, index: number, e: React.MouseEvent): void => {
    if (e.shiftKey && rangeAnchor != null) {
      const anchorIndex = items.findIndex((x) => x.id === rangeAnchor)
      if (anchorIndex !== -1) {
        const [lo, hi] = anchorIndex < index ? [anchorIndex, index] : [index, anchorIndex]
        const rangeIds = items.slice(lo, hi + 1).map((x) => x.id)
        setMultiSelected((prev) => new Set([...prev, ...rangeIds]))
        return
      }
    }
    if (e.ctrlKey || e.metaKey) {
      setMultiSelected((prev) => {
        const next = new Set(prev)
        if (next.has(it.id)) next.delete(it.id); else next.add(it.id)
        return next
      })
      setRangeAnchor(it.id)
      return
    }
    setMultiSelected(new Set())
    setRangeAnchor(it.id)
    onSelect(it.id)
  }

  // Keyboard equivalent for a row click: just the plain single-select path —
  // shift/ctrl range- and multi-select are mouse-only gestures with no
  // established keyboard convention here, so Enter/Space do the simple thing.
  const handleRowKeyDown = (it: ServiceItem, e: React.KeyboardEvent): void => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    setMultiSelected(new Set())
    setRangeAnchor(it.id)
    onSelect(it.id)
  }

  const batchDelete = (): void => {
    const toDelete = items.filter((it) => multiSelected.has(it.id))
    if (toDelete.length) onBatchDelete(toDelete)
    setMultiSelected(new Set())
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The Main/Second track tabs and the zone-assignment badge used to live
          here. Removed: in the whole production database the second track had
          never held a single item, and its only lasting effect was one service
          left with Back Right pointed at a track that had no content — a dark
          screen with no obvious cause. The engine still has both tracks; there
          is simply no longer a way to route a screen onto the empty one. */}

      {multiSelected.size > 0 && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5">
          <span className="text-xs font-semibold text-indigo-800">{multiSelected.size} selected</span>
          <div className="flex items-center gap-2">
            <button onClick={batchDelete} className="text-xs font-semibold text-red-600 hover:underline">Delete</button>
            <button onClick={() => setMultiSelected(new Set())} className="text-xs font-medium text-indigo-600 hover:underline">Clear</button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto pr-1">
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ListMusic size={28} className="mb-3 text-slate-400" />
            <p className="text-sm text-slate-500">{track === 'main' ? 'Your service is empty' : 'No second-track items yet'}</p>
            <p className="mt-1 text-xs text-slate-400">Click &quot;Add item&quot; below to get started</p>
          </div>
        )}
        {items.map((it, i) => {
          const preview = itemPreview(it)
          // An item whose type this build doesn't know (a row left by a newer
          // branch, say) must not take the whole tab down with an undefined
          // component — fall back to a neutral icon.
          const Icon = TYPE_ICON[it.type] ?? FileQuestion
          const isMultiSelected = multiSelected.has(it.id)
          const nonLive = NON_LIVE_TYPES.includes(it.type)
          const ring = selectedId === it.id
            ? 'border-blue-500/30 bg-blue-500/[0.07] ring-1 ring-blue-500/30'
            : isMultiSelected
            ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-400'
            : 'border-slate-200 bg-white hover:bg-slate-100'

          // Section headers are a compact colored divider, not a content row —
          // no type-line, no preview, no Play button, just the label and delete.
          if (it.type === 'header') {
            const color = (it.payload?.color as string | undefined) ?? '#64748b'
            return (
              <div
                key={it.id}
                role="button"
                tabIndex={0}
                aria-label={`Section: ${it.title || 'Section'}`}
                draggable
                onDragStart={() => setDragId(it.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(it.id)}
                onClick={(e) => handleRowClick(it, i, e)}
                onKeyDown={(e) => handleRowKeyDown(it, e)}
                className={`group mb-1.5 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors ${ring} ${dragId === it.id ? 'opacity-40' : ''}`}
                style={selectedId !== it.id && !isMultiSelected ? { borderColor: color + '55', background: color + '14' } : undefined}
              >
                <GripVertical size={13} className="shrink-0 text-slate-400 group-hover:text-slate-600" />
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                <span className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-wide" style={{ color }}>
                  {it.title || 'Section'}
                </span>
                {/* onClick here only keeps the row's own onClick from firing when duplicating/deleting — not a user-facing interaction itself. */}
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                <div className="flex flex-shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => onDuplicate(it)} className="text-slate-400 opacity-0 hover:text-blue-700 group-hover:opacity-100" title="Duplicate"><Copy size={13} /></button>
                  <button onClick={() => onDelete(it)} className="text-slate-400 opacity-0 hover:text-red-600 group-hover:opacity-100" title="Delete"><X size={14} /></button>
                </div>
              </div>
            )
          }

          return (
            <div
              key={it.id}
              role="button"
              tabIndex={0}
              aria-label={`${it.type}: ${it.title || it.type}`}
              draggable
              onDragStart={() => setDragId(it.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(it.id)}
              onClick={(e) => handleRowClick(it, i, e)}
              onKeyDown={(e) => handleRowKeyDown(it, e)}
              className={`group mb-1.5 flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                it.type === 'placeholder' && selectedId !== it.id && !isMultiSelected ? 'border-dashed border-amber-300 bg-amber-50/40' : ring
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
                <div className="flex items-center gap-1.5 truncate text-xs text-slate-600">
                  {it.type === 'placeholder' && (
                    <span className="shrink-0 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">TBD</span>
                  )}
                  <span className="truncate">{it.type} · #{i + 1}{preview ? ` · ${preview}` : ''}</span>
                  {sceneConfig && !nonLive && (() => {
                    const routing = effectiveRouting(it, sceneConfig)
                    const matched = matchScene(routing, it.type, sceneConfig)
                    const name = matched === 'custom' ? 'Custom' : sceneConfig.scenes.find((s) => s.id === matched)?.name
                    return (
                      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-slate-400">
                        <ZoneStripBadge routing={routing} title={name} />
                      </span>
                    )
                  })()}
                </div>
              </div>
              {/* onClick here only keeps the row's own onClick from firing when using these controls — not a user-facing interaction itself. */}
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
              <div className="flex flex-shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {liveItemId === it.id ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    LIVE
                  </span>
                ) : (
                  <>
                    {!nonLive && (
                      <button
                        onClick={() => onGoLive(it)}
                        className="text-slate-400 opacity-0 hover:text-blue-700 group-hover:opacity-100"
                        title="Go live"
                      ><Play size={14} /></button>
                    )}
                    <button
                      onClick={() => onDuplicate(it)}
                      className="text-slate-400 opacity-0 hover:text-blue-700 group-hover:opacity-100"
                      title="Duplicate"
                    ><Copy size={13} /></button>
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
            <label htmlFor="deck-add-song" className="mb-1.5 block text-xs font-semibold text-slate-600">Song from library</label>
            <select
              id="deck-add-song"
              value=""
              onChange={(e) => { if (e.target.value) { onAddSong(Number(e.target.value)); setShowAdd(false) } }}
              className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-900 outline-none hover:bg-slate-200"
            >
              <option value="">Choose a song…</option>
              {songs.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>
          {announcements.length > 0 && (
            <div className="mb-3">
              <label htmlFor="deck-add-announcement" className="mb-1.5 block text-xs font-semibold text-slate-600">Announcement from library</label>
              <select
                id="deck-add-announcement"
                value=""
                onChange={(e) => { if (e.target.value) { onAddAnnouncement(Number(e.target.value)); setShowAdd(false) } }}
                className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-900 outline-none hover:bg-slate-200"
              >
                <option value="">Choose an announcement…</option>
                {announcements.map((a) => <option key={a.id} value={a.id}>{a.title}{a.expired ? ' (expired)' : ''}</option>)}
              </select>
            </div>
          )}
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
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-blue-500/50 hover:text-blue-700"
        >
          <Plus size={15} /> Add item
        </button>
      )}
    </div>
  )
}

export default ServiceDeck
