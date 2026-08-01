# Generated zone decks — design

Two service segments where the screens should each do a different job:

- **Sermon reading.** Back Left holds the sermon title and the reference being
  read. Back Right shows the verse text. Stage monitors show the same words so
  the pastor can read from them. Lyrics TVs hold the logo.
- **Announcements.** Back Left holds the word "Announcements" for the whole
  block. Back Right walks through the announcements. Stage monitors show the
  same text so the pastor can read from them. Lyrics TVs hold the logo.

In both cases Next advances the content screens while the context screen stays
put.

## The engine already exists

`src/shared/zoneSlides.ts` defines exactly this: a deck of slides where each
slide names a `ZoneSlot` per zone, and `resolveSlot` walks a `same` chain back
to the nearest real slot so a title spanning six slides is authored once. Its own
doc comment describes the target feature — "Back Left holding a sermon title
while Back Right cycles verses." `loadDeckOnto` (`src/main/index.ts:1069`) loads
a deck, pre-resolves every `scripture` slot, and feeds `computeZoneStates`.

Nothing about the rendering path needs to change. Two things block the feature:

1. **Decks must be hand-authored.** `loadDeckOnto` reads a stored deck and
   returns false when there isn't one. Building a reading verse by verse in the
   composer every week is not something anyone will keep doing.
2. **Only two item types can have one.** `ZoneScreenGrid.tsx:55` reads
   `canDeck = item.type === 'sermon' || item.type === 'text'`, so the composer
   never appears for an announcement.

## Approach: generate the deck, let a stored one win

`loadDeckOnto` falls back to generating a deck from the item when none is stored.
A hand-authored deck always takes precedence, so the composer stays an override
and every existing saved deck behaves exactly as it does today.

This keeps one code path for rendering, one for resolution, and one for scripture
caching. The new code is confined to *producing* `ZoneSlide[]`.

## Layouts

**Sermon reading** — one slide per chunk of the passage:

| Back Left | Back Right | Lyrics TVs | Stage Monitors |
|---|---|---|---|
| designed sermon card: title + this chunk's reference | verse text | logo | verse text + next chunk preview |

No speaker on the card. Back Left's reference updates as the reading advances.

**Announcements** — one slide per chunk:

| Back Left | Back Right | Lyrics TVs | Stage Monitors |
|---|---|---|---|
| "Announcements" | announcement text | logo | announcement text + next preview |

Advance is manual in both. The pastor is reading aloud; nothing may move on its
own. (The pre-service auto-looping display is a **separate build** — see
Out of scope.)

## Components

**`src/shared/chunkText.ts`** (new, pure)
The auto-fit splitter, shared by both layouts.

- `chunkVerses(verses: ScriptureVerse[], budget: number): { from: number; to: number }[]`
  — accumulates whole verses until adding the next would exceed `budget`
  characters. **Never splits mid-verse.** A single verse longer than the budget
  becomes its own slide rather than being cut.
- `chunkProse(text: string, budget: number): string[]` — splits announcement
  bodies on paragraph breaks first, then sentence boundaries. **Never splits
  mid-sentence.** Same single-unit-too-long rule.

This is where "reads naturally" is won or lost, so it is the most heavily tested
module in the change.

**`src/main/autoDeck.ts`** (new)
Builds `ZoneSlide[]` for an item. Async because a sermon passage must be looked
up before it can be split by length.

- Sermon: look the passage up once, `chunkVerses`, then emit one slide per chunk
  with a `scripture` slot carrying a sub-reference (`John 3:16-18`). Emitting a
  normal reference means the existing pre-resolution and caching in
  `loadDeckOnto` handle it unchanged.
- Announcement block: `chunkProse` each announcement body in order.
- Returns `null` for anything else, and for a sermon with no passage — the item
  then behaves exactly as it does now.

**`src/shared/zoneSlides.ts`** (modified)
Adds one slot kind, `sermon`, so Back Left can use the designed title card
rather than plain text. Additive: existing decks contain none and are unaffected.
`validateZoneSlides` accepts it; `slotText` returns the title for summaries.

**`src/main/index.ts`** (modified)
- `loadDeckOnto`: fall back to `autoDeckFor(item)` when no stored deck exists.
- Deck slot → `ZoneState`: handle `sermon` (mode `sermon`, title, `passage` =
  the slot's reference, `speaker` null).
- **Populate `next` for deck slides.** The deck path sets `line` but never
  `next`, so the stage monitor's preview line — the thing that makes it useful to
  read from — is empty today. `next` comes from resolving the *following* slide's
  slot for that zone.

**`src/renderer/src/zones/ZoneScreenGrid.tsx`** (modified)
`canDeck` gains `announcement`, so a generated deck can still be opened and
overridden in the composer.

**Announcement item becomes a block** — `payload.refIds: number[]`. The picker
becomes multi-select. A single selection produces the same result as today, so
existing services are untouched; `ref_id` stays populated for backward
compatibility when exactly one is chosen.

## Chunk budget

The character budget is a setting (`zone_chunk_budget`, default 300), not a
constant. The right number depends on the physical screens and viewing distance,
and cannot be picked correctly without seeing it in the room.

## Error handling

| Case | Behaviour |
|---|---|
| Sermon has no passage | No generated deck; item behaves as today (designed card, no reading). |
| Passage lookup fails | No generated deck, and the existing lookup-failure path applies. Never a deck of blank slides. |
| Announcement body empty | That announcement contributes no slides; the rest still work. |
| Block references a deleted announcement | Skipped, with a logged warning. Not fatal to the block. |
| Stored deck present | Used verbatim. Generation does not run. |
| A verse or sentence exceeds the budget | Becomes its own slide rather than being cut mid-unit. |

## Testing

Unit tests (`vitest`, alongside the existing suite):

- `chunkVerses`: never splits a verse; respects the budget; an over-long verse
  becomes its own chunk; empty input yields no chunks; chunk ranges are
  contiguous and cover every verse exactly once.
- `chunkProse`: never splits mid-sentence; prefers paragraph breaks; over-long
  sentence becomes its own chunk.
- `autoDeckFor`: sermon produces one slide per chunk with correct sub-references;
  announcement block preserves order; returns null for unsupported types and for
  a passage-less sermon.
- `resolveSlot` with the new `sermon` kind, including `same` chains through it.
- `validateZoneSlides` accepts `sermon` and still rejects unknown kinds.

Manual verification:

1. Sermon with a multi-verse passage: Back Left holds title + reference, Back
   Right advances verse text, stage shows the same text plus the next preview,
   Lyrics TVs stay on the logo.
2. Reference on Back Left updates as the reading advances.
3. Announcement block with three announcements, one long enough to split.
4. Hand-author a deck on the same item and confirm it overrides generation.
5. Confirm an existing service with saved decks renders unchanged.

## Out of scope

- **The pre-service announcement loop** on the Lyrics TVs. Ryan named this as a
  separate build: it auto-cycles before the service, where this design is
  manually advanced during it. Different trigger, different advance model,
  different screens. It gets its own spec.
- Auto-advance for in-service announcements. The pastor sets the pace.
- Changing how songs or scripture-alone items route. Untouched.
