import { useEffect, useState } from 'react'
import type { ServiceItem, ThemeColors, SongFull, ZoneId, ZoneRouting } from '../../../shared/types'
import type { SceneConfig, ZoneRole } from '../../../shared/zoneScenes'
import { effectiveRouting, matchScene, expandScene, modeForRole } from '../../../shared/zoneScenes'
import ScenePresetRow from '../ScenePresetRow'
import ZoneRoutingGrid from '../ZoneRoutingGrid'
import ZoneRolePalette from './ZoneRolePalette'
import ZoneScreenCard from './ZoneScreenCard'

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

// The four physical screens for the selected item: preset row, drag palette,
// 2x2 grid of live previews, and the raw-mode Advanced escape hatch. Writes the
// same per-item zone_routing the scene chips always have, through the existing
// zoneSetRouting IPC — no new persistence.
export default function ZoneScreenGrid({ item, serviceTheme, serviceColors, songFull, onChanged }: {
  item: ServiceItem
  serviceTheme: string | null
  serviceColors: ThemeColors | null
  songFull: SongFull | null
  onChanged: () => void
}): JSX.Element {
  const [config, setConfig] = useState<SceneConfig | null>(null)
  const [logoPath, setLogoPath] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => { void window.wf.scenesGet().then(setConfig) }, [])
  useEffect(() => { void window.wf.logoGet().then(({ logoPath: p }) => setLogoPath(p)) }, [])

  if (!config) return <></>

  const routing = effectiveRouting(item, config)
  const matched = matchScene(routing, item.type, config)
  const isDefault = item.zoneRouting == null

  const save = (next: ZoneRouting): void => {
    void window.wf.zoneSetRouting(item.id, next).then(onChanged)
  }

  const pickScene = (sceneId: string): void => {
    const scene = config.scenes.find((s) => s.id === sceneId)
    if (!scene) return
    save(expandScene(scene, item.type))
  }

  // Dropping/cycling a role stamps a full explicit routing onto the item, the
  // same thing tapping a preset chip has always done.
  const setRole = (zoneId: ZoneId, role: ZoneRole): void => {
    save({ ...routing, [zoneId]: modeForRole(role, item.type) })
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <ScenePresetRow
        config={config}
        itemType={item.type}
        routing={routing}
        matched={matched}
        isDefault={isDefault}
        onPick={pickScene}
      />

      <ZoneRolePalette />

      <div className="grid grid-cols-2 gap-3">
        {ZONE_IDS.map((zoneId) => (
          <ZoneScreenCard
            key={zoneId}
            zoneId={zoneId}
            mode={routing[zoneId]}
            item={item}
            serviceTheme={serviceTheme}
            serviceColors={serviceColors}
            songFull={songFull}
            logoPath={logoPath}
            onRoleChange={(role) => setRole(zoneId, role)}
          />
        ))}
      </div>

      <div>
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-[10px] font-semibold text-slate-400 hover:text-slate-600"
        >
          Advanced {showAdvanced ? '▴' : '▾'}
        </button>
        {showAdvanced && (
          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-100/70 p-2.5">
            <ZoneRoutingGrid routing={routing} onChange={save} />
            {!isDefault && (
              <button
                onClick={() => { void window.wf.zoneSetRouting(item.id, null).then(onChanged) }}
                className="mt-2 text-[10px] font-semibold text-slate-400 hover:text-slate-600"
              >
                Reset to default for this type
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
