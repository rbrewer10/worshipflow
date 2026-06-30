import { useEffect, useState } from 'react'
import type { ZoneId, ZoneState, ZoneRouting, ServiceItem } from '../../shared/types'
import { ZONE_NAMES, ZONE_ROUTING_DEFAULTS } from '../../shared/types'

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

const MODE_LABELS: Record<ZoneState['mode'], string> = {
  lyrics:    'Lyrics',
  stage:     'Stage',
  black:     'Black',
  logo:      'Logo',
  countdown: 'Countdown',
  text:      'Text',
  image:     'Image',
  off:       'Off',
}

const MODE_COLORS: Record<ZoneState['mode'], string> = {
  lyrics:    'bg-emerald-600 text-white',
  stage:     'bg-blue-600 text-white',
  black:     'bg-slate-700 text-slate-300',
  logo:      'bg-violet-700 text-white',
  countdown: 'bg-orange-600 text-white',
  text:      'bg-teal-700 text-white',
  image:     'bg-pink-700 text-white',
  off:       'bg-black/50 text-slate-600',
}

const ZONE_MODE_OPTIONS: ZoneState['mode'][] = [
  'lyrics', 'stage', 'black', 'logo', 'countdown', 'text', 'image', 'off'
]

function ZonePanel({ liveItem }: { liveItem: ServiceItem | null }): JSX.Element {
  const [zoneStates, setZoneStates] = useState<Record<ZoneId, ZoneState> | null>(null)
  const [routing, setRouting] = useState<ZoneRouting | null>(null)
  const [serverIp, setServerIp] = useState<string>('...')
  const [port, setPort] = useState<number | null>(null)

  // Load zone states on mount and whenever live item changes.
  useEffect(() => {
    void window.wf.zoneGetStates().then(setZoneStates)
    void window.wf.zoneGetIp().then(setServerIp)
    void window.wf.getTabletPort().then(p => setPort(p)).catch(err => {
      console.error('Failed to get tablet port:', err)
      setPort(3691) // fallback
    })
  }, [])

  // Load routing for the active item.
  useEffect(() => {
    if (!liveItem) { setRouting(null); return }
    const defaults = ZONE_ROUTING_DEFAULTS[liveItem.type]
    if (liveItem.zoneRouting) {
      setRouting(liveItem.zoneRouting)
    } else {
      setRouting(defaults)
    }
  }, [liveItem])

  // Poll zone states every 2 seconds.
  useEffect(() => {
    const t = setInterval(() => {
      void window.wf.zoneGetStates().then(setZoneStates)
    }, 2000)
    return () => clearInterval(t)
  }, [])

  const setOverride = (zoneId: ZoneId, mode: ZoneState['mode'] | null): void => {
    void window.wf.zoneSetOverride(zoneId, mode).then(() =>
      window.wf.zoneGetStates().then(setZoneStates)
    )
  }

  const clearOverrides = (): void => {
    void window.wf.zoneClearOverrides().then(() =>
      window.wf.zoneGetStates().then(setZoneStates)
    )
  }

  const saveRouting = (newRouting: ZoneRouting): void => {
    if (!liveItem) return
    setRouting(newRouting)
    void window.wf.zoneSetRouting(liveItem.id, newRouting)
  }

  const resetRouting = (): void => {
    if (!liveItem) return
    void window.wf.zoneSetRouting(liveItem.id, null).then(() => {
      setRouting(ZONE_ROUTING_DEFAULTS[liveItem.type])
    })
  }

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Display Zones</span>
        <button
          onClick={clearOverrides}
          className="rounded px-2 py-0.5 text-[11px] text-slate-500 hover:bg-white/[0.06] hover:text-slate-300"
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
            <div key={zoneId} className="rounded-lg border border-white/[0.06] bg-black/30 p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-500">Z{zoneId}</span>
                  <span className="text-xs font-medium text-slate-300">{ZONE_NAMES[zoneId]}</span>
                </div>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${MODE_COLORS[mode]}`}>
                  {MODE_LABELS[mode]}
                </span>
              </div>
              {/* Quick mode override buttons */}
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setOverride(zoneId, null)}
                  className="rounded px-2 py-0.5 text-[11px] text-slate-500 ring-1 ring-white/[0.06] hover:bg-white/[0.06] hover:text-slate-300"
                >
                  Auto
                </button>
                {(['black', 'logo', 'lyrics', 'stage'] as ZoneState['mode'][]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setOverride(zoneId, m)}
                    className={`rounded px-2 py-0.5 text-[11px] ring-1 ring-white/[0.06] transition-colors ${
                      mode === m ? MODE_COLORS[m] : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
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

      {/* Routing for active item */}
      {liveItem && routing && (
        <div className="rounded-lg border border-white/[0.06] bg-black/20 p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400">
              Auto-routing for: <span className="text-slate-300">{liveItem.title}</span>
            </span>
            <button
              onClick={resetRouting}
              className="text-[10px] text-slate-600 hover:text-slate-400"
            >
              Reset
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {ZONE_IDS.map((zoneId) => (
              <div key={zoneId} className="flex items-center gap-1.5">
                <span className="w-6 text-[10px] font-bold text-slate-600">Z{zoneId}</span>
                <select
                  value={routing[zoneId]}
                  onChange={(e) => saveRouting({ ...routing, [zoneId]: e.target.value as ZoneState['mode'] })}
                  className="flex-1 rounded border border-white/[0.06] bg-black/40 py-0.5 text-[11px] text-slate-300 outline-none focus:border-emerald-500/50"
                >
                  {ZONE_MODE_OPTIONS.map((m) => (
                    <option key={m} value={m}>{MODE_LABELS[m]}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pi network addresses */}
      <div className="rounded-lg border border-white/[0.06] bg-black/20 p-2.5">
        <div className="mb-1.5 text-[11px] font-semibold text-slate-500">Pi Display URLs</div>
        <div className="space-y-1">
          {ZONE_IDS.map((zoneId) => (
            <div key={zoneId} className="flex items-center justify-between">
              <span className="text-[10px] text-slate-600">Zone {zoneId} — {ZONE_NAMES[zoneId]}</span>
              <span className="font-mono text-[11px] text-emerald-400">
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
