// src/renderer/src/editor/SlideStrip.tsx
import { getTheme, resolveColors, staticBackgroundCss, FONT_FAMILY } from '../../../shared/themes'
import type { SongFull } from '../../../shared/types'
import type { EditorSlide } from './slideCompute'

export default function SlideStrip({ song, slides, activeIndex, onSelect }: {
  song: SongFull
  slides: EditorSlide[]
  activeIndex: number
  onSelect: (index: number) => void
}): JSX.Element {
  const theme = getTheme(null)
  const colors = resolveColors(theme)

  function toAssetUrl(p: string): string {
    return 'wf-asset://?path=' + encodeURIComponent(p)
  }

  if (slides.length === 0) {
    return (
      <div className="flex w-28 shrink-0 flex-col gap-1 overflow-y-auto py-1 pr-1">
        <div className="rounded border border-dashed border-white/10 p-2 text-center text-xs text-white/30">
          No slides
        </div>
      </div>
    )
  }

  const bg = song.background && !song.background.startsWith('theme:') ? song.background : null

  return (
    <div className="flex w-28 shrink-0 flex-col gap-1.5 overflow-y-auto py-1 pr-1">
      {slides.map((slide, i) => {
        const active = i === activeIndex
        const bgStyle = bg
          ? `url(${toAssetUrl(bg)}) center/cover`
          : staticBackgroundCss(theme, colors)
        return (
          <button
            key={slide.key}
            onClick={() => onSelect(i)}
            className={`group relative w-full overflow-hidden rounded text-left transition-all ${
              active ? 'ring-2 ring-blue-400 ring-offset-1 ring-offset-[#1a1a1d]' : 'opacity-60 hover:opacity-90'
            }`}
            style={{ aspectRatio: '16/9', background: bgStyle }}
          >
            {/* dark overlay */}
            <div className="absolute inset-0 bg-black/30" />
            {/* lyric text preview */}
            <div className="absolute inset-0 flex items-center justify-center px-1 text-center">
              <span
                className="line-clamp-2 text-[7px] font-bold leading-tight"
                style={{
                  fontFamily: FONT_FAMILY[theme.font],
                  color: '#fff',
                  textShadow: '0 1px 4px rgba(0,0,0,.9)'
                }}
              >
                {slide.text}
              </span>
            </div>
            {/* slide number */}
            <div className="absolute bottom-0.5 right-1 text-[7px] font-semibold text-white/50">{i + 1}</div>
          </button>
        )
      })}
    </div>
  )
}
