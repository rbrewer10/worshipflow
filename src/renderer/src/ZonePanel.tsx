import { useEffect, useState } from 'react'
import type { ZoneId, ZoneState, ServiceItem } from '../../shared/types'
import { ZONE_NAMES, DEFAULT_ZONE_TRACK } from '../../shared/types'
import type { ZoneTrackAssignment } from '../../shared/zoneTrack'
import { MODE_LABELS } from './ZoneRoutingGrid'
import SceneChips from './SceneChips'
import ZoneTrackToggle from './ZoneTrackToggle'
import { useService } from './ServiceContext'

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

const MODE_COLORS: Record<ZoneState['mode'], string> = {
  lyrics:    'bg-blue-600 text-white',
  stage:     'bg-slate-100 text-slate-900',
  black:     'bg-slate-800 text-slate-200',
  logo:      'bg-slate-100 text-slate-900',
  countdown: 'bg-amber-600 text-white',
  text:      'bg-slate-100 text-slate-900',
  image:     'bg-slate-100 text-slate-900',
  sermon:    'bg-blue-600 text-white',
  off:       'bg-slate-200 text-slate-500',
}

function ZonePanel({ liveItem, reloadActiveService }: { liveItem: ServiceItem | null; reloadActiveService: () => void }): JSX.Element {
  const { activeService } = useService()
  const [zoneStates, setZoneStates] = useState<Record<ZoneId, ZoneState> | null>(null)
  const [serverIp, setServerIp] = useState<string>('...')
  const [port, setPort] = useState<number | null>(null)
  const [overridden, setOverridden] = useState<Set<ZoneId>>(new Set())
  const [trackAssignment, setTrackAssignment] = useState<ZoneTrackAssignment>(DEFAULT_ZONE_TRACK)
  const hasSecond = activeService?.items.some((it) => it.track === 'second') ?? false

  // Load zone states on mount and whenever live item changes.
  useEffect(() => {
    void window.wf.zoneGetStates().then(setZoneStates)
    void window.wf.zoneGetIp().then(setServerIp)
    void window.wf.getTabletPort().then(p => setPort(p)).catch(err => {
      console.error('Failed to get tablet port:', err)
      setPort(3691) // fallback
    })
  }, [])

  // Poll zone states + track assignment every 2 seconds. Track assignment also
  // needs polling (not just zoneStates) because ZonePanel is mounted twice at
  // once (Main's LiveTools + Second's SecondTrackTools) — without this, clicking
  // a track button in one column would never update the other column's highlight.
  useEffect(() => {
    const t = setInterval(() => {
      void window.wf.zoneGetStates().then(setZoneStates)
      if (activeService != null) void window.wf.zoneTrackAssignmentGet(activeService.id).then(setTrackAssignment)
    }, 2000)
    return () => clearInterval(t)
  }, [activeService?.id])

  useEffect(() => {
    if (activeService == null) return
    void window.wf.zoneTrackAssignmentGet(activeService.id).then(setTrackAssignment)
  }, [activeService?.id])

  const setOverride = (zoneId: ZoneId, mode: ZoneState['mode'] | null): void => {
    setOverridden((prev) => {
      const next = new Set(prev)
      if (mode == null) next.delete(zoneId); else next.add(zoneId)
      return next
    })
    void window.wf.zoneSetOverride(zoneId, mode).then(() =>
      window.wf.zoneGetStates().then(setZoneStates)
    )
  }

  const clearOverrides = (): void => {
    setOverridden(new Set())
    void window.wf.zoneClearOverrides().then(() =>
      window.wf.zoneGetStates().then(setZoneStates)
    )
  }

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-600">Display Zones</span>
        <button
          onClick={clearOverrides}
          className="rounded px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          Clear overrides
        </button>
      </div>

      {/* Zone rows */}
      <div className="space-y-1.5">
        {ZONE_IDS.map((zoneId) => {
          const zs = zoneStates?.[zoneId]
          const mode = zs?.mode ?? 'off'
          return (
            <div key={zoneId} className="rounded-lg border border-slate-200 bg-slate-100 p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-500">Z{zoneId}</span>
                  <span className="text-xs font-medium text-slate-700">{ZONE_NAMES[zoneId]}</span>
                </div>
                <span className="flex items-center gap-1">
                  {overridden.has(zoneId) && (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-600">Manual</span>
                  )}
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${MODE_COLORS[mode]}`}>
                    {MODE_LABELS[mode]}
                  </span>
                </span>
              </div>
              {/* Track assignment — only shown once the service has a Second track */}
              {hasSecond && activeService && (
                <div className="mb-1.5">
                  <ZoneTrackToggle
                    serviceId={activeService.id}
                    zoneId={zoneId}
                    assignment={trackAssignment}
                    onChanged={setTrackAssignment}
                    onPersisted={() => window.wf.zoneGetStates().then(setZoneStates)}
                  />
                </div>
              )}
              {/* Quick mode override buttons */}
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setOverride(zoneId, null)}
                  className="rounded px-2 py-0.5 text-[11px] text-slate-500 ring-1 ring-slate-200 hover:bg-slate-200 hover:text-slate-700"
                >
                  Auto
                </button>
                {/* 'stage' only renders on the Stage Monitor (zone 4); the flex/lyrics
                    zones have no stage layout and would show a blank screen. */}
                {((zoneId === 4 ? ['black', 'logo', 'lyrics', 'stage'] : ['black', 'logo', 'lyrics']) as ZoneState['mode'][]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setOverride(zoneId, m)}
                    className={`rounded px-2 py-0.5 text-[11px] ring-1 ring-slate-200 transition-colors ${
                      mode === m ? MODE_COLORS[m] : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                    }`}
                  >
                    {MODE_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Scene chips for the live item (same UI as Build Service) */}
      {liveItem && (
        <div className="rounded-lg border border-slate-200 bg-slate-100/70 p-2.5">
          <SceneChips
            item={liveItem}
            onChanged={() => {
              void window.wf.zoneGetStates().then(setZoneStates)
              reloadActiveService()
            }}
          />
        </div>
      )}

      {/* Pi network addresses */}
      <div className="rounded-lg border border-slate-200 bg-slate-100/70 p-2.5">
        <div className="mb-1.5 text-[11px] font-semibold text-slate-500">Pi Display URLs</div>
        <div className="space-y-1">
          {ZONE_IDS.map((zoneId) => (
            <div key={zoneId} className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400">Zone {zoneId} — {ZONE_NAMES[zoneId]}</span>
              <span className="font-mono text-[11px] text-blue-700">
                http://{serverIp}:{port ?? '...'}/zone/{zoneId}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ZonePanel
