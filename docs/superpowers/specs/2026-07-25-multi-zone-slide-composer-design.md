# Multi-Zone Slide Composer — Design (Phase 2)

**Date:** 2026-07-25
**Status:** Approved, pending implementation plan
**Depends on:** `2026-07-25-build-service-zone-view-design.md` (Phase 1)

## Goal

Let a sermon or text item carry an authored deck of slides, where each slide
holds separate content for each of the four zone screens. Advancing the deck
moves all four screens together.

The driving example: a sermon with six slides, where Back Left holds the same
sermon title throughout while Back Right shows a different verse on each slide.

## Background — why this needs new storage

Two facts about the current engine make this impossible today:

1. **A slide is one piece of content, shared by every zone on a track.**
   `computeZoneStates()` derives all four zones from a single
   `renderState(zoneTrack)`. A zone chooses only whether to *show* that content
   or show logo/black. There is no way for two zones to show different things
   at the same slide index. The Main/Second track pair gives two independent
   contents, but they advance independently rather than in lockstep.

2. **Slides are derived, not authored.** `computeItemSlides()` builds a
   `string[]` on the fly. A sermon yields exactly one slide — speaker and
   passage joined (`index.ts:1087-1092`). There is nowhere to put a second.

## Relationship to Phase 1

Phase 1 puts the 2×2 grid of live screen previews in Build Service and builds
`ZoneScreenCard`. Phase 2 reuses that card, swapping its role picker for a slot
editor, and adds a slide strip above the grid.

Item types keep whichever editor fits:

| Item type | Editor |
|---|---|
| `sermon`, `text` | Slide composer (this spec) when a deck exists; Phase 1 role grid when it does not |
| everything else | Phase 1 role grid |

An item with no deck behaves exactly as it does today. Nothing existing changes
until a deck is authored.

## Data model

One new column, added by a single `ALTER TABLE` alongside the existing ones in
`db.ts:167-171`:

```sql
ALTER TABLE service_item ADD COLUMN zone_slides TEXT
```

This follows the same convention as `zone_routing`, `style`, and `payload_json`
— a nullable JSON text column, parsed defensively. No new table.

```ts
export type ZoneSlotKind = 'text' | 'scripture' | 'logo' | 'black' | 'image' | 'same'

export interface ZoneSlot {
  kind: ZoneSlotKind
  text?: string       // kind 'text'
  reference?: string  // kind 'scripture'
  path?: string       // kind 'image'
}

export interface ZoneSlide {
  zones: Record<ZoneId, ZoneSlot>
}

// service_item.zone_slides holds ZoneSlide[]
```

`null` or unparseable JSON means "no deck" — the item falls back to Phase 1
behaviour. This matches the never-crash contract `parseSceneConfig` and
`parseZoneTrackAssignment` already use.

### The `same` kind

`same` means "hold whatever this screen showed on the previous slide". It
resolves by scanning backward from the current index for the first slot on that
zone whose kind is not `same`; if none is found, it renders as `black`.

This is what makes the driving example cheap: Back Left is authored once on
slide 1 and set to `same` on slides 2–6, so editing the sermon title is one
edit rather than six.

## Rendering

### Slide cursor — no engine change

`t.song.lines` is the slide array and `t.index` the cursor (`index.ts:515-523`).
When a deck item goes live, `lines` is populated with one summary string per
deck slide. Next, Prev, auto-advance, `total`, and the slide grid therefore all
work unchanged — the existing cursor drives the deck.

The summary string for a slide is its Lyrics TVs (zone 3) slot text, falling
back to the first zone with renderable text, else the empty string. It is what
the operator sees in the slide grid thumbnail and the Live tab rail.

### Per-zone resolution

In `computeZoneStates()`, for each zone, after the live item is resolved:

- If the item has a deck and `t.index` is within its bounds, resolve that
  zone's slot for `t.index` (following `same` backward as described) and build
  the `ZoneState` from it.
- Otherwise fall through to the Phase 1 role path, unchanged.

Slot to `ZoneState`:

| Slot kind | Resulting state |
|---|---|
| `text` | `mode: 'text'`, `line` = `slot.text` |
| `scripture` | `mode: 'text'`, `line` = the pre-resolved verse text |
| `logo` | `mode: 'logo'` |
| `black` | `mode: 'black'` |
| `image` | `mode: 'image'`, `imagePath` = `slot.path` |
| `same` | resolved backward, then mapped by this table |

Background, theme colours, and font scale come from the item as they do today.

### Scripture must be pre-resolved

`computeZoneStates()` is synchronous and runs on every broadcast — as often as
every 100ms during auto-advance — while scripture lookup is async and may hit
the network for non-KJV translations. Resolving inline is not an option.

So when a deck item is loaded, every `scripture` slot in the deck is looked up
once and cached on the track:

```ts
// on LiveTrackState
deckScripture: Map<string, string>  // key `${slideIndex}:${zoneId}` -> verse text
```

The pre-resolution pass is async and must honour the existing `loadGeneration`
staleness guard: after each await it checks that the generation still matches,
and abandons the pass if something newer has loaded onto the track. This is the
same guard `doLoadScripture` already uses.

A lookup that fails leaves no cache entry; that slot renders as `black` rather
than showing a stale verse or a blank text slide with no explanation, and the
failure is logged.

### `computeItemSlides`

For `sermon` and `text` items with a deck, it returns one summary string per
deck slide (same summary rule as above) instead of today's derived value. Deck
absent, behaviour is unchanged.

## Editor

Shown in the Build Service centre pane for sermon and text items:

- A horizontal slide strip above the grid: Slide 1, 2, 3 … plus **Add slide**.
  Slides can be reordered by drag and deleted. Selecting one fills the grid.
- The Phase 1 2×2 grid below it, each card now showing that slide's slot for
  its zone and offering an inline editor by kind: a text box for `text`, a
  reference field for `scripture`, the backgrounds picker for `image`, and
  plain selection for `logo` / `black` / `same`.
- An item with no deck shows the Phase 1 role grid plus a **Build slides**
  button that creates a one-slide deck seeded from the item's current content.

New files under `src/renderer/src/zones/`: `ZoneSlideStrip.tsx` (the strip),
`ZoneSlotEditor.tsx` (one card's inline editor). `ZoneScreenCard.tsx` from
Phase 1 gains a slot mode alongside its role mode.

## Shared logic

New pure module `src/shared/zoneSlides.ts`:

- `parseZoneSlides(json: string | null): ZoneSlide[] | null` — defensive parse.
- `validateZoneSlides(value: unknown): value is ZoneSlide[]`
- `resolveSlot(slides: ZoneSlide[], index: number, zoneId: ZoneId): ZoneSlot` —
  the backward `same` scan, returning a `black` slot when nothing resolves.
- `slideSummary(slide: ZoneSlide): string` — the thumbnail/rail string.

Keeping these pure and out of `main/index.ts` means they are directly testable
and usable from the renderer editor without IPC.

## IPC

Two handlers, mirroring the existing `wf:zone:getRouting` / `wf:zone:setRouting`
pair:

- `wf:zone:getSlides(itemId): ZoneSlide[] | null`
- `wf:zone:setSlides(itemId, slides: ZoneSlide[] | null): void` — persists and
  refreshes the `activeServiceItems` cache so zone states recompute, exactly as
  `wf:zone:setRouting` does today.

Preload exposes them as `zoneGetSlides` / `zoneSetSlides`, and
`browserWfMock.ts` gains stubs so the browser dev harness keeps working.

## Edge cases

- **Deck shorter than the cursor** — if `t.index` exceeds the deck length
  (possible if a deck is edited while live), every zone falls back to the
  Phase 1 role path rather than rendering nothing.
- **Empty deck array** — treated as no deck.
- **Image slot with a missing file** — renders `black`; the existing
  `validateMediaPath` guard already rejects paths outside the media directory.
- **Deck on a zone assigned to the other track** — unaffected. The zone-track
  assignment picks which item a screen follows; the deck then supplies that
  screen's content. The two compose without special-casing.
- **Recording chapter markers** — a sermon still stamps its marker on load, as
  today. Deck slides do not add markers.

## Testing

`src/shared/zoneSlides.test.ts` covers the pure module:

- `resolveSlot` walks `same` back across several slides to the originating slot.
- `resolveSlot` returns `black` when slide 1 is `same` with nothing before it.
- `resolveSlot` resolves each zone independently — zone 1 `same` while zone 2
  has a real slot at the same index.
- `parseZoneSlides` returns `null` for malformed JSON, a non-array, and an
  array containing a slot with an unknown `kind`.
- `slideSummary` prefers zone 3, falls back to the first renderable zone, and
  returns `''` for an all-logo slide.

Main-process wiring and editor UI follow the codebase convention of manual
verification.

## Out of scope

- Decks on songs, scripture, countdown, image, ticker, and announcement items.
  Song slides derive from lyrics and lines-per-slide, so an authored deck would
  drift whenever a verse is edited. Revisit only if the sermon and text cases
  prove the model.
- Independent per-zone cursors. Advance is lockstep by decision; the Main and
  Second tracks remain the way to run two things at different positions.
- Per-slide backgrounds or themes beyond the `image` slot kind.
- Video slots.
