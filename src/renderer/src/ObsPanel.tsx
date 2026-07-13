import { useEffect, useState } from 'react'
import { Video, Copy, Check, TriangleAlert, RefreshCw, Music, BookOpen, Timer } from 'lucide-react'
import type { ObsStatus, SceneContext } from '../../shared/types'
import { RecordingsPanel } from './RecordingsPanel'

const BLANK_STATUS: ObsStatus = {
  connected: false,
  streaming: false,
  recording: false,
  currentScene: null,
  scenes: [],
  error: null,
  streamStartedAt: null,
  recordStartedAt: null,
  reconnecting: false
}

const SCENE_LABELS: Record<SceneContext, { Icon: typeof Music; label: string }> = {
  worship: { Icon: Music, label: 'Songs / Worship' },
  word: { Icon: BookOpen, label: 'Scripture / Sermon' },
  countdown: { Icon: Timer, label: 'Countdown / Welcome' }
}

function elapsed(startedAt: number | null, now: number): string {
  if (!startedAt) return '0:00'
  const s = Math.max(0, Math.floor((now - startedAt) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`
}

function ObsPanel(): JSX.Element {
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState('4455')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<ObsStatus>(BLANK_STATUS)
  const [connecting, setConnecting] = useState(false)
  const [editingConn, setEditingConn] = useState(false)
  const [obsUrl, setObsUrl] = useState('')
  const [autoSwitch, setAutoSwitch] = useState(false)
  const [sceneMap, setSceneMap] = useState<Record<SceneContext, string>>({ worship: '', word: '', countdown: '' })
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [autoRecord, setAutoRecord] = useState(true)

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

  // Load the auto-record setting on mount.
  useEffect(() => {
    void window.wf.getAutoRecord().then(setAutoRecord)
  }, [])

  const toggleAutoRecord = (): void => {
    const next = !autoRecord
    setAutoRecord(next)
    void window.wf.setAutoRecord(next)
  }

  // Persist + push auto-switch config to main whenever it changes.
  useEffect(() => {
    localStorage.setItem('wf-obs-scenes', JSON.stringify(sceneMap))
    localStorage.setItem('wf-obs-autoswitch', String(autoSwitch))
    window.wf.obsSetAutoSwitch(autoSwitch, sceneMap)
  }, [autoSwitch, sceneMap])

  // Tick a local clock only while on-air, for the elapsed readout.
  const onAir = status.streaming || status.recording
  useEffect(() => {
    if (!onAir) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [onAir])

  const connect = async (): Promise<void> => {
    setConnecting(true)
    localStorage.setItem('wf-obs-conn', JSON.stringify({ host, port, password }))
    const result = await window.wf.obsConnect(host, Number(port) || 4455, password)
    setStatus(result)
    setConnecting(false)
    if (result.connected) setEditingConn(false)
  }

  const disconnect = async (): Promise<void> => {
    await window.wf.obsDisconnect()
  }

  const setCtxScene = (ctx: SceneContext, scene: string): void =>
    setSceneMap((cur) => ({ ...cur, [ctx]: scene }))

  const statusPill = status.connected
    ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold normal-case text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Connected</span>
    : status.reconnecting
    ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold normal-case text-amber-700"><RefreshCw size={10} className="animate-spin" /> Reconnecting…</span>
    : <span className="inline-flex items-center gap-1 text-[10px] font-semibold normal-case text-slate-500"><span className="h-2 w-2 rounded-full bg-slate-400" /> Not connected</span>

  return (
    <section className="rounded-xl border border-slate-200 bg-[#f4f6f9] p-3">
      <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
        <Video size={13} /> OBS Studio
        <span className="ml-auto">{statusPill}</span>
      </h2>

      <div className="space-y-3">
        {/* Connection — compact once connected, full form otherwise */}
        {status.connected && !editingConn ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-700">OBS connected</div>
              <div className="truncate font-mono text-[11px] text-slate-500">{host || 'localhost'}:{port || '4455'}</div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button onClick={() => setEditingConn(true)} className="btn-pill text-[11px]">Edit</button>
              <button onClick={disconnect} className="btn-pill text-[11px]">Disconnect</button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-100 p-2">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Connection</span>
              {status.connected && (
                <button onClick={() => setEditingConn(false)} className="text-[11px] text-slate-500 hover:text-slate-700">Cancel</button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="localhost"
                className="w-28 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
              />
              <input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="4455"
                className="w-16 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password"
                className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
              />
              <button onClick={connect} disabled={connecting} className="rounded bg-emerald-600/80 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">
                {connecting ? 'Connecting…' : status.connected ? 'Reconnect' : 'Connect'}
              </button>
            </div>
            {status.error && !status.connected && !status.reconnecting && (
              <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-red-600"><TriangleAlert size={11} /> {status.error}</div>
            )}
            {status.reconnecting && !status.connected && (
              <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-amber-700"><RefreshCw size={11} className="animate-spin" /> Trying to reach OBS… it will connect automatically once OBS is running.</div>
            )}
            <div className="mt-1.5 text-[10px] text-slate-500">
              Enable in OBS: Tools → WebSocket Server Settings (OBS 28+). WorshipFlow reconnects automatically next time.
            </div>
          </div>
        )}

        {/* Stream / Record */}
        <div className="grid grid-cols-2 gap-1.5">
          {status.streaming ? (
            <button onClick={() => window.wf.obsStopStream()} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600/80 px-2 py-2 text-xs font-bold text-white hover:bg-red-600">
              <span className="h-2 w-2 rounded-[2px] bg-white" /> Stop Stream
            </button>
          ) : (
            <button onClick={() => { if (window.confirm('Go live to the internet now? This starts the public stream.')) window.wf.obsStartStream() }} disabled={!status.connected} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600/20 px-2 py-2 text-xs font-bold text-red-700 hover:bg-red-600/30 disabled:opacity-40">
              <span className="h-2 w-2 rounded-full bg-current" /> Start Stream
            </button>
          )}
          {status.recording ? (
            <button onClick={() => window.wf.obsStopRecord()} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600/80 px-2 py-2 text-xs font-bold text-white hover:bg-amber-600">
              <span className="h-2 w-2 rounded-[2px] bg-white" /> Stop Record
            </button>
          ) : (
            <button onClick={() => window.wf.obsStartRecord()} disabled={!status.connected} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600/20 px-2 py-2 text-xs font-bold text-amber-700 hover:bg-amber-600/30 disabled:opacity-40">
              <span className="h-2 w-2 rounded-full bg-current" /> Start Record
            </button>
          )}
        </div>
        {(status.streaming || status.recording) && (
          <div className="flex flex-wrap gap-3 text-[11px] font-semibold">
            {status.streaming && (
              <span className="inline-flex items-center gap-1.5 text-red-600">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> LIVE
                <span className="font-mono tabular-nums text-red-700">{elapsed(status.streamStartedAt, now)}</span>
              </span>
            )}
            {status.recording && (
              <span className="inline-flex items-center gap-1.5 text-amber-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" /> REC
                <span className="font-mono tabular-nums">{elapsed(status.recordStartedAt, now)}</span>
              </span>
            )}
          </div>
        )}

        {/* Auto-record + recordings history */}
        <div className="rounded-lg border border-slate-200 bg-white p-2">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={autoRecord} onChange={toggleAutoRecord} className="h-4 w-4" />
            <span className="text-xs font-semibold text-slate-700">Auto-record services</span>
          </label>
          <div className="mt-1 text-[10px] text-slate-500">
            Recording is written to OBS&rsquo;s configured record folder — point that at your NAS.
          </div>
          <div className="mt-2 mb-1 text-xs font-semibold text-slate-700">Recent recordings</div>
          <RecordingsPanel />
        </div>

        {/* Scenes */}
        {status.connected && (
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <div className="mb-1.5 text-xs font-semibold text-slate-700">Scenes</div>
            <div className="flex flex-wrap gap-1.5">
              {status.scenes.length === 0 && <span className="text-xs text-slate-400">No scenes found.</span>}
              {status.scenes.map((sc) => (
                <button
                  key={sc}
                  onClick={() => window.wf.obsSetScene(sc)}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                    status.currentScene === sc
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {sc}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Auto-switch */}
        <div className="rounded-lg border border-slate-200 bg-white p-2">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={autoSwitch} onChange={(e) => setAutoSwitch(e.target.checked)} className="h-4 w-4" />
            <span className="text-xs font-semibold text-slate-700">Auto-switch scenes with the service</span>
          </label>
          {autoSwitch && (
            <div className="mt-2 space-y-1.5">
              {(['worship', 'word', 'countdown'] as const).map((ctx) => {
                const { Icon, label } = SCENE_LABELS[ctx]
                return (
                  <div key={ctx} className="flex items-center gap-2">
                    <span className="inline-flex w-40 shrink-0 items-center gap-1.5 text-[11px] text-slate-600">
                      <Icon size={12} /> {label}
                    </span>
                    <select
                      value={sceneMap[ctx]}
                      onChange={(e) => setCtxScene(ctx, e.target.value)}
                      className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                    >
                      <option value="">— pick scene —</option>
                      {status.scenes.map((sc) => <option key={sc} value={sc}>{sc}</option>)}
                    </select>
                  </div>
                )
              })}
              {!status.connected && (
                <div className="text-[10px] text-slate-500">Connect to OBS to choose scenes.</div>
              )}
            </div>
          )}
        </div>

        {/* Overlay URL */}
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-2">
          <div className="mb-1 text-xs font-semibold text-slate-700">Lyrics overlay (Browser Source)</div>
          <div className="flex gap-1.5">
            <div className="flex-1 rounded bg-white px-2 py-1.5 text-center font-mono text-[11px] text-emerald-700 break-all">
              {obsUrl || '…'}
            </div>
            <button
              onClick={copyUrl}
              disabled={!obsUrl}
              className={`inline-flex shrink-0 items-center gap-1 rounded px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-40 ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-500/20 text-emerald-700 hover:bg-emerald-500/30'
              }`}
            >
              {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
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
