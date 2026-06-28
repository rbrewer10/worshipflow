// src/renderer/src/editor/FloatingToolbar.tsx
import type { SongFull } from '../../../shared/types'

const FONT_SIZES = [3, 4, 5, 6, 7, 8, 9, 10]

export default function FloatingToolbar({ style, song, onFontScaleChange }: {
  style?: React.CSSProperties
  song: SongFull
  onFontScaleChange: (size: number) => void
}): JSX.Element {
  const current = song.fontScale ?? 6
  return (
    <div
      className="flex items-center gap-1 rounded-lg border border-white/20 bg-black/80 px-2 py-1 shadow-xl backdrop-blur"
      style={style}
    >
      <span className="mr-1 text-[10px] text-white/50">Size</span>
      {FONT_SIZES.map((s) => (
        <button
          key={s}
          onMouseDown={(e) => {
            e.preventDefault() // don't steal focus from textarea
            onFontScaleChange(s)
          }}
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
            current === s ? 'bg-blue-600 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  )
}
