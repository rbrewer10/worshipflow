// src/renderer/src/editor/BackgroundPanel.tsx
// Right-side panel for selecting/uploading/generating slide backgrounds.

import { useState, useEffect } from 'react'
import { Check, Sparkles, Dices, MoveHorizontal, ZoomIn, Minus } from 'lucide-react'
import { THEMES } from '../../../shared/themes'
import type { SongFull } from '../../../shared/types'
import BackgroundLibraryGrid from '../BackgroundLibraryGrid'

const MOTION_OPTIONS: { label: string; value: SongFull['bgMotion']; icon: JSX.Element }[] = [
  { label: 'Pan', value: 'pan', icon: <MoveHorizontal size={13} /> },
  { label: 'Zoom', value: 'zoom', icon: <ZoomIn size={13} /> },
  { label: 'Shimmer', value: 'shimmer', icon: <Sparkles size={13} /> },
  { label: 'None', value: null, icon: <Minus size={13} /> },
]

const TAB_LABELS: Record<'uploads' | 'presets' | 'ai', string> = {
  uploads: 'My Uploads',
  presets: 'Presets',
  ai: 'AI Generate',
}

export default function BackgroundPanel({ song, onApply, onBgMotionChange, onBlurBehindTextChange }: {
  song: SongFull
  onApply: (bgPath: string) => void
  onBgMotionChange: (motion: SongFull['bgMotion']) => void
  onBlurBehindTextChange: (value: boolean) => void
}): JSX.Element {
  const [tab, setTab] = useState<'uploads' | 'presets' | 'ai'>('presets')
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeySaved, setApiKeySaved] = useState(false)
  const [provider, setProvider] = useState<'pollinations' | 'replicate'>('pollinations')

  useEffect(() => {
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

  async function handleGenerate(): Promise<void> {
    if (!aiPrompt.trim()) return
    setAiLoading(true)
    setAiError('')
    try {
      const dest = await window.wf.bgGenerate(aiPrompt)
      onApply(dest)
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

  const motionThemes = THEMES.filter((t) => t.kind === 'motion')
  const noneActive = !song.background

  return (
    <div className="flex h-full flex-col bg-[#f4f6f9] text-slate-900">

      {/* ── Segmented tab strip ── */}
      <div className="shrink-0 px-3 pt-3 pb-0">
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {(['uploads', 'presets', 'ai'] as const).map((t) => (
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
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Blur behind text ── */}
      <div className="shrink-0 px-3 pt-2">
        <button
          onClick={() => onBlurBehindTextChange(!song.blurBehindText)}
          className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors ${
            song.blurBehindText ? 'border-blue-400 bg-blue-500/10' : 'border-slate-200 bg-white'
          }`}
        >
          <span className="text-[11px] font-semibold text-slate-700">Blur behind text</span>
          <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${song.blurBehindText ? 'bg-blue-600' : 'bg-slate-300'}`}>
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${song.blurBehindText ? 'translate-x-4' : 'translate-x-1'}`} />
          </span>
        </button>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 pt-3">

        {/* ════════ MY UPLOADS ════════ */}
        {tab === 'uploads' && (
          <BackgroundLibraryGrid activePath={song.background ?? null} onApply={onApply} />
        )}

        {/* ════════ PRESETS ════════ */}
        {tab === 'presets' && (
          <div className="flex flex-col gap-3">

            {/* Random button */}
            <button
              onClick={handleRandomPreset}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-blue-500 hover:shadow-blue-500/20 hover:shadow-lg active:scale-[0.98]"
            >
              <Dices size={15} className="group-hover:animate-spin" />
              Random Preset
            </button>

            {/* "None / Clear" card */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onApply('')}
                className={[
                  'relative flex items-center justify-center overflow-hidden rounded-xl border transition-all duration-150',
                  noneActive
                    ? 'border-blue-500 ring-2 ring-blue-500 ring-offset-1 ring-offset-[#f4f6f9]'
                    : 'border-slate-200 hover:border-slate-300 hover:scale-[1.02]',
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
                <span className="relative z-10 text-[10px] font-semibold text-slate-600">None</span>
                {noneActive && (
                  <div className="absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white shadow">
                    <Check size={10} strokeWidth={3} />
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
                        ? 'border-blue-500 ring-2 ring-blue-500 ring-offset-1 ring-offset-[#f4f6f9] scale-[1.01]'
                        : 'border-slate-200 hover:border-slate-300 hover:scale-[1.03] hover:shadow-lg',
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
                      <div className="absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white shadow">
                        <Check size={10} strokeWidth={3} />
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
            <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 bg-white p-1">
              <button
                onClick={() => chooseProvider('pollinations')}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                  provider === 'pollinations' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles size={13} /> Free
              </button>
              <button
                onClick={() => chooseProvider('replicate')}
                className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
                  provider === 'replicate' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Replicate
              </button>
            </div>

            {provider === 'pollinations' ? (
              <p className="rounded-lg border border-blue-500/20 bg-blue-500/[0.07] px-3 py-2 text-[11px] leading-relaxed text-blue-700">
                Free · no key needed · powered by Pollinations.ai. Generation can take ~10–40s.
              </p>
            ) : (
              /* Replicate API key */
              <div className={`rounded-xl border p-3 ${apiKey ? 'border-slate-200 bg-white' : 'border-amber-500/30 bg-amber-500/[0.07]'}`}>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Replicate API key
                  </label>
                  {apiKey
                    ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700"><span className="h-1.5 w-1.5 rounded-full bg-blue-500" />Set</span>
                    : <span className="text-[10px] font-semibold text-amber-700">Required</span>}
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="r8_…"
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500/70 focus:outline-none"
                  />
                  <button
                    onClick={saveApiKey}
                    disabled={apiKeyInput.trim() === (apiKey ?? '')}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {apiKeySaved ? <><Check size={13} /> Saved</> : 'Save'}
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">
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
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 transition-colors focus:border-blue-500/70 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
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
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow transition-all hover:bg-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
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
                <><Sparkles size={15} /> Generate Background</>
              )}
            </button>

            {/* States */}
            {aiLoading && (
              <p className="text-center text-[10px] text-slate-500">
                AI is painting your scene — ~10–30 seconds
              </p>
            )}
            {aiError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-600">
                {aiError}
              </div>
            )}

            {/* Motion Effect picker */}
            <div className="rounded-xl border border-slate-200 bg-white p-3">
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
                          ? 'bg-blue-600 text-white shadow'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900',
                      ].join(' ')}
                    >
                      {m.icon}
                      {m.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Fine print */}
            <p className="text-[10px] leading-relaxed text-slate-400">
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
