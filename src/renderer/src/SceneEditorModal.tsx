import { useEffect, useState } from 'react'
import { Plus, RotateCcw, X } from 'lucide-react'
import type { ServiceItemType } from '../../shared/types'
import type { SceneConfig, SceneDef, ZoneRole } from '../../shared/zoneScenes'
import { starterConfig, expandScene } from '../../shared/zoneScenes'
import ZoneStripBadge from './ZoneStripBadge'

const ROLE_CYCLE: ZoneRole[] = ['content', 'logo', 'black']
const ROLE_LABEL: Record<ZoneRole, string> = { content: 'Content', logo: 'Logo', black: 'Black' }
const ROLE_STYLE: Record<ZoneRole, string> = {
  content: 'bg-emerald-600 text-white',
  logo: 'bg-slate-200 text-slate-600',
  black: 'bg-slate-800 text-slate-300',
}
const ZONE_LABEL: Record<'1' | '2' | '3', string> = { '1': 'Back L', '2': 'Back R', '3': 'Lyrics TVs' }
const DEFAULTABLE_TYPES: ServiceItemType[] = ['song', 'scripture', 'text', 'countdown', 'image', 'welcome', 'ticker', 'announcement']

// Palette editor: rename scenes, tap zone pills to cycle Content → Logo → Black,
// add/delete/reset, and assign per-type default scenes. Saves on Done.
export default function SceneEditorModal({ onClose, onSaved }: {
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const [config, setConfig] = useState<SceneConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { window.wf.scenesGet().then(setConfig) }, [])

  if (!config) return <></>

  const updateScene = (idx: number, patch: Partial<SceneDef>): void => {
    const scenes = config.scenes.map((s, i) => (i === idx ? { ...s, ...patch } : s))
    setConfig({ ...config, scenes })
  }

  const cycleZone = (idx: number, zone: '1' | '2' | '3'): void => {
    const cur = config.scenes[idx].zones[zone] ?? 'logo'
    const next = ROLE_CYCLE[(ROLE_CYCLE.indexOf(cur) + 1) % ROLE_CYCLE.length]
    updateScene(idx, { zones: { ...config.scenes[idx].zones, [zone]: next } })
  }

  const addScene = (): void => {
    const id = `scene-${Date.now()}`
    setConfig({
      ...config,
      scenes: [...config.scenes, { id, name: 'New scene', zones: { '1': 'logo', '2': 'logo', '3': 'content' } }]
    })
  }

  const deleteScene = (idx: number): void => {
    const removed = config.scenes[idx]
    const typeDefaults = { ...config.typeDefaults }
    for (const t of Object.keys(typeDefaults) as ServiceItemType[]) {
      if (typeDefaults[t] === removed.id) delete typeDefaults[t] // reverts to built-in default
    }
    setConfig({ typeDefaults, scenes: config.scenes.filter((_, i) => i !== idx) })
  }

  const setTypeDefault = (type: ServiceItemType, sceneId: string): void => {
    const typeDefaults = { ...config.typeDefaults }
    if (sceneId) {
      typeDefaults[type] = sceneId
    } else {
      delete typeDefaults[type]
    }
    setConfig({ ...config, typeDefaults })
  }

  const save = async (): Promise<void> => {
    if (config.scenes.length === 0) { setError('Keep at least one scene.'); return }
    if (config.scenes.some((s) => !s.name.trim())) { setError('Every scene needs a name.'); return }
    try {
      await window.wf.scenesSet(config)
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="max-h-[85vh] w-[560px] overflow-auto rounded-xl border border-slate-200 bg-[#f4f6f9] p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Edit scenes</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-200"><X size={15} /></button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Tap a screen pill to cycle Content → Logo → Black. The Stage monitor always stays on Stage.
          Changes apply to slides you tag from now on — already-built services keep what they have.
        </p>

        <div className="space-y-2">
          {config.scenes.map((s, idx) => (
            <div key={s.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center gap-2">
                <input
                  value={s.name}
                  onChange={(e) => updateScene(idx, { name: e.target.value })}
                  className="w-44 rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500"
                />
                <ZoneStripBadge routing={expandScene(s, 'song')} />
                <button onClick={() => deleteScene(idx)} className="ml-auto rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-red-500/10 hover:text-red-600">✕</button>
              </div>
              <div className="flex gap-1.5">
                {(['1', '2', '3'] as const).map((z) => (
                  <button
                    key={z}
                    onClick={() => cycleZone(idx, z)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold ${ROLE_STYLE[s.zones[z] ?? 'logo']}`}
                    title={`${ZONE_LABEL[z]} — click to change`}
                  >
                    {ZONE_LABEL[z]}: {ROLE_LABEL[s.zones[z] ?? 'logo']}
                  </button>
                ))}
                <span className="flex items-center rounded-md bg-slate-500 px-2 text-[11px] font-bold text-white" title="Stage monitor — always Stage">Stage</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          <button onClick={addScene} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-400">
            <Plus size={13} /> Add scene
          </button>
          <button onClick={() => setConfig(starterConfig())} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-400">
            <RotateCcw size={13} /> Reset to starter five
          </button>
        </div>

        {/* Per-type defaults */}
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Default scene per item type</div>
          <div className="grid grid-cols-2 gap-1.5">
            {DEFAULTABLE_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-2 text-xs capitalize text-slate-600">
                <span className="w-24">{t}</span>
                <select
                  value={config.typeDefaults[t] ?? ''}
                  onChange={(e) => setTypeDefault(t, e.target.value)}
                  className="flex-1 rounded border border-slate-200 bg-slate-100 py-0.5 text-[11px] text-slate-700 outline-none"
                >
                  <option value="">Built-in default</option>
                  {config.scenes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold hover:bg-slate-200">Cancel</button>
          <button onClick={save} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">Done</button>
        </div>
      </div>
    </div>
  )
}
