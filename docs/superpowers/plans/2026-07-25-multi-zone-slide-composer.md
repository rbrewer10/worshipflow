# Multi-Zone Slide Composer — Implementation Plan (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a sermon or text item carry an authored deck of slides, where each slide holds separate content per zone screen — so Back Left can hold a sermon title while Back Right shows a different verse on each slide, advancing together on one Next.

**Architecture:** A new nullable `service_item.zone_slides` JSON column, following the exact convention of the existing `zone_routing` / `style` / `payload_json` columns. Pure parse/resolve logic lives in a new `src/shared/zoneSlides.ts` and is unit-tested. The live engine needs no new cursor: `t.song.lines` is populated with one summary string per deck slide, so Next/Prev, auto-advance and totals work unchanged, and `computeZoneStates()` reads the deck at `t.index` for per-zone content. Scripture slots are pre-resolved once on load so the synchronous 100ms render path never blocks.

**Tech Stack:** Electron + electron-vite, React 18, TypeScript, Tailwind v3, sql.js, vitest.

**Spec:** `docs/superpowers/specs/2026-07-25-multi-zone-slide-composer-design.md`

**Branch:** `feat/build-service-zone-view` (Phase 1 already merged into it).

---

## Task 1: Fix stale track assignment in the zone grid

`ZoneScreenGrid` fetches the zone-track assignment once in an effect keyed on `serviceId`. `ServiceDeck` owns a separate copy and mutates it from its popover. So changing a zone's track in the popover leaves the grid rendering the old values — cards read "Follows Second" while the popover says Main. Two components own the same state; lift it to their common parent.

**Files:**
- Modify: `src/renderer/src/ServiceEditor.tsx`
- Modify: `src/renderer/src/ServiceDeck.tsx`
- Modify: `src/renderer/src/zones/ZoneScreenGrid.tsx`

- [ ] **Step 1: Own the assignment in ServiceEditor**

Read all three files first. In `ServiceEditor.tsx`, add state and a load effect:

```tsx
  const [trackAssignment, setTrackAssignment] = useState<ZoneTrackAssignment>(DEFAULT_ZONE_TRACK)

  useEffect(() => {
    void window.wf.zoneTrackAssignmentGet(serviceId).then(setTrackAssignment)
  }, [serviceId])
```

Import `DEFAULT_ZONE_TRACK` from `'../../shared/types'` and the type `ZoneTrackAssignment` from `'../../shared/zoneTrack'`. Verify both paths on disk.

- [ ] **Step 2: Pass it into both children**

On `<ServiceDeck ... />` add `trackAssignment={trackAssignment}` and `onTrackAssignmentChange={setTrackAssignment}`.
On `<ZoneScreenGrid ... />` add `trackAssignment={trackAssignment}`.

- [ ] **Step 3: Make ServiceDeck controlled**

In `ServiceDeck.tsx`, delete its own `const [trackAssignment, setTrackAssignment] = useState<ZoneTrackAssignment>(DEFAULT_ZONE_TRACK)` and the `useEffect` that fetches it. Add to its props type:

```ts
  trackAssignment: ZoneTrackAssignment
  onTrackAssignmentChange: (next: ZoneTrackAssignment) => void
```

Add both to the destructured parameter list. Change the `ZoneTrackToggle`'s `onChanged={setTrackAssignment}` to `onChanged={onTrackAssignmentChange}`. Remove any now-unused imports (`DEFAULT_ZONE_TRACK` and `useState`/`useEffect` may still be used for other state — check before deleting).

- [ ] **Step 4: Make ZoneScreenGrid controlled**

In `ZoneScreenGrid.tsx`, delete its `trackAssignment` state and its `zoneTrackAssignmentGet` effect. Add `trackAssignment: ZoneTrackAssignment` to the props type and destructured list. Everything downstream that reads `trackAssignment[zoneId]` is unchanged. Remove the now-unused `DEFAULT_ZONE_TRACK` import if nothing else uses it.

- [ ] **Step 5: Verify**

Run: `cd "C:\Dev\worshipflow" && npm run typecheck && npm test`
Expected: typecheck silent; 137 tests pass across 12 files.

- [ ] **Step 6: Commit**

```bash
cd "C:\Dev\worshipflow" && git add src/renderer/src/ServiceEditor.tsx src/renderer/src/ServiceDeck.tsx src/renderer/src/zones/ZoneScreenGrid.tsx && git commit -m "fix: zone grid and deck share one track assignment

Both components fetched and owned their own copy, so changing a zone's track
in the deck's popover left the grid rendering stale values — cards read
'Follows Second' while the popover said Main. Lifted to ServiceEditor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: The pure zoneSlides module (TDD)

**Files:**
- Create: `src/shared/zoneSlides.ts`
- Create: `src/shared/zoneSlides.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/shared/zoneSlides.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseZoneSlides, validateZoneSlides, resolveSlot, slideSummary } from './zoneSlides'
import type { ZoneSlide } from './zoneSlides'

const deck: ZoneSlide[] = [
  { zones: { 1: { kind: 'text', text: 'He Is Risen' }, 2: { kind: 'scripture', reference: 'John 3:16' }, 3: { kind: 'logo' }, 4: { kind: 'black' } } },
  { zones: { 1: { kind: 'same' }, 2: { kind: 'scripture', reference: 'John 3:17' }, 3: { kind: 'same' }, 4: { kind: 'black' } } },
  { zones: { 1: { kind: 'same' }, 2: { kind: 'text', text: 'Amen' }, 3: { kind: 'same' }, 4: { kind: 'black' } } },
]

describe('resolveSlot', () => {
  it('returns the slot directly when it is not "same"', () => {
    expect(resolveSlot(deck, 0, 1)).toEqual({ kind: 'text', text: 'He Is Risen' })
    expect(resolveSlot(deck, 1, 2)).toEqual({ kind: 'scripture', reference: 'John 3:17' })
  })
  it('walks "same" back across several slides to the originating slot', () => {
    expect(resolveSlot(deck, 2, 1)).toEqual({ kind: 'text', text: 'He Is Risen' })
    expect(resolveSlot(deck, 2, 3)).toEqual({ kind: 'logo' })
  })
  it('resolves each zone independently at the same index', () => {
    expect(resolveSlot(deck, 1, 1)).toEqual({ kind: 'text', text: 'He Is Risen' })
    expect(resolveSlot(deck, 1, 2)).toEqual({ kind: 'scripture', reference: 'John 3:17' })
  })
  it('falls back to black when slide 1 is "same" with nothing before it', () => {
    const orphan: ZoneSlide[] = [{ zones: { 1: { kind: 'same' }, 2: { kind: 'black' }, 3: { kind: 'black' }, 4: { kind: 'black' } } }]
    expect(resolveSlot(orphan, 0, 1)).toEqual({ kind: 'black' })
  })
  it('falls back to black for an out-of-range index', () => {
    expect(resolveSlot(deck, 99, 1)).toEqual({ kind: 'black' })
  })
})

describe('slideSummary', () => {
  it('prefers zone 3 text', () => {
    expect(slideSummary({ zones: { 1: { kind: 'text', text: 'one' }, 2: { kind: 'text', text: 'two' }, 3: { kind: 'text', text: 'three' }, 4: { kind: 'black' } } })).toBe('three')
  })
  it('falls back to the first renderable zone', () => {
    expect(slideSummary(deck[0])).toBe('He Is Risen')
  })
  it('uses a scripture reference when that is all there is', () => {
    expect(slideSummary({ zones: { 1: { kind: 'logo' }, 2: { kind: 'scripture', reference: 'Ps 23' }, 3: { kind: 'logo' }, 4: { kind: 'black' } } })).toBe('Ps 23')
  })
  it('returns empty string for an all-logo slide', () => {
    expect(slideSummary({ zones: { 1: { kind: 'logo' }, 2: { kind: 'logo' }, 3: { kind: 'logo' }, 4: { kind: 'black' } } })).toBe('')
  })
})

describe('parseZoneSlides / validateZoneSlides', () => {
  it('returns null for null, malformed JSON, and non-arrays', () => {
    expect(parseZoneSlides(null)).toBeNull()
    expect(parseZoneSlides('not json{{')).toBeNull()
    expect(parseZoneSlides('{"nope":1}')).toBeNull()
  })
  it('returns null for an empty deck', () => {
    expect(parseZoneSlides('[]')).toBeNull()
  })
  it('rejects an unknown slot kind', () => {
    expect(validateZoneSlides([{ zones: { 1: { kind: 'nope' }, 2: { kind: 'logo' }, 3: { kind: 'logo' }, 4: { kind: 'black' } } }])).toBe(false)
  })
  it('round-trips a valid deck', () => {
    expect(parseZoneSlides(JSON.stringify(deck))).toEqual(deck)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd "C:\Dev\worshipflow" && npm test -- zoneSlides`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/shared/zoneSlides.ts`:

```ts
// Authored per-slide, per-zone content for an item. Pure module: no DB, no
// Electron. A deck lets one slide show different things on different screens —
// e.g. Back Left holding a sermon title while Back Right cycles verses.

import type { ZoneId } from './types'

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

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]
const KINDS: ZoneSlotKind[] = ['text', 'scripture', 'logo', 'black', 'image', 'same']

const BLACK: ZoneSlot = { kind: 'black' }

// 'same' means "hold whatever this screen showed on the previous slide", so a
// sermon title spanning six slides is authored once. Resolution walks back to
// the nearest real slot; nothing before it means there is nothing to hold, so
// the screen goes black rather than rendering an undefined slot.
export function resolveSlot(slides: ZoneSlide[], index: number, zoneId: ZoneId): ZoneSlot {
  if (index < 0 || index >= slides.length) return BLACK
  for (let i = index; i >= 0; i--) {
    const slot = slides[i]?.zones?.[zoneId]
    if (!slot) return BLACK
    if (slot.kind !== 'same') return slot
  }
  return BLACK
}

function slotText(slot: ZoneSlot | undefined): string {
  if (!slot) return ''
  if (slot.kind === 'text') return slot.text ?? ''
  if (slot.kind === 'scripture') return slot.reference ?? ''
  return ''
}

// The one-line label for this slide in the slide grid and the Live tab rail.
// Zone 3 (Lyrics TVs) wins because it is the screen the congregation reads.
export function slideSummary(slide: ZoneSlide): string {
  const preferred = slotText(slide.zones?.[3])
  if (preferred) return preferred
  for (const zoneId of ZONE_IDS) {
    const text = slotText(slide.zones?.[zoneId])
    if (text) return text
  }
  return ''
}

export function validateZoneSlides(value: unknown): value is ZoneSlide[] {
  if (!Array.isArray(value) || value.length === 0) return false
  for (const slide of value) {
    if (typeof slide !== 'object' || slide === null) return false
    const zones = (slide as ZoneSlide).zones
    if (typeof zones !== 'object' || zones === null) return false
    for (const zoneId of ZONE_IDS) {
      const slot = zones[zoneId]
      if (typeof slot !== 'object' || slot === null) return false
      if (!KINDS.includes(slot.kind)) return false
    }
  }
  return true
}

// Never throws; anything unusable means "no deck", and the caller falls back to
// the item's normal single-content behaviour.
export function parseZoneSlides(json: string | null): ZoneSlide[] | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json)
    return validateZoneSlides(parsed) ? parsed : null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Verify**

Run: `cd "C:\Dev\worshipflow" && npm test -- zoneSlides`
Expected: PASS.

Run: `cd "C:\Dev\worshipflow" && npm test && npm run typecheck`
Expected: 13 test files pass, test count risen from 137; typecheck silent.

- [ ] **Step 5: Commit**

```bash
cd "C:\Dev\worshipflow" && git add src/shared/zoneSlides.ts src/shared/zoneSlides.test.ts && git commit -m "feat: add pure zoneSlides module

Parse, validate, resolve and summarise authored per-slide per-zone decks.
'same' holds the previous slide's content for that screen, which is what
lets a sermon title span six slides authored once.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Persistence and IPC

**Files:**
- Modify: `src/main/db.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/browserWfMock.ts`

- [ ] **Step 1: Add the column and accessors**

In `src/main/db.ts`, alongside the existing `ALTER TABLE` migrations (near `zone_routing`, around line 169), add:

```ts
  try { db.run('ALTER TABLE service_item ADD COLUMN zone_slides TEXT') } catch { /* already exists */ }
```

Then add accessors mirroring `getItemZoneRouting` / `setItemZoneRouting` exactly:

```ts
export function getItemZoneSlides(itemId: number): string | null {
  const rows = db.exec('SELECT zone_slides FROM service_item WHERE id = ?', [itemId])
  if (!rows.length || !rows[0].values.length) return null
  return (rows[0].values[0][0] as string | null) ?? null
}

export function setItemZoneSlides(itemId: number, slides: string | null): void {
  db.run('UPDATE service_item SET zone_slides = ? WHERE id = ?', [slides, itemId])
  persist()
}
```

- [ ] **Step 2: Add IPC handlers**

In `src/main/index.ts`, next to the existing `wf:zone:getRouting` / `wf:zone:setRouting` handlers:

```ts
ipcMain.handle('wf:zone:getSlides', (_e, itemId: number): ZoneSlide[] | null =>
  parseZoneSlides(getItemZoneSlides(itemId))
)

ipcMain.handle('wf:zone:setSlides', (_e, itemId: number, slides: ZoneSlide[] | null): void => {
  setItemZoneSlides(itemId, slides ? JSON.stringify(slides) : null)
  // Zone states are computed from the deck, so a live edit must invalidate the
  // pre-resolved scripture cache for this item's track.
  broadcast()
})
```

Import `getItemZoneSlides`, `setItemZoneSlides` from `./db`, and `parseZoneSlides` plus the `ZoneSlide` type from `../shared/zoneSlides`. Check the exact name of the existing broadcast function on disk before calling it.

- [ ] **Step 3: Expose in preload and mock**

In `src/preload/index.ts`, beside `zoneGetRouting` / `zoneSetRouting`:

```ts
  zoneGetSlides: (itemId: number): Promise<ZoneSlide[] | null> =>
    ipcRenderer.invoke('wf:zone:getSlides', itemId),
  zoneSetSlides: (itemId: number, slides: ZoneSlide[] | null): Promise<void> =>
    ipcRenderer.invoke('wf:zone:setSlides', itemId, slides),
```

Import the `ZoneSlide` type. In `src/renderer/src/browserWfMock.ts` add matching stubs:

```ts
    zoneGetSlides: async (): Promise<ZoneSlide[] | null> => null,
    zoneSetSlides: async (): Promise<void> => undefined,
```

- [ ] **Step 4: Verify and commit**

Run: `cd "C:\Dev\worshipflow" && npm run typecheck && npm test`
Expected: typecheck silent; all tests pass.

```bash
cd "C:\Dev\worshipflow" && git add src/main/db.ts src/main/index.ts src/preload/index.ts src/renderer/src/browserWfMock.ts && git commit -m "feat: persist and expose zone slide decks

New nullable service_item.zone_slides column following the same convention
as zone_routing, with get/set IPC mirroring the routing pair.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Live rendering from the deck

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Cache pre-resolved scripture on the track**

`computeZoneStates()` is synchronous and runs as often as every 100ms during auto-advance, while scripture lookup is async and may hit the network. Resolving inline is not an option, so resolve once on load.

Add to the `LiveTrackState` interface, after `hasLiveContent`:

```ts
  // Verse text for every 'scripture' slot in the active item's deck, resolved
  // once at load time and keyed `${slideIndex}:${zoneId}`. computeZoneStates is
  // synchronous and fires every 100ms during auto-advance, so it can never do
  // the lookup itself. A failed lookup simply leaves no entry, and that slot
  // renders black rather than showing a stale verse.
  deckScripture: Map<string, string>
```

Add `deckScripture: new Map()` to `createTrackState()`.

- [ ] **Step 2: Populate the deck on load**

Add a helper near `doLoadSermon`:

```ts
// Fills t.song.lines with one summary per deck slide (so the existing cursor,
// Next/Prev and auto-advance all work unchanged) and pre-resolves every
// scripture slot. Returns false when the item has no deck.
async function loadDeckOnto(track: TrackId, item: ServiceItem, generation: number): Promise<boolean> {
  const slides = parseZoneSlides(getItemZoneSlides(item.id))
  if (!slides) return false
  const t = tracks[track]
  t.deckSlides = slides
  t.deckScripture = new Map()
  t.song = { ...t.song, lines: slides.map(slideSummary) }
  t.index = 0

  for (let i = 0; i < slides.length; i++) {
    for (const zoneId of [1, 2, 3, 4] as ZoneId[]) {
      const slot = resolveSlot(slides, i, zoneId)
      if (slot.kind !== 'scripture' || !slot.reference) continue
      const result = bibleTranslation === 'kjv'
        ? lookupScripture(slot.reference)
        : await fetchScripture(slot.reference, bibleTranslation)
      // The await above may have let something newer load onto this track.
      if (tracks[track].loadGeneration !== generation) return true
      if (result.ok && result.verses) {
        tracks[track].deckScripture.set(`${i}:${zoneId}`, result.verses.map((v) => v.text).join(' '))
      } else {
        logWarn(`[deck] scripture lookup failed for "${slot.reference}" on slide ${i + 1} zone ${zoneId}`)
      }
    }
  }
  return true
}
```

Add `deckSlides: ZoneSlide[] | null` to `LiveTrackState` (default `null` in `createTrackState`), and clear it (`t.deckSlides = null`) in every other `doLoad*` function right where they set `t.song`, so switching to a non-deck item drops the deck.

In `doLoadSermon` and `doLoadText`, after the existing `t.loadGeneration++` and state setup, call:

```ts
  void loadDeckOnto(track, item, t.loadGeneration)
```

Those two loaders will need the `ServiceItem` — check their current signatures and thread the item through from their callers if they only receive primitives.

- [ ] **Step 3: Render the deck per zone**

In `computeZoneStates()`, immediately after `const t = tracks[zoneTrack]`, add a deck branch that takes precedence over the routing path:

```ts
    // An authored deck supplies this zone's content directly — that is the
    // whole point of a deck, so it wins over the item's per-zone routing.
    if (t.deckSlides && t.index < t.deckSlides.length) {
      const slot = resolveSlot(t.deckSlides, t.index, zoneId)
      result[zoneId] = zoneStateFromSlot(slot, t, zoneId, live)
      continue
    }
```

And add the mapping helper beside `computeZoneStates`:

```ts
function zoneStateFromSlot(slot: ZoneSlot, t: LiveTrackState, zoneId: ZoneId, live: LiveState): ZoneState {
  const base = emptyZoneState(live)
  if (slot.kind === 'text') { base.mode = 'text'; base.line = slot.text ?? '' }
  else if (slot.kind === 'scripture') {
    const verse = t.deckScripture.get(`${t.index}:${zoneId}`)
    if (verse) { base.mode = 'text'; base.line = verse; base.title = slot.reference ?? '' }
    else base.mode = 'black'
  }
  else if (slot.kind === 'image') { base.mode = 'image'; base.imagePath = slot.path ?? null }
  else if (slot.kind === 'logo') base.mode = 'logo'
  else base.mode = 'black'
  return base
}
```

Extract the existing `const base: ZoneState = { ... }` literal inside `computeZoneStates` into a reusable `emptyZoneState(live: LiveState): ZoneState` function and have both call sites use it, so the two paths cannot drift.

- [ ] **Step 4: Deck-aware slide count**

In `computeItemSlides`, at the very top, add:

```ts
  const deck = parseZoneSlides(getItemZoneSlides(item.id))
  if (deck) return deck.map(slideSummary)
```

- [ ] **Step 5: Verify and commit**

Run: `cd "C:\Dev\worshipflow" && npm run typecheck && npm test`
Expected: typecheck silent; all tests pass.

```bash
cd "C:\Dev\worshipflow" && git add src/main/index.ts && git commit -m "feat: render authored zone slide decks live

t.song.lines gets one summary per deck slide so Next/Prev, auto-advance and
totals need no change; computeZoneStates reads the deck at t.index for
per-zone content. Scripture slots are pre-resolved on load, honouring the
loadGeneration staleness guard, so the 100ms render path stays synchronous.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: The slide composer editor

**Files:**
- Create: `src/renderer/src/zones/ZoneSlotEditor.tsx`
- Create: `src/renderer/src/zones/ZoneDeckStrip.tsx`
- Modify: `src/renderer/src/zones/ZoneScreenGrid.tsx`
- Modify: `src/renderer/src/zones/ZoneScreenCard.tsx`

- [ ] **Step 1: The slot editor**

Create `src/renderer/src/zones/ZoneSlotEditor.tsx` — a small controlled panel for one zone's slot on the selected slide:

```tsx
import type { ZoneSlot, ZoneSlotKind } from '../../../shared/zoneSlides'

const KINDS: { kind: ZoneSlotKind; label: string }[] = [
  { kind: 'text', label: 'Text' },
  { kind: 'scripture', label: 'Verse' },
  { kind: 'logo', label: 'Logo' },
  { kind: 'black', label: 'Black' },
  { kind: 'same', label: 'Hold' },
]

// One zone's content for one slide. 'Hold' repeats whatever this screen showed
// on the previous slide, which is how a sermon title spans a whole deck
// without being retyped.
export default function ZoneSlotEditor({ slot, onChange }: {
  slot: ZoneSlot
  onChange: (next: ZoneSlot) => void
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1">
        {KINDS.map(({ kind, label }) => (
          <button
            key={kind}
            onClick={() => onChange({ kind })}
            className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${
              slot.kind === kind ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {slot.kind === 'text' && (
        <textarea
          value={slot.text ?? ''}
          onChange={(e) => onChange({ kind: 'text', text: e.target.value })}
          rows={2}
          placeholder="What this screen shows…"
          className="w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-500/50"
        />
      )}
      {slot.kind === 'scripture' && (
        <input
          value={slot.reference ?? ''}
          onChange={(e) => onChange({ kind: 'scripture', reference: e.target.value })}
          placeholder="John 3:16"
          className="w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-500/50"
        />
      )}
    </div>
  )
}
```

Image slots reuse the existing Backgrounds drawer and are not editable here; selecting **Image** without a path renders black until one is set via that drawer. Note this in a comment.

- [ ] **Step 2: The deck strip**

Create `src/renderer/src/zones/ZoneDeckStrip.tsx` — like `ZoneSlideFilmstrip` but for an authored deck, with add and delete:

```tsx
import { Plus, Trash2 } from 'lucide-react'
import type { ZoneSlide } from '../../../shared/zoneSlides'
import { slideSummary } from '../../../shared/zoneSlides'

export default function ZoneDeckStrip({ slides, selected, onSelect, onAdd, onDelete }: {
  slides: ZoneSlide[]
  selected: number
  onSelect: (index: number) => void
  onAdd: () => void
  onDelete: (index: number) => void
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {slides.length} slide{slides.length === 1 ? '' : 's'}
      </span>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {slides.map((slide, i) => (
          <div
            key={i}
            className={`group relative flex h-14 w-24 shrink-0 flex-col justify-between rounded-lg border-2 p-1.5 text-left transition-colors ${
              i === selected ? 'border-blue-500 bg-blue-500/10' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <button onClick={() => onSelect(i)} className="flex-1 text-left">
              <span className="line-clamp-2 text-[9px] leading-tight text-slate-600">{slideSummary(slide) || '—'}</span>
            </button>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-semibold text-slate-400">{i + 1}</span>
              {slides.length > 1 && (
                <button
                  onClick={() => onDelete(i)}
                  aria-label={`Delete slide ${i + 1}`}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Trash2 size={10} className="text-red-500" />
                </button>
              )}
            </div>
          </div>
        ))}
        <button
          onClick={onAdd}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600"
          aria-label="Add slide"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire the deck into the grid**

In `ZoneScreenGrid.tsx`, load the deck for the selected item and, when one exists, render `ZoneDeckStrip` plus a `ZoneSlotEditor` under each card instead of the role palette. Add:

```tsx
  const [deck, setDeck] = useState<ZoneSlide[] | null>(null)
  useEffect(() => { void window.wf.zoneGetSlides(item.id).then(setDeck) }, [item.id])

  const saveDeck = (next: ZoneSlide[] | null): void => {
    setDeck(next)
    void window.wf.zoneSetSlides(item.id, next).then(onChanged)
  }

  const blankSlide = (): ZoneSlide => ({
    zones: { 1: { kind: 'same' }, 2: { kind: 'same' }, 3: { kind: 'same' }, 4: { kind: 'black' } },
  })

  const canDeck = item.type === 'sermon' || item.type === 'text'
```

When `deck` is null and `canDeck`, show a **Build slides** button calling `saveDeck([blankSlide()])`. When `deck` is non-null, render the strip and per-card slot editors, and pass each card `slideText` resolved from the deck via `resolveSlot` so the previews show the authored content.

Keep the existing role/preset UI for every item without a deck — unchanged.

- [ ] **Step 4: Verify and commit**

Run: `cd "C:\Dev\worshipflow" && npm run typecheck && npm test`
Expected: typecheck silent; all tests pass.

```bash
cd "C:\Dev\worshipflow" && git add src/renderer/src/zones/ && git commit -m "feat: slide composer for sermon and text items

Authored decks get a slide strip and a per-zone slot editor, so one slide can
hold a sermon title on Back Left while Back Right shows a different verse.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Build, install, verify

- [ ] **Step 1:** `cd "C:\Dev\worshipflow" && npm run typecheck && npm test` — expect silence, then all tests passing.
- [ ] **Step 2:** `cd "C:\Dev\worshipflow" && npm run dist`. Run it **alone** — never start a second build while one is running, or the installer can be packaged around a half-written `app.asar`.
- [ ] **Step 3:** Confirm the installer is NEWER than its payload before offering it:
  `powershell -Command "Get-Item 'C:\Dev\worshipflow\dist-installer\win-unpacked\resources\app.asar','C:\Dev\worshipflow\dist-installer\WorshipFlow Pro Setup 0.10.0.exe' | Select-Object Name, LastWriteTime, Length"`
  If the `.exe` is older than the `app.asar`, the build raced — rebuild before continuing.
- [ ] **Step 4:** `taskkill //F //IM "WorshipFlow Pro.exe"`, launch the installer, and ask Ryan to click Next → Install → Finish. The Install button runs elevated and cannot be driven by automation. Do NOT open the app while the installer is running.
- [ ] **Step 5:** After the progress bar completes, verify by byte length:
  `powershell -Command "Get-Item 'C:\Dev\worshipflow\dist-installer\win-unpacked\resources\app.asar','C:\Program Files\WorshipFlow Pro\resources\app.asar' | Select-Object LastWriteTime, Length"`
  Both `Length` values must match exactly.
- [ ] **Step 6: Verify in the app.** On a sermon item in Build Service:
  1. A **Build slides** button appears; clicking it creates a one-slide deck.
  2. Add five more slides. Set Back Left on slide 1 to Text "He Is Risen", and Hold on slides 2–6.
  3. Set Back Right to Verse with a different reference on each slide.
  4. The cards preview the authored content, and the strip shows 6 slides.
  5. Send it live and press Next: Back Left stays on the title while Back Right moves to the next verse.
  6. A song item still shows the Phase 1 role grid with no deck UI.
  7. Deleting the deck's last remaining slide is not offered (the strip hides delete at one slide).

---

## Notes for the implementer

- Tailwind must stay on v3.
- Never run a dev server; verification is through the built installer only.
- `ZoneScreenGrid` is getting large. If it passes roughly 200 lines, split the deck-mode branch into its own `ZoneDeckComposer.tsx` rather than letting one component own both modes.
- An item with no deck must behave exactly as it does today — that is the safety property that makes this shippable.
