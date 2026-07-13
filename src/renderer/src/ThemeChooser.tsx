import { Sparkles } from 'lucide-react'
import { THEMES, getTheme, resolveColors, staticBackgroundCss } from '../../shared/themes'
import type { ThemeColors } from '../../shared/types'

// Shared swatch grid + color pickers. Used by the service ThemePicker and per-item design.
function ThemeChooser({ themeId, colors, onPickTheme, onSetColor, onReset }: {
  themeId: string | null
  colors: ThemeColors | null
  onPickTheme: (id: string) => void
  onSetColor: (key: keyof ThemeColors, val: string) => void
  onReset: () => void
}): JSX.Element {
  const active = getTheme(themeId)
  const c = resolveColors(active, colors)
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        {THEMES.map((t) => {
          const tc = resolveColors(t, t.id === active.id ? colors : null)
          const swatch = t.kind === 'static'
            ? staticBackgroundCss(t, tc)
            : `linear-gradient(120deg, ${tc.primary}, ${tc.secondary})`
          return (
            <button
              key={t.id}
              onClick={() => onPickTheme(t.id)}
              className={`rounded-md p-1 text-left ${t.id === active.id ? 'ring-2 ring-blue-500' : 'ring-1 ring-slate-200'}`}
            >
              <div className="h-7 w-full rounded" style={{ background: swatch }} />
              <span className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-600">
                {t.kind === 'motion' && <Sparkles size={10} className="shrink-0" />}{t.name}
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-3 border-t border-slate-200 pt-2">
        <label className="flex items-center gap-1 text-[11px] text-slate-600">Primary
          <input type="color" value={c.primary} onChange={(e) => onSetColor('primary', e.target.value)}
            className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0" /></label>
        <label className="flex items-center gap-1 text-[11px] text-slate-600">Second
          <input type="color" value={c.secondary} onChange={(e) => onSetColor('secondary', e.target.value)}
            className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0" /></label>
        <label className="flex items-center gap-1 text-[11px] text-slate-600">Text
          <input type="color" value={c.text} onChange={(e) => onSetColor('text', e.target.value)}
            className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0" /></label>
        <button onClick={onReset} className="ml-auto text-[11px] text-slate-500 hover:text-slate-300">Reset</button>
      </div>
    </div>
  )
}

export default ThemeChooser
