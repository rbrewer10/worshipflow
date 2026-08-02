import { useCallback, useEffect, useState } from 'react'
import type { ZoneId, ZoneState } from '../../../shared/types'
import ZoneStatusBox from './ZoneStatusBox'

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

// Read-only per-zone status for the Live tab's rail — replaces the old
// "Main Audience Output" preview, which showed a generic, un-zoned render
// that could visibly disagree with what the real screens were doing (it
// didn't run through zone routing at all, and its "Program" badge was gated
// on a local-output-window counter that's always 0 for an all-zone setup).
// Shares ZoneStatusBox/readout with Setup's interactive ZoneLiveGrid so the
// two views can never disagree. No pin controls here — pinning stays a
// Setup-only action. See the 2026-08-01 design spec.
function LiveZoneStatus(): JSX.Element {
  const [zoneStates, setZoneStates] = useState<Record<ZoneId, ZoneState> | null>(null)

  const refreshStates = useCallback((): void => { void window.wf.zoneGetStates().then(setZoneStates) }, [])

  // Zone state isn't part of the wf:state push payload itself (that's just
  // main/second track state) — a push is the signal to re-fetch, the same
  // pattern ZoneLiveGrid already uses.
  useEffect(() => {
    refreshStates()
    const off = window.wf.onState(() => refreshStates())
    return off
  }, [refreshStates])

  return (
    <div className="p-2">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Zones</div>
      <div className="grid grid-cols-2 gap-2">
        {ZONE_IDS.map((zoneId) => (
          <div key={zoneId} className="rounded-xl border-2 border-slate-200 bg-white p-2">
            <ZoneStatusBox zoneId={zoneId} zoneState={zoneStates?.[zoneId]} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default LiveZoneStatus
