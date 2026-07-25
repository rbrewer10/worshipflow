import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import type { ServiceItem } from '../../shared/types'
import type { SceneConfig } from '../../shared/zoneScenes'
import { expandScene, effectiveRouting, matchScene } from '../../shared/zoneScenes'
import ZoneRoutingGrid from './ZoneRoutingGrid'
import SceneEditorModal from './SceneEditorModal'
import ScenePresetRow from './ScenePresetRow'

// One-tap scene chips for an item's zone routing, with "Edit scenes" and an
// Advanced disclosure exposing the raw per-zone grid. Tapping a chip STAMPS the
// expanded routing onto the item (snapshot) via zoneSetRouting.
export default function SceneChips({ item, onChanged }: {
  item: ServiceItem
  onChanged: () => void
}): JSX.Element {
  const [config, setConfig] = useState<SceneConfig | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const loadConfig = (): void => { void window.wf.scenesGet().then(setConfig) }
  useEffect(loadConfig, [])

  if (!config) return <></>

  const routing = effectiveRouting(item, config)
  const matched = matchScene(routing, item.type, config)
  const isDefault = item.zoneRouting == null

  const pick = (sceneId: string): void => {
    const scene = config.scenes.find((s) => s.id === sceneId)
    if (!scene) return
    void window.wf.zoneSetRouting(item.id, expandScene(scene, item.type)).then(onChanged)
  }

  const useDefault = (): void => {
    void window.wf.zoneSetRouting(item.id, null).then(onChanged)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="section-header">Screens</span>
        <span className="flex items-center gap-2">
          <button onClick={() => setShowEditor(true)} className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-slate-600">
            <Pencil size={10} /> Edit scenes
          </button>
          <button onClick={() => setShowAdvanced((v) => !v)} className="text-[10px] font-semibold text-slate-400 hover:text-slate-600">
            Advanced {showAdvanced ? '▴' : '▾'}
          </button>
        </span>
      </div>

      <ScenePresetRow
        config={config}
        itemType={item.type}
        routing={routing}
        matched={matched}
        isDefault={isDefault}
        onPick={pick}
      />

      {showAdvanced && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-100/70 p-2.5">
          <ZoneRoutingGrid
            routing={routing}
            onChange={(r) => { void window.wf.zoneSetRouting(item.id, r).then(onChanged) }}
          />
          {!isDefault && (
            <button onClick={useDefault} className="mt-2 text-[10px] font-semibold text-slate-400 hover:text-slate-600">
              Reset to default for this type
            </button>
          )}
        </div>
      )}

      {showEditor && (
        <SceneEditorModal
          onClose={() => setShowEditor(false)}
          onSaved={() => { loadConfig(); onChanged() }}
        />
      )}
    </div>
  )
}
