import { useCallback, useEffect, useState } from 'react'
import type { AppInfo, ZoneId, ZoneState } from '../../../shared/types'
import ZoneStatusBox from '../zones/ZoneStatusBox'

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

// Live Control's bottom outputs strip — same data/logic as LiveZoneStatus
// (Setup's ZoneLiveGrid and this share ZoneStatusBox so the two can never
// disagree), laid out horizontally instead of a 2x2 grid to fit a bottom bar.
function OutputsStrip(): JSX.Element {
  const [zoneStates, setZoneStates] = useState<Record<ZoneId, ZoneState> | null>(null)
  const [zonesConnected, setZonesConnected] = useState<ZoneId[]>([])

  const refreshStates = useCallback((): void => { void window.wf.zoneGetStates().then(setZoneStates) }, [])

  useEffect(() => {
    refreshStates()
    const off = window.wf.onState(() => refreshStates())
    return off
  }, [refreshStates])

  useEffect(() => {
    const load = (): void => { window.wf.getInfo().then((i: AppInfo) => setZonesConnected(i.zonesConnected)) }
    load()
    const t = setInterval(load, 2000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="grid grid-cols-4 gap-2">
      {ZONE_IDS.map((zoneId) => (
        <div key={zoneId} className="rounded-xl border-2 border-border bg-panel p-2">
          <ZoneStatusBox zoneId={zoneId} zoneState={zoneStates?.[zoneId]} connected={zonesConnected.includes(zoneId)} />
        </div>
      ))}
    </div>
  )
}

export default OutputsStrip
