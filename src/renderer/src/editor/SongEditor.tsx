// src/renderer/src/editor/SongEditor.tsx
// Top-level editor: SlideStrip + SlideCanvas + BackgroundPanel
// Replaces the right-side form panel in SongLibrary.

import { useState, useEffect, useCallback, useRef } from 'react'
import { Pencil, Trash2, ExternalLink, ArrowLeft } from 'lucide-react'
import type { SongFull, SongInput, SongSection } from '../../../shared/types'
import { computeEditorSlides, applySlideEdit } from './slideCompute'
import SlideStrip from './SlideStrip'
import SlideCanvas from './SlideCanvas'
import BackgroundPanel from './BackgroundPanel'
import { useAutosave } from '../useAutosave'
import { combineSaveStatus } from '../saveQueue'
import SaveStatusBadge from '../SaveStatusBadge'

export default function SongEditor({ songId, onSaved }: {
  songId: number
  onSaved?: () => void
}): JSX.Element {
  const [song, setSong] = useState<SongFull | null>(null)
  const [activeSlideIndex, setActiveSlideIndex] = useState(0)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const s = await window.wf.songGet(songId)
    setSong(s)
    setActiveSlideIndex(0)
  }, [songId])

  useEffect(() => { load() }, [load])

  // One queue for the main record (title/lyrics/sections/arrangement — the
  // fields edited continuously while typing/reordering slides) plus one per
  // one-off setter, each hitting its own targeted IPC call so a background
  // pick can't accidentally clobber a concurrent lyric edit or vice versa.
  // Previously each of these was `if (saving) return; ...; await ...` with no
  // catch: a save that arrived while another was in flight was silently
  // DROPPED (not queued), and a rejected save left `saving` stuck true
  // forever with the editor showing "Saving…" indefinitely — exactly the
  // audit's complaint.
  const songQueue = useAutosave<SongInput>((input) => window.wf.songUpdate(songId, input).then(() => onSaved?.()))
  const bgQueue = useAutosave<string | null>((path) => window.wf.songSetBackground(songId, path))
  const bgMotionQueue = useAutosave<SongFull['bgMotion']>((motion) => window.wf.songSetBgMotion(songId, motion))
  const blurQueue = useAutosave<boolean>((value) => window.wf.songSetBlurBehindText(songId, value))
  const fontScaleQueue = useAutosave<number>((scale) => window.wf.songSetFontScale(songId, scale))
  const textColorQueue = useAutosave<string>((color) => window.wf.songSetTextColor(songId, color))
  const fontQueue = useAutosave<SongFull['font']>((font) => window.wf.songSetFont(songId, font))

  const saveStatus = combineSaveStatus([
    songQueue.status, bgQueue.status, bgMotionQueue.status,
    blurQueue.status, fontScaleQueue.status, textColorQueue.status, fontQueue.status
  ])
  const saveError = songQueue.error ?? bgQueue.error ?? bgMotionQueue.error ?? blurQueue.error
    ?? fontScaleQueue.error ?? textColorQueue.error ?? fontQueue.error ?? null
  const retrySave = (): void => {
    songQueue.retry(); bgQueue.retry(); bgMotionQueue.retry()
    blurQueue.retry(); fontScaleQueue.retry(); textColorQueue.retry(); fontQueue.retry()
  }

  if (!song) {
    return <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading…</div>
  }

  const slides = computeEditorSlides(song)
  const activeSlide = slides[activeSlideIndex] ?? null

  const saveSong = async (updated: SongFull): Promise<void> => {
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
      font: updated.font,
      blurBehindText: updated.blurBehindText
    }
    songQueue.trigger(input)
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

  const handleApplyBackground = (bgPath: string): void => {
    if (!song) return
    // bgPath can be empty string meaning "clear background"
    const path = bgPath || null
    setSong({ ...song, background: path })
    bgQueue.trigger(path)
  }

  const handleBgMotionChange = (motion: SongFull['bgMotion']): void => {
    if (!song) return
    setSong({ ...song, bgMotion: motion })
    bgMotionQueue.trigger(motion)
  }

  const handleBlurBehindTextChange = (value: boolean): void => {
    if (!song) return
    setSong({ ...song, blurBehindText: value })
    blurQueue.trigger(value)
  }

  const handleFontScaleChange = (scale: number): void => {
    if (!song) return
    setSong({ ...song, fontScale: scale })
    fontScaleQueue.trigger(scale)
  }

  const handleTextColorChange = (color: string): void => {
    if (!song) return
    setSong({ ...song, textColor: color })
    textColorQueue.trigger(color)
  }

  const handleFontChange = (font: SongFull['font']): void => {
    if (!song) return
    setSong({ ...song, font })
    fontQueue.trigger(font)
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
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-[#f4f6f9] px-4 py-2.5">
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
              className="w-full rounded-md border border-blue-400/50 bg-white px-2 py-1 text-base font-semibold text-slate-900 outline-none ring-2 ring-blue-500/30"
            />
          ) : (
            <button
              onClick={startTitleEdit}
              title="Click to rename"
              className="group flex max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-slate-100"
            >
              <span className="truncate text-base font-semibold text-slate-900">{song.title}</span>
              <span className="text-slate-500 opacity-0 transition-opacity group-hover:opacity-100"><Pencil size={12} /></span>
            </button>
          )}
          {song.author && <p className="truncate px-1 text-xs text-slate-500">{song.author}</p>}
        </div>

        <SaveStatusBadge status={saveStatus} error={saveError} onRetry={retrySave} />

        <button
          onClick={handleDeleteSlide}
          disabled={!canDelete}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-500/10 hover:text-red-700 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
          title={canDelete ? 'Delete current slide' : 'Cannot delete the last slide'}
        >
          <Trash2 size={13} /> Delete slide
        </button>
        <button
          onClick={() => window.wf.editorOpen(songId)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-500/10 hover:text-blue-800"
          title="Open editor in its own window"
        >
          <ExternalLink size={13} /> Pop out
        </button>
        {onSaved && (
          <button
            onClick={() => onSaved()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900"
          >
            <ArrowLeft size={13} /> Back
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
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-[#f4f6f9] px-3 py-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-600">Font</span>
              <select
                value={song.font ?? 'modern'}
                onChange={(e) => handleFontChange(e.target.value as SongFull['font'])}
                className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-900"
              >
                <option value="modern">Modern</option>
                <option value="classic">Classic</option>
                <option value="bold">Bold</option>
                <option value="elegant">Elegant</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-600">Text</span>
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
                  className={`h-5 w-5 rounded-full border border-slate-200 transition ${
                    activeColor.toLowerCase() === sw.hex.toLowerCase() ? 'ring-2 ring-blue-400 ring-offset-1 ring-offset-[#f4f6f9]' : ''
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
          <p className="text-center text-[10px] text-slate-400">
            Click lyrics to edit • {slides.length} slide{slides.length !== 1 ? 's' : ''} total
          </p>
        </div>

        {/* Right: background panel */}
        <BackgroundPanel
          song={song}
          onApply={handleApplyBackground}
          onBgMotionChange={handleBgMotionChange}
          onBlurBehindTextChange={handleBlurBehindTextChange}
        />
      </div>
    </div>
  )
}
