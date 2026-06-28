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

const MOTION_OPTIONS: { label: string; value: SongFull['bgMotion'] }[] = [
  { label: 'Pan', value: 'pan' },
  { label: 'Zoom', value: 'zoom' },
  { label: 'Shimmer', value: 'shimmer' },
  { label: 'None', value: null },
]

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
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (tab === 'uploads') loadUploads()
  }, [tab])

  async function loadUploads(): Promise<void> {
    try {
      const list = await window.wf.bgList()
      setUploads(list)
    } catch {
      setUploads([])
    }
  }

  async function handleUploadFile(file: File): Promise<void> {
    // We need the file path — in Electron, File objects from drag/drop or input have a .path property
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

  // Drag and drop handlers
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

  return (
    <div className="flex h-full flex-col bg-[#161618] text-white">
      {/* Tab strip */}
      <div className="flex shrink-0 border-b border-white/10">
        {(['uploads', 'presets', 'ai'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-xs font-semibold capitalize transition-colors ${
              tab === t ? 'border-b-2 border-blue-500 text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            {t === 'uploads' ? 'My Uploads' : t === 'presets' ? 'Presets' : 'AI Generate'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {/* My Uploads tab */}
        {tab === 'uploads' && (
          <div className="flex flex-col gap-3">
            {/* Drag-drop zone */}
            <div
              ref={dropRef}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={handleBrowse}
              className={`cursor-pointer rounded-lg border-2 border-dashed p-4 text-center text-xs transition-colors ${
                dragging ? 'border-blue-400 bg-blue-500/10 text-blue-300' : 'border-white/20 text-white/40 hover:border-white/40 hover:text-white/60'
              }`}
            >
              Drop image/video here or click to browse
            </div>

            {/* Uploaded thumbnails grid */}
            {uploads.length === 0 ? (
              <p className="py-6 text-center text-xs text-white/30">No uploads yet</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {uploads.map((u) => {
                  const active = song.background === u.path
                  return (
                    <div
                      key={u.path}
                      className={`group relative cursor-pointer overflow-hidden rounded border-2 transition-all ${
                        active ? 'border-blue-500' : 'border-transparent hover:border-white/30'
                      }`}
                      style={{ aspectRatio: '16/9' }}
                      onClick={() => onApply(u.path)}
                    >
                      {u.isVideo ? (
                        <video src={toAssetUrl(u.path)} className="h-full w-full object-cover" muted />
                      ) : (
                        <div
                          className="h-full w-full bg-cover bg-center"
                          style={{ backgroundImage: `url(${toAssetUrl(u.path)})` }}
                        />
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(u.path) }}
                        className="absolute right-1 top-1 hidden rounded bg-red-600/80 p-0.5 text-xs group-hover:flex"
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

        {/* Presets tab */}
        {tab === 'presets' && (
          <div className="flex flex-col gap-3">
            <button
              onClick={handleRandomPreset}
              className="w-full rounded-lg bg-purple-700 py-2 text-sm font-semibold hover:bg-purple-600"
            >
              🎲 Random Preset
            </button>
            <div className="grid grid-cols-2 gap-2">
              {THEMES.filter((t) => t.kind === 'motion').map((t) => {
                const active = song.background === `theme:${t.id}`
                return (
                  <button
                    key={t.id}
                    onClick={() => onApply(`theme:${t.id}`)}
                    className={`rounded border-2 p-2 text-center text-xs transition-all ${
                      active ? 'border-blue-500 bg-blue-500/10' : 'border-white/10 hover:border-white/30'
                    }`}
                    style={{
                      background: `linear-gradient(135deg, ${t.defaults.primary}, ${t.defaults.secondary})`
                    }}
                  >
                    <span className="font-semibold text-white drop-shadow">{t.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* AI Generate tab */}
        {tab === 'ai' && (
          <div className="flex flex-col gap-3">
            <label className="text-xs text-white/50">Describe the background</label>
            <textarea
              className="w-full resize-none rounded border border-white/20 bg-white/5 p-2 text-xs text-white placeholder:text-white/30 focus:border-blue-400 focus:outline-none"
              rows={3}
              placeholder='e.g. "golden rays of light through clouds"'
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
            />
            <button
              onClick={handleGenerate}
              disabled={aiLoading || !aiPrompt.trim()}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold disabled:opacity-50 hover:bg-blue-500"
            >
              {aiLoading ? 'Generating…' : 'Generate Background'}
            </button>
            {aiError && <p className="text-xs text-red-400">{aiError}</p>}
            {aiLoading && (
              <p className="text-center text-xs text-white/40">
                Generating with AI (~10–30 seconds)…
              </p>
            )}

            {/* Ken Burns motion picker */}
            <div className="mt-2 rounded-lg border border-white/10 p-3">
              <p className="mb-2 text-xs font-semibold text-white/60">Motion Effect</p>
              <div className="grid grid-cols-2 gap-1.5">
                {MOTION_OPTIONS.map((m) => (
                  <button
                    key={String(m.value)}
                    onClick={() => onBgMotionChange(m.value)}
                    className={`rounded py-1.5 text-xs font-semibold transition-colors ${
                      song.bgMotion === m.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[10px] text-white/30">
              Powered by Replicate Flux Schnell · ~$0.003/image · Set API key in Settings → Integrations
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
