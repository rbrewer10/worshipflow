import { JSX, useEffect, useState } from 'react'
import type { RecordingRow } from '../../shared/types'

function fmtDuration(startedAt: number, endedAt: number | null): string {
  if (endedAt == null) return '—'
  const mins = Math.round((endedAt - startedAt) / 60000)
  return mins > 0 ? `${mins} min` : '—'
}

export function RecordingsPanel(): JSX.Element {
  const [rows, setRows] = useState<RecordingRow[]>([])
  const [progress, setProgress] = useState<Record<number, number>>({})

  const refresh = (): void => { void window.wf.recordingsList().then(setRows) }
  useEffect(() => {
    refresh()
    const off = window.wf.onRenderProgress(({ recordingId, fraction }) => {
      setProgress((p) => ({ ...p, [recordingId]: fraction }))
      if (fraction >= 1) setTimeout(refresh, 800)
    })
    return off
  }, [])

  if (rows.length === 0) {
    return <p className="text-[11px] text-slate-500">No recordings yet. Recordings start automatically when you go live.</p>
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.id} className="rounded border border-slate-200 bg-white p-2 text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-700">{new Date(r.startedAt).toLocaleString()}</span>
            <span className="shrink-0 text-slate-500">{fmtDuration(r.startedAt, r.endedAt)}</span>
          </div>
          <div className="mt-0.5 text-slate-500">{r.markerCount ?? 0} chapters</div>

          {r.renderState === 'rendering' ? (
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded bg-slate-200">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round((progress[r.id] ?? 0) * 100)}%` }} />
              </div>
              <button onClick={() => void window.wf.cancelRender(r.id)} className="mt-1 text-rose-600 hover:underline">Cancel</button>
            </div>
          ) : r.renderState === 'done' && r.outputPath ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-emerald-600">Produced</span>
              <button onClick={() => void window.wf.revealOutput(r.outputPath!)} className="text-slate-600 hover:underline">Reveal file</button>
              <ProduceButton row={r} onDone={refresh} label="Re-produce" />
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              {r.renderState === 'failed' && <span className="text-rose-600">Failed</span>}
              {r.filePath ? <ProduceButton row={r} onDone={refresh} label="Produce video" />
                          : <span className="text-slate-400">No file</span>}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function ProduceButton({ row, onDone, label }: { row: RecordingRow; onDone: () => void; label: string }): JSX.Element {
  const [open, setOpen] = useState(false)
  const durMs = row.endedAt != null ? row.endedAt - row.startedAt : 0
  // Empty fields mean "auto" — produce with no override so computeTrim's default
  // (start at first song/sermon, skip the countdown) applies. A filled field
  // becomes an explicit operator override.
  const [startSec, setStartSec] = useState('')
  const [endSec, setEndSec] = useState('')

  const start = async (): Promise<void> => {
    setOpen(false)
    const hasOverride = startSec.trim() !== '' || endSec.trim() !== ''
    await window.wf.produceRecording(row.id, hasOverride ? {
      startMs: Math.max(0, Math.round(parseFloat(startSec || '0') * 1000)),
      endMs: Math.round(parseFloat(endSec || String(Math.floor(durMs / 1000))) * 1000)
    } : undefined)
    onDone()
  }

  if (!open) return <button onClick={() => setOpen(true)} className="text-emerald-700 hover:underline">{label}</button>
  return (
    <span className="flex items-center gap-1">
      <span className="text-slate-500">start</span>
      <input value={startSec} placeholder="auto" onChange={(e) => setStartSec(e.target.value)} className="w-14 rounded border border-slate-300 px-1" />
      <span className="text-slate-500">end (s)</span>
      <input value={endSec} placeholder="auto" onChange={(e) => setEndSec(e.target.value)} className="w-16 rounded border border-slate-300 px-1" />
      <button onClick={() => void start()} className="text-emerald-700 hover:underline">Go</button>
      <button onClick={() => setOpen(false)} className="text-slate-400 hover:underline">✕</button>
    </span>
  )
}
