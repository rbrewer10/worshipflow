import { useEffect, useState } from 'react'

function LogoSettings(): JSX.Element {
  const [logoPath, setLogoPath] = useState<string | null>(null)
  const [logoBg, setLogoBg] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.wf.logoGet().then(({ logoPath: p, logoBg: b }) => {
      setLogoPath(p)
      setLogoBg(b)
    })
  }, [])

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
        <div className="text-xl font-semibold text-gray-900">Logo &amp; Background</div>
        <div className="mt-1 text-sm text-gray-400">
          Configure what shows on your left/right background screens (Zones 1 &amp; 2) when between songs.
        </div>
      </div>

      <div className="mx-auto max-w-xl space-y-5">
        {/* Church Logo */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="font-semibold text-gray-900">Church Logo</div>
              <div className="text-xs text-gray-400 mt-0.5">Displayed on logo screens between songs</div>
            </div>
            {saved && <span className="text-xs font-semibold text-emerald-600">✓ Saved</span>}
          </div>

          {/* Logo preview */}
          <div className="mb-4 flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-900">
            {logoPath ? (
              <img
                src={`http://localhost:3691/file?path=${encodeURIComponent(logoPath)}`}
                alt="Church logo"
                className="max-h-full max-w-full object-contain p-6"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <div className="text-center">
                <div className="text-6xl font-black text-white/20">✝</div>
                <div className="mt-2 text-xs text-white/25">Default cross symbol</div>
              </div>
            )}
          </div>

          {logoPath && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
              <span className="text-blue-500">🖼</span>
              <span className="min-w-0 flex-1 truncate text-xs text-blue-700">{logoName}</span>
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
            <div className="font-semibold text-gray-900">Motion Background</div>
            <div className="text-xs text-gray-400 mt-0.5">
              Plays behind your logo — supports video files (.mp4, .webm) or images (Ken Burns effect)
            </div>
          </div>

          {/* Background preview */}
          <div className="mb-4 flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-900">
            {logoBg ? (
              isVideoBg ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="text-3xl">🎬</div>
                  <div className="text-xs font-semibold text-white/60">{bgName}</div>
                  <div className="text-[10px] text-white/30">Video plays on zone screens</div>
                </div>
              ) : (
                <img
                  src={`http://localhost:3691/file?path=${encodeURIComponent(logoBg)}`}
                  alt="Background"
                  className="h-full w-full object-cover opacity-70"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              )
            ) : (
              <div className="text-center">
                <div className="text-4xl">✨</div>
                <div className="mt-2 text-xs text-white/25">Animated gradient (auto)</div>
              </div>
            )}
          </div>

          {logoBg && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-violet-50 border border-violet-100 px-3 py-2">
              <span>{isVideoBg ? '🎬' : '🖼'}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-violet-700">{bgName}</span>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={pickBg}
              className="flex-1 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-100"
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

export default LogoSettings
