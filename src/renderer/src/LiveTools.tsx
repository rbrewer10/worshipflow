import { type ReactNode, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { MonitorOff, Image as ImageIcon, Play, ShieldAlert, Timer } from 'lucide-react'
import type { LiveState, TrackId } from '../../shared/types'
import { useService } from './ServiceContext'
import { PresenterPanel } from './PresenterPanel'
import { StageMessagePanel } from './StageMessagePanel'
import { TimingPanel } from './TimingPanel'
import { notifyLocal } from './NotifyToasts'
import LiveZoneStatus from './zones/LiveZoneStatus'
import LooksPanel from './zones/LooksPanel'
import ServiceControlsDrawer from './live/ServiceControlsDrawer'

function LiveToolsSection({ title, description, children }: { title: string; description: string; children: ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-panel-raised">
      <button
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-panel"
      >
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-content-primary">{title}</span>
          <span className="mt-0.5 block truncate text-[11px] text-content-tertiary">{description}</span>
        </span>
        {open ? <ChevronUp size={14} className="shrink-0 text-content-tertiary" /> : <ChevronDown size={14} className="shrink-0 text-content-tertiary" />}
      </button>
      {open && <div className="space-y-3 border-t border-border p-2">{children}</div>}
    </section>
  )
}

// The Live tab's right-hand control panel for the Main track. Deliberately holds
// only what an operator reaches for *during* a service: the panic row, presenter
// notes, stage messages, and text size/auto-advance. Everything configured once
// and then left alone (zones, tablet PIN, logs, displays) lives under Setup, and
// quick scripture lives in the app-wide bottom drawer — see the 2026-08-01 spec.
// A control added back here should be one that is genuinely used mid-service.
// (Second track gets the leaner SecondTrackTools.)
function LiveTools({ track }: { track: TrackId }): JSX.Element {
  const { activeService } = useService()
  const [live, setLive] = useState<LiveState | null>(null)
  const [stageMsg, setStageMsg] = useState('')
  const [msgSent, setMsgSent] = useState(false)
  const [autoAdvanceSecs, setAutoAdvanceSecs] = useState('10')
  const [autoAdvanceLoop, setAutoAdvanceLoop] = useState(false)

  useEffect(() => {
    const off = window.wf.onState((s) => setLive(track === 'main' ? s.main : s.second))
    window.wf.getState(track).then(setLive)
    return off
  }, [track])
  useEffect(() => { if (!live?.stageMessage) setStageMsg('') }, [live?.stageMessage])

  const liveItem = activeService?.items.find((it) => it.id === live?.liveServiceItemId && it.track === track) ?? null

  const hmsElapsedSecs = live?.hmsLoadedAt ? Math.floor((Date.now() - live.hmsLoadedAt) / 1000) : 0
  const autoAdvanceRunning = live?.autoAdvanceMs != null && live.autoAdvanceMs > 0

  const sendStageMessage = (preset?: string): void => {
    const msg = (preset ?? stageMsg).trim()
    if (!msg) return
    window.wf.liveSetStageMessage(track, msg)
    setMsgSent(true); setTimeout(() => setMsgSent(false), 3000)
  }
  const clearStageMessage = (): void => { setStageMsg(''); window.wf.liveSetStageMessage(track, null) }

  return (
    <aside className="wf-live-tools flex w-96 shrink-0 flex-col gap-4 overflow-auto border-l border-border bg-panel p-4">
      {/* Emergency controls */}
      <div className="flex gap-2">
        <button
          onClick={() => window.wf.sendIntent(track, 'black')}
          className="flex-1 btn bg-black text-white border-white/40"
        >
          <MonitorOff size={14} /> Black
        </button>
        <button
          onClick={() => window.wf.sendIntent(track, 'logo')}
          className="flex-1 btn"
        >
          <ImageIcon size={14} /> Logo
        </button>
        <button
          onClick={() => window.wf.sendIntent(track, 'lyrics')}
          className="flex-1 btn-primary"
        >
          <Play size={14} /> Live
        </button>
      </div>

      {/* Keyboard shortcut strip */}
      <div className="flex justify-around rounded-lg border border-border bg-panel-raised px-2 py-1.5 text-[10px] text-content-secondary">
        <span><span className="font-bold text-content-primary">Space</span> Next</span>
        <span><span className="font-bold text-content-primary">←→</span> Prev/Next</span>
        <span><span className="font-bold text-content-primary">B</span> Black</span>
        <span><span className="font-bold text-content-primary">L</span> Logo</span>
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Presenter notes + timer */}
      <PresenterPanel liveState={live} liveItem={liveItem} />

      {/* Stage message + presets */}
      <StageMessagePanel
        inputValue={stageMsg}
        liveMessage={live?.stageMessage ?? null}
        msgSent={msgSent}
        onInputChange={setStageMsg}
        onSendMessage={sendStageMessage}
        onClearMessage={clearStageMessage}
      />

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Text size + Auto-advance */}
      <TimingPanel
        fontScale={live?.fontScale ?? 6}
        autoAdvanceSecs={autoAdvanceSecs}
        autoAdvanceRunning={autoAdvanceRunning}
        autoAdvanceLoop={autoAdvanceLoop}
        liveState={live}
        onFontScaleDecrease={() => window.wf.liveSetFontScale(track, (live?.fontScale ?? 6) - 0.5)}
        onFontScaleIncrease={() => window.wf.liveSetFontScale(track, (live?.fontScale ?? 6) + 0.5)}
        onFontScaleSave={() => window.wf.liveSaveFontScale(track)}
        onAutoAdvanceSecsChange={setAutoAdvanceSecs}
        onAutoAdvanceStart={() => {
          const secs = parseFloat(autoAdvanceSecs)
          if (isNaN(secs) || secs <= 0 || secs > 3600) {
            notifyLocal('Auto-advance must be between 1 and 3600 seconds', 'warn')
            return
          }
          window.wf.featuresStartAutoAdvance(secs * 1000, autoAdvanceLoop)
        }}
        onAutoAdvanceStop={() => window.wf.featuresStopAutoAdvance()}
        onAutoAdvanceLoopToggle={setAutoAdvanceLoop}
      />

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Status strip: hymn timer + verse */}
      {(hmsElapsedSecs > 0 || live?.verseNumber != null) && (
        <div className="flex gap-2 rounded-lg border border-border bg-panel-raised px-3 py-1.5 text-xs text-content-secondary">
          {hmsElapsedSecs > 0 && <span className="inline-flex items-center gap-1 tabular-nums"><Timer size={12} /> {Math.floor(hmsElapsedSecs / 60)}:{String(hmsElapsedSecs % 60).padStart(2, '0')}</span>}
          {live?.verseNumber != null && <span>· Verse {live.verseNumber}</span>}
        </div>
      )}

      {/* Safety Reset — deliberately loud, always visible; force all 4 zones
          to the logo without touching audio. Relocated from LooksPanel. */}
      <button
        onClick={() => void window.wf.zoneSafetyReset()}
        title="Force all 4 zones to the logo — screens only, doesn't touch audio"
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/20"
      >
        <ShieldAlert size={13} /> Safety Reset
      </button>

      {/* Lower-frequency output and routing controls stay available without
          pushing the operator's primary controls below the fold. */}
      <LiveToolsSection title="Outputs & looks" description="Zone status and saved screen presets">
        <LiveZoneStatus />
        <LooksPanel />
      </LiveToolsSection>

      {/* Sermon/Worship/Invitation Mode, Livestream Check, Quick Cues, Timer */}
      <ServiceControlsDrawer track={track} liveItemId={live?.liveServiceItemId ?? null} />

    </aside>
  )
}

export default LiveTools
