import { useEffect, useState } from 'react'
import SlideGrid from './SlideGrid'
import LiveTriptych from './live/LiveTriptych'
import OutputsStrip from './live/OutputsStrip'
import LiveTools from './LiveTools'
import StageRehearsalTools from './StageRehearsalTools'
import ScenePresetRow from './ScenePresetRow'
import { useService } from './ServiceContext'
import type { LiveState } from '../../shared/types'
import type { SceneConfig } from '../../shared/zoneScenes'
import { effectiveRouting, matchScene, expandScene } from '../../shared/zoneScenes'

// The Live tab: the click-a-slide grid + the right-hand tools panel, for Main —
// plus, while Stage Rehearsal is armed, a Second column reusing SlideGrid with
// StageRehearsalTools. (The loaded service + output preview live in the
// shell's left rail — ServiceRail, in AppShell. The bottom content drawer is
// mounted app-wide in AppShell too, not here — see LiveDrawer.tsx.)
// Keyboard shortcuts (B/L/N/P/S) are handled globally in AppShell and always
// target the Main track.
// The general-purpose Main/Second track UI (SecondTrackTools, a "Second" tab
// in Build Service) stays removed — it's the thing that once left a zone
// pointed at an empty track with no obvious cause. Stage Rehearsal reuses the
// same engine through a narrower, guarded door instead: see
// docs/superpowers/plans/2026-08-08-stage-rehearsal.md.
function LiveView(): JSX.Element {
  const [stageRehearsalActive, setStageRehearsalActive] = useState(false)
  const [sceneConfig, setSceneConfig] = useState<SceneConfig | null>(null)
  const [live, setLive] = useState<LiveState | null>(null)
  const { activeService } = useService()

  useEffect(() => {
    window.wf.getStageRehearsal().then((s) => setStageRehearsalActive(s.active))
  }, [])

  useEffect(() => { void window.wf.scenesGet().then(setSceneConfig) }, [])

  useEffect(() => {
    const off = window.wf.onState((s) => setLive(s.main))
    window.wf.getState('main').then(setLive)
    return off
  }, [])

  const liveItem = activeService?.items.find((it) => it.id === live?.liveServiceItemId) ?? null

  return (
    <div className="flex h-full min-h-0">
      {/* No visible title by design — an sr-only heading still gives
          screen-reader heading-navigation something to land on for this tab. */}
      <h1 className="sr-only">Live</h1>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <LiveTriptych track="main" />
          <LiveTools track="main" />
        </div>

        {/* Bottom: outputs + scene selector */}
        <div className="flex flex-col gap-2 border-t border-border p-3">
          <OutputsStrip />
          {liveItem && sceneConfig && (
            <ScenePresetRow
              config={sceneConfig}
              itemType={liveItem.type}
              routing={effectiveRouting(liveItem, sceneConfig)}
              matched={matchScene(effectiveRouting(liveItem, sceneConfig), liveItem.type, sceneConfig)}
              isDefault={liveItem.zoneRouting == null}
              onPick={(sceneId) => {
                const scene = sceneConfig.scenes.find((s) => s.id === sceneId)
                if (!scene) return
                void window.wf.zoneSetRouting(liveItem.id, expandScene(scene, liveItem.type))
              }}
            />
          )}
        </div>
      </div>
      <div className="flex min-h-0 border-l border-border">
        {stageRehearsalActive && <SlideGrid track="second" />}
        <StageRehearsalTools onActiveChange={setStageRehearsalActive} />
      </div>
    </div>
  )
}

export default LiveView
