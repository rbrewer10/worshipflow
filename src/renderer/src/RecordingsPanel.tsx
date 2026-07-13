import { JSX, useEffect, useState } from 'react'
import type { RecordingRow } from '../../shared/types'

function fmtDuration(startedAt: number, endedAt: number | null): string {
  if (endedAt == null) return '—'
  const mins = Math.round((endedAt - startedAt) / 60000)
  return mins > 0 ? `${mins} min` : '—'
}

export function RecordingsPanel(): JSX.Element {
  const [rows, setRows] = useState<RecordingRow[]>([])

  useEffect(() => {
    void window.wf.recordingsList().then(setRows)
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
          {r.filePath && (
            <div className="mt-0.5 truncate text-slate-400" title={r.filePath}>{r.filePath}</div>
          )}
          {r.endedAt == null && <div className="mt-0.5 font-semibold text-amber-600">Recording…</div>}
        </li>
      ))}
    </ul>
  )
}
