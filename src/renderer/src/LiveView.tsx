import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppInfo, Intent, LiveState, ServiceFull, ServiceItem, ServiceSummary } from '../../shared/types'
import ObsPanel from './ObsPanel'
import { canGoLive, sendItemLive } from './liveActions'
import { useService } from './ServiceContext'

const ICON: Record<ServiceItem['type'], string> = {
  song: '🎵',
  scripture: '📖',
  text: '📝',
  countdown: '⏱',
  image: '🖼',
  welcome: '👋',
  ticker: '📰'
}

type ThemeType = 'modern-church' | 'minimalist' | 'vibrant' | 'dark-premium'

// Quick-send stage messages for common cues.
const STAGE_PRESETS = [
  '5 minutes left',
  '2 minutes left',
  'Time to wrap up',
  'Slow down',
  'Speak up',
  'Repeat chorus',
  'Move to closing song',
  'Pray now'
]

// Unified operator surface: service order on the left, live controls on the right.
function LiveView({ theme: appTheme, setTheme: setAppTheme }: { theme?: ThemeType; setTheme?: (t: ThemeType) => void } = {}): JSX.Element {
  const { services, activeServiceId, activeService: service, selectService } = useService()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [live, setLive] = useState<LiveState | null>(null)
  const [scriptureRef, setScriptureRef] = useState('')
  const [stageMsg, setStageMsg] = useState('')
  const [msgSent, setMsgSent] = useState(false)
  const [tabletUrl, setTabletUrl] = useState('')
  const [autoAdvanceSecs, setAutoAdvanceSecs] = useState('10')
  const [autoAdvanceLoop, setAutoAdvanceLoop] = useState(false)
  const [theme, setThemeLocal] = useState<ThemeType>(appTheme ?? 'modern-church')
  const [bibleTranslation, setBibleTranslation] = useState<'kjv' | 'web' | 'bbe'>('kjv')
  const [showCheatSheet, setShowCheatSheet] = useState(false)
  const [serviceLog, setServiceLog] = useState<Array<{ ts: number; event: string }>>([])
  const [presets, setPresets] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('wf-stage-presets')
      if (saved) return JSON.parse(saved) as string[]
    } catch { /* ignore bad data */ }
    return STAGE_PRESETS
  })
  const [editingPresets, setEditingPresets] = useState(false)
  const [newPreset, setNewPreset] = useState('')

  // Persist presets whenever they change.
  useEffect(() => {
    localStorage.setItem('wf-stage-presets', JSON.stringify(presets))
  }, [presets])

  const addPreset = (): void => {
    const p = newPreset.trim()
    if (!p) return
    setPresets((cur) => [...cur, p])
    setNewPreset('')
  }
  const deletePreset = (i: number): void => setPresets((cur) => cur.filter((_, idx) => idx !== i))
  const editPreset = (i: number, val: string): void =>
    setPresets((cur) => cur.map((p, idx) => (idx === i ? val : p)))

  // Sync app theme to local state
  useEffect(() => {
    if (appTheme) setThemeLocal(appTheme)
  }, [appTheme])

  const liveItemId = live?.liveServiceItemId ?? null
  const hmsElapsedSecs = live?.hmsLoadedAt ? Math.floor((Date.now() - live.hmsLoadedAt) / 1000) : 0
  const autoAdvanceRunning = live?.autoAdvanceMs != null && live.autoAdvanceMs > 0

  useEffect(() => {
    window.wf.getInfo().then(setInfo)
    const t = setTimeout(() => window.wf.getInfo().then(setInfo), 900)
    const off = window.wf.onState(setLive)
    window.wf.getTabletUrl().then(setTabletUrl)
    return () => { clearTimeout(t); off() }
  }, [])

  useEffect(() => {
    if (live?.songTitle) window.wf.getInfo().then(setInfo)
  }, [live?.songTitle])

  // When the stage message is cleared (e.g. pastor tapped "Got it"), clear the operator input too.
  useEffect(() => {
    if (!live?.stageMessage) setStageMsg('')
  }, [live?.stageMessage])


  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // Don't intercept keyboard when typing in an input or textarea.
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const k = e.key.toLowerCase()
      if (e.code === 'Space' || e.code === 'ArrowRight') {
        e.preventDefault()
        // Cross-item advance is handled in the main process (processIntent),
        // so the keyboard, the Next button, and the tablet all behave the same.
        window.wf.sendIntent('next')
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        window.wf.sendIntent('prev')
      } else if (k === 'b') window.wf.sendIntent('black')
      else if (k === 'l') window.wf.sendIntent('logo')
      else if (k === 's') window.wf.sendIntent('lyrics')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const send = (type: Intent): void => window.wf.sendIntent(type)

  const lines = info?.song.lines ?? []
  const mode = live?.mode ?? 'lyrics'
  const index = live?.index ?? 0
  const previewText =
    mode === 'black' ? '' :
    mode === 'logo' ? '✝ SNOW HILL' :
    mode === 'countdown' ? `⏱ ${live?.line ?? ''}` :
    live?.line ?? ''

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
    setMsgSent(true)
    setTimeout(() => setMsgSent(false), 3000)
  }

  const clearStageMessage = (): void => {
    setStageMsg('')
    window.wf.liveSetStageMessage(null)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-2">
        <span className="text-xs text-slate-400">Space / → next · ← prev · B black · L logo · S lyrics</span>
        <button
          onClick={() => window.wf.stageOpen()}
          className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-slate-400 hover:bg-white/[0.09] hover:text-slate-200"
        >
          ✝ Stage Display
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left: service order */}
        <div className="flex w-64 shrink-0 flex-col border-r border-white/10 bg-white/[0.06]">
          <div className="border-b border-white/10 p-2">
            <select
              value={activeServiceId ?? ''}
              onChange={(e) => e.target.value && selectService(Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
            >
              {services.length === 0 && <option value="">No services yet</option>}
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="min-h-0 flex-1 space-y-0.5 overflow-auto p-2">
            {!service || service.items.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">
                {service ? 'Empty service.' : 'Select a service above.'}
              </p>
            ) : (
              service.items.map((item, i) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-2 rounded-lg px-2 py-2 ${
                    liveItemId === item.id
                      ? 'bg-emerald-500/15 ring-1 ring-emerald-500/30'
                      : 'hover:bg-white/[0.05]'
                  }`}
                >
                  <span className="w-4 shrink-0 text-right font-mono text-[10px] text-slate-500">{i + 1}</span>
                  <span className="shrink-0 text-sm">{ICON[item.type]}</span>
                  <span className="min-w-0 flex-1 truncate text-xs">{item.title}</span>
                  {canGoLive(item) && (
                    <button
                      onClick={() => sendItemLive(item)}
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                        liveItemId === item.id
                          ? 'text-emerald-300'
                          : 'text-slate-500 hover:text-emerald-300'
                      }`}
                      title="Go live"
                    >
                      {liveItemId === item.id ? '● LIVE' : '▶'}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: live control surface */}
        <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
          <div className="flex gap-3">
            {/* Transport */}
            <section className="shrink-0 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Controls</h2>
              <div className="grid grid-cols-2 gap-2">
                <Btn onClick={() => send('prev')}>◀ Prev</Btn>
                <Btn onClick={() => send('next')}>Next ▶</Btn>
                <Btn onClick={() => send('black')} className="col-span-2 bg-black">Black</Btn>
                <Btn onClick={() => send('logo')} className="col-span-2 bg-blue-600 hover:bg-blue-500">Logo</Btn>
                <Btn onClick={() => send('lyrics')} className="col-span-2">Lyrics</Btn>
              </div>
            </section>

            {/* Font size */}
            <section className="shrink-0 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Text size</h2>
              <div className="flex flex-col items-center gap-1.5">
                <Btn onClick={() => window.wf.liveSetFontScale((live?.fontScale ?? 6) + 0.5)}>A +</Btn>
                <span className="text-xs text-slate-500">{(live?.fontScale ?? 6).toFixed(1)}vw</span>
                <Btn onClick={() => window.wf.liveSetFontScale((live?.fontScale ?? 6) - 0.5)}>A −</Btn>
                <button
                  onClick={() => window.wf.liveSaveFontScale()}
                  className="mt-1 rounded px-2 py-1 text-[10px] text-slate-500 hover:text-emerald-300"
                  title="Save size to current song"
                >
                  💾 Save to song
                </button>
              </div>
            </section>

            {/* Displays */}
            <section className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Displays</h2>
              <div className="space-y-1 text-xs text-slate-400">
                <div>
                  <b className="text-slate-100">{info?.displays.length ?? '…'}</b> display(s) ·{' '}
                  <span className={info && info.outputs > 0 ? 'text-emerald-400' : 'text-amber-400'}>
                    {info?.outputs ?? 0} output(s) live
                  </span>
                </div>
                {info?.displays.map((d) => (
                  <div key={d.id}>
                    • {d.bounds.width}×{d.bounds.height}
                    {d.primary && <span className="ml-1 text-emerald-400">(primary)</span>}
                  </div>
                ))}
              </div>
            </section>

            {/* Tablet Remote */}
            <section className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">📱 Tablet Remote</h2>
              {tabletUrl ? (
                <div className="space-y-2 text-xs text-slate-400">
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2 font-mono text-emerald-300 text-center break-all">
                    {tabletUrl}
                  </div>
                  <div className="text-slate-500">
                    Open this URL on your iPad or Android phone to use it as a wireless stage monitor & remote control.
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-600">Starting server…</div>
              )}
            </section>
          </div>

          {/* Operator preview */}
          <section className="relative flex min-h-[80px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black p-6 text-center">
            <span className="absolute left-3 top-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Preview</span>
            <span className="text-2xl font-bold leading-snug" style={{ whiteSpace: 'pre-line' }}>{previewText}</span>
          </section>

          {/* Lines list */}
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Now playing — {info?.song.title ?? '…'}
            </h2>
            <div className="max-h-28 space-y-0.5 overflow-auto text-sm text-slate-400">
              {lines.length === 0 && <p className="text-xs text-slate-600">Nothing loaded yet.</p>}
              {lines.map((l, i) => (
                <div
                  key={i}
                  className={`truncate rounded px-1 ${
                    i === index && mode === 'lyrics' ? 'bg-white/10 font-bold text-white' : ''
                  }`}
                >
                  {i + 1}. {l}
                </div>
              ))}
            </div>
          </section>

          {/* Quick scripture */}
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Quick Scripture</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={scriptureRef}
                onChange={(e) => setScriptureRef(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && quickScripture()}
                placeholder="John 3:16"
                className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm outline-none placeholder:text-slate-600 focus:border-blue-500"
              />
              <button
                onClick={quickScripture}
                className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-sm font-semibold hover:bg-white/[0.12]"
              >
                Go Live
              </button>
            </div>
          </section>

          {/* Stage message */}
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Stage Message
              {live?.stageMessage && (
                <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">LIVE</span>
              )}
              {msgSent && (
                <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 animate-[fade-in_0.2s_ease-out]">✓ Sent to stage</span>
              )}
            </h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={stageMsg}
                onChange={(e) => setStageMsg(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendStageMessage()}
                placeholder="Message to worship leader / pastor..."
                className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm outline-none placeholder:text-slate-600 focus:border-blue-500"
              />
              <button
                onClick={() => sendStageMessage()}
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-sm font-semibold text-amber-300 hover:bg-amber-500/20"
              >
                Send
              </button>
              <button
                onClick={clearStageMessage}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-slate-500 hover:text-slate-300"
              >
                Clear
              </button>
            </div>
            {/* Quick presets — tap to send instantly */}
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Quick Messages</span>
              <button
                onClick={() => setEditingPresets((v) => !v)}
                className="rounded px-2 py-0.5 text-[11px] font-semibold text-slate-400 hover:text-amber-300"
              >
                {editingPresets ? '✓ Done' : '✏️ Edit'}
              </button>
            </div>

            {!editingPresets ? (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {presets.length === 0 && (
                  <span className="text-xs text-slate-600">No quick messages — tap ✏️ Edit to add some.</span>
                )}
                {presets.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => sendStageMessage(p)}
                    className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-amber-500/40 hover:bg-amber-500/15 hover:text-amber-200"
                  >
                    {p}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-1.5 space-y-1.5">
                {presets.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={p}
                      onChange={(e) => editPreset(i, e.target.value)}
                      className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={() => deletePreset(i)}
                      className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/20"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={newPreset}
                    onChange={(e) => setNewPreset(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addPreset()}
                    placeholder="New quick message…"
                    className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs outline-none placeholder:text-slate-600 focus:border-blue-500"
                  />
                  <button
                    onClick={addPreset}
                    className="shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20"
                  >
                    + Add
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Features */}
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">⚙️ Features</h2>
            <div className="space-y-3">
              {/* Auto-Advance */}
              <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Auto-Advance</span>
                  {autoAdvanceRunning && (
                    <span className="text-xs text-emerald-400">
                      ● {((live?.autoAdvanceMs ?? 0) / 1000).toFixed(1)}s{autoAdvanceLoop ? ' ↻' : ''}
                    </span>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    value={autoAdvanceSecs}
                    onChange={(e) => setAutoAdvanceSecs(e.target.value)}
                    className="w-16 rounded px-2 py-1 text-xs bg-black/40 border border-white/10 text-slate-300"
                  />
                  <button
                    onClick={() => window.wf.featuresStartAutoAdvance(parseFloat(autoAdvanceSecs) * 1000, autoAdvanceLoop)}
                    className="flex-1 rounded px-2 py-1 text-xs bg-blue-600/40 hover:bg-blue-600/60 text-blue-300 font-semibold"
                  >
                    Start
                  </button>
                  <button
                    onClick={() => window.wf.featuresStopAutoAdvance()}
                    className="flex-1 rounded px-2 py-1 text-xs bg-slate-600/40 hover:bg-slate-600/60 text-slate-300 font-semibold"
                  >
                    Stop
                  </button>
                </div>
                <label className="mt-1.5 flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={autoAdvanceLoop}
                    onChange={(e) => setAutoAdvanceLoop(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-[11px] text-slate-400">↻ Loop back to start at the end</span>
                </label>
              </div>

              {/* Hymn Timer */}
              <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                <span className="text-xs font-semibold text-slate-300">⏱ Hymn Timer: {Math.floor(hmsElapsedSecs / 60)}:{String(hmsElapsedSecs % 60).padStart(2, '0')}</span>
              </div>

              {/* Verse Number */}
              <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                <span className="text-xs font-semibold text-slate-300">Verse #: {live?.verseNumber ?? '—'}</span>
              </div>

              {/* Theme */}
              <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Theme</span>
                  <span className="text-xs text-slate-500">{theme.replace('-', ' ')}</span>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {(['modern-church', 'minimalist', 'vibrant', 'dark-premium'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        setThemeLocal(t)
                        if (setAppTheme) setAppTheme(t)
                        window.wf.featuresSetTheme(t)
                      }}
                      className={`rounded px-2 py-1 text-xs font-semibold transition-colors ${
                        theme === t ? 'bg-blue-600 text-white' : 'bg-white/10 text-slate-400 hover:bg-white/20'
                      }`}
                    >
                      {t === 'modern-church' && '⛪'} {t === 'minimalist' && '◻️'} {t === 'vibrant' && '🎨'} {t === 'dark-premium' && '✨'} {t.replace('-', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bible Translation */}
              <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Bible</span>
                  <span className="text-xs text-slate-500">{bibleTranslation.toUpperCase()}</span>
                </div>
                <div className="flex gap-1">
                  {([['kjv', 'KJV'], ['web', 'WEB'], ['bbe', 'BBE']] as const).map(([t, label]) => (
                    <button
                      key={t}
                      onClick={() => { setBibleTranslation(t); window.wf.featuresSetBibleTranslation(t) }}
                      className={`flex-1 rounded px-2 py-1 text-xs font-semibold transition-colors ${
                        bibleTranslation === t ? 'bg-emerald-600 text-white' : 'bg-white/10 text-slate-400 hover:bg-white/20'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-1 text-[10px] text-slate-500">KJV offline · WEB & BBE need internet</div>
              </div>

              {/* Keyboard Cheat Sheet */}
              <button
                onClick={() => setShowCheatSheet(!showCheatSheet)}
                className="w-full rounded-lg px-3 py-2 text-xs font-semibold bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border border-blue-500/30"
              >
                ⌨️ Keyboard Shortcuts
              </button>
              {showCheatSheet && (
                <div className="rounded-lg bg-black/40 p-2 text-xs text-slate-400 space-y-1 max-h-40 overflow-auto">
                  <div><span className="text-slate-300 font-semibold">Space / →</span> Next slide</div>
                  <div><span className="text-slate-300 font-semibold">←</span> Previous slide</div>
                  <div><span className="text-slate-300 font-semibold">B</span> Black screen</div>
                  <div><span className="text-slate-300 font-semibold">L</span> Logo screen</div>
                  <div><span className="text-slate-300 font-semibold">S</span> Back to lyrics</div>
                  <div><span className="text-slate-300 font-semibold">A +</span> Increase text size</div>
                  <div><span className="text-slate-300 font-semibold">A −</span> Decrease text size</div>
                </div>
              )}

              {/* Service Log */}
              <button
                onClick={() => window.wf.featuresGetServiceLog().then(setServiceLog)}
                className="w-full rounded-lg px-3 py-2 text-xs font-semibold bg-purple-600/20 text-purple-300 hover:bg-purple-600/30 border border-purple-500/30"
              >
                📋 View Service Log ({serviceLog.length})
              </button>
              {serviceLog.length > 0 && (
                <div className="rounded-lg bg-black/40 p-2 text-xs text-slate-400 max-h-32 overflow-auto space-y-0.5">
                  {serviceLog.slice(-10).reverse().map((e, i) => (
                    <div key={i} className="text-slate-500">
                      <span className="text-slate-600">{new Date(e.ts).toLocaleTimeString()}</span> {e.event}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* OBS integration */}
          <ObsPanel />
        </main>
      </div>
    </div>
  )
}

function Btn({
  children,
  onClick,
  className = ''
}: {
  children: ReactNode
  onClick: () => void
  className?: string
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border border-white/10 bg-white/[0.06] px-3 py-3 text-sm font-semibold hover:bg-white/[0.12] ${className}`}
    >
      {children}
    </button>
  )
}

export default LiveView
