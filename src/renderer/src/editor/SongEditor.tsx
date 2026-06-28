// src/renderer/src/editor/SongEditor.tsx
// Top-level editor: SlideStrip + SlideCanvas + BackgroundPanel
// Replaces the right-side form panel in SongLibrary.

import { useState, useEffect, useCallback, useRef } from 'react'
import type { SongFull, SongInput, SongSection } from '../../../shared/types'
import { computeEditorSlides, applySlideEdit } from './slideCompute'
import SlideStrip from './SlideStrip'
import SlideCanvas from './SlideCanvas'
import BackgroundPanel from './BackgroundPanel'

export default function SongEditor({ songId, onSaved }: {
  songId: number
  onSaved?: () => void
}): JSX.Element {
  const [song, setSong] = useState<SongFull | null>(null)
  const [activeSlideIndex, setActiveSlideIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const s = await window.wf.songGet(songId)
    setSong(s)
    setActiveSlideIndex(0)
  }, [songId])

  useEffect(() => { load() }, [load])

  if (!song) {
    return <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading…</div>
  }

  const slides = computeEditorSlides(song)
  const activeSlide = slides[activeSlideIndex] ?? null

  const saveSong = async (updated: SongFull): Promise<void> => {
    if (saving) return
    setSaving(true)
    const input: SongInput = {
      title: updated.title,
      author: updated.author ?? undefined,
      ccli: updated.ccli ?? undefined,
      copyright: updated.copyright ?? undefined,
      publisher: updated.publisher ?? undefined,
      background: updated.background ?? null,
      sections: updated.sections,
      arrangement: updated.arrangement ?? null,
      fontScale: updated.fontScale,
      linesPerSlide: updated.linesPerSlide,
      bgMotion: updated.bgMotion,
      textColor: updated.textColor,
      font: updated.font
    }
    await window.wf.songUpdate(songId, input)
    setSaving(false)
    onSaved?.()
  }

  const handleTextChange = async (sectionOrdinal: number, lineStart: number, lineCount: number, newText: string): Promise<void> => {
    if (!song || !activeSlide) return
    const updatedSections = applySlideEdit(song, { ...activeSlide, sectionOrdinal, lineStart, lineCount }, newText)
    const updated = { ...song, sections: updatedSections }
    setSong(updated)
    await saveSong(updated)
  }

  // --- Inline title rename ---
  const startTitleEdit = (): void => {
    setTitleDraft(song.title)
    setEditingTitle(true)
    setTimeout(() => { titleRef.current?.focus(); titleRef.current?.select() }, 0)
  }

  const commitTitle = async (): Promise<void> => {
    setEditingTitle(false)
    const next = titleDraft.trim()
    if (!next || next === song.title) return
    const updated = { ...song, title: next }
    setSong(updated)
    await saveSong(updated)
  }

  // --- Add a new empty slide (section) ---
  const handleAddSlide = async (): Promise<void> => {
    if (!song) return
    const maxOrdinal = song.sections.reduce((m, s) => Math.max(m, s.ordinal), 0)
    const newSection: SongSection = { kind: 'verse', ordinal: maxOrdinal + 1, lyrics: '' }
    const updated = { ...song, sections: [...song.sections, newSection] }
    setSong(updated)
    await saveSong(updated)
    // Select the new slide (last one in the recomputed list).
    const newSlides = computeEditorSlides(updated)
    setActiveSlideIndex(Math.max(0, newSlides.length - 1))
  }

  // --- Delete the section that owns the active slide ---
  const handleDeleteSlide = async (): Promise<void> => {
    if (!song || !activeSlide) return
    // Guard: never delete the last remaining section.
    if (song.sections.length <= 1) return
    const updatedSections = song.sections.filter((s) => s.ordinal !== activeSlide.sectionOrdinal)
    const updated = { ...song, sections: updatedSections }
    setSong(updated)
    await saveSong(updated)
    const newSlides = computeEditorSlides(updated)
    setActiveSlideIndex((i) => Math.min(i, Math.max(0, newSlides.length - 1)))
  }

  const handleApplyBackground = async (bgPath: string): Promise<void> => {
    if (!song) return
    // bgPath can be empty string meaning "clear background"
    const path = bgPath || null
    const updated = { ...song, background: path }
    setSong(updated)
    await window.wf.songSetBackground(songId, path)
  }

  const handleBgMotionChange = async (motion: SongFull['bgMotion']): Promise<void> => {
    if (!song) return
    const updated = { ...song, bgMotion: motion }
    setSong(updated)
    await window.wf.songSetBgMotion(songId, motion)
  }

  const handleFontScaleChange = async (scale: number): Promise<void> => {
    if (!song) return
    const updated = { ...song, fontScale: scale }
    setSong(updated)
    await window.wf.songSetFontScale(songId, scale)
  }

  const handleTextColorChange = async (color: string): Promise<void> => {
    if (!song) return
    setSong({ ...song, textColor: color })
    await window.wf.songSetTextColor(songId, color)
  }

  const handleFontChange = async (font: SongFull['font']): Promise<void> => {
    if (!song) return
    setSong({ ...song, font })
    await window.wf.songSetFont(songId, font)
  }

  const colorSwatches: { hex: string; label: string }[] = [
    { hex: '#ffffff', label: 'White' },
    { hex: '#111111', label: 'Black' },
    { hex: '#f5d76e', label: 'Gold' },
    { hex: '#fff5e6', label: 'Cream' }
  ]
  const activeColor = song.textColor ?? '#ffffff'

  const canDelete = song.sections.length > 1 && !!activeSlide

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Header bar */}
      <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-[#18181c] px-4 py-2.5">
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <input
              ref={titleRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle()
                if (e.key === 'Escape') setEditingTitle(false)
              }}
              className="w-full rounded-md border border-indigo-400/50 bg-[#0f0f12] px-2 py-1 text-base font-semibold text-white outline-none ring-2 ring-indigo-500/30"
            />
          ) : (
            <button
              onClick={startTitleEdit}
              title="Click to rename"
              className="group flex max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-white/5"
            >
              <span className="truncate text-base font-semibold text-white">{song.title}</span>
              <span className="text-xs text-slate-500 opacity-0 transition-opacity group-hover:opacity-100">✎</span>
            </button>
          )}
          {song.author && <p className="truncate px-1 text-xs text-slate-500">{song.author}</p>}
        </div>

        {saving && <span className="animate-pulse text-xs text-slate-500">Saving…</span>}

        <button
          onClick={handleDeleteSlide}
          disabled={!canDelete}
          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300 disabled:cursor-not-allowed disabled:text-slate-600 disabled:hover:bg-transparent"
          title={canDelete ? 'Delete current slide' : 'Cannot delete the last slide'}
        >
          🗑 Delete slide
        </button>
        <button
          onClick={() => window.wf.editorOpen(songId)}
          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-400 transition-colors hover:bg-blue-500/10 hover:text-blue-300"
          title="Open editor in its own window"
        >
          ⧉ Pop out
        </button>
        {onSaved && (
          <button
            onClick={() => onSaved()}
            className="rounded-lg px-2.5 py-1.5 text-xs text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200"
          >
            ← Back
          </button>
        )}
      </div>

      {/* Editor body: strip + canvas + background panel */}
      <div className="flex min-h-0 flex-1 gap-3">
        {/* Left: slide strip */}
        <SlideStrip
          song={song}
          slides={slides}
          activeIndex={activeSlideIndex}
          onSelect={setActiveSlideIndex}
          onAddSlide={handleAddSlide}
        />

        {/* Center: big centered WYSIWYG canvas */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Text toolbar: font + color */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/[0.07] bg-[#161618] px-3 py-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">Font</span>
              <select
                value={song.font ?? 'modern'}
                onChange={(e) => handleFontChange(e.target.value as SongFull['font'])}
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-white"
              >
                <option value="modern">Modern</option>
                <option value="classic">Classic</option>
                <option value="bold">Bold</option>
                <option value="elegant">Elegant</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">Text</span>
              <input
                type="color"
                value={activeColor}
                onChange={(e) => handleTextColorChange(e.target.value)}
                className="h-7 w-9 cursor-pointer rounded bg-transparent"
              />
              {colorSwatches.map((sw) => (
                <button
                  key={sw.hex}
                  type="button"
                  title={sw.label}
                  onClick={() => handleTextColorChange(sw.hex)}
                  className={`h-5 w-5 rounded-full border border-white/20 transition ${
                    activeColor.toLowerCase() === sw.hex.toLowerCase() ? 'ring-2 ring-indigo-400 ring-offset-1 ring-offset-[#161618]' : ''
                  }`}
                  style={{ background: sw.hex }}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-1 min-h-0 items-center justify-center overflow-hidden p-4">
            <SlideCanvas
              song={song}
              slide={activeSlide}
              onTextChange={handleTextChange}
              onFontScaleChange={handleFontScaleChange}
            />
          </div>
          <p className="text-center text-[10px] text-slate-600">
            Click lyrics to edit • {slides.length} slide{slides.length !== 1 ? 's' : ''} total
          </p>
        </div>

        {/* Right: background panel */}
        <BackgroundPanel
          song={song}
          onApply={handleApplyBackground}
          onBgMotionChange={handleBgMotionChange}
        />
      </div>
    </div>
  )
}
