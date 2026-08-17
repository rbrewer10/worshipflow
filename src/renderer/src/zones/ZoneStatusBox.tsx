import type { ZoneId, ZoneState } from '../../../shared/types'
import { ZONE_NAMES } from '../../../shared/types'
import { MODE_LABELS } from '../ZoneRoutingGrid'
import { readout } from './zoneReadout'

interface ZoneStatusBoxProps {
  zoneId: ZoneId
  zoneState: ZoneState | undefined
  // Omit (or pass true) when the caller doesn't track connectivity (e.g. Setup's
  // ZoneLiveGrid, which is not what an operator watches mid-service) — only a
  // literal `false` renders the disconnected state.
  connected?: boolean
}

// The zone name/mode header plus the 16:9 dark preview showing what a zone is
// actually displaying right now. Shared between Setup's interactive pin grid
// (ZoneLiveGrid) and the Live tab's read-only status widget (LiveZoneStatus)
// so the same zone always reads the same way in both places — see the
// 2026-08-01 design spec.
function ZoneStatusBox({ zoneId, zoneState, connected = true }: ZoneStatusBoxProps): JSX.Element {
  const { primary, secondary } = readout(zoneState)
  return (
    <>
      <div className="mb-1.5">
        <div className="flex items-center justify-between gap-1">
          {/* min-w-0 is required for truncate to work inside a flex row — without
              it the flex item won't shrink below its content's intrinsic width. */}
          <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500" title={ZONE_NAMES[zoneId]}>
            {ZONE_NAMES[zoneId]}
          </span>
          {connected && (
            <span className="shrink-0 text-[10px] font-semibold text-slate-400">{MODE_LABELS[zoneState?.mode ?? 'off']}</span>
          )}
        </div>
        {/* On its own line rather than competing with the name for the same
            narrow row — in the Live rail's real 2-column width (~79px of
            header space), sharing a row truncated names like "Back Left" and
            "Back Right" down to an indistinguishable "B…", defeating the
            point of an at-a-glance disconnected indicator. */}
        {!connected && (
          <span className="mt-0.5 flex w-fit items-center gap-1 rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" /> Offline
          </span>
        )}
      </div>
      {/* Same 16:9 box the Build Service zone cards use, so every screen of
          the app describes the same hardware the same way. */}
      <div className={`relative w-full ${connected ? '' : 'opacity-40'}`} style={{ paddingBottom: '56.25%' }}>
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
