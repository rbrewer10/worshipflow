import { useEffect, useState } from 'react'
import { MonitorOff, Image as ImageIcon, Play, Timer, ChevronUp, ChevronDown, Keyboard, FileText, Tablet, FolderOpen } from 'lucide-react'
import type { AppInfo, LiveState, TrackId } from '../../shared/types'
import ObsPanel from './ObsPanel'
import ZonePanel from './ZonePanel'
import { useService } from './ServiceContext'
import { PresenterPanel } from './PresenterPanel'
import { StageMessagePanel } from './StageMessagePanel'
import { ScripturePanel } from './ScripturePanel'
import { TimingPanel } from './TimingPanel'
import { notifyLocal } from './NotifyToasts'

// The Live tab's right-hand control panel for the Main track: stage message,
// scripture, font, auto-advance, OBS, and a collapsible "More" with the
// rarely-used controls. (Second track gets the leaner SecondTrackTools.)
function LiveTools({ track }: { track: TrackId }): JSX.Element {
  const { activeService, reloadActiveService } = useService()
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

  useEffect(() => {
    window.wf.getInfo().then(setInfo)
    const t = setTimeout(() => window.wf.getInfo().then(setInfo), 900)
    const off = window.wf.onState((s) => setLive(track === 'main' ? s.main : s.second))
    window.wf.getTabletUrl().then(setTabletUrl)
    return () => { clearTimeout(t); off() }
  }, [track])
  useEffect(() => { if (live?.songTitle) window.wf.getInfo().then(setInfo) }, [live?.songTitle])
  useEffect(() => { if (!live?.stageMessage) setStageMsg('') }, [live?.stageMessage])

  const liveItem = activeService?.items.find((it) => it.id === live?.liveServiceItemId && it.track === track) ?? null

  const hmsElapsedSecs = live?.hmsLoadedAt ? Math.floor((Date.now() - live.hmsLoadedAt) / 1000) : 0
  const autoAdvanceRunning = live?.autoAdvanceMs != null && live.autoAdvanceMs > 0

  const quickScripture = async (): Promise<void> => {
    const ref = scriptureRef.trim()
    if (!ref) return
    // On a failed lookup keep the typed reference and leave the current item live
    // rather than clearing both silently.
    const ok = await window.wf.liveLoadScripture(track, ref)
    if (!ok) return
    window.wf.liveSetItemId(track, null)
    setScriptureRef('')
  }
  const sendStageMessage = (preset?: string): void => {
    const msg = (preset ?? stageMsg).trim()
    if (!msg) return
    window.wf.liveSetStageMessage(track, msg)
    setMsgSent(true); setTimeout(() => setMsgSent(false), 3000)
  }
  const clearStageMessage = (): void => { setStageMsg(''); window.wf.liveSetStageMessage(track, null) }

  return (
    <aside className="flex w-96 shrink-0 flex-col gap-4 overflow-auto border-l border-slate-200 bg-[#f4f6f9] p-4">
      {/* Emergency controls */}
      <div className="flex gap-2">
        <button
          onClick={() => window.wf.sendIntent(track, 'black')}
          className="flex-1 btn bg-black text-white border-white/20"
        >
          <MonitorOff size={14} /> Black
        </button>
        <button
          onClick={() => window.wf.sendIntent(track, 'logo')}
          className="flex-1 btn"
        >
          <ImageIcon size={14} /> Logo
        </button>
        <button
          onClick={() => window.wf.sendIntent(track, 'lyrics')}
          className="flex-1 btn-primary"
        >
          <Play size={14} /> Live
        </button>
      </div>

      {/* Keyboard shortcut strip */}
      <div className="flex justify-around rounded-lg border border-slate-200 bg-slate-100/70 px-2 py-1.5 text-[10px] text-slate-500">
        <span><span className="font-bold text-slate-600">Space</span> Next</span>
        <span><span className="font-bold text-slate-600">←→</span> Prev/Next</span>
        <span><span className="font-bold text-slate-600">B</span> Black</span>
        <span><span className="font-bold text-slate-600">L</span> Logo</span>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-200" />

      {/* Presenter notes + timer */}
      <PresenterPanel liveState={live} liveItem={liveItem} />

      {/* Stage message + presets */}
      <StageMessagePanel
        inputValue={stageMsg}
        liveMessage={live?.stageMessage ?? null}
        msgSent={msgSent}
        onInputChange={setStageMsg}
        onSendMessage={sendStageMessage}
        onClearMessage={clearStageMessage}
      />

      {/* Divider */}
      <div className="border-t border-slate-200" />

      {/* Quick scripture + Bible translation */}
      <ScripturePanel
        scriptureRef={scriptureRef}
        bibleTranslation={bibleTranslation}
        onReferenceChange={setScriptureRef}
        onGoLive={quickScripture}
        onTranslationChange={(t) => { setBibleTranslation(t); window.wf.featuresSetBibleTranslation(t) }}
      />

      {/* Divider */}
      <div className="border-t border-slate-200" />

      {/* Text size + Auto-advance */}
      <TimingPanel
        fontScale={live?.fontScale ?? 6}
        autoAdvanceSecs={autoAdvanceSecs}
        autoAdvanceRunning={autoAdvanceRunning}
        autoAdvanceLoop={autoAdvanceLoop}
        liveState={live}
        onFontScaleDecrease={() => window.wf.liveSetFontScale(track, (live?.fontScale ?? 6) - 0.5)}
        onFontScaleIncrease={() => window.wf.liveSetFontScale(track, (live?.fontScale ?? 6) + 0.5)}
        onFontScaleSave={() => window.wf.liveSaveFontScale(track)}
        onAutoAdvanceSecsChange={setAutoAdvanceSecs}
        onAutoAdvanceStart={() => {
          const secs = parseFloat(autoAdvanceSecs)
          if (isNaN(secs) || secs <= 0 || secs > 3600) {
            notifyLocal('Auto-advance must be between 1 and 3600 seconds', 'warn')
            return
          }
          window.wf.featuresStartAutoAdvance(secs * 1000, autoAdvanceLoop)
        }}
        onAutoAdvanceStop={() => window.wf.featuresStopAutoAdvance()}
        onAutoAdvanceLoopToggle={setAutoAdvanceLoop}
      />

      {/* Divider */}
      <div className="border-t border-slate-200" />

      {/* Status strip: hymn timer + verse */}
      {(hmsElapsedSecs > 0 || live?.verseNumber != null) && (
        <div className="flex gap-2 rounded-lg border border-slate-200 bg-slate-100/70 px-3 py-1.5 text-xs text-slate-600">
          {hmsElapsedSecs > 0 && <span className="inline-flex items-center gap-1 tabular-nums"><Timer size={12} /> {Math.floor(hmsElapsedSecs / 60)}:{String(hmsElapsedSecs % 60).padStart(2, '0')}</span>}
          {live?.verseNumber != null && <span>· Verse {live.verseNumber}</span>}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-slate-200" />

      <ObsPanel />

      <button onClick={() => setShowMore((v) => !v)} className="w-full btn">
        {showMore ? <><ChevronUp size={14} /> Less</> : <><ChevronDown size={14} /> More</>}
      </button>
      {showMore && (
        <div className="space-y-3">
          <button onClick={() => setShowCheatSheet(!showCheatSheet)} className="w-full btn-secondary text-xs"><Keyboard size={13} /> Keyboard Shortcuts</button>
          {showCheatSheet && (
            <div className="surface max-h-40 space-y-1 overflow-auto text-xs text-slate-600">
              <div><span className="font-semibold text-slate-700">Space / →</span> Next slide</div>
              <div><span className="font-semibold text-slate-700">←</span> Previous slide</div>
              <div><span className="font-semibold text-slate-700">B</span> Black screen</div>
              <div><span className="font-semibold text-slate-700">L</span> Logo screen</div>
              <div><span className="font-semibold text-slate-700">S</span> Back to lyrics</div>
            </div>
          )}
          <button onClick={() => window.wf.featuresGetServiceLog().then(setServiceLog)} className="w-full btn text-xs"><FileText size={13} /> View Service Log ({serviceLog.length})</button>
          <button onClick={() => window.wf.logsOpenFolder()} className="w-full btn text-xs"><FolderOpen size={13} /> Open Log Folder</button>
          {serviceLog.length > 0 && (
            <div className="surface max-h-32 space-y-0.5 overflow-auto text-xs text-slate-600">
              {serviceLog.slice(-10).reverse().map((e, i) => (
                <div key={i} className="text-slate-500"><span className="text-slate-400">{new Date(e.ts).toLocaleTimeString()}</span> {e.event}</div>
              ))}
            </div>
          )}
          <div className="rounded-lg border border-slate-200 bg-slate-100 p-2 text-xs text-slate-600">
            <div className="mb-1 font-semibold text-slate-700">Displays</div>
            <div><b className="text-slate-900">{info?.displays.length ?? '…'}</b> display(s) · <span className={info && info.outputs > 0 ? 'text-blue-700' : 'text-amber-700'}>{info?.outputs ?? 0} live</span></div>
            {info?.displays.map((d) => (<div key={d.id}>• {d.bounds.width}×{d.bounds.height}{d.primary && <span className="ml-1 text-blue-700">(primary)</span>}</div>))}
          </div>
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-2">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Tablet size={13} /> Tablet Remote</div>
            <div className="break-all rounded bg-slate-100 px-2 py-1 text-center font-mono text-[11px] text-blue-700">{tabletUrl || 'Starting server…'}</div>
            <div className="mt-1 text-[10px] text-slate-500">Open on an iPad/phone as a wireless stage monitor + remote.</div>
          </div>
        </div>
      )}

      {/* Zone display system */}
      <section className="rounded-xl border border-slate-200 bg-[#f4f6f9] p-3">
        <ZonePanel liveItem={liveItem} reloadActiveService={reloadActiveService} />
      </section>
    </aside>
  )
}

export default LiveTools
