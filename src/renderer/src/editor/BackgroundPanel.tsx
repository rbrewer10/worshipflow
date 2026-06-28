// src/renderer/src/editor/BackgroundPanel.tsx
// Right-side panel for selecting/uploading/generating slide backgrounds.

import { useState, useEffect, useRef } from 'react'
import { THEMES } from '../../../shared/themes'
import type { SongFull } from '../../../shared/types'

function toAssetUrl(p: string): string {
  return 'wf-asset://?path=' + encodeURIComponent(p)
}

interface BgEntry {
  filename: string
  path: string
  kind: 'upload' | 'generated'
  isVideo: boolean
}

const MOTION_OPTIONS: { label: string; value: SongFull['bgMotion']; icon: string }[] = [
  { label: 'Pan', value: 'pan', icon: '↔' },
  { label: 'Zoom', value: 'zoom', icon: '⤢' },
  { label: 'Shimmer', value: 'shimmer', icon: '✦' },
  { label: 'None', value: null, icon: '–' },
]

const TAB_LABELS: Record<'uploads' | 'presets' | 'ai', string> = {
  uploads: 'My Uploads',
  presets: 'Presets',
  ai: 'AI Generate',
}

export default function BackgroundPanel({ song, onApply, onBgMotionChange }: {
  song: SongFull
  onApply: (bgPath: string) => void
  onBgMotionChange: (motion: SongFull['bgMotion']) => void
}): JSX.Element {
  const [tab, setTab] = useState<'uploads' | 'presets' | 'ai'>('presets')
  const [uploads, setUploads] = useState<BgEntry[]>([])
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeySaved, setApiKeySaved] = useState(false)
  const [provider, setProvider] = useState<'pollinations' | 'replicate'>('pollinations')
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (tab === 'uploads') loadUploads()
    if (tab === 'ai') {
      window.wf.settingGet('replicate_api_key').then((k) => { setApiKey(k); setApiKeyInput(k ?? '') })
      window.wf.settingGet('ai_provider').then((p) => setProvider(p === 'replicate' ? 'replicate' : 'pollinations'))
    }
  }, [tab])

  function chooseProvider(p: 'pollinations' | 'replicate'): void {
    setProvider(p)
    setAiError('')
    window.wf.settingSet('ai_provider', p)
  }

  async function saveApiKey(): Promise<void> {
    const v = apiKeyInput.trim()
    await window.wf.settingSet('replicate_api_key', v || null)
    setApiKey(v || null)
    setApiKeySaved(true)
    setTimeout(() => setApiKeySaved(false), 2000)
    if (v) setAiError('')
  }

  async function loadUploads(): Promise<void> {
    try {
      const list = await window.wf.bgList()
      setUploads(list)
    } catch {
      setUploads([])
    }
  }

  async function handleUploadFile(file: File): Promise<void> {
    const path = (file as File & { path?: string }).path
    if (!path) return
    try {
      const dest = await window.wf.bgUpload(path)
      onApply(dest)
      await loadUploads()
    } catch (e) {
      console.error('Upload failed', e)
    }
  }

  async function handleBrowse(): Promise<void> {
    const result = await window.wf.bgOpenDialog()
    if (!result.canceled && result.filePaths[0]) {
      const dest = await window.wf.bgUpload(result.filePaths[0])
      onApply(dest)
      await loadUploads()
    }
  }

  async function handleDelete(filePath: string): Promise<void> {
    await window.wf.bgDelete(filePath)
    await loadUploads()
    if (song.background === filePath) onApply('')
  }

  async function handleGenerate(): Promise<void> {
    if (!aiPrompt.trim()) return
    setAiLoading(true)
    setAiError('')
    try {
      const dest = await window.wf.bgGenerate(aiPrompt)
      onApply(dest)
      if (tab === 'uploads') await loadUploads()
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setAiLoading(false)
    }
  }

  function handleRandomPreset(): void {
    const themes = THEMES.filter((t) => t.kind === 'motion')
    const pick = themes[Math.floor(Math.random() * themes.length)]
    onApply(`theme:${pick.id}`)
  }

  function onDragOver(e: React.DragEvent): void {
    e.preventDefault()
    setDragging(true)
  }
  function onDragLeave(): void { setDragging(false) }
  function onDrop(e: React.DragEvent): void {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUploadFile(file)
  }

  const motionThemes = THEMES.filter((t) => t.kind === 'motion')
  const noneActive = !song.background

  return (
    <div className="flex h-full flex-col bg-[#161618] text-white">

      {/* ── Segmented tab strip ── */}
      <div className="shrink-0 px-3 pt-3 pb-0">
        <div className="flex rounded-lg bg-white/[0.06] p-0.5">
          {(['uploads', 'presets', 'ai'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                'flex-1 rounded-md py-1.5 text-[11px] font-semibold transition-all duration-150',
                tab === t
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200',
              ].join(' ')}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 pt-3">

        {/* ════════ MY UPLOADS ════════ */}
        {tab === 'uploads' && (
          <div className="flex flex-col gap-3">

            {/* Drag-drop zone */}
            <div
              ref={dropRef}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={handleBrowse}
              className={[
                'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-7 text-center transition-all',
                dragging
                  ? 'border-indigo-400 bg-indigo-500/10 text-indigo-300'
                  : 'border-white/10 text-slate-400 hover:border-white/25 hover:bg-white/[0.03] hover:text-slate-300',
              ].join(' ')}
            >
              <span className="text-xl leading-none">📁</span>
              <span className="text-xs font-medium">Drop image or video here</span>
              <span className="text-[10px] text-slate-500">or click to browse</span>
            </div>

            {/* Thumbnails grid */}
            {uploads.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-600">No uploads yet</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {uploads.map((u) => {
                  const active = song.background === u.path
                  return (
                    <div
                      key={u.path}
                      onClick={() => onApply(u.path)}
                      className={[
                        'group relative cursor-pointer overflow-hidden rounded-lg transition-all duration-150',
                        active
                          ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-[#161618]'
                          : 'ring-1 ring-white/10 hover:ring-white/25 hover:scale-[1.02]',
                      ].join(' ')}
                      style={{ aspectRatio: '16/9' }}
                    >
                      {u.isVideo ? (
                        <video src={toAssetUrl(u.path)} className="h-full w-full object-cover" muted />
                      ) : (
                        <div
                          className="h-full w-full bg-cover bg-center"
                          style={{ backgroundImage: `url(${toAssetUrl(u.path)})` }}
                        />
                      )}

                      {/* Active badge */}
                      {active && (
                        <div className="absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white shadow">
                          ✓
                        </div>
                      )}

                      {/* Delete button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(u.path) }}
                        className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-red-600/90 text-[10px] text-white shadow group-hover:flex hover:bg-red-500"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ════════ PRESETS ════════ */}
        {tab === 'presets' && (
          <div className="flex flex-col gap-3">

            {/* Random button */}
            <button
              onClick={handleRandomPreset}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:from-indigo-500 hover:to-violet-500 hover:shadow-indigo-500/20 hover:shadow-lg active:scale-[0.98]"
            >
              <span className="text-base leading-none group-hover:animate-spin" style={{ display: 'inline-block' }}>🎲</span>
              Random Preset
            </button>

            {/* "None / Clear" card */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onApply('')}
                className={[
                  'relative flex items-center justify-center overflow-hidden rounded-xl border transition-all duration-150',
                  noneActive
                    ? 'border-indigo-500 ring-2 ring-indigo-500 ring-offset-1 ring-offset-[#161618]'
                    : 'border-white/10 hover:border-white/25 hover:scale-[1.02]',
                ].join(' ')}
                style={{ aspectRatio: '16/9' }}
              >
                {/* Checkerboard pattern via SVG data URI */}
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\'%3E%3Crect width=\'8\' height=\'8\' fill=\'%23222\'/%3E%3Crect x=\'8\' y=\'8\' width=\'8\' height=\'8\' fill=\'%23222\'/%3E%3Crect x=\'8\' width=\'8\' height=\'8\' fill=\'%23181818\'/%3E%3Crect y=\'8\' width=\'8\' height=\'8\' fill=\'%23181818\'/%3E%3C/svg%3E")',
                  }}
                />
                <span className="relative z-10 text-[10px] font-semibold text-slate-400">None</span>
                {noneActive && (
                  <div className="absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-bold text-white shadow">
                    ✓
                  </div>
                )}
              </button>

              {/* Theme cards */}
              {motionThemes.map((t) => {
                const active = song.background === `theme:${t.id}`
                return (
                  <button
                    key={t.id}
                    onClick={() => onApply(`theme:${t.id}`)}
                    className={[
                      'relative overflow-hidden rounded-xl border transition-all duration-150',
                      active
                        ? 'border-indigo-500 ring-2 ring-indigo-500 ring-offset-1 ring-offset-[#161618] scale-[1.01]'
                        : 'border-white/[0.08] hover:border-white/25 hover:scale-[1.03] hover:shadow-lg',
                    ].join(' ')}
                    style={{
                      aspectRatio: '16/9',
                      background: `linear-gradient(135deg, ${t.defaults.primary}, ${t.defaults.secondary})`,
                    }}
                  >
                    {/* Name label */}
                    <span
                      className="absolute inset-x-0 bottom-0 flex items-end justify-center pb-1.5 text-[10px] font-semibold text-white"
                      style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7)' }}
                    >
                      {t.name}
                    </span>

                    {/* Active check badge */}
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
        )}

        {/* ════════ AI GENERATE ════════ */}
        {tab === 'ai' && (
          <div className="flex flex-col gap-3">

            {/* Provider toggle */}
            <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
              <button
                onClick={() => chooseProvider('pollinations')}
                className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
                  provider === 'pollinations' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ✦ Free
              </button>
              <button
                onClick={() => chooseProvider('replicate')}
                className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
                  provider === 'replicate' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Replicate
              </button>
            </div>

            {provider === 'pollinations' ? (
              <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-2 text-[11px] leading-relaxed text-emerald-300/90">
                Free · no key needed · powered by Pollinations.ai. Generation can take ~10–40s.
              </p>
            ) : (
              /* Replicate API key */
              <div className={`rounded-xl border p-3 ${apiKey ? 'border-white/[0.08] bg-white/[0.03]' : 'border-amber-500/30 bg-amber-500/[0.07]'}`}>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Replicate API key
                  </label>
                  {apiKey
                    ? <span className="text-[10px] font-semibold text-emerald-400">● Set</span>
                    : <span className="text-[10px] font-semibold text-amber-400">Required</span>}
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="r8_…"
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-indigo-500/70 focus:outline-none"
                  />
                  <button
                    onClick={saveApiKey}
                    disabled={apiKeyInput.trim() === (apiKey ?? '')}
                    className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {apiKeySaved ? '✓ Saved' : 'Save'}
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-slate-600">
                  Get a token at replicate.com/account/api-tokens · stored locally on this computer
                </p>
              </div>
            )}

            {/* Prompt label + textarea */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Describe the background
              </label>
              <textarea
                className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-xs text-white placeholder:text-slate-600 transition-colors focus:border-indigo-500/70 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                rows={3}
                placeholder='e.g. "golden rays of light through stained glass"'
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
              />
            </div>

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={aiLoading || !aiPrompt.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow transition-all hover:bg-indigo-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {aiLoading ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Generating…
                </>
              ) : (
                <>✨ Generate Background</>
              )}
            </button>

            {/* States */}
            {aiLoading && (
              <p className="text-center text-[10px] text-slate-500">
                AI is painting your scene — ~10–30 seconds
              </p>
            )}
            {aiError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-400">
                {aiError}
              </div>
            )}

            {/* Motion Effect picker */}
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Motion Effect
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {MOTION_OPTIONS.map((m) => {
                  const active = song.bgMotion === m.value
                  return (
                    <button
                      key={String(m.value)}
                      onClick={() => onBgMotionChange(m.value)}
                      className={[
                        'flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all duration-100',
                        active
                          ? 'bg-indigo-600 text-white shadow'
                          : 'bg-white/[0.05] text-slate-400 hover:bg-white/10 hover:text-slate-200',
                      ].join(' ')}
                    >
                      <span className="text-[13px] leading-none">{m.icon}</span>
                      {m.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Fine print */}
            <p className="text-[10px] leading-relaxed text-slate-600">
              {provider === 'pollinations'
                ? 'Free image generation · Pollinations.ai'
                : 'Powered by Replicate Flux Schnell · ~$0.003 / image'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
