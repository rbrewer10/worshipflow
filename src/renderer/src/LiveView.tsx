import { useEffect, useState } from 'react'
import LiveTriptych from './live/LiveTriptych'
import LiveTools from './LiveTools'
import ScenePresetRow from './ScenePresetRow'
import { useService } from './ServiceContext'
import type { LiveState } from '../../shared/types'
import type { SceneConfig } from '../../shared/zoneScenes'
import { effectiveRouting, matchScene, expandScene } from '../../shared/zoneScenes'

// The Live tab: the click-a-slide grid + the right-hand tools panel, for Main.
// (The loaded service + output preview live in the shell's left rail —
// ServiceRail, in AppShell. The bottom content drawer is mounted app-wide in
// AppShell too, not here — see LiveDrawer.tsx.) Stage Rehearsal's controls and
// the Media/Backgrounds browser live on Build Service instead — this screen is
// for actual live service, not prep — see ServiceEditor.tsx and
// docs/superpowers/plans/2026-08-08-stage-rehearsal.md.
// Keyboard shortcuts (B/L/N/P/S) are handled globally in AppShell and always
// target the Main track.
function LiveView(): JSX.Element {
  const [sceneConfig, setSceneConfig] = useState<SceneConfig | null>(null)
  const [live, setLive] = useState<LiveState | null>(null)
  const { activeService } = useService()

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
      <div className="wf-live-main flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <LiveTriptych track="main" />
          <LiveTools track="main" />
        </div>

        {/* Bottom: scene selector. The four zone tiles that used to sit above
            it were removed — the booth runs the Zone Multiview window on a
            second screen, so repeating the same four previews here only ate
            vertical space the operator needs for the live text. */}
        <div className="wf-live-bottom flex flex-col gap-2 border-t border-border p-3">
          {liveItem && sceneConfig && (() => {
            const routing = effectiveRouting(liveItem, sceneConfig)
            return (
              <ScenePresetRow
                config={sceneConfig}
                itemType={liveItem.type}
                routing={routing}
                matched={matchScene(routing, liveItem.type, sceneConfig)}
                isDefault={liveItem.zoneRouting == null}
                onPick={(sceneId) => {
                  const scene = sceneConfig.scenes.find((s) => s.id === sceneId)
                  if (!scene) return
                  void window.wf.zoneSetRouting(liveItem.id, expandScene(scene, liveItem.type))
                }}
              />
            )
          })()}
        </div>
      </div>
    </div>
  )
}

export default LiveView
