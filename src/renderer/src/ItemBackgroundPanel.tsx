// src/renderer/src/ItemBackgroundPanel.tsx
// Dark vertical panel for styling a single service item: pick a per-item theme,
// override colors, and (for types whose live rendering supports it) choose a
// background from your own library. Matches the song editor's BackgroundPanel look.

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { THEMES, getTheme, resolveColors } from '../../shared/themes'
import type { ServiceItem, ItemStyle, ThemeColors, ServiceItemType } from '../../shared/types'
import BackgroundLibraryGrid from './BackgroundLibraryGrid'

// Item types whose live rendering actually shows a custom file background —
// Song has its own separate background system, Image's payload.path already
// IS the background, and Ticker/Announcement don't support one yet.
const FILE_BACKGROUND_TYPES: ServiceItemType[] = ['text', 'scripture', 'countdown', 'welcome', 'sermon']

export interface ItemBackgroundPanelProps {
  item: ServiceItem
  onChanged: () => void
}

export default function ItemBackgroundPanel({ item, onChanged }: ItemBackgroundPanelProps): JSX.Element {
  const [tab, setTab] = useState<'library' | 'presets'>('library')

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
  const supportsFileBackground = FILE_BACKGROUND_TYPES.includes(item.type)
  const blurBehindText = !!(payload.blurBehindText as boolean | undefined)

  // Current resolved colors for the override theme (if any), used as <input> values.
  const colorValues = overrideThemeId
    ? resolveColors(getTheme(overrideThemeId), item.style?.colors)
    : null

  const colorRows: { key: keyof ThemeColors; label: string }[] = [
    { key: 'primary', label: 'Primary' },
    { key: 'secondary', label: 'Secondary' },
    { key: 'text', label: 'Text' }
  ]

  const presetsContent = (
    <>
      {/* ── Theme gallery ── */}
      <div className="flex flex-col gap-2">
        {!supportsFileBackground && (
          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Background &amp; Color
          </label>
        )}
        <div className="grid grid-cols-2 gap-2">
          {/* Use service theme (clear/none) */}
          <button
            onClick={() => clearStyle()}
            className={[
              'relative flex items-center justify-center overflow-hidden rounded-lg border transition-all duration-150',
              serviceActive
                ? 'border-blue-400 ring-2 ring-blue-400'
                : 'border-slate-200 hover:border-slate-300 hover:scale-[1.03]'
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
            <span className="relative z-10 px-1 text-center text-[10px] font-semibold text-slate-700">
              Use service theme
            </span>
            {serviceActive && (
              <div className="absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white shadow">
                <Check size={10} strokeWidth={3} />
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
                    ? 'border-blue-400 ring-2 ring-blue-400'
                    : 'border-slate-200 hover:border-slate-300 hover:scale-[1.03]'
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
                  <div className="absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white shadow">
                    <Check size={10} strokeWidth={3} />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Custom colors (only when an override theme is set) ── */}
      {overrideThemeId && colorValues && (
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Custom Colors
            </span>
            <button
              onClick={() => apply({ theme: overrideThemeId })}
              className="text-[10px] font-medium text-slate-600 hover:text-slate-900"
            >
              Reset colors
            </button>
          </div>
          {colorRows.map(({ key, label }) => (
            <label key={key} className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-600">{label}</span>
              <input
                type="color"
                value={colorValues[key] ?? '#000000'}
                onChange={(e) =>
                  apply({
                    theme: overrideThemeId,
                    colors: { ...(item.style?.colors ?? {}), [key]: e.target.value }
                  })
                }
                className="h-7 w-12 cursor-pointer rounded border border-slate-200 bg-transparent"
              />
            </label>
          ))}
        </div>
      )}
    </>
  )

  if (!supportsFileBackground) {
    return (
      <div className="flex flex-col gap-3 bg-[#f4f6f9] text-slate-900">
        {presetsContent}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 bg-[#f4f6f9] text-slate-900">
      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
        Background &amp; Color
      </label>

      {/* ── Blur behind text ── */}
      <button
        onClick={() => savePayload({ ...payload, blurBehindText: !blurBehindText })}
        className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors ${
          blurBehindText ? 'border-blue-400 bg-blue-500/10' : 'border-slate-200 bg-white'
        }`}
      >
        <span className="text-[11px] font-semibold text-slate-700">Blur behind text</span>
        <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${blurBehindText ? 'bg-blue-600' : 'bg-slate-300'}`}>
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${blurBehindText ? 'translate-x-4' : 'translate-x-1'}`} />
        </span>
      </button>

      {/* ── Tab strip ── */}
      <div className="flex rounded-lg bg-slate-100 p-0.5">
        {(['library', 'presets'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'flex-1 rounded-md py-1.5 text-[11px] font-semibold transition-all duration-150',
              tab === t
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-600 hover:text-slate-900',
            ].join(' ')}
          >
            {t === 'library' ? 'My Backgrounds' : 'Presets'}
          </button>
        ))}
      </div>

      {tab === 'library' && (
        <div className="flex flex-col gap-2">
          {fileBg && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-100 px-2.5 py-1.5">
              <span className="truncate text-xs text-slate-700" title={fileBg}>
                {fileBg.split(/[\\/]/).pop()}
              </span>
              <button
                onClick={() => savePayload({ ...payload, background: null })}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-600/90 text-white hover:bg-red-500"
                title="Remove background"
              >
                <X size={12} />
              </button>
            </div>
          )}
          <BackgroundLibraryGrid
            activePath={fileBg ?? null}
            onApply={(path) => savePayload({ ...payload, background: path || null })}
          />
        </div>
      )}

      {tab === 'presets' && presetsContent}
    </div>
  )
}
