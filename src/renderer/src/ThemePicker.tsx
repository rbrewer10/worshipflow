import { useState } from 'react'
import { getTheme } from '../../shared/themes'
import type { ThemeColors } from '../../shared/types'
import ThemeChooser from './ThemeChooser'

// Per-service theme picker with live color customization.
function ThemePicker({ serviceId, themeId, colors, onChange }: {
  serviceId: number
  themeId: string | null
  colors: ThemeColors | null
  onChange: () => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const active = getTheme(themeId)

  const setTheme = (id: string): void => {
    window.wf.serviceSetTheme(serviceId, id, colors)
    onChange()
  }
  const setColor = (key: keyof ThemeColors, val: string): void => {
    const next: ThemeColors = { ...(colors ?? {}), [key]: val }
    window.wf.serviceSetTheme(serviceId, active.id, next)
    onChange()
  }
  const resetColors = (): void => {
    window.wf.serviceSetTheme(serviceId, active.id, null)
    onChange()
  }

  return (
    <div className="mb-3 rounded-lg border border-white/10 bg-black/20 p-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-xs font-semibold text-slate-300"
      >
        <span>🎨 Theme — {active.name}</span>
        <span className="text-slate-500">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-2">
          <ThemeChooser
            themeId={active.id}
            colors={colors}
            onPickTheme={setTheme}
            onSetColor={setColor}
            onReset={resetColors}
          />
        </div>
      )}
    </div>
  )
}

export default ThemePicker
