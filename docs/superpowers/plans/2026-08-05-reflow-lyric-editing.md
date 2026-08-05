# Reflow-style continuous lyric editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify WorshipFlow's two separate song lyric editors into one Reflow-style continuous-text editor with a live WYSIWYG slide preview, replacing mechanical every-N-lines slide splitting with explicit blank-line breaks, and consolidating the two independently-mirrored slide-splitting implementations into one shared, tested module.

**Architecture:** A new pure module (`src/shared/reflowText.ts`) parses a whole song's lyrics — typed as one continuous document — into sections and slides using one rule (label line = new section, blank line = new slide), and serializes back the other way. Both the live/send path (`src/main/index.ts`) and the renderer's two editors consume this same module, eliminating the "mirrors the editor's logic" duplication that exists today. A one-time, self-idempotent migration converts every existing song's mechanically-split lyrics into the new explicit-break format with zero visual change. A new `ReflowEditor` component (continuous textarea + live WYSIWYG slide thumbnails) replaces both editors' current lyric-editing surfaces.

**Tech Stack:** Electron 33, TypeScript, React 18, sql.js, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-05-reflow-lyric-editing-design.md`

---

## Before you start

Mandatory gate before every commit:

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

As of this plan, that gate passes with **354 tests, 0 lint errors**. Do not commit if any of the four fails.

Repo conventions already established this session, still in force:

1. **Never `git add -A` or `git add .`.** Stage only the exact files each task names.
2. **This sandbox cannot launch Electron.** Task 9 is marked **[manual]**.
3. **Push after each commit** — the user has asked for auto-push on this batch of work; `git push` is part of every task's final step.
4. **DB one-time migrations in this codebase are unconditional and self-idempotent**, not gated by a settings flag — see `normalizeSectionLyrics()`/`normalizeTitles()` in `src/main/db.ts`, both called unconditionally on every `initDb()` and both only rewrite a row when the computed result actually differs from what's stored. Task 4 follows this exact pattern rather than introducing a new settings-flag mechanism.

### A critical interaction-design point baked into this plan

The textarea in `ReflowEditor` must show **exactly what the operator typed, verbatim, with no reformatting on every keystroke.** It would be tempting to make the textarea's value `sectionsToReflowText(parseReflowText(rawText))` — i.e., always show the "canonicalized" round-tripped text — but that round-trip is **not** the identity function for a document that doesn't have a label yet: an unlabeled section gets a synthesized label (`"Verse"`, `"Chorus 2"`, etc.) on serialize, by design (see the design spec's §2/§4). If the textarea's value were re-derived through that round-trip on every keystroke, a synthesized `"Verse\n"` would silently prepend itself to whatever the operator is typing from their very first keystroke, constantly fighting their cursor.

The fix, used throughout every task below: the **raw lyrics text is its own independent piece of state**, updated directly and only directly (`setLyricsText(text)`, never `setLyricsText(sectionsToReflowText(parseReflowText(text)))`). Parsing into sections happens only for (a) the live, read-only slide-preview pane (safe to recompute freely — there's no cursor sitting in it) and (b) at actual save time. This exactly matches the pattern the Card editor already uses today (`CardEditPanel.tsx`'s `lyrics` state, parsed only inside `buildSongInput()`), so Task 8 is bringing the Library editor's lyrics-state pattern in line with what the Card editor already does, not inventing a new one.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/shared/reflowText.ts` | Parse/serialize a continuous document ↔ sections, compute slides, auto-break pasted text. The one shared module both the live path and both editors consume. |
| `src/shared/reflowText.test.ts` | Tests for the above. |
| `src/renderer/src/ReflowEditor.tsx` | Continuous textarea + live WYSIWYG slide-preview pane, paste-auto-break. Used by both editors. |

**Modified:**

| File | Change |
|---|---|
| `src/shared/lyrics.ts` | `splitLyricLines` preserves blank lines instead of dropping them. |
| `src/shared/lyrics.test.ts` | Update the one test that asserted the old (now-wrong) blank-line-dropping behavior. |
| `src/main/index.ts` | `songLines()` uses `reflowSlideTexts()` from the shared module; `groupLines()` deleted. |
| `src/main/db.ts` | New one-time migration `migrateReflowBreaks()`, called from `initDb()`. |
| `src/renderer/src/CardEditPanel.tsx` | `parseSections`/`sectionsToText` imports replaced with `parseReflowText` from the shared module. |
| `src/renderer/src/editors/SongEditor.tsx` → **renamed** `src/renderer/src/editors/CardSongEditor.tsx` | Plain `<textarea>` replaced with `<ReflowEditor>`. |
| `src/renderer/src/ItemEditor.tsx` | Import path updated for the rename. |
| `src/renderer/src/editor/SongEditor.tsx` | `SlideStrip`/`SlideCanvas`/`slideCompute` replaced with `ReflowEditor` + a `lyricsText` state; slide-level add/delete UI removed (superseded — add/delete a slide is now just editing the text). |

**Deleted:**

| File | Why |
|---|---|
| `src/renderer/src/songText.ts` | Superseded by `src/shared/reflowText.ts` — its section-boundary rule (blank line = section) is being replaced, not extended, so this file can't just delegate to the new one. |
| `src/renderer/src/songText.test.ts` | Tests the deleted file's old (now-superseded) behavior; equivalent + new cases live in `reflowText.test.ts`. |
| `src/renderer/src/editor/slideCompute.ts` | Superseded by `computeReflowSlides` in the shared module; `applySlideEdit`/`deleteSlideFromSong` have no equivalent in the new model (editing is just editing the text). |
| `src/renderer/src/editor/slideCompute.test.ts` | Tests the deleted file. |
| `src/renderer/src/editor/SlideStrip.tsx` | Superseded by `ReflowEditor`'s own thumbnail rendering (adapted from this file). |
| `src/renderer/src/editor/SlideCanvas.tsx` | Superseded by `ReflowEditor`'s continuous textarea. |

**Not touched:** `src/renderer/src/autoLabel.ts` (auto-label operates on the plain lyrics string before Reflow editing starts, unaffected), `src/renderer/src/chordUtils.ts`/`ChordDisplay.tsx` (also operate on the plain lyrics string), `BackgroundPanel.tsx`/`ItemBackgroundPanel.tsx` (sibling UI, untouched), `src/main/pptx.ts`/`PptxImport.tsx` (constructs sections directly, doesn't go through the text parser), `src/shared/themes.ts` (only read from, not modified).

---

## Task 1: Fix splitLyricLines to preserve blank lines

**Files:**
- Modify: `src/shared/lyrics.ts`
- Modify: `src/shared/lyrics.test.ts`

Every song save runs section lyrics through `splitLyricLines` (see `createSong`/`updateSong` in `src/main/db.ts`, and the one-time `normalizeSectionLyrics()` pass). Today it silently drops every blank line — harmless when blank lines meant nothing, but it would silently eat every slide break the operator just typed once blank lines become meaningful. This has to be fixed before anything else in this plan, or later tasks would appear to work in the editor and then lose all their breaks the moment they're saved.

- [ ] **Step 1: Update the test that currently asserts the wrong behavior**

Find in `src/shared/lyrics.test.ts`:

```ts
  it('drops blank lines and trims whitespace', () => {
    expect(splitLyricLines('  hello  \n\n  world  ')).toBe('hello\nworld')
  })
```

Replace with:

```ts
  it('preserves blank lines — they mark slide breaks in the Reflow model', () => {
    expect(splitLyricLines('  hello  \n\n  world  ')).toBe('hello\n\nworld')
  })

  it('preserves multiple consecutive blank lines as-is (collapsing is the parser\'s job, not this function\'s)', () => {
    expect(splitLyricLines('hello\n\n\n\nworld')).toBe('hello\n\n\n\nworld')
  })
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx vitest run src/shared/lyrics.test.ts
```

Expected: the first new test fails — actual value is `'hello\nworld'`, not `'hello\n\nworld'`.

- [ ] **Step 3: Fix the implementation**

Find in `src/shared/lyrics.ts`:

```ts
export function splitLyricLines(lyrics: string): string {
  return lyrics
    .split('\n')
    .flatMap((line) => splitLine(line.trim()))
    .filter((l) => l.length > 0)
    .join('\n')
}
```

Replace with:

```ts
export function splitLyricLines(lyrics: string): string {
  return lyrics
    .split('\n')
    .flatMap((line) => {
      const trimmed = line.trim()
      // A blank line is a meaningful slide break in the Reflow model — keep it
      // exactly as one blank line rather than running it through splitLine
      // (which would otherwise collapse it away, same as it always has).
      return trimmed === '' ? [''] : splitLine(trimmed)
    })
    .join('\n')
}
```

- [ ] **Step 4: Run it and confirm it passes**

```bash
npx vitest run src/shared/lyrics.test.ts
```

Expected: `Tests 6 passed (6)`.

- [ ] **Step 5: Run the full gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass. Test count grows from 354 by 1 (one test replaced, one added — net +1), so 355.

- [ ] **Step 6: Commit and push**

```bash
git add src/shared/lyrics.ts src/shared/lyrics.test.ts
git commit -m "fix: preserve blank lines in splitLyricLines for Reflow slide breaks"
git push
```

---

## Task 2: reflowText.ts — the shared parsing module

**Files:**
- Create: `src/shared/reflowText.ts`
- Test: `src/shared/reflowText.test.ts`

This is the centerpiece of the whole feature: one parser/serializer/slide-computer, replacing `src/renderer/src/songText.ts` (`parseSections`/`sectionsToText`) and `src/renderer/src/editor/slideCompute.ts` (`computeEditorSlides`) and the per-section grouping inside `src/main/index.ts`'s `songLines()`.

- [ ] **Step 1: Write the failing tests**

Create `src/shared/reflowText.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  parseReflowText, sectionsToReflowText, reflowSlidesForSection,
  computeReflowSlides, reflowSlideTexts, autoBreakPastedText
} from './reflowText'
import type { SongSection } from './types'

describe('parseReflowText', () => {
  it('recognizes a known-kind label line and starts a new section', () => {
    const sections = parseReflowText('Chorus\nHoly holy holy\nLord God almighty')
    expect(sections).toHaveLength(1)
    expect(sections[0].kind).toBe('chorus')
    expect(sections[0].label).toBe('Chorus')
    expect(sections[0].lyrics).toBe('Holy holy holy\nLord God almighty')
  })

  it('recognizes a known-kind label with a trailing number (e.g. "Verse 1")', () => {
    const sections = parseReflowText('Verse 1\nFirst line\nSecond line')
    expect(sections[0].kind).toBe('verse')
    expect(sections[0].label).toBe('Verse 1')
    expect(sections[0].lyrics).toBe('First line\nSecond line')
  })

  it('treats an unrecognized leading block as plain lyrics (kind=verse, label=null)', () => {
    const sections = parseReflowText('Just a line of lyrics\nAnother line')
    expect(sections[0].kind).toBe('verse')
    expect(sections[0].label).toBeNull()
    expect(sections[0].lyrics).toBe('Just a line of lyrics\nAnother line')
  })

  it('does not treat an overly long line as a label, even when the word (minus trailing number) matches exactly', () => {
    const sections = parseReflowText('chorus            99\nSome lyrics here')
    expect(sections[0].kind).toBe('verse')
    expect(sections[0].label).toBeNull()
    expect(sections[0].lyrics).toBe('chorus            99\nSome lyrics here')
  })

  it('a blank line does NOT start a new section — it stays inside the current section as a slide break', () => {
    const sections = parseReflowText('Verse 1\nFirst line\n\nSecond slide, same verse')
    expect(sections).toHaveLength(1)
    expect(sections[0].lyrics).toBe('First line\n\nSecond slide, same verse')
  })

  it('only a label line starts a new section, even after several blank lines', () => {
    const sections = parseReflowText('First line\n\n\n\nChorus\nHoly holy holy')
    expect(sections).toHaveLength(2)
    expect(sections[0].label).toBeNull()
    expect(sections[0].lyrics).toBe('First line')
    expect(sections[1].label).toBe('Chorus')
    expect(sections[1].lyrics).toBe('Holy holy holy')
  })

  it('assigns sequential ordinals starting at 0', () => {
    const sections = parseReflowText('Verse 1\none\n\nChorus\ntwo\n\nBridge\nthree')
    expect(sections.map((s) => s.ordinal)).toEqual([0, 1, 2])
  })

  it('trims leading and trailing blank lines from a section, but keeps internal ones', () => {
    const sections = parseReflowText('Verse\n\n\nFirst line\n\nSecond slide\n\n\n')
    expect(sections[0].lyrics).toBe('First line\n\nSecond slide')
  })

  it('returns an empty array for empty input', () => {
    expect(parseReflowText('')).toEqual([])
  })

  it('returns an empty array for whitespace-only input', () => {
    expect(parseReflowText('   \n\n   \n')).toEqual([])
  })

  it('creates an empty-lyrics section for a label with nothing after it before the next label', () => {
    const sections = parseReflowText('Chorus\n\nVerse 1\nSomething')
    expect(sections).toHaveLength(2)
    expect(sections[0].label).toBe('Chorus')
    expect(sections[0].lyrics).toBe('')
    expect(sections[1].label).toBe('Verse 1')
  })
})

describe('sectionsToReflowText', () => {
  it('always emits an explicit label line, computing a default when label is null', () => {
    const sections: SongSection[] = [
      { kind: 'verse', label: null, ordinal: 0, lyrics: 'Plain verse text' }
    ]
    expect(sectionsToReflowText(sections)).toBe('Verse\nPlain verse text')
  })

  it('numbers a computed label only when there is more than one section of that kind', () => {
    const sections: SongSection[] = [
      { kind: 'verse', label: null, ordinal: 0, lyrics: 'first' },
      { kind: 'verse', label: null, ordinal: 1, lyrics: 'second' }
    ]
    expect(sectionsToReflowText(sections)).toBe('Verse 1\nfirst\n\nVerse 2\nsecond')
  })

  it('uses the explicit label when one is set, ignoring the computed default', () => {
    const sections: SongSection[] = [
      { kind: 'chorus', label: 'Chorus', ordinal: 0, lyrics: 'Holy holy holy' }
    ]
    expect(sectionsToReflowText(sections)).toBe('Chorus\nHoly holy holy')
  })

  it('sorts sections by ordinal before joining, regardless of input order', () => {
    const sections: SongSection[] = [
      { kind: 'verse', label: 'Verse 2', ordinal: 1, lyrics: 'second' },
      { kind: 'verse', label: 'Verse 1', ordinal: 0, lyrics: 'first' }
    ]
    expect(sectionsToReflowText(sections)).toBe('Verse 1\nfirst\n\nVerse 2\nsecond')
  })

  it('returns empty string for no sections', () => {
    expect(sectionsToReflowText([])).toBe('')
  })
})

describe('round-trip: parseReflowText -> sectionsToReflowText', () => {
  it('reproduces the original text when every section already has an explicit label', () => {
    const original = 'Verse 1\nFirst line\nSecond line\n\nChorus\nHoly holy holy\nLord God almighty'
    const sections = parseReflowText(original)
    expect(sectionsToReflowText(sections)).toBe(original)
  })

  it('is stable under a second parse/serialize pass (idempotent) even for an unlabeled section', () => {
    const original = 'Just some lyrics\nacross two lines'
    const once = sectionsToReflowText(parseReflowText(original))
    const twice = sectionsToReflowText(parseReflowText(once))
    expect(twice).toBe(once)
  })

  it('preserves an internal slide-break blank line across a full round-trip', () => {
    const original = 'Verse\nFirst slide\n\nSecond slide'
    const sections = parseReflowText(original)
    expect(sectionsToReflowText(sections)).toBe(original)
  })
})

describe('reflowSlidesForSection', () => {
  it('returns the whole lyrics as one slide when there are no blank lines', () => {
    expect(reflowSlidesForSection('line one\nline two')).toEqual(['line one\nline two'])
  })

  it('splits into multiple slides on a blank line', () => {
    expect(reflowSlidesForSection('slide one\n\nslide two')).toEqual(['slide one', 'slide two'])
  })

  it('collapses multiple consecutive blank lines into a single break', () => {
    expect(reflowSlidesForSection('slide one\n\n\n\nslide two')).toEqual(['slide one', 'slide two'])
  })

  it('ignores leading and trailing blank lines', () => {
    expect(reflowSlidesForSection('\n\nslide one\n\nslide two\n\n')).toEqual(['slide one', 'slide two'])
  })

  it('returns an empty array for empty lyrics', () => {
    expect(reflowSlidesForSection('')).toEqual([])
  })
})

describe('computeReflowSlides', () => {
  it('produces one slide per section when there are no internal blank lines', () => {
    const sections: SongSection[] = [
      { kind: 'verse', label: 'Verse 1', ordinal: 0, lyrics: 'a\nb' },
      { kind: 'chorus', label: 'Chorus', ordinal: 1, lyrics: 'c\nd' }
    ]
    const slides = computeReflowSlides(sections, null)
    expect(slides.map((s) => s.text)).toEqual(['a\nb', 'c\nd'])
    expect(slides.map((s) => s.sectionLabel)).toEqual(['Verse 1', 'Chorus'])
  })

  it('produces multiple slides for a section with internal blank lines', () => {
    const sections: SongSection[] = [
      { kind: 'verse', label: 'Verse 1', ordinal: 0, lyrics: 'a\nb\n\nc\nd' }
    ]
    const slides = computeReflowSlides(sections, null)
    expect(slides.map((s) => s.text)).toEqual(['a\nb', 'c\nd'])
    expect(slides.every((s) => s.sectionLabel === 'Verse 1')).toBe(true)
  })

  it('applies arrangement to reorder sections before computing slides', () => {
    const sections: SongSection[] = [
      { kind: 'verse', label: 'Verse 1', ordinal: 0, lyrics: 'first' },
      { kind: 'chorus', label: 'Chorus', ordinal: 1, lyrics: 'second' }
    ]
    const slides = computeReflowSlides(sections, [1, 0])
    expect(slides.map((s) => s.text)).toEqual(['second', 'first'])
  })

  it('computes a default label when a section has none, numbering only when needed', () => {
    const sections: SongSection[] = [
      { kind: 'verse', label: null, ordinal: 0, lyrics: 'a' },
      { kind: 'verse', label: null, ordinal: 1, lyrics: 'b' }
    ]
    const slides = computeReflowSlides(sections, null)
    expect(slides.map((s) => s.sectionLabel)).toEqual(['Verse 1', 'Verse 2'])
  })

  it('returns an empty array for no sections', () => {
    expect(computeReflowSlides([], null)).toEqual([])
  })
})

describe('reflowSlideTexts', () => {
  it('returns just the slide text strings, in order', () => {
    const sections: SongSection[] = [
      { kind: 'verse', label: 'Verse 1', ordinal: 0, lyrics: 'a\n\nb' }
    ]
    expect(reflowSlideTexts(sections, null)).toEqual(['a', 'b'])
  })
})

describe('autoBreakPastedText', () => {
  it('inserts a blank line every 2 non-blank lines when the pasted text has none yet', () => {
    const pasted = 'line one\nline two\nline three\nline four'
    expect(autoBreakPastedText(pasted)).toBe('line one\nline two\n\nline three\nline four')
  })

  it('leaves text with an odd number of lines with a shorter final group', () => {
    const pasted = 'one\ntwo\nthree'
    expect(autoBreakPastedText(pasted)).toBe('one\ntwo\n\nthree')
  })

  it('does not touch text that already contains a blank line', () => {
    const pasted = 'one\ntwo\n\nthree\nfour'
    expect(autoBreakPastedText(pasted)).toBe(pasted)
  })

  it('leaves short pastes (2 lines or fewer) untouched', () => {
    expect(autoBreakPastedText('one\ntwo')).toBe('one\ntwo')
  })

  it('leaves a single-line paste untouched', () => {
    expect(autoBreakPastedText('just one line')).toBe('just one line')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx vitest run src/shared/reflowText.test.ts
```

Expected: fails to collect — `Failed to resolve import "./reflowText"`.

- [ ] **Step 3: Write the module**

Create `src/shared/reflowText.ts`:

```ts
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
  const kindTotals: Record<string, number> = {}
  for (const sec of ordered) kindTotals[sec.kind] = (kindTotals[sec.kind] ?? 0) + 1
  const kindSeen: Record<string, number> = {}
  const labelFor = (sec: SongSection): string => {
    if (sec.label) return sec.label
    const kind = sec.kind.charAt(0).toUpperCase() + sec.kind.slice(1)
    const n = (kindSeen[sec.kind] = (kindSeen[sec.kind] ?? 0) + 1)
    return kindTotals[sec.kind] > 1 ? `${kind} ${n}` : kind
  }
  return ordered.map((sec) => `${labelFor(sec)}\n${sec.lyrics}`).join('\n\n')
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

  const kindTotals: Record<string, number> = {}
  for (const sec of ordered) kindTotals[sec.kind] = (kindTotals[sec.kind] ?? 0) + 1
  const kindSeen: Record<string, number> = {}
  const labelFor = (sec: SongSection): string => {
    if (sec.label) return sec.label
    const kind = sec.kind.charAt(0).toUpperCase() + sec.kind.slice(1)
    const n = (kindSeen[sec.kind] = (kindSeen[sec.kind] ?? 0) + 1)
    return kindTotals[sec.kind] > 1 ? `${kind} ${n}` : kind
  }

  const result: ReflowSlide[] = []
  let keyIdx = 0
  for (const sec of ordered) {
    const label = labelFor(sec)
    for (const text of reflowSlidesForSection(sec.lyrics)) {
      result.push({ key: `${sec.ordinal}-${keyIdx++}`, sectionOrdinal: sec.ordinal, sectionLabel: label, text })
    }
  }
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
```

- [ ] **Step 4: Run it and confirm it passes**

```bash
npx vitest run src/shared/reflowText.test.ts
```

Expected: all tests pass (35 tests).

- [ ] **Step 5: Run the full gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 355 + 35 = 390 tests.

- [ ] **Step 6: Commit and push**

```bash
git add src/shared/reflowText.ts src/shared/reflowText.test.ts
git commit -m "feat: shared reflow parsing module — one section/slide rule for editors and live"
git push
```

---

## Task 3: Wire the live/send path to the shared module

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Import the shared function**

Find the existing import of shared modules near the top of `src/main/index.ts` (look for `import { parseReferenceList, formatReferenceList, subReference } from '../shared/scriptureRefs'` as a nearby anchor) and add, immediately after it:

```ts
import { reflowSlideTexts } from '../shared/reflowText'
```

- [ ] **Step 2: Replace songLines() and delete groupLines()**

Find:

```ts
function groupLines(lines: string[], n: number): string[] {
  if (n <= 1) return lines
  const result: string[] = []
  for (let i = 0; i < lines.length; i += n) {
    result.push(lines.slice(i, i + n).join('\n'))
  }
  return result
}
```

Delete this whole function — it's no longer called by anything after this task.

Find:

```ts
// Order a song's sections (honoring arrangement) and group into slide lines.
// Grouping happens WITHIN each section so a slide never mixes the end of one
// section with the start of the next (e.g. a verse and the chorus). Mirrors the
// editor's computeEditorSlides so the projector matches the editor preview.
function songLines(full: SongFull): string[] {
  const sorted = [...full.sections].sort((a, b) => a.ordinal - b.ordinal)
  const ordered = full.arrangement && full.arrangement.length > 0
    ? full.arrangement.map((i) => sorted[i]).filter(Boolean)
    : sorted
  const perSlide = full.linesPerSlide ?? 2
  const slides: string[] = []
  for (const section of ordered) {
    const lines = section.lyrics.split('\n').map((l) => l.trim()).filter(Boolean)
    for (const slide of groupLines(lines, perSlide)) slides.push(slide)
  }
  return slides
}
```

Replace with:

```ts
// Order a song's sections (honoring arrangement) and split into slide lines,
// using the same shared rule the editors use (src/shared/reflowText.ts) —
// this used to be an independently-maintained mirror of the editor's own
// slide logic; now both read from one place.
function songLines(full: SongFull): string[] {
  return reflowSlideTexts(full.sections, full.arrangement)
}
```

- [ ] **Step 3: Run the full gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 390 tests (no new tests — this is a small, surgical swap of an already-tested function's internals; `reflowSlideTexts` itself was thoroughly tested in Task 2). Typecheck is the meaningful check here — it will catch if `groupLines` is still referenced anywhere it shouldn't be.

- [ ] **Step 4: Commit and push**

```bash
git add src/main/index.ts
git commit -m "feat: wire the live song-rendering path to the shared reflow slide logic"
git push
```

---

## Task 4: One-time migration for existing songs

**Files:**
- Modify: `src/main/db.ts`

For every song already in the library, insert blank lines at exactly the points the old mechanical "every `linesPerSlide` lines" split would have produced — so nothing changes visually after upgrading. Idempotent by inspection (a section that already contains a blank line is treated as already migrated, or already edited under the new model, and left alone), matching this file's existing convention for `normalizeSectionLyrics()`/`normalizeTitles()` rather than introducing a new settings-flag mechanism.

- [ ] **Step 1: Add the migration function**

Find in `src/main/db.ts`:

```ts
// One-time (idempotent) pass that re-splits over-long single-line verses into
// phrase lines so existing songs display as several readable slides instead of one
// oversized block. Only rows whose text actually changes are rewritten.
function normalizeSectionLyrics(): void {
  const rows: { id: number; lyrics: string }[] = []
  const stmt = db.prepare('SELECT id, lyrics FROM song_section')
  while (stmt.step()) rows.push(stmt.getAsObject() as unknown as { id: number; lyrics: string })
  stmt.free()
  for (const row of rows) {
    const next = splitLyricLines(row.lyrics ?? '')
    if (next !== row.lyrics) {
      db.run('UPDATE song_section SET lyrics = ? WHERE id = ?', [next, row.id])
    }
  }
}
```

Add immediately after it:

```ts
// Old mechanical "every N lines is a slide" split, reproduced here ONLY for
// the one-time migration below — this is deliberately NOT part of the shared
// reflowText.ts module, since it represents retired behavior, not the new
// forward-looking rule. Mirrors exactly what songLines()/computeEditorSlides()
// used to do: trim and drop blank lines, then group every N.
function insertLegacySlideBreaks(lyrics: string, perSlide: number): string {
  if (perSlide <= 1) return lyrics
  const lines = lyrics.split('\n').map((l) => l.trim()).filter(Boolean)
  const groups: string[] = []
  for (let i = 0; i < lines.length; i += perSlide) groups.push(lines.slice(i, i + perSlide).join('\n'))
  return groups.join('\n\n')
}

// One-time (idempotent) pass converting existing songs from the old
// mechanical "every linesPerSlide lines" splitting to explicit blank-line
// slide breaks, so nothing changes visually after upgrading to Reflow-style
// editing. Idempotent by inspection, not a flag: no code path in this
// codebase has ever written a blank line into song_section.lyrics before
// this feature, so a section that already contains one reliably means
// "already migrated" (or edited under the new model since) — either way,
// leave it alone. Must run after normalizeSectionLyrics(): that function can
// re-wrap one long crammed line into several physical lines, and the
// mechanical split this reproduces has always operated on lyrics AFTER that
// normalization (songLines() ran after it too), so migrating before it would
// compute different break points than the old live behavior actually had.
function migrateReflowBreaks(): void {
  const rows: { id: number; lyrics: string; lines_per_slide: number | null }[] = []
  const stmt = db.prepare(
    'SELECT ss.id AS id, ss.lyrics AS lyrics, s.lines_per_slide AS lines_per_slide FROM song_section ss JOIN song s ON s.id = ss.song_id'
  )
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as unknown as { id: number; lyrics: string; lines_per_slide: number | null })
  }
  stmt.free()
  for (const row of rows) {
    const lyrics = row.lyrics ?? ''
    if (lyrics.trim() === '') continue
    const alreadyHasBreak = lyrics.split('\n').some((l) => l.trim() === '')
    if (alreadyHasBreak) continue
    const perSlide = row.lines_per_slide ?? 2
    const next = insertLegacySlideBreaks(lyrics, perSlide)
    if (next !== lyrics) {
      db.run('UPDATE song_section SET lyrics = ? WHERE id = ?', [next, row.id])
    }
  }
}
```

- [ ] **Step 2: Call it from initDb(), right after normalizeSectionLyrics()**

Find:

```ts
  normalizeSectionLyrics()
  normalizeTitles()
  clearSecondTrackAssignments()
  persist()
```

Replace with:

```ts
  normalizeSectionLyrics()
  migrateReflowBreaks()
  normalizeTitles()
  clearSecondTrackAssignments()
  persist()
```

- [ ] **Step 3: Run the full gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 390 tests (no new tests for this task — matches this file's own established precedent that DB migration functions touching the live `db` object aren't unit tested; `insertLegacySlideBreaks`'s logic is a straightforward reproduction of `reflowSlidesForSection`'s already-tested inverse, and `db.test.ts` has never tested functions requiring a live `db` instance).

- [ ] **Step 4: Commit and push**

```bash
git add src/main/db.ts
git commit -m "feat: one-time migration to explicit blank-line slide breaks for existing songs"
git push
```

---

## Task 5: Delete songText.ts, wire CardEditPanel to the shared module

**Files:**
- Delete: `src/renderer/src/songText.ts`
- Delete: `src/renderer/src/songText.test.ts`
- Modify: `src/renderer/src/CardEditPanel.tsx`

- [ ] **Step 1: Delete the superseded files**

```bash
git rm src/renderer/src/songText.ts src/renderer/src/songText.test.ts
```

- [ ] **Step 2: Update CardEditPanel.tsx's import and usage**

Find:

```tsx
import { parseSections, sectionsToText } from './songText'
```

Replace with:

```tsx
import { parseReflowText, sectionsToReflowText } from '../../shared/reflowText'
```

Find:

```tsx
      window.wf.songGet(item.ref_id).then((s) => { setSongFull(s); setLyrics(s ? sectionsToText(s) : '') })
```

Replace with:

```tsx
      window.wf.songGet(item.ref_id).then((s) => { setSongFull(s); setLyrics(s ? sectionsToReflowText(s.sections) : '') })
```

Find:

```tsx
    const sections = parseSections(lyrics)
```

Replace with:

```tsx
    const sections = parseReflowText(lyrics)
```

- [ ] **Step 3: Run the full gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass. Test count drops from 390 to 390 minus `songText.test.ts`'s 17 tests = 373 (those cases' equivalents already live in `reflowText.test.ts` from Task 2, so no coverage is actually lost — the old suite tested the old, now-superseded section-boundary rule). Typecheck will immediately flag it if any other file still imports from the deleted `./songText`.

- [ ] **Step 4: Commit and push**

```bash
git add -u src/renderer/src/songText.ts src/renderer/src/songText.test.ts src/renderer/src/CardEditPanel.tsx
git commit -m "feat: retire songText.ts in favor of the shared reflow module"
git push
```

`git add -u` here stages the deletions plus the modified `CardEditPanel.tsx` in one command — equivalent to naming all three paths explicitly, since the first two no longer exist on disk for a plain `git add` to pick up.

---

## Task 6: ReflowEditor — the shared editing component

**Files:**
- Create: `src/renderer/src/ReflowEditor.tsx`

The continuous textarea + live WYSIWYG slide-preview pane used by both editors from here on. No unit tests for this task — it's UI, matching this codebase's existing posture toward editor components (the pure logic it depends on, `reflowText.ts`, is already thoroughly tested).

- [ ] **Step 1: Write the component**

Create `src/renderer/src/ReflowEditor.tsx`:

```tsx
// src/renderer/src/ReflowEditor.tsx
// Continuous-text lyric editor with a live WYSIWYG slide preview, used by
// both the Song Library editor and the Service-builder Card editor. `value`
// is the raw, literal lyrics text — this component never reformats it on
// its own; only the read-only preview pane is derived from it. See the
// 2026-08-05 design spec and this plan's "critical interaction-design point"
// note for why the textarea must never round-trip through parse+serialize.
import { useRef } from 'react'
import type { ClipboardEvent } from 'react'
import { getTheme, resolveColors, FONT_FAMILY } from '../../shared/themes'
import { parseReflowText, computeReflowSlides, autoBreakPastedText } from '../../shared/reflowText'
import type { ReflowSlide } from '../../shared/reflowText'
import type { SongFull } from '../../shared/types'

function toAssetUrl(p: string): string {
  return 'wf-asset://?path=' + encodeURIComponent(p)
}

export default function ReflowEditor({ song, value, onChange }: {
  song: SongFull
  value: string
  onChange: (text: string) => void
}): JSX.Element {
  const textRef = useRef<HTMLTextAreaElement>(null)

  const sections = parseReflowText(value)
  const slides = computeReflowSlides(sections, song.arrangement ?? null)

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>): void => {
    const pasted = e.clipboardData.getData('text/plain')
    if (!pasted) return
    const transformed = autoBreakPastedText(pasted)
    if (transformed === pasted) return // nothing to add — let the browser paste natively
    e.preventDefault()
    const el = textRef.current
    if (!el) return
    const { selectionStart, selectionEnd } = el
    const next = value.slice(0, selectionStart) + transformed + value.slice(selectionEnd)
    onChange(next)
  }

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      <textarea
        ref={textRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={handlePaste}
        aria-label="Song lyrics"
        placeholder={'Type or paste lyrics — a blank line starts a new slide, a label like "Chorus" starts a new section…'}
        className="min-h-0 flex-1 resize-none rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs leading-relaxed text-slate-900 outline-none focus:border-blue-500"
      />
      <div className="flex w-40 shrink-0 flex-col gap-2.5 overflow-y-auto py-1 pr-1">
        {slides.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">
            No slides yet
          </div>
        ) : (
          slides.map((slide) => <ReflowSlideThumb key={slide.key} song={song} slide={slide} />)
        )}
      </div>
    </div>
  )
}

// Read-only WYSIWYG thumbnail — real background image/video, real font and
// color, same visual quality as the projector. Adapted from the interactive
// version this replaces (editor/SlideStrip.tsx) minus the click-to-select
// and "active" state, since this preview isn't independently editable —
// editing only happens in the continuous textarea above.
function ReflowSlideThumb({ song, slide }: { song: SongFull; slide: ReflowSlide }): JSX.Element {
  const theme = getTheme(null)
  const bg = song.background && !song.background.startsWith('theme:') ? song.background : null
  const bgIsTheme = song.background?.startsWith('theme:')
  const bgThemeId = bgIsTheme ? song.background!.slice(6) : null
  const thumbTheme = getTheme(bgIsTheme ? bgThemeId : null)
  const thumbColors = resolveColors(thumbTheme)
  const bgStyle = bg
    ? `url(${toAssetUrl(bg)}) center/cover`
    : `linear-gradient(135deg, ${thumbColors.primary}, ${thumbColors.secondary})`

  return (
    <div className="w-36 shrink-0">
      <p className="mb-1 truncate px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {slide.sectionLabel}
      </p>
      <div
        className="relative w-full overflow-hidden rounded-lg ring-1 ring-slate-200"
        style={{ aspectRatio: '16/9', background: bgStyle }}
      >
        <div className="absolute inset-0 bg-black/35" />
        <div className="absolute inset-0 flex items-center justify-center px-1.5 text-center">
          <span
            className="line-clamp-2 text-[8px] font-bold leading-tight"
            style={{
              fontFamily: FONT_FAMILY[song.font ?? theme.font],
              color: song.textColor ?? '#fff',
              textShadow: '0 1px 4px rgba(0,0,0,.9)'
            }}
          >
            {slide.text}
          </span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run the full gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 373 tests (no new tests — new UI component, nothing to wire it into yet, so nothing exercises it; that happens in Tasks 7 and 8). Typecheck confirms the component compiles and its imports (`getTheme`/`resolveColors`/`FONT_FAMILY` from `shared/themes`, `ReflowSlide` type from `shared/reflowText`) resolve correctly.

- [ ] **Step 3: Commit and push**

```bash
git add src/renderer/src/ReflowEditor.tsx
git commit -m "feat: ReflowEditor — continuous lyric editor with live WYSIWYG slide preview"
git push
```

---

## Task 7: Wire the Card editor to ReflowEditor

**Files:**
- Rename: `src/renderer/src/editors/SongEditor.tsx` → `src/renderer/src/editors/CardSongEditor.tsx`
- Modify: `src/renderer/src/ItemEditor.tsx`

This resolves the confusing `editor/` vs `editors/` naming collision the design spec flagged (two files both named `SongEditor.tsx` in near-identical directory names) by renaming the smaller, more contained one. Also swaps its plain textarea for `ReflowEditor`.

- [ ] **Step 1: Rename the file**

```bash
git mv src/renderer/src/editors/SongEditor.tsx src/renderer/src/editors/CardSongEditor.tsx
```

- [ ] **Step 2: Rename the exported component and swap the textarea for ReflowEditor**

Find in `src/renderer/src/editors/CardSongEditor.tsx`:

```tsx
import { ChordDisplay } from '../ChordDisplay'
import { transposeLyrics } from '../chordUtils'
import { analyzeAndLabelSections, previewAutoLabels } from '../autoLabel'
import type { SongFull } from '../../../shared/types'
import { memo } from 'react'
import { Guitar, Tag, Film, Image as ImageIcon, X, Check, Minus, Plus } from 'lucide-react'
import Modal from '../Modal'

interface SongEditorProps {
```

Replace with:

```tsx
import { ChordDisplay } from '../ChordDisplay'
import { transposeLyrics } from '../chordUtils'
import { analyzeAndLabelSections, previewAutoLabels } from '../autoLabel'
import type { SongFull } from '../../../shared/types'
import { memo } from 'react'
import { Guitar, Tag, Film, Image as ImageIcon, X, Check, Minus, Plus } from 'lucide-react'
import Modal from '../Modal'
import ReflowEditor from '../ReflowEditor'

interface CardSongEditorProps {
```

Find:

```tsx
export const SongEditor = memo(function SongEditor({
```

Replace with:

```tsx
export const CardSongEditor = memo(function CardSongEditor({
```

Find the closing of the props destructuring (the line right after it):

```tsx
  setShowAutoLabelPreview
}: SongEditorProps): JSX.Element {
```

Replace with:

```tsx
  setShowAutoLabelPreview
}: CardSongEditorProps): JSX.Element {
```

Find:

```tsx
      {/* Lyrics */}
      <div className="space-y-2">
        <label htmlFor="song-lyrics" className="section-header block">Lyrics</label>
        <p className="text-xs text-slate-500">Separate sections with blank lines</p>
        <textarea id="song-lyrics" value={lyrics} onChange={(e) => onLyricsChange(e.target.value)} rows={8}
          placeholder="Enter lyrics — one section per paragraph (separated by blank lines)…"
          aria-label="Song lyrics"
          className="font-mono text-xs leading-relaxed" />
      </div>
```

Replace with:

```tsx
      {/* Lyrics */}
      <div className="flex min-h-0 flex-col gap-2" style={{ height: '320px' }}>
        <label className="section-header block">Lyrics</label>
        <p className="text-xs text-slate-500">A blank line starts a new slide — a label like "Chorus" starts a new section</p>
        {songFull && <ReflowEditor song={songFull} value={lyrics} onChange={onLyricsChange} />}
      </div>
```

- [ ] **Step 3: Update ItemEditor.tsx's import**

Find in `src/renderer/src/ItemEditor.tsx`:

```tsx
import { SongEditor } from './editors/SongEditor'
```

Replace with:

```tsx
import { CardSongEditor } from './editors/CardSongEditor'
```

Find (around line 124, where the component is rendered):

```tsx
        <SongEditor
          songFull={songFull}
          lyrics={lyrics}
```

Replace with:

```tsx
        <CardSongEditor
          songFull={songFull}
          lyrics={lyrics}
```

Find the closing tag for this component (search for the matching JSX close a few lines below the props list you just found — it will read `/>` at the end of that props block; that self-closing tag doesn't need a name change since JSX self-closing tags don't repeat the component name at the close).

- [ ] **Step 4: Run the full gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 373 tests. Typecheck will immediately catch any remaining reference to the old `SongEditor` export name or the old file path.

- [ ] **Step 5: Commit and push**

```bash
git add -A src/renderer/src/editors/CardSongEditor.tsx src/renderer/src/ItemEditor.tsx
git commit -m "feat: rename Card editor to CardSongEditor, wire it to ReflowEditor"
git push
```

`git add -A` is scoped to exactly these two paths here (not a bare `git add -A` for the whole repo) — it's needed because `git mv` plus edits can otherwise leave the rename tracked as a delete+add across two `git add` invocations; naming both paths keeps this equivalent to staging exactly the intended change.

---

## Task 8: Wire the Song Library editor to ReflowEditor

**Files:**
- Modify: `src/renderer/src/editor/SongEditor.tsx`
- Delete: `src/renderer/src/editor/slideCompute.ts`
- Delete: `src/renderer/src/editor/slideCompute.test.ts`
- Delete: `src/renderer/src/editor/SlideStrip.tsx`
- Delete: `src/renderer/src/editor/SlideCanvas.tsx`

The bigger of the two editor rewires: this file currently derives slides from `song.sections` directly and edits one slide-chunk at a time via `SlideStrip`/`SlideCanvas`. It moves to the same pattern the Card editor already uses (an independent `lyricsText` string state, parsed into sections only when saving) — see this plan's "critical interaction-design point" note.

- [ ] **Step 1: Delete the four superseded files**

```bash
git rm src/renderer/src/editor/slideCompute.ts src/renderer/src/editor/slideCompute.test.ts src/renderer/src/editor/SlideStrip.tsx src/renderer/src/editor/SlideCanvas.tsx
```

- [ ] **Step 2: Update imports, add lyricsText state, remove slide-index state**

Find:

```tsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { Pencil, Trash2, ExternalLink, ArrowLeft } from 'lucide-react'
import type { SongFull, SongInput, SongSection } from '../../../shared/types'
import { computeEditorSlides, applySlideEdit, deleteSlideFromSong } from './slideCompute'
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
```

Replace with:

```tsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { Pencil, ExternalLink, ArrowLeft } from 'lucide-react'
import type { SongFull, SongInput } from '../../../shared/types'
import { parseReflowText, sectionsToReflowText, computeReflowSlides } from '../../../shared/reflowText'
import ReflowEditor from '../ReflowEditor'
import BackgroundPanel from './BackgroundPanel'
import { useAutosave } from '../useAutosave'
import { combineSaveStatus } from '../saveQueue'
import SaveStatusBadge from '../SaveStatusBadge'

export default function SongEditor({ songId, onSaved }: {
  songId: number
  onSaved?: () => void
}): JSX.Element {
  const [song, setSong] = useState<SongFull | null>(null)
  const [lyricsText, setLyricsText] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const s = await window.wf.songGet(songId)
    setSong(s)
    setLyricsText(s ? sectionsToReflowText(s.sections) : '')
  }, [songId])
```

- [ ] **Step 3: Replace the slide-computation line and remove per-slide handlers**

Find:

```tsx
  if (!song) {
    return <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading…</div>
  }

  const slides = computeEditorSlides(song)
  const activeSlide = slides[activeSlideIndex] ?? null

  const saveSong = async (updated: SongFull): Promise<void> => {
```

Replace with:

```tsx
  if (!song) {
    return <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading…</div>
  }

  const slides = computeReflowSlides(parseReflowText(lyricsText), song.arrangement ?? null)

  const saveSong = async (updated: SongFull): Promise<void> => {
```

Find:

```tsx
  const handleTextChange = async (sectionOrdinal: number, lineStart: number, lineCount: number, newText: string): Promise<void> => {
    if (!song || !activeSlide) return
    const updatedSections = applySlideEdit(song, { ...activeSlide, sectionOrdinal, lineStart, lineCount }, newText)
    const updated = { ...song, sections: updatedSections }
    setSong(updated)
    await saveSong(updated)
  }
```

Replace with:

```tsx
  // The textarea's own state (lyricsText) is set directly, unconditionally —
  // never re-derived from song.sections — so the operator's literal keystrokes
  // are never fought with a reformatted value. song.sections is kept as a
  // derived cache purely so the rest of this component (BackgroundPanel,
  // title, the autosave payload) still has a valid SongFull to work with;
  // parsing only happens here, not on every render.
  const handleLyricsChange = (text: string): void => {
    setLyricsText(text)
    const updatedSections = parseReflowText(text)
    const updated = { ...song, sections: updatedSections }
    setSong(updated)
    void saveSong(updated)
  }
```

Find:

```tsx
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

  // --- Delete just the active slide ---
  const handleDeleteSlide = async (): Promise<void> => {
    if (!song || !activeSlide) return
    // Guard: never delete the last remaining slide.
    if (slides.length <= 1) return
    const { sections, arrangement } = deleteSlideFromSong(song, activeSlide)
    const updated = { ...song, sections, arrangement }
    setSong(updated)
    await saveSong(updated)
    const newSlides = computeEditorSlides(updated)
    setActiveSlideIndex((i) => Math.min(i, Math.max(0, newSlides.length - 1)))
  }

  const handleApplyBackground = (bgPath: string): void => {
```

Replace with:

```tsx
  const handleApplyBackground = (bgPath: string): void => {
```

`handleAddSlide`/`handleDeleteSlide` have no equivalent in the Reflow model — adding or deleting a slide is now just typing a blank line or deleting text, directly in the continuous editor.

- [ ] **Step 4: Remove the "Delete slide" button and the canDelete flag**

Find:

```tsx
  const canDelete = slides.length > 1 && !!activeSlide

  return (
```

Replace with:

```tsx
  return (
```

Find:

```tsx
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
```

Replace with:

```tsx
        <SaveStatusBadge status={saveStatus} error={saveError} onRetry={retrySave} />

        <button
          onClick={() => window.wf.editorOpen(songId)}
```

- [ ] **Step 5: Replace the slide strip + canvas with ReflowEditor**

Find:

```tsx
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
```

Replace with:

```tsx
      {/* Editor body: continuous lyrics editor + background panel */}
      <div className="flex min-h-0 flex-1 gap-3">
        {/* Center: continuous lyrics editor + live slide preview */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* Text toolbar: font, color, font size */}
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
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-600">Size</span>
              <select
                value={song.fontScale ?? 4}
                onChange={(e) => handleFontScaleChange(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-900"
              >
                {[3, 4, 5, 6, 7, 8, 9, 10].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex min-h-0 flex-1">
            <ReflowEditor song={song} value={lyricsText} onChange={handleLyricsChange} />
          </div>
          <p className="text-center text-[10px] text-slate-400">
            A blank line starts a new slide, a label like "Chorus" starts a new section • {slides.length} slide{slides.length !== 1 ? 's' : ''} total
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
```

The font-size picker moves from `SlideCanvas`'s floating in-canvas pill into this toolbar, since it's a per-song setting, not a per-slide one — `handleFontScaleChange` already existed and is unchanged; only where its control lives has moved.

- [ ] **Step 6: Run the full gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass. Test count drops from 373 to 373 minus `slideCompute.test.ts`'s 9 tests = 364 (that suite tested `deleteSlideFromSong`, which has no equivalent in the new model — there's nothing to delete a slide "from" anymore, since deleting a slide is just deleting text). Typecheck will catch any remaining reference to `computeEditorSlides`/`applySlideEdit`/`deleteSlideFromSong`/`SlideStrip`/`SlideCanvas`/`Trash2` (now-unused import) if the find/replace above missed anything.

- [ ] **Step 7: Commit and push**

```bash
git add -A src/renderer/src/editor/SongEditor.tsx
git commit -m "feat: wire the Song Library editor to ReflowEditor, retire per-slide editing"
git push
```

`git add -A` here is scoped to the one modified file plus needs to pick up the four deletions from Step 1 — since those were already staged via `git rm`, a plain `git add src/renderer/src/editor/SongEditor.tsx` would also work; `-A` is used only as a convenience to also catch the staged deletions in the same commit if they weren't already included, not as a repo-wide add.

---

## Task 9: Manual verification

No more code changes. This task is entirely **[manual]** — this sandbox cannot launch Electron. Ask the user to run through this before trusting the feature.

- [ ] **Step 1: Existing songs look unchanged**

Open a handful of songs that existed before this feature shipped, both in the Song Library and picked into a service item (Card editor). Confirm the slide count and text on each slide look exactly the same as before — this is what the Task 4 migration guarantees.

- [ ] **Step 2: Type a new song from scratch**

In the Song Library, create a new song. Type a verse, hit Enter twice (a blank line) to start a new slide, type more lyrics, then type "Chorus" on its own line and continue typing. Confirm the live slide-preview pane updates instantly as you type, showing the correct slide count and correct section labels — with real background/font/color styling, not plain text boxes.

- [ ] **Step 3: Paste a whole song**

Copy a multi-line, unbroken block of lyrics (no blank lines) from somewhere (e.g. a text file) and paste it into the editor. Confirm blank-line breaks appear automatically every 2 lines, and that you can freely add/remove breaks afterward exactly like any other text.

- [ ] **Step 4: Edit a song inside a live service (Card editor)**

Open Build Service, add a song, edit its lyrics via the Card editor (not the Library). Confirm the same live preview and typing behavior works there too, and that saving reflects correctly back in the Song Library.

- [ ] **Step 5: Confirm the song goes live correctly**

Send a freshly-Reflow-edited song live. Confirm the projector output shows the correct slide breaks — the ones you typed, not the old mechanical 2-line grouping — advancing through them correctly with Next/Previous.

- [ ] **Step 6: Confirm arrangement/reordering still works**

If the song has more than one verse/chorus, use the existing arrangement/reorder feature to change section order. Confirm the live preview and the live-send path both reflect the new order.

- [ ] **Step 7: Confirm untouched features still work**

Auto-label, chord display/transpose, and the background picker (all untouched by this plan) should work exactly as before in both editors.

---

## Self-review notes

**Spec coverage.** Architecture (unify into one editor, one shared parsing module) → Tasks 2, 3, 5, 7, 8 collectively deliver exactly this. Parsing rule (blank line = slide, label line = section) → Task 2's `parseReflowText`/`reflowSlidesForSection`, exhaustively tested. Component structure (one editor, both call sites, live keystroke updates) → Task 6 (component) + Tasks 7/8 (both call sites wired). Migration (one-time, idempotent, no visible change) → Task 4, using this codebase's own established idempotent-function convention rather than the design spec's literal "settings flag" suggestion — a deliberate, reasoned refinement (see Task 4's code comment) that better matches how `normalizeSectionLyrics`/`normalizeTitles` already work, while still satisfying the design's actual guarantee. Paste handling → Task 2's `autoBreakPastedText` + Task 6's `onPaste` wiring. `linesPerSlide` deprecated → after Task 3 (live path) and Task 8 (editor), nothing reads it anymore; the column itself is left in place, unused, matching this codebase's additive-only migration convention (confirmed by reading `initDb()`'s existing `ALTER TABLE ... ADD COLUMN` list — there is no precedent for dropping a column, so this plan doesn't introduce one either).

**A correctness issue found only while writing this plan, not present in the design spec:** `splitLyricLines` (used by every song save) drops blank lines today — if left unfixed, every save through `createSong`/`updateSong` would have silently erased every slide break the operator just typed. Task 1 fixes this first, before anything else depends on blank lines meaning something.

**Another gap found only while writing this plan:** the design's parsing rule ("label line = section, blank line = slide") implies every section must serialize with an explicit label — an unlabeled section serialized without one would silently merge into whatever precedes it on the next parse. `sectionsToReflowText` (Task 2) always computes and emits a label; this is a deliberate, necessary consequence of the approved rule, not scope creep.

**Placeholder scan.** No TBD/TODO. Every step shows real, complete code. The one place this plan asks the executing engineer to search-and-adapt rather than paste verbatim is Task 7 Step 3's "find the matching JSX close" instruction — flagged explicitly as a small, low-risk adjustment (a self-closing tag needs no name change) rather than left as a vague "update as needed."

**Type consistency.** `ReflowSlide` (Task 2: `{key, sectionOrdinal, sectionLabel, text}`) is the exact shape consumed by `ReflowEditor`'s `ReflowSlideThumb` (Task 6) — same field names throughout, no renaming between layers. `parseReflowText`/`sectionsToReflowText`/`computeReflowSlides`/`reflowSlideTexts`/`autoBreakPastedText` signatures defined in Task 2 are used identically (same argument order, same names) by Task 3 (`main/index.ts`), Task 5 (`CardEditPanel.tsx`), Task 6 (`ReflowEditor.tsx`), and Task 8 (`editor/SongEditor.tsx`) — no drift between tasks.
