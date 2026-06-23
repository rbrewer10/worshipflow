import { useEffect, useState } from 'react'
import type { LiveState } from '../../shared/types'
import { getTheme, resolveColors, staticBackgroundCss, FONT_FAMILY } from '../../shared/themes'

// Miniature live render of the projector, pinned in the service rail.
function OutputPreview(): JSX.Element {
  const [s, setS] = useState<LiveState | null>(null)
  useEffect(() => {
    const off = window.wf.onState(setS)
    window.wf.getState().then(setS)
    return off
  }, [])

  const mode = s?.mode ?? 'lyrics'
  const theme = getTheme(s?.slideTheme)
  const colors = resolveColors(theme, s?.slideThemeColors ?? null)
  const bg = mode === 'black' ? '#000'
    : theme.kind === 'static' ? staticBackgroundCss(theme, colors)
    : `linear-gradient(120deg, ${colors.primary}, ${colors.secondary})`
  const text = mode === 'black' ? '' : mode === 'logo' ? '✝ SNOW HILL' : (s?.line ?? '')

  return (
    <div className="p-2">
      <div className="mb-1 text-[10px] font-medium text-blue-400">Main Audience Output</div>
      <div
        className="flex aspect-video w-full items-center justify-center overflow-hidden rounded border border-white/10 px-2 text-center"
        style={{ background: bg }}
      >
        <span
          className="line-clamp-3 text-[9px] font-semibold leading-tight"
          style={{ fontFamily: FONT_FAMILY[theme.font], color: colors.text }}
        >
          {text}
        </span>
      </div>
      <div className="mt-1.5 flex justify-center gap-4 text-slate-400">
        <button onClick={() => window.wf.sendIntent('black')} title="Black" className="hover:text-white">■</button>
        <button onClick={() => window.wf.sendIntent('logo')} title="Logo" className="hover:text-white">✝</button>
        <button onClick={() => window.wf.sendIntent('lyrics')} title="Clear / lyrics" className="hover:text-white">▦</button>
      </div>
    </div>
  )
}

export default OutputPreview
