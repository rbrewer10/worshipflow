import { useEffect, useState } from 'react'
import { MonitorOff, Image as ImageIcon, Play, Timer } from 'lucide-react'
import type { LiveState, TrackId } from '../../shared/types'
import { useService } from './ServiceContext'
import { PresenterPanel } from './PresenterPanel'
import { StageMessagePanel } from './StageMessagePanel'
import { TimingPanel } from './TimingPanel'
import { notifyLocal } from './NotifyToasts'

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
    <aside className="flex w-96 shrink-0 flex-col gap-4 overflow-auto border-l border-border bg-panel p-4">
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

    </aside>
  )
}

export default LiveTools
