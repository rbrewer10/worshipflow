import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { Music, BookOpen, Type, Timer, Image as ImageIcon, Hand, ScrollText, Megaphone, GripVertical, Play, X, Plus, ListMusic, Mic, FileQuestion } from 'lucide-react'
import type { ServiceFull, ServiceItem, SongSummary, AnnouncementSummary, TrackId, ZoneId } from '../../shared/types'
import { ZONE_NAMES } from '../../shared/types'
import type { SceneConfig } from '../../shared/zoneScenes'
import { effectiveRouting, matchScene } from '../../shared/zoneScenes'
import ZoneStripBadge from './ZoneStripBadge'
import type { ZoneTrackAssignment } from '../../shared/zoneTrack'
import ZoneTrackStripBadge from './ZoneTrackStripBadge'
import ZoneTrackToggle from './ZoneTrackToggle'

type IconType = ComponentType<{ size?: number | string; className?: string }>

const TYPE_ICON: Record<ServiceItem['type'], IconType> = {
  song: Music, scripture: BookOpen, text: Type, countdown: Timer, image: ImageIcon, welcome: Hand, ticker: ScrollText, announcement: Megaphone, sermon: Mic
}

const ADD_TYPES: { type: ServiceItem['type']; label: string; Icon: IconType }[] = [
  { type: 'scripture', label: 'Scripture', Icon: BookOpen },
  { type: 'text',      label: 'Text',      Icon: Type },
  { type: 'countdown', label: 'Countdown', Icon: Timer },
  { type: 'image',     label: 'Image/Video', Icon: ImageIcon },
  { type: 'welcome',   label: 'Welcome',   Icon: Hand },
  { type: 'ticker',    label: 'Ticker',    Icon: ScrollText },
  { type: 'sermon',    label: 'Sermon',    Icon: Mic },
]

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

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

function ServiceDeck({ service, track, onTrackChange, trackAssignment, onTrackAssignmentChange, songs, announcements, liveItemId, selectedId, onSelect, onAdd, onAddSong, onAddAnnouncement, onGoLive, onDelete, onReordered }: {
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
  onReordered: () => void
}): JSX.Element {
  const [dragId, setDragId] = useState<number | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [sceneConfig, setSceneConfig] = useState<SceneConfig | null>(null)
  useEffect(() => { void window.wf.scenesGet().then(setSceneConfig) }, [service])
  const items = service.items.filter((it) => it.track === track)
  const hasSecond = service.items.some((it) => it.track === 'second')

  const [showZonePopover, setShowZonePopover] = useState(false)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // Close the popover on every service switch too — without this, switching to
    // a service with no Second track (which unmounts the trigger/popover, so the
    // outside-click handler's popoverRef.current goes null and can never close it
    // again) then back to one with a Second track re-renders it already open.
    setShowZonePopover(false)
  }, [service.id])

  useEffect(() => {
    if (!showZonePopover) return
    const onClickOutside = (e: MouseEvent): void => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setShowZonePopover(false)
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setShowZonePopover(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [showZonePopover])

  const onDrop = (targetId: number): void => {
    if (dragId == null || dragId === targetId) return
    const ids = items.map((i) => i.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    ids.splice(to, 0, ids.splice(from, 1)[0])
    setDragId(null)
    window.wf.serviceReorder(service.id, track, ids).then(onReordered)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Track tabs — Second only appears once the service actually has second-track items,
          or once you're currently viewing it (so you can still see/empty it). The zone-
          assignment strip only appears once there's a Second track to distinguish from Main. */}
      {(hasSecond || track === 'second') && (
        <div className="mb-2 flex items-center gap-2">
          <div className="flex flex-1 gap-1 rounded-lg bg-slate-100 p-1">
            {(['main', 'second'] as TrackId[]).map((tb) => (
              <button
                key={tb}
                onClick={() => onTrackChange(tb)}
                className={`flex-1 rounded-md py-1 text-xs font-semibold transition-colors ${
                  track === tb ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tb === 'main' ? 'Main' : 'Second'}
              </button>
            ))}
          </div>
          {hasSecond && (
            <div ref={popoverRef} className="relative shrink-0">
              <button
                onClick={() => setShowZonePopover((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 hover:bg-slate-50"
                title="Which screens Main and Second feed"
              >
                <ZoneTrackStripBadge assignment={trackAssignment} />
              </button>
              {showZonePopover && (
                <div className="absolute right-0 top-full z-10 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                  <div className="mb-2 text-xs font-semibold text-slate-600">Screens</div>
                  <div className="space-y-1.5">
                    {ZONE_IDS.map((zoneId) => (
                      <div key={zoneId} className="flex items-center justify-between">
                        <span className="text-xs text-slate-700">{ZONE_NAMES[zoneId]}</span>
                        <ZoneTrackToggle serviceId={service.id} zoneId={zoneId} assignment={trackAssignment} onChanged={onTrackAssignmentChange} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
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
                  ? 'border-blue-500/30 bg-blue-500/[0.07] ring-1 ring-blue-500/30'
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
                <div className="flex items-center gap-1.5 truncate text-xs text-slate-600">
                  <span className="truncate">{it.type} · #{i + 1}{preview ? ` · ${preview}` : ''}</span>
                  {sceneConfig && (() => {
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
              <div className="flex flex-shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {liveItemId === it.id ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    LIVE
                  </span>
                ) : (
                  <>
                    <button
                      onClick={() => onGoLive(it)}
                      className="text-slate-400 opacity-0 hover:text-blue-700 group-hover:opacity-100"
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
          {announcements.length > 0 && (
            <div className="mb-3">
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Announcement from library</label>
              <select
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
          {track === 'main' && !hasSecond && (
            <button
              onClick={() => { onTrackChange('second'); setShowAdd(false) }}
              className="mt-3 w-full text-center text-xs font-medium text-blue-700 hover:underline"
            >
              + Start a Second track (independent second screen)
            </button>
          )}
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
