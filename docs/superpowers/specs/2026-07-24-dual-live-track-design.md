# Dual Live Track (independent second screen content) — Design

Date: 2026-07-24
Status: Approved (design), pending implementation plan

## Problem

Every screen WorshipFlow drives — Zones 1-4, the stage display, native output windows — ultimately reads one global "live" singleton (`liveServiceItemId`, `liveSong`, `state.mode/index`, etc. in `src/main/index.ts`). Zones can each show a different *role* for that one live item (content / logo / black, via the scene system), but they can never show genuinely different *content* at the same time.

The user's real case: sermon title on one TV, the verse the pastor is currently referencing on another TV, both changing independently while the sermon runs. The lyrics TV and back TVs will run as Raspberry Pi browsers pointed at `/zone/N` — this is the deployment path the design targets. (The native multi-monitor output windows still exist but are not the real deployment; they stay main-track-only and are out of scope for the new capability.)

## Solution overview (approved)

Introduce a second, fully independent live track. Each service can optionally have a **Second** track alongside the existing **Main** track — its own ordered slide list, its own live cursor, its own Next/Back. Each Zone (1-4) is assigned, per service, to follow either Main or Second. Two zones can therefore show two different, independently-advancing pieces of content at once.

- `TrackId = 'main' | 'second'` — exactly two tracks, fixed (not N-track general).
- Second track uses the same slide types as Main (song, scripture, text, countdown, image, welcome, ticker, announcement, sermon) — no new item type.
- Second track is optional per service: it only exists/shows in the UI once the service has at least one `track:'second'` item.
- Zone→track assignment is a per-service setting with a built-in default, editable in the Live tab.
- Live tab shows both tracks side by side, each with its own controls.

## Data model

**`service_item`** gains a column:
```sql
ALTER TABLE service_item ADD COLUMN track TEXT NOT NULL DEFAULT 'main';
```
Existing rows backfill to `'main'` automatically via the `DEFAULT` — zero behavior change for existing services.

**Ordering** moves from "one ordinal sequence per service" to "one ordinal sequence per `(service_id, track)`":
- `addServiceItem(serviceId, track, item)` — `ordinal = COALESCE(MAX(ordinal), -1) + 1` scoped to `service_id AND track`.
- `moveServiceItem(itemId, dir)` — adjacent-swap query gains `AND track = (SELECT track FROM service_item WHERE id = ?)` so it never swaps across tracks.
- `reorderServiceItems(serviceId, track, orderedIds)` — same bulk-reindex helper, now scoped by track; each track's ordinals are independently `0..n`.

**`service`** gains a column:
```sql
ALTER TABLE service ADD COLUMN zone_track_assignment TEXT;   -- nullable JSON
```
`null` (the default for every service, new or existing) means "use the built-in default." Editing it in the Live tab writes an explicit `Record<ZoneId, TrackId>` JSON — this is the "fixed default, editable per service" behavior. New services always start from the built-in default; there is no copy-forward from the previous service.

Built-in default (`src/shared/types.ts`):
```ts
export const DEFAULT_ZONE_TRACK: Record<ZoneId, TrackId> = { 1: 'main', 2: 'main', 3: 'main', 4: 'main' }
```
(All zones default to Main so an existing service's screens are byte-for-byte unchanged after upgrading — Second is opt-in per zone, per service. Revised from an earlier draft that defaulted Back Right to Second; that broke the byte-for-byte compatibility goal for any pre-existing service already routing content to Zone 2.)

## Shared types (`src/shared/types.ts`)

```ts
export type TrackId = 'main' | 'second'
```
- `ServiceItem` gains `track: TrackId`.
- `ZONE_ROUTING_DEFAULTS`, `ZoneMode`, `ZoneRouting`, the scene system (`zoneScenes.ts`) are all **unchanged** — track selects *which live item feeds a zone's "content" role*; scenes still decide *what role each zone plays for that item* (content/logo/black). The two concerns stay orthogonal, exactly as today's role logic works.

## Engine (`src/main/index.ts`)

The current module holds one flat set of "what's live" singletons (`liveSong`, `liveSongId`, `state`, `liveServiceItemId`, `liveFontScale`, `liveSongTextColor`, `liveSongFont`, `liveBgFit`, `liveStageMessage`, `liveSongMeta`, `liveSlideTheme`, `liveSlideThemeColors`, `hmsLoadedAt`, `autoAdvanceMs`, `liveScriptureRef`, `verseNumber`, `liveItemNotes`, `countdownTimer`, `autoAdvanceTimer`, `autoAdvanceDuration`, `autoAdvanceLoop`). These become one `LiveTrackState` interface, instantiated twice:

```ts
const tracks: Record<TrackId, LiveTrackState> = {
  main: createInitialTrackState(DEMO_SONG),
  second: createInitialTrackState(EMPTY_SONG)
}
```

Fields that are genuinely global stay global and shared by both tracks: `activeServiceItems`/`activeServiceId`/`activeServiceName`/`activeServiceDate` (the service cache — items already self-identify their track via the new column), `ccliLicense`, `logoPath`/`logoBg`, `loggedSongIds` (CCLI dedupe is per-song regardless of which track played it), `currentTheme` (operator UI theme), `serviceSlideTheme`/`serviceSlideThemeColors` (service baseline both tracks fall back to), `bibleTranslation`, `serviceLog`, `zoneOverrides` (manual zone force stays global and still wins over track routing), the OBS auto-switch state.

- `processIntent(track: TrackId, type: Intent)`, `doLoadText`, `doLoadCountdown`, `doLoadScripture`, `doLoadSong`, `doLoadAnnouncement`, `doLoadMedia`, `handleTabletLoadItem`, `applyItemTheme`, `clearSongMeta`, `clearCountdown`, `clearAutoAdvance`, `armAutoAdvance`, `goToStart`, `atEndOfContent`, `adjacentLiveItem`, `itemCanGoLive` all gain a leading `track: TrackId` parameter and read/write `tracks[track]` instead of the old singletons. `activeServiceItems.filter(it => it.track === track)` replaces the old flat list wherever a track needs "its" items (next/prev navigation, `handleTabletLoadItem` lookup).
- `renderState(track: TrackId = 'main')` — same shape (`LiveState`), now parameterized. Default keeps every existing single-track call site (operator/stage/output windows, `wf:getState`, `wf:getInfo`) working unchanged against Main.
- `broadcast()` computes both: `renderState('main')` and, only if the service has any second-track items, `renderState('second')`. Payload to `operatorWin`/`stageWin`/`outputWins` becomes `{ main: LiveState, second: LiveState | null }` over the same `wf:state` channel (stage window and native output windows only ever consume `.main`, unchanged from today — dual-track only reaches the audience via zones, per the non-goals below). `writeRecovery` and `zoneBroadcast` are updated per below. `tabletBroadcast` and `maybeAutoSwitchScene` stay Main-only (non-goal to extend the tablet remote or OBS auto-switching to Second).

**`computeZoneStates()`** — precedence is unchanged in kind, just re-anchored per zone:
1. `zoneOverrides.get(zoneId)` still wins outright (global, track-agnostic — an operator override always means "show this literal mode here" regardless of track).
2. Else resolve `trackForZone = zoneTrackAssignment[zoneId] ?? DEFAULT_ZONE_TRACK[zoneId]` from the active service's `zone_track_assignment`.
3. Use `tracks[trackForZone]` (via `renderState(trackForZone)`) and `activeServiceItems.filter(it => it.track === trackForZone)` in place of the old singular lookups — everything downstream (scene/role resolution, per-mode content population) is untouched.
4. Idle defaults (logo for 1-2, off for 3-4) apply per zone exactly as today when that zone's track has nothing live.

**Recovery** (`src/main/recovery.ts`) — `RecoverySnapshot` becomes:
```ts
export interface TrackSnapshot { liveServiceItemId: number | null; slideIndex: number; mode: string }
export interface RecoverySnapshot { main: TrackSnapshot; second: TrackSnapshot | null }
```
`writeRecovery` called from `broadcast()` with both tracks' current snapshot (`second: null` when the service has no second-track items). `wf:app:restoreRecovery` restores Main exactly as today, then — if `second` is present and the service has second-track items — runs the same restore logic (`handleTabletLoadItem('second', id)`, clamp slide index, fallback to first second-track item if the recovered item was deleted) a second time.

## Main process IPC

Every existing `wf:live:*` handler gains a leading `track: TrackId` argument (renderer always passes it explicitly — no implicit default needed since both call sites, Main panel and Second panel, are already track-aware components):
```
wf:live:loadText(track, title, body, background?)
wf:live:loadCountdown(track, seconds)
wf:live:loadScripture(track, reference) → Promise<boolean>
wf:live:loadSong(track, id)
wf:live:loadMedia(track, filePath, title)
wf:live:loadAnnouncement(track, id)
wf:live:setItemId(track, id: number|null)
wf:live:setFontScale(track, scale)
wf:live:saveFontScale(track)
wf:live:setStageMessage(track, msg)          // Second track: no-op / omitted from UI, see Non-goals
wf:live:goLiveAt(track, itemId, slideIndex)
wf:live:setBackground(track, path)
wf:intent(track, type: Intent)
wf:getState(track?) → LiveState               // default 'main', preserves old callers
```
New:
```
wf:service:addItem(serviceId, track, item)         // extends existing add-item path
wf:service:reorder(serviceId, track, orderedIds)    // extends reorderServiceItems
wf:service:zoneTrackAssignment:get(serviceId) → Record<ZoneId, TrackId>
wf:service:zoneTrackAssignment:set(serviceId, assignment) → void
```
`zoneSetOverride`/`clearOverrides`/`getStates`/`getIp` are unchanged (zone overrides stay global, track-agnostic).

## UI components

- **`ServiceDeck.tsx`** — gains a `track: TrackId` prop and a small two-tab strip ("Main" / "Second") above the list, mounted from `ServiceEditor.tsx`. The deck filters/reorders only its track's items; the existing "Add item" panel adds to whichever tab is active. `ItemEditor`/`SceneChips`/`ZoneStripBadge` need no changes — they already operate per-item.
- **`LiveView.tsx`** — becomes: Main column (`<SlideGrid track="main"/><LiveTools track="main"/>`, i.e. today's exact UI, threaded with an explicit track prop) plus, only when the active service has second-track items, a Second column reusing the same `SlideGrid` component (`track="second"`) and a new, deliberately smaller **`SecondTrackTools.tsx`** (Black/Logo/Live buttons + `ScripturePanel` — directly useful for jumping to a referenced verse — + `ZonePanel` filtered/badged to the zones currently assigned to Second). Second column omits OBS/CCLI/hymn-timer/stage-message/"More" sections — those stay Main-only (see Non-goals).
- **`SlideGrid`**, **`ScripturePanel`**, **`ZonePanel`** — thread a `track` prop through instead of reading the global live singleton; `window.wf.onState()` payload becomes `{main, second}` so these components pick their half.
- **`ZonePanel.tsx`** — each zone row gains a Main/Second track selector (small dropdown or two-way toggle) next to the existing mode-override buttons, reading/writing `zoneTrackAssignment` via the new IPC. The zone's badge shows which track it's currently bound to.

## Error handling

- Migration is additive-only (`DEFAULT 'main'` column, nullable `zone_track_assignment`) — no backfill script needed, no risk to existing services.
- A zone assigned to `'second'` when the service has no second-track items behaves exactly like "nothing live" does today (idle default: logo for 1-2, off for 3-4) — no new failure mode.
- Corrupt/unparseable `zone_track_assignment` → log, treat as missing (fall back to `DEFAULT_ZONE_TRACK`), same pattern as the existing `zone_scenes` parse-or-default handling.
- Recovery: if the recovered Second item was deleted, fall back to the first remaining second-track item (ordinal 0), or `second: null` if the track is now empty — mirrors the existing Main fallback logic exactly.

## Testing

- **Unit (vitest)**: `addServiceItem`/`moveServiceItem`/`reorderServiceItems` track-scoping (two tracks independently sequenced, ordinal collisions across tracks are fine); `computeZoneStates` track resolution precedence (override > explicit assignment > default); `zoneTrackAssignment` parse/validate/default-fallback; recovery snapshot round-trip with `second: null` and with a populated second track.
- **Manual**: build a service with a Main song list and a Second list of sermon/scripture slides; confirm the Live tab shows both panels only once Second has items; confirm Next/Back on one track never affects the other; assign one Pi zone to Main and another to Second and confirm both show correct, independently-advancing content simultaneously; kill and restart the app mid-service and confirm both tracks recover their position; confirm a service with no Second items behaves identically to today (no Second panel, no behavior change).

## Non-goals

- More than 2 tracks (N-track general system).
- Moving an item between tracks after creation (delete-and-recreate in the other track if needed).
- Extending the tablet remote, OBS auto-scene-switching, CCLI usage logging UI, hymn timer, or stage-message panel to Second — these stay Main-only; Second gets a leaner control surface (Next/Back/Black/Logo/Scripture-quick-load/Zone assignment).
- Extending the native multi-monitor output windows (`outputWins`) to show Second — those windows continue to mirror Main only. Second-track content only reaches audiences through Zone pages, matching the confirmed Pi-based deployment.
- One-tap "scene chip"-style UX for zone→track assignment — a plain dropdown in `ZonePanel` is sufficient for v1.
- Copy-forward of the previous service's zone→track assignment into new services.

## Success criteria

- A service can have an optional Second track: its own ordered slide list, built with the same slide types and editors as Main.
- The Live tab shows Main and Second as independent side-by-side panels (once Second has content), each with its own Next/Back/Live/preview — advancing one never touches the other.
- Each Zone (1-4) can be assigned, per service, to follow Main or Second; two zones assigned to different tracks show genuinely different, independently-advancing content at the same time on real Pi-driven TVs.
- Every existing single-track service and behavior is byte-for-byte unchanged when a service has no Second-track items.
- App restart/crash recovery restores both tracks' live position correctly.
