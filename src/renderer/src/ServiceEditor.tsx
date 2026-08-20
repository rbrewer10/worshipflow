import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ClipboardCheck, Clock3, FileWarning, Keyboard, ListChecks, Mic2, Music2, Users } from 'lucide-react'
import type { LiveState, ServiceFull, ServiceItem, SongFull, SongSummary, AnnouncementSummary, TrackId } from '../../shared/types'
import { DEFAULT_ZONE_TRACK } from '../../shared/types'
import type { ZoneTrackAssignment } from '../../shared/zoneTrack'
import type { SceneConfig } from '../../shared/zoneScenes'
import { effectiveRouting, matchScene, expandScene } from '../../shared/zoneScenes'
import ThemePicker from './ThemePicker'
import ServiceDeck from './ServiceDeck'
import CardEditPanel from './CardEditPanel'
import ZoneScreenGrid from './zones/ZoneScreenGrid'
import ScenePresetRow from './ScenePresetRow'
import ScheduledAnnouncements from './ScheduledAnnouncements'
import Modal from './Modal'
import QuickSearchOverlay from './QuickSearchOverlay'
import { useOptionalService } from './ServiceContext'
import { estimateServiceDuration, formatDurationEstimate } from '../../shared/serviceDuration'
import { notifyLocal, notifyLocalAction } from './NotifyToasts'
import ServiceReviewPanel from './ServiceReviewPanel'
import ServiceTeamPanel from './ServiceTeamPanel'
import StageRehearsalTools from './StageRehearsalTools'
import { computeServiceReadiness } from './serviceReadiness'
import ReplaceItemModal, { type Replacement } from './ReplaceItemModal'

function ServiceEditor({ serviceId, headerActions, onServiceChanged, onOpenLive }: {
  serviceId: number
  headerActions?: React.ReactNode
  // Called after every edit that mutates this service, so a shared "active
  // service" cache elsewhere (e.g. Live Control's ServiceContext) can refresh.
  // Optional: the standalone pop-out service window has no such context to sync.
  onServiceChanged?: () => void
  onOpenLive?: () => void
}): JSX.Element {
  const [service, setService] = useState<ServiceFull | null>(null)
  const [songs, setSongs] = useState<SongSummary[]>([])
  const [announcements, setAnnouncements] = useState<AnnouncementSummary[]>([])
  const [live, setLive] = useState<{ main: LiveState; second: LiveState | null } | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [recentlyAddedId, setRecentlyAddedId] = useState<number | null>(null)
  const [selectedSongFull, setSelectedSongFull] = useState<SongFull | null>(null)
  const [confirmDeleteItems, setConfirmDeleteItems] = useState<ServiceItem[] | null>(null)
  const [track, setTrack] = useState<TrackId>('main')
  const [itemSlides, setItemSlides] = useState<Record<number, string[]>>({})
  const [trackAssignment, setTrackAssignment] = useState<ZoneTrackAssignment>(DEFAULT_ZONE_TRACK)
  const [showQuickSearch, setShowQuickSearch] = useState(false)
  const [sceneConfig, setSceneConfig] = useState<SceneConfig | null>(null)
  // Portal target for ZoneScreenGrid's zone-preview cards — see the bottom
  // strip below. A ref callback (not useRef) because we need the actual DOM
  // node to trigger a re-render once it exists, so the portal has somewhere
  // to render into on the very first paint.
  const [zoneCardsAnchor, setZoneCardsAnchor] = useState<HTMLDivElement | null>(null)
  // Collapsed by default — the Scene Selector is a less-frequent action than
  // picking an item to preview, and left open it crowded the bottom strip.
  // Matches the "Advanced ▾" disclosure idiom ZoneScreenGrid already uses.
  const [showSceneSelector, setShowSceneSelector] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [showTeam, setShowTeam] = useState(false)
  const [showRehearsal, setShowRehearsal] = useState(false)
  const [replaceItemId, setReplaceItemId] = useState<number | null>(null)

  // Ctrl/Cmd+F opens the cross-type quick search from anywhere in Build
  // Service — matches ProPresenter's global search shortcut.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setShowQuickSearch(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const optionalSvc = useOptionalService()

  // Mirror this component's selection outward so the Live Drawer (a sibling in
  // the tree, only reachable via ServiceContext) knows what's selected when
  // Build Service is the active screen. No-op in the standalone pop-out window,
  // which has no ServiceProvider — optionalSvc is null there.
  useEffect(() => {
    optionalSvc?.setSelectedItemId(selectedId)
  }, [selectedId])

  // Clear the mirrored selection on unmount (e.g. navigating away from Build
  // Service), so a stale id doesn't linger once this screen isn't showing.
  useEffect(() => {
    return () => { optionalSvc?.setSelectedItemId(null) }
  }, [])

  const reload = async (notify = true): Promise<void> => {
    const s = await window.wf.serviceGet(serviceId)
    setService(s)
    // A song's own content (lyrics, background, font, etc.) lives on the song
    // record, not the service item — serviceGet() above doesn't carry it, and
    // the effect that loads selectedSongFull only re-runs when the SELECTED
    // item changes, not when this same item's own record is edited. Without
    // this, a background/lyrics save reflects on the real live output (which
    // reads the song record directly) but the zone preview tiles here — which
    // render off selectedSongFull — kept showing what was there before the edit.
    const item = s?.items.find((it) => it.id === selectedId)
    if (item && item.type === 'song' && item.ref_id != null) {
      void window.wf.songGet(item.ref_id).then(setSelectedSongFull)
    }
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
  }, [optionalSvc?.itemsChangedTick])

  useEffect(() => {
    const off = window.wf.onState(setLive)
    window.wf.getState('main').then((s) => setLive({ main: s, second: null }))
    return off
  }, [])

  useEffect(() => {
    void window.wf.zoneTrackAssignmentGet(serviceId).then(setTrackAssignment)
  }, [serviceId])

  useEffect(() => { void window.wf.scenesGet().then(setSceneConfig) }, [])

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
  }, [selectedId, selectedItem?.ref_id])

  const addCard = async (type: ServiceItem['type']): Promise<void> => {
    if (type === 'image') {
      const result = await window.wf.dialogOpenFile()
      if (result.canceled || !result.filePaths[0]) return
      const id = await window.wf.serviceAddItem(serviceId, { type: 'image', payload: { path: result.filePaths[0] }, track })
      await reload()
      setSelectedId(id)
      markRecentlyAdded(id)
      return
    }
    const payload: Record<string, unknown> = (type === 'countdown' || type === 'welcome') ? { seconds: 300 } : {}
    const id = await window.wf.serviceAddItem(serviceId, { type, payload, track })
    await reload()
    setSelectedId(id)
    markRecentlyAdded(id)
  }

  const addSong = async (songId: number): Promise<void> => {
    const id = await window.wf.serviceAddItem(serviceId, { type: 'song', ref_id: songId, track })
    await reload()
    setSelectedId(id)
    markRecentlyAdded(id)
  }

  const addAnnouncement = async (announcementId: number): Promise<void> => {
    const id = await window.wf.serviceAddItem(serviceId, { type: 'announcement', ref_id: announcementId, track })
    await reload()
    setSelectedId(id)
    markRecentlyAdded(id)
  }

  // From quick search: create the scripture item with its reference already
  // filled in, rather than the blank item addCard('scripture') gives you.
  const addScripture = async (reference: string): Promise<void> => {
    const id = await window.wf.serviceAddItem(serviceId, { type: 'scripture', payload: { reference }, track })
    await reload()
    setSelectedId(id)
    markRecentlyAdded(id)
  }

  const markRecentlyAdded = (id: number): void => {
    setRecentlyAddedId(id)
    window.setTimeout(() => setRecentlyAddedId((current) => current === id ? null : current), 3000)
  }

  const delItem = (item: ServiceItem): void => setConfirmDeleteItems([item])
  const batchDeleteItems = (deleteItems: ServiceItem[]): void => setConfirmDeleteItems(deleteItems)
  const confirmDelete = async (): Promise<void> => {
    if (!confirmDeleteItems) return
    const deletedItems = confirmDeleteItems // the full ServiceItem objects, captured before they're gone
    const ids = new Set(deletedItems.map((it) => it.id))
    for (const it of deletedItems) await window.wf.serviceRemoveItem(it.id)
    if (selectedId != null && ids.has(selectedId)) setSelectedId(null)
    await reload()
    setConfirmDeleteItems(null)

    // A real re-create (new ids, same content: payload/notes/style/zone
    // routing), not a true un-delete — there's no soft-delete/trash table —
    // but it gets the operator back to where they were after an accidental
    // confirm, same pattern as SongLibrary/AnnouncementsLibrary's Undo.
    notifyLocalAction(
      deletedItems.length === 1 ? `Deleted "${deletedItems[0].title}"` : `Deleted ${deletedItems.length} items`,
      'Undo',
      () => {
        void (async () => {
          for (const it of deletedItems) {
            const newId = await window.wf.serviceAddItem(serviceId, { type: it.type, ref_id: it.ref_id, payload: it.payload, track: it.track })
            if (newId != null) {
              if (it.notes) await window.wf.serviceUpdateItemNotes(newId, it.notes)
              if (it.style) await window.wf.serviceSetItemStyle(newId, it.style)
              if (it.zoneRouting) await window.wf.zoneSetRouting(newId, it.zoneRouting)
            }
          }
          await reload()
        })()
      }
    )
  }

  const duplicateItem = async (item: ServiceItem): Promise<void> => {
    const id = await window.wf.serviceDuplicateItem(item.id)
    await reload()
    if (id != null) setSelectedId(id)
  }

  const duration = service ? estimateServiceDuration(service.items) : null

  if (service == null) {
    return <div className="flex h-full items-center justify-center text-sm text-content-secondary">Loading…</div>
  }

  const songCount = service.items.filter((item) => item.type === 'song').length
  const placeholderCount = service.items.filter((item) => item.type === 'placeholder').length
  const quickSearchHint = navigator.platform.toLowerCase().includes('mac') ? '⌘F' : 'Ctrl+F'
  const team = service.team ?? { people: [], assignments: {} }
  const readiness = computeServiceReadiness(service, songs, team.people)
  const statusLabel = service.published_at
    ? 'Published'
    : readiness.ready
    ? readiness.warnings.length > 0
    ? `Ready · ${readiness.warnings.length} recommended`
    : 'Ready to publish'
    : `${readiness.blocking.length} to fix`
  const reviewButtonLabel = service.published_at
    ? 'Published'
    : readiness.ready
    ? 'Review & publish'
    : 'Review plan'

  const saveTeam = async (nextTeam: typeof team): Promise<void> => {
    await window.wf.serviceSetTeam(serviceId, nextTeam)
    await reload()
  }

  const publish = async (): Promise<void> => {
    if (!readiness.ready) return
    await window.wf.serviceSetPublished(serviceId, Date.now())
    await reload()
    setShowReview(false)
    notifyLocal('Service published and ready for Live Control.', 'info')
  }

  const replaceItem = async (replacement: Replacement): Promise<void> => {
    if (replaceItemId == null) return
    await window.wf.serviceReplaceItem(replaceItemId, replacement.type, replacement.refId, replacement.payload)
    await reload()
    setSelectedId(replaceItemId)
    setReplaceItemId(null)
    notifyLocal('Item replaced in place.', 'info')
  }

  return (
    <div className="wf-service-editor flex h-full min-h-0 flex-col gap-2">
      {/* Header */}
      <div className="wf-service-editor-header flex items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-400">Sunday service</div>
            <h2 className="truncate text-lg font-semibold text-content-primary">{service.name}</h2>
          </div>
          {/* Which Sunday this is for. Drives the scheduled-announcements list
              and the printed order's date line — both of which used to be
              unreachable for hand-built services, since only the church-app
              plan import ever set a date. */}
          <label htmlFor="service-date" className="sr-only">Service date</label>
          <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-panel px-2 py-1">
            <CalendarDays size={13} className="text-content-tertiary" />
            <input
            id="service-date"
            type="date"
            value={service.service_date ?? ''}
            onChange={(e) => {
              void window.wf.serviceSetDate(serviceId, e.target.value || null).then(() => reload())
            }}
            title="The date this service is for"
            className="border-0 bg-transparent px-0 py-0 text-xs text-content-secondary shadow-none focus:border-0 focus:shadow-none"
            />
          </div>
        </div>
        <div className="wf-service-editor-actions flex shrink-0 items-center gap-2">
          <button onClick={() => setShowTeam(true)} className="btn-pill text-xs" title="Manage people and roles for this service"><Users size={13} /> Team{team.people.length > 0 ? ` · ${team.people.length}` : ''}</button>
          <button onClick={() => setShowRehearsal(true)} className="btn-pill text-xs" title="Step the Stage Monitor through this service's songs for a pre-service rehearsal"><Mic2 size={13} /> Stage Rehearsal</button>
          <button onClick={() => setShowReview(true)} className={`btn-pill text-xs ${readiness.ready ? 'border-emerald-500/35 text-emerald-400' : 'border-amber-500/35 text-amber-400'}`} title="Review this service before publishing"><ClipboardCheck size={13} /> {reviewButtonLabel}</button>
          {headerActions && headerActions}
        </div>
      </div>

      <div className="wf-service-stats flex shrink-0 items-center gap-2 overflow-x-auto rounded-xl border border-border bg-panel-raised px-3 py-2">
        <div className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-content-primary"><ListChecks size={14} className="text-blue-400" /> {service.items.length} item{service.items.length === 1 ? '' : 's'}</div>
        <span className="h-4 w-px shrink-0 bg-border" />
        <div className="inline-flex shrink-0 items-center gap-1.5 text-xs text-content-secondary"><Music2 size={13} /> {songCount} song{songCount === 1 ? '' : 's'}</div>
        {duration && duration.knownItemCount > 0 && (
          <div className="inline-flex shrink-0 items-center gap-1.5 text-xs text-content-secondary" title={`${duration.knownItemCount} of ${duration.totalItemCount} items have a known duration`}><Clock3 size={13} /> {formatDurationEstimate(duration.totalSeconds)}</div>
        )}
        {placeholderCount > 0 && <div className="inline-flex shrink-0 items-center gap-1.5 text-xs text-amber-400"><FileWarning size={13} /> {placeholderCount} to fill</div>}
        <span className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
          readiness.ready ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
        }`} title={readiness.ready ? 'This service can be published' : `${readiness.blocking.length} blocking issue${readiness.blocking.length === 1 ? '' : 's'} before publishing`}>
          {statusLabel}
        </span>
        <span className="hidden shrink-0 items-center gap-1 text-[11px] text-content-tertiary xl:inline-flex"><Keyboard size={12} /> {quickSearchHint} quick add</span>
      </div>

      {/* Theme bar */}
      <ThemePicker serviceId={serviceId} themeId={service.theme} colors={service.themeColors} onChange={reload} />

      {/* Body */}
      <div className="wf-service-editor-body flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex min-h-0 flex-1 gap-3">
          {/* Center: run of show (moved from the left column) */}
          <div className="wf-service-flow flex min-w-0 flex-1 flex-col min-h-0">
            <ScheduledAnnouncements
              serviceDate={service.service_date}
              addedRefIds={new Set(service.items.filter((it) => it.type === 'announcement' && it.ref_id != null).map((it) => it.ref_id as number))}
              onAdd={addAnnouncement}
            />
            <ServiceDeck
              service={service}
              track={track}
              onTrackChange={setTrack}
              trackAssignment={trackAssignment}
              onTrackAssignmentChange={setTrackAssignment}
              songs={songs}
              announcements={announcements}
              liveItemId={live?.main.liveServiceItemId ?? null}
              selectedId={selectedId}
              recentlyAddedId={recentlyAddedId}
              onSelect={setSelectedId}
              onAdd={addCard}
              onAddSong={addSong}
              onAddAnnouncement={addAnnouncement}
              onQuickSearch={() => setShowQuickSearch(true)}
              onDelete={delItem}
              onDuplicate={duplicateItem}
              onBatchDelete={batchDeleteItems}
              onReordered={reload}
            />
          </div>

          {/* Right: consolidated inspector — compact zone preview + item editor */}
          {selectedItem && (
            <div className="wf-service-inspector flex min-h-0 w-80 shrink-0 flex-col gap-3 overflow-auto overscroll-contain rounded-xl border border-border bg-panel-raised p-3">
              <ZoneScreenGrid
                item={selectedItem}
                serviceId={service.id}
                serviceTheme={service.theme}
                serviceColors={service.themeColors}
                songFull={selectedSongFull}
                slides={itemSlides[selectedItem.id] ?? []}
                trackAssignment={trackAssignment}
                onChanged={reload}
                zoneCardsPortalTarget={zoneCardsAnchor}
                compact
              />
              <CardEditPanel
                item={selectedItem}
                serviceTheme={service.theme}
                serviceColors={service.themeColors}
                showPreview={false}
                onClose={() => setSelectedId(null)}
                onChanged={reload}
                onDelete={delItem}
              />
            </div>
          )}
          {!selectedItem && (
            <div className="wf-service-inspector flex min-h-0 w-80 shrink-0 items-center justify-center rounded-xl border border-border bg-panel-raised p-3 text-sm text-content-secondary">
              Select an item to preview &amp; style it
            </div>
          )}
        </div>

        {/* Bottom: zone-preview cards (portaled in from ZoneScreenGrid above)
            + persistent Scene Selector bar — mirrors Live Control's
            OutputsStrip-then-ScenePresetRow bottom bar, so the narrow right
            column only has to hold controls, not previews. */}
        {selectedItem && (
          <div className="wf-service-bottom-strip flex shrink-0 flex-col gap-2 rounded-xl border border-border bg-panel-raised p-2">
            {/* Capped, not full-width — at full width on a wide monitor these
                16:9 previews scale up with it and can eat a quarter of the
                screen. A fixed cap keeps them a consistent size regardless
                of window width without shrinking to the point of being
                unreadable. Left-aligned (not centered) per Ryan — centering
                just wasted the space on both sides equally instead of
                letting the cards themselves take more of it. */}
            <div ref={setZoneCardsAnchor} className="w-full max-w-6xl" />
            {sceneConfig && (
              <div>
                <button
                  onClick={() => setShowSceneSelector((v) => !v)}
                  className="text-[10px] font-semibold uppercase tracking-widest text-content-tertiary hover:text-content-secondary"
                >
                  Scene Selector {showSceneSelector ? '▴' : '▾'}
                </button>
                {showSceneSelector && (
                  <div className="mt-2">
                    <ScenePresetRow
                      config={sceneConfig}
                      itemType={selectedItem.type}
                      routing={effectiveRouting(selectedItem, sceneConfig)}
                      matched={matchScene(effectiveRouting(selectedItem, sceneConfig), selectedItem.type, sceneConfig)}
                      isDefault={selectedItem.zoneRouting == null}
                      onPick={(sceneId) => {
                        const scene = sceneConfig.scenes.find((s) => s.id === sceneId)
                        if (!scene) return
                        void window.wf.zoneSetRouting(selectedItem.id, expandScene(scene, selectedItem.type)).then(() => reload())
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirm delete item(s) modal */}
      {confirmDeleteItems && (
        <Modal onClose={() => setConfirmDeleteItems(null)} labelledBy="delete-items-title" className="max-w-sm rounded-xl border border-border bg-panel p-5 text-content-primary shadow-2xl">
            <h3 id="delete-items-title" className="mb-2 text-lg font-semibold text-content-primary">{confirmDeleteItems.length === 1 ? 'Delete Item?' : `Delete ${confirmDeleteItems.length} Items?`}</h3>
            <p className="mb-4 text-sm text-content-secondary">
              {confirmDeleteItems.length === 1 ? (
                <>Are you sure you want to delete{' '}
                <span className="font-semibold text-content-primary">{confirmDeleteItems[0].title}</span>? This cannot be undone.</>
              ) : (
                <>Are you sure you want to delete these {confirmDeleteItems.length} items? This cannot be undone.</>
              )}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDeleteItems(null)}
                className="flex-1 rounded-lg border border-border bg-panel px-4 py-2 text-sm font-semibold text-content-secondary hover:bg-panel-raised">
                Cancel
              </button>
              <button onClick={confirmDelete}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">
                Delete
              </button>
            </div>
        </Modal>
      )}

      {showQuickSearch && (
        <QuickSearchOverlay
          songs={songs}
          announcements={announcements}
          onAddSong={addSong}
          onAddAnnouncement={addAnnouncement}
          onAddScripture={addScripture}
          onClose={() => setShowQuickSearch(false)}
        />
      )}

      {showReview && <ServiceReviewPanel service={service} readiness={readiness} onSelectItem={(id) => { setSelectedId(id); setShowReview(false) }} onReplaceItem={(id) => { setReplaceItemId(id); setShowReview(false) }} onFixIssue={(issueId) => { if (issueId === 'date') window.setTimeout(() => document.getElementById('service-date')?.focus(), 0); if (issueId === 'team') setShowTeam(true); if (issueId === 'empty') setShowQuickSearch(true) }} onPublish={() => { void publish() }} onOpenLive={() => { setShowReview(false); onOpenLive?.() }} onClose={() => setShowReview(false)} />}
      {showTeam && <ServiceTeamPanel team={team} selectedItem={selectedItem} onChange={(next) => { void saveTeam(next) }} onClose={() => setShowTeam(false)} />}
      {showRehearsal && (
        <Modal onClose={() => setShowRehearsal(false)} labelledBy="stage-rehearsal-title" className="w-full max-w-md rounded-2xl border border-border bg-panel-raised text-content-primary shadow-2xl">
          <h2 id="stage-rehearsal-title" className="sr-only">Stage Rehearsal</h2>
          <StageRehearsalTools onActiveChange={() => {}} className="max-h-[80vh] rounded-2xl" />
        </Modal>
      )}
      {replaceItemId != null && (() => {
        const item = service.items.find((it) => it.id === replaceItemId)
        return item && <ReplaceItemModal item={item} songs={songs} onReplace={(replacement) => { void replaceItem(replacement) }} onClose={() => setReplaceItemId(null)} />
      })()}
    </div>
  )
}

export default ServiceEditor
