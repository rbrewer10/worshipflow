import { memo } from 'react'
import { Save, Repeat } from 'lucide-react'

interface TimingPanelProps {
  fontScale: number
  autoAdvanceSecs: string
  autoAdvanceRunning: boolean
  autoAdvanceLoop: boolean
  liveState: any
  onFontScaleDecrease: () => void
  onFontScaleIncrease: () => void
  onFontScaleSave: () => void
  onAutoAdvanceSecsChange: (secs: string) => void
  onAutoAdvanceStart: () => void
  onAutoAdvanceStop: () => void
  onAutoAdvanceLoopToggle: (checked: boolean) => void
}

export const TimingPanel = memo(function TimingPanel({
  fontScale,
  autoAdvanceSecs,
  autoAdvanceRunning,
  autoAdvanceLoop,
  liveState,
  onFontScaleDecrease,
  onFontScaleIncrease,
  onFontScaleSave,
  onAutoAdvanceSecsChange,
  onAutoAdvanceStart,
  onAutoAdvanceStop,
  onAutoAdvanceLoopToggle
}: TimingPanelProps): JSX.Element {
  return (
    <>
      {/* Text size */}
      <section className="surface">
        <h2 className="section-header">Text size</h2>
        <div className="flex items-center gap-2">
          <button onClick={onFontScaleDecrease} className="btn">A −</button>
          <span className="text-xs text-slate-500 tabular-nums">{fontScale.toFixed(1)}vw</span>
          <button onClick={onFontScaleIncrease} className="btn">A +</button>
          <button onClick={onFontScaleSave} className="ml-auto btn-pill" title="Save size to current song"><Save size={11} /> Save</button>
        </div>
      </section>

      {/* Divider */}
      <div className="border-t border-slate-200" />

      {/* Auto-advance */}
      <section className="surface">
        <div className="mb-2 flex items-center justify-between">
          <span className="section-header inline-block">Auto-Advance</span>
          {autoAdvanceRunning && (
            <span className="inline-flex items-center gap-1 badge">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              running{autoAdvanceLoop && <Repeat size={10} />}
            </span>
          )}
        </div>
        {autoAdvanceRunning && (
          <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-none"
              style={{ width: `${Math.min(100, ((liveState?.autoAdvanceMs ?? 0) / (parseFloat(autoAdvanceSecs) * 1000)) * 100)}%` }}
            />
          </div>
        )}
        <div className="flex gap-1.5">
          <input type="number" value={autoAdvanceSecs} onChange={(e) => onAutoAdvanceSecsChange(e.target.value)} className="w-16 text-xs" />
          <button onClick={onAutoAdvanceStart} className="flex-1 btn-primary text-xs">Start</button>
          <button onClick={onAutoAdvanceStop} className="flex-1 btn text-xs">Stop</button>
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={autoAdvanceLoop} onChange={(e) => onAutoAdvanceLoopToggle(e.target.checked)} className="h-3.5 w-3.5" />
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-600"><Repeat size={11} /> Loop back to start at the end</span>
        </label>
      </section>
    </>
  )
})
