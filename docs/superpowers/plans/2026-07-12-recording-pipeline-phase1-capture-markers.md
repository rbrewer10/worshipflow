# Recording Pipeline Phase 1 — Capture & Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically record each service via OBS from the moment the first item goes live, and stamp sermon-start + song/item boundary markers from WorshipFlow's live timeline — persisted to SQLite and to a portable JSON sidecar beside the video.

**Architecture:** A new main-process module `recording.ts` owns a single recording session with all side-effects injected (OBS calls, DB writes, sidecar write, toast, clock) so it is fully unit-testable. It is driven by two existing IPC chokepoints in `src/main/index.ts`: `wf:live:setItemId` (first live item → start recording + every live item → stamp a marker) and `wf:setActiveService(null)` (service closed → stop). A new first-class `sermon` service-item type provides the sermon boundary; sending it live blanks the screen to the logo via the existing `sendIntent('logo')` and stamps a `sermon` marker.

**Tech Stack:** Electron (main/preload/renderer), TypeScript, React 18, sql.js (SQLite), obs-websocket-js, Vitest, Tailwind v3.

---

## File Structure

**Create:**
- `src/main/recording.ts` — recording-session state machine; pure orchestration with injected deps.
- `src/main/recording.test.ts` — Vitest unit + sequence tests for the session.
- `src/renderer/src/editors/SermonEditor.tsx` — title/speaker/passage editor for the sermon item.
- `src/renderer/src/RecordingsPanel.tsx` — read-only list of past recordings + marker counts.

**Modify:**
- `src/shared/types.ts` — add `'sermon'` to `ServiceItemType`; add `sermon` row to `ZONE_ROUTING_DEFAULTS`; add `RecordingRow`, `RecordingMarkerInput`, `RecordingMarker`, `RecordingSidecar` types.
- `src/main/db.ts` — add `recording` + `recording_marker` tables to `SCHEMA`; add DB helpers.
- `src/main/obs.ts` — make `obsStopRecord()` return the finished file path.
- `src/main/index.ts` — instantiate the session; wire it into `wf:live:setItemId`, `wf:setActiveService`, app quit, startup reconcile; add `wf:recordings:*` and auto-record setting IPCs; cache active service name.
- `src/preload/index.ts` — expose `recordingsList`, `recordingMarkers`, `getAutoRecord`, `setAutoRecord`.
- `src/renderer/src/liveActions.ts` — `canGoLive` + `sendItemLive` handle `sermon`.
- `src/renderer/src/ServiceDeck.tsx` — add `sermon` to the type-icon map, add-menu list, and preview-text helper.
- `src/renderer/src/ItemEditor.tsx` — render `SermonEditor` for `sermon` items.
- `src/renderer/src/ObsPanel.tsx` — "Auto-record services" toggle, live "Recording — N chapters" status, and the `RecordingsPanel`.

**Conventions to follow (from the existing code):**
- DB helpers are plain exported functions in `db.ts` that call `db.run(...)` / `db.exec(...)` then `persist()`.
- New-row id pattern: `db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0] as number`.
- Settings live in the `setting` table via `getSetting(key)` / `setSetting(key, value)`.
- Operator toasts: `notifyOperator(message, level)` in `index.ts`.

---

## Task 1: Shared types for the `sermon` item and recordings

**Files:**
- Modify: `src/shared/types.ts:140` (union), `src/shared/types.ts:211` (`ZONE_ROUTING_DEFAULTS`), and append new interfaces near the end.

- [ ] **Step 1: Add `'sermon'` to the item-type union**

In `src/shared/types.ts`, line 140, change:

```ts
export type ServiceItemType = 'song' | 'scripture' | 'text' | 'countdown' | 'image' | 'welcome' | 'ticker' | 'announcement'
```

to:

```ts
export type ServiceItemType = 'song' | 'scripture' | 'text' | 'countdown' | 'image' | 'welcome' | 'ticker' | 'announcement' | 'sermon'
```

- [ ] **Step 2: Add the `sermon` zone-routing default**

In `ZONE_ROUTING_DEFAULTS` (starts at line 211), add this entry (logo in all content zones, stage on monitors — blank/logo during preaching):

```ts
  sermon:    { 1: 'logo',      2: 'logo',      3: 'logo',      4: 'stage' },
```

- [ ] **Step 3: Add recording types**

Append to the end of `src/shared/types.ts`:

```ts
// --- Service recording (Phase 1: capture & markers) ---
export type RecordingMarkerKind = 'sermon' | 'song' | 'item'

export interface RecordingRow {
  id: number
  serviceId: number | null
  startedAt: number            // epoch ms (app wall clock)
  endedAt: number | null       // epoch ms; null while open
  filePath: string | null      // from OBS StopRecord.outputPath
  obsRecordStartedMs: number   // epoch ms; OBS's actual record start
  markerCount?: number         // populated by listRecordings for the UI
}

export interface RecordingMarkerInput {
  itemId: number | null
  kind: RecordingMarkerKind
  label: string
  offsetMs: number             // ms from recording start
}

export interface RecordingMarker extends RecordingMarkerInput {
  id: number
  recordingId: number
}

export interface RecordingSidecar {
  worshipflowVersion: string
  service: { id: number | null; name: string; date: string | null }
  recording: { startedAt: number; durationMs: number; file: string }
  markers: Array<{ kind: RecordingMarkerKind; label: string; offsetMs: number }>
}
```

- [ ] **Step 4: Typecheck to find exhaustive-map breakages**

Run: `npm run typecheck`
Expected: errors ONLY where a `Record<ServiceItemType, …>` or exhaustive switch now misses `sermon` (e.g. `ServiceDeck.tsx` `TYPE_ICON`). Note them — later tasks fix each. `ZONE_ROUTING_DEFAULTS` should already be satisfied by Step 2.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): add sermon item type and recording types"
```

---

## Task 2: OBS `obsStopRecord` returns the output path

**Files:**
- Modify: `src/main/obs.ts:141`

- [ ] **Step 1: Change the signature to return the path**

Replace the existing one-liner at `src/main/obs.ts:141`:

```ts
export async function obsStopRecord(): Promise<void> { await safe(() => obs.call('StopRecord')) }
```

with:

```ts
export async function obsStopRecord(): Promise<string | null> {
  try {
    const res = await obs.call('StopRecord')
    return (res as { outputPath?: string }).outputPath ?? null
  } catch (err) {
    console.error('[obs] StopRecord failed', err)
    return null
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no existing caller depends on the old `void` return).

- [ ] **Step 3: Commit**

```bash
git add src/main/obs.ts
git commit -m "feat(obs): return output path from obsStopRecord"
```

---

## Task 3: DB tables + helpers for recordings and markers

**Files:**
- Modify: `src/main/db.ts` (`SCHEMA` const near line 28; append helpers near the other service helpers).

- [ ] **Step 1: Add the two tables to `SCHEMA`**

Inside the `SCHEMA` template string in `src/main/db.ts`, add (they use `IF NOT EXISTS`, so they apply to new and existing DBs since `db.run(SCHEMA)` runs every launch):

```sql
CREATE TABLE IF NOT EXISTS recording (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id            INTEGER,
  started_at            INTEGER NOT NULL,
  ended_at              INTEGER,
  file_path             TEXT,
  obs_record_started_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS recording_marker (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id INTEGER NOT NULL,
  item_id      INTEGER,
  kind         TEXT NOT NULL,
  label        TEXT NOT NULL,
  offset_ms    INTEGER NOT NULL
);
```

- [ ] **Step 2: Add DB helpers**

Append to `src/main/db.ts` (import the types at the top: add `RecordingRow, RecordingMarker, RecordingMarkerInput` to the existing `import type { … } from '../shared/types'`):

```ts
// --- Recordings (Phase 1) ---
export function createRecording(
  serviceId: number | null,
  startedAt: number,
  obsRecordStartedMs: number
): number {
  db.run(
    'INSERT INTO recording (service_id, started_at, obs_record_started_ms) VALUES (?, ?, ?)',
    [serviceId, startedAt, obsRecordStartedMs]
  )
  const id = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0] as number
  persist()
  return id
}

export function addRecordingMarker(recordingId: number, m: RecordingMarkerInput): void {
  db.run(
    'INSERT INTO recording_marker (recording_id, item_id, kind, label, offset_ms) VALUES (?, ?, ?, ?, ?)',
    [recordingId, m.itemId, m.kind, m.label, m.offsetMs]
  )
  persist()
}

export function finalizeRecording(recordingId: number, endedAt: number, filePath: string | null): void {
  db.run('UPDATE recording SET ended_at = ?, file_path = ? WHERE id = ?', [endedAt, filePath, recordingId])
  persist()
}

export function listRecordingMarkers(recordingId: number): RecordingMarker[] {
  const res = db.exec(
    'SELECT id, recording_id, item_id, kind, label, offset_ms FROM recording_marker WHERE recording_id = ? ORDER BY offset_ms ASC',
    [recordingId]
  )
  if (!res[0]) return []
  return res[0].values.map((r) => ({
    id: r[0] as number,
    recordingId: r[1] as number,
    itemId: r[2] as number | null,
    kind: r[3] as RecordingMarker['kind'],
    label: r[4] as string,
    offsetMs: r[5] as number
  }))
}

export function listRecordings(): RecordingRow[] {
  const res = db.exec(
    `SELECT r.id, r.service_id, r.started_at, r.ended_at, r.file_path, r.obs_record_started_ms,
            (SELECT COUNT(*) FROM recording_marker m WHERE m.recording_id = r.id) AS marker_count
       FROM recording r ORDER BY r.started_at DESC`
  )
  if (!res[0]) return []
  return res[0].values.map((r) => ({
    id: r[0] as number,
    serviceId: r[1] as number | null,
    startedAt: r[2] as number,
    endedAt: r[3] as number | null,
    filePath: r[4] as string | null,
    obsRecordStartedMs: r[5] as number,
    markerCount: r[6] as number
  }))
}

// Reconcile any recording left open by a crash: mark it ended at `endedAt`.
export function closeDanglingRecordings(endedAt: number): void {
  db.run('UPDATE recording SET ended_at = ? WHERE ended_at IS NULL', [endedAt])
  persist()
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:node`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/db.ts
git commit -m "feat(db): recording and recording_marker tables + helpers"
```

---

## Task 4: The recording-session state machine (`recording.ts`) — failing test first

**Files:**
- Create: `src/main/recording.ts`
- Test: `src/main/recording.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/recording.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createRecordingSession, type RecordingDeps } from './recording'
import type { ServiceItem } from '../shared/types'

function makeItem(id: number, type: ServiceItem['type'], title: string): ServiceItem {
  return { id, ordinal: id, type, ref_id: null, payload: {}, title, notes: null, style: null, zoneRouting: null }
}

function makeDeps(over: Partial<RecordingDeps> = {}): { deps: RecordingDeps; markers: Array<{ recId: number; kind: string; label: string; offsetMs: number }>; sidecars: unknown[]; toasts: string[] } {
  let clock = 1000
  const markers: Array<{ recId: number; kind: string; label: string; offsetMs: number }> = []
  const sidecars: unknown[] = []
  const toasts: string[] = []
  const deps: RecordingDeps = {
    now: () => clock,
    advance: (ms: number) => { clock += ms }, // test-only helper on deps for readability
    appVersion: '0.9.0',
    autoRecordEnabled: () => true,
    obsConnected: () => true,
    obsRecording: () => false,
    obsRecordStartedMs: () => clock,
    startRecord: vi.fn(async () => {}),
    stopRecord: vi.fn(async () => 'C:/nas/2026-07-19.mkv'),
    createRecording: vi.fn(() => 7),
    addMarker: (recId, m) => markers.push({ recId, kind: m.kind, label: m.label, offsetMs: m.offsetMs }),
    finalizeRecording: vi.fn(),
    listMarkers: () => markers.map((m, i) => ({ id: i, recordingId: m.recId, itemId: null, kind: m.kind as never, label: m.label, offsetMs: m.offsetMs })),
    writeSidecar: (_path, sidecar) => sidecars.push(sidecar),
    toast: (msg) => toasts.push(msg),
    ...over
  }
  return { deps, markers, sidecars, toasts }
}

describe('recording session', () => {
  it('starts recording on the first live item and stamps it at offset 0', async () => {
    const { deps, markers } = makeDeps()
    const s = createRecordingSession(deps)
    await s.onItemLive(makeItem(1, 'welcome', 'Welcome'), 42, 'Sunday AM', '2026-07-19')
    expect(deps.startRecord).toHaveBeenCalledOnce()
    expect(deps.createRecording).toHaveBeenCalledOnce()
    expect(s.isActive()).toBe(true)
    expect(markers).toEqual([{ recId: 7, kind: 'item', label: 'Welcome', offsetMs: 0 }])
  })

  it('classifies marker kinds and computes offsets from start', async () => {
    const { deps, markers } = makeDeps()
    const s = createRecordingSession(deps)
    await s.onItemLive(makeItem(1, 'song', 'Amazing Grace'), 42, 'Sunday AM', '2026-07-19')
    deps.advance!(320000)
    await s.onItemLive(makeItem(2, 'sermon', 'The Prodigal Son'), 42, 'Sunday AM', '2026-07-19')
    expect(markers).toEqual([
      { recId: 7, kind: 'song', label: 'Amazing Grace', offsetMs: 0 },
      { recId: 7, kind: 'sermon', label: 'The Prodigal Son', offsetMs: 320000 }
    ])
    expect(deps.startRecord).toHaveBeenCalledOnce() // not restarted on 2nd item
  })

  it('finalizes and writes a sidecar on service end', async () => {
    const { deps, sidecars } = makeDeps()
    const s = createRecordingSession(deps)
    await s.onItemLive(makeItem(1, 'sermon', 'Msg'), 42, 'Sunday AM', '2026-07-19')
    deps.advance!(60000)
    await s.onServiceEnded()
    expect(deps.stopRecord).toHaveBeenCalledOnce()
    expect(deps.finalizeRecording).toHaveBeenCalledWith(7, 61000, 'C:/nas/2026-07-19.mkv')
    expect(sidecars).toHaveLength(1)
    expect(s.isActive()).toBe(false)
  })

  it('skips recording and toasts when OBS is offline', async () => {
    const { deps, toasts } = makeDeps({ obsConnected: () => false })
    const s = createRecordingSession(deps)
    await s.onItemLive(makeItem(1, 'welcome', 'Welcome'), 42, 'Sunday AM', '2026-07-19')
    expect(deps.startRecord).not.toHaveBeenCalled()
    expect(s.isActive()).toBe(false)
    expect(toasts.some((t) => /OBS/i.test(t))).toBe(true)
  })

  it('does not start when auto-record is disabled', async () => {
    const { deps } = makeDeps({ autoRecordEnabled: () => false })
    const s = createRecordingSession(deps)
    await s.onItemLive(makeItem(1, 'welcome', 'Welcome'), 42, 'Sunday AM', '2026-07-19')
    expect(deps.startRecord).not.toHaveBeenCalled()
    expect(s.isActive()).toBe(false)
  })

  it('adopts an already-running OBS recording without double-starting', async () => {
    const { deps } = makeDeps({ obsRecording: () => true })
    const s = createRecordingSession(deps)
    await s.onItemLive(makeItem(1, 'welcome', 'Welcome'), 42, 'Sunday AM', '2026-07-19')
    expect(deps.startRecord).not.toHaveBeenCalled()
    expect(deps.createRecording).toHaveBeenCalledOnce() // still tracked
    expect(s.isActive()).toBe(true)
  })
})
```

Note: the `advance` field is a test-only convenience placed on `RecordingDeps` as an optional member so the fake clock is readable. Mark it optional in the interface (Step 3).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/recording.test.ts`
Expected: FAIL — `Cannot find module './recording'`.

- [ ] **Step 3: Implement `recording.ts`**

Create `src/main/recording.ts`:

```ts
import type {
  ServiceItem,
  RecordingMarkerInput,
  RecordingMarker,
  RecordingMarkerKind,
  RecordingSidecar
} from '../shared/types'

export interface RecordingDeps {
  now: () => number
  advance?: (ms: number) => void // test-only fake-clock helper; unused in production
  appVersion: string
  autoRecordEnabled: () => boolean
  obsConnected: () => boolean
  obsRecording: () => boolean
  obsRecordStartedMs: () => number
  startRecord: () => Promise<void>
  stopRecord: () => Promise<string | null>
  createRecording: (serviceId: number | null, startedAt: number, obsRecordStartedMs: number) => number
  addMarker: (recordingId: number, m: RecordingMarkerInput) => void
  finalizeRecording: (recordingId: number, endedAt: number, filePath: string | null) => void
  listMarkers: (recordingId: number) => RecordingMarker[]
  writeSidecar: (filePath: string, sidecar: RecordingSidecar) => void
  toast: (msg: string) => void
}

export interface RecordingSession {
  onItemLive: (item: ServiceItem, serviceId: number | null, serviceName: string, serviceDate: string | null) => Promise<void>
  onServiceEnded: () => Promise<void>
  isActive: () => boolean
}

function markerKind(type: ServiceItem['type']): RecordingMarkerKind {
  if (type === 'sermon') return 'sermon'
  if (type === 'song') return 'song'
  return 'item'
}

export function createRecordingSession(deps: RecordingDeps): RecordingSession {
  let recordingId: number | null = null
  let startedAtMs = 0
  let ctx: { serviceId: number | null; serviceName: string; serviceDate: string | null } | null = null

  async function ensureStarted(serviceId: number | null, serviceName: string, serviceDate: string | null): Promise<boolean> {
    if (recordingId != null) return true
    if (!deps.autoRecordEnabled()) return false
    if (!deps.obsConnected()) {
      deps.toast('Recording skipped — OBS is offline.')
      return false
    }
    if (!deps.obsRecording()) {
      await deps.startRecord()
    }
    startedAtMs = deps.now()
    ctx = { serviceId, serviceName, serviceDate }
    recordingId = deps.createRecording(serviceId, startedAtMs, deps.obsRecordStartedMs())
    return true
  }

  return {
    async onItemLive(item, serviceId, serviceName, serviceDate) {
      const ok = await ensureStarted(serviceId, serviceName, serviceDate)
      if (!ok || recordingId == null) return
      deps.addMarker(recordingId, {
        itemId: item.id,
        kind: markerKind(item.type),
        label: item.title,
        offsetMs: Math.max(0, deps.now() - startedAtMs)
      })
    },

    async onServiceEnded() {
      if (recordingId == null) return
      const filePath = await deps.stopRecord()
      const endedAt = deps.now()
      deps.finalizeRecording(recordingId, endedAt, filePath)
      if (filePath) {
        const markers = deps.listMarkers(recordingId)
        const file = filePath.split(/[\\/]/).pop() ?? filePath
        deps.writeSidecar(filePath, {
          worshipflowVersion: deps.appVersion,
          service: { id: ctx?.serviceId ?? null, name: ctx?.serviceName ?? '', date: ctx?.serviceDate ?? null },
          recording: { startedAt: startedAtMs, durationMs: endedAt - startedAtMs, file },
          markers: markers.map((m) => ({ kind: m.kind, label: m.label, offsetMs: m.offsetMs }))
        })
      } else {
        deps.toast('Recording saved, but OBS did not report a file path — sidecar skipped.')
      }
      recordingId = null
      ctx = null
    },

    isActive() {
      return recordingId != null
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/main/recording.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/recording.ts src/main/recording.test.ts
git commit -m "feat(recording): session state machine with markers + sidecar (TDD)"
```

---

## Task 5: Wire the session into the main process

**Files:**
- Modify: `src/main/index.ts` — imports; a module-level session; `activeServiceName`/`activeServiceDate` cache; the `wf:live:setItemId` handler (line ~1248); the `wf:setActiveService` handler (line ~1315) and cache rebuild (line ~1303); app-quit; post-`initDb` reconcile; new IPCs.

- [ ] **Step 1: Add imports and the session instance**

Near the other `src/main/*` imports in `index.ts`, add:

```ts
import { createRecordingSession } from './recording'
import {
  createRecording, addRecordingMarker, finalizeRecording,
  listRecordingMarkers, listRecordings, closeDanglingRecordings
} from './db'
import { obsStartRecord, obsStopRecord, getObsStatus } from './obs'
import { writeFileSync } from 'fs'
```

(Only add symbols not already imported — `obsStartRecord`/`getObsStatus` may already be imported from `./obs`; merge into the existing import rather than duplicating.)

Then, after `initDb()` has run and `app`/`notifyOperator` are defined, add a module-level session:

```ts
let activeServiceName = ''
let activeServiceDate: string | null = null

const recordingSession = createRecordingSession({
  now: () => Date.now(),
  appVersion: app.getVersion(),
  autoRecordEnabled: () => getSetting('autoRecord') !== 'off', // default ON
  obsConnected: () => getObsStatus().connected,
  obsRecording: () => getObsStatus().recording,
  obsRecordStartedMs: () => getObsStatus().recordStartedAt ?? Date.now(),
  startRecord: () => obsStartRecord(),
  stopRecord: () => obsStopRecord(),
  createRecording,
  addMarker: addRecordingMarker,
  finalizeRecording,
  listMarkers: listRecordingMarkers,
  writeSidecar: (videoPath, sidecar) => {
    const jsonPath = videoPath.replace(/\.[^.\\/]+$/, '') + '.worshipflow.json'
    try {
      writeFileSync(jsonPath, JSON.stringify(sidecar, null, 2), 'utf-8')
    } catch (err) {
      console.error('[recording] sidecar write failed', err)
      notifyOperator('Recording saved, but the marker sidecar could not be written.', 'warn')
    }
  },
  toast: (msg) => notifyOperator(msg, 'warn')
})
```

Confirm `getObsStatus()` returns `{ connected, recording, recordStartedAt }` (see `src/main/obs.ts` `ObsStatus`). If `connected` is named differently, use the real field.

- [ ] **Step 2: Stamp markers when an item goes live**

In the `wf:live:setItemId` handler (line ~1248), after the existing `broadcast()`:

```ts
ipcMain.handle('wf:live:setItemId', (_e, id: number | null) => {
  liveServiceItemId = id
  const item = id != null ? activeServiceItems.find((it) => it.id === id) : undefined
  liveItemNotes = item?.notes ?? null
  applyItemTheme(item)
  broadcast()
  if (item) {
    void recordingSession.onItemLive(item, activeServiceId, activeServiceName, activeServiceDate)
  }
})
```

- [ ] **Step 3: Cache the active service name/date and stop on close**

In the cache-rebuild function around line 1303 (where `activeServiceId = serviceId` and `activeServiceItems = …` are set), also set:

```ts
  activeServiceName = (svc as { name?: string } | null)?.name ?? ''
  activeServiceDate = (svc as { service_date?: string | null } | null)?.service_date ?? null
```

In the `wf:setActiveService` handler (line ~1315), in the branch where `serviceId == null`, after clearing `activeServiceItems`, add:

```ts
    activeServiceName = ''
    activeServiceDate = null
    void recordingSession.onServiceEnded()
```

- [ ] **Step 4: Reconcile on startup and stop on quit**

Immediately after `await initDb()` completes at startup, add:

```ts
  closeDanglingRecordings(Date.now())
```

In the app-quit path (find the existing `app.on('before-quit', …)` or `app.on('window-all-closed', …)`; if none awaits async work, add a `before-quit` handler), ensure a final stop:

```ts
app.on('before-quit', () => {
  if (recordingSession.isActive()) void recordingSession.onServiceEnded()
})
```

- [ ] **Step 5: Add recordings + auto-record IPCs**

Add near the other `ipcMain.handle` registrations:

```ts
ipcMain.handle('wf:recordings:list', () => listRecordings())
ipcMain.handle('wf:recordings:markers', (_e, recordingId: number) => listRecordingMarkers(recordingId))
ipcMain.handle('wf:recordings:getAutoRecord', () => getSetting('autoRecord') !== 'off')
ipcMain.handle('wf:recordings:setAutoRecord', (_e, on: boolean) => {
  setSetting('autoRecord', on ? 'on' : 'off')
})
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck:node`
Expected: PASS. Fix any field-name mismatches (`getObsStatus()` shape, cache-rebuild variable names) against the real code.

- [ ] **Step 7: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(main): drive recording session from live + service lifecycle"
```

---

## Task 6: Preload bridges

**Files:**
- Modify: `src/preload/index.ts` (add to the `wf` object near the other invoke bridges, ~line 108).

- [ ] **Step 1: Expose the new IPCs**

Add to the `wf` object:

```ts
  recordingsList: (): Promise<import('../shared/types').RecordingRow[]> =>
    ipcRenderer.invoke('wf:recordings:list'),
  recordingMarkers: (recordingId: number): Promise<import('../shared/types').RecordingMarker[]> =>
    ipcRenderer.invoke('wf:recordings:markers', recordingId),
  getAutoRecord: (): Promise<boolean> => ipcRenderer.invoke('wf:recordings:getAutoRecord'),
  setAutoRecord: (on: boolean): Promise<void> => ipcRenderer.invoke('wf:recordings:setAutoRecord', on),
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS for node/preload. (Renderer may still error where `window.wf` typing is declared — if there is a `WfApi`/`Window.wf` interface, add the four members there too; grep `interface .*wf` / `declare global` in `src/preload` or `src/renderer` and mirror the signatures.)

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat(preload): expose recordings + auto-record bridges"
```

---

## Task 7: Sermon item in the add-menu and deck (`ServiceDeck.tsx`)

**Files:**
- Modify: `src/renderer/src/ServiceDeck.tsx` (`TYPE_ICON` ~line 12, `ADD_TYPES` array ~line 16, preview-text helper ~line 26).

- [ ] **Step 1: Add the icon and menu entry**

Add `Mic` to the lucide import on line 3. In the `TYPE_ICON` map (line 12) add:

```ts
  sermon: Mic,
```

In the add-menu list (`ADD_TYPES`, starts line 16) add:

```ts
  { type: 'sermon',    label: 'Sermon',    Icon: Mic },
```

- [ ] **Step 2: Add preview text for a sermon card**

In the deck's preview-text helper (the `if (it.type === 'text')` … chain near line 26), add:

```ts
  if (it.type === 'sermon') return (it.payload.title as string | undefined) ?? 'Sermon'
```

- [ ] **Step 3: Typecheck + run the app build**

Run: `npm run typecheck:web`
Expected: PASS (the `TYPE_ICON` exhaustive-map error from Task 1 Step 4 is now resolved).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/ServiceDeck.tsx
git commit -m "feat(ui): add Sermon to the service item add-menu"
```

---

## Task 8: Sermon editor + go-live behavior

**Files:**
- Create: `src/renderer/src/editors/SermonEditor.tsx`
- Modify: `src/renderer/src/ItemEditor.tsx` (imports + a `sermon` block), `src/renderer/src/liveActions.ts` (`canGoLive` + `sendItemLive`).

- [ ] **Step 1: Create the SermonEditor**

Match the prop shape of the sibling editors (open `src/renderer/src/editors/TextEditor.tsx` first and mirror how it reads/writes `payload` via its `onChange`/`patch` prop). Create `src/renderer/src/editors/SermonEditor.tsx`:

```tsx
import { JSX } from 'react'

interface SermonEditorProps {
  payload: Record<string, unknown>
  onPatch: (patch: Record<string, unknown>) => void
}

export function SermonEditor({ payload, onPatch }: SermonEditorProps): JSX.Element {
  const field = (key: string): string => (payload[key] as string | undefined) ?? ''
  return (
    <div className="flex flex-col gap-3">
      <label className="text-xs font-medium text-slate-600">
        Sermon title
        <input
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          value={field('title')}
          onChange={(e) => onPatch({ title: e.target.value })}
          placeholder="e.g. The Prodigal Son"
        />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Speaker
        <input
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          value={field('speaker')}
          onChange={(e) => onPatch({ speaker: e.target.value })}
          placeholder="e.g. Pastor Ryan"
        />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Passage
        <input
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          value={field('passage')}
          onChange={(e) => onPatch({ passage: e.target.value })}
          placeholder="e.g. Luke 15:11-32"
        />
      </label>
      <p className="text-[11px] leading-snug text-slate-400">
        When live, the screen shows the logo. This marks where the sermon starts for recording chapters.
      </p>
    </div>
  )
}
```

Adjust the prop name (`onPatch` vs the sibling's actual patch prop) to whatever `TextEditor` uses so `ItemEditor` can pass it identically.

- [ ] **Step 2: Render it in ItemEditor**

In `src/renderer/src/ItemEditor.tsx`, add the import (line ~13):

```ts
import { SermonEditor } from './editors/SermonEditor'
```

After the `ticker` block (line ~159), add a block mirroring how `TextEditor` is wired (same patch/onChange prop the others receive):

```tsx
      {item.type === 'sermon' && (
        <SermonEditor
          payload={item.payload}
          onPatch={(patch) => onPatchPayload(patch)}
        />
      )}
```

Use the real prop name(s) the other editors receive in this file (e.g. the callback that persists a payload patch) — copy the `TextEditor` invocation and swap the component.

- [ ] **Step 3: Handle sermon in liveActions**

In `src/renderer/src/liveActions.ts`, add to `canGoLive` (the `return (...)` boolean union):

```ts
    (item.type === 'sermon') ||
```

In `sendItemLive`, add a branch before the final `else` (mirroring the others), so the screen blanks to the logo and the item is marked live:

```ts
  } else if (item.type === 'sermon') {
    window.wf.sendIntent('logo')
  }
```

(The existing `window.wf.liveSetItemId(item.id)` at the end of the function then runs for `sermon` too — that is the call that stamps the marker in main.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/editors/SermonEditor.tsx src/renderer/src/ItemEditor.tsx src/renderer/src/liveActions.ts
git commit -m "feat(ui): sermon editor + go-live blanks to logo"
```

---

## Task 9: Recordings panel + auto-record toggle in ObsPanel

**Files:**
- Create: `src/renderer/src/RecordingsPanel.tsx`
- Modify: `src/renderer/src/ObsPanel.tsx`

- [ ] **Step 1: Create the RecordingsPanel**

Create `src/renderer/src/RecordingsPanel.tsx`:

```tsx
import { JSX, useEffect, useState } from 'react'
import type { RecordingRow } from '../../shared/types'

function fmtDuration(ms: number | null, startedAt: number, endedAt: number | null): string {
  const dur = ms ?? (endedAt != null ? endedAt - startedAt : 0)
  const mins = Math.round(dur / 60000)
  return mins > 0 ? `${mins} min` : '—'
}

export function RecordingsPanel(): JSX.Element {
  const [rows, setRows] = useState<RecordingRow[]>([])

  useEffect(() => {
    void window.wf.recordingsList().then(setRows)
  }, [])

  if (rows.length === 0) {
    return <p className="text-xs text-slate-400">No recordings yet. Recordings start automatically when you go live.</p>
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.id} className="rounded border border-slate-200 p-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-700">{new Date(r.startedAt).toLocaleString()}</span>
            <span className="text-slate-500">{fmtDuration(null, r.startedAt, r.endedAt)}</span>
          </div>
          <div className="mt-0.5 text-slate-500">{r.markerCount ?? 0} chapters</div>
          {r.filePath && <div className="mt-0.5 truncate text-slate-400" title={r.filePath}>{r.filePath}</div>}
          {r.endedAt == null && <div className="mt-0.5 text-amber-600">Recording…</div>}
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 2: Add the toggle + live status + panel to ObsPanel**

Open `src/renderer/src/ObsPanel.tsx` and follow its existing state/section patterns. Add:

- an import: `import { RecordingsPanel } from './RecordingsPanel'`
- an auto-record state loaded on mount:

```tsx
  const [autoRecord, setAutoRecord] = useState(true)
  useEffect(() => { void window.wf.getAutoRecord().then(setAutoRecord) }, [])
  const toggleAutoRecord = (): void => {
    const next = !autoRecord
    setAutoRecord(next)
    void window.wf.setAutoRecord(next)
  }
```

- a section in the panel's JSX (place it near the existing record status):

```tsx
      <section className="mt-4 border-t border-slate-200 pt-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={autoRecord} onChange={toggleAutoRecord} />
          Auto-record services
        </label>
        <p className="mt-1 text-[11px] text-slate-400">
          Recording is written to OBS’s configured record folder — point that at your NAS.
        </p>
        <h3 className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent recordings</h3>
        <RecordingsPanel />
      </section>
```

- If `ObsPanel` already renders a live "● REC" indicator using the OBS status prop/state, extend its label to include the live chapter count when recording. If the live marker count is not readily available in the renderer, leave the indicator as-is (the count is visible per-recording in the panel) — do not invent new IPC for a live counter in Phase 1.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS. (If `window.wf` typing errors on the new methods, ensure Task 6 Step 2's interface additions are in place.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/RecordingsPanel.tsx src/renderer/src/ObsPanel.tsx
git commit -m "feat(ui): auto-record toggle + recordings list in OBS panel"
```

---

## Task 10: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: PASS (node + web).

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: PASS — the existing 88 tests plus the 6 new `recording.test.ts` tests (94 total). If any pre-existing exhaustive switch over `ServiceItemType` now fails a test, add a `sermon` case mirroring the closest neighbor (usually `text`).

- [ ] **Step 3: Production build (packaging sanity)**

Run: `npm run build`
Expected: PASS (electron-vite build completes for main/preload/renderer).

- [ ] **Step 4: Manual smoke test (documented, run by the operator)**

Document these steps in the commit body / PR description for the booth test:
1. Connect OBS. In WorshipFlow, confirm "Auto-record services" is on (OBS panel).
2. Build a service with a song, a `Sermon` item (title "Test"), and another song. Set it active.
3. Send the first item live → OBS should start recording; the OBS panel record status shows active.
4. Send the Sermon item live → screen blanks to the logo.
5. Close/clear the active service → OBS stops recording.
6. In OBS's record folder, confirm the video file **and** a matching `*.worshipflow.json` sidecar exist; open the JSON and confirm the markers (song, sermon, song) with ascending `offsetMs` and a `sermon` entry.
7. Confirm the recording appears in the OBS-panel "Recent recordings" list with the right chapter count.
8. Negative case: disconnect OBS, go live → a toast says recording was skipped, and the service still runs normally.

- [ ] **Step 5: Commit (if any fixes were needed)**

```bash
git add -A
git commit -m "test: verify Phase 1 recording capture end-to-end"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** Sermon item type (Tasks 1, 7, 8); auto-record lifecycle + guards — offline/already-recording/disabled/reconcile/quit (Tasks 4, 5); main-side marker capture through `setItemId` (Task 5); `recording`/`recording_marker` tables + sidecar (Tasks 3, 4, 5); operator UI — toggle, status, recordings list (Task 9); tests (Task 4, 10). Sermon *end* is derived downstream (not stamped) per spec — no task needed.
- **Placeholder scan:** none — every code step is complete. Where a real prop/field name must match existing code (editor patch prop, `getObsStatus()` field names, `window.wf` type interface, ObsPanel record indicator), the step names the file to mirror and the exact symbol to reconcile.
- **Type consistency:** `RecordingRow`/`RecordingMarker`/`RecordingMarkerInput`/`RecordingSidecar` defined in Task 1 are used identically in Tasks 3–9; `createRecording`/`addRecordingMarker`/`finalizeRecording`/`listRecordingMarkers`/`listRecordings`/`closeDanglingRecordings` names match between Tasks 3, 5, 6; `RecordingDeps`/`createRecordingSession`/`onItemLive`/`onServiceEnded`/`isActive` match between Tasks 4 and 5.
