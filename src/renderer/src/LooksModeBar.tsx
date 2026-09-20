import { useEffect, useState } from 'react'
import type { SceneConfig } from '../../shared/zoneScenes'
import { expandScene } from '../../shared/zoneScenes'
import type { ServiceControlMode, ServiceControlModeMapping } from '../../shared/serviceControlModes'
import { DEFAULT_MODE_MAPPING, resolveModeScene } from '../../shared/serviceControlModes'
import { useService } from './ServiceContext'

const MODE_LABEL: Record<ServiceControlMode, string> = {
  worship: 'Worship',
  sermon: 'Word',
  invitation: 'Invitation',
}

const MODE_HINT: Record<ServiceControlMode, string> = {
  worship: 'Lyrics on the lyric TVs',
  sermon: 'Title on the back screens, lyrics dark',
  invitation: 'Lyrics everywhere',
}

function LooksModeBar({ liveItemId }: { liveItemId: number | null }): JSX.Element {
  const { activeService } = useService()
  const [sceneConfig, setSceneConfig] = useState<SceneConfig | null>(null)
  const [modeMapping, setModeMapping] = useState<ServiceControlModeMapping>(DEFAULT_MODE_MAPPING)
  const [active, setActive] = useState<ServiceControlMode | null>(null)

  useEffect(() => { void window.wf.scenesGet().then(setSceneConfig) }, [])
  useEffect(() => { void window.wf.serviceControlModesGet().then(setModeMapping) }, [])

  const liveItem = activeService?.items.find((it) => it.id === liveItemId) ?? null

  const applyMode = (mode: ServiceControlMode): void => {
    if (!sceneConfig || !liveItem) return
    const scene = resolveModeScene(mode, modeMapping, sceneConfig)
    if (!scene) return
    setActive(mode)
    void window.wf.zoneSetRouting(liveItem.id, expandScene(scene, liveItem.type))
  }

  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-content-tertiary">Looks</div>
      <div className="grid grid-cols-3 gap-1.5">
        {(['worship', 'sermon', 'invitation'] as ServiceControlMode[]).map((mode) => {
          const scene = sceneConfig ? resolveModeScene(mode, modeMapping, sceneConfig) : null
          const disabled = !scene || !liveItem
          const on = active === mode
          return (
            <button
              key={mode}
              onClick={() => applyMode(mode)}
              disabled={disabled}
              title={!liveItem ? 'Nothing is live yet' : !scene ? 'Map this look in Setup' : MODE_HINT[mode]}
              className={`rounded-lg border px-2 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                on
                  ? 'border-blue-500/50 bg-blue-500/15 text-blue-300'
                  : 'border-border bg-panel-raised text-content-secondary hover:bg-panel'
              }`}
            >
              {MODE_LABEL[mode]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default LooksModeBar
