// src/renderer/src/ItemBackgroundPanel.tsx
// Dark vertical panel for styling a single service item: pick a per-item theme,
// override colors, and (for types whose live rendering supports it) choose a
// background from your own library. Matches the song editor's BackgroundPanel look.

import { useState } from 'react'
import { Check, ImageIcon, X } from 'lucide-react'
import { THEMES, getTheme, resolveColors } from '../../shared/themes'
import type { ServiceItem, ItemStyle, ThemeColors, SongFull } from '../../shared/types'
import { PAYLOAD_BACKGROUND_TYPES } from '../../shared/types'
import BackgroundLibraryGrid from './BackgroundLibraryGrid'
import { resolveBackgroundApply } from './drawer/resolveBackgroundApply'
import Modal from './Modal'
import SaveStatusBadge from './SaveStatusBadge'
import type { SaveStatus } from './useAutosave'

function toAssetUrl(p: string): string {
  return 'wf-asset://?path=' + encodeURIComponent(p)
}

export interface ItemBackgroundPanelProps {
  item: ServiceItem
  // A song's background lives on the song record, not the item payload, so the
  // panel needs the loaded song to show which one is currently selected.
  songFull?: SongFull | null
  onChanged: () => void
  // Save queues are owned by CardEditPanel (the parent item editor) and passed
  // down rather than created here — this panel used to run its own separate
  // useAutosave queues even though it's editing the same item/song record
  // CardEditPanel's other fields (lyrics, notes, payload) also write to, so a
  // rapid theme click here and a text edit elsewhere could reach the DB out
  // of order. One shared set of queues per record closes that gap.
  savePayload: (payload: Record<string, unknown>) => void
  applySongBackground: (path: string | null) => void
  onToggleSongBlur: () => void
  applyItemStyle: (style: ItemStyle | null) => void
  saveStatus: SaveStatus
  saveError: string | null
  onRetrySave: () => void
}

export default function ItemBackgroundPanel({
  item, songFull, savePayload, applySongBackground, onToggleSongBlur, applyItemStyle,
  saveStatus, saveError, onRetrySave
}: ItemBackgroundPanelProps): JSX.Element {
  const [tab, setTab] = useState<'library' | 'presets'>('library')
  // The library grid used to apply a click immediately, in a 2-column grid
  // squeezed into this narrow column — too small to actually judge a
  // background by, and no chance to back out of a click. It now opens full
  // size in a modal instead; picks there are staged in pendingPath until
  // "Use this background" commits them, so browsing around doesn't touch
  // the live item until you're sure.
  const [showPicker, setShowPicker] = useState(false)
  const [pendingPath, setPendingPath] = useState<string | null>(null)

  const apply = (style: ItemStyle): void => applyItemStyle(style)
  const clearStyle = (): void => applyItemStyle(null)

  const motionThemes = THEMES.filter((t) => t.kind === 'motion')
  const overrideThemeId = item.style?.theme
  const serviceActive = !overrideThemeId

  const payload = (item.payload ?? {}) as Record<string, unknown>

  // Songs keep their background and blur on the song record rather than the
  // item payload, so they're excluded from PAYLOAD_BACKGROUND_TYPES — but they
  // should still offer the same library. Without this a song showed only the
  // theme swatches, which reads as "my uploaded backgrounds disappeared".
  const isSong = item.type === 'song' && item.ref_id != null
  const supportsFileBackground = PAYLOAD_BACKGROUND_TYPES.includes(item.type) || isSong

  // A `theme:<id>` value is a motion theme, not a real file — only the
  // projector renders those, so the library shows nothing as selected.
  const songBg = songFull?.background && !songFull.background.startsWith('theme:') ? songFull.background : undefined
  const fileBg = isSong ? songBg : (payload.background as string | undefined)
  const blurBehindText = isSong
    ? !!songFull?.blurBehindText
    : !!(payload.blurBehindText as boolean | undefined)

  // Routes a pick to wherever this item type actually stores its background —
  // the same split the Live drawer's Backgrounds tab already goes through.
  const applyBackground = (path: string | null): void => {
    if (isSong && item.ref_id != null) {
      applySongBackground(path)
      return
    }
    const action = resolveBackgroundApply(item, path ?? '')
    if (action.kind === 'payload') {
      savePayload({ ...payload, background: path })
    }
  }

  const toggleBlur = (): void => {
    if (isSong && item.ref_id != null) {
      onToggleSongBlur()
      return
    }
    savePayload({ ...payload, blurBehindText: !blurBehindText })
  }

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
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Background &amp; Color
          </span>
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
      <div className="flex shrink-0 grow flex-col gap-3 bg-[#f4f6f9] text-slate-900">
        {presetsContent}
      </div>
    )
  }

  // grow + shrink-0 (flex: 1 0 auto): the light surface stretches to fill the
  // rest of the editor's scrolling body when its content is short — it used to
  // stop at its content and leave dead dark space below — but never gets
  // squeezed under its own content when the library grid is long.
  return (
    <div className="flex shrink-0 grow flex-col gap-3 bg-[#f4f6f9] text-slate-900">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Background &amp; Color
        </span>
        <SaveStatusBadge status={saveStatus} error={saveError} onRetry={onRetrySave} />
      </div>

      {/* ── Blur behind text ── */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Readability</span>
        <button
          onClick={() => toggleBlur()}
          className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors ${
            blurBehindText ? 'border-blue-400 bg-blue-500/10' : 'border-slate-200 bg-white'
          }`}
        >
          <span className="flex flex-col text-left">
            <span className="text-[11px] font-semibold text-slate-700">Blur behind text</span>
            <span className="text-[10px] text-slate-500">Darkens &amp; blurs the background behind the text so it's easier to read</span>
          </span>
          <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${blurBehindText ? 'bg-blue-600' : 'bg-slate-300'}`}>
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${blurBehindText ? 'translate-x-4' : 'translate-x-1'}`} />
          </span>
        </button>
      </div>

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
          <button
            onClick={() => { setPendingPath(fileBg ?? null); setShowPicker(true) }}
            className="group relative overflow-hidden rounded-lg border border-slate-200 hover:border-slate-300"
            style={{ aspectRatio: '16/9' }}
            title="Browse your background library at full size"
          >
            {fileBg ? (
              <img src={toAssetUrl(fileBg)} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-100 text-slate-500">
                <ImageIcon size={20} />
                <span className="text-[11px] font-medium">No background selected</span>
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
              <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-800">
                {fileBg ? 'Change' : 'Choose'} background
              </span>
            </div>
          </button>
          {fileBg && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-100 px-2.5 py-1.5">
              <span className="truncate text-xs text-slate-700" title={fileBg}>
                {fileBg.split(/[\\/]/).pop()}
              </span>
              <button
                onClick={() => applyBackground(null)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-600/90 text-white hover:bg-red-500"
                title="Remove background"
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'presets' && presetsContent}

      {showPicker && (
        <Modal onClose={() => setShowPicker(false)} label="Choose a background" className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-panel-raised text-content-primary shadow-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-content-primary">Choose a background</h2>
            <button onClick={() => setShowPicker(false)} className="btn-pill text-xs"><X size={12} /> Close</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <BackgroundLibraryGrid
              activePath={pendingPath}
              onApply={(path) => setPendingPath(path || null)}
            />
          </div>
          {/* Floating footer — stays put while the grid above scrolls, so
              confirming a pick never means hunting back down to a button
              that scrolled away with the thumbnails. */}
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-panel-raised px-5 py-3">
            <button onClick={() => setShowPicker(false)} className="btn text-xs">Cancel</button>
            <button
              onClick={() => { applyBackground(pendingPath); setShowPicker(false) }}
              className="btn-primary text-xs"
            >
              <Check size={13} /> Use this background
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
