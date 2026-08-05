// The one shared implementation of "how does a continuous block of typed
// lyrics turn into sections and slides" — used by both renderer editors
// (Song Library, Service-builder Card) AND the main-process live/send path
// (src/main/index.ts's songLines()). Previously these were two independently
// maintained, hand-synchronized copies of the same rule (one comment
// literally said "mirrors the editor's computeEditorSlides"); this module
// replaces both.
//
// The rule: a line matching a recognized section label ("Chorus", "Verse 2")
// starts a new SECTION, consuming that line as the label. A blank line
// starts a new SLIDE within the current section — it is NOT a section
// boundary by itself. Everything else is lyric content appended to whichever
// slide is currently being built. See the 2026-08-05 design spec.
import type { SectionKind, SongSection } from './types'

const KNOWN_KINDS: SectionKind[] = ['verse', 'chorus', 'bridge', 'tag', 'intro', 'ending']

function matchLabel(line: string): SectionKind | null {
  const trimmed = line.trim()
  if (trimmed.length > 14) return null
  const word = trimmed.toLowerCase().replace(/\s*\d+\s*$/, '')
  return KNOWN_KINDS.find((k) => word === k) ?? null
}

function trimBlankEdges(lines: string[]): string[] {
  let start = 0
  let end = lines.length
  while (start < end && lines[start].trim() === '') start++
  while (end > start && lines[end - 1].trim() === '') end--
  return lines.slice(start, end)
}

// Computes a display label for every section in an already-ordered list,
// used by both sectionsToReflowText and computeReflowSlides. A section with
// an explicit label always uses it verbatim. A section with none gets a
// synthesized label ("Verse", or "Verse 2" when there's more than one of
// that kind) — but the synthesized number must never collide with a label
// (explicit OR already-synthesized earlier in this same pass) that's already
// in use, since a label is the only thing that marks a section boundary on
// the next parse: two sections sharing one would be ambiguous.
function computeSectionLabels(ordered: SongSection[]): string[] {
  const used = new Set(ordered.filter((s) => s.label).map((s) => s.label as string))
  // kindTotals counts ALL sections of a kind (explicit-labeled + unlabeled) —
  // this is what decides whether an unlabeled section's default needs a
  // number at all ("Verse" alone vs "Verse 1"/"Verse 2"), matching the
  // pre-existing rule. kindSeen counts only the unlabeled ones actually
  // synthesized so far, to number them in order.
  const kindTotals: Record<string, number> = {}
  for (const sec of ordered) kindTotals[sec.kind] = (kindTotals[sec.kind] ?? 0) + 1
  const kindSeen: Record<string, number> = {}
  return ordered.map((sec) => {
    if (sec.label) return sec.label
    const kind = sec.kind.charAt(0).toUpperCase() + sec.kind.slice(1)
    let n = (kindSeen[sec.kind] = (kindSeen[sec.kind] ?? 0) + 1)
    let candidate = kindTotals[sec.kind] > 1 ? `${kind} ${n}` : kind
    // Skip past any number an explicit label (or an earlier synthesized
    // label in this same pass) already claims.
    while (used.has(candidate)) {
      n = (kindSeen[sec.kind] = kindSeen[sec.kind] + 1)
      candidate = `${kind} ${n}`
    }
    used.add(candidate)
    return candidate
  })
}

// Parses a whole song's lyrics, typed/edited as one continuous document.
export function parseReflowText(text: string): SongSection[] {
  const lines = text.split('\n')
  const sections: SongSection[] = []
  let currentKind: SectionKind = 'verse'
  let currentLabel: string | null = null
  let currentLines: string[] = []
  let started = false

  const flush = (): void => {
    const trimmed = trimBlankEdges(currentLines)
    // Push if this section has an explicit label (even with no lyrics under
    // it yet — a placeholder like a bare "Chorus" is still a real section
    // the operator typed) OR it has actual content (the unlabeled leading
    // block case).
    if (currentLabel !== null || trimmed.length > 0) {
      sections.push({ kind: currentKind, label: currentLabel, ordinal: sections.length, lyrics: trimmed.join('\n') })
    }
  }

  for (const line of lines) {
    const matched = matchLabel(line)
    if (matched) {
      if (started) flush()
      currentKind = matched
      currentLabel = line.trim()
      currentLines = []
      started = true
    } else {
      currentLines.push(line)
      started = true
    }
  }
  if (started) flush()
  return sections
}

// Serializes sections back into one continuous document — the inverse of
// parseReflowText. Every section gets an explicit label line, computing one
// (e.g. "Verse 2") when a section has none, because a label line is the ONLY
// thing that marks a section boundary in this model — an unlabeled section
// serialized without one would silently merge into whatever precedes it on
// the next parse.
export function sectionsToReflowText(sections: SongSection[]): string {
  const ordered = [...sections].sort((a, b) => a.ordinal - b.ordinal)
  const labels = computeSectionLabels(ordered)
  return ordered.map((sec, i) => `${labels[i]}\n${sec.lyrics}`).join('\n\n')
}

// Splits ONE section's lyrics into slide texts, on blank-line boundaries.
// Consecutive blank lines collapse into a single break; leading/trailing
// blank lines are ignored.
export function reflowSlidesForSection(lyrics: string): string[] {
  const lines = lyrics.split('\n')
  const slides: string[] = []
  let current: string[] = []
  for (const line of lines) {
    if (line.trim() === '') {
      if (current.length > 0) {
        slides.push(current.join('\n'))
        current = []
      }
      // A blank line with nothing accumulated yet (leading, or a second
      // consecutive blank) is just ignored — this is what collapses runs of
      // blank lines into a single break.
    } else {
      current.push(line)
    }
  }
  if (current.length > 0) slides.push(current.join('\n'))
  return slides
}

export interface ReflowSlide {
  key: string
  sectionOrdinal: number
  sectionLabel: string
  text: string
}

// Orders sections (honoring arrangement, same convention as everywhere else
// arrangement is applied), computes each section's display label, and
// expands every section into its slides.
export function computeReflowSlides(sections: SongSection[], arrangement: number[] | null): ReflowSlide[] {
  const sorted = [...sections].sort((a, b) => a.ordinal - b.ordinal)
  const ordered = arrangement && arrangement.length > 0
    ? arrangement.map((i) => sorted[i]).filter(Boolean)
    : sorted

  const labels = computeSectionLabels(ordered)

  const result: ReflowSlide[] = []
  let keyIdx = 0
  ordered.forEach((sec, i) => {
    const label = labels[i]
    for (const text of reflowSlidesForSection(sec.lyrics)) {
      result.push({ key: `${sec.ordinal}-${keyIdx++}`, sectionOrdinal: sec.ordinal, sectionLabel: label, text })
    }
  })
  return result
}

// Just the slide text strings, in order — what the live/send path needs.
export function reflowSlideTexts(sections: SongSection[], arrangement: number[] | null): string[] {
  return computeReflowSlides(sections, arrangement).map((s) => s.text)
}

const PASTE_AUTO_BREAK_LINES = 2

// Auto-inserts blank-line slide breaks into a freshly pasted block that has
// none yet, every 2 lines, so a brand-new pasted song gets sensible default
// slides instead of landing as one giant unbroken block the operator has to
// manually split line by line. A block that already has a blank line is left
// untouched — it's either already broken up, or intentionally typed that way.
export function autoBreakPastedText(text: string): string {
  const lines = text.split('\n')
  if (lines.some((l) => l.trim() === '')) return text
  if (lines.length <= PASTE_AUTO_BREAK_LINES) return text
  const groups: string[] = []
  for (let i = 0; i < lines.length; i += PASTE_AUTO_BREAK_LINES) {
    groups.push(lines.slice(i, i + PASTE_AUTO_BREAK_LINES).join('\n'))
  }
  return groups.join('\n\n')
}
