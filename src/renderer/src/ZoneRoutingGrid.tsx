import type { ZoneId, ZoneRouting, ZoneState } from '../../shared/types'
import { ZONE_NAMES } from '../../shared/types'

export const MODE_LABELS: Record<ZoneState['mode'], string> = {
  lyrics: 'Lyrics', stage: 'Stage', black: 'Black', logo: 'Logo',
  countdown: 'Countdown', text: 'Text', image: 'Image', off: 'Off',
}

const ZONE_MODE_OPTIONS: ZoneState['mode'][] = ['lyrics', 'stage', 'black', 'logo', 'countdown', 'text', 'image', 'off']
const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

// The raw per-zone mode grid (the "Advanced" escape hatch). Fully controlled.
export default function ZoneRoutingGrid({ routing, onChange }: {
  routing: ZoneRouting
  onChange: (r: ZoneRouting) => void
}): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {ZONE_IDS.map((zoneId) => (
        <div key={zoneId} className="flex items-center gap-1.5">
          <span className="w-6 text-[10px] font-bold text-slate-400" title={ZONE_NAMES[zoneId]}>Z{zoneId}</span>
          <select
            value={routing[zoneId]}
            onChange={(e) => onChange({ ...routing, [zoneId]: e.target.value as ZoneState['mode'] })}
            className="flex-1 rounded border border-slate-200 bg-slate-100 py-0.5 text-[11px] text-slate-700 outline-none focus:border-emerald-500/50"
          >
            {ZONE_MODE_OPTIONS.map((m) => (
              <option key={m} value={m}>{MODE_LABELS[m]}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}
