import { useEffect, useRef, useState } from 'react'
import type { LiveState, ServiceFull, ServiceItem, SongFull, SongSummary, AnnouncementSummary, TrackId } from '../../shared/types'
import ThemePicker from './ThemePicker'
import ServiceDeck from './ServiceDeck'
import CardEditPanel from './CardEditPanel'
import ZoneScreenGrid from './zones/ZoneScreenGrid'
import { sendItemLive } from './liveActions'
import ScheduledAnnouncements from './ScheduledAnnouncements'
import { useOptionalService } from './ServiceContext'

function ServiceEditor({ serviceId, headerActions, onServiceChanged }: {
  serviceId: number
  headerActions?: React.ReactNode
  // Called after every edit that mutates this service, so a shared "active
  // service" cache elsewhere (e.g. Live Control's ServiceContext) can refresh.
  // Optional: the standalone pop-out service window has no such context to sync.
  onServiceChanged?: () => void
}): JSX.Element {
  const [service, setService] = useState<ServiceFull | null>(null)
  const [songs, setSongs] = useState<SongSummary[]>([])
  const [announcements, setAnnouncements] = useState<AnnouncementSummary[]>([])
  const [live, setLive] = useState<{ main: LiveState; second: LiveState | null } | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedSongFull, setSelectedSongFull] = useState<SongFull | null>(null)
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<ServiceItem | null>(null)
  const [track, setTrack] = useState<TrackId>('main')
  const [itemSlides, setItemSlides] = useState<Record<number, string[]>>({})

  const optionalSvc = useOptionalService()

  // Mirror this component's selection outward so the Live Drawer (a sibling in
  // the tree, only reachable via ServiceContext) knows what's selected when
  // Build Service is the active screen. No-op in the standalone pop-out window,
  // which has no ServiceProvider — optionalSvc is null there.
  useEffect(() => {
    optionalSvc?.setSelectedItemId(selectedId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  // Clear the mirrored selection on unmount (e.g. navigating away from Build
  // Service), so a stale id doesn't linger once this screen isn't showing.
  useEffect(() => {
    return () => { optionalSvc?.setSelectedItemId(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reload = async (notify = true): Promise<void> => {
    const s = await window.wf.serviceGet(serviceId)
    setService(s)
    // Also refresh the main process's live-routing item cache — it's separate
    // from this component's local state and from ServiceContext, and nothing
    // else keeps it in sync after an edit (see wf:services:refreshActiveItems).
    void window.wf.serviceRefreshActiveItems(serviceId)
    // notify=false when this reload was ITSELF triggered by the shared
    // context (the itemsChangedTick effect below) — calling onServiceChanged
    // here would be ServiceBuilder's reloadActiveService, which bumps the
    // tick again and spins forever.
    if (notify) onServiceChanged?.()
  }

  useEffect(() => {
    window.wf.setActiveService(serviceId)
    reload()
    window.wf.songsList().then(setSongs)
    window.wf.announcementsList().then(setAnnouncements)
    setSelectedId(null)
    setTrack('main')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId])

  // Re-fetch this component's own copy of the service whenever something
  // outside it (e.g. the Live Drawer applying a background to the selected
  // item) calls the shared context's reloadActiveService(). ServiceEditor
  // fetches its own data independently of ServiceContext's activeService, so
  // without this its on-screen preview would go stale after such an edit.
  const skipFirstTick = useRef(true)
  useEffect(() => {
    if (skipFirstTick.current) { skipFirstTick.current = false; return }
    if (optionalSvc) reload(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionalSvc?.itemsChangedTick])

  useEffect(() => {
    const off = window.wf.onState(setLive)
    window.wf.getState('main').then((s) => setLive({ main: s, second: null }))
    return off
  }, [])

  // Slide text depends only on each item's type/payload/ref, never on its zone
  // routing — so key the fetch on those. Without this, every zone-card click
  // calls reload(), which replaces `service` and would re-run a Bible lookup
  // for every scripture item in the service (a network call each, on WEB/BBE).
  const slidesKey = service
    ? service.items.map((i) => `${i.id}:${i.type}:${i.ref_id ?? ''}:${JSON.stringify(i.payload ?? {})}`).join('|')
    : ''

  // Resolved slide text (e.g. scripture verses) for the zone grid's filmstrip
  // and previews — same IPC the Live tab's SlideGrid already uses. Re-fetches
  // on every reload() so an edit to the selected item's content stays in sync.
  useEffect(() => {
    if (!service) return
    void window.wf.serviceSlides(service.id).then((rows) => {
      const map: Record<number, string[]> = {}
      for (const r of rows) map[r.id] = r.slides
      setItemSlides(map)
    })
  }, [service?.id, slidesKey])

  const selectedItem = service?.items.find((it) => it.id === selectedId) ?? null

  useEffect(() => {
    if (selectedItem && selectedItem.type === 'song' && selectedItem.ref_id != null) {
      window.wf.songGet(selectedItem.ref_id).then(setSelectedSongFull)
    } else {
      setSelectedSongFull(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedItem?.ref_id])

  const addCard = async (type: ServiceItem['type']): Promise<void> => {
    if (type === 'image') {
      const result = await window.wf.dialogOpenFile()
      if (result.canceled || !result.filePaths[0]) return
      const id = await window.wf.serviceAddItem(serviceId, { type: 'image', payload: { path: result.filePaths[0] }, track })
      await reload()
      setSelectedId(id)
      return
    }
    const payload: Record<string, unknown> = (type === 'countdown' || type === 'welcome') ? { seconds: 300 } : {}
    const id = await window.wf.serviceAddItem(serviceId, { type, payload, track })
    await reload()
    setSelectedId(id)
  }

  const addSong = async (songId: number): Promise<void> => {
    const id = await window.wf.serviceAddItem(serviceId, { type: 'song', ref_id: songId, track })
    await reload()
    setSelectedId(id)
  }

  const addAnnouncement = async (announcementId: number): Promise<void> => {
    const id = await window.wf.serviceAddItem(serviceId, { type: 'announcement', ref_id: announcementId, track })
    await reload()
    setSelectedId(id)
  }

  const delItem = (item: ServiceItem): void => setConfirmDeleteItem(item)
  const confirmDelete = async (): Promise<void> => {
    if (!confirmDeleteItem) return
    await window.wf.serviceRemoveItem(confirmDeleteItem.id)
    if (selectedId === confirmDeleteItem.id) setSelectedId(null)
    await reload()
    setConfirmDeleteItem(null)
  }

  if (service == null) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading…</div>
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="truncate text-lg font-semibold text-slate-900">{service.name}</h2>
        {headerActions && <div className="flex shrink-0 items-center gap-2">{headerActions}</div>}
      </div>

      {/* Theme bar */}
      <ThemePicker serviceId={serviceId} themeId={service.theme} colors={service.themeColors} onChange={reload} />

      {/* Body */}
      <div className="flex min-h-0 flex-1 gap-3">
        {/* Left: item deck */}
        <div className="flex w-80 shrink-0 flex-col min-h-0">
          <ScheduledAnnouncements
            serviceDate={service.service_date}
            addedRefIds={new Set(service.items.filter((it) => it.type === 'announcement' && it.ref_id != null).map((it) => it.ref_id as number))}
            onAdd={addAnnouncement}
          />
          <ServiceDeck
            service={service}
            track={track}
            onTrackChange={setTrack}
            songs={songs}
            announcements={announcements}
            liveItemId={live?.main.liveServiceItemId ?? null}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onAdd={addCard}
            onAddSong={addSong}
            onAddAnnouncement={addAnnouncement}
            onGoLive={(it) => sendItemLive(it, it.track)}
            onDelete={delItem}
            onReordered={reload}
          />
        </div>

        {/* Center: the four zone screens for the selected item */}
        <div className="flex min-w-0 flex-1 items-center justify-center overflow-auto p-2">
          {selectedItem ? (
            <ZoneScreenGrid
              item={selectedItem}
              serviceId={service.id}
              serviceTheme={service.theme}
              serviceColors={service.themeColors}
              songFull={selectedSongFull}
              slides={itemSlides[selectedItem.id] ?? []}
              onChanged={reload}
            />
          ) : (
            <div className="text-sm text-slate-500">Select an item to preview &amp; style it</div>
          )}
        </div>

        {/* Right: edit controls */}
        {selectedItem && (
          <CardEditPanel
            item={selectedItem}
            serviceTheme={service.theme}
            serviceColors={service.themeColors}
            showPreview={false}
            onClose={() => setSelectedId(null)}
            onChanged={reload}
            onDelete={delItem}
          />
        )}
      </div>

      {/* Confirm delete item modal */}
      {confirmDeleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="max-w-sm rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold text-slate-900">Delete Item?</h3>
            <p className="mb-4 text-sm text-slate-600">
              Are you sure you want to delete{' '}
              <span className="font-semibold text-slate-900">{confirmDeleteItem.title}</span>? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDeleteItem(null)}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                Cancel
              </button>
              <button onClick={confirmDelete}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ServiceEditor
