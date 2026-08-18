import type { ZoneId, ZoneRouting, ZoneState } from '../../shared/types'
import { ZONE_NAMES } from '../../shared/types'

export const MODE_LABELS: Record<ZoneState['mode'], string> = {
  lyrics: 'Lyrics', stage: 'Stage', black: 'Black', logo: 'Logo',
  countdown: 'Countdown', text: 'Text', image: 'Image', sermon: 'Sermon',
  livecall: 'Live Call', off: 'Off',
}

const ZONE_MODE_OPTIONS: ZoneState['mode'][] = ['lyrics', 'stage', 'black', 'logo', 'countdown', 'text', 'image', 'sermon', 'livecall', 'off']
const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

// Only Zone 4's physical template (STAGE_SCRIPT in zoneHtml.ts) actually
// renders 'stage' mode — zones 1-3 fall through to a blank or wrong-looking
// screen if routed there, so it's not offered as a choice for them. 'sermon' is
// the mirror case: it's the designed backdrop for the room-facing screens (and
// the sermon type's own default for zones 1/2). Zone 4 is the band's monitor,
// which wants the stage view — so it keeps 'stage' and skips 'sermon'.
function modeOptionsFor(zoneId: ZoneId): ZoneState['mode'][] {
  const excluded: ZoneState['mode'] = zoneId === 4 ? 'sermon' : 'stage'
  return ZONE_MODE_OPTIONS.filter((m) => m !== excluded)
}

// The raw per-zone mode grid (the "Advanced" escape hatch). Fully controlled.
export default function ZoneRoutingGrid({ routing, onChange }: {
  routing: ZoneRouting
  onChange: (r: ZoneRouting) => void
}): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {ZONE_IDS.map((zoneId) => (
        <div key={zoneId} className="flex items-center gap-1.5">
          <span className="w-6 text-[10px] font-bold text-content-tertiary" title={ZONE_NAMES[zoneId]}>Z{zoneId}</span>
          <select
            value={routing[zoneId]}
            onChange={(e) => onChange({ ...routing, [zoneId]: e.target.value as ZoneState['mode'] })}
            className="flex-1 rounded border border-border bg-panel py-0.5 text-[11px] text-content-secondary outline-none focus:border-blue-500/50"
          >
            {modeOptionsFor(zoneId).map((m) => (
              <option key={m} value={m}>{MODE_LABELS[m]}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}
