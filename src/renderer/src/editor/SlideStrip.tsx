// src/renderer/src/editor/SlideStrip.tsx
import { Plus } from 'lucide-react'
import { getTheme, resolveColors, staticBackgroundCss, FONT_FAMILY } from '../../../shared/themes'
import type { SongFull } from '../../../shared/types'
import type { EditorSlide } from './slideCompute'

export default function SlideStrip({ song, slides, activeIndex, onSelect, onAddSlide }: {
  song: SongFull
  slides: EditorSlide[]
  activeIndex: number
  onSelect: (index: number) => void
  onAddSlide?: () => void
}): JSX.Element {
  const theme = getTheme(null)
  const colors = resolveColors(theme)

  function toAssetUrl(p: string): string {
    return 'wf-asset://?path=' + encodeURIComponent(p)
  }

  const bg = song.background && !song.background.startsWith('theme:') ? song.background : null

  // Theme-aware gradient for the no-image case (default + theme:<id>).
  const bgIsTheme = song.background?.startsWith('theme:')
  const bgThemeId = bgIsTheme ? song.background!.slice(6) : null
  const thumbTheme = getTheme(bgIsTheme ? bgThemeId : null)
  const thumbColors = resolveColors(thumbTheme)

  // Match the canvas: render a gradient for theme/default backgrounds. (staticBackgroundCss
  // returns a flat near-black for motion themes since they carry no `gradient` flag.)
  const bgStyle = bg
    ? `url(${toAssetUrl(bg)}) center/cover`
    : `linear-gradient(135deg, ${thumbColors.primary}, ${thumbColors.secondary})`

  const addButton = onAddSlide && (
    <button
      onClick={onAddSlide}
      className="flex w-36 shrink-0 items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 py-2.5 text-xs font-semibold text-slate-600 transition-colors hover:border-emerald-400/60 hover:bg-emerald-500/10 hover:text-emerald-700"
    >
      <Plus size={13} /> Add Slide
    </button>
  )

  return (
    <div className="flex w-40 shrink-0 flex-col gap-2.5 overflow-y-auto py-1 pr-1">
      {slides.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">
          No slides yet
        </div>
      ) : (
        slides.map((slide, i) => {
          const active = i === activeIndex
          return (
            <div key={slide.key} className="w-36 shrink-0">
              <p className={`mb-1 truncate px-0.5 text-[10px] font-semibold uppercase tracking-wide ${active ? 'text-emerald-700' : 'text-slate-500'}`}>
                {slide.sectionLabel}
              </p>
              <button
                onClick={() => onSelect(i)}
                className={`group relative w-full overflow-hidden rounded-lg text-left transition-all ${
                  active
                    ? 'ring-2 ring-emerald-400'
                    : 'opacity-70 ring-1 ring-slate-200 hover:opacity-100'
                }`}
                style={{ aspectRatio: '16/9', background: bgStyle }}
              >
                {/* dark overlay */}
                <div className="absolute inset-0 bg-black/35" />
                {/* lyric text preview */}
                <div className="absolute inset-0 flex items-center justify-center px-1.5 text-center">
                  <span
                    className="line-clamp-2 text-[8px] font-bold leading-tight"
                    style={{
                      fontFamily: FONT_FAMILY[theme.font],
                      color: '#fff',
                      textShadow: '0 1px 4px rgba(0,0,0,.9)'
                    }}
                  >
                    {slide.text}
                  </span>
                </div>
                {/* number badge */}
                <div className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[8px] font-bold text-white/80">
                  {i + 1}
                </div>
              </button>
            </div>
          )
        })
      )}
      {addButton}
    </div>
  )
}
