# Dual Live Track Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a service run a second, fully independent live track (own slide list, own Next/Back/Live) alongside the existing Main track, with each Zone (1-4) assignable per-service to follow Main or Second — so e.g. sermon title stays live on one TV while a referenced verse advances independently on another.

**Architecture:** Duplicate the module-level "live state" singletons in `src/main/index.ts` into a `LiveTrackState` struct instantiated twice (`tracks.main`, `tracks.second`); thread a `track: TrackId` parameter through every function that reads/writes that state; extend `service_item` with a `track` column (independent per-track ordinal sequences) and `service` with a `zone_track_assignment` column; `computeZoneStates()` resolves each zone's content from whichever track it's assigned to. The renderer gains a Second column in the Live tab (reusing `SlideGrid`) and track tabs in Build Service, both driven by the same `track` prop pattern.

**Tech Stack:** Electron main process (TypeScript), sql.js (SQLite via WASM), React 18 renderer, vitest for pure-logic unit tests.

**Design doc:** [`docs/superpowers/specs/2026-07-24-dual-live-track-design.md`](../specs/2026-07-24-dual-live-track-design.md)

---

## Testing convention (established in this codebase — follow it, don't invent a new one)

Per `docs/superpowers/specs/2026-07-11-announcements-and-zone-backgrounds-design.md`'s Testing section and the existing `src/shared/zoneScenes.test.ts`: **pure logic in `src/shared/*.ts` gets vitest unit tests (colocated `*.test.ts`, `environment: 'node'`)**; DB/IPC/main-process engine changes follow the existing untested pattern and are **verified manually** (there is no `db.test.ts` or `index.test.ts` anywhere in this codebase). Task 2 below is TDD; the rest are manually verified after each task via `npm run typecheck` and `npm run dev`.

---

## File Structure

- **Modify** `src/shared/types.ts` — add `TrackId`, `DEFAULT_ZONE_TRACK`, `ServiceItem.track`, `NewServiceItem.track`.
- **Create** `src/shared/zoneTrack.ts` + `src/shared/zoneTrack.test.ts` — pure parse/validate/resolve helpers for the zone→track assignment, mirroring `zoneScenes.ts`.
- **Modify** `src/main/db.ts` — schema migration, track-scoped ordering, zone-track-assignment columns/getters.
- **Modify** `src/main/recovery.ts` — dual-track recovery snapshot.
- **Modify** `src/main/index.ts` — the bulk of the engine work: `LiveTrackState`, track-parameterized playback functions, `computeZoneStates`/`broadcast`/`zoneBroadcast`, IPC handlers.
- **Modify** `src/preload/index.ts` — mirror the IPC signature changes, add new methods.
- **Modify** `src/renderer/src/browserWfMock.ts` — dev browser-preview mock must match the new `window.wf` signatures.
- **Modify** `src/renderer/src/Output.tsx`, `src/renderer/src/ServiceRail.tsx`, `src/renderer/src/drawer/BackgroundsDrawerTab.tsx`, `src/renderer/src/OutputPreview.tsx` — these read/act on Main only; update to the new `onState`/`getState`/action-method signatures without becoming track-aware.
- **Modify** `src/renderer/src/Stage.tsx`, `src/renderer/src/VolunteerView.tsx` — same as above (Stage display and Volunteer mode both stay Main-only, per the design's Non-goals).
- **Modify** `src/renderer/src/liveActions.ts` — `sendItemLive` gains a `track` param.
- **Modify** `src/renderer/src/ServiceDeck.tsx` — track tabs, track-filtered items.
- **Modify** `src/renderer/src/ServiceEditor.tsx` — track state + wiring for the tabs.
- **Modify** `src/renderer/src/SlideGrid.tsx`, `src/renderer/src/LiveTools.tsx` — `track` prop threading.
- **Modify** `src/renderer/src/LiveView.tsx` — split Main/Second columns.
- **Create** `src/renderer/src/SecondTrackTools.tsx` — the leaner Second-track control rail (Next/Back/Black/Logo/Scripture/Zone assignment only).
- **Modify** `src/renderer/src/ZonePanel.tsx` — per-zone track-assignment control.

---

### Task 1: Shared types

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add `TrackId`, `DEFAULT_ZONE_TRACK`, and `ServiceItem.track`/`NewServiceItem.track`**

In `src/shared/types.ts`, add a new type right after `export type Intent = 'next' | 'prev' | 'black' | 'logo' | 'lyrics'` (line 7):

```ts
export type TrackId = 'main' | 'second'
```

Change `ServiceItem` (lines 156-166) to add `track`:

```ts
export interface ServiceItem {
  id: number
  ordinal: number
  type: ServiceItemType
  ref_id: number | null
  payload: Record<string, unknown>
  title: string
  notes: string | null
  style: ItemStyle | null
  zoneRouting: ZoneRouting | null
  track: TrackId
}
```

Change `NewServiceItem` (lines 174-178) to add optional `track`:

```ts
export interface NewServiceItem {
  type: ServiceItemType
  ref_id?: number | null
  payload?: Record<string, unknown>
  track?: TrackId
}
```

Add `DEFAULT_ZONE_TRACK` right after `ZONE_NAMES` (after line 228):

```ts
// Which track a zone follows when a service has no explicit zone_track_assignment.
// Back Right defaults to Second (the natural "extra screen"); trivially overridden per service.
export const DEFAULT_ZONE_TRACK: Record<ZoneId, TrackId> = { 1: 'main', 2: 'second', 3: 'main', 4: 'main' }
```

- [ ] **Step 2: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: FAILS — `ServiceItem` object literals elsewhere (db.ts) don't yet supply `track`, and callers of `addServiceItem`/`reorderServiceItems` will fail once those signatures change in later tasks. For this step only, confirm the *new* types themselves have no syntax errors by checking the error list only mentions missing `track` on `ServiceItem` literals in `db.ts` (that's expected — fixed in Task 3) and nothing else.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(dual-track): add TrackId, DEFAULT_ZONE_TRACK, ServiceItem.track"
```

---

### Task 2: Zone→track assignment pure logic (TDD)

**Files:**
- Create: `src/shared/zoneTrack.ts`
- Test: `src/shared/zoneTrack.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/zoneTrack.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseZoneTrackAssignment, validateZoneTrackAssignment, resolveZoneTrack } from './zoneTrack'
import { DEFAULT_ZONE_TRACK } from './types'

describe('parseZoneTrackAssignment', () => {
  it('null/garbage/wrong-shape JSON all yield the built-in default', () => {
    expect(parseZoneTrackAssignment(null)).toEqual(DEFAULT_ZONE_TRACK)
    expect(parseZoneTrackAssignment('not json{{')).toEqual(DEFAULT_ZONE_TRACK)
    expect(parseZoneTrackAssignment('"just a string"')).toEqual(DEFAULT_ZONE_TRACK)
  })

  it('fills in a missing or invalid zone with the built-in default for that zone', () => {
    const partial = JSON.stringify({ 1: 'second' })
    expect(parseZoneTrackAssignment(partial)).toEqual({ ...DEFAULT_ZONE_TRACK, 1: 'second' })
    const bogus = JSON.stringify({ 1: 'second', 2: 'bogus', 3: 'main', 4: 'main' })
    expect(parseZoneTrackAssignment(bogus)).toEqual({ ...DEFAULT_ZONE_TRACK, 1: 'second' })
  })

  it('valid JSON round-trips', () => {
    const assignment = { 1: 'second' as const, 2: 'main' as const, 3: 'main' as const, 4: 'main' as const }
    expect(parseZoneTrackAssignment(JSON.stringify(assignment))).toEqual(assignment)
  })
})

describe('validateZoneTrackAssignment', () => {
  it('accepts a full valid assignment', () => {
    expect(validateZoneTrackAssignment({ 1: 'main', 2: 'second', 3: 'main', 4: 'main' })).toBe(true)
  })
  it('rejects missing zones, invalid track values, and non-objects', () => {
    expect(validateZoneTrackAssignment({ 1: 'main', 2: 'second', 3: 'main' })).toBe(false)
    expect(validateZoneTrackAssignment({ 1: 'main', 2: 'bogus', 3: 'main', 4: 'main' })).toBe(false)
    expect(validateZoneTrackAssignment(null)).toBe(false)
    expect(validateZoneTrackAssignment('nope')).toBe(false)
  })
})

describe('resolveZoneTrack', () => {
  it('falls back to the built-in default when assignment is null', () => {
    expect(resolveZoneTrack(2, null)).toBe(DEFAULT_ZONE_TRACK[2])
  })
  it('uses the explicit assignment when present', () => {
    expect(resolveZoneTrack(1, { 1: 'second', 2: 'main', 3: 'main', 4: 'main' })).toBe('second')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:\Dev\worshipflow && npx vitest run src/shared/zoneTrack.test.ts`
Expected: FAIL — `Cannot find module './zoneTrack'`

- [ ] **Step 3: Write the implementation**

Create `src/shared/zoneTrack.ts`:

```ts
import type { ZoneId, TrackId } from './types'
import { DEFAULT_ZONE_TRACK } from './types'

export type ZoneTrackAssignment = Record<ZoneId, TrackId>

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

function isTrackId(v: unknown): v is TrackId {
  return v === 'main' || v === 'second'
}

// Missing key, wrong shape, or unparseable JSON all fall back to the built-in
// default — same "never crash, never surprise with a blank screen" contract
// zoneScenes.ts's parseSceneConfig uses for the zone_scenes setting.
export function parseZoneTrackAssignment(json: string | null): ZoneTrackAssignment {
  if (!json) return { ...DEFAULT_ZONE_TRACK }
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ...DEFAULT_ZONE_TRACK }
  }
  if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_ZONE_TRACK }
  const obj = parsed as Record<number, unknown>
  const result = {} as ZoneTrackAssignment
  for (const zoneId of ZONE_IDS) {
    const v = obj[zoneId]
    result[zoneId] = isTrackId(v) ? v : DEFAULT_ZONE_TRACK[zoneId]
  }
  return result
}

export function validateZoneTrackAssignment(value: unknown): value is ZoneTrackAssignment {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<number, unknown>
  return ZONE_IDS.every((zoneId) => isTrackId(v[zoneId]))
}

export function resolveZoneTrack(zoneId: ZoneId, assignment: ZoneTrackAssignment | null): TrackId {
  return assignment?.[zoneId] ?? DEFAULT_ZONE_TRACK[zoneId]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd C:\Dev\worshipflow && npx vitest run src/shared/zoneTrack.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/shared/zoneTrack.ts src/shared/zoneTrack.test.ts
git commit -m "feat(dual-track): add zone-track assignment parse/validate/resolve helpers"
```

---

### Task 3: DB schema + track-scoped ordering

**Files:**
- Modify: `src/main/db.ts`

- [ ] **Step 1: Add the migration columns**

In `src/main/db.ts`, in `initDb()`, add two lines to the migration block right after line 166 (`try { db.run('ALTER TABLE service_item ADD COLUMN zone_routing TEXT') } catch { /* already exists */ }`):

```ts
  try { db.run("ALTER TABLE service_item ADD COLUMN track TEXT NOT NULL DEFAULT 'main'") } catch { /* already exists */ }
  try { db.run('ALTER TABLE service ADD COLUMN zone_track_assignment TEXT') } catch { /* already exists */ }
```

- [ ] **Step 2: Import `TrackId` and `ZoneTrackAssignment`**

In `src/main/db.ts`, add `TrackId` to the existing `import type { ... } from '../shared/types'` block (line 5-24) — insert it after `ZoneRouting,` (line 17):

```ts
  ZoneRouting,
  TrackId,
```

- [ ] **Step 3: Scope `addServiceItem` by track**

Replace the current `addServiceItem` (lines 655-670):

```ts
export function addServiceItem(serviceId: number, item: NewServiceItem): number {
  const track: TrackId = item.track ?? 'main'
  const next = db.exec('SELECT COALESCE(MAX(ordinal), -1) + 1 AS n FROM service_item WHERE service_id = ? AND track = ?', [
    serviceId,
    track
  ])
  const ordinal = (next.length ? (next[0].values[0][0] as number) : 0) || 0
  db.run('INSERT INTO service_item (service_id, ordinal, type, ref_id, payload_json, track) VALUES (?,?,?,?,?,?)', [
    serviceId,
    ordinal,
    item.type,
    item.ref_id ?? null,
    JSON.stringify(item.payload ?? {}),
    track
  ])
  const id = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0] as number
  persist()
  return id
}
```

- [ ] **Step 4: Scope `moveServiceItem` by track**

Replace the current `moveServiceItem` (lines 677-703):

```ts
export function moveServiceItem(itemId: number, dir: 'up' | 'down'): void {
  const cur = db.prepare('SELECT ordinal, service_id, track FROM service_item WHERE id = ?')
  cur.bind([itemId])
  if (!cur.step()) {
    cur.free()
    return
  }
  const { ordinal, service_id, track } = cur.getAsObject() as { ordinal: number; service_id: number; track: string }
  cur.free()

  const nb = db.prepare(
    dir === 'up'
      ? 'SELECT id, ordinal FROM service_item WHERE service_id = ? AND track = ? AND ordinal < ? ORDER BY ordinal DESC LIMIT 1'
      : 'SELECT id, ordinal FROM service_item WHERE service_id = ? AND track = ? AND ordinal > ? ORDER BY ordinal ASC LIMIT 1'
  )
  nb.bind([service_id, track, ordinal])
  if (!nb.step()) {
    nb.free()
    return
  }
  const neighbor = nb.getAsObject() as { id: number; ordinal: number }
  nb.free()

  db.run('UPDATE service_item SET ordinal = ? WHERE id = ?', [neighbor.ordinal, itemId])
  db.run('UPDATE service_item SET ordinal = ? WHERE id = ?', [ordinal, neighbor.id])
  persist()
}
```

- [ ] **Step 5: Add `track` param to `reorderServiceItems`**

Replace the current `reorderServiceItems` (lines 740-752):

```ts
export function reorderServiceItems(serviceId: number, track: string, orderedIds: number[]): void {
  db.run('BEGIN')
  try {
    orderedIds.forEach((id, i) => {
      db.run('UPDATE service_item SET ordinal = ? WHERE id = ? AND service_id = ? AND track = ?', [i, id, serviceId, track])
    })
    db.run('COMMIT')
    persist()
  } catch (e) {
    db.run('ROLLBACK')
    throw e
  }
}
```

- [ ] **Step 6: Hydrate `track` in `getService`**

In `getService` (src/main/db.ts), change the item-select query (line 598-600) to include `track`:

```ts
  const stmt = db.prepare(
    'SELECT id, ordinal, type, ref_id, payload_json, notes, style, zone_routing, track FROM service_item WHERE service_id = ? ORDER BY ordinal'
  )
```

Update the row type (lines 604-613) to include `track: string`:

```ts
    const r = stmt.getAsObject() as {
      id: number
      ordinal: number
      type: string
      ref_id: number | null
      payload_json: string | null
      notes: string | null
      style: string | null
      zone_routing: string | null
      track: string
    }
```

Update the `items.push(...)` call (lines 639-649) to include `track`:

```ts
    items.push({
      id: r.id,
      ordinal: r.ordinal,
      type: r.type as ServiceItem['type'],
      ref_id: r.ref_id,
      payload,
      title: itemTitle(r.type, r.ref_id, payload),
      notes: r.notes ?? null,
      style,
      zoneRouting,
      track: (r.track === 'second' ? 'second' : 'main') as TrackId
    })
```

- [ ] **Step 7: Add zone-track-assignment getter/setter**

Add these two functions right after `setItemZoneRouting` (after line 738), before `reorderServiceItems`:

```ts
// Raw JSON string, same convention as getItemZoneRouting/setItemZoneRouting —
// parsing/defaulting happens in main/index.ts via the shared parseZoneTrackAssignment.
export function getZoneTrackAssignment(serviceId: number): string | null {
  const rows = db.exec('SELECT zone_track_assignment FROM service WHERE id = ?', [serviceId])
  if (!rows.length || !rows[0].values.length) return null
  return (rows[0].values[0][0] as string | null) ?? null
}

export function setZoneTrackAssignment(serviceId: number, json: string | null): void {
  db.run('UPDATE service SET zone_track_assignment = ? WHERE id = ?', [json, serviceId])
  persist()
}
```

- [ ] **Step 8: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck:node`
Expected: errors only in `src/main/index.ts` (callers of `reorderServiceItems`/`addServiceItem` not yet updated — fixed in Task 8) and nowhere else in `db.ts`.

- [ ] **Step 9: Commit**

```bash
git add src/main/db.ts
git commit -m "feat(dual-track): track-scope service_item ordering, add zone_track_assignment column"
```

---

### Task 4: Main process — `LiveTrackState` struct

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Replace the per-track singleton block with `LiveTrackState`**

In `src/main/index.ts`, replace lines 199-222 (from `// Canonical live state.` through `let serviceSlideThemeColors: ThemeColors | null = null`) with:

```ts
// Canonical live state — one LiveTrackState per track (Main always exists;
// Second is created eagerly too but stays empty/unused until a service has
// track:'second' items). See docs/superpowers/specs/2026-07-24-dual-live-track-design.md.
interface LiveTrackState {
  song: { title: string; lines: string[]; background?: string | null; bgMotion?: string | null }
  songId: number | null
  mode: Mode
  index: number
  serviceItemId: number | null
  fontScale: number
  songTextColor: string | null
  songFont: string | null
  bgFit: 'cover' | 'contain'
  stageMessage: string | null
  songMeta: { author: string | null; copyright: string | null; ccli: string | null }
  slideTheme: string
  slideThemeColors: ThemeColors | null
  itemNotes: string | null
  hmsLoadedAt: number | null
  autoAdvanceMs: number | null
  scriptureRef: string | null
  verseNumber: number | null
  countdownTimer: ReturnType<typeof setInterval> | null
  autoAdvanceTimer: ReturnType<typeof setInterval> | null
  autoAdvanceDuration: number
  autoAdvanceLoop: boolean
}

function createTrackState(song: LiveTrackState['song']): LiveTrackState {
  return {
    song,
    songId: null,
    mode: 'lyrics',
    index: 0,
    serviceItemId: null,
    fontScale: 6,
    songTextColor: null,
    songFont: null,
    bgFit: 'cover',
    stageMessage: null,
    songMeta: { author: null, copyright: null, ccli: null },
    slideTheme: DEFAULT_THEME_ID,
    slideThemeColors: null,
    itemNotes: null,
    hmsLoadedAt: null,
    autoAdvanceMs: null,
    scriptureRef: null,
    verseNumber: null,
    countdownTimer: null,
    autoAdvanceTimer: null,
    autoAdvanceDuration: 0,
    autoAdvanceLoop: false
  }
}

const tracks: Record<TrackId, LiveTrackState> = {
  main: createTrackState(DEMO_SONG),
  second: createTrackState({ title: '', lines: [], background: null })
}

// Zone state: manual overrides set by the operator; null = auto-route from service item routing.
const zoneOverrides: Map<ZoneId, ZoneState['mode']> = new Map()
let ccliLicense: string | null = null  // church CCLI license number (loaded from settings)
let logoPath: string | null = null     // church logo image path for logo zones
let logoBg: string | null = null       // motion background (video/image) for logo zones
const loggedSongIds = new Set<number>()  // songs already counted this service (CCLI: once per service)
let serviceSlideTheme: string = DEFAULT_THEME_ID  // service-level baseline
let serviceSlideThemeColors: ThemeColors | null = null
// Which track each zone follows for the active service; refreshed by
// refreshActiveServiceItems() and by wf:service:zoneTrackAssignment:set.
let activeZoneTrackAssignment: ZoneTrackAssignment = { ...DEFAULT_ZONE_TRACK }
```

Add `TrackId` and `ZoneTrackAssignment` to imports: in the `import type { ... } from '../shared/types'` line (line 11), add `TrackId` right after `ZoneRouting,`. Add a new import line right after the `zoneScenes` import (line 12-13):

```ts
import { parseZoneTrackAssignment } from '../shared/zoneTrack'
import type { ZoneTrackAssignment } from '../shared/zoneTrack'
```

- [ ] **Step 2: Remove the now-duplicated Feature-states block**

Remove lines 340, 344, 345 (`let hmsLoadedAt`, `let liveScriptureRef`, `let verseNumber`) and lines 353-356 (`let countdownTimer`, `let autoAdvanceTimer`, `let autoAdvanceDuration`, `let autoAdvanceLoop`) — these now live inside `LiveTrackState`. Leave `currentTheme`, `bibleTranslation`, `serviceLog`, and the OBS variables (`obsAutoSwitch`, `obsSceneMap`, `lastAutoScene`) exactly where they are — they stay global (Main-only features, per the design's Non-goals).

Also remove `let liveItemNotes: string | null = null` (line 236) — it's now `tracks[track].itemNotes`.

- [ ] **Step 3: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck:node`
Expected: many errors — every remaining reference to the old singulars (`liveSong`, `liveSongId`, `state.mode`, `state.index`, `liveServiceItemId`, `liveFontScale`, `liveSongTextColor`, `liveSongFont`, `liveBgFit`, `liveStageMessage`, `liveSongMeta`, `liveSlideTheme`, `liveSlideThemeColors`, `liveItemNotes`, `hmsLoadedAt`, `autoAdvanceMs`, `liveScriptureRef`, `verseNumber`, `countdownTimer`, `autoAdvanceTimer`, `autoAdvanceDuration`, `autoAdvanceLoop`) now fails to resolve. This is expected — Task 5 fixes every one of them. Do not attempt to fix piecemeal; proceed to Task 5.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(dual-track): introduce LiveTrackState struct (breaks build until Task 5)"
```

---

### Task 5: Main process — parameterize the playback functions by track

**Files:**
- Modify: `src/main/index.ts`

This task rewrites every function that reads/writes the old singulars so they take a `track: TrackId` parameter and operate on `tracks[track]`. Each replaces the function of the same name at the same location from the original file.

- [ ] **Step 1: `clearCountdown` / `clearAutoAdvance` / `clearSongMeta`**

Replace (originally lines 357-365, and 897-899 for `clearSongMeta` — move it up next to the others since they're now one family of per-track clear helpers):

```ts
function clearCountdown(track: TrackId): void {
  const t = tracks[track]
  if (t.countdownTimer) { clearInterval(t.countdownTimer); t.countdownTimer = null }
}
function clearAutoAdvance(track: TrackId): void {
  const t = tracks[track]
  if (t.autoAdvanceTimer) { clearInterval(t.autoAdvanceTimer); t.autoAdvanceTimer = null }
  t.autoAdvanceMs = null
  t.autoAdvanceDuration = 0
  t.autoAdvanceLoop = false
}
// Clear CCLI song metadata when a non-song goes live.
function clearSongMeta(track: TrackId): void {
  tracks[track].songMeta = { author: null, copyright: null, ccli: null }
}
```

(Leave the original `clearSongMeta` definition at its old location (lines 896-899) deleted — it now lives here.)

- [ ] **Step 2: `atEndOfContent` / `goToStart` / `armAutoAdvance` / `logServiceEvent`**

Replace (originally lines 368-416):

```ts
// Are we on the last slide of the last go-live item (nothing further to advance to)?
function atEndOfContent(track: TrackId): boolean {
  const t = tracks[track]
  const atLastSlide = t.mode === 'lyrics' ? t.index >= t.song.lines.length - 1 : true
  return atLastSlide && !adjacentLiveItem(track, 1)
}

// Jump back to the first slide of the first go-live item (loop restart).
function goToStart(track: TrackId): void {
  const first = activeServiceItems.filter((it) => it.track === track).find(itemCanGoLive)
  if (first) void handleTabletLoadItem(track, first.id)
  else { tracks[track].index = 0; broadcast() }
}

// Start (or re-arm) the auto-advance countdown. Each time it elapses it advances
// one slide and re-arms itself, so it keeps going until the operator hits Stop.
// When `loop` is set, it restarts from the beginning instead of stopping at the end.
function armAutoAdvance(track: TrackId, durationMs: number, loop: boolean): void {
  if (durationMs <= 100 || durationMs > 3600000) {
    console.error(`Invalid auto-advance duration: ${durationMs}ms`)
    return
  }
  const t = tracks[track]
  if (t.autoAdvanceTimer) clearInterval(t.autoAdvanceTimer)
  t.autoAdvanceDuration = durationMs
  t.autoAdvanceLoop = loop
  t.autoAdvanceMs = durationMs
  t.autoAdvanceTimer = setInterval(() => {
    if (t.autoAdvanceMs == null) return
    t.autoAdvanceMs -= 100
    if (t.autoAdvanceMs <= 0) {
      const dur = t.autoAdvanceDuration
      const lp = t.autoAdvanceLoop
      if (lp && atEndOfContent(track)) goToStart(track)
      else if (atEndOfContent(track)) {
        // At end of service and not looping — stop auto-advance to prevent runaway
        clearAutoAdvance(track)
        logServiceEvent('auto-advance stopped at end of service')
        broadcast()
        return
      } else {
        processIntent(track, 'next')  // advances (note: doesn't clear auto-advance since it's a 'next' intent)
      }
      armAutoAdvance(track, dur, lp)      // …so re-arm to keep the cycle going
      return
    }
    broadcast()
  }, 100)
}
function logServiceEvent(event: string): void {
  serviceLog.push({ ts: Date.now(), event })
}
```

- [ ] **Step 3: `renderState`**

Replace (originally lines 438-467):

```ts
function renderState(track: TrackId = 'main'): LiveState {
  const t = tracks[track]
  const lines = t.song.lines
  return {
    mode: t.mode,
    index: t.index,
    line: lines[t.index] ?? '',
    next: lines[t.index + 1] ?? '',
    total: lines.length,
    songTitle: t.song.title,
    background: t.song.background ?? null,
    bgMotion: (t.song.bgMotion as 'pan' | 'zoom' | 'shimmer' | null) ?? null,
    bgFit: t.bgFit,
    liveServiceItemId: t.serviceItemId,
    fontScale: t.fontScale,
    stageMessage: t.stageMessage,
    ts: Date.now(),
    hmsLoadedAt: t.hmsLoadedAt,
    autoAdvanceMs: t.autoAdvanceMs,
    theme: currentTheme,
    verseNumber: t.verseNumber,
    songAuthor: t.songMeta.author,
    songCopyright: t.songMeta.copyright,
    songCcli: t.songMeta.ccli,
    ccliLicense,
    slideTheme: t.slideTheme,
    slideThemeColors: t.slideThemeColors,
    songTextColor: t.songTextColor,
    songFont: t.songFont
  }
}
```

The default parameter (`track: TrackId = 'main'`) keeps every not-yet-updated call site (there should be none left after this task, but it's a safe default matching the design doc) working against Main.

- [ ] **Step 4: `itemCanGoLive` (unchanged) / `adjacentLiveItem`**

`itemCanGoLive` (lines 637-648) is pure and per-item — leave it exactly as-is, no change needed.

Replace `adjacentLiveItem` (originally lines 651-659):

```ts
// Find the next/previous go-live service item relative to the current one, within the same track.
function adjacentLiveItem(track: TrackId, dir: 1 | -1): ServiceItem | undefined {
  const t = tracks[track]
  if (t.serviceItemId == null) return undefined
  const trackItems = activeServiceItems.filter((it) => it.track === track)
  const idx = trackItems.findIndex((it) => it.id === t.serviceItemId)
  if (idx < 0) return undefined
  const rest = dir === 1
    ? trackItems.slice(idx + 1)
    : trackItems.slice(0, idx).reverse()
  return rest.find(itemCanGoLive)
}
```

- [ ] **Step 5: `processIntent`**

Replace (originally lines 668-705):

```ts
// --- Extracted intent processing (used by both IPC and WebSocket) ---
function processIntent(track: TrackId, type: Intent): void {
  const t = tracks[track]
  // Only clear auto-advance for mode-changing intents (black/logo/lyrics), not for navigation (next/prev)
  if (type !== 'next' && type !== 'prev') {
    clearAutoAdvance(track)
  }
  const last = t.song.lines.length - 1
  if (type === 'next') {
    if (t.mode === 'countdown') {
      // A live countdown/welcome is a single view — Next moves to the next item.
      const nextItem = adjacentLiveItem(track, 1)
      if (nextItem) { void handleTabletLoadItem(track, nextItem.id); return }
      // Nothing after the countdown — go to the logo hold screen instead of
      // stranding the frozen timer value (e.g. "0:42") as a lyric slide.
      clearCountdown(track); t.song = { title: '', lines: [], background: null }; t.mode = 'logo'
    } else if (t.mode !== 'lyrics') {
      // Black/logo were operator-blanked — Next un-blanks back to the slide.
      clearCountdown(track); t.mode = 'lyrics'
    } else if (t.index < last) {
      t.index++; logServiceEvent(`next: ${t.index}/${last}`)
    } else {
      // At the last slide of this item — advance to the next service item.
      const nextItem = adjacentLiveItem(track, 1)
      if (nextItem) { void handleTabletLoadItem(track, nextItem.id); return }
    }
  } else if (type === 'prev') {
    if (t.mode !== 'lyrics') { clearCountdown(track); t.mode = 'lyrics' }
    else if (t.index > 0) { t.index--; logServiceEvent(`prev: ${t.index}/${last}`) }
    else {
      // At the first slide — step back to the previous service item.
      const prevItem = adjacentLiveItem(track, -1)
      if (prevItem) { void handleTabletLoadItem(track, prevItem.id); return }
    }
  } else if (type === 'black') { clearCountdown(track); t.mode = 'black'; logServiceEvent('black') }
  else if (type === 'logo') { clearCountdown(track); t.mode = 'logo'; logServiceEvent('logo') }
  else if (type === 'lyrics') { clearCountdown(track); t.mode = 'lyrics'; logServiceEvent('lyrics') }
  broadcast()
}
```

- [ ] **Step 6: `doLoadText` / `doLoadCountdown` / `doLoadScripture` / `doLoadSong` / `doLoadAnnouncement` / `doLoadMedia`**

Replace `doLoadText` (originally lines 708-721):

```ts
// --- Extracted load functions (used by IPC handlers and tablet loadItem) ---
function doLoadText(track: TrackId, title: string, body: string, background: string | null = null): void {
  const t = tracks[track]
  clearCountdown(track)
  t.songId = null
  t.scriptureRef = null
  clearSongMeta(track)
  t.bgFit = 'cover'
  const lines: string[] = []
  if (title) lines.push(title)
  body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).forEach((b) => lines.push(b))
  t.song = { title: title || 'Announcement', lines: lines.length ? lines : [title], background }
  t.songTextColor = null; t.songFont = null
  t.mode = 'lyrics'
  t.index = 0
}
```

Replace `doLoadCountdown` (originally lines 723-747):

```ts
function doLoadCountdown(track: TrackId, seconds: number): void {
  const t = tracks[track]
  clearCountdown(track)
  t.songId = null
  t.scriptureRef = null
  clearSongMeta(track)
  t.bgFit = 'cover'
  const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  let remaining = seconds
  t.song = { title: 'Countdown', lines: [fmt(remaining)], background: null }
  t.songTextColor = null; t.songFont = null
  t.mode = 'countdown' as Mode
  t.index = 0
  t.countdownTimer = setInterval(() => {
    remaining--
    if (remaining <= 0) {
      clearCountdown(track)
      t.song = { title: 'Countdown', lines: ['0:00'], background: null }
      t.mode = 'black'
      broadcast()
      return
    }
    t.song = { title: 'Countdown', lines: [fmt(remaining)], background: null }
    broadcast()
  }, 1000)
}
```

Replace `doLoadScripture` (originally lines 774-802) — note `bibleTranslation` stays global (a single operator-wide setting, not per-track):

```ts
// Returns false (leaving the current slide untouched) when the reference can't be
// resolved, so callers don't mark a failed scripture "live" and strand the wrong
// content on the projector.
async function doLoadScripture(track: TrackId, reference: string): Promise<boolean> {
  const result = bibleTranslation === 'kjv'
    ? lookupScripture(reference)
    : await fetchScripture(reference, bibleTranslation)
  if (!result.ok || !result.verses) {
    logWarn(`[scripture] lookup failed for reference="${reference}" translation=${bibleTranslation}`)
    return false
  }
  if (result.usedFallback) {
    notifyOperator(`Online lookup failed — showing KJV for "${reference}"`, 'warn')
  }
  const t = tracks[track]
  clearCountdown(track)
  t.songId = null
  t.scriptureRef = reference
  clearSongMeta(track)
  t.bgFit = 'cover'
  const lines =
    result.verses.length === 1
      ? [result.verses[0].text]
      : result.verses.map((v) => `${v.n}  ${v.text}`)
  t.song = { title: result.reference!, lines, background: null }
  t.songTextColor = null; t.songFont = null
  t.mode = 'lyrics'
  t.index = 0
  return true
}
```

Replace `doLoadSong` (originally lines 822-845):

```ts
async function doLoadSong(track: TrackId, id: number): Promise<void> {
  clearCountdown(track)
  clearAutoAdvance(track)
  const full = await getSong(id)
  if (!full) return
  const t = tracks[track]
  t.songId = id
  t.scriptureRef = null
  t.bgFit = 'cover'
  t.song = { title: full.title, lines: songLines(full), background: full.background ?? null, bgMotion: full.bgMotion ?? null }
  t.fontScale = full.fontScale ?? 6
  t.songTextColor = full.textColor ?? null
  t.songFont = full.font ?? null
  t.songMeta = { author: full.author, copyright: full.copyright, ccli: full.ccli }
  t.hmsLoadedAt = Date.now()  // Start hymn timer
  t.verseNumber = 1
  t.mode = 'lyrics'
  t.index = 0
  logServiceEvent(`load-song: ${full.title}`)
  // Record CCLI usage once per service (reset when the active service changes).
  // Dedup key is the song id, not the track — playing the same song on both
  // tracks in one service still only logs it once, which is correct.
  if (!loggedSongIds.has(id)) {
    loggedSongIds.add(id)
    recordSongUsage({ songId: id, title: full.title, author: full.author, ccli: full.ccli, copyright: full.copyright })
  }
}
```

Replace `doLoadAnnouncement` (originally lines 847-856):

```ts
async function doLoadAnnouncement(track: TrackId, id: number): Promise<void> {
  const a = getAnnouncement(id)
  if (!a) return
  if (a.display === 'ticker') {
    // Title literally 'Announcement' triggers the ticker renderer (existing mechanism).
    doLoadText(track, 'Announcement', a.body)
  } else {
    doLoadText(track, a.title, a.body, a.background ?? null)
  }
}
```

Replace `doLoadMedia` (originally lines 912-922):

```ts
function doLoadMedia(track: TrackId, filePath: string, title: string): void {
  const t = tracks[track]
  clearCountdown(track)
  t.songId = null
  t.scriptureRef = null
  clearSongMeta(track)
  t.bgFit = 'contain'  // a whole-slide image — fit it entirely on screen
  t.song = { title: title || 'Media', lines: [''], background: filePath }
  t.songTextColor = null; t.songFont = null
  t.mode = 'lyrics'
  t.index = 0
}
```

- [ ] **Step 7: `applyItemTheme` / `handleTabletLoadItem`**

Replace `applyItemTheme` (originally lines 902-910):

```ts
// Effective projector theme = the live item's override, else the service baseline.
function applyItemTheme(track: TrackId, item: ServiceItem | undefined): void {
  const t = tracks[track]
  if (item?.style?.theme) {
    t.slideTheme = item.style.theme
    t.slideThemeColors = item.style.colors ?? null
  } else {
    t.slideTheme = serviceSlideTheme
    t.slideThemeColors = serviceSlideThemeColors
  }
}
```

Replace `handleTabletLoadItem` (originally lines 924-965 — note `itemId` lookup is now scoped to items belonging to `track`, so a Second-track item id can never accidentally go live on Main or vice versa):

```ts
// Load any service item to live (used by tablet loadItem messages and the goLiveAt IPC).
async function handleTabletLoadItem(track: TrackId, itemId: number): Promise<void> {
  const item = activeServiceItems.find((it) => it.id === itemId && it.track === track)
  if (!item) return
  if (item.type === 'song' && item.ref_id != null) {
    await doLoadSong(track, item.ref_id)
  } else if (item.type === 'scripture') {
    const ref = item.payload.reference as string
    if (!ref) return
    if (!(await doLoadScripture(track, ref))) return  // lookup failed → don't mark it live
  } else if (item.type === 'text') {
    doLoadText(
      track,
      (item.payload.title as string) ?? '',
      (item.payload.body as string) ?? '',
      (item.payload.background as string) ?? null
    )
  } else if (item.type === 'countdown') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return
    doLoadCountdown(track, secs)
  } else if (item.type === 'image') {
    const p = item.payload.path as string
    if (!p) return
    doLoadMedia(track, p, item.title)
  } else if (item.type === 'welcome') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return
    doLoadCountdown(track, secs)
  } else if (item.type === 'ticker') {
    const txt = item.payload.text as string
    if (!txt) return
    doLoadText(track, 'Announcement', txt)
  } else if (item.type === 'announcement' && item.ref_id != null) {
    await doLoadAnnouncement(track, item.ref_id)
  } else {
    return
  }
  const t = tracks[track]
  t.serviceItemId = item.id
  t.itemNotes = item.notes ?? null
  applyItemTheme(track, item)
  broadcast()
  if (track === 'main') {
    void recordingSession.onItemLive(item, activeServiceId, activeServiceName, activeServiceDate)
  }
}
```

Note: `recordingSession.onItemLive` moved from the `wf:live:setItemId` IPC handler's responsibility into here for the `handleTabletLoadItem` path — this matches today's actual behavior (today `handleTabletLoadItem` does NOT call it; only the separate `wf:live:setItemId` IPC handler does). Keep that split intact: **do not** add the `if (track === 'main')` block above — remove it from this step. `handleTabletLoadItem` stays exactly as unparameterized-for-recording as it is today; recording stays wired only through `wf:live:setItemId` (Task 8, Step 4), which is Main-only per the design's non-goals.

- [ ] **Step 8: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck:node`
Expected: remaining errors are all in `computeZoneStates`, `broadcast`, `zoneBroadcast`, `tabletBroadcast`, `maybeAutoSwitchScene`, `refreshActiveServiceItems`, and the IPC handler block — all fixed in Tasks 6-8. Confirm no errors remain inside the functions touched in this task (`processIntent`, `doLoadText`, `doLoadCountdown`, `doLoadScripture`, `doLoadSong`, `doLoadAnnouncement`, `doLoadMedia`, `applyItemTheme`, `handleTabletLoadItem`, `clearCountdown`, `clearAutoAdvance`, `clearSongMeta`, `atEndOfContent`, `goToStart`, `armAutoAdvance`, `adjacentLiveItem`).

- [ ] **Step 9: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(dual-track): parameterize playback functions by track"
```

---

### Task 6: Main process — `computeZoneStates` / `broadcast` / `zoneBroadcast` / `maybeAutoSwitchScene`

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: `computeZoneStates`**

Replace (originally lines 469-571) — each zone now resolves its own track via `activeZoneTrackAssignment`, then everything downstream (scene/role resolution, per-mode content) is identical to today, just re-anchored to that zone's track:

```ts
function computeZoneStates(): Record<ZoneId, ZoneState> {
  const result = {} as Record<ZoneId, ZoneState>
  const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]
  for (const zoneId of ZONE_IDS) {
    const zoneTrack = activeZoneTrackAssignment[zoneId]
    const live = renderState(zoneTrack)
    const t = tracks[zoneTrack]

    // Get routing for the active item on this zone's track (or defaults: scene
    // palette typeDefault, falling back to the built-in ZONE_ROUTING_DEFAULTS).
    let routing: ZoneRouting | null = null
    if (t.serviceItemId != null) {
      const item = activeServiceItems.find((it) => it.id === t.serviceItemId && it.track === zoneTrack)
      if (item) {
        const sceneConfig = parseSceneConfig(getSetting('zone_scenes'))
        const stored = getItemZoneRouting(item.id)
        if (stored) {
          try {
            routing = JSON.parse(stored) as ZoneRouting
          } catch (err) {
            console.error(`Failed to parse zone routing for item id=${item.id}:`, err)
            routing = defaultRoutingFor(item.type, sceneConfig)
          }
        } else {
          routing = defaultRoutingFor(item.type, sceneConfig)
        }
      }
    }

    // Manual override takes precedence over auto-routing (global, track-agnostic).
    const override = zoneOverrides.get(zoneId)
    const idleDefault: ZoneMode = (zoneId === 1 || zoneId === 2) ? 'logo' : 'off'
    const routedMode = override ?? (routing ? routing[zoneId] : idleDefault)
    const mode = routedMode ?? 'off'

    const base: ZoneState = {
      mode,
      line: '',
      next: '',
      title: '',
      index: live.index,
      total: live.total,
      background: null,
      themeColors: null,
      fontScale: live.fontScale,
      secondsLeft: 0,
      stageMessage: live.stageMessage,
      imagePath: null,
      bgColor: null,
      bgOverlay: null,
      textAlign: null,
      textPosition: null,
    }

    // Populate fields based on mode.
    if (mode === 'lyrics' || mode === 'text') {
      base.line = live.line
      base.next = live.next
      base.title = live.songTitle
      // Zones can't load `theme:<id>` as a file (only the projector renders motion
      // themes), so resolve the effective theme to colors and let the zone draw an
      // animated gradient. Real image/video file backgrounds pass through as-is.
      const isThemeBg = live.background?.startsWith('theme:') ?? false
      const themeId = isThemeBg ? live.background!.slice(6) : (live.slideTheme ?? null)
      base.background = isThemeBg ? null : live.background
      base.themeColors = resolveColors(getTheme(themeId), live.slideThemeColors)
      // For text-type items, pull per-item style overrides from payload
      if (t.serviceItemId != null) {
        const liveItem = activeServiceItems.find((it) => it.id === t.serviceItemId && it.type === 'text')
        if (liveItem) {
          const pl = liveItem.payload
          if (pl.bgOverlay != null) base.bgOverlay = pl.bgOverlay as number
          if (pl.textAlign != null) base.textAlign = pl.textAlign as string
          if (pl.textPosition != null) base.textPosition = pl.textPosition as string
          if (pl.bgColor != null && !base.background) base.bgColor = pl.bgColor as string
          if (pl.fontScale != null) base.fontScale = pl.fontScale as number
        }
      }
    } else if (mode === 'stage') {
      // Stage always shows lyrics content with next preview.
      base.line = live.line
      base.next = live.next
      base.title = live.songTitle
      // No background on stage monitor.
    } else if (mode === 'countdown') {
      // Parse countdown from the live line ("M:SS" format).
      const parts = live.line.split(':')
      const mins = parseInt(parts[0] ?? '0', 10)
      const secs = parseInt(parts[1] ?? '0', 10)
      base.secondsLeft = (isNaN(mins) ? 0 : mins) * 60 + (isNaN(secs) ? 0 : secs)
      base.title = live.songTitle
    } else if (mode === 'image') {
      const item = activeServiceItems.find((it) => it.id === t.serviceItemId)
      base.imagePath = item ? ((item.payload.path as string) ?? null) : null
    } else if (mode === 'logo') {
      // Logo zones (Back Left/Right) stay on their own static backdrop — they do
      // NOT follow the live song/theme background. `logoBg` is the configured logo
      // backdrop; when unset the zone page draws its charcoal gradient.
      base.imagePath = logoPath
      base.background = logoBg
    }

    result[zoneId] = base
  }
  return result
}
```

- [ ] **Step 2: `zoneBroadcast` (unchanged body, kept here for context — no edit needed)**

`zoneBroadcast` (lines 573-580) calls `computeZoneStates()` with no arguments and needs no change — confirm it still reads correctly after Step 1.

- [ ] **Step 3: `tabletBroadcast` and `maybeAutoSwitchScene` — hardcode Main**

Replace `tabletBroadcast` (originally lines 592-603) — the tablet remote stays Main-only per the design's non-goals:

```ts
function tabletBroadcast(statePayload?: LiveState): void {
  if (tabletClients.size === 0) return
  const payload = JSON.stringify({
    type: 'state',
    state: statePayload ?? renderState('main'),
    notes: tracks.main.itemNotes,
    items: activeServiceItems.filter((it) => it.track === 'main').map((it) => ({ id: it.id, type: it.type, title: it.title }))
  })
  for (const client of tabletClients) {
    if ((client as WsSocket).readyState === 1) (client as WsSocket).send(payload)
  }
}
```

Replace `maybeAutoSwitchScene` (originally lines 606-623) — OBS auto-switch stays Main-only:

```ts
// Derive the current scene context from Main-track live state, then switch OBS if it changed.
function maybeAutoSwitchScene(): void {
  if (!obsAutoSwitch || !getObsStatus().connected) return
  const t = tracks.main
  // Don't switch while operator has blanked the screen.
  if (t.mode === 'black' || t.mode === 'logo') return
  let ctx: SceneContext
  if (t.mode === 'countdown') ctx = 'countdown'
  else {
    const item = t.serviceItemId != null
      ? activeServiceItems.find((it) => it.id === t.serviceItemId && it.track === 'main')
      : undefined
    ctx = item?.type === 'song' ? 'worship' : 'word'
  }
  const scene = obsSceneMap[ctx]
  if (scene && scene !== lastAutoScene) {
    lastAutoScene = scene
    void obsSetScene(scene)
  }
}
```

- [ ] **Step 4: `broadcast`**

Replace (originally lines 625-634):

```ts
function broadcast(): void {
  const mainPayload = renderState('main')
  const secondActive = activeServiceItems.some((it) => it.track === 'second')
  const secondPayload = secondActive ? renderState('second') : null
  const payload = { main: mainPayload, second: secondPayload }
  for (const w of [operatorWin, stageWin, ...outputWins.values()]) {
    if (w && !w.isDestroyed()) w.webContents.send('wf:state', payload)
  }
  writeRecovery({
    main: { liveServiceItemId: tracks.main.serviceItemId, slideIndex: tracks.main.index, mode: tracks.main.mode },
    second: secondActive
      ? { liveServiceItemId: tracks.second.serviceItemId, slideIndex: tracks.second.index, mode: tracks.second.mode }
      : null
  })
  tabletBroadcast(mainPayload)
  zoneBroadcast()
  maybeAutoSwitchScene()
}
```

- [ ] **Step 5: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck:node`
Expected: remaining errors are only in `refreshActiveServiceItems` and the IPC handler block — fixed in Task 8.

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(dual-track): computeZoneStates resolves per-zone track, broadcast sends both tracks"
```

---

### Task 7: Recovery — dual-track snapshot

**Files:**
- Modify: `src/main/recovery.ts`

- [ ] **Step 1: Replace `RecoverySnapshot`**

Replace the full contents of `src/main/recovery.ts`:

```ts
import Store from 'electron-store'

// Crash recovery: persist the actual service item being played, per track, restore on launch.
// Stores the live service item ID so we can restore the exact item after a crash,
// not just a mystery black screen.
export interface TrackSnapshot {
  liveServiceItemId: number | null
  slideIndex: number
  mode: string
}

export interface RecoverySnapshot {
  main: TrackSnapshot
  second: TrackSnapshot | null
}

const recoveryStore = new Store<{ lastState: RecoverySnapshot | null }>({ name: 'recovery' })

export function readRecovery(): RecoverySnapshot | null {
  try {
    return recoveryStore.get('lastState') ?? null
  } catch {
    return null
  }
}

export function writeRecovery(snap: RecoverySnapshot): void {
  try {
    recoveryStore.set('lastState', snap)
  } catch {
    // Never let autosave crash the live engine.
  }
}
```

(This matches the shape `broadcast()` already writes as of Task 6, Step 4 — no further change needed in `index.ts` for the write side.)

- [ ] **Step 2: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck:node`
Expected: no new errors from `recovery.ts` itself; the `wf:app:restoreRecovery` handler (still reading the old shape) now errors — fixed in Task 8.

- [ ] **Step 3: Commit**

```bash
git add src/main/recovery.ts
git commit -m "feat(dual-track): recovery snapshot covers both tracks"
```

---

### Task 8: Main process IPC handlers

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: `wf:intent` and `wf:getState`**

Replace (originally line 1324 and line 1363):

```ts
ipcMain.on('wf:intent', (_e, track: TrackId, type: Intent) => processIntent(track, type))
```

```ts
ipcMain.handle('wf:getState', (_e, track?: TrackId): LiveState => renderState(track ?? 'main'))
```

- [ ] **Step 2: `wf:getInfo`**

Replace (originally lines 1326-1334) — `getInfo` stays Main-only (it feeds the "Displays" panel and startup info, unrelated to Second):

```ts
ipcMain.handle('wf:getInfo', (): AppInfo => ({
  song: tracks.main.song,
  state: renderState('main'),
  displays: describeDisplays(),
  outputs: outputWins.size,
  startupMs: Date.now() - startTime,
  appVersion: app.getVersion(),
  isPackaged: app.isPackaged
}))
```

- [ ] **Step 3: The `wf:live:load*` handlers**

Replace (originally lines 1337-1361):

```ts
// --- Live engine ---
ipcMain.handle('wf:live:loadText', (_e, track: TrackId, title: string, body: string, background?: string | null) => {
  doLoadText(track, title, body, background ?? null); broadcast()
})

ipcMain.handle('wf:live:loadCountdown', (_e, track: TrackId, seconds: number) => {
  doLoadCountdown(track, seconds); broadcast()
})

ipcMain.handle('wf:live:loadScripture', async (_e, track: TrackId, reference: string): Promise<boolean> => {
  const ok = await doLoadScripture(track, reference)
  if (ok) broadcast()
  return ok
})

ipcMain.handle('wf:live:loadSong', async (_e, track: TrackId, id: number) => {
  await doLoadSong(track, id); broadcast()
})

ipcMain.handle('wf:live:loadMedia', (_e, track: TrackId, filePath: string, title: string) => {
  doLoadMedia(track, filePath, title); broadcast()
})

ipcMain.handle('wf:live:loadAnnouncement', async (_e, track: TrackId, id: number) => {
  await doLoadAnnouncement(track, id); broadcast()
})
```

- [ ] **Step 4: `wf:live:setItemId` / `setFontScale` / `saveFontScale` / `setStageMessage`**

Replace (originally lines 1371-1395) — `recordingSession.onItemLive` stays gated to `track === 'main'` here, since this is the one place it's currently wired:

```ts
ipcMain.handle('wf:live:setItemId', (_e, track: TrackId, id: number | null) => {
  const t = tracks[track]
  t.serviceItemId = id
  const item = id != null ? activeServiceItems.find((it) => it.id === id && it.track === track) : undefined
  t.itemNotes = item?.notes ?? null
  applyItemTheme(track, item)
  broadcast()
  if (item && track === 'main') {
    void recordingSession.onItemLive(item, activeServiceId, activeServiceName, activeServiceDate)
  }
})

ipcMain.handle('wf:live:setFontScale', (_e, track: TrackId, scale: number) => {
  tracks[track].fontScale = Math.min(14, Math.max(3, scale))
  broadcast()
})

ipcMain.handle('wf:live:saveFontScale', (_e, track: TrackId) => {
  const t = tracks[track]
  if (t.songId == null) return
  setSongFontScale(t.songId, t.fontScale)
})

ipcMain.handle('wf:live:setStageMessage', (_e, track: TrackId, msg: string | null) => {
  tracks[track].stageMessage = msg || null
  broadcast()
})
```

- [ ] **Step 5: `wf:live:goLiveAt` and `wf:live:setBackground`**

Replace (originally lines 1834-1839):

```ts
ipcMain.handle('wf:live:goLiveAt', async (_e, track: TrackId, itemId: number, slideIndex: number) => {
  await handleTabletLoadItem(track, itemId)  // loads the item live (index 0) + broadcasts + resolves theme
  const t = tracks[track]
  const last = t.song.lines.length - 1
  t.index = Math.max(0, Math.min(slideIndex, last < 0 ? 0 : last))
  broadcast()
})
```

Replace (originally lines 1852-1855):

```ts
// Push a background update to whatever's currently live on this track, without
// resetting slide index/timer/other live state.
ipcMain.handle('wf:live:setBackground', (_e, track: TrackId, path: string) => {
  const t = tracks[track]
  t.song = { ...t.song, background: path }
  broadcast()
})
```

- [ ] **Step 6: `wf:service:slides` — no change needed**

`wf:service:slides` (lines 1825-1833) computes slides for every go-live item in a service regardless of track — it's already track-agnostic and correct as-is (it doesn't touch live state). No edit.

- [ ] **Step 7: `refreshActiveServiceItems`**

Replace (originally lines 1421-1441) — now refreshes `activeZoneTrackAssignment` and re-applies theme for whichever track(s) currently have a live item:

```ts
// Rebuilds activeServiceItems (and dependent theme/notes/zone-track state) from the
// DB. This is the cache handleTabletLoadItem/computeZoneStates read to resolve an
// item id into its type/routing when going live — it does NOT update itself
// when items are added/edited in Build Service, so callers must explicitly
// refresh it after any such change or newly-added items silently fail to go
// live (found in the UI, invisible to the live-routing layer).
function refreshActiveServiceItems(serviceId: number): void {
  const svc = getService(serviceId)
  activeServiceId = serviceId
  activeServiceItems = (svc as { items: ServiceItem[] } | null)?.items ?? []
  activeServiceName = (svc as { name?: string } | null)?.name ?? ''
  activeServiceDate = (svc as { service_date?: string | null } | null)?.service_date ?? null
  serviceSlideTheme = (svc as { theme?: string | null } | null)?.theme || DEFAULT_THEME_ID
  serviceSlideThemeColors = (svc as { themeColors?: ThemeColors | null } | null)?.themeColors ?? null
  activeZoneTrackAssignment = parseZoneTrackAssignment(getZoneTrackAssignment(serviceId))
  for (const track of ['main', 'second'] as TrackId[]) {
    const t = tracks[track]
    if (t.serviceItemId != null) {
      const item = activeServiceItems.find((it) => it.id === t.serviceItemId && it.track === track)
      t.itemNotes = item?.notes ?? null
      applyItemTheme(track, item)
    }
  }
  broadcast()  // projector needs the new theme, not just the tablet
}
```

Add `getZoneTrackAssignment` to the `db.ts` import block (near `getItemZoneRouting`/`setItemZoneRouting`, around line 50-51 of the import list).

- [ ] **Step 8: `wf:setActiveService` — clear both tracks**

Replace (originally lines 1443-1456):

```ts
ipcMain.handle('wf:setActiveService', (_e, serviceId: number | null) => {
  loggedSongIds.clear()  // new/switched service → start CCLI counting fresh
  if (serviceId == null) {
    activeServiceId = null
    activeServiceItems = []
    activeServiceName = ''
    activeServiceDate = null
    activeZoneTrackAssignment = { ...DEFAULT_ZONE_TRACK }
    tracks.main.itemNotes = null
    tracks.second.itemNotes = null
    void recordingSession.onServiceEnded()  // stop OBS + write the marker sidecar
    broadcast()  // push the cleared service to tablet/zones/projector
    return
  }
  refreshActiveServiceItems(serviceId)
})
```

Add `DEFAULT_ZONE_TRACK` to the `import type { ... } from '../shared/types'` block if not already present (it should already be there from Task 4's edit — confirm, don't duplicate).

- [ ] **Step 9: `wf:service:addItem` / `wf:service:reorder`**

Find the existing `wf:service:addItem` and `wf:service:reorder` IPC handlers (search for `ipcMain.handle('wf:service:addItem'` and `ipcMain.handle('wf:service:reorder'` in `src/main/index.ts`). Update each to pass a `track` argument through to the now-track-aware `addServiceItem`/`reorderServiceItems` db functions:

```ts
ipcMain.handle('wf:service:addItem', (_e, serviceId: number, item: NewServiceItem) => {
  const id = addServiceItem(serviceId, item)
  return id
})
```

(No signature change needed here — `NewServiceItem.track` from Task 1 already flows through; the renderer sets `item.track` before calling. Confirm this handler simply forwards `item` unchanged.)

```ts
ipcMain.handle('wf:service:reorder', (_e, serviceId: number, track: TrackId, orderedIds: number[]) => {
  reorderServiceItems(serviceId, track, orderedIds)
})
```

- [ ] **Step 10: New `wf:service:zoneTrackAssignment:get` / `:set` IPC**

Add these two handlers right after the existing `wf:zone:getIp` handler (after line 1702):

```ts
// --- Per-service zone→track assignment ---
ipcMain.handle('wf:service:zoneTrackAssignment:get', (_e, serviceId: number): ZoneTrackAssignment => {
  return parseZoneTrackAssignment(getZoneTrackAssignment(serviceId))
})

ipcMain.handle('wf:service:zoneTrackAssignment:set', (_e, serviceId: number, assignment: ZoneTrackAssignment): void => {
  if (!validateZoneTrackAssignment(assignment)) throw new Error('Invalid zone track assignment')
  setZoneTrackAssignment(serviceId, JSON.stringify(assignment))
  if (serviceId === activeServiceId) {
    activeZoneTrackAssignment = assignment
    zoneBroadcast()
  }
})
```

Add `validateZoneTrackAssignment` to the `import { parseZoneTrackAssignment } from '../shared/zoneTrack'` line (Task 4, Step 1) — change it to:

```ts
import { parseZoneTrackAssignment, validateZoneTrackAssignment } from '../shared/zoneTrack'
```

Add `getZoneTrackAssignment` and `setZoneTrackAssignment` to the `db.ts` import block.

- [ ] **Step 11: `wf:app:restoreRecovery` — restore both tracks**

Replace (originally lines 1716-1742):

```ts
ipcMain.handle('wf:app:restoreRecovery', async (): Promise<{ ok: boolean; restored?: boolean; fallback?: boolean }> => {
  // At this point, the renderer has been created and activeServiceItems is populated
  const recovered = readRecovery()
  if (!recovered) return { ok: true, restored: false }

  let restoredAny = false
  let fallbackAny = false

  const restoreTrack = async (track: TrackId, snap: { liveServiceItemId: number | null; slideIndex: number } | null): Promise<void> => {
    if (!snap?.liveServiceItemId) return
    const item = activeServiceItems.find((i) => i.id === snap.liveServiceItemId && i.track === track)
    if (item) {
      await handleTabletLoadItem(track, item.id)
      const t = tracks[track]
      if (snap.slideIndex >= 0 && snap.slideIndex < t.song.lines.length) {
        t.index = snap.slideIndex
      }
      restoredAny = true
    } else {
      // Item was deleted; load first same-track item as fallback
      const firstItem = activeServiceItems.find((i) => i.track === track)
      if (firstItem) {
        await handleTabletLoadItem(track, firstItem.id)
        tracks[track].index = 0
        fallbackAny = true
      }
    }
  }

  await restoreTrack('main', recovered.main)
  await restoreTrack('second', recovered.second)
  broadcast()
  return { ok: true, restored: restoredAny, fallback: fallbackAny }
})
```

- [ ] **Step 12: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck:node`
Expected: PASS with zero errors. If any remain, they're leftover references to the old singulars — grep `src/main/index.ts` for `liveSong\b`, `liveServiceItemId`, `liveFontScale`, `liveSongTextColor`, `liveSongFont`, `liveBgFit`, `liveStageMessage`, `liveSongMeta`, `liveSlideTheme`, `liveSlideThemeColors`, `liveItemNotes`, `hmsLoadedAt`, `autoAdvanceMs`, `liveScriptureRef`, `verseNumber`, `countdownTimer`, `autoAdvanceTimer`, `autoAdvanceDuration`, `autoAdvanceLoop`, `\bstate\.` (the old `{ mode, index }` singleton) and fix each remaining site the same way Task 5/6 fixed the others.

- [ ] **Step 13: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(dual-track): thread track through IPC handlers, add zone-track-assignment IPC"
```

---

### Task 9: Preload API surface

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Update `sendIntent` / `onState` / `getState`**

Replace (originally lines 34, 41):

```ts
  sendIntent: (track: TrackId, type: Intent): void => ipcRenderer.send('wf:intent', track, type),
```

```ts
  getState: (track?: TrackId): Promise<{ main: LiveState; second: LiveState | null }> => ipcRenderer.invoke('wf:getState', track),
```

Note: `getState`'s return shape changes — previously `Promise<LiveState>`, now the IPC handler (Task 8 Step 1) still returns a single `LiveState` for a given track (`renderState(track ?? 'main')`), so keep `getState`'s type as `Promise<LiveState>` unchanged:

```ts
  getState: (track?: TrackId): Promise<LiveState> => ipcRenderer.invoke('wf:getState', track),
```

`onState` (originally line 35-40) changes its callback payload shape — the `wf:state` push now sends `{ main, second }` (Task 6 Step 4), not a bare `LiveState`:

```ts
  onState: (cb: (s: { main: LiveState; second: LiveState | null }) => void): (() => void) => {
    const listener = (_e: unknown, s: { main: LiveState; second: LiveState | null }): void => cb(s)
    ipcRenderer.on('wf:state', listener)
    return () => ipcRenderer.removeListener('wf:state', listener)
  },
```

(Keep whatever the existing listener-registration body actually does — this reproduces the described pattern from the explore report; if the real body differs slightly, preserve its exact unsubscribe mechanism and only change the callback's parameter type.)

- [ ] **Step 2: Update the `wf:live:*` methods**

Replace (originally lines 58, 124-137, 143):

```ts
  liveLoadAnnouncement: (track: TrackId, id: number): Promise<void> => ipcRenderer.invoke('wf:live:loadAnnouncement', track, id),
  liveSetItemId: (track: TrackId, id: number | null): Promise<void> => ipcRenderer.invoke('wf:live:setItemId', track, id),
  liveGoLiveAt: (track: TrackId, itemId: number, slideIndex: number): Promise<void> =>
    ipcRenderer.invoke('wf:live:goLiveAt', track, itemId, slideIndex),
  liveSetFontScale: (track: TrackId, scale: number): Promise<void> => ipcRenderer.invoke('wf:live:setFontScale', track, scale),
  liveSaveFontScale: (track: TrackId): Promise<void> => ipcRenderer.invoke('wf:live:saveFontScale', track),
  liveSetStageMessage: (track: TrackId, msg: string | null): Promise<void> => ipcRenderer.invoke('wf:live:setStageMessage', track, msg),
  liveLoadSong: (track: TrackId, id: number): Promise<void> => ipcRenderer.invoke('wf:live:loadSong', track, id),
  liveLoadScripture: (track: TrackId, reference: string): Promise<boolean> =>
    ipcRenderer.invoke('wf:live:loadScripture', track, reference),
  liveLoadText: (track: TrackId, title: string, body: string, background?: string | null): Promise<void> =>
    ipcRenderer.invoke('wf:live:loadText', track, title, body, background),
  liveLoadCountdown: (track: TrackId, seconds: number): Promise<void> =>
    ipcRenderer.invoke('wf:live:loadCountdown', track, seconds),
  liveLoadMedia: (track: TrackId, filePath: string, title: string): Promise<void> =>
    ipcRenderer.invoke('wf:live:loadMedia', track, filePath, title),
  liveSetBackground: (track: TrackId, path: string): Promise<void> =>
    ipcRenderer.invoke('wf:live:setBackground', track, path),
```

- [ ] **Step 3: `serviceReorder` and new zone-track-assignment methods**

Replace `serviceReorder` (originally line 82):

```ts
  serviceReorder: (serviceId: number, track: TrackId, orderedIds: number[]): Promise<void> =>
    ipcRenderer.invoke('wf:service:reorder', serviceId, track, orderedIds),
```

Add near the `zoneGetIp` method (after line 280):

```ts
  zoneTrackAssignmentGet: (serviceId: number): Promise<ZoneTrackAssignment> =>
    ipcRenderer.invoke('wf:service:zoneTrackAssignment:get', serviceId),
  zoneTrackAssignmentSet: (serviceId: number, assignment: ZoneTrackAssignment): Promise<void> =>
    ipcRenderer.invoke('wf:service:zoneTrackAssignment:set', serviceId, assignment),
```

- [ ] **Step 4: Import `TrackId` / `ZoneTrackAssignment`**

Add `TrackId` to the existing `../shared/types` import and add a new import line for `ZoneTrackAssignment`:

```ts
import type { ZoneTrackAssignment } from '../shared/zoneTrack'
```

- [ ] **Step 5: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck:node && npm run typecheck:web`
Expected: `typecheck:node` passes. `typecheck:web` now fails everywhere the renderer calls the changed `window.wf` methods without a `track` arg — that's every remaining task.

- [ ] **Step 6: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat(dual-track): thread track through the window.wf preload API"
```

---

### Task 9B: Fix the other consumers of `onState`/`getState`/action methods (Main-only)

**Why this task exists:** Task 9 changed `wf:state`'s push payload from a bare `LiveState` to `{ main: LiveState, second: LiveState | null }`, and gave every `wf:live:*`/`wf:intent` method a leading `track` argument. `grep -rn "onState" src/renderer/src` turns up **11** files, not just the 3 covered by Tasks 12-13 (`SlideGrid.tsx`, `LiveTools.tsx`, `ServiceEditor.tsx`). The other 6 real consumers — `Output.tsx` (the audience projector window), `Stage.tsx` (the stage-confidence display), `ServiceRail.tsx` (the shell's output preview thumbnail), `OutputPreview.tsx`, `VolunteerView.tsx` (the simplified Volunteer-mode operator UI), and `drawer/BackgroundsDrawerTab.tsx` — all read Main state only and must keep doing so; they are not becoming track-aware. `browserWfMock.ts` (the `npm run dev` browser-preview stand-in for `window.wf`) also implements the old signatures and must be updated or browser-preview mode silently misbehaves (a `track` string would land in a numeric `id` parameter). Skipping this task leaves a real compile break in 7 files and a silent runtime bug in the mock.

**Files:**
- Modify: `src/renderer/src/Output.tsx`
- Modify: `src/renderer/src/Stage.tsx`
- Modify: `src/renderer/src/ServiceRail.tsx`
- Modify: `src/renderer/src/OutputPreview.tsx`
- Modify: `src/renderer/src/VolunteerView.tsx`
- Modify: `src/renderer/src/drawer/BackgroundsDrawerTab.tsx`
- Modify: `src/renderer/src/browserWfMock.ts`

- [ ] **Step 1: `Output.tsx` — read Main out of the new push shape**

In `src/renderer/src/Output.tsx`, replace lines 89-90:

```ts
    const off = window.wf.onState((s) => apply(s.main))
    window.wf.getState('main').then(apply)
```

(Keep `apply`'s own definition and body unchanged — it still receives a plain `LiveState`, just sourced from `.main` now.)

- [ ] **Step 2: `Stage.tsx` — same, plus the two reads inside the callback**

In `src/renderer/src/Stage.tsx`, replace lines 14-19:

```ts
    const off = window.wf.onState((s) => {
      setLive(s.main)
      // Auto-show new messages (clear dismissed state when message changes).
      setMsgDismissed((prev) => (prev !== s.main.stageMessage ? null : prev))
    })
    window.wf.getState('main').then(setLive)
```

- [ ] **Step 3: `ServiceRail.tsx`**

In `src/renderer/src/ServiceRail.tsx`, replace lines 17-18:

```ts
    const off = window.wf.onState((s) => setLive(s.main))
    window.wf.getState('main').then(setLive)
```

- [ ] **Step 4: `OutputPreview.tsx` — state read + the three `sendIntent` calls**

In `src/renderer/src/OutputPreview.tsx`, replace lines 11-12:

```ts
    const off = window.wf.onState((s) => setS(s.main))
    window.wf.getState('main').then(setS)
```

Replace lines 40-42:

```tsx
        <button onClick={() => window.wf.sendIntent('main', 'black')} title="Black" className="hover:text-slate-900"><MonitorOff size={14} /></button>
        <button onClick={() => window.wf.sendIntent('main', 'logo')} title="Logo" className="hover:text-slate-900"><ImageIcon size={14} /></button>
        <button onClick={() => window.wf.sendIntent('main', 'lyrics')} title="Clear / lyrics" className="hover:text-slate-900"><Play size={14} /></button>
```

- [ ] **Step 5: `drawer/BackgroundsDrawerTab.tsx`**

Replace lines 29-30:

```ts
    window.wf.getState('main').then(setLive)
    const off = window.wf.onState((s) => setLive(s.main))
```

Replace line 53:

```ts
      await window.wf.liveSetBackground('main', action.path)
```

- [ ] **Step 6: `VolunteerView.tsx` — state read + every action-method call**

Replace lines 105-106:

```ts
    const off = window.wf.onState((s) => setLive(s.main))
    window.wf.getState('main').then(setLive)
```

Replace each of the following (same line numbers as found by the earlier grep — search for the exact old text within this file and replace it, since surrounding code between them is unrelated and must stay untouched):

- Line 48: `await window.wf.liveLoadSong(item.ref_id)` → `await window.wf.liveLoadSong('main', item.ref_id)`
- Line 52: `const ok = await window.wf.liveLoadScripture(ref)` → `const ok = await window.wf.liveLoadScripture('main', ref)`
- Lines 55-58 (the `liveLoadText(...)` call spanning multiple args): add `'main',` as the first argument, i.e. `await window.wf.liveLoadText('main', ...)` keeping its existing title/body/background arguments unchanged.
- Line 63: `await window.wf.liveLoadCountdown(secs)` → `await window.wf.liveLoadCountdown('main', secs)`
- Line 67: `await window.wf.liveLoadMedia(p, item.title)` → `await window.wf.liveLoadMedia('main', p, item.title)`
- Line 69: `await window.wf.liveLoadCountdown((item.payload.seconds as number) ?? 300)` → `await window.wf.liveLoadCountdown('main', (item.payload.seconds as number) ?? 300)`
- Line 73: `await window.wf.liveLoadText('Announcement', txt)` → `await window.wf.liveLoadText('main', 'Announcement', txt)`
- Line 75: `await window.wf.liveLoadAnnouncement(item.ref_id)` → `await window.wf.liveLoadAnnouncement('main', item.ref_id)`
- Line 77: `window.wf.sendIntent('logo')` → `window.wf.sendIntent('main', 'logo')`
- Line 81: `window.wf.liveSetItemId(item.id)` → `window.wf.liveSetItemId('main', item.id)`
- Line 127: `const send = (type: Intent): void => window.wf.sendIntent(type)` → `const send = (type: Intent): void => window.wf.sendIntent('main', type)`

- [ ] **Step 7: `browserWfMock.ts` — match the new signatures**

In `src/renderer/src/browserWfMock.ts`:

Add `track: 'main'` to the seed `ServiceItem` literal (line 106-116, inside the `services` array) — it's now a required field:

```ts
      {
        id: 1,
        ordinal: 1,
        type: 'song',
        ref_id: 1,
        payload: {},
        title: 'Amazing Grace',
        notes: null,
        style: null,
        zoneRouting: null,
        track: 'main'
      }
```

Replace the `sendIntent`/`onState`/`getState` entries (lines 197-214) — the mock only ever simulates Main; `second` is always `null` since browser-preview mode has no dual-track engine:

```ts
    sendIntent: (_track: TrackId, type: Intent): void => {
      if (type === 'next') {
        const index = Math.min(liveState.index + 1, liveState.total - 1)
        publish({ index, line: demoLines[index] ?? '', next: demoLines[index + 1] ?? '' })
      } else if (type === 'prev') {
        const index = Math.max(liveState.index - 1, 0)
        publish({ index, line: demoLines[index] ?? '', next: demoLines[index + 1] ?? '' })
      } else {
        publish({ mode: type })
      }
    },
    onState: (cb: (s: { main: LiveState; second: LiveState | null }) => void): (() => void) => {
      const wrapped = (main: LiveState): void => cb({ main, second: null })
      stateListeners.add(wrapped)
      wrapped(clone(liveState))
      return () => stateListeners.delete(wrapped)
    },
    getInfo: async (): Promise<AppInfo> => appInfo(),
    getState: async (_track?: TrackId): Promise<LiveState> => clone(liveState),
```

(`stateListeners` is typed `Set<(state: LiveState) => void>` at line 122 — no change needed there since `wrapped` matches that signature; only the public `onState` API's callback shape changes.)

Replace the `liveSetItemId`/`liveGoLiveAt`/`liveSetFontScale`/`liveSaveFontScale`/`liveSetStageMessage`/`liveLoadSong`/`liveLoadScripture`/`liveLoadText`/`liveLoadCountdown`/`liveLoadMedia` entries (lines 309-324) — each gains a leading `_track: TrackId` parameter it ignores (the mock has no second track to route to):

```ts
    liveSetItemId: async (_track: TrackId, id: number | null): Promise<void> => publish({ liveServiceItemId: id }),
    liveGoLiveAt: async (_track: TrackId, _itemId: number, slideIndex: number): Promise<void> => {
      const index = Math.max(0, Math.min(slideIndex, demoLines.length - 1))
      publish({ index, line: demoLines[index] ?? '', next: demoLines[index + 1] ?? '' })
    },
    liveSetFontScale: async (_track: TrackId, scale: number): Promise<void> => publish({ fontScale: scale }),
    liveSaveFontScale: noop,
    liveSetStageMessage: async (_track: TrackId, msg: string | null): Promise<void> => publish({ stageMessage: msg }),
    liveLoadSong: async (_track: TrackId, id: number): Promise<void> => {
      const song = songs.find((s) => s.id === id)
      if (song) publish({ songTitle: song.title, index: 0, line: demoLines[0], next: demoLines[1], total: demoLines.length })
    },
    liveLoadScripture: async (_track: TrackId, reference: string): Promise<boolean> => { publish({ songTitle: reference, line: 'Browser preview scripture text.', next: '', total: 1, index: 0 }); return true },
    liveLoadText: async (_track: TrackId, title: string, body: string): Promise<void> => publish({ songTitle: title || 'Announcement', line: body || title, next: '', total: 1, index: 0 }),
    liveLoadCountdown: async (_track: TrackId, seconds: number): Promise<void> => publish({ mode: 'countdown', songTitle: 'Countdown', line: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, next: '', total: 1, index: 0 }),
    liveLoadMedia: async (_track: TrackId, _filePath: string, title: string): Promise<void> => publish({ songTitle: title || 'Media', line: '', next: '', total: 1, index: 0 }),
```

Replace `liveSetBackground` (line 327) and `serviceReorder` (line 292) and `featuresStartAutoAdvance`/`featuresStopAutoAdvance` (lines 353-354) — all become no-ops that accept (and ignore) the extra leading argument, which `noop`'s existing signature (`async (): Promise<void> => {}`) already tolerates structurally since the mock object is cast with `as Window['wf']`; no code change is actually required for these four since `noop` ignores all arguments already — **confirm this by typechecking, do not add unnecessary wrapper code.**

Add the two new methods near `zoneGetIp` (after line 414):

```ts
    zoneTrackAssignmentGet: async (): Promise<import('../../shared/zoneTrack').ZoneTrackAssignment> =>
      ({ 1: 'main', 2: 'second', 3: 'main', 4: 'main' }),
    zoneTrackAssignmentSet: noop,
```

Add `TrackId` to the `import type { ... } from '../../shared/types'` block (line 1-27).

- [ ] **Step 8: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck:web`
Expected: PASS with zero errors in all 7 files touched by this task. Any remaining errors should only be in files covered by Tasks 10-14 (not yet done at this point if executing in order) — if executing tasks in the order they appear in this plan, Tasks 10-14 come after this one, so at this checkpoint errors may still exist in `ServiceDeck.tsx`, `ZonePanel.tsx`, etc. Confirm specifically that `Output.tsx`, `Stage.tsx`, `ServiceRail.tsx`, `OutputPreview.tsx`, `VolunteerView.tsx`, `BackgroundsDrawerTab.tsx`, and `browserWfMock.ts` report zero errors.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/Output.tsx src/renderer/src/Stage.tsx src/renderer/src/ServiceRail.tsx src/renderer/src/OutputPreview.tsx src/renderer/src/VolunteerView.tsx src/renderer/src/drawer/BackgroundsDrawerTab.tsx src/renderer/src/browserWfMock.ts
git commit -m "fix(dual-track): update Main-only onState consumers and the browser-preview mock for the new track-aware API"
```

---

### Task 10: Renderer — `liveActions.ts`

**Files:**
- Modify: `src/renderer/src/liveActions.ts`

- [ ] **Step 1: Add `track` param to `sendItemLive`**

Replace the full contents of `src/renderer/src/liveActions.ts`:

```ts
import type { ServiceItem, TrackId } from '../../shared/types'

// Shared live-load helpers used by both LiveView and the service deck builder.

// Resolves the background file an item's slide thumbnail should show. Text-item
// backgrounds live on the item itself; song backgrounds live on the referenced
// song record, so callers must supply a songId -> background lookup for those.
export function itemThumbBackground(item: ServiceItem, songBg: Record<number, string | null>): string | null {
  if (item.type === 'text') return (item.payload?.background as string | undefined) ?? null
  if (item.type === 'song' && item.ref_id != null) return songBg[item.ref_id] ?? null
  return null
}

export function canGoLive(item: ServiceItem): boolean {
  return (
    (item.type === 'song' && item.ref_id != null) ||
    (item.type === 'scripture' && !!(item.payload.reference as string)) ||
    (item.type === 'text' && !!((item.payload.title as string) || (item.payload.body as string))) ||
    (item.type === 'countdown' && (item.payload.seconds as number) > 0) ||
    (item.type === 'image' && !!(item.payload.path as string)) ||
    (item.type === 'welcome' && (item.payload.seconds as number) > 0) ||
    (item.type === 'ticker' && !!(item.payload.text as string)) ||
    (item.type === 'announcement' && item.ref_id != null) ||
    (item.type === 'sermon')
  )
}

export async function sendItemLive(item: ServiceItem, track: TrackId): Promise<boolean> {
  if (item.type === 'song' && item.ref_id != null) {
    await window.wf.liveLoadSong(track, item.ref_id)
  } else if (item.type === 'scripture') {
    const ref = item.payload.reference as string
    if (!ref) return false
    // A failed lookup must NOT mark the item live — that would leave the previous
    // content on screen re-themed as scripture while the deck says scripture is live.
    const ok = await window.wf.liveLoadScripture(track, ref)
    if (!ok) return false
  } else if (item.type === 'text') {
    await window.wf.liveLoadText(
      track,
      (item.payload.title as string) ?? '',
      (item.payload.body as string) ?? '',
      (item.payload.background as string) ?? null
    )
  } else if (item.type === 'countdown') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return false
    await window.wf.liveLoadCountdown(track, secs)
  } else if (item.type === 'image') {
    const p = item.payload.path as string
    if (!p) return false
    await window.wf.liveLoadMedia(track, p, item.title)
  } else if (item.type === 'welcome') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return false
    await window.wf.liveLoadCountdown(track, secs)
  } else if (item.type === 'ticker') {
    const txt = item.payload.text as string
    if (!txt) return false
    await window.wf.liveLoadText(track, 'Announcement', txt)
  } else if (item.type === 'announcement' && item.ref_id != null) {
    await window.wf.liveLoadAnnouncement(track, item.ref_id)
  } else if (item.type === 'sermon') {
    window.wf.sendIntent(track, 'logo')
  } else {
    return false
  }
  await window.wf.liveSetItemId(track, item.id)
  return true
}
```

- [ ] **Step 2: Fix the two remaining `sendItemLive` call sites that don't go through `ServiceEditor.tsx`**

`grep -rn "sendItemLive" src/renderer/src` turns up two more callers beyond `ServiceEditor.tsx` (fixed in Task 12) that must pass a track now that `sendItemLive` requires one. Both are part of the main operator shell (not the new dual-track UI), so both pass `'main'`.

In `src/renderer/src/ServiceRail.tsx`, replace line 42:

```ts
      sendItemLive(it, 'main')
```

In `src/renderer/src/drawer/addAndGoLive.ts`, replace line 33:

```ts
    const wentLive = await sendItemLive(item, 'main')
```

- [ ] **Step 3: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck:web`
Expected: `ServiceRail.tsx` and `drawer/addAndGoLive.ts` report zero errors related to `sendItemLive`. (`ServiceRail.tsx`'s `onState`/`getState` calls are fixed separately in Task 9B — if executing tasks in order, Task 9B already ran before this one, so this file should be fully clean at this point.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/liveActions.ts src/renderer/src/ServiceRail.tsx src/renderer/src/drawer/addAndGoLive.ts
git commit -m "feat(dual-track): sendItemLive takes a track parameter"
```

---

### Task 11: Renderer — `ServiceDeck.tsx` track tabs

**Files:**
- Modify: `src/renderer/src/ServiceDeck.tsx`

- [ ] **Step 1: Add a `track` prop, filter items, tab strip**

Replace the full contents of `src/renderer/src/ServiceDeck.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { Music, BookOpen, Type, Timer, Image as ImageIcon, Hand, ScrollText, Megaphone, GripVertical, Play, X, Plus, ListMusic, Mic } from 'lucide-react'
import type { ServiceFull, ServiceItem, SongSummary, AnnouncementSummary, TrackId } from '../../shared/types'
import type { SceneConfig } from '../../shared/zoneScenes'
import { effectiveRouting, matchScene } from '../../shared/zoneScenes'
import ZoneStripBadge from './ZoneStripBadge'

type IconType = ComponentType<{ size?: number | string; className?: string }>

const TYPE_ICON: Record<ServiceItem['type'], IconType> = {
  song: Music, scripture: BookOpen, text: Type, countdown: Timer, image: ImageIcon, welcome: Hand, ticker: ScrollText, announcement: Megaphone, sermon: Mic
}

const ADD_TYPES: { type: ServiceItem['type']; label: string; Icon: IconType }[] = [
  { type: 'scripture', label: 'Scripture', Icon: BookOpen },
  { type: 'text',      label: 'Text',      Icon: Type },
  { type: 'countdown', label: 'Countdown', Icon: Timer },
  { type: 'image',     label: 'Image/Video', Icon: ImageIcon },
  { type: 'welcome',   label: 'Welcome',   Icon: Hand },
  { type: 'ticker',    label: 'Ticker',    Icon: ScrollText },
  { type: 'sermon',    label: 'Sermon',    Icon: Mic },
]

function itemPreview(it: ServiceItem): string {
  const p = it.payload ?? {}
  if (it.type === 'text') {
    const body = (p.body as string | undefined) ?? ''
    return body ? body.slice(0, 50) + (body.length > 50 ? '…' : '') : ''
  }
  if (it.type === 'scripture') return (p.reference as string | undefined) ?? ''
  if (it.type === 'countdown' || it.type === 'welcome') {
    const secs = (p.seconds as number | undefined) ?? 300
    const mins = Math.round(secs / 60)
    return `${mins} minute${mins !== 1 ? 's' : ''}`
  }
  if (it.type === 'ticker') return (p.text as string | undefined)?.slice(0, 50) ?? ''
  if (it.type === 'sermon') return (p.title as string | undefined) ?? 'Sermon'
  return ''
}

function ServiceDeck({ service, track, onTrackChange, songs, announcements, liveItemId, selectedId, onSelect, onAdd, onAddSong, onAddAnnouncement, onGoLive, onDelete, onReordered }: {
  service: ServiceFull
  track: TrackId
  onTrackChange: (track: TrackId) => void
  songs: SongSummary[]
  announcements: AnnouncementSummary[]
  liveItemId: number | null
  selectedId: number | null
  onSelect: (id: number) => void
  onAdd: (type: ServiceItem['type']) => void
  onAddSong: (songId: number) => void
  onAddAnnouncement: (announcementId: number) => void
  onGoLive: (item: ServiceItem) => void
  onDelete: (item: ServiceItem) => void
  onReordered: () => void
}): JSX.Element {
  const [dragId, setDragId] = useState<number | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [sceneConfig, setSceneConfig] = useState<SceneConfig | null>(null)
  useEffect(() => { void window.wf.scenesGet().then(setSceneConfig) }, [service])
  const items = service.items.filter((it) => it.track === track)
  const hasSecond = service.items.some((it) => it.track === 'second')

  const onDrop = (targetId: number): void => {
    if (dragId == null || dragId === targetId) return
    const ids = items.map((i) => i.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    ids.splice(to, 0, ids.splice(from, 1)[0])
    setDragId(null)
    window.wf.serviceReorder(service.id, track, ids).then(onReordered)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Track tabs — Second only appears once the service actually has second-track items,
          or once you're currently viewing it (so you can still see/empty it). */}
      {(hasSecond || track === 'second') && (
        <div className="mb-2 flex gap-1 rounded-lg bg-slate-100 p-1">
          {(['main', 'second'] as TrackId[]).map((tb) => (
            <button
              key={tb}
              onClick={() => onTrackChange(tb)}
              className={`flex-1 rounded-md py-1 text-xs font-semibold transition-colors ${
                track === tb ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tb === 'main' ? 'Main' : 'Second'}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto pr-1">
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ListMusic size={28} className="mb-3 text-slate-400" />
            <p className="text-sm text-slate-500">{track === 'main' ? 'Your service is empty' : 'No second-track items yet'}</p>
            <p className="mt-1 text-xs text-slate-400">Click &quot;Add item&quot; below to get started</p>
          </div>
        )}
        {items.map((it, i) => {
          const preview = itemPreview(it)
          const Icon = TYPE_ICON[it.type]
          return (
            <div
              key={it.id}
              draggable
              onDragStart={() => setDragId(it.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(it.id)}
              onClick={() => onSelect(it.id)}
              className={`group mb-1.5 flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                selectedId === it.id
                  ? 'border-blue-500/30 bg-blue-500/[0.07] ring-1 ring-blue-500/30'
                  : 'border-slate-200 bg-white hover:bg-slate-100'
              } ${dragId === it.id ? 'opacity-40' : ''}`}
            >
              <div className="flex w-5 flex-shrink-0 flex-col items-center">
                <GripVertical size={13} className="text-slate-400 group-hover:text-slate-600" />
              </div>
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <Icon size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">{it.title || it.type}</div>
                <div className="flex items-center gap-1.5 truncate text-xs text-slate-600">
                  <span className="truncate">{it.type} · #{i + 1}{preview ? ` · ${preview}` : ''}</span>
                  {sceneConfig && (() => {
                    const routing = effectiveRouting(it, sceneConfig)
                    const matched = matchScene(routing, it.type, sceneConfig)
                    const name = matched === 'custom' ? 'Custom' : sceneConfig.scenes.find((s) => s.id === matched)?.name
                    return (
                      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-slate-400">
                        <ZoneStripBadge routing={routing} title={name} />
                      </span>
                    )
                  })()}
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {liveItemId === it.id ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    LIVE
                  </span>
                ) : (
                  <>
                    <button
                      onClick={() => onGoLive(it)}
                      className="text-slate-400 opacity-0 hover:text-blue-700 group-hover:opacity-100"
                      title="Go live"
                    ><Play size={14} /></button>
                    <button
                      onClick={() => onDelete(it)}
                      className="text-slate-400 opacity-0 hover:text-red-600 group-hover:opacity-100"
                      title="Delete"
                    ><X size={14} /></button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {showAdd ? (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900">What do you want to add?</span>
            <button onClick={() => setShowAdd(false)} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
              <X size={12} /> Close
            </button>
          </div>
          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Song from library</label>
            <select
              value=""
              onChange={(e) => { if (e.target.value) { onAddSong(Number(e.target.value)); setShowAdd(false) } }}
              className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-900 outline-none hover:bg-slate-200"
            >
              <option value="">Choose a song…</option>
              {songs.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>
          {announcements.length > 0 && (
            <div className="mb-3">
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Announcement from library</label>
              <select
                value=""
                onChange={(e) => { if (e.target.value) { onAddAnnouncement(Number(e.target.value)); setShowAdd(false) } }}
                className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-900 outline-none hover:bg-slate-200"
              >
                <option value="">Choose an announcement…</option>
                {announcements.map((a) => <option key={a.id} value={a.id}>{a.title}{a.expired ? ' (expired)' : ''}</option>)}
              </select>
            </div>
          )}
          <div className="mb-1.5 text-xs font-semibold text-slate-600">Or add another item type</div>
          <div className="grid grid-cols-3 gap-2">
            {ADD_TYPES.map((a) => (
              <button
                key={a.type}
                onClick={() => { onAdd(a.type); setShowAdd(false) }}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                <a.Icon size={13} />
                {a.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-blue-500/50 hover:text-blue-700"
        >
          <Plus size={15} /> Add item
        </button>
      )}
    </div>
  )
}

export default ServiceDeck
```

Note the Add-item panel now needs a way to start a Second track from empty (there's no Second tab to click until an item exists). Add a small "+ Second track" link at the bottom of the Main tab's Add-item panel — insert this button right after the "Or add another item type" grid, still inside the `showAdd` block, only rendered when `track === 'main' && !hasSecond`:

```tsx
          {track === 'main' && !hasSecond && (
            <button
              onClick={() => { onTrackChange('second'); setShowAdd(false) }}
              className="mt-3 w-full text-center text-xs font-medium text-blue-700 hover:underline"
            >
              + Start a Second track (independent second screen)
            </button>
          )}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/ServiceDeck.tsx
git commit -m "feat(dual-track): ServiceDeck gets Main/Second track tabs"
```

---

### Task 12: Renderer — `ServiceEditor.tsx` wiring

**Files:**
- Modify: `src/renderer/src/ServiceEditor.tsx`

- [ ] **Step 1: Add track state, pass `track`/`onTrackChange` to `ServiceDeck`, tag new items with the active track**

In `src/renderer/src/ServiceEditor.tsx`, add a `track` state variable near the other `useState` calls (after line 24, `const [confirmDeleteItem, ...] = useState<ServiceItem | null>(null)`):

```ts
  const [track, setTrack] = useState<TrackId>('main')
```

Add `TrackId` to the type import (line 2):

```ts
import type { LiveState, ServiceFull, ServiceItem, SongFull, SongSummary, AnnouncementSummary, TrackId } from '../../shared/types'
```

Reset `track` to `'main'` whenever the service changes — in the `useEffect` at lines 36-43, add `setTrack('main')` alongside `setSelectedId(null)`:

```ts
  useEffect(() => {
    window.wf.setActiveService(serviceId)
    reload()
    window.wf.songsList().then(setSongs)
    window.wf.announcementsList().then(setAnnouncements)
    setSelectedId(null)
    setTrack('main')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId])
```

Update `addCard`/`addSong`/`addAnnouncement` (lines 62-87) to stamp the new item with the currently active tab's track:

```ts
  const addCard = async (type: ServiceItem['type']): Promise<void> => {
    if (type === 'image') {
      const result = await window.wf.dialogOpenFile()
      if (result.canceled || !result.filePaths[0]) return
      const id = await window.wf.serviceAddItem(serviceId, { type: 'image', payload: { path: result.filePaths[0] }, track })
      await reload()
      setSelectedId(id)
      return
    }
    const payload: Record<string, unknown> = (type === 'countdown' || type === 'welcome') ? { seconds: 300 } : {}
    const id = await window.wf.serviceAddItem(serviceId, { type, payload, track })
    await reload()
    setSelectedId(id)
  }

  const addSong = async (songId: number): Promise<void> => {
    const id = await window.wf.serviceAddItem(serviceId, { type: 'song', ref_id: songId, track })
    await reload()
    setSelectedId(id)
  }

  const addAnnouncement = async (announcementId: number): Promise<void> => {
    const id = await window.wf.serviceAddItem(serviceId, { type: 'announcement', ref_id: announcementId, track })
    await reload()
    setSelectedId(id)
  }
```

Update the `ServiceDeck` mount (lines 122-135) to pass `track`/`onTrackChange`:

```tsx
          <ServiceDeck
            service={service}
            track={track}
            onTrackChange={setTrack}
            songs={songs}
            announcements={announcements}
            liveItemId={live?.liveServiceItemId ?? null}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onAdd={addCard}
            onAddSong={addSong}
            onAddAnnouncement={addAnnouncement}
            onGoLive={(it) => sendItemLive(it, it.track)}
            onDelete={delItem}
            onReordered={reload}
          />
```

Note `onGoLive` now passes `it.track` (the item's own track, not the currently-selected tab) to `sendItemLive` — an item always goes live on its own track regardless of which tab you're viewing, so a stray click can't cross-wire tracks.

The `live?.liveServiceItemId` reference above only reflects Main (per Task 9's `getState`/`onState` now returning `{main, second}` — see Task 13 for how `live` itself is restructured in this file). For this task, leave `liveItemId` passed to `ServiceDeck` as `live?.liveServiceItemId ?? null` unchanged in meaning — Task 13 fixes `live`'s shape here since `ServiceEditor.tsx` also has its own `useEffect(() => { const off = window.wf.onState(setLive) ...`. Update that `onState`/`getState` pair now (lines 45-49) since it's in this same file:

```ts
  const [live, setLive] = useState<{ main: LiveState; second: LiveState | null } | null>(null)
```

(change the `useState<LiveState | null>(null)` declaration at line 21 to the above), and:

```ts
  useEffect(() => {
    const off = window.wf.onState(setLive)
    window.wf.getState('main').then((s) => setLive({ main: s, second: null }))
    return off
  }, [])
```

Then update every other read of `live` in this file (`live?.liveServiceItemId` at line 126 and the `selectedSongFull`-adjacent none) to `live?.main.liveServiceItemId`. Search this file for `live?.` and `live.` after this change and fix each to go through `.main` (Build Service only ever shows Main's live indicator in the deck — Second's live indicator isn't needed here since Build Service isn't the Live tab).

- [ ] **Step 2: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck:web`
Expected: errors remaining only in `SlideGrid.tsx`/`LiveTools.tsx`/`LiveView.tsx`/`ZonePanel.tsx` — fixed in Tasks 13-14.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/ServiceEditor.tsx
git commit -m "feat(dual-track): ServiceEditor wires track tabs into add-item and deck"
```

---

### Task 13: Renderer — Live tab split (SlideGrid, LiveTools, LiveView, SecondTrackTools)

**Files:**
- Modify: `src/renderer/src/SlideGrid.tsx`
- Modify: `src/renderer/src/LiveTools.tsx`
- Modify: `src/renderer/src/LiveView.tsx`
- Create: `src/renderer/src/SecondTrackTools.tsx`

- [ ] **Step 1: `SlideGrid.tsx` — add `track` prop**

Replace the full contents of `src/renderer/src/SlideGrid.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { Music, BookOpen, Type, Timer, Image as ImageIcon, Hand, ScrollText, Megaphone, Play, Mic } from 'lucide-react'
import type { LiveState, ServiceItem, TrackId } from '../../shared/types'
import { useService } from './ServiceContext'
import SlideThumb from './SlideThumb'
import { canGoLive, itemThumbBackground } from './liveActions'

type IconType = ComponentType<{ size?: number | string; className?: string }>

const ICON: Record<ServiceItem['type'], IconType> = {
  song: Music, scripture: BookOpen, text: Type, countdown: Timer, image: ImageIcon, welcome: Hand, ticker: ScrollText, announcement: Megaphone, sermon: Mic
}

// The Live tab's main area: each item a panel of clickable slide thumbnails.
// Used for both the Main and Second columns — `track` selects which live
// cursor/state this instance follows and drives.
function SlideGrid({ track }: { track: TrackId }): JSX.Element {
  const { activeService } = useService()
  const [live, setLive] = useState<LiveState | null>(null)
  const [slides, setSlides] = useState<Record<number, string[]>>({})
  const [songBg, setSongBg] = useState<Record<number, string | null>>({})
  const liveRowRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const off = window.wf.onState((s) => setLive(track === 'main' ? s.main : s.second))
    window.wf.getState(track).then(setLive)
    return off
  }, [track])

  useEffect(() => {
    window.wf.songsList().then((list) => {
      const map: Record<number, string | null> = {}
      list.forEach((s) => { map[s.id] = s.background ?? null })
      setSongBg(map)
    })
  }, [activeService?.id, activeService?.items.length])

  useEffect(() => {
    if (activeService == null) { setSlides({}); return }
    window.wf.serviceSlides(activeService.id).then((rows) => {
      const map: Record<number, string[]> = {}
      rows.forEach((r) => { map[r.id] = r.slides })
      setSlides(map)
    })
  }, [activeService?.id, activeService?.items.length])

  useEffect(() => {
    liveRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [live?.liveServiceItemId])

  const liveItemId = live?.liveServiceItemId ?? null
  const liveIndex = live?.index ?? -1

  if (!activeService) {
    return <div className="flex h-full min-w-0 flex-1 items-center justify-center text-sm text-slate-500">No service loaded — pick one in the Services tab.</div>
  }

  const items = activeService.items.filter((it) => it.track === track).filter(canGoLive)

  return (
    <div className="h-full min-h-0 min-w-0 flex-1 space-y-3 overflow-auto p-3">
      {items.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-500">
          {track === 'main' ? 'This service has no go-live items yet.' : 'No second-track items yet — add some in Build Service.'}
        </p>
      )}
      {items.map((it) => {
        const its = slides[it.id] ?? ['']
        const isLiveItem = liveItemId === it.id
        const Icon = ICON[it.type]
        const bgFile = itemThumbBackground(it, songBg)
        return (
          <div key={it.id} ref={isLiveItem ? liveRowRef : null} className="card-lg">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-900">
              <Icon size={13} className="shrink-0 text-slate-600" />
              <span className="truncate">{it.title}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {its.map((slideText, idx) => {
                const isLiveSlide = isLiveItem && liveIndex === idx
                return (
                  <button
                    key={idx}
                    onClick={() => window.wf.liveGoLiveAt(track, it.id, idx)}
                    aria-label={`Play slide ${idx + 1} of ${its.length}`}
                    className={`overflow-hidden rounded-md transition-shadow min-h-10 cursor-pointer group relative ${isLiveSlide ? 'ring-2 ring-blue-500' : 'ring-1 ring-slate-200 hover:ring-blue-400/50'}`}
                    title={`Click to play slide ${idx + 1}`}
                  >
                    <SlideThumb label={slideText} itemStyle={it.style} serviceTheme={activeService.theme} serviceColors={activeService.themeColors} bgFile={bgFile} />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play size={20} className="text-white" fill="currentColor" />
                    </div>
                    <div className="bg-[#e9ecf1] px-1.5 py-0.5 text-left text-[9px] text-slate-500">{idx + 1}</div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default SlideGrid
```

- [ ] **Step 2: `LiveTools.tsx` — add `track` prop, thread it through every `window.wf` call**

Replace the full contents of `src/renderer/src/LiveTools.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { MonitorOff, Image as ImageIcon, Play, Timer, ChevronUp, ChevronDown, Keyboard, FileText, Tablet, FolderOpen } from 'lucide-react'
import type { AppInfo, LiveState, TrackId } from '../../shared/types'
import ObsPanel from './ObsPanel'
import ZonePanel from './ZonePanel'
import { useService } from './ServiceContext'
import { PresenterPanel } from './PresenterPanel'
import { StageMessagePanel } from './StageMessagePanel'
import { ScripturePanel } from './ScripturePanel'
import { TimingPanel } from './TimingPanel'

// The Live tab's right-hand control panel for the Main track: stage message,
// scripture, font, auto-advance, OBS, and a collapsible "More" with the
// rarely-used controls. (Second track gets the leaner SecondTrackTools.)
function LiveTools({ track }: { track: TrackId }): JSX.Element {
  const { activeService, reloadActiveService } = useService()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [live, setLive] = useState<LiveState | null>(null)
  const [scriptureRef, setScriptureRef] = useState('')
  const [stageMsg, setStageMsg] = useState('')
  const [msgSent, setMsgSent] = useState(false)
  const [tabletUrl, setTabletUrl] = useState('')
  const [autoAdvanceSecs, setAutoAdvanceSecs] = useState('10')
  const [autoAdvanceLoop, setAutoAdvanceLoop] = useState(false)
  const [bibleTranslation, setBibleTranslation] = useState<'kjv' | 'web' | 'bbe'>('kjv')
  const [showCheatSheet, setShowCheatSheet] = useState(false)
  const [serviceLog, setServiceLog] = useState<Array<{ ts: number; event: string }>>([])
  const [showMore, setShowMore] = useState(false)

  useEffect(() => {
    window.wf.getInfo().then(setInfo)
    const t = setTimeout(() => window.wf.getInfo().then(setInfo), 900)
    const off = window.wf.onState((s) => setLive(track === 'main' ? s.main : s.second))
    window.wf.getTabletUrl().then(setTabletUrl)
    return () => { clearTimeout(t); off() }
  }, [track])
  useEffect(() => { if (live?.songTitle) window.wf.getInfo().then(setInfo) }, [live?.songTitle])
  useEffect(() => { if (!live?.stageMessage) setStageMsg('') }, [live?.stageMessage])

  const liveItem = activeService?.items.find((it) => it.id === live?.liveServiceItemId && it.track === track) ?? null

  const hmsElapsedSecs = live?.hmsLoadedAt ? Math.floor((Date.now() - live.hmsLoadedAt) / 1000) : 0
  const autoAdvanceRunning = live?.autoAdvanceMs != null && live.autoAdvanceMs > 0

  const quickScripture = async (): Promise<void> => {
    const ref = scriptureRef.trim()
    if (!ref) return
    // On a failed lookup keep the typed reference and leave the current item live
    // rather than clearing both silently.
    const ok = await window.wf.liveLoadScripture(track, ref)
    if (!ok) return
    window.wf.liveSetItemId(track, null)
    setScriptureRef('')
  }
  const sendStageMessage = (preset?: string): void => {
    const msg = (preset ?? stageMsg).trim()
    if (!msg) return
    window.wf.liveSetStageMessage(track, msg)
    setMsgSent(true); setTimeout(() => setMsgSent(false), 3000)
  }
  const clearStageMessage = (): void => { setStageMsg(''); window.wf.liveSetStageMessage(track, null) }

  return (
    <aside className="flex w-96 shrink-0 flex-col gap-4 overflow-auto border-l border-slate-200 bg-[#f4f6f9] p-4">
      {/* Emergency controls */}
      <div className="flex gap-2">
        <button
          onClick={() => window.wf.sendIntent(track, 'black')}
          className="flex-1 btn bg-black text-white border-white/20"
        >
          <MonitorOff size={14} /> Black
        </button>
        <button
          onClick={() => window.wf.sendIntent(track, 'logo')}
          className="flex-1 btn"
        >
          <ImageIcon size={14} /> Logo
        </button>
        <button
          onClick={() => window.wf.sendIntent(track, 'lyrics')}
          className="flex-1 btn-primary"
        >
          <Play size={14} /> Live
        </button>
      </div>

      {/* Keyboard shortcut strip */}
      <div className="flex justify-around rounded-lg border border-slate-200 bg-slate-100/70 px-2 py-1.5 text-[10px] text-slate-500">
        <span><span className="font-bold text-slate-600">Space</span> Next</span>
        <span><span className="font-bold text-slate-600">←→</span> Prev/Next</span>
        <span><span className="font-bold text-slate-600">B</span> Black</span>
        <span><span className="font-bold text-slate-600">L</span> Logo</span>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-200" />

      {/* Presenter notes + timer */}
      <PresenterPanel liveState={live} liveItem={liveItem} />

      {/* Stage message + presets */}
      <StageMessagePanel
        inputValue={stageMsg}
        liveMessage={live?.stageMessage ?? null}
        msgSent={msgSent}
        onInputChange={setStageMsg}
        onSendMessage={sendStageMessage}
        onClearMessage={clearStageMessage}
      />

      {/* Divider */}
      <div className="border-t border-slate-200" />

      {/* Quick scripture + Bible translation */}
      <ScripturePanel
        scriptureRef={scriptureRef}
        bibleTranslation={bibleTranslation}
        onReferenceChange={setScriptureRef}
        onGoLive={quickScripture}
        onTranslationChange={(t) => { setBibleTranslation(t); window.wf.featuresSetBibleTranslation(t) }}
      />

      {/* Divider */}
      <div className="border-t border-slate-200" />

      {/* Text size + Auto-advance */}
      <TimingPanel
        fontScale={live?.fontScale ?? 6}
        autoAdvanceSecs={autoAdvanceSecs}
        autoAdvanceRunning={autoAdvanceRunning}
        autoAdvanceLoop={autoAdvanceLoop}
        liveState={live}
        onFontScaleDecrease={() => window.wf.liveSetFontScale(track, (live?.fontScale ?? 6) - 0.5)}
        onFontScaleIncrease={() => window.wf.liveSetFontScale(track, (live?.fontScale ?? 6) + 0.5)}
        onFontScaleSave={() => window.wf.liveSaveFontScale(track)}
        onAutoAdvanceSecsChange={setAutoAdvanceSecs}
        onAutoAdvanceStart={() => {
          const secs = parseFloat(autoAdvanceSecs)
          if (isNaN(secs) || secs <= 0 || secs > 3600) {
            alert('Auto-advance must be between 1 and 3600 seconds')
            return
          }
          window.wf.featuresStartAutoAdvance(track, secs * 1000, autoAdvanceLoop)
        }}
        onAutoAdvanceStop={() => window.wf.featuresStopAutoAdvance(track)}
        onAutoAdvanceLoopToggle={setAutoAdvanceLoop}
      />

      {/* Divider */}
      <div className="border-t border-slate-200" />

      {/* Status strip: hymn timer + verse */}
      {(hmsElapsedSecs > 0 || live?.verseNumber != null) && (
        <div className="flex gap-2 rounded-lg border border-slate-200 bg-slate-100/70 px-3 py-1.5 text-xs text-slate-600">
          {hmsElapsedSecs > 0 && <span className="inline-flex items-center gap-1 tabular-nums"><Timer size={12} /> {Math.floor(hmsElapsedSecs / 60)}:{String(hmsElapsedSecs % 60).padStart(2, '0')}</span>}
          {live?.verseNumber != null && <span>· Verse {live.verseNumber}</span>}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-slate-200" />

      <ObsPanel />

      <button onClick={() => setShowMore((v) => !v)} className="w-full btn">
        {showMore ? <><ChevronUp size={14} /> Less</> : <><ChevronDown size={14} /> More</>}
      </button>
      {showMore && (
        <div className="space-y-3">
          <button onClick={() => setShowCheatSheet(!showCheatSheet)} className="w-full btn-secondary text-xs"><Keyboard size={13} /> Keyboard Shortcuts</button>
          {showCheatSheet && (
            <div className="surface max-h-40 space-y-1 overflow-auto text-xs text-slate-600">
              <div><span className="font-semibold text-slate-700">Space / →</span> Next slide</div>
              <div><span className="font-semibold text-slate-700">←</span> Previous slide</div>
              <div><span className="font-semibold text-slate-700">B</span> Black screen</div>
              <div><span className="font-semibold text-slate-700">L</span> Logo screen</div>
              <div><span className="font-semibold text-slate-700">S</span> Back to lyrics</div>
            </div>
          )}
          <button onClick={() => window.wf.featuresGetServiceLog().then(setServiceLog)} className="w-full btn text-xs"><FileText size={13} /> View Service Log ({serviceLog.length})</button>
          <button onClick={() => window.wf.logsOpenFolder()} className="w-full btn text-xs"><FolderOpen size={13} /> Open Log Folder</button>
          {serviceLog.length > 0 && (
            <div className="surface max-h-32 space-y-0.5 overflow-auto text-xs text-slate-600">
              {serviceLog.slice(-10).reverse().map((e, i) => (
                <div key={i} className="text-slate-500"><span className="text-slate-400">{new Date(e.ts).toLocaleTimeString()}</span> {e.event}</div>
              ))}
            </div>
          )}
          <div className="rounded-lg border border-slate-200 bg-slate-100 p-2 text-xs text-slate-600">
            <div className="mb-1 font-semibold text-slate-700">Displays</div>
            <div><b className="text-slate-900">{info?.displays.length ?? '…'}</b> display(s) · <span className={info && info.outputs > 0 ? 'text-blue-700' : 'text-amber-700'}>{info?.outputs ?? 0} live</span></div>
            {info?.displays.map((d) => (<div key={d.id}>• {d.bounds.width}×{d.bounds.height}{d.primary && <span className="ml-1 text-blue-700">(primary)</span>}</div>))}
          </div>
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-2">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Tablet size={13} /> Tablet Remote</div>
            <div className="break-all rounded bg-slate-100 px-2 py-1 text-center font-mono text-[11px] text-blue-700">{tabletUrl || 'Starting server…'}</div>
            <div className="mt-1 text-[10px] text-slate-500">Open on an iPad/phone as a wireless stage monitor + remote.</div>
          </div>
        </div>
      )}

      {/* Zone display system */}
      <section className="rounded-xl border border-slate-200 bg-[#f4f6f9] p-3">
        <ZonePanel liveItem={liveItem} reloadActiveService={reloadActiveService} />
      </section>
    </aside>
  )
}

export default LiveTools
```

Note: `window.wf.featuresStartAutoAdvance`/`featuresStopAutoAdvance` are pre-existing preload methods (found in `src/preload/index.ts`, not covered by the earlier read excerpt) that must gain a leading `track: TrackId` param, mirroring their `wf:features:*` IPC handlers and the `armAutoAdvance`/`clearAutoAdvance` main-process functions from Task 5. Locate them (`grep -n "featuresStartAutoAdvance\|featuresStopAutoAdvance" src/preload/index.ts src/main/index.ts`) and apply the same `track` threading pattern used throughout Task 8/9: the IPC handler becomes `ipcMain.handle('wf:features:startAutoAdvance', (_e, track: TrackId, ms: number, loop: boolean) => armAutoAdvance(track, ms, loop))` (and stop → `clearAutoAdvance(track); broadcast()`), the preload method becomes `featuresStartAutoAdvance: (track: TrackId, ms: number, loop: boolean) => ipcRenderer.invoke('wf:features:startAutoAdvance', track, ms, loop)` / `featuresStopAutoAdvance: (track: TrackId) => ipcRenderer.invoke('wf:features:stopAutoAdvance', track)`.

- [ ] **Step 3: `LiveView.tsx` — split Main/Second columns**

Replace the full contents of `src/renderer/src/LiveView.tsx`:

```tsx
import SlideGrid from './SlideGrid'
import LiveTools from './LiveTools'
import SecondTrackTools from './SecondTrackTools'
import { useService } from './ServiceContext'

// The Live tab: the click-a-slide grid + the right-hand tools panel, for Main —
// plus, once a service has second-track items, a Second column reusing SlideGrid
// with a leaner SecondTrackTools rail. (The loaded service + output preview live
// in the shell's left rail — ServiceRail, in AppShell. The bottom content drawer
// is mounted app-wide in AppShell too, not here — see LiveDrawer.tsx.)
// Keyboard shortcuts (B/L/N/P/S) are handled globally in AppShell and always
// target the Main track.
function LiveView(): JSX.Element {
  const { activeService } = useService()
  const hasSecond = activeService?.items.some((it) => it.track === 'second') ?? false

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-h-0 min-w-0 flex-1">
        <SlideGrid track="main" />
        <LiveTools track="main" />
      </div>
      {hasSecond && (
        <div className="flex min-h-0 min-w-0 flex-1 border-l border-slate-300">
          <SlideGrid track="second" />
          <SecondTrackTools />
        </div>
      )}
    </div>
  )
}

export default LiveView
```

- [ ] **Step 4: Create `SecondTrackTools.tsx`**

Create `src/renderer/src/SecondTrackTools.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { MonitorOff, Image as ImageIcon, Play } from 'lucide-react'
import type { LiveState } from '../../shared/types'
import { useService } from './ServiceContext'
import { ScripturePanel } from './ScripturePanel'
import ZonePanel from './ZonePanel'

// The Second track's control rail — deliberately smaller than Main's LiveTools.
// No OBS/CCLI/hymn-timer/stage-message/tablet-remote: those stay Main-only
// (see docs/superpowers/specs/2026-07-24-dual-live-track-design.md, Non-goals).
function SecondTrackTools(): JSX.Element {
  const { activeService, reloadActiveService } = useService()
  const [live, setLive] = useState<LiveState | null>(null)
  const [scriptureRef, setScriptureRef] = useState('')
  const [bibleTranslation, setBibleTranslation] = useState<'kjv' | 'web' | 'bbe'>('kjv')

  useEffect(() => {
    const off = window.wf.onState((s) => setLive(s.second))
    window.wf.getState('second').then(setLive)
    return off
  }, [])

  const liveItem = activeService?.items.find((it) => it.id === live?.liveServiceItemId && it.track === 'second') ?? null

  const quickScripture = async (): Promise<void> => {
    const ref = scriptureRef.trim()
    if (!ref) return
    const ok = await window.wf.liveLoadScripture('second', ref)
    if (!ok) return
    window.wf.liveSetItemId('second', null)
    setScriptureRef('')
  }

  return (
    <aside className="flex w-96 shrink-0 flex-col gap-4 overflow-auto border-l border-slate-200 bg-[#f4f6f9] p-4">
      <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Second Track</div>

      <div className="flex gap-2">
        <button onClick={() => window.wf.sendIntent('second', 'black')} className="flex-1 btn bg-black text-white border-white/20">
          <MonitorOff size={14} /> Black
        </button>
        <button onClick={() => window.wf.sendIntent('second', 'logo')} className="flex-1 btn">
          <ImageIcon size={14} /> Logo
        </button>
        <button onClick={() => window.wf.sendIntent('second', 'lyrics')} className="flex-1 btn-primary">
          <Play size={14} /> Live
        </button>
      </div>

      <div className="border-t border-slate-200" />

      <ScripturePanel
        scriptureRef={scriptureRef}
        bibleTranslation={bibleTranslation}
        onReferenceChange={setScriptureRef}
        onGoLive={quickScripture}
        onTranslationChange={(t) => setBibleTranslation(t)}
      />

      <div className="border-t border-slate-200" />

      <section className="rounded-xl border border-slate-200 bg-[#f4f6f9] p-3">
        <ZonePanel liveItem={liveItem} reloadActiveService={reloadActiveService} />
      </section>
    </aside>
  )
}

export default SecondTrackTools
```

Note `onTranslationChange` here is intentionally local-only (`setBibleTranslation`) rather than calling `window.wf.featuresSetBibleTranslation` — Bible translation is a single global operator setting (Task 5 Step 6 kept `bibleTranslation` global, not per-track), so Second's scripture panel reads/writes the same global setting Main's does; wire it identically to Main's `onTranslationChange={(t) => { setBibleTranslation(t); window.wf.featuresSetBibleTranslation(t) }}` instead of the simplified version above, to avoid two out-of-sync local copies of one global value:

```tsx
        onTranslationChange={(t) => { setBibleTranslation(t); window.wf.featuresSetBibleTranslation(t) }}
```

- [ ] **Step 5: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck:web`
Expected: errors remaining only in `ZonePanel.tsx` (Task 14) and the `featuresStartAutoAdvance`/`featuresStopAutoAdvance` sites if not yet fixed per Step 2's note.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/SlideGrid.tsx src/renderer/src/LiveTools.tsx src/renderer/src/LiveView.tsx src/renderer/src/SecondTrackTools.tsx src/preload/index.ts src/main/index.ts
git commit -m "feat(dual-track): split Live tab into Main/Second columns"
```

---

### Task 14: Renderer — `ZonePanel.tsx` track assignment

**Files:**
- Modify: `src/renderer/src/ZonePanel.tsx`

- [ ] **Step 1: Add a per-zone track selector**

Replace the full contents of `src/renderer/src/ZonePanel.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { ZoneId, ZoneState, ServiceItem, TrackId } from '../../shared/types'
import { ZONE_NAMES, DEFAULT_ZONE_TRACK } from '../../shared/types'
import type { ZoneTrackAssignment } from '../../shared/zoneTrack'
import { MODE_LABELS } from './ZoneRoutingGrid'
import SceneChips from './SceneChips'
import { useService } from './ServiceContext'

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

const MODE_COLORS: Record<ZoneState['mode'], string> = {
  lyrics:    'bg-blue-600 text-white',
  stage:     'bg-slate-100 text-slate-900',
  black:     'bg-slate-800 text-slate-200',
  logo:      'bg-slate-100 text-slate-900',
  countdown: 'bg-amber-600 text-white',
  text:      'bg-slate-100 text-slate-900',
  image:     'bg-slate-100 text-slate-900',
  off:       'bg-slate-200 text-slate-500',
}

function ZonePanel({ liveItem, reloadActiveService }: { liveItem: ServiceItem | null; reloadActiveService: () => void }): JSX.Element {
  const { activeService } = useService()
  const [zoneStates, setZoneStates] = useState<Record<ZoneId, ZoneState> | null>(null)
  const [serverIp, setServerIp] = useState<string>('...')
  const [port, setPort] = useState<number | null>(null)
  const [overridden, setOverridden] = useState<Set<ZoneId>>(new Set())
  const [trackAssignment, setTrackAssignment] = useState<ZoneTrackAssignment>(DEFAULT_ZONE_TRACK)
  const hasSecond = activeService?.items.some((it) => it.track === 'second') ?? false

  // Load zone states on mount and whenever live item changes.
  useEffect(() => {
    void window.wf.zoneGetStates().then(setZoneStates)
    void window.wf.zoneGetIp().then(setServerIp)
    void window.wf.getTabletPort().then(p => setPort(p)).catch(err => {
      console.error('Failed to get tablet port:', err)
      setPort(3691) // fallback
    })
  }, [])

  // Poll zone states every 2 seconds.
  useEffect(() => {
    const t = setInterval(() => {
      void window.wf.zoneGetStates().then(setZoneStates)
    }, 2000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (activeService == null) return
    void window.wf.zoneTrackAssignmentGet(activeService.id).then(setTrackAssignment)
  }, [activeService?.id])

  const setOverride = (zoneId: ZoneId, mode: ZoneState['mode'] | null): void => {
    setOverridden((prev) => {
      const next = new Set(prev)
      if (mode == null) next.delete(zoneId); else next.add(zoneId)
      return next
    })
    void window.wf.zoneSetOverride(zoneId, mode).then(() =>
      window.wf.zoneGetStates().then(setZoneStates)
    )
  }

  const clearOverrides = (): void => {
    setOverridden(new Set())
    void window.wf.zoneClearOverrides().then(() =>
      window.wf.zoneGetStates().then(setZoneStates)
    )
  }

  const setZoneTrack = (zoneId: ZoneId, track: TrackId): void => {
    if (activeService == null) return
    const next = { ...trackAssignment, [zoneId]: track }
    setTrackAssignment(next)
    void window.wf.zoneTrackAssignmentSet(activeService.id, next).then(() =>
      window.wf.zoneGetStates().then(setZoneStates)
    )
  }

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-600">Display Zones</span>
        <button
          onClick={clearOverrides}
          className="rounded px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          Clear overrides
        </button>
      </div>

      {/* Zone rows */}
      <div className="space-y-1.5">
        {ZONE_IDS.map((zoneId) => {
          const zs = zoneStates?.[zoneId]
          const mode = zs?.mode ?? 'off'
          return (
            <div key={zoneId} className="rounded-lg border border-slate-200 bg-slate-100 p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-500">Z{zoneId}</span>
                  <span className="text-xs font-medium text-slate-700">{ZONE_NAMES[zoneId]}</span>
                </div>
                <span className="flex items-center gap-1">
                  {overridden.has(zoneId) && (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-600">Manual</span>
                  )}
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${MODE_COLORS[mode]}`}>
                    {MODE_LABELS[mode]}
                  </span>
                </span>
              </div>
              {/* Track assignment — only shown once the service has a Second track */}
              {hasSecond && (
                <div className="mb-1.5 flex gap-1">
                  {(['main', 'second'] as TrackId[]).map((tb) => (
                    <button
                      key={tb}
                      onClick={() => setZoneTrack(zoneId, tb)}
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold ring-1 ring-slate-200 transition-colors ${
                        trackAssignment[zoneId] === tb ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {tb === 'main' ? 'Main' : 'Second'}
                    </button>
                  ))}
                </div>
              )}
              {/* Quick mode override buttons */}
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setOverride(zoneId, null)}
                  className="rounded px-2 py-0.5 text-[11px] text-slate-500 ring-1 ring-slate-200 hover:bg-slate-200 hover:text-slate-700"
                >
                  Auto
                </button>
                {/* 'stage' only renders on the Stage Monitor (zone 4); the flex/lyrics
                    zones have no stage layout and would show a blank screen. */}
                {((zoneId === 4 ? ['black', 'logo', 'lyrics', 'stage'] : ['black', 'logo', 'lyrics']) as ZoneState['mode'][]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setOverride(zoneId, m)}
                    className={`rounded px-2 py-0.5 text-[11px] ring-1 ring-slate-200 transition-colors ${
                      mode === m ? MODE_COLORS[m] : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                    }`}
                  >
                    {MODE_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Scene chips for the live item (same UI as Build Service) */}
      {liveItem && (
        <div className="rounded-lg border border-slate-200 bg-slate-100/70 p-2.5">
          <SceneChips
            item={liveItem}
            onChanged={() => {
              void window.wf.zoneGetStates().then(setZoneStates)
              reloadActiveService()
            }}
          />
        </div>
      )}

      {/* Pi network addresses */}
      <div className="rounded-lg border border-slate-200 bg-slate-100/70 p-2.5">
        <div className="mb-1.5 text-[11px] font-semibold text-slate-500">Pi Display URLs</div>
        <div className="space-y-1">
          {ZONE_IDS.map((zoneId) => (
            <div key={zoneId} className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400">Zone {zoneId} — {ZONE_NAMES[zoneId]}</span>
              <span className="font-mono text-[11px] text-blue-700">
                http://{serverIp}:{port ?? '...'}/zone/{zoneId}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ZonePanel
```

- [ ] **Step 2: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: PASS with zero errors, both `typecheck:node` and `typecheck:web`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/ZonePanel.tsx
git commit -m "feat(dual-track): ZonePanel gets per-zone Main/Second track assignment"
```

---

### Task 15: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite and typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck && npm test`
Expected: both PASS, including the new `src/shared/zoneTrack.test.ts` and the existing `src/shared/zoneScenes.test.ts` (unaffected).

- [ ] **Step 2: Start the app and confirm zero regression on a Main-only service**

Run: `cd C:\Dev\worshipflow && npm run dev`
Manually: open an existing service (or create one) with only Main-track items, as today. Confirm: Live tab shows a single column (no Second panel appears — `hasSecond` is false). Next/Back/Black/Logo/Live all work exactly as before. Build Service shows no track tabs (only appears once `hasSecond` is true or you're on the Second tab). This confirms the design's "byte-for-byte unchanged when a service has no Second-track items" success criterion.

- [ ] **Step 3: Build a service with both tracks**

Manually, in Build Service: on the Main tab, add a Sermon item (title) and a Song. Click "+ Start a Second track", then on the Second tab add two Scripture items (e.g. John 3:16, Romans 8:28). Confirm the Main tab still shows only its own two items, Second shows only its own two, and reordering one track's drag-and-drop never moves an item into the other track (drag a Second item — it should never appear in the Main list).

- [ ] **Step 4: Verify independent Live control**

Go to the Live tab. Confirm both columns now render (Main | Second, divided by the border). Go live with the Sermon item on Main. Independently, go live with John 3:16 on Second. Click Next on Second (advances to Romans 8:28) and confirm Main's slide/title is untouched. Click Black on Main and confirm Second's content keeps showing.

- [ ] **Step 5: Verify zone assignment reaches real screens**

In `ZonePanel` (visible in both the Main and Second tools rails), confirm the Main/Second track-assignment buttons appear (since the service now has second-track items) and default to `DEFAULT_ZONE_TRACK` (Z1/Z3/Z4 = Main, Z2 = Second). Open two browser tabs (or two Raspberry Pi browsers on the LAN) pointed at `http://<serverIp>:<port>/zone/1` and `http://<serverIp>:<port>/zone/2` (URLs are shown in the "Pi Display URLs" block). Confirm Zone 1 shows the live Main content (Sermon slide) and Zone 2 shows the live Second content (John 3:16) simultaneously. Change Zone 2's assignment to Main via the button and confirm it switches to mirror Zone 1 within ~2 seconds (the zone poll interval).

- [ ] **Step 6: Verify crash recovery**

With both tracks live (Main on the Sermon slide, Second on Romans 8:28, slide index > 0 on at least one), quit the app (`Ctrl+C` in the dev terminal or close the window) and restart with `npm run dev`. Confirm both tracks restore their exact live item and slide index — check the Live tab shows both columns already lit up correctly without manual re-triggering.

- [ ] **Step 7: Verify deleting all Second items collapses the UI back down**

Delete both Second-track items from Build Service. Confirm: the Second tab disappears from `ServiceDeck` (falls back to Main), the Live tab's Second column disappears, and any zone still assigned to `'second'` falls back to its idle default (off for zones 3/4, logo for zones 1/2) rather than erroring — matching the design's Error Handling section.

- [ ] **Step 8: Verify the Main-only surfaces touched by Task 9B still work**

Manually: open the projector output window (Black/Logo/Live buttons in `OutputPreview`) and confirm they still black/logo/unblank the Main track. Switch to Volunteer mode and confirm going an item live and Next/Prev still work (Volunteer mode only ever drives Main — confirm Second is untouched by it). Open the Backgrounds drawer tab while a song is live and change its background — confirm it updates the live Main slide. If a second physical/stage display is configured, confirm `Stage.tsx` still mirrors Main correctly. These all changed in Task 9B purely to match the new `onState`/action-method signatures and should behave identically to before this feature existed.

- [ ] **Step 9: Final commit**

If Steps 2-7 required any fixes, stage and commit them now with a message describing what was fixed. If no fixes were needed:

```bash
git log --oneline -20
```

Confirm the full commit sequence for this feature is present, then report completion.

---

## Summary of new/changed IPC channels

| Channel | Before | After |
|---|---|---|
| `wf:intent` | `(type)` | `(track, type)` |
| `wf:getState` | `()` | `(track?)` — default `'main'` |
| `wf:state` (push) | `LiveState` | `{ main: LiveState, second: LiveState \| null }` |
| `wf:live:loadText/loadCountdown/loadScripture/loadSong/loadMedia/loadAnnouncement` | `(...)` | `(track, ...)` |
| `wf:live:setItemId/setFontScale/saveFontScale/setStageMessage/goLiveAt/setBackground` | `(...)` | `(track, ...)` |
| `wf:service:reorder` | `(serviceId, orderedIds)` | `(serviceId, track, orderedIds)` |
| `wf:service:addItem` | `(serviceId, item)` | unchanged signature; `item.track` now honored |
| `wf:features:startAutoAdvance/stopAutoAdvance` | `(...)` | `(track, ...)` |
| `wf:service:zoneTrackAssignment:get` | — | new: `(serviceId) → ZoneTrackAssignment` |
| `wf:service:zoneTrackAssignment:set` | — | new: `(serviceId, assignment)` |
| `wf:zone:*` | unchanged | unchanged (overrides stay global/track-agnostic) |
