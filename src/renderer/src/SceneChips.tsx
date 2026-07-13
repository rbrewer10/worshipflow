import { useEffect, useState } from 'react'
import { Pencil, Wrench } from 'lucide-react'
import type { ServiceItem } from '../../shared/types'
import type { SceneConfig } from '../../shared/zoneScenes'
import { expandScene, effectiveRouting, matchScene } from '../../shared/zoneScenes'
import ZoneStripBadge from './ZoneStripBadge'
import ZoneRoutingGrid from './ZoneRoutingGrid'
import SceneEditorModal from './SceneEditorModal'

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

      <div className="flex flex-wrap gap-1.5">
        {config.scenes.map((s) => {
          const active = matched === s.id
          return (
            <button
              key={s.id}
              onClick={() => pick(s.id)}
              className={`flex flex-col items-start gap-1 rounded-lg border-2 px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                active ? 'border-blue-500 bg-blue-500/10 text-blue-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              <ZoneStripBadge routing={expandScene(s, item.type)} title={s.name} />
              <span>{s.name}{active && isDefault ? ' (default)' : ''}</span>
            </button>
          )
        })}
        {matched === 'custom' && (
          <span className="flex flex-col items-start gap-1 rounded-lg border-2 border-slate-300 bg-slate-100 px-2 py-1.5 text-[11px] font-semibold text-slate-600">
            <ZoneStripBadge routing={routing} />
            <span className="inline-flex items-center gap-1"><Wrench size={10} /> Custom</span>
          </span>
        )}
      </div>

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
