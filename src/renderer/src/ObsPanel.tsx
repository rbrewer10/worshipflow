import { useEffect, useState } from 'react'
import type { ObsStatus, SceneContext } from '../../shared/types'

const BLANK_STATUS: ObsStatus = {
  connected: false,
  streaming: false,
  recording: false,
  currentScene: null,
  scenes: [],
  error: null
}

const SCENE_LABELS: Record<SceneContext, string> = {
  worship: '🎵 Songs / Worship',
  word: '📖 Scripture / Sermon',
  countdown: '⏱ Countdown / Welcome'
}

function ObsPanel(): JSX.Element {
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState('4455')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<ObsStatus>(BLANK_STATUS)
  const [connecting, setConnecting] = useState(false)
  const [obsUrl, setObsUrl] = useState('')
  const [autoSwitch, setAutoSwitch] = useState(false)
  const [sceneMap, setSceneMap] = useState<Record<SceneContext, string>>({ worship: '', word: '', countdown: '' })
  const [copied, setCopied] = useState(false)

  const copyUrl = (): void => {
    navigator.clipboard.writeText(obsUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Load saved settings + current status on mount.
  useEffect(() => {
    try {
      const c = localStorage.getItem('wf-obs-conn')
      if (c) { const p = JSON.parse(c); setHost(p.host ?? 'localhost'); setPort(p.port ?? '4455'); setPassword(p.password ?? '') }
      const s = localStorage.getItem('wf-obs-scenes')
      if (s) setSceneMap(JSON.parse(s))
      const a = localStorage.getItem('wf-obs-autoswitch')
      if (a) setAutoSwitch(a === 'true')
    } catch { /* ignore */ }
    window.wf.getObsUrl().then(setObsUrl)
    window.wf.obsGetStatus().then(setStatus)
    const off = window.wf.obsOnStatus(setStatus)
    return off
  }, [])

  // Persist + push auto-switch config to main whenever it changes.
  useEffect(() => {
    localStorage.setItem('wf-obs-scenes', JSON.stringify(sceneMap))
    localStorage.setItem('wf-obs-autoswitch', String(autoSwitch))
    window.wf.obsSetAutoSwitch(autoSwitch, sceneMap)
  }, [autoSwitch, sceneMap])

  const connect = async (): Promise<void> => {
    setConnecting(true)
    localStorage.setItem('wf-obs-conn', JSON.stringify({ host, port, password }))
    const result = await window.wf.obsConnect(host, Number(port) || 4455, password)
    setStatus(result)
    setConnecting(false)
  }

  const disconnect = async (): Promise<void> => {
    await window.wf.obsDisconnect()
  }

  const setCtxScene = (ctx: SceneContext, scene: string): void =>
    setSceneMap((cur) => ({ ...cur, [ctx]: scene }))

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        🎬 OBS Studio
        <span className={`inline-block h-2 w-2 rounded-full ${status.connected ? 'bg-emerald-400' : 'bg-red-500'}`} />
        <span className="text-[10px] normal-case text-slate-500">
          {status.connected ? 'Connected' : 'Not connected'}
        </span>
      </h2>

      <div className="space-y-3">
        {/* Connection */}
        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
          <div className="mb-1.5 text-xs font-semibold text-slate-300">Connection</div>
          <div className="flex flex-wrap gap-1.5">
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="localhost"
              className="w-28 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-slate-300"
            />
            <input
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="4455"
              className="w-16 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-slate-300"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-slate-300"
            />
            {status.connected ? (
              <button onClick={disconnect} className="rounded bg-slate-600/50 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-600/70">
                Disconnect
              </button>
            ) : (
              <button onClick={connect} disabled={connecting} className="rounded bg-blue-600/60 px-3 py-1 text-xs font-semibold text-blue-100 hover:bg-blue-600/80 disabled:opacity-50">
                {connecting ? 'Connecting…' : 'Connect'}
              </button>
            )}
          </div>
          {status.error && !status.connected && (
            <div className="mt-1.5 text-[11px] text-red-400">⚠ {status.error}</div>
          )}
          <div className="mt-1.5 text-[10px] text-slate-500">
            Enable in OBS: Tools → WebSocket Server Settings (OBS 28+).
          </div>
        </div>

        {/* Stream / Record */}
        <div className="grid grid-cols-2 gap-1.5">
          {status.streaming ? (
            <button onClick={() => window.wf.obsStopStream()} className="rounded-lg bg-red-600/70 px-2 py-2 text-xs font-bold text-white hover:bg-red-600">
              ■ Stop Stream
            </button>
          ) : (
            <button onClick={() => window.wf.obsStartStream()} disabled={!status.connected} className="rounded-lg bg-red-600/30 px-2 py-2 text-xs font-bold text-red-200 hover:bg-red-600/50 disabled:opacity-40">
              ● Start Stream
            </button>
          )}
          {status.recording ? (
            <button onClick={() => window.wf.obsStopRecord()} className="rounded-lg bg-amber-600/70 px-2 py-2 text-xs font-bold text-white hover:bg-amber-600">
              ■ Stop Record
            </button>
          ) : (
            <button onClick={() => window.wf.obsStartRecord()} disabled={!status.connected} className="rounded-lg bg-amber-600/30 px-2 py-2 text-xs font-bold text-amber-200 hover:bg-amber-600/50 disabled:opacity-40">
              ● Start Record
            </button>
          )}
        </div>
        {(status.streaming || status.recording) && (
          <div className="flex gap-3 text-[11px] font-semibold">
            {status.streaming && <span className="text-red-400">● LIVE streaming</span>}
            {status.recording && <span className="text-amber-400">● Recording</span>}
          </div>
        )}

        {/* Scenes */}
        {status.connected && (
          <div className="rounded-lg border border-white/10 bg-black/20 p-2">
            <div className="mb-1.5 text-xs font-semibold text-slate-300">Scenes</div>
            <div className="flex flex-wrap gap-1.5">
              {status.scenes.length === 0 && <span className="text-xs text-slate-600">No scenes found.</span>}
              {status.scenes.map((sc) => (
                <button
                  key={sc}
                  onClick={() => window.wf.obsSetScene(sc)}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                    status.currentScene === sc
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white/10 text-slate-300 hover:bg-white/20'
                  }`}
                >
                  {sc}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Auto-switch */}
        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={autoSwitch} onChange={(e) => setAutoSwitch(e.target.checked)} className="h-4 w-4" />
            <span className="text-xs font-semibold text-slate-300">Auto-switch scenes with the service</span>
          </label>
          {autoSwitch && (
            <div className="mt-2 space-y-1.5">
              {(['worship', 'word', 'countdown'] as const).map((ctx) => (
                <div key={ctx} className="flex items-center gap-2">
                  <span className="w-40 shrink-0 text-[11px] text-slate-400">{SCENE_LABELS[ctx]}</span>
                  <select
                    value={sceneMap[ctx]}
                    onChange={(e) => setCtxScene(ctx, e.target.value)}
                    className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-slate-300"
                  >
                    <option value="">— pick scene —</option>
                    {status.scenes.map((sc) => <option key={sc} value={sc}>{sc}</option>)}
                  </select>
                </div>
              ))}
              {!status.connected && (
                <div className="text-[10px] text-slate-500">Connect to OBS to choose scenes.</div>
              )}
            </div>
          )}
        </div>

        {/* Overlay URL */}
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2">
          <div className="mb-1 text-xs font-semibold text-slate-300">Lyrics overlay (Browser Source)</div>
          <div className="flex gap-1.5">
            <div className="flex-1 rounded bg-black/30 px-2 py-1.5 text-center font-mono text-[11px] text-emerald-300 break-all">
              {obsUrl || '…'}
            </div>
            <button
              onClick={copyUrl}
              disabled={!obsUrl}
              className={`shrink-0 rounded px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-40 ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
              }`}
            >
              {copied ? '✓ Copied' : '📋 Copy'}
            </button>
          </div>
          <div className="mt-1 text-[10px] text-slate-500">
            In OBS add a Browser Source with this URL (transparent background) for live lyrics on stream.
          </div>
        </div>
      </div>
    </section>
  )
}

export default ObsPanel
