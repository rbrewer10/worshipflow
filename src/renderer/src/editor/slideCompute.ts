// src/renderer/src/editor/slideCompute.ts
// Derives the list of slides the editor displays from a SongFull.
// Mirrors the main-process slide logic so the editor preview matches the projector.

import type { SongFull, SongSection } from '../../../shared/types'

export interface EditorSlide {
  key: string             // stable React key
  sectionOrdinal: number  // which section this slide belongs to
  sectionLabel: string    // "Verse 1", "Chorus", etc.
  text: string            // the lines shown on this slide
  lineStart: number       // 0-based line index within the section (for splicing edits back)
  lineCount: number       // how many lines this slide contains
}

export function computeEditorSlides(song: SongFull): EditorSlide[] {
  const linesPerSlide = song.linesPerSlide ?? 2
  const sections = [...song.sections].sort((a, b) => a.ordinal - b.ordinal)

  // Apply arrangement if present.
  const ordered: SongSection[] = song.arrangement && song.arrangement.length > 0
    ? song.arrangement.map((i) => sections[i]).filter(Boolean)
    : sections

  // Number sections sequentially per kind (Verse 1, Verse 2, Chorus, …), only
  // appending a number when there is more than one section of that kind.
  const kindTotals: Record<string, number> = {}
  for (const sec of ordered) kindTotals[sec.kind] = (kindTotals[sec.kind] ?? 0) + 1
  const kindSeen: Record<string, number> = {}
  const labelFor = (sec: SongSection): string => {
    if (sec.label) return sec.label
    const kind = sec.kind.charAt(0).toUpperCase() + sec.kind.slice(1)
    const n = (kindSeen[sec.kind] = (kindSeen[sec.kind] ?? 0) + 1)
    return kindTotals[sec.kind] > 1 ? `${kind} ${n}` : kind
  }

  const slides: EditorSlide[] = []
  let keyIdx = 0

  for (const sec of ordered) {
    const label = labelFor(sec)
    const lines = sec.lyrics.split('\n')
    for (let start = 0; start < lines.length; start += linesPerSlide) {
      const chunk = lines.slice(start, start + linesPerSlide)
      slides.push({
        key: `${sec.ordinal}-${start}-${keyIdx++}`,
        sectionOrdinal: sec.ordinal,
        sectionLabel: label,
        text: chunk.join('\n'),
        lineStart: start,
        lineCount: chunk.length
      })
    }
  }
  return slides
}

// Applies an edited slide text back into its section, returning updated sections array.
export function applySlideEdit(
  song: SongFull,
  slide: EditorSlide,
  newText: string
): SongSection[] {
  return song.sections.map((sec) => {
    if (sec.ordinal !== slide.sectionOrdinal) return sec
    const lines = sec.lyrics.split('\n')
    const edited = newText.split('\n')
    lines.splice(slide.lineStart, slide.lineCount, ...edited)
    return { ...sec, lyrics: lines.join('\n') }
  })
}
