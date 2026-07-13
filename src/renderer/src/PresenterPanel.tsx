import { useEffect, useState } from 'react'
import type { LiveState, ServiceItem } from '../../shared/types'

interface PresenterPanelProps {
  liveState: LiveState | null
  liveItem: ServiceItem | null
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function PresenterPanel({ liveState, liveItem }: PresenterPanelProps): JSX.Element {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      if (liveState?.hmsLoadedAt) {
        setElapsed(Math.floor((Date.now() - liveState.hmsLoadedAt) / 1000))
      }
    }, 100)
    return () => clearInterval(interval)
  }, [liveState?.hmsLoadedAt])

  const hasNotes = liveItem?.notes && liveItem.notes.trim().length > 0
  const showNotes = liveState && liveState.liveServiceItemId != null

  return (
    <section className="surface">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="section-header">Presenter Notes</h3>
        {showNotes && (
          <div className="text-sm font-mono font-bold text-blue-700 tabular-nums">
            {formatTime(elapsed)}
          </div>
        )}
      </div>

      {!showNotes ? (
        <p className="text-sm text-slate-500">No item loaded</p>
      ) : hasNotes ? (
        <div className="space-y-2">
          <div className="surface max-h-48 overflow-y-auto">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {liveItem?.notes}
            </p>
          </div>
          <div className="text-xs text-slate-500">
            {liveItem?.type} · {liveItem?.title}
          </div>
        </div>
      ) : (
        <div className="surface text-center">
          <p className="text-sm text-slate-500">
            No notes for this item.{' '}
            <span className="block text-xs text-slate-400 mt-1">
              Add notes in the service editor to display them here.
            </span>
          </p>
        </div>
      )}
    </section>
  )
}
