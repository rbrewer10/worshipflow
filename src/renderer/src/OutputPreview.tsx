import { useEffect, useState } from 'react'
import { MonitorOff, Image as ImageIcon, Play } from 'lucide-react'
import type { LiveState } from '../../shared/types'
import { getTheme, resolveColors, staticBackgroundCss, FONT_FAMILY } from '../../shared/themes'
import { useChurchName } from './useChurchName'

// Miniature live render of the projector, pinned in the service rail.
function OutputPreview(): JSX.Element {
  const [s, setS] = useState<LiveState | null>(null)
  const [outputs, setOutputs] = useState(0)
  useEffect(() => {
    const off = window.wf.onState((s) => setS(s.main))
    window.wf.getState('main').then(setS)
    return off
  }, [])
  // A Program border: real screens connected means whatever's below is what
  // the congregation sees right now, not just a preview.
  useEffect(() => {
    const load = (): void => { window.wf.getInfo().then((i) => setOutputs(i.outputs)) }
    load()
    const t = setInterval(load, 2000)
    return () => clearInterval(t)
  }, [])
  const armed = outputs > 0

  const churchName = useChurchName()
  const mode = s?.mode ?? 'lyrics'
  const theme = getTheme(s?.slideTheme)
  const colors = resolveColors(theme, s?.slideThemeColors ?? null)
  const bg = mode === 'black' ? '#000'
    : theme.kind === 'static' ? staticBackgroundCss(theme, colors)
    : `linear-gradient(120deg, ${colors.primary}, ${colors.secondary})`
  const text = mode === 'black' ? '' : mode === 'logo' ? `✝ ${churchName}` : (s?.line ?? '')

  return (
    <div className="p-2">
      <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-600">
        <span>Main Audience Output</span>
        {armed && <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-red-700">Program</span>}
      </div>
      <div
        className={`flex aspect-video w-full items-center justify-center overflow-hidden rounded px-2 text-center ${
          armed ? 'ring-2 ring-red-500' : 'border border-slate-200'
        }`}
        style={{ background: bg }}
      >
        <span
          className="line-clamp-3 text-[9px] font-semibold leading-tight"
          style={{ fontFamily: FONT_FAMILY[theme.font], color: colors.text }}
        >
          {text}
        </span>
      </div>
      <div className="mt-1.5 flex justify-center gap-4 text-slate-600">
        <button onClick={() => window.wf.sendIntent('main', 'black')} title="Black" className="hover:text-slate-900"><MonitorOff size={14} /></button>
        <button onClick={() => window.wf.sendIntent('main', 'logo')} title="Logo" className="hover:text-slate-900"><ImageIcon size={14} /></button>
        <button onClick={() => window.wf.sendIntent('main', 'lyrics')} title="Clear / lyrics" className="hover:text-slate-900"><Play size={14} /></button>
      </div>
    </div>
  )
}

export default OutputPreview
