import { Wrench } from 'lucide-react'
import type { ServiceItemType, ZoneRouting } from '../../shared/types'
import type { SceneConfig } from '../../shared/zoneScenes'
import { expandScene } from '../../shared/zoneScenes'
import ZoneStripBadge from './ZoneStripBadge'

// The one-tap scene preset chips. Presentational and fully controlled — shared
// by SceneChips (Live tab) and ZoneScreenGrid (Build Service) so the two can't
// drift apart. `matched` is matchScene()'s result; `isDefault` is true when the
// item has no stored routing, which is what earns the "(default)" suffix.
export default function ScenePresetRow({ config, itemType, routing, matched, isDefault, onPick }: {
  config: SceneConfig
  itemType: ServiceItemType
  routing: ZoneRouting
  matched: string | 'custom'
  isDefault: boolean
  onPick: (sceneId: string) => void
}): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {config.scenes.map((s) => {
        const active = matched === s.id
        return (
          <button
            key={s.id}
            onClick={() => onPick(s.id)}
            className={`flex flex-col items-start gap-1 rounded-lg border-2 px-2 py-1.5 text-[11px] font-semibold transition-colors ${
              active ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-border bg-panel text-content-secondary hover:border-border-strong'
            }`}
          >
            <ZoneStripBadge routing={expandScene(s, itemType)} title={s.name} />
            <span>{s.name}{active && isDefault ? ' (default)' : ''}</span>
          </button>
        )
      })}
      {matched === 'custom' && (
        <span className="flex flex-col items-start gap-1 rounded-lg border-2 border-border-strong bg-panel-raised px-2 py-1.5 text-[11px] font-semibold text-content-secondary">
          <ZoneStripBadge routing={routing} />
          <span className="inline-flex items-center gap-1"><Wrench size={10} /> Custom</span>
        </span>
      )}
    </div>
  )
}
