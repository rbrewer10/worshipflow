// src/renderer/src/live/ServiceControlsDrawer.tsx
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Mic, MicOff, Radio, Timer as TimerIcon } from 'lucide-react'
import type { ObsStatus, TrackId } from '../../../shared/types'
import type { SceneConfig } from '../../../shared/zoneScenes'
import { expandScene } from '../../../shared/zoneScenes'
import type { ServiceControlMode, ServiceControlModeMapping } from '../../../shared/serviceControlModes'
import { DEFAULT_MODE_MAPPING, resolveModeScene } from '../../../shared/serviceControlModes'
import { useService } from '../ServiceContext'

const MODE_LABEL: Record<ServiceControlMode, string> = {
  sermon: 'Sermon Mode',
  worship: 'Worship Mode',
  invitation: 'Invitation Mode',
}

// Quick Cues fire the same text-overlay path the ticker item type already
// uses (window.wf.liveLoadText), briefly replacing whatever's live with a
// short phrase. Deliberately NOT behind tap-to-confirm: unlike the dense item
// rail or a slide grid (many closely-packed targets where a stray tap is
// likely), this is a sparse row of 4 labeled buttons inside a drawer the
// operator has to deliberately open first — the same "isolated, deliberate
// control, no confirm needed" precedent LiveTools' own Black/Logo/Live row
// already sets.
const QUICK_CUES = ['Applause', 'Amen', 'Bible', 'Thank You']

function ServiceControlsDrawer({ track, liveItemId }: { track: TrackId; liveItemId: number | null }): JSX.Element {
  const { activeService } = useService()
  const [open, setOpen] = useState(true)
  const [sceneConfig, setSceneConfig] = useState<SceneConfig | null>(null)
  const [modeMapping, setModeMapping] = useState<ServiceControlModeMapping>(DEFAULT_MODE_MAPPING)
  const [obs, setObs] = useState<ObsStatus | null>(null)
  const [timerSecs, setTimerSecs] = useState('300')

  useEffect(() => { void window.wf.scenesGet().then(setSceneConfig) }, [])
  useEffect(() => { void window.wf.serviceControlModesGet().then(setModeMapping) }, [])
  useEffect(() => {
    window.wf.obsGetStatus().then(setObs)
    const off = window.wf.obsOnStatus(setObs)
    return off
  }, [])

  const liveItem = activeService?.items.find((it) => it.id === liveItemId) ?? null

  const applyMode = (mode: ServiceControlMode): void => {
    if (!sceneConfig || !liveItem) return
    const scene = resolveModeScene(mode, modeMapping, sceneConfig)
    if (!scene) return
    void window.wf.zoneSetRouting(liveItem.id, expandScene(scene, liveItem.type))
  }

  const fireQuickCue = (phrase: string): void => {
    void window.wf.liveLoadText(track, 'Announcement', phrase)
  }

  const startTimer = (): void => {
    const secs = parseFloat(timerSecs)
    if (isNaN(secs) || secs <= 0) return
    void window.wf.liveLoadCountdown(track, secs, null, undefined)
  }

  return (
    <section className="surface">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
      >
        <h2 className="section-header">Service Controls</h2>
        {open ? <ChevronUp size={14} className="text-content-secondary" /> : <ChevronDown size={14} className="text-content-secondary" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Mode shortcuts */}
          <div className="grid grid-cols-3 gap-1.5">
            {(['sermon', 'worship', 'invitation'] as ServiceControlMode[]).map((mode) => {
              const scene = sceneConfig ? resolveModeScene(mode, modeMapping, sceneConfig) : null
              const disabled = !scene || !liveItem
              return (
                <button
                  key={mode}
                  onClick={() => applyMode(mode)}
                  disabled={disabled}
                  title={
                    !liveItem
                      ? 'Nothing is live yet'
                      : !scene
                      ? `No scene mapped for ${MODE_LABEL[mode]} (or it was deleted) — set one in Setup`
                      : `Apply the "${scene.name}" scene to what's live now`
                  }
                  className="btn text-xs disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {MODE_LABEL[mode]}
                </button>
              )
            })}
          </div>

          {/* All Mics Muted — stub, waiting on the mixer integration */}
          <button
            disabled
            title="Waiting on the mixer integration to be finished — not wired up yet"
            className="btn w-full justify-center text-xs disabled:cursor-not-allowed disabled:opacity-40"
          >
            <MicOff size={13} /> All Mics Muted
          </button>

          {/* Livestream Check — read-only */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-panel-raised px-3 py-2 text-xs">
            <span className="inline-flex items-center gap-1.5 text-content-secondary"><Radio size={13} /> Livestream</span>
            <span className={`font-semibold ${obs?.connected ? 'text-emerald-400' : 'text-content-tertiary'}`}>
              {obs?.connected ? 'OBS connected' : 'OBS not connected'}
            </span>
          </div>

          {/* Quick Cues */}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-content-secondary">Quick Cues</div>
            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_CUES.map((cue) => (
                <button key={cue} onClick={() => fireQuickCue(cue)} className="btn-pill text-xs">
                  <Mic size={11} /> {cue}
                </button>
              ))}
            </div>
          </div>

          {/* Timer */}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-content-secondary">Timer</div>
            <div className="flex gap-1.5">
              <input
                type="number"
                value={timerSecs}
                onChange={(e) => setTimerSecs(e.target.value)}
                className="w-20 text-xs"
                aria-label="Timer seconds"
              />
              <button onClick={startTimer} className="btn-primary flex-1 justify-center text-xs">
                <TimerIcon size={12} /> Start
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default ServiceControlsDrawer
