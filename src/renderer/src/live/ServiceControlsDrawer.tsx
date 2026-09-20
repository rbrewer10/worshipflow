// src/renderer/src/live/ServiceControlsDrawer.tsx
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Mic, MicOff, Radio, Timer as TimerIcon } from 'lucide-react'
import type { ObsStatus, TrackId } from '../../../shared/types'
import { notifyLocal } from '../NotifyToasts'

// Quick Cues ride the overlay ticker so lyrics stay on the TVs.
const QUICK_CUES = ['Applause', 'Amen', 'Bible', 'Thank You']

function ServiceControlsDrawer({ track }: { track: TrackId; liveItemId: number | null }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [obs, setObs] = useState<ObsStatus | null>(null)
  const [timerSecs, setTimerSecs] = useState('300')

  useEffect(() => {
    window.wf.obsGetStatus().then(setObs)
    const off = window.wf.obsOnStatus(setObs)
    return off
  }, [])

  const fireQuickCue = (phrase: string): void => {
    void window.wf.liveSetOverlayTicker(track, phrase)
  }

  const startTimer = (): void => {
    const secs = parseFloat(timerSecs)
    if (isNaN(secs) || secs <= 0 || secs > 3600) {
      notifyLocal('Timer must be between 1 and 3600 seconds', 'warn')
      return
    }
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
          {/* Quick cues ride the lower-third overlay so lyrics stay up. */}
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
            <span className={`font-semibold ${obs?.connected ? 'text-emerald-400' : 'text-content-secondary'}`}>
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
