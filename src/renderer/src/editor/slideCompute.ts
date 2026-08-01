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

// Deletes ONE slide — the specific chunk of lines the operator is looking at —
// not the whole section that owns it.
//
// This used to be `sections.filter(s => s.ordinal !== slide.sectionOrdinal)`,
// which removed the entire section. Since computeEditorSlides splits a section
// into a slide per `linesPerSlide` lines, deleting one slide of a three-slide
// verse silently took all three, and the surviving index then showed unrelated
// content — so it looked like the wrong slide had been deleted.
//
// Emptying the last line of a section removes the section itself, which shifts
// every later index in `arrangement` (it holds positions into the
// ordinal-sorted section list, not ordinals), so the arrangement is remapped
// here rather than left pointing at the wrong sections.
export function deleteSlideFromSong(
  song: SongFull,
  slide: EditorSlide
): { sections: SongSection[]; arrangement: number[] | null } {
  const target = song.sections.find((s) => s.ordinal === slide.sectionOrdinal)
  if (!target) return { sections: song.sections, arrangement: song.arrangement ?? null }

  const lines = target.lyrics.split('\n')
  lines.splice(slide.lineStart, slide.lineCount)
  const sectionSurvives = lines.some((l) => l.trim() !== '')

  // Never leave a song with nothing in it — the caller disables the control at
  // one slide remaining, but don't rely on the UI for a data-shape guarantee.
  if (!sectionSurvives && song.sections.length <= 1) {
    return { sections: song.sections, arrangement: song.arrangement ?? null }
  }

  if (sectionSurvives) {
    return {
      sections: song.sections.map((s) =>
        s.ordinal === slide.sectionOrdinal ? { ...s, lyrics: lines.join('\n') } : s
      ),
      arrangement: song.arrangement ?? null
    }
  }

  const removedIndex = [...song.sections]
    .sort((a, b) => a.ordinal - b.ordinal)
    .findIndex((s) => s.ordinal === slide.sectionOrdinal)

  return {
    sections: song.sections.filter((s) => s.ordinal !== slide.sectionOrdinal),
    arrangement:
      song.arrangement && song.arrangement.length > 0
        ? song.arrangement
            .filter((i) => i !== removedIndex)
            .map((i) => (i > removedIndex ? i - 1 : i))
        : (song.arrangement ?? null)
  }
}
