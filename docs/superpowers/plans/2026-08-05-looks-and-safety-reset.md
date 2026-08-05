# Looks and Safety Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Named, saved 4-zone pin presets ("Looks") recalled in one click from the Live tab, plus a single hardcoded Safety Reset button that forces all 4 zones to the church logo.

**Architecture:** Both features build directly on the existing zone-pin mechanism (`zonePins: Map<ZoneId, ZonePin>` in `src/main/index.ts`, already the top of the zone-routing precedence chain). A Look is a named snapshot of that map, stored as one JSON blob in the existing `setting` table — same pattern as the scene palette (`zone_scenes`). No new database table, no new precedence rules.

**Tech Stack:** Electron 33, TypeScript, React 18, sql.js, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-05-looks-and-safety-reset-design.md`

---

## Before you start

Mandatory gate before every commit:

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

As of this plan, that gate passes with **367 tests, 0 lint errors**. Do not commit if any of the four fails.

Repo conventions already established this session, still in force:

1. **Never `git add -A` or `git add .`.** Stage only the exact files each task names.
2. **This sandbox cannot launch Electron.** Task 6 is marked **[manual]**.
3. **Push after each commit** — the user has asked for auto-push on this batch of work; `git push` is part of every task's final step.
4. **A `Look`'s `pins` field reuses the existing `ZonePins` type and its validator** (`src/shared/zonePins.ts`) rather than inventing a new shape — `ZonePins = Partial<Record<ZoneId, ZonePin>>`, where an absent key means "was unpinned (following the service) when saved." Applying a Look still guarantees "all 4 zones end up exactly as saved" (the design's stated requirement) — that guarantee comes from the *apply loop* explicitly clearing any zone missing from `look.pins`, not from the type itself carrying an explicit `null`.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/shared/zoneLooks.ts` | `Look` type, parse/validate — mirrors `zoneScenes.ts`'s shape exactly. |
| `src/shared/zoneLooks.test.ts` | Tests for the above. |
| `src/renderer/src/zones/LooksPanel.tsx` | Live-tab panel: one-click Look buttons + the Safety Reset button. |

**Modified:**

| File | Change |
|---|---|
| `src/main/index.ts` | New IPC handlers: `wf:looks:list`, `wf:looks:save`, `wf:looks:delete`, `wf:looks:apply`, `wf:zone:safetyReset`. |
| `src/preload/index.ts` | Bindings for the five new channels. |
| `src/renderer/src/browserWfMock.ts` | Mocks for the five new bindings. |
| `src/renderer/src/ZonePanel.tsx` | "Save current pins as a Look" control (Setup screen, next to the existing zone grid). |
| `src/renderer/src/ServiceRail.tsx` | Mounts the new `LooksPanel` below the existing `LiveZoneStatus`. |

**Not touched:** `src/shared/zonePins.ts` (only imported from, not modified — `validateZonePins` is reused as-is), `src/renderer/src/zones/ZoneLiveGrid.tsx`/`ZonePinPicker.tsx` (pinning itself is unchanged; Looks operate on the same underlying `zonePins` map through new, separate IPC calls), `src/shared/zoneScenes.ts` (a different, unrelated preset concept — scenes are per-item routing templates, Looks are whole-show pin snapshots).

---

## Task 1: zoneLooks.ts — the Look type and its validators

**Files:**
- Create: `src/shared/zoneLooks.ts`
- Test: `src/shared/zoneLooks.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/shared/zoneLooks.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateLook, validateLooksConfig, parseLooksConfig } from './zoneLooks'
import type { Look } from './zoneLooks'

describe('validateLook', () => {
  it('accepts a well-formed Look with mode pins', () => {
    const look: Look = { id: 'a', name: 'Sermon', pins: { 1: { kind: 'mode', mode: 'logo' }, 3: { kind: 'mode', mode: 'black' } } }
    expect(validateLook(look)).toBe(true)
  })

  it('accepts a well-formed Look with a titleCard pin', () => {
    const look: Look = { id: 'a', name: 'Hold sermon', pins: { 1: { kind: 'titleCard', itemId: 42 } } }
    expect(validateLook(look)).toBe(true)
  })

  it('accepts a Look with no pins at all (every zone follows the service)', () => {
    const look: Look = { id: 'a', name: 'Nothing pinned', pins: {} }
    expect(validateLook(look)).toBe(true)
  })

  it('rejects a missing or empty id', () => {
    expect(validateLook({ id: '', name: 'X', pins: {} })).toBe(false)
    expect(validateLook({ name: 'X', pins: {} })).toBe(false)
  })

  it('rejects a missing or blank name', () => {
    expect(validateLook({ id: 'a', name: '', pins: {} })).toBe(false)
    expect(validateLook({ id: 'a', name: '   ', pins: {} })).toBe(false)
    expect(validateLook({ id: 'a', pins: {} })).toBe(false)
  })

  it('rejects a Look whose pins fail zone-pin validation', () => {
    expect(validateLook({ id: 'a', name: 'X', pins: { 1: { kind: 'mode', mode: 'bogus' } } })).toBe(false)
    expect(validateLook({ id: 'a', name: 'X', pins: { 5: { kind: 'mode', mode: 'logo' } } })).toBe(false)
  })

  it('rejects non-object input', () => {
    expect(validateLook(null)).toBe(false)
    expect(validateLook('a look')).toBe(false)
    expect(validateLook(42)).toBe(false)
  })
})

describe('validateLooksConfig', () => {
  it('accepts an array of valid Looks', () => {
    const looks: Look[] = [
      { id: 'a', name: 'Sermon', pins: { 1: { kind: 'mode', mode: 'logo' } } },
      { id: 'b', name: 'Everywhere', pins: {} }
    ]
    expect(validateLooksConfig(looks)).toBe(true)
  })

  it('accepts an empty array', () => {
    expect(validateLooksConfig([])).toBe(true)
  })

  it('rejects a non-array', () => {
    expect(validateLooksConfig({})).toBe(false)
  })

  it('rejects duplicate ids', () => {
    const looks = [
      { id: 'a', name: 'One', pins: {} },
      { id: 'a', name: 'Two', pins: {} }
    ]
    expect(validateLooksConfig(looks)).toBe(false)
  })

  it('rejects an array containing one invalid Look', () => {
    const looks = [
      { id: 'a', name: 'Valid', pins: {} },
      { id: 'b', name: '', pins: {} }
    ]
    expect(validateLooksConfig(looks)).toBe(false)
  })
})

describe('parseLooksConfig', () => {
  it('returns an empty array for null input', () => {
    expect(parseLooksConfig(null)).toEqual([])
  })

  it('returns an empty array for malformed JSON', () => {
    expect(parseLooksConfig('{not json')).toEqual([])
  })

  it('returns an empty array for well-formed JSON that fails validation', () => {
    expect(parseLooksConfig(JSON.stringify([{ id: 'a', name: '', pins: {} }]))).toEqual([])
  })

  it('round-trips a real list of Looks', () => {
    const looks: Look[] = [{ id: 'a', name: 'Sermon', pins: { 1: { kind: 'mode', mode: 'logo' } } }]
    expect(parseLooksConfig(JSON.stringify(looks))).toEqual(looks)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx vitest run src/shared/zoneLooks.test.ts
```

Expected: fails to collect — `Failed to resolve import "./zoneLooks"`.

- [ ] **Step 3: Write the module**

Create `src/shared/zoneLooks.ts`:

```ts
// Looks: named, saved snapshots of all 4 zones' pin state ("what's routed to
// every zone right now"), recalled in one click instead of pinning each zone
// separately. A Look's `pins` field is the exact same shape zonePins.ts
// already validates (ZonePins — an absent zone key means "was unpinned,
// following the service, when saved"), so applying a Look reuses that
// validation rather than inventing a parallel one. Pure module: no DB, no
// Electron. See the 2026-08-05 design spec.
import type { ZonePins } from './zonePins'
import { validateZonePins } from './zonePins'

export interface Look {
  id: string
  name: string
  pins: ZonePins
}

export function validateLook(value: unknown): value is Look {
  if (typeof value !== 'object' || value === null) return false
  const l = value as Look
  if (typeof l.id !== 'string' || !l.id) return false
  if (typeof l.name !== 'string' || !l.name.trim()) return false
  if (!validateZonePins(l.pins)) return false
  return true
}

export function validateLooksConfig(value: unknown): value is Look[] {
  if (!Array.isArray(value)) return false
  const ids = new Set<string>()
  for (const look of value) {
    if (!validateLook(look)) return false
    if (ids.has(look.id)) return false
    ids.add(look.id)
  }
  return true
}

// Never throws; anything unusable yields no saved Looks.
export function parseLooksConfig(json: string | null): Look[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return validateLooksConfig(parsed) ? (parsed as Look[]) : []
  } catch {
    return []
  }
}
```

- [ ] **Step 4: Run it and confirm it passes**

```bash
npx vitest run src/shared/zoneLooks.test.ts
```

Expected: all tests pass (16 tests).

- [ ] **Step 5: Run the full gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 367 + 16 = 383 tests.

- [ ] **Step 6: Commit and push**

```bash
git add src/shared/zoneLooks.ts src/shared/zoneLooks.test.ts
git commit -m "feat: pure Look type and validators for saved zone-pin presets"
git push
```

---

## Task 2: IPC handlers — list, save, delete, apply, safety reset

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Add the import**

Find:

```ts
import { validateZonePins } from '../shared/zonePins'
import type { ZonePin, ZonePins } from '../shared/zonePins'
```

Replace with:

```ts
import { validateZonePins } from '../shared/zonePins'
import type { ZonePin, ZonePins } from '../shared/zonePins'
import { parseLooksConfig } from '../shared/zoneLooks'
import type { Look } from '../shared/zoneLooks'
```

- [ ] **Step 2: Add the five IPC handlers**

Find:

```ts
ipcMain.handle('wf:zone:getPins', (): ZonePins => zonePinsRecord())
```

Replace with:

```ts
ipcMain.handle('wf:zone:getPins', (): ZonePins => zonePinsRecord())

// --- Looks (saved zone-pin presets) ---

ipcMain.handle('wf:looks:list', (): Look[] => parseLooksConfig(getSetting('zone_looks')))

ipcMain.handle('wf:looks:save', (_e: unknown, name: string): void => {
  const looks = parseLooksConfig(getSetting('zone_looks'))
  const look: Look = { id: randomUUID(), name, pins: zonePinsRecord() }
  setSetting('zone_looks', JSON.stringify([...looks, look]))
})

ipcMain.handle('wf:looks:delete', (_e: unknown, lookId: string): void => {
  const looks = parseLooksConfig(getSetting('zone_looks'))
  setSetting('zone_looks', JSON.stringify(looks.filter((l) => l.id !== lookId)))
})

// Applying a Look sets exactly what was saved for all 4 zones — a zone
// absent from look.pins is explicitly unpinned here, not left alone, so a
// recall always reproduces the saved combination regardless of whatever the
// zones were doing beforehand. looks came from parseLooksConfig, which
// already ran validateZonePins over the whole pins object, so no per-zone
// re-validation is needed here. A pinned item that's since been deleted
// isn't this handler's problem to solve — computeZoneStates() already
// degrades a missing pinned item to 'logo' on its own.
ipcMain.handle('wf:looks:apply', (_e: unknown, lookId: string): void => {
  const looks = parseLooksConfig(getSetting('zone_looks'))
  const look = looks.find((l) => l.id === lookId)
  if (!look) throw new Error('Look not found')
  for (const zoneId of [1, 2, 3, 4] as ZoneId[]) {
    const pin = look.pins[zoneId] ?? null
    if (pin == null) zonePins.delete(zoneId)
    else zonePins.set(zoneId, pin)
  }
  warnedMissingPins.clear()
  broadcast()
})

// Hardcoded, not a user-editable Look — always available, never accidentally
// renamed or deleted. Screens only: no Sound Check, Room Feed, or track
// changes, per the design's explicit scope decision.
ipcMain.handle('wf:zone:safetyReset', (): void => {
  for (const zoneId of [1, 2, 3, 4] as ZoneId[]) {
    zonePins.set(zoneId, { kind: 'mode', mode: 'logo' })
  }
  warnedMissingPins.clear()
  broadcast()
})
```

- [ ] **Step 3: Run the full gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 383 tests (no new tests — this is IPC/Electron-glue code, matching this codebase's existing posture toward `wf:zone:*`/`wf:scenes:*` handlers, none of which have direct unit tests either). Typecheck is the meaningful check here — it will catch any mismatch between `Look`'s fields and how they're used, and confirm `randomUUID` is already imported (it is — `src/main/index.ts` already imports `{ randomUUID, randomInt, randomBytes } from 'crypto'` for other features).

- [ ] **Step 4: Commit and push**

```bash
git add src/main/index.ts
git commit -m "feat: IPC handlers for Looks and safety reset"
git push
```

---

## Task 3: Preload bindings + browser mock

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/browserWfMock.ts`

- [ ] **Step 1: Add the import and bindings to src/preload/index.ts**

Find:

```ts
import type { ZonePin, ZonePins } from '../shared/zonePins'
```

Replace with:

```ts
import type { ZonePin, ZonePins } from '../shared/zonePins'
import type { Look } from '../shared/zoneLooks'
```

Find:

```ts
  zoneGetPins: (): Promise<ZonePins> =>
    ipcRenderer.invoke('wf:zone:getPins'),
```

Replace with:

```ts
  zoneGetPins: (): Promise<ZonePins> =>
    ipcRenderer.invoke('wf:zone:getPins'),
  looksList: (): Promise<Look[]> => ipcRenderer.invoke('wf:looks:list'),
  looksSave: (name: string): Promise<void> => ipcRenderer.invoke('wf:looks:save', name),
  looksDelete: (lookId: string): Promise<void> => ipcRenderer.invoke('wf:looks:delete', lookId),
  looksApply: (lookId: string): Promise<void> => ipcRenderer.invoke('wf:looks:apply', lookId),
  zoneSafetyReset: (): Promise<void> => ipcRenderer.invoke('wf:zone:safetyReset'),
```

- [ ] **Step 2: Add the import and mocks to src/renderer/src/browserWfMock.ts**

Find:

```ts
import type { ZonePin, ZonePins } from '../../shared/zonePins'
```

Replace with:

```ts
import type { ZonePin, ZonePins } from '../../shared/zonePins'
import type { Look } from '../../shared/zoneLooks'
```

Find:

```ts
const mockPins: ZonePins = {}
```

Replace with:

```ts
const mockPins: ZonePins = {}
const mockLooks: Look[] = []
```

Find:

```ts
    zoneGetPins: async (): Promise<ZonePins> => ({ ...mockPins }),
```

Replace with:

```ts
    zoneGetPins: async (): Promise<ZonePins> => ({ ...mockPins }),
    looksList: async (): Promise<Look[]> => mockLooks.map((l) => ({ ...l })),
    looksSave: async (name: string): Promise<void> => {
      mockLooks.push({ id: String(mockLooks.length + 1), name, pins: { ...mockPins } })
    },
    looksDelete: async (lookId: string): Promise<void> => {
      const idx = mockLooks.findIndex((l) => l.id === lookId)
      if (idx >= 0) mockLooks.splice(idx, 1)
    },
    looksApply: async (lookId: string): Promise<void> => {
      const look = mockLooks.find((l) => l.id === lookId)
      if (!look) return
      for (const key of Object.keys(mockPins)) delete mockPins[Number(key) as ZoneId]
      Object.assign(mockPins, look.pins)
    },
    zoneSafetyReset: async (): Promise<void> => {
      mockPins[1] = { kind: 'mode', mode: 'logo' }
      mockPins[2] = { kind: 'mode', mode: 'logo' }
      mockPins[3] = { kind: 'mode', mode: 'logo' }
      mockPins[4] = { kind: 'mode', mode: 'logo' }
    },
```

- [ ] **Step 3: Run the full gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 383 tests. Typecheck will catch any mismatch between the real preload bindings and the browser mock.

- [ ] **Step 4: Commit and push**

```bash
git add src/preload/index.ts src/renderer/src/browserWfMock.ts
git commit -m "feat: expose Looks and safety reset on window.wf"
git push
```

---

## Task 4: "Save current pins as a Look" (Setup screen)

**Files:**
- Modify: `src/renderer/src/ZonePanel.tsx`

- [ ] **Step 1: Add state and the save handler**

Find:

```tsx
import { useEffect, useState } from 'react'
import type { ZoneId } from '../../shared/types'
import { ZONE_NAMES } from '../../shared/types'
import ZoneLiveGrid from './zones/ZoneLiveGrid'

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

// The Live tab's zone section: the four clickable screen cards, plus the Pi
// addresses. Authoring (scenes, per-item routing) deliberately does NOT live
// here — editing an item's stored setup from the Live tab looked like a live
// control but silently changed what the item does every future time it goes up.
function ZonePanel(): JSX.Element {
  const [serverIp, setServerIp] = useState<string>('...')
  const [port, setPort] = useState<number | null>(null)

  useEffect(() => {
    void window.wf.zoneGetIp().then(setServerIp)
    void window.wf.getTabletPort().then(p => setPort(p)).catch(err => {
      console.error('Failed to get tablet port:', err)
      setPort(3691) // fallback
    })
  }, [])

  return (
```

Replace with:

```tsx
import { useEffect, useState } from 'react'
import type { ZoneId } from '../../shared/types'
import { ZONE_NAMES } from '../../shared/types'
import ZoneLiveGrid from './zones/ZoneLiveGrid'

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

// The Live tab's zone section: the four clickable screen cards, plus the Pi
// addresses. Authoring (scenes, per-item routing) deliberately does NOT live
// here — editing an item's stored setup from the Live tab looked like a live
// control but silently changed what the item does every future time it goes up.
function ZonePanel(): JSX.Element {
  const [serverIp, setServerIp] = useState<string>('...')
  const [port, setPort] = useState<number | null>(null)
  const [savingLook, setSavingLook] = useState(false)
  const [lookName, setLookName] = useState('')

  useEffect(() => {
    void window.wf.zoneGetIp().then(setServerIp)
    void window.wf.getTabletPort().then(p => setPort(p)).catch(err => {
      console.error('Failed to get tablet port:', err)
      setPort(3691) // fallback
    })
  }, [])

  const saveLook = async (): Promise<void> => {
    const name = lookName.trim()
    if (!name) return
    await window.wf.looksSave(name)
    setLookName('')
    setSavingLook(false)
  }

  return (
```

- [ ] **Step 2: Render the save-a-Look control**

Find:

```tsx
      <ZoneLiveGrid />

      {/* Pi network addresses */}
```

Replace with:

```tsx
      <ZoneLiveGrid />

      {/* Save the 4 zones' current pins as a one-click preset, recalled from the Live tab */}
      <div className="rounded-lg border border-slate-200 bg-slate-100/70 p-2.5">
        {savingLook ? (
          <div className="flex items-center gap-1.5">
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- continuation of the operator's own "+ Save..." click, matching this session's existing convention (e.g. SongLibrary.tsx) */}
            <input
              autoFocus
              value={lookName}
              onChange={(e) => setLookName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveLook()
                if (e.key === 'Escape') { setSavingLook(false); setLookName('') }
              }}
              placeholder="Name this Look"
              aria-label="Name this Look"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-blue-500"
            />
            <button onClick={saveLook} className="shrink-0 text-xs font-semibold text-blue-700">Save</button>
          </div>
        ) : (
          <button
            onClick={() => setSavingLook(true)}
            className="w-full rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-800"
          >
            + Save current pins as a Look
          </button>
        )}
      </div>

      {/* Pi network addresses */}
```

- [ ] **Step 3: Run the full gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 383 tests (no new tests — UI, matches this file's existing untested baseline). If lint flags the `autoFocus` despite the disable comment, double-check the comment is on the line immediately above the JSX element it targets (matching this session's already-proven-working placement elsewhere).

- [ ] **Step 4: Commit and push**

```bash
git add src/renderer/src/ZonePanel.tsx
git commit -m "feat: save current zone pins as a named Look"
git push
```

---

## Task 5: LooksPanel — recall + Safety Reset on the Live tab

**Files:**
- Create: `src/renderer/src/zones/LooksPanel.tsx`
- Modify: `src/renderer/src/ServiceRail.tsx`

- [ ] **Step 1: Write the component**

Create `src/renderer/src/zones/LooksPanel.tsx`:

```tsx
// src/renderer/src/zones/LooksPanel.tsx
// Saved zone-pin presets ("Looks") + the safety-reset button — both live here
// on the Live tab since they're meant for in-the-moment use, unlike pinning
// itself, which stays a Setup-only action (see ZoneLiveGrid.tsx / ZonePanel.tsx).
import { useCallback, useEffect, useState } from 'react'
import { ShieldAlert, X } from 'lucide-react'
import type { Look } from '../../../shared/zoneLooks'

function LooksPanel(): JSX.Element {
  const [looks, setLooks] = useState<Look[]>([])

  const refresh = useCallback((): void => { void window.wf.looksList().then(setLooks) }, [])

  useEffect(() => { refresh() }, [refresh])

  const applyLook = (lookId: string): void => {
    void window.wf.looksApply(lookId)
  }

  const deleteLook = (lookId: string): void => {
    void window.wf.looksDelete(lookId).then(refresh)
  }

  const safetyReset = (): void => {
    void window.wf.zoneSafetyReset()
  }

  return (
    <div className="space-y-2 p-2">
      <button
        onClick={safetyReset}
        title="Force all 4 zones to the logo — screens only, doesn't touch audio"
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-2 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"
      >
        <ShieldAlert size={13} /> Safety Reset
      </button>

      {looks.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Looks</div>
          {looks.map((look) => (
            <div key={look.id} className="group flex items-center gap-1">
              <button
                onClick={() => applyLook(look.id)}
                className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50"
              >
                {look.name}
              </button>
              <button
                onClick={() => deleteLook(look.id)}
                title={`Delete "${look.name}"`}
                aria-label={`Delete "${look.name}"`}
                className="hidden shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 group-hover:block"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default LooksPanel
```

- [ ] **Step 2: Mount it in ServiceRail.tsx**

Find:

```tsx
import LiveZoneStatus from './zones/LiveZoneStatus'
```

Replace with:

```tsx
import LiveZoneStatus from './zones/LiveZoneStatus'
import LooksPanel from './zones/LooksPanel'
```

Find:

```tsx
      <div className="border-t border-slate-200">
        <LiveZoneStatus />
      </div>
    </aside>
  )
}
```

Replace with:

```tsx
      <div className="border-t border-slate-200">
        <LiveZoneStatus />
      </div>
      <div className="border-t border-slate-200">
        <LooksPanel />
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Run the full gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 383 tests (no new tests — new UI component, matches the rest of this feature's untested-UI posture).

- [ ] **Step 4: Commit and push**

```bash
git add src/renderer/src/zones/LooksPanel.tsx src/renderer/src/ServiceRail.tsx
git commit -m "feat: recall Looks and trigger safety reset from the Live tab"
git push
```

---

## Task 6: Manual verification

No more code changes. This task is entirely **[manual]** — this sandbox cannot launch Electron. Ask the user to run through this before trusting the feature.

- [ ] **Step 1: Save a Look**

On Setup → Screens/Zones, pin a couple of zones to different states (e.g. zone 1 to Logo, zone 3 to hold the live sermon), leave the others following the service. Click "+ Save current pins as a Look," name it, confirm it saves without error.

- [ ] **Step 2: Recall it**

Go to Live. Confirm the saved Look appears as a button in the new panel below the zone status. Manually re-pin the zones to something different (or unpin them), then click the saved Look — confirm all 4 zones snap back to exactly what was saved, including the zones that were originally left unpinned (they should go back to "following the service," not stay however you'd just changed them).

- [ ] **Step 3: Delete a Look**

Hover the saved Look, click the delete (X), confirm it disappears from the list and from Setup's pin state is unaffected by the deletion itself (deleting a Look doesn't unpin anything currently applied).

- [ ] **Step 4: Safety Reset**

With something live and zones showing real content, click Safety Reset. Confirm all 4 zones — including Stage Monitors — immediately show the church logo, and that Sound Check / Room Feed (if either is active) are completely unaffected.

- [ ] **Step 5: Confirm existing zone pinning still works unchanged**

Pin/unpin a single zone via the existing Setup picker, confirm it behaves exactly as it did before this feature — Looks/Safety Reset are additive, not a replacement for that flow.

---

## Self-review notes

**Spec coverage.** Architecture (Look = snapshot of zonePins, stored like zone_scenes) → Task 1. IPC/apply semantics (all 4 zones always set, explicit unpin for absent zones) → Task 2. Safety Reset (screens-only, hardcoded, logo on all 4) → Task 2. Creation via "save current pins" → Task 4. Recall from the Live tab → Task 5. Error handling (stale pin degrades gracefully) → covered by Task 2's code comment, which correctly attributes this to `computeZoneStates()`'s existing missing-item fallback rather than new logic — a refinement made while writing this plan, not a spec gap (the spec's intent, "doesn't fail the whole recall," is fully satisfied either way). Testing → Task 1's pure-module tests, matching the spec's stated scope (IPC/UI exercised manually).

**A design nuance resolved during planning, not left ambiguous:** the spec's `Look.pins` was described in prose as needing an "explicit null" for unpinned zones; this plan uses the existing `ZonePins` partial-record type instead (reusing `validateZonePins` directly) and moves the "always fully reproduce the snapshot" guarantee into the *apply loop's* logic (`look.pins[zoneId] ?? null` → explicit delete) rather than the data shape. Same guarantee, less duplicated validation logic, and Task 1's own tests (`accepts a Look with no pins at all`) confirm the empty-object case works correctly.

**Placeholder scan.** No TBD/TODO. Every step shows complete code.

**Type consistency.** `Look` (`{id, name, pins: ZonePins}`, Task 1) is used identically in Task 2 (`main/index.ts`), Task 3 (preload + mock), and Task 5 (`LooksPanel.tsx`) — same field names, same import path pattern (`../shared/zoneLooks` / `../../shared/zoneLooks` matching each file's existing relative-import depth for `zonePins`/`zoneScenes`).
