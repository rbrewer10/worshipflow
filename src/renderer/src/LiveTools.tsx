import { useEffect, useState } from 'react'
import type { AppInfo, LiveState } from '../../shared/types'
import ObsPanel from './ObsPanel'
import ZonePanel from './ZonePanel'
import { useService } from './ServiceContext'

const STAGE_PRESETS = [
  '5 minutes left', '2 minutes left', 'Time to wrap up', 'Slow down',
  'Speak up', 'Repeat chorus', 'Move to closing song', 'Pray now'
]

// The Live tab's right-hand control panel: stage message, scripture, font,
// auto-advance, OBS, and a collapsible "More" with the rarely-used controls.
function LiveTools(): JSX.Element {
  const { activeService } = useService()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [live, setLive] = useState<LiveState | null>(null)
  const [scriptureRef, setScriptureRef] = useState('')
  const [stageMsg, setStageMsg] = useState('')
  const [msgSent, setMsgSent] = useState(false)
  const [tabletUrl, setTabletUrl] = useState('')
  const [autoAdvanceSecs, setAutoAdvanceSecs] = useState('10')
  const [autoAdvanceLoop, setAutoAdvanceLoop] = useState(false)
  const [bibleTranslation, setBibleTranslation] = useState<'kjv' | 'web' | 'bbe'>('kjv')
  const [showCheatSheet, setShowCheatSheet] = useState(false)
  const [serviceLog, setServiceLog] = useState<Array<{ ts: number; event: string }>>([])
  const [showMore, setShowMore] = useState(false)
  const [presets, setPresets] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('wf-stage-presets')
      if (saved) return JSON.parse(saved) as string[]
    } catch { /* ignore bad data */ }
    return STAGE_PRESETS
  })
  const [editingPresets, setEditingPresets] = useState(false)
  const [newPreset, setNewPreset] = useState('')

  useEffect(() => {
    window.wf.getInfo().then(setInfo)
    const t = setTimeout(() => window.wf.getInfo().then(setInfo), 900)
    const off = window.wf.onState(setLive)
    window.wf.getTabletUrl().then(setTabletUrl)
    return () => { clearTimeout(t); off() }
  }, [])
  useEffect(() => { if (live?.songTitle) window.wf.getInfo().then(setInfo) }, [live?.songTitle])
  useEffect(() => { localStorage.setItem('wf-stage-presets', JSON.stringify(presets)) }, [presets])
  useEffect(() => { if (!live?.stageMessage) setStageMsg('') }, [live?.stageMessage])

  const liveItem = activeService?.items.find((it) => it.id === live?.liveServiceItemId) ?? null

  const hmsElapsedSecs = live?.hmsLoadedAt ? Math.floor((Date.now() - live.hmsLoadedAt) / 1000) : 0
  const autoAdvanceRunning = live?.autoAdvanceMs != null && live.autoAdvanceMs > 0

  const addPreset = (): void => {
    const p = newPreset.trim()
    if (!p) return
    setPresets((cur) => [...cur, p]); setNewPreset('')
  }
  const deletePreset = (i: number): void => setPresets((cur) => cur.filter((_, idx) => idx !== i))
  const editPreset = (i: number, val: string): void => setPresets((cur) => cur.map((p, idx) => (idx === i ? val : p)))

  const quickScripture = async (): Promise<void> => {
    const ref = scriptureRef.trim()
    if (!ref) return
    await window.wf.liveLoadScripture(ref)
    window.wf.liveSetItemId(null)
    setScriptureRef('')
  }
  const sendStageMessage = (preset?: string): void => {
    const msg = (preset ?? stageMsg).trim()
    if (!msg) return
    window.wf.liveSetStageMessage(msg)
    setMsgSent(true); setTimeout(() => setMsgSent(false), 3000)
  }
  const clearStageMessage = (): void => { setStageMsg(''); window.wf.liveSetStageMessage(null) }

  return (
    <aside className="flex w-96 shrink-0 flex-col gap-3 overflow-auto border-l border-white/[0.07] bg-[#15151a] p-3">
      {/* Emergency controls */}
      <div className="flex gap-2">
        <button
          onClick={() => window.wf.sendIntent('black')}
          className="flex-1 rounded-xl bg-black px-3 py-3 text-sm font-bold text-white ring-1 ring-white/10 hover:ring-white/25"
        >
          ⬛ Black
        </button>
        <button
          onClick={() => window.wf.sendIntent('logo')}
          className="flex-1 rounded-xl border border-white/[0.07] bg-[#1a1a1d] px-3 py-3 text-sm font-bold text-slate-300 hover:bg-white/[0.08]"
        >
          🔲 Logo
        </button>
        <button
          onClick={() => window.wf.sendIntent('lyrics')}
          className="flex-1 rounded-xl border border-emerald-500/30 bg-emerald-600/15 px-3 py-3 text-sm font-bold text-emerald-300 hover:bg-emerald-600/25"
        >
          ▶ Live
        </button>
      </div>

      {/* Keyboard shortcut strip */}
      <div className="flex justify-around rounded-lg border border-white/[0.07] bg-black/20 px-2 py-1.5 text-[10px] text-slate-500">
        <span><span className="font-bold text-slate-400">Space</span> Next</span>
        <span><span className="font-bold text-slate-400">←→</span> Prev/Next</span>
        <span><span className="font-bold text-slate-400">B</span> Black</span>
        <span><span className="font-bold text-slate-400">L</span> Logo</span>
      </div>

      {/* Stage message + presets */}
      <section className="rounded-xl border border-white/[0.07] bg-[#1a1a1d] p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
          Stage Message
          {live?.stageMessage && <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">LIVE</span>}
          {msgSent && <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 animate-[fade-in_0.2s_ease-out]">✓ Sent to stage</span>}
        </h2>
        <div className="flex gap-2">
          <input type="text" value={stageMsg} onChange={(e) => setStageMsg(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendStageMessage()} placeholder="Message to worship leader / pastor..."
            className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm outline-none placeholder:text-slate-600 focus:border-blue-500" />
          <button onClick={() => sendStageMessage()} className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-bold text-[#1a0a00] hover:bg-amber-400">Send</button>
          <button onClick={clearStageMessage} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-slate-500 hover:text-slate-300">Clear</button>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Quick Messages</span>
          <button onClick={() => setEditingPresets((v) => !v)} className="rounded px-2 py-0.5 text-[11px] font-semibold text-slate-400 hover:text-amber-300">{editingPresets ? '✓ Done' : '✏️ Edit'}</button>
        </div>
        {!editingPresets ? (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {presets.length === 0 && <span className="text-xs text-slate-600">No quick messages — tap ✏️ Edit to add some.</span>}
            {presets.map((p, i) => (
              <button key={i} onClick={() => setStageMsg(p)} className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-amber-500/40 hover:bg-amber-500/15 hover:text-amber-200">{p}</button>
            ))}
          </div>
        ) : (
          <div className="mt-1.5 space-y-1.5">
            {presets.map((p, i) => (
              <div key={i} className="flex gap-2">
                <input type="text" value={p} onChange={(e) => editPreset(i, e.target.value)} className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs outline-none focus:border-blue-500" />
                <button onClick={() => deletePreset(i)} className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/20" title="Delete">✕</button>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <input type="text" value={newPreset} onChange={(e) => setNewPreset(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPreset()} placeholder="New quick message…" className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs outline-none placeholder:text-slate-600 focus:border-blue-500" />
              <button onClick={addPreset} className="shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20">+ Add</button>
            </div>
          </div>
        )}
      </section>

      {/* Quick scripture + Bible translation */}
      <section className="rounded-xl border border-white/[0.07] bg-[#1a1a1d] p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-300">Quick Scripture</h2>
        <div className="flex gap-2">
          <input type="text" value={scriptureRef} onChange={(e) => setScriptureRef(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && quickScripture()} placeholder="John 3:16"
            className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm outline-none placeholder:text-slate-600 focus:border-blue-500" />
          <button onClick={quickScripture} className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-sm font-semibold hover:bg-white/[0.12]">Go Live</button>
        </div>
        <div className="mt-2 flex gap-1">
          {([['kjv', 'KJV'], ['web', 'WEB'], ['bbe', 'BBE']] as const).map(([t, label]) => (
            <button key={t} onClick={() => { setBibleTranslation(t); window.wf.featuresSetBibleTranslation(t) }}
              className={`flex-1 rounded px-2 py-1 text-xs font-semibold transition-colors ${bibleTranslation === t ? 'bg-emerald-600 text-white' : 'bg-white/10 text-slate-400 hover:bg-white/20'}`}>{label}</button>
          ))}
        </div>
        <div className="mt-1 text-[10px] text-slate-500">KJV offline · WEB & BBE need internet</div>
      </section>

      {/* Text size */}
      <section className="rounded-xl border border-white/[0.07] bg-[#1a1a1d] p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-300">Text size</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => window.wf.liveSetFontScale((live?.fontScale ?? 6) - 0.5)} className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-sm font-semibold hover:bg-white/[0.12]">A −</button>
          <span className="text-xs text-slate-500">{(live?.fontScale ?? 6).toFixed(1)}vw</span>
          <button onClick={() => window.wf.liveSetFontScale((live?.fontScale ?? 6) + 0.5)} className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-sm font-semibold hover:bg-white/[0.12]">A +</button>
          <button onClick={() => window.wf.liveSaveFontScale()} className="ml-auto rounded px-2 py-1 text-[10px] text-slate-500 hover:text-emerald-300" title="Save size to current song">💾 Save</button>
        </div>
      </section>

      {/* Auto-advance */}
      <section className="rounded-xl border border-white/[0.07] bg-[#1a1a1d] p-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300">Auto-Advance</span>
          {autoAdvanceRunning && <span className="text-xs font-bold text-emerald-400">● running{autoAdvanceLoop ? ' ↻' : ''}</span>}
        </div>
        {autoAdvanceRunning && (
          <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-emerald-500 transition-none"
              style={{ width: `${Math.min(100, ((live?.autoAdvanceMs ?? 0) / (parseFloat(autoAdvanceSecs) * 1000)) * 100)}%` }}
            />
          </div>
        )}
        <div className="flex gap-1.5">
          <input type="number" value={autoAdvanceSecs} onChange={(e) => setAutoAdvanceSecs(e.target.value)} className="w-16 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-slate-300" />
          <button onClick={() => {
            const secs = parseFloat(autoAdvanceSecs)
            if (isNaN(secs) || secs <= 0 || secs > 3600) {
              alert('Auto-advance must be between 1 and 3600 seconds')
              return
            }
            window.wf.featuresStartAutoAdvance(secs * 1000, autoAdvanceLoop)
          }} className="flex-1 rounded bg-blue-600/40 px-2 py-1 text-xs font-semibold text-blue-300 hover:bg-blue-600/60">Start</button>
          <button onClick={() => window.wf.featuresStopAutoAdvance()} className="flex-1 rounded bg-slate-600/40 px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-600/60">Stop</button>
        </div>
        <label className="mt-1.5 flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={autoAdvanceLoop} onChange={(e) => setAutoAdvanceLoop(e.target.checked)} className="h-3.5 w-3.5" />
          <span className="text-[11px] text-slate-400">↻ Loop back to start at the end</span>
        </label>
      </section>

      {/* Status strip: hymn timer + verse */}
      {(hmsElapsedSecs > 0 || live?.verseNumber != null) && (
        <div className="flex gap-2 rounded-lg border border-white/[0.07] bg-black/20 px-3 py-1.5 text-xs text-slate-400">
          {hmsElapsedSecs > 0 && <span>⏱ {Math.floor(hmsElapsedSecs / 60)}:{String(hmsElapsedSecs % 60).padStart(2, '0')}</span>}
          {live?.verseNumber != null && <span>· Verse {live.verseNumber}</span>}
        </div>
      )}

      <ObsPanel />

      <button onClick={() => setShowMore((v) => !v)} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.08]">
        {showMore ? '▴ Less' : '▾ More'}
      </button>
      {showMore && (
        <div className="space-y-3">
          <div className="rounded-lg border border-white/[0.07] bg-black/30 p-2">
            <span className="text-xs font-semibold text-slate-300">⏱ Hymn Timer: {Math.floor(hmsElapsedSecs / 60)}:{String(hmsElapsedSecs % 60).padStart(2, '0')}</span>
          </div>
          <div className="rounded-lg border border-white/[0.07] bg-black/30 p-2">
            <span className="text-xs font-semibold text-slate-300">Verse #: {live?.verseNumber ?? '—'}</span>
          </div>
          <button onClick={() => setShowCheatSheet(!showCheatSheet)} className="w-full rounded-lg border border-blue-500/30 bg-blue-600/20 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-600/30">⌨️ Keyboard Shortcuts</button>
          {showCheatSheet && (
            <div className="max-h-40 space-y-1 overflow-auto rounded-lg bg-black/40 p-2 text-xs text-slate-400">
              <div><span className="font-semibold text-slate-300">Space / →</span> Next slide</div>
              <div><span className="font-semibold text-slate-300">←</span> Previous slide</div>
              <div><span className="font-semibold text-slate-300">B</span> Black screen</div>
              <div><span className="font-semibold text-slate-300">L</span> Logo screen</div>
              <div><span className="font-semibold text-slate-300">S</span> Back to lyrics</div>
            </div>
          )}
          <button onClick={() => window.wf.featuresGetServiceLog().then(setServiceLog)} className="w-full rounded-lg border border-purple-500/30 bg-purple-600/20 px-3 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-600/30">📋 View Service Log ({serviceLog.length})</button>
          {serviceLog.length > 0 && (
            <div className="max-h-32 space-y-0.5 overflow-auto rounded-lg bg-black/40 p-2 text-xs text-slate-400">
              {serviceLog.slice(-10).reverse().map((e, i) => (
                <div key={i} className="text-slate-500"><span className="text-slate-600">{new Date(e.ts).toLocaleTimeString()}</span> {e.event}</div>
              ))}
            </div>
          )}
          <div className="rounded-lg border border-white/[0.07] bg-black/30 p-2 text-xs text-slate-400">
            <div className="mb-1 font-semibold text-slate-300">Displays</div>
            <div><b className="text-slate-100">{info?.displays.length ?? '…'}</b> display(s) · <span className={info && info.outputs > 0 ? 'text-emerald-400' : 'text-amber-400'}>{info?.outputs ?? 0} live</span></div>
            {info?.displays.map((d) => (<div key={d.id}>• {d.bounds.width}×{d.bounds.height}{d.primary && <span className="ml-1 text-emerald-400">(primary)</span>}</div>))}
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2">
            <div className="mb-1 text-xs font-semibold text-slate-300">📱 Tablet Remote</div>
            <div className="break-all rounded bg-black/30 px-2 py-1 text-center font-mono text-[11px] text-emerald-300">{tabletUrl || 'Starting server…'}</div>
            <div className="mt-1 text-[10px] text-slate-500">Open on an iPad/phone as a wireless stage monitor + remote.</div>
          </div>
        </div>
      )}

      {/* Zone display system */}
      <section className="rounded-xl border border-white/[0.07] bg-[#1a1a1d] p-3">
        <ZonePanel liveItem={liveItem} />
      </section>
    </aside>
  )
}

export default LiveTools
