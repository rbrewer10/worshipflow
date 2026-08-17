import { useEffect, useState } from 'react'
import { FileText, FolderOpen } from 'lucide-react'
import type { AppInfo } from '../../../shared/types'

function fmtBackupTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// The app already takes a full database backup on every launch (see
// createTimestampedBackup, main process) — this just closes the gap between
// "backups silently exist" and "an operator can actually use one" without
// touching the filesystem by hand.
function BackupsPanel(): JSX.Element {
  const [backups, setBackups] = useState<{ filename: string; timestamp: number }[]>([])
  const [restoring, setRestoring] = useState<string | null>(null)

  useEffect(() => { window.wf.backupsList().then(setBackups) }, [])

  const restore = (filename: string, timestamp: number): void => {
    const when = fmtBackupTime(timestamp)
    if (!confirm(
      `Restore the database to how it was on ${when}?\n\n` +
      'Everything added or changed since then will be gone. The app will ' +
      'restart automatically — your current database is also backed up first, ' +
      'just in case.'
    )) return
    setRestoring(filename)
    window.wf.backupsRestore(filename).catch((err) => {
      setRestoring(null)
      alert(`Restore failed: ${err instanceof Error ? err.message : String(err)}`)
    })
  }

  return (
    <div className="rounded-xl border border-border bg-panel p-5">
      <div className="mb-4">
        <h2 className="font-semibold text-content-primary">Backups</h2>
        <div className="mt-0.5 text-xs text-content-secondary">
          A snapshot of your whole database (songs, services, announcements) is taken automatically every time the app starts. Restoring rolls everything back to that point and restarts the app.
        </div>
      </div>
      {backups.length === 0 ? (
        <p className="text-xs text-content-secondary">No backups yet — one is taken the next time you start the app.</p>
      ) : (
        <ul className="max-h-48 space-y-1 overflow-auto">
          {backups.map((b) => (
            <li key={b.filename} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-panel-raised">
              <span className="text-content-primary">{fmtBackupTime(b.timestamp)}</span>
              <button
                onClick={() => restore(b.filename, b.timestamp)}
                disabled={restoring != null}
                className="rounded-md border border-border bg-panel-raised px-2.5 py-1 font-semibold text-content-secondary hover:bg-border-strong disabled:opacity-50"
              >
                {restoring === b.filename ? 'Restoring…' : 'Restore'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DiagnosticsTab(): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [serviceLog, setServiceLog] = useState<Array<{ ts: number; event: string }>>([])

  useEffect(() => { window.wf.getInfo().then(setInfo) }, [])

  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="mb-1 text-lg font-semibold text-content-primary">Diagnostics &amp; backups</h1>
          <p className="text-sm text-content-secondary">
            What the app can see, what it has been doing, and how to roll it back.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-panel p-5">
          <h2 className="mb-2 font-semibold text-content-primary">Displays</h2>
          <div className="text-sm text-content-secondary">
            <b className="text-content-primary">{info?.displays.length ?? '…'}</b> display(s) ·{' '}
            <span className={info && info.outputs > 0 ? 'text-blue-400' : 'text-amber-400'}>
              {info?.outputs ?? 0} live
            </span>
          </div>
          <div className="mt-1 space-y-0.5 text-sm text-content-secondary">
            {info?.displays.map((d) => (
              <div key={d.id}>
                • {d.bounds.width}×{d.bounds.height}
                {d.primary && <span className="ml-1 text-blue-400">(primary)</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-panel p-5">
          <h2 className="mb-3 font-semibold text-content-primary">Service log</h2>
          <div className="flex gap-2">
            <button onClick={() => window.wf.featuresGetServiceLog().then(setServiceLog)} className="btn text-xs">
              <FileText size={13} /> Load service log ({serviceLog.length})
            </button>
            <button onClick={() => window.wf.logsOpenFolder()} className="btn text-xs">
              <FolderOpen size={13} /> Open log folder
            </button>
          </div>
          {serviceLog.length > 0 && (
            <div className="mt-3 max-h-64 space-y-0.5 overflow-auto rounded-lg bg-panel-raised p-3 text-xs text-content-secondary">
              {serviceLog.slice().reverse().map((e, i) => (
                <div key={i}>
                  <span className="text-content-tertiary">{new Date(e.ts).toLocaleTimeString()}</span> {e.event}
                </div>
              ))}
            </div>
          )}
        </div>

        <BackupsPanel />
      </div>
    </div>
  )
}

export default DiagnosticsTab
