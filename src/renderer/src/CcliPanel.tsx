import { useEffect, useState } from 'react'
import type { SongUsage } from '../../shared/types'

function fmtDate(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function csvCell(v: string | null): string {
  const s = (v ?? '').replace(/"/g, '""')
  return `"${s}"`
}

// CCLI license setting + song usage report (for annual CCLI reporting).
function CcliPanel(): JSX.Element {
  const [license, setLicense] = useState('')
  const [showReport, setShowReport] = useState(false)
  const [usage, setUsage] = useState<SongUsage[]>([])
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    window.wf.ccliGetLicense().then((l) => setLicense(l ?? ''))
  }, [])

  const saveLicense = (val: string): void => {
    setLicense(val)
    window.wf.ccliSetLicense(val.trim() || null)
  }

  const openReport = (): void => {
    window.wf.ccliListUsage().then((u) => { setUsage(u); setShowReport(true) })
  }

  const exportCsv = (): void => {
    const header = ['Date', 'Title', 'Author', 'CCLI Song #', 'Copyright']
    const rows = usage.map((u) => [
      csvCell(fmtDate(u.usedAt)),
      csvCell(u.title),
      csvCell(u.author),
      csvCell(u.ccli),
      csvCell(u.copyright)
    ].join(','))
    const csv = [header.map(csvCell).join(','), ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ccli-usage-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const clearLog = (): void => {
    window.wf.ccliClearUsage().then(() => { setUsage([]); setConfirmClear(false) })
  }

  return (
    <div className="mb-3 rounded-lg border border-white/10 bg-black/20 p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">© CCLI</span>
        <button
          onClick={openReport}
          className="rounded px-2 py-0.5 text-[11px] font-semibold text-purple-300 hover:text-purple-200"
        >
          📊 Usage Report
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs text-slate-400">License #</span>
        <input
          value={license}
          onChange={(e) => saveLicense(e.target.value)}
          placeholder="e.g. 1234567"
          className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-slate-200 outline-none focus:border-blue-500"
        />
      </div>
      <div className="mt-1 text-[10px] text-slate-500">Shown on the projector footer for song slides.</div>

      {/* Usage report modal */}
      {showReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setShowReport(false)}>
          <div
            className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-[var(--wf-bg-secondary)] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-200">CCLI Song Usage ({usage.length})</h3>
              <div className="flex gap-2">
                <button
                  onClick={exportCsv}
                  disabled={usage.length === 0}
                  className="rounded bg-emerald-600/70 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
                >
                  ⬇ Export CSV
                </button>
                <button
                  onClick={() => setConfirmClear(true)}
                  disabled={usage.length === 0}
                  className="rounded bg-red-600/40 px-3 py-1 text-xs font-bold text-red-200 hover:bg-red-600/60 disabled:opacity-40"
                >
                  Clear
                </button>
                <button onClick={() => setShowReport(false)} className="rounded bg-white/10 px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-white/20">
                  Close
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {usage.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No songs used yet. Songs are logged automatically when they go live.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[var(--wf-bg-secondary)] text-slate-500">
                    <tr>
                      <th className="py-1 pr-3 font-semibold">When</th>
                      <th className="py-1 pr-3 font-semibold">Title</th>
                      <th className="py-1 pr-3 font-semibold">Author</th>
                      <th className="py-1 font-semibold">CCLI #</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.map((u) => (
                      <tr key={u.id} className="border-t border-white/5">
                        <td className="py-1 pr-3 text-slate-500">{fmtDate(u.usedAt)}</td>
                        <td className="py-1 pr-3 text-slate-200">{u.title}</td>
                        <td className="py-1 pr-3 text-slate-400">{u.author || '—'}</td>
                        <td className="py-1 text-slate-400">{u.ccli || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {confirmClear && (
              <div className="mt-3 flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 p-2">
                <span className="text-xs text-red-200">Clear the entire usage log? This cannot be undone.</span>
                <div className="flex gap-2">
                  <button onClick={clearLog} className="rounded bg-red-600 px-3 py-1 text-xs font-bold text-white">Yes, clear</button>
                  <button onClick={() => setConfirmClear(false)} className="rounded bg-white/10 px-3 py-1 text-xs text-slate-300">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default CcliPanel
