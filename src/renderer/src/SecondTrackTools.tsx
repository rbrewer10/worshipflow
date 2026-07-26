import { useEffect, useState } from 'react'
import { MonitorOff, Image as ImageIcon, Play } from 'lucide-react'
import type { LiveState } from '../../shared/types'
import { ScripturePanel } from './ScripturePanel'

// The Second track's control rail — deliberately smaller than Main's LiveTools.
// No OBS/CCLI/hymn-timer/stage-message/tablet-remote: those stay Main-only
// (see docs/superpowers/specs/2026-07-24-dual-live-track-design.md, Non-goals).
function SecondTrackTools(): JSX.Element {
  const [live, setLive] = useState<LiveState | null>(null)
  const [scriptureRef, setScriptureRef] = useState('')
  const [bibleTranslation, setBibleTranslation] = useState<'kjv' | 'web' | 'bbe'>('kjv')

  useEffect(() => {
    const off = window.wf.onState((s) => setLive(s.second))
    window.wf.getState('second').then(setLive)
    return off
  }, [])

  const quickScripture = async (): Promise<void> => {
    const ref = scriptureRef.trim()
    if (!ref) return
    const ok = await window.wf.liveLoadScripture('second', ref)
    if (!ok) return
    window.wf.liveSetItemId('second', null)
    setScriptureRef('')
  }

  return (
    <aside className="flex w-96 shrink-0 flex-col gap-4 overflow-auto border-l border-slate-200 bg-[#f4f6f9] p-4">
      <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Second Track</div>

      <div className="flex gap-2">
        <button onClick={() => window.wf.sendIntent('second', 'black')} className="flex-1 btn bg-black text-white border-white/20">
          <MonitorOff size={14} /> Black
        </button>
        <button onClick={() => window.wf.sendIntent('second', 'logo')} className="flex-1 btn">
          <ImageIcon size={14} /> Logo
        </button>
        <button onClick={() => window.wf.sendIntent('second', 'lyrics')} className="flex-1 btn-primary">
          <Play size={14} /> Live
        </button>
      </div>

      <div className="border-t border-slate-200" />

      <ScripturePanel
        scriptureRef={scriptureRef}
        bibleTranslation={bibleTranslation}
        onReferenceChange={setScriptureRef}
        onGoLive={quickScripture}
        onTranslationChange={(t) => { setBibleTranslation(t); window.wf.featuresSetBibleTranslation(t) }}
      />
      {/* No zone panel here on purpose: the screens are one shared resource, so
          one panel (Main's LiveTools) owns them. Two mounts meant two copies of
          the same controls that had to poll each other to stay in step. */}
    </aside>
  )
}

export default SecondTrackTools
