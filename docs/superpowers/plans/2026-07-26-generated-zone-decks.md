# Generated Zone Decks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sermon readings and announcement blocks lay themselves out across the four sanctuary screens with no weekly authoring — context held on Back Left, content advancing on Back Right and the stage monitors, logo on the Lyrics TVs.

**Architecture:** The deck engine already does all of this; decks just had to be hand-authored. `loadDeckOnto` gains a fallback that *generates* a deck from the item when none is stored, so a hand-authored deck still wins and no rendering path changes.

**Tech Stack:** TypeScript, Electron 33, React 18, vitest 4.

**Spec:** `docs/superpowers/specs/2026-07-26-generated-zone-decks-design.md`

---

## Orientation

Read this first; it will save you an hour.

**A "deck" is per-slide, per-zone content.** `src/shared/zoneSlides.ts` defines
`ZoneSlide { zones: Record<ZoneId, ZoneSlot> }`. `resolveSlot(slides, index, zoneId)`
walks a `same` chain back to the nearest real slot, which is how one screen holds
a title while another advances.

**Where a deck is used at runtime:**
- `loadDeckOnto` (`src/main/index.ts:1069`) loads it, builds `t.song.lines` from
  slide summaries, and pre-resolves every `scripture` slot into
  `t.deckScripture`, keyed `` `${slideIndex}:${zoneId}` ``.
- `computeZoneStates` (`src/main/index.ts:692`) prefers the deck over per-item
  routing, but a **pin still beats the deck**.
- `zoneStateFromSlot` (`src/main/index.ts:805`) turns one resolved slot into a
  `ZoneState`.

**Zone ids:** 1 = Back Left, 2 = Back Right, 3 = Lyrics TVs, 4 = Stage Monitors
(`ZONE_NAMES` in `src/shared/types.ts`).

**Why the stage monitors matter here:** the stage template's default branch
(`src/main/zoneHtml.ts:711`) renders `state.line` large *plus* a `state.next`
preview. The pastor reads from that screen. The deck path currently sets `line`
and never `next`, so Task 4 adds it — without that, the preview line is blank and
the monitor is half useless.

**Commands:**

```bash
npm test              # vitest run
npm run typecheck     # the real gate — run before every commit
npm run dev           # electron-vite dev
```

---

## File Structure

**New:**

| File | Responsibility |
|---|---|
| `src/shared/chunkText.ts` | Auto-fit splitting. Pure, no I/O. The module that decides whether readings look natural. |
| `src/shared/chunkText.test.ts` | Tests for the above. |
| `src/main/autoDeck.ts` | Builds `ZoneSlide[]` from an item. Dependencies injected so it tests without network or DB. |
| `src/main/autoDeck.test.ts` | Tests for the above. |

**Modified:**

| File | Change |
|---|---|
| `src/shared/zoneSlides.ts` | New `sermon` slot kind. |
| `src/shared/zoneSlides.test.ts` | Cover the new kind. |
| `src/main/index.ts` | `loadDeckOnto` fallback; `sermon` slot → ZoneState; populate `next`; chunk-budget setting. |
| `src/renderer/src/zones/ZoneScreenGrid.tsx` | `canDeck` gains `announcement`. |
| `src/renderer/src/AnnouncementItemEditor.tsx` | Multi-select block. |

Ordered so each task leaves the app working and tests green.

---

## Task 1: The auto-fit splitter

Pure functions, no dependencies. Everything else builds on these.

**Files:**
- Create: `src/shared/chunkText.ts`
- Test: `src/shared/chunkText.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/shared/chunkText.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { chunkVerses, chunkProse } from './chunkText'
import type { ScriptureVerse } from './types'

const v = (n: number, text: string): ScriptureVerse => ({ n, text })

describe('chunkVerses', () => {
  it('groups whole verses up to the budget', () => {
    const verses = [v(1, 'aaaa'), v(2, 'bbbb'), v(3, 'cccc')]
    // 'aaaa' + 'bbbb' = 8 fits in 10; adding 'cccc' would be 12, so it starts a new chunk.
    expect(chunkVerses(verses, 10)).toEqual([{ from: 1, to: 2 }, { from: 3, to: 3 }])
  })

  it('never splits a verse, even one longer than the budget', () => {
    const verses = [v(1, 'x'.repeat(50))]
    expect(chunkVerses(verses, 10)).toEqual([{ from: 1, to: 1 }])
  })

  it('puts an over-long verse in its own chunk without swallowing neighbours', () => {
    const verses = [v(1, 'aa'), v(2, 'x'.repeat(50)), v(3, 'bb')]
    expect(chunkVerses(verses, 10)).toEqual([
      { from: 1, to: 1 }, { from: 2, to: 2 }, { from: 3, to: 3 }
    ])
  })

  it('covers every verse exactly once, contiguously', () => {
    const verses = Array.from({ length: 12 }, (_, i) => v(i + 1, 'word '.repeat(10)))
    const chunks = chunkVerses(verses, 120)
    expect(chunks[0].from).toBe(1)
    expect(chunks[chunks.length - 1].to).toBe(12)
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].from).toBe(chunks[i - 1].to + 1)
    }
  })

  it('returns nothing for no verses', () => {
    expect(chunkVerses([], 100)).toEqual([])
  })

  it('uses real verse numbers, not array positions', () => {
    const verses = [v(16, 'aaaa'), v(17, 'bbbb')]
    expect(chunkVerses(verses, 100)).toEqual([{ from: 16, to: 17 }])
  })
})

describe('chunkProse', () => {
  it('keeps short text as one chunk', () => {
    expect(chunkProse('Potluck is Sunday.', 100)).toEqual(['Potluck is Sunday.'])
  })

  it('splits on paragraph breaks first', () => {
    const text = 'First para.\n\nSecond para.'
    expect(chunkProse(text, 20)).toEqual(['First para.', 'Second para.'])
  })

  it('never splits mid-sentence', () => {
    const text = 'One two three. Four five six. Seven eight nine.'
    for (const chunk of chunkProse(text, 20)) {
      expect(chunk.trim()).toMatch(/[.!?]$/)
    }
  })

  it('puts an over-long sentence in its own chunk rather than cutting it', () => {
    const long = 'word '.repeat(40).trim() + '.'
    expect(chunkProse(long, 20)).toEqual([long])
  })

  it('returns nothing for empty or whitespace-only text', () => {
    expect(chunkProse('', 100)).toEqual([])
    expect(chunkProse('   \n  ', 100)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run chunkText`
Expected: FAIL — `Cannot find module './chunkText'`

- [ ] **Step 3: Implement**

Create `src/shared/chunkText.ts`:

```ts
// Auto-fit splitting for zone decks. Pure: no I/O, no Electron.
//
// The rule that matters is what we never do — never split a verse, never split a
// sentence. A screen holding half a thought reads worse than a screen holding
// slightly too much, so a unit longer than the budget gets its own slide rather
// than being cut.

import type { ScriptureVerse } from './types'

export interface VerseRange {
  from: number
  to: number
}

/** Group whole verses into ranges that fit `budget` characters. */
export function chunkVerses(verses: ScriptureVerse[], budget: number): VerseRange[] {
  const out: VerseRange[] = []
  let start: ScriptureVerse | null = null
  let end: ScriptureVerse | null = null
  let length = 0

  const flush = (): void => {
    if (start && end) out.push({ from: start.n, to: end.n })
    start = null; end = null; length = 0
  }

  for (const verse of verses) {
    const size = verse.text.length
    // Start a new chunk when this verse would overflow the current one. An
    // over-long verse lands alone because the chunk before it is flushed and the
    // one after it overflows immediately.
    if (start && length + size > budget) flush()
    if (!start) start = verse
    end = verse
    length += size
  }
  flush()
  return out
}

const SENTENCE_END = /(?<=[.!?])\s+/

/** Split prose into chunks that fit `budget`, breaking at paragraphs then sentences. */
export function chunkProse(text: string, budget: number): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const out: string[] = []

  for (const paragraph of paragraphs) {
    if (paragraph.length <= budget) {
      out.push(paragraph)
      continue
    }
    let current = ''
    for (const sentence of paragraph.split(SENTENCE_END)) {
      const piece = sentence.trim()
      if (!piece) continue
      if (current && current.length + 1 + piece.length > budget) {
        out.push(current)
        current = piece
      } else {
        current = current ? `${current} ${piece}` : piece
      }
    }
    if (current) out.push(current)
  }
  return out
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run chunkText`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/chunkText.ts src/shared/chunkText.test.ts
git commit -m "feat: auto-fit text splitting for zone decks

Never splits a verse or a sentence — an over-long unit gets its own slide
rather than being cut, because half a thought on screen reads worse than
slightly too much."
```

---

## Task 2: The `sermon` slot kind

Lets Back Left use the designed sermon card during a reading instead of plain text.

**Files:**
- Modify: `src/shared/zoneSlides.ts:7`, `:42-48`
- Test: `src/shared/zoneSlides.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/shared/zoneSlides.test.ts`:

```ts
describe('sermon slot kind', () => {
  const deck: ZoneSlide[] = [
    { zones: {
        1: { kind: 'sermon', text: 'The Prodigal Son', reference: 'Luke 15:11-13' },
        2: { kind: 'scripture', reference: 'Luke 15:11-13' },
        3: { kind: 'logo' },
        4: { kind: 'scripture', reference: 'Luke 15:11-13' },
    } },
    { zones: {
        1: { kind: 'sermon', text: 'The Prodigal Son', reference: 'Luke 15:14-16' },
        2: { kind: 'scripture', reference: 'Luke 15:14-16' },
        3: { kind: 'same' },
        4: { kind: 'scripture', reference: 'Luke 15:14-16' },
    } },
  ]

  it('validates a deck containing sermon slots', () => {
    expect(validateZoneSlides(deck)).toBe(true)
  })

  it('resolves a sermon slot as itself', () => {
    expect(resolveSlot(deck, 1, 1)).toEqual({
      kind: 'sermon', text: 'The Prodigal Son', reference: 'Luke 15:14-16'
    })
  })

  it('holds a sermon slot through a same chain', () => {
    const held: ZoneSlide[] = [
      { zones: { 1: { kind: 'sermon', text: 'T', reference: 'R' }, 2: { kind: 'black' }, 3: { kind: 'black' }, 4: { kind: 'black' } } },
      { zones: { 1: { kind: 'same' }, 2: { kind: 'black' }, 3: { kind: 'black' }, 4: { kind: 'black' } } },
    ]
    expect(resolveSlot(held, 1, 1)).toEqual({ kind: 'sermon', text: 'T', reference: 'R' })
  })

  it('summarises a sermon slot by its title', () => {
    const slide: ZoneSlide = { zones: {
      1: { kind: 'sermon', text: 'The Prodigal Son', reference: 'Luke 15' },
      2: { kind: 'black' }, 3: { kind: 'black' }, 4: { kind: 'black' },
    } }
    expect(slideSummary(slide)).toBe('The Prodigal Son')
  })

  it('still rejects an unknown kind', () => {
    const bad = [{ zones: { 1: { kind: 'nope' }, 2: { kind: 'black' }, 3: { kind: 'black' }, 4: { kind: 'black' } } }]
    expect(validateZoneSlides(bad)).toBe(false)
  })
})
```

Make sure the file's import line includes everything used above:

```ts
import { resolveSlot, slideSummary, validateZoneSlides, parseZoneSlides } from './zoneSlides'
import type { ZoneSlide } from './zoneSlides'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run zoneSlides`
Expected: FAIL — `validateZoneSlides` rejects `sermon`.

- [ ] **Step 3: Add the kind**

In `src/shared/zoneSlides.ts`, line 7:

```ts
export type ZoneSlotKind = 'slide' | 'text' | 'scripture' | 'logo' | 'black' | 'image' | 'same' | 'sermon'
```

Line 22:

```ts
const KINDS: ZoneSlotKind[] = ['slide', 'text', 'scripture', 'logo', 'black', 'image', 'same', 'sermon']
```

And in `slotText`, so summaries and the slide grid read sensibly — a sermon slot
carries its title in `text` and the passage in `reference`:

```ts
function slotText(slot: ZoneSlot | undefined, source: string[] = []): string {
  if (!slot) return ''
  if (slot.kind === 'slide') return source[slot.index ?? -1] ?? ''
  if (slot.kind === 'text') return slot.text ?? ''
  if (slot.kind === 'sermon') return slot.text ?? ''
  if (slot.kind === 'scripture') return slot.reference ?? ''
  return ''
}
```

Update the `ZoneSlot` field comments so the reuse is obvious:

```ts
export interface ZoneSlot {
  kind: ZoneSlotKind
  index?: number      // kind 'slide' — into the item's own resolved source slides
  text?: string       // kind 'text', and the title for kind 'sermon'
  reference?: string  // kind 'scripture', and the passage for kind 'sermon'
  path?: string       // kind 'image'
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run zoneSlides`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS. If a switch over `ZoneSlotKind` errors elsewhere, add a `sermon`
branch there that behaves like `text`; Task 4 gives it its real rendering.

- [ ] **Step 6: Commit**

```bash
git add src/shared/zoneSlides.ts src/shared/zoneSlides.test.ts
git commit -m "feat: sermon slot kind for zone decks

Lets a deck put the designed sermon card on a screen. Additive — existing
decks contain no sermon slots and are unaffected."
```

---

## Task 3: Deck generation

Builds `ZoneSlide[]` from an item. Dependencies are injected so this tests
without a network or a database.

**Files:**
- Create: `src/main/autoDeck.ts`
- Test: `src/main/autoDeck.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/main/autoDeck.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { autoDeckFor } from './autoDeck'
import type { AutoDeckDeps } from './autoDeck'
import type { ServiceItem } from '../shared/types'

const item = (over: Partial<ServiceItem>): ServiceItem => ({
  id: 1, ordinal: 0, type: 'sermon', ref_id: null, payload: {},
  title: 'Item', notes: null, style: null, zoneRouting: null, track: 'main',
  ...over,
})

const deps = (over: Partial<AutoDeckDeps> = {}): AutoDeckDeps => ({
  budget: 20,
  lookupScripture: async () => ({
    ok: true,
    reference: 'John 3:16-18',
    verses: [
      { n: 16, text: 'aaaaaaaa' },
      { n: 17, text: 'bbbbbbbb' },
      { n: 18, text: 'cccccccc' },
    ],
  }),
  getAnnouncement: async () => null,
  ...over,
})

describe('autoDeckFor — sermon', () => {
  it('emits one slide per chunk, with sub-references', async () => {
    const deck = await autoDeckFor(
      item({ type: 'sermon', payload: { title: 'The Gift', passage: 'John 3:16-18' } }),
      deps()
    )
    expect(deck).not.toBeNull()
    expect(deck!.length).toBe(2) // 8+8=16 fits 20; the third verse starts a new chunk
    expect(deck![0].zones[2]).toEqual({ kind: 'scripture', reference: 'John 3:16-17' })
    expect(deck![1].zones[2]).toEqual({ kind: 'scripture', reference: 'John 3:18' })
  })

  it('holds the title on Back Left with the current reference', async () => {
    const deck = await autoDeckFor(
      item({ type: 'sermon', payload: { title: 'The Gift', passage: 'John 3:16-18' } }),
      deps()
    )
    expect(deck![0].zones[1]).toEqual({ kind: 'sermon', text: 'The Gift', reference: 'John 3:16-17' })
    expect(deck![1].zones[1]).toEqual({ kind: 'sermon', text: 'The Gift', reference: 'John 3:18' })
  })

  it('puts the words on the stage monitor and the logo on the Lyrics TVs', async () => {
    const deck = await autoDeckFor(
      item({ type: 'sermon', payload: { title: 'The Gift', passage: 'John 3:16-18' } }),
      deps()
    )
    expect(deck![0].zones[4]).toEqual({ kind: 'scripture', reference: 'John 3:16-17' })
    expect(deck![0].zones[3]).toEqual({ kind: 'logo' })
  })

  it('returns null when the sermon has no passage', async () => {
    expect(await autoDeckFor(item({ type: 'sermon', payload: { title: 'X' } }), deps())).toBeNull()
  })

  it('returns null when the lookup fails', async () => {
    const d = deps({ lookupScripture: async () => ({ ok: false, error: 'not found' }) })
    expect(await autoDeckFor(item({ type: 'sermon', payload: { passage: 'Nope 1:1' } }), d)).toBeNull()
  })

  it('falls back to the item title when the payload has none', async () => {
    const deck = await autoDeckFor(
      item({ type: 'sermon', title: 'Fallback', payload: { passage: 'John 3:16-18' } }),
      deps()
    )
    expect(deck![0].zones[1].text).toBe('Fallback')
  })
})

describe('autoDeckFor — announcement block', () => {
  const withAnnouncements = (bodies: Record<number, string>): AutoDeckDeps =>
    deps({
      getAnnouncement: async (id) =>
        bodies[id] === undefined ? null : { id, title: `A${id}`, body: bodies[id] },
    })

  it('walks the announcements in the order given', async () => {
    const deck = await autoDeckFor(
      item({ type: 'announcement', payload: { refIds: [2, 1] } }),
      withAnnouncements({ 1: 'One.', 2: 'Two.' })
    )
    expect(deck!.map((s) => s.zones[2].text)).toEqual(['Two.', 'One.'])
  })

  it('holds the heading on Back Left for the whole block', async () => {
    const deck = await autoDeckFor(
      item({ type: 'announcement', payload: { refIds: [1, 2] } }),
      withAnnouncements({ 1: 'One.', 2: 'Two.' })
    )
    expect(deck![0].zones[1]).toEqual({ kind: 'text', text: 'Announcements' })
    expect(deck![1].zones[1]).toEqual({ kind: 'same' })
  })

  it('mirrors the text onto the stage monitor', async () => {
    const deck = await autoDeckFor(
      item({ type: 'announcement', payload: { refIds: [1] } }),
      withAnnouncements({ 1: 'One.' })
    )
    expect(deck![0].zones[4]).toEqual({ kind: 'text', text: 'One.' })
    expect(deck![0].zones[3]).toEqual({ kind: 'logo' })
  })

  it('splits a long announcement across slides', async () => {
    const deck = await autoDeckFor(
      item({ type: 'announcement', payload: { refIds: [1] } }),
      withAnnouncements({ 1: 'Aaaa bbbb cccc. Dddd eeee ffff. Gggg hhhh iiii.' })
    )
    expect(deck!.length).toBeGreaterThan(1)
  })

  it('skips a missing announcement without losing the rest', async () => {
    const deck = await autoDeckFor(
      item({ type: 'announcement', payload: { refIds: [1, 99, 2] } }),
      withAnnouncements({ 1: 'One.', 2: 'Two.' })
    )
    expect(deck!.map((s) => s.zones[2].text)).toEqual(['One.', 'Two.'])
  })

  it('reads a single ref_id when there is no refIds array', async () => {
    const deck = await autoDeckFor(
      item({ type: 'announcement', ref_id: 1, payload: {} }),
      withAnnouncements({ 1: 'One.' })
    )
    expect(deck!.map((s) => s.zones[2].text)).toEqual(['One.'])
  })

  it('returns null when nothing resolves', async () => {
    const deck = await autoDeckFor(
      item({ type: 'announcement', payload: { refIds: [99] } }),
      withAnnouncements({})
    )
    expect(deck).toBeNull()
  })
})

describe('autoDeckFor — other types', () => {
  it('returns null for a song', async () => {
    expect(await autoDeckFor(item({ type: 'song', ref_id: 5 }), deps())).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run autoDeck`
Expected: FAIL — `Cannot find module './autoDeck'`

- [ ] **Step 3: Implement**

Create `src/main/autoDeck.ts`:

```ts
/**
 * Builds a zone deck from a service item, so a sermon reading or an
 * announcement block lays itself out without weekly authoring.
 *
 * Dependencies are injected rather than imported: this needs a scripture lookup
 * and the announcements table, and taking them as arguments keeps the module
 * testable without a network or a database.
 *
 * Returning null means "no generated deck" — the item then behaves exactly as it
 * did before this feature existed. That is the safe outcome for every failure.
 */
import type { ScriptureResult, ServiceItem, ZoneId } from '../shared/types'
import type { ZoneSlide, ZoneSlot } from '../shared/zoneSlides'
import { chunkProse, chunkVerses } from '../shared/chunkText'

export interface AutoDeckAnnouncement {
  id: number
  title: string
  body: string
}

export interface AutoDeckDeps {
  budget: number
  lookupScripture: (reference: string) => Promise<ScriptureResult>
  getAnnouncement: (id: number) => Promise<AutoDeckAnnouncement | null>
}

const LOGO: ZoneSlot = { kind: 'logo' }

function slide(z1: ZoneSlot, z2: ZoneSlot, z3: ZoneSlot, z4: ZoneSlot): ZoneSlide {
  return { zones: { 1: z1, 2: z2, 3: z3, 4: z4 } as Record<ZoneId, ZoneSlot> }
}

/** "John 3" from "John 3:16-18" — the book/chapter part a sub-reference reuses. */
function bookChapter(reference: string): string | null {
  const match = reference.match(/^(.*?)\s*:\s*\d/)
  return match ? match[1].trim() : null
}

function subReference(reference: string, from: number, to: number): string {
  const base = bookChapter(reference)
  if (!base) return reference
  return from === to ? `${base}:${from}` : `${base}:${from}-${to}`
}

async function sermonDeck(item: ServiceItem, deps: AutoDeckDeps): Promise<ZoneSlide[] | null> {
  const passage = (item.payload.passage as string | undefined)?.trim()
  if (!passage) return null

  const result = await deps.lookupScripture(passage)
  if (!result.ok || !result.verses?.length) return null

  const title = ((item.payload.title as string | undefined) || item.title || '').trim()
  const ranges = chunkVerses(result.verses, deps.budget)
  if (!ranges.length) return null

  return ranges.map((range) => {
    const reference = subReference(result.reference ?? passage, range.from, range.to)
    const verse: ZoneSlot = { kind: 'scripture', reference }
    // Back Left keeps the designed card up and moves its reference along with
    // the reading; the stage monitor carries the same words the pastor reads.
    return slide({ kind: 'sermon', text: title, reference }, verse, LOGO, verse)
  })
}

async function announcementDeck(item: ServiceItem, deps: AutoDeckDeps): Promise<ZoneSlide[] | null> {
  const fromPayload = item.payload.refIds
  const ids = Array.isArray(fromPayload)
    ? fromPayload.filter((n): n is number => typeof n === 'number')
    : item.ref_id != null ? [item.ref_id] : []
  if (!ids.length) return null

  const slides: ZoneSlide[] = []
  for (const id of ids) {
    const announcement = await deps.getAnnouncement(id)
    // A deleted announcement drops out; the rest of the block still works.
    if (!announcement) continue
    for (const chunk of chunkProse(announcement.body ?? '', deps.budget)) {
      const text: ZoneSlot = { kind: 'text', text: chunk }
      // The heading is authored once and held by 'same' for the whole block.
      const heading: ZoneSlot = slides.length === 0
        ? { kind: 'text', text: 'Announcements' }
        : { kind: 'same' }
      slides.push(slide(heading, text, LOGO, text))
    }
  }
  return slides.length ? slides : null
}

export async function autoDeckFor(item: ServiceItem, deps: AutoDeckDeps): Promise<ZoneSlide[] | null> {
  if (item.type === 'sermon') return sermonDeck(item, deps)
  if (item.type === 'announcement') return announcementDeck(item, deps)
  return null
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run autoDeck`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/autoDeck.ts src/main/autoDeck.test.ts
git commit -m "feat: generate zone decks from sermon and announcement items

Dependencies injected so generation tests without a network or database.
Every failure path returns null, which means the item behaves exactly as
it did before — never a deck of blank slides."
```

---

## Task 4: Wire generation into the runtime

**Files:**
- Modify: `src/main/index.ts` — `loadDeckOnto` (:1069), `zoneStateFromSlot` (:805)

- [ ] **Step 1: Add the chunk-budget setting**

Near `livecallToken()` in `src/main/index.ts`:

```ts
// Characters per generated slide. The right number depends on the physical
// screens and how far back the room sits, so it is a setting rather than a
// constant someone guessed at a desk.
function zoneChunkBudget(): number {
  const raw = parseInt(getSetting('zone_chunk_budget') ?? '', 10)
  return Number.isFinite(raw) && raw > 0 ? raw : 300
}
```

- [ ] **Step 2: Fall back to generation in `loadDeckOnto`**

Replace the first two lines of `loadDeckOnto` (`src/main/index.ts:1070-1071`):

```ts
  const slides = parseZoneSlides(getItemZoneSlides(item.id))
  if (!slides) return false
```

with:

```ts
  // A hand-authored deck always wins; generation only fills the gap where there
  // isn't one, so nothing anyone built in the composer changes behaviour.
  const slides = parseZoneSlides(getItemZoneSlides(item.id)) ?? await autoDeckFor(item, {
    budget: zoneChunkBudget(),
    lookupScripture: (reference) => bibleTranslation === 'kjv'
      ? Promise.resolve(lookupScripture(reference))
      : fetchScripture(reference, bibleTranslation),
    getAnnouncement: async (id) => {
      const a = getAnnouncement(id)
      return a ? { id: a.id, title: a.title, body: a.body } : null
    },
  })
  if (!slides) return false
```

Add the import at the top of `src/main/index.ts`:

```ts
import { autoDeckFor } from './autoDeck'
```

`getAnnouncement(id: number): Announcement | null` already exists at
`src/main/db.ts:477` and returns `{ id, title, body, ... }`, so the mapping above
is a straight narrowing. Add it to the existing `./db` import list in
`src/main/index.ts` if it isn't there yet. It is synchronous — the `async` on the
dep is only so the interface can accommodate a lookup that isn't.

- [ ] **Step 3: Render the `sermon` slot and populate `next`**

Replace `zoneStateFromSlot` (`src/main/index.ts:805-831`) with:

```ts
function zoneStateFromSlot(slot: ZoneSlot, t: LiveTrackState, zoneId: ZoneId, live: LiveState): ZoneState {
  const base = emptyZoneState(live)
  if (slot.kind === 'slide') {
    base.mode = 'text'
    base.line = t.deckSource[slot.index ?? -1] ?? ''
  } else if (slot.kind === 'text') {
    base.mode = 'text'
    base.line = slot.text ?? ''
  } else if (slot.kind === 'sermon') {
    // The designed title card. Speaker is deliberately null — during a reading
    // the room needs the title and where we are, not who is preaching.
    base.mode = 'sermon'
    base.title = slot.text ?? ''
    base.speaker = null
    base.passage = slot.reference ?? null
  } else if (slot.kind === 'scripture') {
    // Keyed by the CURRENT slide's own index, not wherever the slot was
    // originally authored — loadDeckOnto pre-populates the cache for every
    // resolved index (including ones only reached via a 'same' chain), so
    // this always has a matching entry when a lookup for this reference
    // succeeded at load time.
    const verse = t.deckScripture.get(`${t.index}:${zoneId}`)
    if (verse) { base.mode = 'text'; base.line = verse; base.title = slot.reference ?? '' }
    else base.mode = 'black'   // lookup failed — better blank than a stale verse
  } else if (slot.kind === 'image') {
    base.mode = 'image'
    base.imagePath = slot.path ?? null
  } else if (slot.kind === 'logo') {
    base.mode = 'logo'
  } else {
    base.mode = 'black'
  }

  // The stage monitor renders a next-line preview under the current text, and
  // it is the screen the pastor reads from — without this it sits empty and the
  // monitor is half useless. Costs nothing on the other zones.
  base.next = deckNextText(t, zoneId)
  return base
}

// What this zone will show on the following slide, as plain text. Returns ''
// at the end of the deck, and for slots that have no text to preview.
function deckNextText(t: LiveTrackState, zoneId: ZoneId): string {
  if (!t.deckSlides) return ''
  const nextIndex = t.index + 1
  if (nextIndex >= t.deckSlides.length) return ''
  const slot = resolveSlot(t.deckSlides, nextIndex, zoneId)
  if (slot.kind === 'text' || slot.kind === 'sermon') return slot.text ?? ''
  if (slot.kind === 'slide') return t.deckSource[slot.index ?? -1] ?? ''
  if (slot.kind === 'scripture') return t.deckScripture.get(`${nextIndex}:${zoneId}`) ?? ''
  return ''
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — all existing tests plus the new ones.

- [ ] **Step 6: Verify by hand**

Run `npm run dev`. Add a sermon item with title "The Gift" and passage
"John 3:16-18", take it live, and open `http://localhost:<port>/multiview`.

Expected: Back Left shows the designed card reading "The Gift" with "John 3:16-17"
underneath; Back Right shows those verses; the stage monitor shows the same
verses with the next chunk previewed beneath; the Lyrics TVs show the logo.
Press Next: Back Left's reference becomes "John 3:18" and the other screens
advance.

- [ ] **Step 7: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: generated decks drive the screens

loadDeckOnto falls back to generation when no deck is stored, the sermon
slot renders the designed card, and deck slides now populate `next` so the
stage monitor's preview line works — it was always blank on the deck path,
which is the line the pastor reads ahead from."
```

---

## Task 5: Announcement blocks

**Files:**
- Modify: `src/renderer/src/AnnouncementItemEditor.tsx`
- Modify: `src/renderer/src/zones/ZoneScreenGrid.tsx:55`

- [ ] **Step 1: Read the current editor**

Read `src/renderer/src/AnnouncementItemEditor.tsx` in full. It currently takes a
single `refId` and renders one picker. You are turning it into a multi-select
that writes `payload.refIds: number[]`.

- [ ] **Step 2: Make it a block editor**

Replace `src/renderer/src/AnnouncementItemEditor.tsx` with:

```tsx
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { AnnouncementSummary } from '../../shared/types'

/**
 * Picks the announcements in one block, in the order the pastor reads them.
 *
 * Selection order IS reading order, so this keeps its own ordered array rather
 * than deriving it from the library list.
 */
export default function AnnouncementItemEditor({
  refId, refIds, onChange,
}: {
  refId: number | null
  refIds: number[]
  onChange: (refIds: number[]) => void
}): JSX.Element {
  const [library, setLibrary] = useState<AnnouncementSummary[]>([])

  useEffect(() => {
    void window.wf.announcementsList('').then(setLibrary).catch(() => setLibrary([]))
  }, [])

  // Seeding rule: an existing single-announcement item has no refIds, so fall
  // back to its ref_id. This is what keeps every already-built service
  // rendering exactly as it does today.
  const selected = refIds.length ? refIds : refId != null ? [refId] : []

  const toggle = (id: number): void => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  const move = (index: number, delta: number): void => {
    const next = [...selected]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  const titleOf = (id: number): string =>
    library.find((a) => a.id === id)?.title ?? `#${id}`

  return (
    <div className="space-y-3">
      <div>
        <div className="section-header mb-2">Reading order</div>
        {selected.length === 0 ? (
          <p className="text-[11px] text-slate-400">Nothing picked yet.</p>
        ) : (
          <ol className="space-y-1">
            {selected.map((id, i) => (
              <li key={id} className="flex items-center gap-2 rounded border border-slate-200 px-2 py-1.5 text-[12px]">
                <span className="w-4 text-right text-slate-400">{i + 1}</span>
                <span className="flex-1 truncate">{titleOf(id)}</span>
                <button aria-label="Move up" disabled={i === 0}
                  onClick={() => move(i, -1)}
                  className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
                  <ChevronUp size={14} />
                </button>
                <button aria-label="Move down" disabled={i === selected.length - 1}
                  onClick={() => move(i, 1)}
                  className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
                  <ChevronDown size={14} />
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div>
        <div className="section-header mb-2">Announcements library</div>
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {library.map((a) => (
            <label key={a.id} className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggle(a.id)} />
              <span className="truncate">{a.title}</span>
              {a.expired && <span className="text-[10px] text-amber-600">expired</span>}
            </label>
          ))}
        </div>
      </div>

      <p className="text-[11px] leading-snug text-slate-400">
        {selected.length === 1
          ? 'One announcement.'
          : `${selected.length} announcements — Next walks through them one at a time.`}
      </p>
    </div>
  )
}
```

`window.wf.announcementsList(search?)` already exists
(`src/preload/index.ts:57`) and returns `AnnouncementSummary[]`, so the call
above is correct as written. Check that `AnnouncementSummary` actually carries
`expired`; if it doesn't, drop that badge rather than inventing a field.

- [ ] **Step 3: Save into the payload**

In `src/renderer/src/ItemEditor.tsx`, where `announcement` is routed
(`item.type === 'announcement'`), pass the payload through and save:

```tsx
{item.type === 'announcement' && (
  <AnnouncementItemEditor
    refId={item.ref_id}
    refIds={(payload.refIds as number[] | undefined) ?? []}
    onChange={(refIds) => savePayload({ ...payload, refIds })}
  />
)}
```

- [ ] **Step 4: Let the composer override a generated deck**

In `src/renderer/src/zones/ZoneScreenGrid.tsx:55`:

```ts
// Announcements join sermon and text: a block has many things to say per
// screen, which is exactly what a deck expresses.
const canDeck = item.type === 'sermon' || item.type === 'text' || item.type === 'announcement'
```

- [ ] **Step 5: Typecheck and test**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 6: Verify by hand**

Run `npm run dev`. Add an Announcement item, tick three announcements, make one
of them several sentences long, and take it live.

Expected: Back Left holds "Announcements" for the whole block; Back Right walks
the announcements in the order shown; the long one occupies more than one slide;
the stage monitor mirrors the text with a preview; the Lyrics TVs hold the logo.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/AnnouncementItemEditor.tsx src/renderer/src/ItemEditor.tsx src/renderer/src/zones/ZoneScreenGrid.tsx
git commit -m "feat: announcement blocks

One item covers the segment the pastor reads. A single selection behaves
exactly as before, so existing services are untouched."
```

---

## Task 6: Regression pass

The riskiest thing here is changing a path every existing service already uses.

- [ ] **Step 1: A saved hand-authored deck still wins**

Open a service item that already has a deck in the composer, take it live, and
confirm it renders exactly as before — generation must not run for it.

- [ ] **Step 2: A sermon with no passage is unchanged**

Take a sermon item with no passage live. Expected: the designed card on the back
screens, logo on the Lyrics TVs, exactly as before this change.

- [ ] **Step 3: Songs and scripture items are unchanged**

Take a song and a scripture item live. Expected: no behaviour change at all.

- [ ] **Step 4: A pin still beats a generated deck**

With a generated deck live, pin a screen to something else. Expected: the pin
wins — it sits above the deck in the precedence chain.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A src
git commit -m "fix: regressions found in generated-deck verification"
```

---

## Known gaps after this plan

- **The pre-service announcement loop** on the Lyrics TVs is a separate build,
  per the spec. This plan covers only the in-service, manually-advanced segment.
- **No auto-advance** for in-service announcements. The pastor sets the pace.
- **The chunk budget default (300) is a guess.** It is a setting precisely
  because it needs tuning against the real screens; expect to change it after the
  first Sunday, and there is no UI for it yet — it is set directly in settings.
