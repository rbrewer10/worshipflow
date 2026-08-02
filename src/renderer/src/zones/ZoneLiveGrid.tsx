import { useCallback, useEffect, useState } from 'react'
import { Pin, X } from 'lucide-react'
import type { ZoneId, ZoneState } from '../../../shared/types'
import { ZONE_NAMES, DEFAULT_ZONE_TRACK } from '../../../shared/types'
import type { ZonePin, ZonePins } from '../../../shared/zonePins'
import { pinLabel } from '../../../shared/zonePins'
import type { ZoneTrackAssignment } from '../../../shared/zoneTrack'
import { useService } from '../ServiceContext'
import ZonePinPicker from './ZonePinPicker'
import ZoneStatusBox from './ZoneStatusBox'

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

// The Live tab's four screens: what each one shows, and one click to hold it.
// Pinned state is read back from the main process on every change — the panel
// this replaced kept a local `overridden` Set, so its "Manual" badge could claim
// a screen was held when nothing was.
function ZoneLiveGrid(): JSX.Element {
  const { activeService } = useService()
  const [zoneStates, setZoneStates] = useState<Record<ZoneId, ZoneState> | null>(null)
  const [pins, setPins] = useState<ZonePins>({})
  const [liveMainItemId, setLiveMainItemId] = useState<number | null>(null)
  const [trackAssignment, setTrackAssignment] = useState<ZoneTrackAssignment>(DEFAULT_ZONE_TRACK)
  const [openZone, setOpenZone] = useState<ZoneId | null>(null)

  const refreshStates = useCallback((): void => { void window.wf.zoneGetStates().then(setZoneStates) }, [])
  const refreshPins = useCallback((): void => { void window.wf.zoneGetPins().then(setPins) }, [])
  const closePicker = useCallback((): void => setOpenZone(null), [])

  // Zone content follows the engine's own wf:state pushes. The old panel polled
  // every 2s only because it was mounted twice at once (Main + Second rails) and
  // the two copies had to converge; it is mounted once now, so the push is both
  // sufficient and instant.
  useEffect(() => {
    refreshStates()
    void window.wf.getState('main').then((s) => setLiveMainItemId(s.liveServiceItemId ?? null))
    const off = window.wf.onState((s) => {
      setLiveMainItemId(s.main.liveServiceItemId ?? null)
      refreshStates()
    })
    return off
  }, [refreshStates])

  // Pins are server truth, re-read on mount and on every service switch — main
  // clears all pins when the active service changes, and this is how the UI
  // finds that out.
  useEffect(() => { refreshPins() }, [activeService?.id, refreshPins])

  useEffect(() => {
    if (activeService == null) return
    void window.wf.zoneTrackAssignmentGet(activeService.id).then(setTrackAssignment)
  }, [activeService?.id])

  const setPin = (zoneId: ZoneId, pin: ZonePin | null): void => {
    void window.wf.zoneSetPin(zoneId, pin).then(() => { refreshPins(); refreshStates() })
  }
  const unpinAll = (): void => {
    void window.wf.zoneClearPins().then(() => { refreshPins(); refreshStates() })
  }

  const items = activeService?.items ?? []
  const liveMainItem = items.find((it) => it.id === liveMainItemId && it.track === 'main') ?? null
  const pinnedZones = ZONE_IDS.filter((z) => pins[z] != null)
  // The one move this whole feature exists for: the sermon is live, so offer to
  // park its title card on the back screen before the operator needs it there.
  const suggestSermonPin = liveMainItem?.type === 'sermon' && pins[1] == null

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-widest text-slate-600">Display Zones</div>

      {pinnedZones.length > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5">
          <span className="text-[11px] font-semibold text-amber-800">
            {pinnedZones.length} screen{pinnedZones.length === 1 ? '' : 's'} pinned
          </span>
          <button onClick={unpinAll} className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100">
            Unpin all
          </button>
        </div>
      )}

      {suggestSermonPin && liveMainItem && (
        <button
          onClick={() => setPin(1, { kind: 'titleCard', itemId: liveMainItem.id })}
          className="flex w-full items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-left hover:bg-amber-50"
        >
          <Pin size={12} className="shrink-0 text-amber-600" />
          <span className="truncate text-[11px] text-slate-700">
            Hold “{liveMainItem.title}” on {ZONE_NAMES[1]}
          </span>
        </button>
      )}

      <div className="grid grid-cols-2 gap-2">
        {ZONE_IDS.map((zoneId) => {
          const zs = zoneStates?.[zoneId]
          const pin = pins[zoneId] ?? null
          return (
            <div key={zoneId} className="relative">
              <div
                onClick={() => setOpenZone(zoneId)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenZone(zoneId) } }}
                title={`${ZONE_NAMES[zoneId]} — click to hold or follow the service`}
                className={`cursor-pointer rounded-xl border-2 p-2 transition-colors ${
                  pin ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-400/30' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <ZoneStatusBox zoneId={zoneId} zoneState={zs} />
                {pin && (
                  <div className="mt-1.5 flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5">
                    <Pin size={10} className="shrink-0 text-amber-600" />
                    <span className="flex-1 truncate text-[10px] font-semibold text-amber-700">{pinLabel(pin, items)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setPin(zoneId, null) }}
                      title="Unpin — follow the service again"
                      className="shrink-0 rounded text-amber-600 hover:bg-amber-200/60 hover:text-amber-800"
                    >
                      <X size={11} />
                    </button>
                  </div>
                )}
              </div>
              {openZone === zoneId && (
                <ZonePinPicker
                  zoneId={zoneId}
                  pin={pin}
                  liveItem={liveMainItem}
                  items={items}
                  serviceId={activeService?.id ?? null}
                  trackAssignment={trackAssignment}
                  onTrackAssignmentChange={setTrackAssignment}
                  onTrackAssignmentPersisted={refreshStates}
                  onPick={(next) => { setPin(zoneId, next); closePicker() }}
                  onClose={closePicker}
                  // Bottom-row cards open upward and right-column cards align
                  // right, so the menu stays inside the narrow Live rail.
                  placement={zoneId >= 3 ? 'above' : 'below'}
                  align={zoneId % 2 === 0 ? 'right' : 'left'}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ZoneLiveGrid
