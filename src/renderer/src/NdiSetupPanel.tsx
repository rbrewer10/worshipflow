import { useEffect, useState } from 'react'
import { Copy, Radio } from 'lucide-react'
import type { NdiRuntimeStatus } from '../../shared/ndiRuntime'
import { overlayUrl, recommendedSourceName } from '../../shared/ndiRuntime'

function NdiSetupPanel({ serverIp, tabletPort }: { serverIp: string; tabletPort: number | null }): JSX.Element {
  const [ndi, setNdi] = useState<NdiRuntimeStatus | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const url = tabletPort ? overlayUrl(serverIp, tabletPort) : '…'

  useEffect(() => {
    void window.wf.ndiGetStatus().then(setNdi)
  }, [])

  const copy = (value: string, key: string): void => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-5">
      <div className="mb-2 flex items-center gap-2 font-semibold text-content-primary">
        <Radio size={15} /> Stream & NDI
      </div>
      <p className="mb-3 text-xs text-content-secondary">
        WorshipFlow does not put NDI inside the live engine (a native crash would take down the TVs). Use one of these paths.
      </p>

      <div className="mb-3 rounded-lg border border-border bg-panel p-3">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-content-tertiary">1. Best for Sunday — OBS Browser Source</div>
        <div className="mt-1.5 flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all font-mono text-xs text-amber-300">{url}</code>
          <button onClick={() => copy(url, 'url')} className="shrink-0 rounded border border-border px-2 py-1 text-[11px] text-content-secondary">
            {copied === 'url' ? 'Copied' : <Copy size={12} />}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-content-secondary">
          On the stream PC: Sources → Browser → 1920×1080, <strong className="text-content-primary">Shutdown source when not visible off</strong>, Custom CSS empty, <strong className="text-content-primary">transparent background</strong>. Lyrics + lower third follow the booth with alpha. No NDI required.
        </p>
      </div>

      <div className="mb-3 rounded-lg border border-border bg-panel p-3">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-content-tertiary">2. Need NDI on a switcher — DistroAV in OBS</div>
        <p className="mt-1.5 text-[11px] text-content-secondary">
          Install <span className="text-content-primary">DistroAV</span> (was OBS-NDI) + NDI Runtime 6 on the stream PC. OBS Tools → DistroAV → enable Main Output. The switcher/vMix/ATEM then sees OBS as an NDI source. WorshipFlow already drives OBS scenes over WebSocket.
        </p>
        <div className="mt-2 text-[11px] text-content-secondary">
          This PC: {ndi == null ? 'checking NDI Runtime…' : ndi.found
            ? <span className="text-emerald-400">NDI Runtime {ndi.version} found</span>
            : <span className="text-amber-400">NDI Runtime not found — download from ndi.video (already used here for other gear)</span>}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-panel p-3">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-content-tertiary">3. Native “{recommendedSourceName()}” sender — not in this build</div>
        <p className="mt-1.5 text-[11px] text-content-secondary">
          ProPresenter-style: an offscreen 1080p overlay painted into NDI BGRA from a <em>child process</em>, so a DLL fault cannot black the house. Requires packaging <code className="text-content-primary">grandi</code> (NDI 6 bindings) and turning electron-builder rebuild back on for that addon only. Do not load NDI in the main process.
        </p>
      </div>
    </div>
  )
}

export default NdiSetupPanel
