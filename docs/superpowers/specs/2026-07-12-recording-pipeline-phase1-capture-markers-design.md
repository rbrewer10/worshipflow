# Sermon Recording Pipeline — Phase 1: Capture & Markers

**Date:** 2026-07-12
**App:** WorshipFlow Pro (Electron + React + sql.js, controls OBS via obs-websocket)
**Status:** Design approved, ready for implementation plan

## Context

WorshipFlow Pro currently streams services to Facebook Live via OBS and records
nothing. The larger goal is an automated "service → polished sermon VOD on
YouTube" publishing pipeline. That pipeline is four subsystems, built in
dependency order; each is independently useful:

1. **Capture & Markers** (this spec) — record locally on service start; stamp
   sermon start/end + song boundaries from the live presentation timeline.
2. **Assembly** — bundled ffmpeg stitches intro + recording + outro, trims dead
   air to the markers, muxes the clean mixer audio.
3. **AI content** — transcript → title, description, timestamped chapters,
   captions (.srt), thumbnail.
4. **Publish** — one-click YouTube upload with everything attached.

Architecture decision (approved): **all in-app**. Single-operator church booth
wants one app and no second machine or cloud step to babysit.

Phase 1 is the foundation every later phase reads from. It is also valuable on
its own: after Phase 1 you have archived recordings plus an automatic chapter
list, with zero editing.

## Why WorshipFlow is uniquely positioned

The app is the thing driving the screen, so it *already knows* the service
timeline. [`sendItemLive()`](../../../src/renderer/src/liveActions.ts) is the
single chokepoint every item passes through when it goes on screen, and it calls
`liveSetItemId(item.id)`. Every item carries a `type` and a `title`. So markers
(sermon start, song boundaries → chapters) require no AI, ML, or audio analysis —
just stamping the moments the operator is already creating.

## Decisions (locked with user)

- **Recording trigger:** fully automatic. The first item going live in a service
  starts the recording; clearing/ending the service stops it. Pre-service
  countdown gets recorded and is trimmed later in Phase 2 using the markers.
- **Sermon boundary:** a new first-class **"Sermon" item type**. The operator
  drops it into the order of service like any other item. Sending it live shows
  logo/blank on screen and stamps the sermon-start marker. It cannot be forgotten
  because it lives in the plan, and it carries optional title/speaker/passage
  fields that later phases consume.

## Design

### 1. The "Sermon" item type

- Add `'sermon'` to `ServiceItemType`
  ([src/shared/types.ts:140](../../../src/shared/types.ts)).
- Add a `sermon` row to the zone-mode map
  ([src/shared/types.ts:211](../../../src/shared/types.ts)) that renders **logo**
  in content zones and `stage` in zone 4 — i.e. nothing distracting is projected
  during preaching. (Mirrors the `logo`/blank behavior; not a text slide.)
- Payload shape: `{ title?: string; speaker?: string; passage?: string }`. All
  optional in Phase 1; this is the natural home for the sermon title/scripture,
  and Phase 3's AI reads them as hints.
- A minimal Sermon editor exposes those three text fields.
- `canGoLive` returns `true` for `sermon` (always presentable).
- `sendItemLive` handles `sermon`: put the output into logo mode, then
  `liveSetItemId(item.id)` (same path as every other item — that call is what
  stamps the boundary marker).

### 2. Recording lifecycle — new main-process module `src/main/recording.ts`

Owns the recording session, the OBS record clock, and the DB rows.

- **Start:** on the first `liveSetItemId` of a service (transition from
  no-live-item → live-item), if the "Auto-record services" setting is on **and**
  OBS is connected, call `obsStartRecord()` and create a `recording` row linked to
  the active `service` id.
- **Stop:** on clear-service / end-service (the same broadcast that clears the
  live item), call `obsStopRecord()`, read `outputPath` from the `StopRecord`
  response (fallback: the `RecordStateChanged` stop event), and finalize the row
  (`ended_at`, `file_path`).
- **`t=0`:** taken from OBS's actual record-start time
  (`status.recordStartedAt` in [src/main/obs.ts](../../../src/main/obs.ts)) so
  marker offsets are exact even if start is slightly delayed.
- **Guards:**
  - OBS not connected at go-live → skip recording, emit an operator toast
    ("Recording skipped — OBS offline"); the service runs normally.
  - OBS already recording (operator started it manually) → adopt the existing
    recording rather than double-firing.
  - App or OBS crash mid-service → the `recording` row is left open; on next
    launch, reconcile any dangling row (mark `ended_at`, best-effort `file_path`
    from OBS record status).
  - No active `service` when the first item goes live → create an ad-hoc
    recording row not tied to a service id (nullable `service_id`).

### 3. Marker capture

- Markers are stamped in the **main process**, because it owns the record clock,
  the DB, and OBS. The renderer's live-set call is extended to carry
  `{ itemId, type, title }` (today it sends the id only).
- On each live item during an active recording: `offsetMs = Date.now() −
  recordStartedAt`; insert a `recording_marker` row.
- Every item is logged (each is a chapter candidate). The `sermon` item is
  flagged with `kind = 'sermon'`; songs get `kind = 'song'`; others
  `kind = 'item'`. Chapter derivation itself is Phase 3's job — Phase 1 just
  captures the raw, ordered, timestamped list.
- **Sermon *end* is derived, not separately stamped.** It is the offset of the
  next marker after the `sermon` marker, or the recording end if the sermon is
  the last item. Phases 2–3 use that to bound the sermon segment; Phase 1 only
  guarantees the sermon *start* marker exists.

### 4. Storage — SQLite tables + portable sidecar

Two new tables (alongside `service` / `service_item` in
[src/main/db.ts](../../../src/main/db.ts)):

```sql
CREATE TABLE IF NOT EXISTS recording (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id             INTEGER,            -- nullable (ad-hoc recordings)
  started_at             INTEGER NOT NULL,   -- epoch ms (app wall clock)
  ended_at               INTEGER,            -- epoch ms; null while open
  file_path              TEXT,               -- from OBS StopRecord.outputPath
  obs_record_started_ms  INTEGER NOT NULL    -- epoch ms; t=0 for marker offsets
);

CREATE TABLE IF NOT EXISTS recording_marker (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id  INTEGER NOT NULL,
  item_id       INTEGER,                     -- source service_item id, if any
  kind          TEXT NOT NULL,               -- 'sermon' | 'song' | 'item'
  label         TEXT NOT NULL,               -- item title at go-live time
  offset_ms     INTEGER NOT NULL             -- ms from obs_record_started_ms
);
```

- **Sidecar JSON:** when a recording stops, write `<video-basename>.worshipflow.json`
  next to the video file (in OBS's configured record folder, which the operator
  points at the NAS). Contents: service name, date, recording duration, and the
  full ordered marker list with offsets and the sermon boundary. This makes each
  recording **self-describing on disk** — Phase 2+ (and a human) can locate the
  sermon start and chapters without the app database. The DB is the source of
  truth; the sidecar is the portable artifact that travels with the file.

Sidecar shape:

```json
{
  "worshipflowVersion": "0.9.0",
  "service": { "id": 42, "name": "Sunday Morning", "date": "2026-07-19" },
  "recording": { "startedAt": 0, "durationMs": 5400000, "file": "2026-07-19.mkv" },
  "markers": [
    { "kind": "item", "label": "Countdown", "offsetMs": 0 },
    { "kind": "song", "label": "Amazing Grace", "offsetMs": 320000 },
    { "kind": "sermon", "label": "The Prodigal Son", "offsetMs": 1800000 }
  ]
}
```

### 5. Operator-facing UI (minimal in Phase 1)

- **Settings:** an "Auto-record services" toggle, plus a note that OBS's own
  record folder is the destination (point it at the NAS). Optionally surface
  OBS's current record path read-only for confirmation.
- **On-air indicator:** extend the existing "● REC" status
  ([src/renderer/src/ObsPanel.tsx](../../../src/renderer/src/ObsPanel.tsx) /
  topbar) to read e.g. "Recording — 4 chapters marked" so capture is visible
  live.
- **Recordings list:** a simple read-only list (service, date, duration, file
  path, marker count) so the operator can verify capture succeeded. Phases 2–4
  grow this into the publish workflow.

### 6. Testing (vitest; matches the existing 88-test setup)

- **Unit:** marker offset computation; lifecycle guards (OBS-offline,
  already-recording, no-active-service); sidecar JSON shape.
- **Sequence test:** simulate a service's ordered `sendItemLive` calls → assert
  the `recording_marker` rows and the sidecar contents, including the sermon
  boundary at the right offset.
- **Reconciliation test:** a dangling open `recording` row is closed on next
  launch.

## Non-goals for Phase 1 (explicitly deferred)

- Any video editing / trimming / muxing (Phase 2).
- Transcription, AI-generated title/description/chapters/captions, thumbnail
  (Phase 3).
- YouTube upload / OAuth (Phase 4).
- Deriving a final chapter list from markers (Phase 3 consumes the raw markers).
- Managing/enforcing OBS's record settings, codec, or folder — the operator
  configures OBS; WorshipFlow only starts/stops and reads the resulting path.

## Success criteria

Running a normal service with "Auto-record services" on and OBS connected
produces: (1) a video file in OBS's record folder, (2) a `recording` row with the
correct file path and duration, (3) `recording_marker` rows for every item in
go-live order with correct offsets and a `sermon` marker at the sermon boundary,
and (4) a matching `.worshipflow.json` sidecar next to the video. With OBS
offline, the service runs normally and the operator sees a "recording skipped"
toast.
