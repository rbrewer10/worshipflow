import { useState } from 'react'
import type { TrackId } from '../../shared/types'

function OverlayTickerPanel({ track, value }: { track: TrackId; value: string | null }): JSX.Element {
  const [text, setText] = useState('')

  const send = (next: string | null): void => {
    void window.wf.liveSetOverlayTicker(track, next && next.trim() ? next.trim() : null)
    if (!next) setText('')
  }

  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-content-tertiary">Lower third</div>
      <div className="flex gap-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(text) }}
          placeholder={value || 'Announcement over lyrics…'}
          className="min-w-0 flex-1 rounded-lg border border-border bg-panel px-2 py-1.5 text-xs outline-none focus:border-blue-500"
        />
        <button onClick={() => send(text)} disabled={!text.trim()} className="rounded-lg bg-amber-600 px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
          Show
        </button>
        {value && (
          <button onClick={() => send(null)} className="rounded-lg border border-border px-2 py-1.5 text-xs font-semibold text-content-secondary">
            Clear
          </button>
        )}
      </div>
      {value && <p className="mt-1 truncate text-[11px] text-amber-400">Live: {value}</p>}
    </div>
  )
}

export default OverlayTickerPanel
