import { useEffect, useState } from 'react'
import type { LiveState } from '../../shared/types'
import { useChurchName } from './useChurchName'

// Stage / confidence monitor — shown on a screen facing the pastor or worship leader.
// Displays: current slide, next slide, clock, song title + progress, stage messages.
function Stage(): JSX.Element {
  const [live, setLive] = useState<LiveState | null>(null)
  const [time, setTime] = useState('')
  const [msgDismissed, setMsgDismissed] = useState<string | null>(null)
  const churchName = useChurchName()

  useEffect(() => {
    const off = window.wf.onState((s) => {
      setLive(s)
      // Auto-show new messages (clear dismissed state when message changes).
      setMsgDismissed((prev) => (prev !== s.stageMessage ? null : prev))
    })
    window.wf.getState().then(setLive)

    const tick = (): void => {
      const now = new Date()
      const h = now.getHours()
      const m = String(now.getMinutes()).padStart(2, '0')
      const ampm = h >= 12 ? 'PM' : 'AM'
      setTime(`${h % 12 || 12}:${m} ${ampm}`)
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => { off(); clearInterval(t) }
  }, [])

  const mode = live?.mode ?? 'lyrics'
  const isBlack = mode === 'black'
  const isLogo = mode === 'logo'
  const isCountdown = mode === 'countdown'

  const currentText =
    isBlack ? '— Black —' :
    isLogo ? `✝ ${churchName}` :
    isCountdown ? live?.line ?? '' :
    live?.line ?? ''

  const nextText = (!isBlack && !isLogo && !isCountdown) ? (live?.next ?? '') : ''

  const stageMsg = live?.stageMessage ?? null
  const showMsg = stageMsg && stageMsg !== msgDismissed

  return (
    <div className="flex h-screen flex-col bg-[#060912] text-white" style={{ cursor: 'none' }}>
      {/* Stage message banner — pulsing glow + blinking icon, but text stays solid. */}
      {showMsg && (
        <div className="stage-alert flex items-center gap-4 bg-amber-400 px-6 py-4 text-black">
          <span className="blink-icon shrink-0 text-3xl">📢</span>
          <span className="flex-1 text-3xl font-extrabold leading-tight">{stageMsg}</span>
          <button
            onClick={() => setMsgDismissed(stageMsg)}
            className="shrink-0 rounded bg-black/25 px-5 py-2 text-base font-bold hover:bg-black/40"
            style={{ cursor: 'pointer' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top bar: clock + item info */}
      <div className="flex items-center justify-between border-b border-white/[0.07] px-8 py-3">
        <div className="text-sm font-semibold text-slate-400">
          {live?.songTitle || 'WorshipFlow Stage'}
          {live && live.total > 0 && mode === 'lyrics' && (
            <span className="ml-3 font-mono text-slate-600">
              {live.index + 1} / {live.total}
            </span>
          )}
        </div>
        <div className="font-mono text-xl font-bold text-slate-300">{time}</div>
      </div>

      {/* Current slide */}
      <div className="flex flex-1 flex-col items-center justify-center px-16 text-center">
        {isCountdown ? (
          <>
            <div className="mb-4 text-xl font-semibold uppercase tracking-[0.3em] text-blue-400">
              Service begins in
            </div>
            <div className="font-mono text-[18vw] font-black leading-none tabular-nums text-white">
              {live?.line ?? ''}
            </div>
          </>
        ) : (
          <div
            className={`text-[5.5vw] font-bold leading-tight ${
              isBlack ? 'text-slate-700' : isLogo ? 'text-blue-300' : 'text-white'
            }`}
            style={{ whiteSpace: 'pre-line' }}
          >
            {currentText || <span className="text-slate-700 italic">Nothing loaded</span>}
          </div>
        )}
      </div>

      {/* Divider + next slide */}
      <div className="border-t border-white/[0.07] px-16 py-6">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-600">
          Next
        </div>
        <div className="text-[2.5vw] font-medium text-slate-500" style={{ whiteSpace: 'pre-line' }}>
          {nextText || <span className="italic text-slate-700">—</span>}
        </div>
      </div>
    </div>
  )
}

export default Stage
