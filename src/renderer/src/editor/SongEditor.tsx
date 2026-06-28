// src/renderer/src/editor/SongEditor.tsx
// Top-level editor: SlideStrip + SlideCanvas + BackgroundPanel
// Replaces the right-side form panel in SongLibrary.

import { useState, useEffect, useCallback } from 'react'
import type { SongFull, SongInput } from '../../../shared/types'
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
      bgMotion: updated.bgMotion
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Compact metadata bar */}
      <div className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-[#1a1a1d] px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{song.title}</p>
          {song.author && <p className="truncate text-xs text-slate-500">{song.author}</p>}
        </div>
        {saving && <span className="text-xs text-slate-500 animate-pulse">Saving…</span>}
        <button
          onClick={() => onSaved?.()}
          className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-white/10 hover:text-slate-300"
        >
          ← Back
        </button>
      </div>

      {/* Editor body: strip + canvas + background panel */}
      <div className="flex min-h-0 flex-1 gap-3">
        {/* Left: slide strip */}
        <SlideStrip
          song={song}
          slides={slides}
          activeIndex={activeSlideIndex}
          onSelect={setActiveSlideIndex}
        />

        {/* Center: WYSIWYG canvas */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <SlideCanvas
            song={song}
            slide={activeSlide}
            onTextChange={handleTextChange}
          />
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
