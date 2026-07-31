import { useEffect, useState } from 'react'
import { Check, Church, Film, Image as ImageIcon, Sparkles } from 'lucide-react'
import type { ZoneId } from '../../shared/types'

const ZONE_LABELS: Record<ZoneId, string> = {
  1: 'Back Left',
  2: 'Back Right',
  3: 'Lyrics TVs',
  4: 'Stage Monitors'
}

function LogoSettings(): JSX.Element {
  const [logoPath, setLogoPath] = useState<string | null>(null)
  const [logoBg, setLogoBg] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [churchName, setChurchName] = useState('')
  const [zoneScales, setZoneScales] = useState<Record<ZoneId, number>>({ 1: 100, 2: 100, 3: 100, 4: 100 })

  useEffect(() => {
    window.wf.logoGet().then(({ logoPath: p, logoBg: b }) => {
      setLogoPath(p)
      setLogoBg(b)
    })
    window.wf.settingGet('church_name').then((v) => setChurchName(v ?? ''))
    window.wf.zonesGetScales().then(setZoneScales)
  }, [])

  const setZoneScale = (zoneId: ZoneId, percent: number): void => {
    setZoneScales((prev) => ({ ...prev, [zoneId]: percent }))
    window.wf.zonesSetScale(zoneId, percent)
  }

  const saveChurchName = (name: string): void => {
    setChurchName(name)
    window.wf.settingSet('church_name', name.trim() || null)
  }

  const save = (path: string | null, bg: string | null): void => {
    window.wf.logoSet(path, bg).then(() => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  const pickLogo = async (): Promise<void> => {
    const res = await window.wf.dialogOpenFile()
    if (!res.canceled && res.filePaths[0]) {
      setLogoPath(res.filePaths[0])
      save(res.filePaths[0], logoBg)
    }
  }

  const removeLogo = (): void => {
    setLogoPath(null)
    save(null, logoBg)
  }

  const pickBg = async (): Promise<void> => {
    const res = await window.wf.dialogOpenFile()
    if (!res.canceled && res.filePaths[0]) {
      setLogoBg(res.filePaths[0])
      save(logoPath, res.filePaths[0])
    }
  }

  const removeBg = (): void => {
    setLogoBg(null)
    save(logoPath, null)
  }

  const bgName = logoBg ? logoBg.split(/[\\/]/).pop() : null
  const logoName = logoPath ? logoPath.split(/[\\/]/).pop() : null
  const isVideoBg = /\.(mp4|webm|mov|m4v)$/i.test(logoBg ?? '')

  return (
    <div className="h-full overflow-auto bg-gray-50 p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Logo &amp; Background</h1>
        <div className="mt-1 text-sm text-gray-400">
          Configure what shows on your left/right background screens (Zones 1 &amp; 2) when between songs.
        </div>
      </div>

      <div className="mx-auto max-w-xl space-y-5">
        {/* Church Name */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900">Church Name</h2>
          <div className="text-xs text-gray-400 mt-0.5 mb-3">Shown on logo / idle screens when no logo image is set.</div>
          <input
            type="text"
            value={churchName}
            onChange={(e) => saveChurchName(e.target.value)}
            placeholder="e.g. Snow Hill Church"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none"
          />
        </div>

        {/* Church Logo */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Church Logo</h2>
              <div className="text-xs text-gray-400 mt-0.5">Displayed on logo screens between songs</div>
            </div>
            {saved && <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600"><Check size={13} /> Saved</span>}
          </div>

          {/* Logo preview */}
          <div className="mb-4 flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-900">
            {logoPath ? (
              <img
                src={`wf-asset://?path=${encodeURIComponent(logoPath)}`}
                alt="Church logo"
                className="max-h-full max-w-full object-contain p-6"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <div className="text-center">
                <Church size={64} className="mx-auto text-white/20" />
                <div className="mt-2 text-xs text-white/25">Default cross symbol</div>
              </div>
            )}
          </div>

          {logoPath && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
              <ImageIcon size={14} className="shrink-0 text-gray-500" />
              <span className="min-w-0 flex-1 truncate text-xs text-gray-600">{logoName}</span>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={pickLogo}
              className="flex-1 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              {logoPath ? 'Change logo…' : 'Choose logo image…'}
            </button>
            {logoPath && (
              <button
                onClick={removeLogo}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {/* Motion Background */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="font-semibold text-gray-900">Motion Background</h2>
            <div className="text-xs text-gray-400 mt-0.5">
              Plays behind your logo — supports video files (.mp4, .webm) or images (Ken Burns effect)
            </div>
          </div>

          {/* Background preview */}
          <div className="mb-4 flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-900">
            {logoBg ? (
              isVideoBg ? (
                <div className="flex flex-col items-center gap-2">
                  <Film size={32} className="text-white/60" />
                  <div className="text-xs font-semibold text-white/60">{bgName}</div>
                  <div className="text-[10px] text-white/30">Video plays on zone screens</div>
                </div>
              ) : (
                <img
                  src={`wf-asset://?path=${encodeURIComponent(logoBg)}`}
                  alt="Background"
                  className="h-full w-full object-cover opacity-70"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              )
            ) : (
              <div className="text-center">
                <Sparkles size={36} className="mx-auto text-white/40" />
                <div className="mt-2 text-xs text-white/25">Animated gradient (auto)</div>
              </div>
            )}
          </div>

          {logoBg && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
              {isVideoBg ? <Film size={14} className="shrink-0 text-gray-500" /> : <ImageIcon size={14} className="shrink-0 text-gray-500" />}
              <span className="min-w-0 flex-1 truncate text-xs text-gray-600">{bgName}</span>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={pickBg}
              className="flex-1 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              {logoBg ? 'Change background…' : 'Choose background…'}
            </button>
            {logoBg && (
              <button
                onClick={removeBg}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {/* Screen Scale */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="font-semibold text-gray-900">Screen Scale</h2>
            <div className="text-xs text-gray-400 mt-0.5">
              Shrinks or grows what a screen shows, per screen — use this if one physical monitor crops the edges or leaves black bars, without changing anything else.
            </div>
          </div>
          <div className="space-y-3">
            {(Object.keys(ZONE_LABELS) as unknown as ZoneId[]).map((zoneId) => (
              <div key={zoneId} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-xs font-medium text-gray-600">{ZONE_LABELS[zoneId]}</span>
                <input
                  type="range"
                  min={50}
                  max={150}
                  step={1}
                  value={zoneScales[zoneId] ?? 100}
                  onChange={(e) => setZoneScale(zoneId, Number(e.target.value))}
                  className="h-1 flex-1 accent-blue-600"
                />
                <span className="w-12 shrink-0 text-right text-xs font-mono tabular-nums text-gray-500">
                  {zoneScales[zoneId] ?? 100}%
                </span>
                {zoneScales[zoneId] != null && zoneScales[zoneId] !== 100 && (
                  <button
                    onClick={() => setZoneScale(zoneId, 100)}
                    className="shrink-0 text-xs text-gray-400 hover:text-gray-600"
                    title="Reset to 100%"
                  >
                    Reset
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <BackupsPanel />

        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs text-gray-400 leading-relaxed">
            <strong className="text-gray-600">How it works:</strong> Zones 1 &amp; 2 (back-left and back-right screens) show your logo and background whenever the system is between songs or in logo mode.
            If no background is set, a gentle animated gradient plays automatically.
            Video files loop continuously; images use a slow Ken Burns zoom.
          </p>
        </div>
      </div>
    </div>
  )
}

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
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="font-semibold text-gray-900">Backups</h2>
        <div className="text-xs text-gray-400 mt-0.5">
          A snapshot of your whole database (songs, services, announcements) is taken automatically every time the app starts. Restoring rolls everything back to that point and restarts the app.
        </div>
      </div>
      {backups.length === 0 ? (
        <p className="text-xs text-gray-400">No backups yet — one is taken the next time you start the app.</p>
      ) : (
        <ul className="max-h-48 space-y-1 overflow-auto">
          {backups.map((b) => (
            <li key={b.filename} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-gray-50">
              <span className="text-gray-700">{fmtBackupTime(b.timestamp)}</span>
              <button
                onClick={() => restore(b.filename, b.timestamp)}
                disabled={restoring != null}
                className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
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

export default LogoSettings
