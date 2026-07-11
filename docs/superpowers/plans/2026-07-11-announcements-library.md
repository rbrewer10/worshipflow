# Announcements Library + Scheduling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reusable Announcements library (its own Prepare tab) where each announcement is a `slide` or `ticker`, carries a `once`/`recurring` schedule that auto-expires, and can be one-tap-added to a service via a "Scheduled for this Sunday" panel. Announcements are referenced from services by `ref_id` (like songs), so library edits propagate.

**Architecture:** Mirror the existing Songs library end-to-end. New `announcement` DB table + CRUD (sql.js, `db.prepare/step/getAsObject/free` + `persist()`), new `AnnouncementSummary/Announcement/AnnouncementInput` types, `wf:announcements:*` IPC on `window.wf`, and a new `AnnouncementsLibrary` + `AnnouncementEditor`. Services gain a new `ServiceItemType` `'announcement'` (`ref_id → announcement`); its live rendering delegates to the existing text-slide / ticker paths via a new `doLoadAnnouncement()`. Pure scheduling logic lives in a shared, unit-tested helper.

**Tech Stack:** Electron main (TypeScript), React renderer (Tailwind v3, lucide-react), sql.js, vitest.

**Key references (verbatim patterns to mirror):**
- Songs CRUD: `src/main/db.ts:151-304`; service item add/get: `src/main/db.ts:381-480`, `itemTitle` `db.ts:345-355`.
- Live resolution (must all gain an `announcement` case): `handleTabletLoadItem` `src/main/index.ts:739-777`, `sendItemLive` `src/renderer/src/liveActions.ts:26-59`, `itemCanGoLive` `index.ts:486-496`, `canGoLive` `liveActions.ts:14-24`, `computeItemSlides` `index.ts:682-708`.
- `doLoadText` `index.ts:547-560`, `doLoadSong` `index.ts:656-679`, granular live IPC `index.ts:1120-1138`.
- Preload `src/preload/index.ts:38-44`; song IPC `index.ts:1295-1299`; add-item IPC `index.ts:1315-1317`.
- UI: `SongLibrary.tsx` (whole), `AppShell.tsx:14` + `:104-121`, `Sidebar.tsx:115-118`, `ServiceEditor.tsx:38-66`, `ServiceDeck.tsx:8-19,136-146`, `ItemEditor.tsx:99-161`.

**Important simplification:** `ZONE_ROUTING_DEFAULTS.text` and `.ticker` are identical (`{1:'text',2:'text',3:'text',4:'stage'}`). So `announcement` uses that one routing for both displays — no per-display routing needed.

**Scope note (known limitation to preserve, not fix here):** The ticker rendering is triggered by the live title containing the literal string `"Announcement"` (see `Output.tsx` + `doLoadText('Announcement', …)`). A `slide` announcement titled with the word "Announcement" would therefore render as a scrolling ticker. We keep the existing mechanism (spec says reuse existing rendering); hardening it is a possible follow-up.

---

### Task 1: Pure scheduling helpers (TDD)

**Files:**
- Create: `src/shared/announcementSchedule.ts`
- Test: `src/shared/announcementSchedule.test.ts`

Dates are ISO `YYYY-MM-DD` strings, which compare correctly with `<`/`<=`/`===`.

- [ ] **Step 1: Write the failing test**

Create `src/shared/announcementSchedule.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { announcementMatchesDate, announcementExpired } from './announcementSchedule'

const base = { active: true as boolean, frequency: 'recurring' as 'once' | 'recurring', startDate: null as string | null, endDate: null as string | null }

describe('announcementMatchesDate', () => {
  it('inactive never matches', () => {
    expect(announcementMatchesDate({ ...base, active: false }, '2026-07-12')).toBe(false)
  })
  it('once matches only its exact date', () => {
    const a = { ...base, frequency: 'once' as const, startDate: '2026-07-12' }
    expect(announcementMatchesDate(a, '2026-07-12')).toBe(true)
    expect(announcementMatchesDate(a, '2026-07-19')).toBe(false)
  })
  it('recurring with no bounds matches any date', () => {
    expect(announcementMatchesDate(base, '2030-01-01')).toBe(true)
  })
  it('recurring respects the window inclusively', () => {
    const a = { ...base, startDate: '2026-07-01', endDate: '2026-07-31' }
    expect(announcementMatchesDate(a, '2026-06-30')).toBe(false)
    expect(announcementMatchesDate(a, '2026-07-01')).toBe(true)
    expect(announcementMatchesDate(a, '2026-07-31')).toBe(true)
    expect(announcementMatchesDate(a, '2026-08-01')).toBe(false)
  })
  it('recurring open-ended (start only) matches from start onward', () => {
    const a = { ...base, startDate: '2026-07-01', endDate: null }
    expect(announcementMatchesDate(a, '2026-06-30')).toBe(false)
    expect(announcementMatchesDate(a, '2026-07-01')).toBe(true)
    expect(announcementMatchesDate(a, '2030-01-01')).toBe(true)
  })
})

describe('announcementExpired', () => {
  it('once is expired the day after its date', () => {
    const a = { frequency: 'once' as const, startDate: '2026-07-12', endDate: null }
    expect(announcementExpired(a, '2026-07-12')).toBe(false)
    expect(announcementExpired(a, '2026-07-13')).toBe(true)
  })
  it('recurring with an end date expires after it', () => {
    const a = { frequency: 'recurring' as const, startDate: '2026-07-01', endDate: '2026-07-31' }
    expect(announcementExpired(a, '2026-07-31')).toBe(false)
    expect(announcementExpired(a, '2026-08-01')).toBe(true)
  })
  it('recurring open-ended never expires', () => {
    const a = { frequency: 'recurring' as const, startDate: '2026-07-01', endDate: null }
    expect(announcementExpired(a, '2999-01-01')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/announcementSchedule.test.ts`
Expected: FAIL — "Failed to resolve import './announcementSchedule'" / functions not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/announcementSchedule.ts`:

```ts
// Pure scheduling predicates for announcements. Dates are ISO 'YYYY-MM-DD'
// strings (lexicographically comparable). No DB or clock access — the caller
// supplies the comparison date so this is fully unit-testable.

export interface AnnouncementSchedule {
  active: boolean
  frequency: 'once' | 'recurring'
  startDate: string | null
  endDate: string | null
}

// Does this announcement's schedule cover a service happening on `serviceDate`?
export function announcementMatchesDate(a: AnnouncementSchedule, serviceDate: string): boolean {
  if (!a.active) return false
  if (a.frequency === 'once') return a.startDate === serviceDate
  // recurring: inside [startDate, endDate], either bound optional/open.
  if (a.startDate != null && serviceDate < a.startDate) return false
  if (a.endDate != null && serviceDate > a.endDate) return false
  return true
}

// Is this announcement past its useful life as of `today`? (Independent of `active`.)
export function announcementExpired(
  a: Pick<AnnouncementSchedule, 'frequency' | 'startDate' | 'endDate'>,
  today: string
): boolean {
  if (a.frequency === 'once') return a.startDate != null && a.startDate < today
  return a.endDate != null && a.endDate < today
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/announcementSchedule.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/shared/announcementSchedule.ts src/shared/announcementSchedule.test.ts
git commit -m "feat(announcements): pure scheduling helpers with tests"
```

---

### Task 2: Shared types + `announcement` service-item type

**Files:**
- Modify: `src/shared/types.ts` (add announcement types; extend `ServiceItemType` at line 140 and `ZONE_ROUTING_DEFAULTS` at lines 209-217)

- [ ] **Step 1: Add announcement types**

Append to `src/shared/types.ts` (end of file is fine):

```ts
// --- Announcements library ---
export type AnnouncementDisplay = 'slide' | 'ticker'
export type AnnouncementFrequency = 'once' | 'recurring'

export interface AnnouncementSummary {
  id: number
  title: string
  display: AnnouncementDisplay
  frequency: AnnouncementFrequency
  startDate: string | null
  endDate: string | null
  active: boolean
  expired: boolean // derived (main process) from the schedule vs today
}

export interface Announcement extends AnnouncementSummary {
  body: string
  background: string | null // image/video file path (slide only); null = service theme
}

export interface AnnouncementInput {
  title: string
  body: string
  display: AnnouncementDisplay
  background?: string | null
  frequency: AnnouncementFrequency
  startDate?: string | null
  endDate?: string | null
  active?: boolean
}
```

- [ ] **Step 2: Extend `ServiceItemType`**

Find (`src/shared/types.ts:140`):

```ts
export type ServiceItemType = 'song' | 'scripture' | 'text' | 'countdown' | 'image' | 'welcome' | 'ticker'
```

Replace with:

```ts
export type ServiceItemType = 'song' | 'scripture' | 'text' | 'countdown' | 'image' | 'welcome' | 'ticker' | 'announcement'
```

- [ ] **Step 3: Add the routing default**

In `ZONE_ROUTING_DEFAULTS` (`src/shared/types.ts:209-217`), add an `announcement` line (identical to `text`/`ticker`):

```ts
  ticker:    { 1: 'text',      2: 'text',      3: 'text',      4: 'stage' },
  announcement: { 1: 'text',   2: 'text',      3: 'text',      4: 'stage' },
```

(Add the second line right after the existing `ticker:` line, inside the object.)

- [ ] **Step 4: Typecheck (expect NEW errors — they're your task list)**

Run: `npm run typecheck`
Expected: FAIL with `Property 'announcement' is missing` / `not assignable` errors at the `Record<ServiceItemType, …>` sites — notably `TYPE_ICON` (`ServiceDeck.tsx:8`). These are fixed in later tasks. This step just confirms the union widened. (If you prefer a clean typecheck between tasks, do Task 6's `TYPE_ICON` edit now.)

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(announcements): shared types + announcement service-item type"
```

---

### Task 3: DB table, migration, CRUD, scheduling query

**Files:**
- Modify: `src/main/db.ts` (add `announcement` to SCHEMA near the `song` table ~line 35; add CRUD + `listScheduledAnnouncements` + `announcementTitle`; extend `itemTitle` at lines 345-355)

- [ ] **Step 1: Add the table to SCHEMA**

In the `SCHEMA` template string, after the `song` table block (`src/main/db.ts:23-35`), add:

```sql
CREATE TABLE IF NOT EXISTS announcement (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  display TEXT NOT NULL DEFAULT 'slide',
  background TEXT,
  frequency TEXT NOT NULL DEFAULT 'recurring',
  start_date TEXT,
  end_date TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
```

(`CREATE TABLE IF NOT EXISTS` inside SCHEMA is the established idempotent pattern; no separate `ALTER` migration needed for a brand-new table.)

- [ ] **Step 2: Add imports for the schedule helpers + types**

At the top of `src/main/db.ts`, add to the existing type import from `../shared/types` (and import the schedule helpers):

```ts
import type { AnnouncementSummary, Announcement, AnnouncementInput } from '../shared/types'
import { announcementMatchesDate, announcementExpired } from '../shared/announcementSchedule'
```

(Merge the type names into the existing `import type { … } from '../shared/types'` line if one exists; otherwise add the line.)

- [ ] **Step 3: Add CRUD + scheduling functions**

Add near the song CRUD (e.g. after `updateSong`, `src/main/db.ts:~304`):

```ts
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function rowToAnnouncement(r: {
  id: number; title: string; body: string; display: string; background: string | null
  frequency: string; start_date: string | null; end_date: string | null; active: number
}): Announcement {
  const startDate = r.start_date ?? null
  const endDate = r.end_date ?? null
  const frequency = (r.frequency === 'once' ? 'once' : 'recurring') as Announcement['frequency']
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    display: (r.display === 'ticker' ? 'ticker' : 'slide') as Announcement['display'],
    background: r.background ?? null,
    frequency,
    startDate,
    endDate,
    active: r.active !== 0,
    expired: announcementExpired({ frequency, startDate, endDate }, todayIso())
  }
}

export function listAnnouncements(search = ''): AnnouncementSummary[] {
  const sql = search
    ? `SELECT id, title, body, display, background, frequency, start_date, end_date, active
       FROM announcement WHERE title LIKE $q OR body LIKE $q ORDER BY title COLLATE NOCASE`
    : `SELECT id, title, body, display, background, frequency, start_date, end_date, active
       FROM announcement ORDER BY title COLLATE NOCASE`
  const stmt = db.prepare(sql)
  if (search) stmt.bind({ $q: `%${search}%` })
  const rows: AnnouncementSummary[] = []
  while (stmt.step()) {
    const a = rowToAnnouncement(stmt.getAsObject() as never)
    // Summary omits body/background but they're cheap to carry; strip for the list type.
    rows.push({
      id: a.id, title: a.title, display: a.display, frequency: a.frequency,
      startDate: a.startDate, endDate: a.endDate, active: a.active, expired: a.expired
    })
  }
  stmt.free()
  return rows
}

export function getAnnouncement(id: number): Announcement | null {
  const stmt = db.prepare(
    'SELECT id, title, body, display, background, frequency, start_date, end_date, active FROM announcement WHERE id = ?'
  )
  stmt.bind([id])
  if (!stmt.step()) { stmt.free(); return null }
  const a = rowToAnnouncement(stmt.getAsObject() as never)
  stmt.free()
  return a
}

export function createAnnouncement(input: AnnouncementInput): number {
  db.run(
    'INSERT INTO announcement (title, body, display, background, frequency, start_date, end_date, active, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [
      input.title,
      input.body,
      input.display,
      input.background ?? null,
      input.frequency,
      input.startDate ?? null,
      input.endDate ?? null,
      input.active === false ? 0 : 1,
      Date.now()
    ]
  )
  const id = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0] as number
  persist()
  return id
}

export function updateAnnouncement(id: number, input: AnnouncementInput): void {
  db.run(
    'UPDATE announcement SET title = ?, body = ?, display = ?, background = ?, frequency = ?, start_date = ?, end_date = ?, active = ? WHERE id = ?',
    [
      input.title,
      input.body,
      input.display,
      input.background ?? null,
      input.frequency,
      input.startDate ?? null,
      input.endDate ?? null,
      input.active === false ? 0 : 1,
      id
    ]
  )
  persist()
}

export function deleteAnnouncement(id: number): void {
  db.run('DELETE FROM announcement WHERE id = ?', [id])
  persist()
}

// Active announcements whose schedule covers `serviceDate` (ISO YYYY-MM-DD).
export function listScheduledAnnouncements(serviceDate: string): AnnouncementSummary[] {
  return listAnnouncements().filter((a) =>
    announcementMatchesDate(
      { active: a.active, frequency: a.frequency, startDate: a.startDate, endDate: a.endDate },
      serviceDate
    )
  )
}

export function announcementTitle(id: number): string | null {
  const stmt = db.prepare('SELECT title FROM announcement WHERE id = ?')
  stmt.bind([id])
  const title = stmt.step() ? (stmt.getAsObject().title as string) : null
  stmt.free()
  return title
}
```

- [ ] **Step 4: Give service items an announcement title**

In `itemTitle` (`src/main/db.ts:345-355`), add before the final `return type`:

```ts
  if (type === 'announcement' && refId) return announcementTitle(refId) ?? 'Announcement (missing)'
```

- [ ] **Step 5: Typecheck main**

Run: `npm run typecheck:node`
Expected: PASS (announcement DB code is self-contained; the renderer errors from Task 2 don't affect the node project).

- [ ] **Step 6: Commit**

```bash
git add src/main/db.ts
git commit -m "feat(announcements): db table, CRUD, scheduling query"
```

---

### Task 4: IPC handlers + preload bridge + live loader

**Files:**
- Modify: `src/main/index.ts` (import new db fns; add `wf:announcements:*` handlers near song handlers ~line 1299; add `doLoadAnnouncement` near `doLoadSong` ~line 679; add `wf:live:loadAnnouncement` near line 1138)
- Modify: `src/preload/index.ts` (add methods after `songsImportPptx`, ~line 44)

- [ ] **Step 1: Import the new db functions**

In `src/main/index.ts`, add the new names to the existing `import { … } from './db'` (and `AnnouncementInput` to the shared-types import):

```ts
// from './db':
listAnnouncements, getAnnouncement, createAnnouncement, updateAnnouncement, deleteAnnouncement, listScheduledAnnouncements
// from '../shared/types':
AnnouncementInput
```

- [ ] **Step 2: Add `doLoadAnnouncement`**

After `doLoadSong` (`src/main/index.ts:~679`), add:

```ts
async function doLoadAnnouncement(id: number): Promise<void> {
  const a = getAnnouncement(id)
  if (!a) return
  if (a.display === 'ticker') {
    // Title literally 'Announcement' triggers the ticker renderer (existing mechanism).
    doLoadText('Announcement', a.body)
  } else {
    doLoadText(a.title, a.body, a.background ?? null)
  }
}
```

- [ ] **Step 3: Register CRUD IPC handlers**

After the song handlers (`src/main/index.ts:1299`), add:

```ts
ipcMain.handle('wf:announcements:list', (_e, search?: string) => listAnnouncements(search ?? ''))
ipcMain.handle('wf:announcements:get', (_e, id: number) => getAnnouncement(id))
ipcMain.handle('wf:announcements:create', (_e, input: AnnouncementInput) => createAnnouncement(input))
ipcMain.handle('wf:announcements:update', (_e, id: number, input: AnnouncementInput) => updateAnnouncement(id, input))
ipcMain.handle('wf:announcements:delete', (_e, id: number) => deleteAnnouncement(id))
ipcMain.handle('wf:announcements:scheduled', (_e, serviceDate: string) => listScheduledAnnouncements(serviceDate))
```

- [ ] **Step 4: Register the live loader**

After the granular live loaders (`src/main/index.ts:~1138`, e.g. after `wf:live:loadMedia`), add:

```ts
ipcMain.handle('wf:live:loadAnnouncement', async (_e, id: number) => {
  await doLoadAnnouncement(id); broadcast()
})
```

- [ ] **Step 5: Expose preload methods**

In `src/preload/index.ts`, after `songsImportPptx` (`~line 44`), add inside the `wf` object:

```ts
  // Announcements library
  announcementsList: (search?: string): Promise<AnnouncementSummary[]> => ipcRenderer.invoke('wf:announcements:list', search),
  announcementGet: (id: number): Promise<Announcement | null> => ipcRenderer.invoke('wf:announcements:get', id),
  announcementCreate: (input: AnnouncementInput): Promise<number> => ipcRenderer.invoke('wf:announcements:create', input),
  announcementUpdate: (id: number, input: AnnouncementInput): Promise<void> => ipcRenderer.invoke('wf:announcements:update', id, input),
  announcementDelete: (id: number): Promise<void> => ipcRenderer.invoke('wf:announcements:delete', id),
  announcementsScheduled: (serviceDate: string): Promise<AnnouncementSummary[]> => ipcRenderer.invoke('wf:announcements:scheduled', serviceDate),
  liveLoadAnnouncement: (id: number): Promise<void> => ipcRenderer.invoke('wf:live:loadAnnouncement', id),
```

Add the type imports at the top of `src/preload/index.ts` (merge into the existing `import type { … } from '../shared/types'`):

```ts
AnnouncementSummary, Announcement, AnnouncementInput
```

(`window.wf` is typed as `typeof wf` via `index.d.ts`, so these are automatically available on `window.wf` — no `.d.ts` edit.)

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck:node`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/index.ts src/preload/index.ts
git commit -m "feat(announcements): IPC handlers, preload bridge, live loader"
```

---

### Task 5: Announcements library UI + navigation

**Files:**
- Create: `src/renderer/src/AnnouncementsLibrary.tsx`
- Create: `src/renderer/src/AnnouncementEditor.tsx`
- Modify: `src/renderer/src/AppShell.tsx` (`View` union line 14; render switch lines 104-121; import)
- Modify: `src/renderer/src/Sidebar.tsx` (nav entry ~line 118; icon import)

- [ ] **Step 1: Create `AnnouncementEditor.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Film, Image as ImageIcon, X } from 'lucide-react'
import type { Announcement, AnnouncementInput } from '../../shared/types'
import { announcementExpired } from '../../shared/announcementSchedule'

// Edits one announcement. Loads the full record by id, saves via announcementUpdate
// (dates/toggles save immediately; text fields save on blur to avoid a DB write per
// keystroke). Calls onSaved so the library list refreshes.
export default function AnnouncementEditor({ id, onSaved }: { id: number; onSaved: () => void }): JSX.Element {
  const [a, setA] = useState<Announcement | null>(null)

  useEffect(() => {
    window.wf.announcementGet(id).then(setA)
  }, [id])

  if (!a) return <div className="text-sm text-slate-500">Loading…</div>

  const save = (patch: Partial<Announcement>): void => {
    const next = { ...a, ...patch }
    setA(next)
    const input: AnnouncementInput = {
      title: next.title,
      body: next.body,
      display: next.display,
      background: next.background,
      frequency: next.frequency,
      startDate: next.startDate,
      endDate: next.endDate,
      active: next.active
    }
    window.wf.announcementUpdate(id, input).then(onSaved)
  }

  const pickBg = async (): Promise<void> => {
    const result = await window.wf.dialogOpenFile()
    if (result.canceled || !result.filePaths[0]) return
    save({ background: result.filePaths[0] })
  }

  const isVid = a.background ? /\.(mp4|webm|mov|m4v)$/i.test(a.background) : false
  const expired = announcementExpired(a, new Date().toISOString().slice(0, 10))

  const summary = ((): string => {
    if (a.frequency === 'once') return a.startDate ? `One time on ${a.startDate}` : 'One time (pick a date)'
    const from = a.startDate ? `from ${a.startDate}` : 'from now'
    const to = a.endDate ? `until ${a.endDate}` : 'no end date'
    return `Every service ${from}, ${to}`
  })()

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
      <input
        value={a.title}
        onChange={(e) => setA({ ...a, title: e.target.value })}
        onBlur={() => save({ title: a.title })}
        placeholder="Announcement title"
        className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-lg font-semibold outline-none focus:border-emerald-500"
      />
      <textarea
        value={a.body}
        onChange={(e) => setA({ ...a, body: e.target.value })}
        onBlur={() => save({ body: a.body })}
        placeholder="Announcement text…"
        rows={4}
        className="w-full resize-none rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm outline-none focus:border-emerald-500"
      />

      {/* Display type */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Show as</label>
        <div className="flex gap-2">
          {(['slide', 'ticker'] as const).map((d) => (
            <button
              key={d}
              onClick={() => save({ display: d })}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold capitalize ${
                a.display === d ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Background (slide only) */}
      {a.display === 'slide' && (
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Background (optional)</label>
          {a.background ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                {isVid ? <Film size={13} /> : <ImageIcon size={13} />}{isVid ? 'video' : 'image'}
              </span>
              <button onClick={() => save({ background: null })} className="rounded px-1 text-slate-500 hover:text-red-600" title="Remove background"><X size={13} /></button>
            </div>
          ) : (
            <button onClick={pickBg} className="rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700">
              Choose image or video…
            </button>
          )}
        </div>
      )}

      {/* Schedule */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Schedule</label>
        <div className="mb-2 flex gap-2">
          {(['once', 'recurring'] as const).map((f) => (
            <button
              key={f}
              onClick={() => save({ frequency: f })}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold capitalize ${
                a.frequency === f ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              {f === 'once' ? 'One time' : 'Recurring'}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-slate-600">
            {a.frequency === 'once' ? 'Date' : 'Start'}
            <input
              type="date"
              value={a.startDate ?? ''}
              onChange={(e) => save({ startDate: e.target.value || null })}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
            />
          </label>
          {a.frequency === 'recurring' && (
            <label className="flex-1 text-xs text-slate-600">
              End (optional)
              <input
                type="date"
                value={a.endDate ?? ''}
                onChange={(e) => save({ endDate: e.target.value || null })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
              />
            </label>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {summary}{expired ? ' · expired' : ''}
        </p>
      </div>

      {/* Active */}
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={a.active} onChange={(e) => save({ active: e.target.checked })} />
        Active (uncheck to pause without deleting)
      </label>
    </div>
  )
}
```

- [ ] **Step 2: Create `AnnouncementsLibrary.tsx`** (modeled on `SongLibrary.tsx`)

```tsx
import { useEffect, useState } from 'react'
import { Megaphone, Plus, ScrollText, Type } from 'lucide-react'
import type { AnnouncementSummary } from '../../shared/types'
import AnnouncementEditor from './AnnouncementEditor'

function AnnouncementsLibrary(): JSX.Element {
  const [items, setItems] = useState<AnnouncementSummary[]>([])
  const [search, setSearch] = useState('')
  const [editorId, setEditorId] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; title: string } | null>(null)

  const refresh = (q = search): void => { window.wf.announcementsList(q).then(setItems) }
  useEffect(() => { refresh(search) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [search])

  const confirmRemove = async (): Promise<void> => {
    if (!confirmDelete) return
    if (editorId === confirmDelete.id) setEditorId(null)
    await window.wf.announcementDelete(confirmDelete.id)
    refresh()
    setConfirmDelete(null)
  }

  return (
    <>
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-w-sm rounded-xl border border-slate-200 bg-[#f4f6f9] p-5 shadow-lg">
            <h3 className="mb-2 text-lg font-semibold text-slate-900">Delete announcement?</h3>
            <p className="mb-4 text-sm text-slate-600">
              Delete <span className="font-semibold text-slate-900">{confirmDelete.title}</span>? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold hover:bg-slate-200">Cancel</button>
              <button onClick={confirmRemove} className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">Delete</button>
            </div>
          </div>
        </div>
      )}
      <div className="flex h-full min-h-0 gap-4 p-4 text-slate-900">
        <div className="flex w-96 flex-col rounded-xl border border-slate-200 bg-[#f4f6f9] p-3">
          <button
            onClick={async () => {
              const id = await window.wf.announcementCreate({ title: 'New Announcement', body: '', display: 'slide', frequency: 'recurring' })
              refresh()
              setEditorId(id)
            }}
            className="mb-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            <Plus size={15} /> New Announcement
          </button>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search announcements…"
            className="mb-3 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <div className="min-h-0 flex-1 space-y-1 overflow-auto">
            {items.length === 0 && (
              <p className="px-1 py-6 text-center text-sm text-slate-500">{search ? 'No matches.' : 'No announcements yet — add your first one'}</p>
            )}
            {items.map((it) => (
              <div
                key={it.id}
                className={`group flex items-center gap-2 rounded-lg px-3 py-2 ${editorId === it.id ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30' : 'hover:bg-slate-100'} ${it.expired ? 'opacity-50' : ''}`}
              >
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                  {it.display === 'ticker' ? <ScrollText size={14} /> : <Type size={14} />}
                </div>
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setEditorId(it.id)}>
                  <div className="truncate text-sm font-medium">{it.title}</div>
                  <div className="truncate text-xs text-slate-500">
                    {it.frequency === 'once' ? 'One time' : 'Recurring'}{it.expired ? ' · expired' : it.active ? '' : ' · paused'}
                  </div>
                </div>
                <button onClick={() => setConfirmDelete({ id: it.id, title: it.title })} className="shrink-0 rounded px-2 py-1 text-xs text-slate-500 opacity-0 hover:bg-red-500/20 hover:text-red-600 group-hover:opacity-100">Del</button>
              </div>
            ))}
          </div>
          <div className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500">{items.length} announcement{items.length === 1 ? '' : 's'}</div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-slate-200 bg-[#f4f6f9] p-4">
          {editorId != null ? (
            <AnnouncementEditor key={editorId} id={editorId} onSaved={() => refresh()} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <Megaphone size={40} className="opacity-20" />
              <p className="text-sm text-slate-500">Select an announcement to edit, or add a new one</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default AnnouncementsLibrary
```

- [ ] **Step 3: Wire into `AppShell.tsx`**

Add the import near the other view imports:

```tsx
import AnnouncementsLibrary from './AnnouncementsLibrary'
```

Extend the `View` union (`src/renderer/src/AppShell.tsx:14`):

```ts
export type View = 'home' | 'live' | 'service' | 'songs' | 'announcements' | 'scripture' | 'volunteer' | 'settings' | 'soundcheck'
```

In the render switch (`src/renderer/src/AppShell.tsx:104-121`), add a branch after the `songs` branch:

```tsx
          ) : view === 'songs' ? (
            <SongLibrary />
          ) : view === 'announcements' ? (
            <AnnouncementsLibrary />
          ) : view === 'soundcheck' ? (
```

- [ ] **Step 4: Add the sidebar nav entry**

In `src/renderer/src/Sidebar.tsx`, import the icon (merge into the existing `lucide-react` import):

```tsx
Megaphone
```

Add the nav line in the "Prepare" group (`src/renderer/src/Sidebar.tsx:115-118`), after Song library:

```tsx
        {nav('songs', Music, 'Song library')}
        {nav('announcements', Megaphone, 'Announcements')}
```

- [ ] **Step 5: Typecheck web**

Run: `npm run typecheck:web`
Expected: PASS for these new files (the `TYPE_ICON`/switch errors from Task 2 remain until Task 6 — that's expected; the new library files themselves should be clean).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/AnnouncementsLibrary.tsx src/renderer/src/AnnouncementEditor.tsx src/renderer/src/AppShell.tsx src/renderer/src/Sidebar.tsx
git commit -m "feat(announcements): library tab, editor, navigation"
```

---

### Task 6: Wire `announcement` through the service-item switches

**Files:**
- Modify: `src/main/index.ts` (`handleTabletLoadItem` 739-777; `itemCanGoLive` 486-496; `computeItemSlides` 682-708)
- Modify: `src/renderer/src/liveActions.ts` (`sendItemLive` 26-59; `canGoLive` 14-24)
- Modify: `src/renderer/src/ServiceDeck.tsx` (`TYPE_ICON` line 8; `itemPreview` 21-35)
- Create: `src/renderer/src/AnnouncementItemEditor.tsx`
- Modify: `src/renderer/src/ItemEditor.tsx` (dispatch 99-161)

- [ ] **Step 1: `handleTabletLoadItem` — add announcement branch**

In `src/main/index.ts`, in `handleTabletLoadItem`, add before the closing `else { return }` (after the `ticker` branch):

```ts
  } else if (item.type === 'announcement' && item.ref_id != null) {
    await doLoadAnnouncement(item.ref_id)
```

- [ ] **Step 2: `itemCanGoLive` — add clause**

In `src/main/index.ts:486-496`, add inside the boolean chain:

```ts
    (item.type === 'announcement' && item.ref_id != null) ||
```

- [ ] **Step 3: `computeItemSlides` — add branch**

In `src/main/index.ts:682-708`, add before `return []`:

```ts
  if (item.type === 'announcement' && item.ref_id != null) {
    const a = getAnnouncement(item.ref_id)
    if (!a) return []
    if (a.display === 'ticker') return a.body ? [a.body] : []
    const lines: string[] = []
    if (a.title) lines.push(a.title)
    a.body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).forEach((b) => lines.push(b))
    return lines.length ? lines : (a.title ? [a.title] : [])
  }
```

- [ ] **Step 4: `sendItemLive` + `canGoLive` (renderer)**

In `src/renderer/src/liveActions.ts`, in `sendItemLive` add before the final `else { return }`:

```ts
  } else if (item.type === 'announcement' && item.ref_id != null) {
    await window.wf.liveLoadAnnouncement(item.ref_id)
```

In `canGoLive` (`liveActions.ts:14-24`) add to the boolean chain:

```ts
    (item.type === 'announcement' && item.ref_id != null) ||
```

- [ ] **Step 5: `ServiceDeck` icon + preview**

In `src/renderer/src/ServiceDeck.tsx`, add `Megaphone` to the `lucide-react` import, then extend `TYPE_ICON` (line 8-10):

```tsx
const TYPE_ICON: Record<ServiceItem['type'], IconType> = {
  song: Music, scripture: BookOpen, text: Type, countdown: Timer, image: ImageIcon, welcome: Hand, ticker: ScrollText, announcement: Megaphone
}
```

In `itemPreview` (`ServiceDeck.tsx:21-35`), add a case so the deck shows a hint (announcement content lives in the library, so the title is enough — return empty string):

```tsx
  if (it.type === 'announcement') return ''
```

(Place it alongside the other `if (it.type === …)` lines; the row already shows `it.title`, which resolves to the announcement's title via `itemTitle`.)

- [ ] **Step 6: Create `AnnouncementItemEditor.tsx`** (read-only summary in the service editor)

```tsx
import { useEffect, useState } from 'react'
import { Megaphone } from 'lucide-react'
import type { Announcement } from '../../shared/types'

// Shown in the service editor for an `announcement` item. Content is owned by the
// Announcements library, so this is read-only — it points the operator there to edit.
export default function AnnouncementItemEditor({ refId }: { refId: number | null }): JSX.Element {
  const [a, setA] = useState<Announcement | null>(null)
  useEffect(() => {
    if (refId != null) window.wf.announcementGet(refId).then(setA)
  }, [refId])

  if (!a) return <div className="text-sm text-slate-500">Announcement not found. It may have been deleted from the library.</div>

  return (
    <div className="space-y-2 text-sm text-slate-700">
      <div className="flex items-center gap-2 font-semibold text-slate-900">
        <Megaphone size={15} /> {a.title}
      </div>
      <p className="whitespace-pre-line rounded-lg bg-slate-100 px-3 py-2 text-slate-600">{a.body || '(no text)'}</p>
      <p className="text-xs text-slate-500">
        Shows as <b className="capitalize">{a.display}</b>. Edit the text, background, or schedule in the <b>Announcements</b> tab.
      </p>
    </div>
  )
}
```

- [ ] **Step 7: `ItemEditor` dispatch**

In `src/renderer/src/ItemEditor.tsx`, add the import:

```tsx
import AnnouncementItemEditor from './AnnouncementItemEditor'
```

Add a dispatch block alongside the others (`ItemEditor.tsx:99-161`):

```tsx
      {item.type === 'announcement' && (
        <AnnouncementItemEditor refId={item.ref_id} />
      )}
```

- [ ] **Step 8: Full typecheck (should now be clean)**

Run: `npm run typecheck`
Expected: PASS — all `Record<ServiceItemType, …>` and switch sites now cover `announcement`.

- [ ] **Step 9: Commit**

```bash
git add src/main/index.ts src/renderer/src/liveActions.ts src/renderer/src/ServiceDeck.tsx src/renderer/src/AnnouncementItemEditor.tsx src/renderer/src/ItemEditor.tsx
git commit -m "feat(announcements): wire announcement item type through live/deck/editor"
```

---

### Task 7: "Scheduled for this service" suggestions + manual add

**Files:**
- Create: `src/renderer/src/ScheduledAnnouncements.tsx`
- Modify: `src/renderer/src/ServiceEditor.tsx` (add `addAnnouncement`; render the panel in the left column near `ServiceDeck`)

- [ ] **Step 1: Create `ScheduledAnnouncements.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { CalendarClock, Check, Plus } from 'lucide-react'
import type { AnnouncementSummary } from '../../shared/types'

// Lists active announcements scheduled for `serviceDate`, with one-tap add. Rows
// already present in the service (by ref_id) show as "Added". Hidden entirely when
// the service has no date set.
export default function ScheduledAnnouncements({
  serviceDate,
  addedRefIds,
  onAdd
}: {
  serviceDate: string | null
  addedRefIds: Set<number>
  onAdd: (announcementId: number) => void
}): JSX.Element | null {
  const [items, setItems] = useState<AnnouncementSummary[]>([])

  useEffect(() => {
    if (!serviceDate) { setItems([]); return }
    window.wf.announcementsScheduled(serviceDate).then(setItems)
  }, [serviceDate, addedRefIds.size])

  if (!serviceDate) {
    return (
      <div className="mb-3 rounded-xl border border-dashed border-slate-300 bg-[#f4f6f9] p-3 text-xs text-slate-500">
        Set a service date to see scheduled announcements.
      </div>
    )
  }
  if (items.length === 0) return null

  const unadded = items.filter((it) => !addedRefIds.has(it.id))

  return (
    <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <CalendarClock size={14} className="text-emerald-700" />
        <span className="text-xs font-bold uppercase tracking-widest text-emerald-700">Scheduled for {serviceDate}</span>
        {unadded.length > 0 && (
          <button
            onClick={() => unadded.forEach((it) => onAdd(it.id))}
            className="ml-auto rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
          >
            Add all
          </button>
        )}
      </div>
      <div className="space-y-1">
        {items.map((it) => {
          const added = addedRefIds.has(it.id)
          return (
            <div key={it.id} className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-slate-800">{it.title}</span>
              {added ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><Check size={13} /> Added</span>
              ) : (
                <button onClick={() => onAdd(it.id)} className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-200">
                  <Plus size={13} /> Add
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add `addAnnouncement` + render the panel in `ServiceEditor.tsx`**

Add the import at the top:

```tsx
import ScheduledAnnouncements from './ScheduledAnnouncements'
```

Add the handler next to `addSong` (`src/renderer/src/ServiceEditor.tsx:62-66`):

```tsx
  const addAnnouncement = async (announcementId: number): Promise<void> => {
    const id = await window.wf.serviceAddItem(serviceId, { type: 'announcement', ref_id: announcementId })
    await reload()
    setSelectedId(id)
  }
```

Render `<ScheduledAnnouncements>` in the LEFT column, directly above the `<ServiceDeck …/>` (read `ServiceEditor.tsx:94-108` to find the left-column JSX; insert this just before `<ServiceDeck`). `service` is the loaded `ServiceFull` (has `.service_date` and `.items`):

```tsx
            <ScheduledAnnouncements
              serviceDate={service?.service_date ?? null}
              addedRefIds={new Set((service?.items ?? []).filter((it) => it.type === 'announcement' && it.ref_id != null).map((it) => it.ref_id as number))}
              onAdd={addAnnouncement}
            />
```

> If the loaded service object in `ServiceEditor` uses a different variable name than `service`, use that name. Confirm by reading the component's state around lines 20-45.

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/ScheduledAnnouncements.tsx src/renderer/src/ServiceEditor.tsx
git commit -m "feat(announcements): scheduled-for-this-service suggestions panel"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Automated gates**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; all tests pass (including the new `announcementSchedule` tests); build succeeds with CSS emitted.

- [ ] **Step 2: Manual walkthrough** (run `npm run dev`)

- [ ] Announcements tab appears in the Prepare group; create a `slide` announcement (title + body + a background image) set to `recurring` with a start date of a Sunday.
- [ ] Create a `ticker` announcement set to `once` on that same Sunday.
- [ ] Create a `recurring` announcement with an `endDate` in the past → it shows greyed "expired" in the list.
- [ ] Open a service whose `service_date` is that Sunday → the "Scheduled for …" panel lists the two active matches (not the expired one); "Add" inserts them; re-opening shows "Added ✓"; "Add all" adds remaining.
- [ ] The `slide` announcement goes live as a full slide with its background (audience output + Zone 3); the `ticker` announcement scrolls.
- [ ] Editing an announcement's body in the library updates what the referenced service item shows live.
- [ ] A service with no date shows the "Set a service date…" hint instead of the panel.

- [ ] **Step 3: Commit any verification tweaks**

```bash
git add -A
git commit -m "fix(announcements): verification tweaks"
```

---

## Self-Review

- **Spec coverage:**
  - B1 data model → Task 3 table + Task 2 types. ✓
  - B2 scheduling/matching + expiry → Task 1 pure helpers (tested) + Task 3 `listScheduledAnnouncements`/`expired`. ✓
  - B3 shared types → Task 2. ✓
  - B4 DB fns + IPC → Task 3 + Task 4. ✓
  - B5 Announcements tab (list w/ expired marker + editor) → Task 5. ✓
  - B6 reference model + all switch sites + suggestions dedup → Task 6 + Task 7. ✓
  - B7 live rendering (slide→text path, ticker→ticker) → Task 4 `doLoadAnnouncement` + Task 6 wiring. ✓
  - Feature A already shipped separately. ✓
- **Placeholders:** none. Every code step shows full code; the only "read to confirm" notes are the `ServiceEditor` left-column insertion point and its service-state variable name, with exact line refs to check.
- **Type consistency:** `AnnouncementInput`/`Announcement`/`AnnouncementSummary` fields match across types (Task 2), DB (`rowToAnnouncement`, CRUD — Task 3), preload (Task 4), and UI (Tasks 5-7). `doLoadAnnouncement` (defined Task 4) is referenced in Task 6 Step 1. `announcementMatchesDate`/`announcementExpired` signatures match their tests (Task 1) and callers (Task 3, Task 5 editor). `announcementsScheduled`/`announcementsList`/`announcementGet`/`announcementCreate`/`announcementUpdate`/`announcementDelete`/`liveLoadAnnouncement` names are identical in preload (Task 4) and all callers (Tasks 5-7).
- **Scope decomposition:** one cohesive feature; tasks are ordered so the library is usable after Task 5 and service integration completes at Task 7. Kept as a single plan.

## Known limitation carried forward
The ticker renderer keys off the live title containing "Announcement". A `slide` announcement whose title contains that word will render as a ticker. Documented; hardening (an explicit ticker flag on `LiveState`) is a possible follow-up, out of scope here.
