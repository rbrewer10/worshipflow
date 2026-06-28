// src/renderer/src/ItemBackgroundPanel.tsx
// Dark vertical panel for styling a single service item: pick a per-item theme,
// override colors, and (text items only) choose a file background. Matches the
// song editor's BackgroundPanel look.

import { THEMES, getTheme, resolveColors } from '../../shared/themes'
import type { ServiceItem, ItemStyle, ThemeColors } from '../../shared/types'

export interface ItemBackgroundPanelProps {
  item: ServiceItem
  onChanged: () => void
}

export default function ItemBackgroundPanel({ item, onChanged }: ItemBackgroundPanelProps): JSX.Element {
  const apply = (style: ItemStyle): Promise<void> =>
    window.wf.serviceSetItemStyle(item.id, style).then(onChanged)
  const clearStyle = (): Promise<void> => window.wf.serviceSetItemStyle(item.id, null).then(onChanged)
  const savePayload = (next: Record<string, unknown>): Promise<void> =>
    window.wf.serviceSetItemPayload(item.id, next).then(onChanged)

  const motionThemes = THEMES.filter((t) => t.kind === 'motion')
  const overrideThemeId = item.style?.theme
  const serviceActive = !overrideThemeId

  const payload = (item.payload ?? {}) as Record<string, unknown>
  const fileBg = payload.background as string | undefined

  // Current resolved colors for the override theme (if any), used as <input> values.
  const colorValues = overrideThemeId
    ? resolveColors(getTheme(overrideThemeId), item.style?.colors)
    : null

  const colorRows: { key: keyof ThemeColors; label: string }[] = [
    { key: 'primary', label: 'Primary' },
    { key: 'secondary', label: 'Secondary' },
    { key: 'text', label: 'Text' }
  ]

  return (
    <div className="flex flex-col gap-3 bg-[#161618] text-white">
      {/* ── Theme gallery ── */}
      <div className="flex flex-col gap-2">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Background &amp; Color
        </label>
        <div className="grid grid-cols-2 gap-2">
          {/* Use service theme (clear/none) */}
          <button
            onClick={() => clearStyle()}
            className={[
              'relative flex items-center justify-center overflow-hidden rounded-lg border transition-all duration-150',
              serviceActive
                ? 'border-indigo-400 ring-2 ring-indigo-400'
                : 'border-white/10 hover:border-white/25 hover:scale-[1.03]'
            ].join(' ')}
            style={{ aspectRatio: '16/9' }}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\'%3E%3Crect width=\'8\' height=\'8\' fill=\'%23222\'/%3E%3Crect x=\'8\' y=\'8\' width=\'8\' height=\'8\' fill=\'%23222\'/%3E%3Crect x=\'8\' width=\'8\' height=\'8\' fill=\'%23181818\'/%3E%3Crect y=\'8\' width=\'8\' height=\'8\' fill=\'%23181818\'/%3E%3C/svg%3E")'
              }}
            />
            <span className="relative z-10 px-1 text-center text-[10px] font-semibold text-slate-300">
              Use service theme
            </span>
            {serviceActive && (
              <div className="absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white shadow">
                ✓
              </div>
            )}
          </button>

          {/* Theme swatches */}
          {motionThemes.map((t) => {
            const active = overrideThemeId === t.id
            return (
              <button
                key={t.id}
                onClick={() => apply({ theme: t.id, colors: item.style?.colors })}
                className={[
                  'relative overflow-hidden rounded-lg border transition-all duration-150',
                  active
                    ? 'border-indigo-400 ring-2 ring-indigo-400'
                    : 'border-white/[0.08] hover:border-white/25 hover:scale-[1.03]'
                ].join(' ')}
                style={{
                  aspectRatio: '16/9',
                  background: `linear-gradient(135deg, ${t.defaults.primary}, ${t.defaults.secondary})`
                }}
              >
                <span
                  className="absolute inset-x-0 bottom-0 flex items-end justify-center pb-1.5 text-[10px] font-semibold text-white"
                  style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7)' }}
                >
                  {t.name}
                </span>
                {active && (
                  <div className="absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white shadow">
                    ✓
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Custom colors (only when an override theme is set) ── */}
      {overrideThemeId && colorValues && (
        <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Custom Colors
            </span>
            <button
              onClick={() => apply({ theme: overrideThemeId })}
              className="text-[10px] font-medium text-slate-400 hover:text-slate-200"
            >
              Reset colors
            </button>
          </div>
          {colorRows.map(({ key, label }) => (
            <label key={key} className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400">{label}</span>
              <input
                type="color"
                value={colorValues[key] ?? '#000000'}
                onChange={(e) =>
                  apply({
                    theme: overrideThemeId,
                    colors: { ...(item.style?.colors ?? {}), [key]: e.target.value }
                  })
                }
                className="h-7 w-12 cursor-pointer rounded border border-white/10 bg-transparent"
              />
            </label>
          ))}
        </div>
      )}

      {/* ── File background (text items only) ── */}
      {item.type === 'text' && (
        <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            File Background
          </span>
          {fileBg && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.06] px-2.5 py-1.5">
              <span className="truncate text-xs text-slate-300" title={fileBg}>
                {fileBg.split(/[\\/]/).pop()}
              </span>
              <button
                onClick={() => savePayload({ ...payload, background: null })}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-600/90 text-[10px] text-white hover:bg-red-500"
                title="Remove background"
              >
                ✕
              </button>
            </div>
          )}
          <button
            onClick={async () => {
              const r = await window.wf.dialogOpenFile()
              if (!r.canceled && r.filePaths[0]) {
                savePayload({ ...payload, background: r.filePaths[0] })
              }
            }}
            className="w-full rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-500"
          >
            Pick image/video…
          </button>
        </div>
      )}
    </div>
  )
}
