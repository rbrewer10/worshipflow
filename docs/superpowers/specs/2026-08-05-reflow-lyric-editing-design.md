# Reflow-style continuous lyric editing — design

**Date:** 2026-08-05
**App:** WorshipFlow Pro (Electron + React)
**Status:** Design approved, ready for implementation plan

## Context

WorshipFlow has two completely separate lyric editors today, and neither supports what ProPresenter calls "Reflow" — type continuously, watch slides update live, insert or remove a break with a keystroke.

- **Song Library editor** (`src/renderer/src/editor/SongEditor.tsx` + `SlideStrip.tsx`/`SlideCanvas.tsx`): a WYSIWYG per-slide view. Slides are computed from each section's stored `lyrics` text via `computeEditorSlides()` (`src/renderer/src/editor/slideCompute.ts`), splitting mechanically every `linesPerSlide` lines (a single integer per song, default 2, with no UI control anywhere to change it). Editing happens one slide-chunk textarea at a time; slide boundaries for the rest of the section only visibly shift after you blur out.
- **Service-builder "Card" editor** (`src/renderer/src/editors/SongEditor.tsx`, reached via `CardEditPanel.tsx` when editing a song inside a service item): a single continuous `<textarea>` holding the whole song as one document, round-tripped to/from `SongSection[]` by `sectionsToText`/`parseSections` (`src/renderer/src/songText.ts`). This one already lets you type continuously — but there's no live slide preview at all while typing, and no way to express a slide break; slides only get (re-)computed after an explicit "Save lyrics" click.

Both editors ultimately depend on the same slide-splitting rule, but it's implemented **twice**, independently, and manually kept in sync: `computeEditorSlides()` on the editor side, `songLines()`/`groupLines()` (`src/main/index.ts`) on the live/send side. A code comment on the main-process version literally says "Mirrors the editor's computeEditorSlides" — an explicit acknowledgment that these are two hand-synchronized copies of one rule, not one shared implementation.

Today, the *only* way to express a break at all is a blank line, and that always means "new section" (`parseSections`) — there is no way to say "new slide, same section." Slide boundaries within a section are purely mechanical, every N lines.

## Decisions locked with the user

- **Unify into one Reflow editor**, used everywhere lyrics are touched — both the Song Library and the Service-builder Card editor retire their current separate approaches in favor of one continuous-text-plus-live-preview surface.
- **A blank line starts a new slide** within the current section. **A recognized label line** ("Chorus", "Verse 2", etc. — reusing the label list already used by the Card editor's section-label recognition) **starts a new section.** Chosen specifically because it needs no new gesture to learn — it's how people already type song lyrics from memory, and it directly extends a convention (blank-line-as-separator) the Card editor already has, just one level deeper.
- **Existing songs get a one-time migration**, on upgrade: for every existing section, insert blank lines at exactly the points the old mechanical "every `linesPerSlide` lines" split would have produced. Every song already in the library looks pixel-identical immediately after upgrading; from then on, its breaks are real, editable blank lines instead of an implied count.
- **Pasting a large unbroken block auto-inserts blank-line breaks every 2 lines** as a starting point — otherwise Reflow would be *more* manual work than today for a freshly-pasted new song, where pasting currently "just works" with zero clicks.
- **`linesPerSlide` is deprecated**, not read or written by any code path after this ships. The database column itself is left in place, unused, rather than dropped — this codebase's existing migrations are additive-only (`ALTER TABLE ... ADD COLUMN`, never a drop), and there's no reason to break that pattern for a harmless unused column.

## Design

### 1. Architecture

A new shared, pure module in `src/shared/` (e.g. `reflowText.ts`) replaces both `computeEditorSlides()` and `songLines()`/`groupLines()`. It takes the whole song as one continuous string (or an already-parsed `SongSection[]`, whichever proves cleaner once the implementation plan looks at both call sites' exact needs) and returns the same section/slide structure both current implementations produce, but from one rule, one place. Both the editor's live preview and the main process's actual live-send path call this same function — the "two independently mirrored copies" problem this feature would otherwise inherit goes away as a side effect of unifying the editor, not as separate cleanup work.

### 2. Parsing rule

Scan the continuous document line by line, tracking "current section" and "current slide-in-progress":

- A line matching a recognized label (the existing known-label list) **starts a new section** — the label is consumed as that section's label, not as lyric content, and any in-progress slide is closed out.
- A **blank line** closes the current slide and starts a new one, staying in the same section.
- Any other line is appended to the slide currently being built.

A section is only ever started by a label line, never inferred from blank-line count — this is what keeps "blank line ends a slide" and "blank line (indirectly) ends a section" from being ambiguous with each other. An unlabeled leading block (no recognized label line yet) falls back to today's existing default-section behavior, unchanged.

This is a pre-existing, accepted limitation carried over unchanged, not something this feature newly introduces: a lyric line that happens to *read* like a label (e.g. a song whose lyrics literally include the word "Chorus") can be misread as a section boundary — today's Card editor already has this exact ambiguity via its own label-recognition, and this feature doesn't attempt to resolve it further.

### 3. Component structure

One Reflow editor component, rendered from both call sites (the Song Library and the Service-builder Card editor) rather than two separate implementations. Layout: a continuous text column on one side, a live list of slide-preview thumbnails on the other, both re-derived from the shared parsing function on every keystroke — not just on blur or explicit save. Section labels are typed inline as part of the same flowing document; there's no separate label-entry form.

The two existing files are both, confusingly, named `SongEditor.tsx` in different directories (`editor/` vs `editors/`) — the implementation plan should resolve this naming collision as part of wiring both call sites to the new shared component, rather than leaving two near-identically-named files whose relationship isn't obvious from the name alone.

### 4. Migration

A one-time startup pass, gated by a flag in the existing `setting` table (e.g. `reflow_migration_done`) so it runs exactly once, ever, regardless of how many times the app starts. For every existing `song_section` row, it computes where the old `linesPerSlide`-based split (default 2) would have placed breaks, and inserts blank lines at those exact points into the stored `lyrics` text. Idempotent by construction (guarded by the one-time flag), not by re-detecting already-migrated text.

### 5. Paste handling

Pasting text with no existing blank-line breaks and more than 2 lines auto-inserts a blank line every 2 lines, as a plain editable starting point — indistinguishable afterward from a break the operator typed by hand. This reuses the same "2 lines" default the deprecated `linesPerSlide` used, just as a fixed constant now rather than a per-song stored value.

### 6. Error handling

- **Ambiguous label-like lyric content**: accepted pre-existing limitation (see §2), not newly introduced or newly fixed by this feature.
- **A song with zero recognized label lines at all**: falls back to today's existing default single-section behavior, unchanged.
- **Migration re-run safety**: gated entirely by the one-time `setting` flag; no code path re-runs the migration or re-scans "does this look already-migrated."

### 7. Testing

The shared parsing module (`reflowText.ts` or similar) is the one piece of this feature that's genuinely pure and unit-testable — no Electron, no DOM, just text in and a section/slide structure out. It should get thorough test coverage: blank line creates a new slide, a label line creates a new section, an unlabeled leading block falls back correctly, paste-style auto-formatting inserts breaks at the right spots, and the migration's break-point computation exactly matches what the old `linesPerSlide`-based split would have produced (this last one is the most important test in the whole feature — it's the difference between "every existing song looks the same after upgrading" and a very visible regression across the entire library). The editor component itself (live keystroke-driven re-render, two-pane layout) is UI and won't be unit tested, matching this codebase's existing posture toward its editor components.

## Non-goals

- Groups & Arrangements (reordering sections/slides) — a separate, already-catalogued idea, untouched by this feature.
- Slide typography/auto-fit sizing — untouched.
- Structured import from CCLI SongSelect/MultiTracks with source-provided slide breaks — a separate, larger idea.
- Any further fix to the pre-existing label-recognition ambiguity described in §2/§6.
- Undo/redo beyond whatever mechanism (if any) the current editors already provide.

## Success criteria

One Reflow editor, not two different editing experiences, used from both the Song Library and the Service-builder Card editor. Live slide preview updates on every keystroke, not just on blur/save. Every song already in the library renders identically after the one-time migration — no visible regression across the existing library. A freshly pasted song gets sensible default breaks with zero extra clicks, same as today. The two independently-mirrored slide-splitting implementations are reduced to one shared, tested function.
