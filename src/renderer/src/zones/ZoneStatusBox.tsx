import type { ZoneId, ZoneState } from '../../../shared/types'
import { ZONE_NAMES } from '../../../shared/types'
import { MODE_LABELS } from '../ZoneRoutingGrid'
import { readout } from './zoneReadout'

interface ZoneStatusBoxProps {
  zoneId: ZoneId
  zoneState: ZoneState | undefined
}

// The zone name/mode header plus the 16:9 dark preview showing what a zone is
// actually displaying right now. Shared between Setup's interactive pin grid
// (ZoneLiveGrid) and the Live tab's read-only status widget (LiveZoneStatus)
// so the same zone always reads the same way in both places — see the
// 2026-08-01 design spec.
function ZoneStatusBox({ zoneId, zoneState }: ZoneStatusBoxProps): JSX.Element {
  const { primary, secondary } = readout(zoneState)
  return (
    <>
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">{ZONE_NAMES[zoneId]}</span>
        <span className="shrink-0 text-[10px] font-semibold text-slate-400">{MODE_LABELS[zoneState?.mode ?? 'off']}</span>
      </div>
      {/* Same 16:9 box the Build Service zone cards use, so every screen of
          the app describes the same hardware the same way. */}
      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg px-1.5 ring-1 ring-white/10"
          style={{ background: zoneState?.mode === 'black' ? '#000' : '#2b2f36' }}
        >
          <span className="max-h-full overflow-hidden text-center text-[10px] font-medium leading-tight text-white/80">{primary}</span>
          {secondary && (
            <span className="max-h-full overflow-hidden text-center text-[9px] leading-tight text-white/40">{secondary}</span>
          )}
        </div>
      </div>
    </>
  )
}

export default ZoneStatusBox
