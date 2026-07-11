import { useEffect, useState } from 'react'
import type { LiveState, ServiceFull, ServiceItem, SongFull, SongSummary } from '../../shared/types'
import ThemePicker from './ThemePicker'
import ServiceDeck from './ServiceDeck'
import CardEditPanel from './CardEditPanel'
import ServiceSlidePreview from './ServiceSlidePreview'
import { sendItemLive } from './liveActions'
import ScheduledAnnouncements from './ScheduledAnnouncements'

function ServiceEditor({ serviceId, headerActions }: {
  serviceId: number
  headerActions?: React.ReactNode
}): JSX.Element {
  const [service, setService] = useState<ServiceFull | null>(null)
  const [songs, setSongs] = useState<SongSummary[]>([])
  const [live, setLive] = useState<LiveState | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedSongFull, setSelectedSongFull] = useState<SongFull | null>(null)
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<ServiceItem | null>(null)

  const reload = (): Promise<void> => window.wf.serviceGet(serviceId).then(setService)

  useEffect(() => {
    window.wf.setActiveService(serviceId)
    reload()
    window.wf.songsList().then(setSongs)
    setSelectedId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId])

  useEffect(() => {
    const off = window.wf.onState(setLive)
    window.wf.getState().then(setLive)
    return off
  }, [])

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
      const id = await window.wf.serviceAddItem(serviceId, { type: 'image', payload: { path: result.filePaths[0] } })
      await reload()
      setSelectedId(id)
      return
    }
    const payload: Record<string, unknown> = (type === 'countdown' || type === 'welcome') ? { seconds: 300 } : {}
    const id = await window.wf.serviceAddItem(serviceId, { type, payload })
    await reload()
    setSelectedId(id)
  }

  const addSong = async (songId: number): Promise<void> => {
    const id = await window.wf.serviceAddItem(serviceId, { type: 'song', ref_id: songId })
    await reload()
    setSelectedId(id)
  }

  const addAnnouncement = async (announcementId: number): Promise<void> => {
    const id = await window.wf.serviceAddItem(serviceId, { type: 'announcement', ref_id: announcementId })
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
            songs={songs}
            liveItemId={live?.liveServiceItemId ?? null}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onAdd={addCard}
            onAddSong={addSong}
            onGoLive={(it) => sendItemLive(it)}
            onDelete={delItem}
            onReordered={reload}
          />
        </div>

        {/* Center: big preview */}
        <div className="flex min-w-0 flex-1 items-center justify-center p-2">
          {selectedItem ? (
            <div className="flex w-full flex-col items-center gap-3">
              <ServiceSlidePreview
                item={selectedItem}
                serviceTheme={service.theme}
                serviceColors={service.themeColors}
                songFull={selectedSongFull}
                className="max-w-3xl"
              />
              <div className="text-center text-xs text-slate-600">
                <span className="capitalize">{selectedItem.type}</span>
                <span className="px-1.5 text-slate-400">·</span>
                <span className="text-slate-700">{selectedItem.title}</span>
              </div>
            </div>
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
