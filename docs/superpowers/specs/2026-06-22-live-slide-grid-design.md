# WorshipFlow — Live Slide-Grid + Tools Panel (Phase 2 of UI overhaul)

**Date:** 2026-06-22
**Status:** Approved design, ready for implementation plan
**Stage:** Phase 2 of 3 (builds on the Phase 1 flat shell — `2026-06-22-flat-shell-redesign-design.md`)

## Goal

Turn the Live tab's main area into a **click-a-slide grid** (like the Presenter screenshots):
each service item shows its slides as thumbnails with the real lyric text on the theme
background, and clicking a thumbnail sends that exact slide live. The current Live controls
are kept but reorganized into a right-hand **tools panel** so the slides are the focus.

## Slide grid (Live main area)

- Each go-live item of the active service is a **panel**: header (type icon + title), then a
  responsive **grid of slide thumbnails**.
- A "slide" = one grouped screen of the item's content (the same grouping used when it goes
  live). For **song / scripture / text**, each thumbnail shows the slide's **theme background
  + its lyric/verse text** (reusing `SlideThumb` with the slide text as its label). For
  **countdown / welcome / image / ticker**, the item shows a single representative thumbnail.
- **Click a thumbnail → that item goes live at that slide.** The slide currently on the
  projector gets a **blue outline**; the live item's panel scrolls into view.
- Empty state: "No service loaded — pick one in the Services tab." (the rail/Services drive
  selection via the Phase 1 `ServiceContext`).

## Backend: item slides + go-live-at-slide

Two new capabilities in the main process, built on the existing `doLoad*` functions:

1. **Compute an item's slides without going live.** Extract the content computation from the
   load functions into a shared `computeItemContent(item) → { title, lines, background, mode }`
   (async; songs/scripture already fetch). `doLoadSong`/`doLoadScripture`/`doLoadText`/etc.
   refactor to call it then assign live state; a new IPC returns the lines for thumbnails.
   - IPC `wf:service:slides(serviceId)` → `{ id: number; slides: string[] }[]` (one entry per
     go-live item). The grid calls this once per active service (and after edits) to render
     thumbnails.
2. **Go live at a specific slide.** IPC `wf:live:goLiveAt(itemId, slideIndex)` — loads the item
   live (same path as `handleTabletLoadItem`), then sets `state.index` to the clamped
   `slideIndex`, sets `liveServiceItemId`, resolves the item theme, and broadcasts.
   - Preload: `liveGoLiveAt(itemId, slideIndex)`.

The renderer highlights the live thumbnail from `LiveState.liveServiceItemId` + `index`.

## Right tools panel

All current Live controls are kept, reorganized (the old operator-theme switcher is removed —
the flat look replaces it):

- **Always visible (top):** Stage message + quick-message presets · Quick Scripture (with the
  KJV / WEB / BBE switch beside it) · Font size (A− / A+ / save to song) · Auto-advance
  (seconds + Start/Stop + Loop).
- **OBS** — its own collapsible section (the existing `ObsPanel`).
- **"More ▾"** (collapsed by default): Hymn timer · Verse # · Service activity log · Keyboard
  shortcuts cheat-sheet · Displays info · Tablet remote URL.

## LiveView reorganization

`LiveView` becomes a thin layout: `<SlideGrid />` (main) + `<LiveTools />` (right panel).
Removed from the old LiveView (now provided elsewhere): the left service-order panel and the
operator preview (the Phase 1 rail provides both), the "Now playing" line list and the
transport Prev/Next/Black/Logo block (the grid + the rail's output controls + the keyboard
handler replace them). The keyboard handler (Space/←/→/B/L/S) stays in `LiveView`.

## Components / files

- **New:** `src/renderer/src/SlideGrid.tsx` — item panels + slide thumbnails; calls
  `wf:service:slides`, subscribes to live state for highlighting, click → `liveGoLiveAt`.
- **New:** `src/renderer/src/LiveTools.tsx` — the right tools panel (stage message, scripture,
  font, auto-advance, OBS, "More ▾"). Holds the control UI moved out of `LiveView`.
- **Modify:** `src/renderer/src/LiveView.tsx` — becomes the `SlideGrid` + `LiveTools` layout +
  the keyboard handler; drops the removed sections.
- **Modify:** `src/main/index.ts` — extract `computeItemContent`; add `wf:service:slides` and
  `wf:live:goLiveAt` IPCs; refactor `doLoad*` to use the shared computation.
- **Modify:** `src/preload/index.ts` — add `serviceSlides`, `liveGoLiveAt`.
- **Reuse:** `SlideThumb` (slide text as label), `ServiceContext`, `liveActions`, theme helpers.

## Scope

In scope (Phase 2):
- The Live slide-grid main area + click-to-go-live-at-slide.
- Item-slide computation + `goLiveAt` backend.
- The reorganized right tools panel (all controls kept; theme switcher removed).

Out of scope:
- Reworking the Services / Songs / Scripture tab content into Presenter-style editors →
  **Phase 3**.
- Section grouping of service items ("Music Set 1"/"Sermon").
- Editing a slide's text directly from its thumbnail (song lyrics still edit in the Services
  deck / Songs tab).

## Testing / verification

- `npm run typecheck` clean; app boots; no console errors.
- Manual: the Live tab shows each item as a panel of slide thumbnails with real lyric text;
  clicking a thumbnail sends that exact slide live; the on-screen slide shows a blue outline
  and updates as you click around; the keyboard Space/←/→ still advance.
- The tools panel: stage message + presets, quick scripture + bible switch, font, and
  auto-advance work; OBS and the "More ▾" section (hymn timer, verse #, log, shortcuts,
  displays, tablet URL) all work; no operator-theme switcher remains.
- Regression: rail, output preview, Services deck, Songs, OBS, CCLI, tablet, imports unaffected.

## Roadmap (context)

1. **Phase 1 (done)** — flat shell: theme + top bar + persistent rail + output preview.
2. **Phase 2 (this spec)** — Live slide-grid + reorganized tools panel.
3. **Phase 3** — rework Services / Songs / Scripture main areas into the new layouts.
