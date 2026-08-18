# Control Room Layout Redesign — Build Service (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Build Service screen to the layout approved in `docs/superpowers/specs/2026-08-17-control-room-layout-design.md` — services/templates rail on the left, the run of show as the dominant center column, a consolidated inspector on the right (scene + background + font + lyrics + presenter notes + a compact output-routing preview), and a persistent Scene Selector bar across the bottom. Also apply the top-level nav rename (Live → Live Control, Library → Media/Library, Setup → a gear icon) since it's small, shared, and unblocks testing the renamed screen.

**Architecture:** Every panel maps to an existing component (see the spec's "Component mapping" table) — this plan reuses and relays out `ServiceDeck`, `CardEditPanel`/`ItemEditor`, `ZoneScreenGrid`, `ScenePresetRow`, `TemplatesPanel`, `TopBar`/`NavMenu`. No new IPC, no new persisted data. Two small new pure-logic modules (a shared preflight-checks hook, a duration estimator) and one new prop (`compact`) threaded through the zone-preview components are the only new code; everything else is JSX relayout plus finishing the dark-theme conversion on three files this work touches anyway (`ServiceBuilder.tsx`, `TemplatesPanel.tsx`, `ScenePresetRow.tsx`, `ZoneScreenGrid.tsx` — all still partially or fully light-themed, discovered while reading these files for this plan).

**Tech Stack:** Electron + React + TypeScript + Tailwind CSS v3 + Vitest.

**Out of scope (Phase 2 — Live Control):** the CURRENT/NEXT/AFTER-NEXT triptych, the outputs strip, the Service Controls drawer (including the new `ServiceControlModeMapping` setting), Safety Reset relocation. None of that is touched here.

---

## File structure

- Modify: `src/renderer/src/TopBar.tsx` — nav rename + gear-icon Settings trigger
- Modify: `src/renderer/src/NavMenu.tsx` — add an icon-only trigger mode
- Create: `src/renderer/src/usePreflightChecks.ts` — preflight-check logic extracted from `HomeView.tsx`, shared
- Modify: `src/renderer/src/HomeView.tsx` — use the extracted hook instead of its own local copy
- Create: `src/shared/serviceDuration.ts` — best-effort total-duration estimator (pure function)
- Modify: `src/renderer/src/ScenePresetRow.tsx` — finish dark-theme conversion
- Modify: `src/renderer/src/zones/ZoneScreenGrid.tsx` — finish dark-theme conversion, add `compact` mode
- Modify: `src/renderer/src/zones/ZoneScreenCard.tsx` — add `compact` sizing
- Modify: `src/renderer/src/TemplatesPanel.tsx` — dark-theme conversion, de-modal (usable as an inline section)
- Modify: `src/renderer/src/ServiceBuilder.tsx` — dark-theme conversion, restructure left rail (services list + persistent Templates section)
- Modify: `src/renderer/src/ServiceEditor.tsx` — restructure body layout (center = run of show, right = consolidated inspector, bottom = Scene Selector bar), header status pill + Preflight Check button

---

### Task 1: Shared preflight-checks hook

**Files:**
- Create: `src/renderer/src/usePreflightChecks.ts`
- Modify: `src/renderer/src/HomeView.tsx`
- Test: `src/renderer/src/usePreflightChecks.test.ts`

`HomeView.tsx` currently computes its "things to check before you go live" list as a local `checks` array (lines ~44-73), reading `window.wf.getInfo()`, `window.wf.getRehearsalMode()`, `window.wf.obsGetStatus()`, and `useService()`'s `activeService`. Build Service's header needs the same computed list for its status pill. Extract it into a hook both screens call.

- [ ] **Step 1: Write the hook**

```ts
// src/renderer/src/usePreflightChecks.ts
import { useEffect, useState } from 'react'
import type { AppInfo, ObsStatus, ZoneId } from '../../shared/types'
import { ZONE_IDS, ZONE_NAMES } from '../../shared/types'
import { useService } from './ServiceContext'

// A row's status. 'ok' and 'warn' are opinions ("this probably needs
// attention before Sunday"); 'info' is neutral — not every church streams
// every service, so no OBS connection isn't itself a problem.
export type PreflightLevel = 'ok' | 'warn' | 'info'

export interface PreflightCheck {
  level: PreflightLevel
  label: string
}

export interface PreflightResult {
  checks: PreflightCheck[]
  needsAttention: boolean
}

// Shared by HomeView (the full checklist) and ServiceEditor (a compact status
// pill) so the two can never disagree about what "ready" means.
export function usePreflightChecks(): PreflightResult {
  const { activeService } = useService()
  const [outputs, setOutputs] = useState(0)
  const [zonesConnected, setZonesConnected] = useState<ZoneId[]>([])
  const [rehearsal, setRehearsal] = useState(false)
  const [obs, setObs] = useState<ObsStatus | null>(null)

  useEffect(() => {
    const load = (): void => {
      window.wf.getInfo().then((i: AppInfo) => { setOutputs(i.outputs); setZonesConnected(i.zonesConnected) })
      window.wf.getRehearsalMode().then(setRehearsal)
    }
    load()
    const t = setInterval(load, 2000)
    window.wf.obsGetStatus().then(setObs)
    const off = window.wf.obsOnStatus(setObs)
    return () => { clearInterval(t); off() }
  }, [])

  const screenCount = outputs + zonesConnected.length
  const missingZoneNames = ZONE_IDS.filter((id) => !zonesConnected.includes(id)).map((id) => ZONE_NAMES[id])

  const checks: PreflightCheck[] = [
    rehearsal
      ? { level: 'warn', label: 'Rehearsal mode is armed — real outputs are showing nothing' }
      : { level: 'ok', label: 'Rehearsal mode off' },
    screenCount === 0
      ? { level: 'warn', label: 'No screens connected yet' }
      : missingZoneNames.length > 0
      ? { level: 'warn', label: `${screenCount} screen${screenCount !== 1 ? 's' : ''} connected — ${missingZoneNames.join(', ')} not connected` }
      : { level: 'ok', label: `${screenCount} screen${screenCount !== 1 ? 's' : ''} connected` },
    activeService
      ? { level: 'ok', label: `"${activeService.name}" loaded` }
      : { level: 'warn', label: 'No service loaded yet' },
    { level: obs?.connected ? 'ok' : 'info', label: obs?.connected ? 'OBS connected' : 'OBS not connected' }
  ]

  return { checks, needsAttention: checks.some((c) => c.level === 'warn') }
}
```

- [ ] **Step 2: Update `HomeView.tsx` to use the hook**

Remove the local `PreflightLevel` type and the `checks`/`needsAttention` computation (currently lines ~31, ~44-73 per the file read during planning — exact line numbers will have shifted slightly by the time this task runs, match by content instead). Replace with:

```ts
import { usePreflightChecks } from './usePreflightChecks'
// ...
const { checks, needsAttention } = usePreflightChecks()
```

Remove the now-unused `useEffect` that fetched `outputs`/`zonesConnected`/`rehearsal`/`obs` directly, the `screenCount`/`missingZoneNames` locals, and the `AppInfo`/`ObsStatus`/`ZoneId`/`ZONE_IDS`/`ZONE_NAMES` imports that only existed to support that computation (check the rest of the file for other uses of those imports before removing — `ZONE_IDS.filter` for the checks array is the only current use, so scan for anything downstream of the current `checks` computation that also used `outputs`/`zonesConnected` directly and would break if those locals are removed. If nothing else references them, delete cleanly).

- [ ] **Step 3: Test the hook's pure logic**

The hook mixes IPC calls with pure decision logic. Since `checks` computation is a pure function of `(rehearsal, screenCount, missingZoneNames, activeService, obs)`, extract just that decision logic into a plain exported function so it's testable without mocking `window.wf`:

Add to `usePreflightChecks.ts`, above the hook:

```ts
export function computePreflightChecks(input: {
  rehearsal: boolean
  screenCount: number
  missingZoneNames: string[]
  activeServiceName: string | null
  obsConnected: boolean
}): PreflightCheck[] {
  const { rehearsal, screenCount, missingZoneNames, activeServiceName, obsConnected } = input
  return [
    rehearsal
      ? { level: 'warn', label: 'Rehearsal mode is armed — real outputs are showing nothing' }
      : { level: 'ok', label: 'Rehearsal mode off' },
    screenCount === 0
      ? { level: 'warn', label: 'No screens connected yet' }
      : missingZoneNames.length > 0
      ? { level: 'warn', label: `${screenCount} screen${screenCount !== 1 ? 's' : ''} connected — ${missingZoneNames.join(', ')} not connected` }
      : { level: 'ok', label: `${screenCount} screen${screenCount !== 1 ? 's' : ''} connected` },
    activeServiceName
      ? { level: 'ok', label: `"${activeServiceName}" loaded` }
      : { level: 'warn', label: 'No service loaded yet' },
    { level: obsConnected ? 'ok' : 'info', label: obsConnected ? 'OBS connected' : 'OBS not connected' }
  ]
}
```

And have the hook call it:

```ts
const checks = computePreflightChecks({
  rehearsal,
  screenCount,
  missingZoneNames,
  activeServiceName: activeService?.name ?? null,
  obsConnected: obs?.connected ?? false
})
```

Write `src/renderer/src/usePreflightChecks.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computePreflightChecks } from './usePreflightChecks'

describe('computePreflightChecks', () => {
  it('flags rehearsal mode as a warning', () => {
    const checks = computePreflightChecks({
      rehearsal: true, screenCount: 2, missingZoneNames: [], activeServiceName: 'Sunday', obsConnected: true
    })
    expect(checks[0]).toEqual({ level: 'warn', label: 'Rehearsal mode is armed — real outputs are showing nothing' })
  })

  it('reports zero screens as a warning', () => {
    const checks = computePreflightChecks({
      rehearsal: false, screenCount: 0, missingZoneNames: [], activeServiceName: null, obsConnected: false
    })
    expect(checks[1]).toEqual({ level: 'warn', label: 'No screens connected yet' })
  })

  it('reports partial connectivity by name', () => {
    const checks = computePreflightChecks({
      rehearsal: false, screenCount: 3, missingZoneNames: ['Stage Monitors'], activeServiceName: 'Sunday', obsConnected: false
    })
    expect(checks[1]).toEqual({ level: 'warn', label: '3 screens connected — Stage Monitors not connected' })
  })

  it('reports full connectivity as ok, singular screen count', () => {
    const checks = computePreflightChecks({
      rehearsal: false, screenCount: 1, missingZoneNames: [], activeServiceName: 'Sunday', obsConnected: false
    })
    expect(checks[1]).toEqual({ level: 'ok', label: '1 screen connected' })
  })

  it('reports no active service as a warning', () => {
    const checks = computePreflightChecks({
      rehearsal: false, screenCount: 1, missingZoneNames: [], activeServiceName: null, obsConnected: false
    })
    expect(checks[2]).toEqual({ level: 'warn', label: 'No service loaded yet' })
  })

  it('treats OBS disconnected as informational, not a warning', () => {
    const checks = computePreflightChecks({
      rehearsal: false, screenCount: 1, missingZoneNames: [], activeServiceName: 'Sunday', obsConnected: false
    })
    expect(checks[3]).toEqual({ level: 'info', label: 'OBS not connected' })
  })

  it('needsAttention is true when any check is a warning', () => {
    const checks = computePreflightChecks({
      rehearsal: false, screenCount: 0, missingZoneNames: [], activeServiceName: 'Sunday', obsConnected: true
    })
    expect(checks.some((c) => c.level === 'warn')).toBe(true)
  })

  it('needsAttention is false when every check is ok or info', () => {
    const checks = computePreflightChecks({
      rehearsal: false, screenCount: 4, missingZoneNames: [], activeServiceName: 'Sunday', obsConnected: true
    })
    expect(checks.some((c) => c.level === 'warn')).toBe(false)
  })
})
```

Run: `npm run test:web -- usePreflightChecks` (or `npm test` for the full suite). Expected: all pass.

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck` (NOT `npx tsc --noEmit -p .` — that command is a documented no-op in this repo).
Run: `npm test` — expect the new tests passing, 0 regressions in the existing suite (baseline 410 passing as of the visual redesign work).

```bash
git add src/renderer/src/usePreflightChecks.ts src/renderer/src/usePreflightChecks.test.ts src/renderer/src/HomeView.tsx
git commit -m "refactor: extract preflight-checks logic into a shared hook"
```

---

### Task 2: Duration estimator

**Files:**
- Create: `src/shared/serviceDuration.ts`
- Test: `src/shared/serviceDuration.test.ts`

- [ ] **Step 1: Write the pure estimator**

Per the approved spec: best-effort, sums only items with a known duration (currently `countdown`/`welcome`'s `payload.seconds`), skips everything else rather than blocking or under-reporting with a false zero.

```ts
// src/shared/serviceDuration.ts
import type { ServiceItem } from './types'

// Best-effort total: only item types that store an explicit duration
// contribute. Most items (songs, scripture, text, etc.) have no known
// duration, so they're silently excluded rather than treated as zero —
// the total is a helpful estimate, never a false-precision promise.
export function estimateItemDurationSeconds(item: ServiceItem): number | null {
  if (item.type === 'countdown' || item.type === 'welcome') {
    const secs = item.payload?.seconds
    return typeof secs === 'number' && secs > 0 ? secs : null
  }
  return null
}

export interface DurationEstimate {
  totalSeconds: number
  knownItemCount: number
  totalItemCount: number
}

export function estimateServiceDuration(items: ServiceItem[]): DurationEstimate {
  let totalSeconds = 0
  let knownItemCount = 0
  for (const item of items) {
    const secs = estimateItemDurationSeconds(item)
    if (secs != null) { totalSeconds += secs; knownItemCount++ }
  }
  return { totalSeconds, knownItemCount, totalItemCount: items.length }
}

// "~52 min" not "52:00" — the estimate is never precise enough to justify a
// clock-face format, and a false-precise format invites operators to trust it
// more than the underlying data supports.
export function formatDurationEstimate(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60)
  if (minutes < 1) return '< 1 min'
  return `~${minutes} min`
}
```

- [ ] **Step 2: Test it**

```ts
// src/shared/serviceDuration.test.ts
import { describe, it, expect } from 'vitest'
import { estimateItemDurationSeconds, estimateServiceDuration, formatDurationEstimate } from './serviceDuration'
import type { ServiceItem } from './types'

function item(overrides: Partial<ServiceItem>): ServiceItem {
  return {
    id: 1, ordinal: 0, type: 'song', ref_id: null, payload: {}, title: 'x',
    notes: null, style: null, zoneRouting: null, track: 'main', ...overrides
  }
}

describe('estimateItemDurationSeconds', () => {
  it('reads seconds from a countdown item', () => {
    expect(estimateItemDurationSeconds(item({ type: 'countdown', payload: { seconds: 300 } }))).toBe(300)
  })
  it('reads seconds from a welcome item', () => {
    expect(estimateItemDurationSeconds(item({ type: 'welcome', payload: { seconds: 180 } }))).toBe(180)
  })
  it('returns null for a song (no known duration)', () => {
    expect(estimateItemDurationSeconds(item({ type: 'song' }))).toBeNull()
  })
  it('returns null when seconds is missing', () => {
    expect(estimateItemDurationSeconds(item({ type: 'countdown', payload: {} }))).toBeNull()
  })
  it('returns null when seconds is zero or negative', () => {
    expect(estimateItemDurationSeconds(item({ type: 'countdown', payload: { seconds: 0 } }))).toBeNull()
    expect(estimateItemDurationSeconds(item({ type: 'countdown', payload: { seconds: -5 } }))).toBeNull()
  })
})

describe('estimateServiceDuration', () => {
  it('sums only items with a known duration', () => {
    const items = [
      item({ id: 1, type: 'countdown', payload: { seconds: 300 } }),
      item({ id: 2, type: 'song' }),
      item({ id: 3, type: 'welcome', payload: { seconds: 120 } }),
    ]
    expect(estimateServiceDuration(items)).toEqual({ totalSeconds: 420, knownItemCount: 2, totalItemCount: 3 })
  })
  it('returns zero total for an empty service', () => {
    expect(estimateServiceDuration([])).toEqual({ totalSeconds: 0, knownItemCount: 0, totalItemCount: 0 })
  })
})

describe('formatDurationEstimate', () => {
  it('rounds to the nearest minute with a tilde', () => {
    expect(formatDurationEstimate(3130)).toBe('~52 min')
  })
  it('shows a floor label under one minute', () => {
    expect(formatDurationEstimate(30)).toBe('< 1 min')
  })
})
```

Run: `npm run test:node -- serviceDuration` (this is a `src/shared` pure module, runs under the node test project — check `vitest.config` / existing `src/shared/*.test.ts` files for the exact invocation pattern already used elsewhere in this repo, e.g. `zoneScenes.test.ts` if it exists, and match it).

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck`
Run: `npm test` — expect the new tests passing, 0 regressions.

```bash
git add src/shared/serviceDuration.ts src/shared/serviceDuration.test.ts
git commit -m "feat: add best-effort service duration estimator"
```

---

### Task 3: Top-level nav — Live Control, Media/Library, gear-icon Settings

**Files:**
- Modify: `src/renderer/src/NavMenu.tsx`
- Modify: `src/renderer/src/TopBar.tsx`

- [ ] **Step 1: Add an icon-only trigger mode to `NavMenu`**

Today `NavMenu<T>` always renders its trigger as a text button (`{label} <ChevronDown/>`). Add an optional `iconOnly` prop: when set, the trigger renders just an icon (no visible label text, but keeps it in `aria-label` for accessibility) and drops the chevron to look like a plain icon button, matching `IconButton.tsx`'s existing visual treatment elsewhere in the app.

Change the props signature (around line 19-24):

```tsx
function NavMenu<T extends string>({ label, items, activeId, onSelect, iconOnly, Icon }: {
  label: string
  items: NavMenuItem<T>[]
  activeId: T | null
  onSelect: (id: T) => void
  // When set, the trigger renders as an icon-only button (Icon required in
  // this mode) instead of a text+chevron button — used for the gear-icon
  // Settings entry point, which shouldn't take up nav-bar text space.
  iconOnly?: boolean
  Icon?: IconType
}): JSX.Element {
```

Change the trigger button's JSX (around line 80-94) to branch on `iconOnly`:

```tsx
      <button
        ref={triggerRef}
        onClick={() => dispatch({ type: 'toggle' })}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="menu"
        aria-expanded={state.open}
        aria-label={label}
        className={
          iconOnly
            ? `flex flex-shrink-0 items-center justify-center rounded-lg p-2 transition-colors ${
                containsActive
                  ? 'bg-blue-600 text-white'
                  : 'border border-border bg-panel text-content-secondary hover:bg-panel-raised hover:text-content-primary'
              }`
            : `flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                containsActive
                  ? 'bg-blue-600 font-medium text-white'
                  : 'font-normal text-content-secondary hover:bg-panel-raised hover:text-content-primary'
              }`
        }
      >
        {iconOnly && Icon ? <Icon size={16} className="flex-shrink-0" /> : (
          <>
            {label}
            <ChevronDown size={14} className="flex-shrink-0" />
          </>
        )}
      </button>
```

The dropdown menu panel itself (the `state.open && (...)` block) doesn't need to change — it already renders item icons + labels regardless of trigger style.

- [ ] **Step 2: Rename Live → Live Control, Library → Media/Library in `TopBar.tsx`**

`PRIMARY_ITEMS` (line 30-34): change `{ id: 'live', Icon: Play, label: 'Live' }` to `{ id: 'live', Icon: Play, label: 'Live Control' }` (the `id` stays `'live'` — that's the `View` union value used throughout `AppShell.tsx`'s routing, unchanged; only the display label changes).

The `NavMenu label="Library" ...` call (line 152): change `label="Library"` to `label="Media/Library"`.

- [ ] **Step 3: Replace the Setup text-menu with a gear icon**

Add `Settings` to the lucide-react import list (line 3) alongside the existing icons.

Change the `NavMenu label="Setup" ...` call (line 153) from:

```tsx
<NavMenu label="Setup" items={SETUP_ITEMS} activeId={view} onSelect={setView} />
```

to:

```tsx
<NavMenu label="Settings" items={SETUP_ITEMS} activeId={view} onSelect={setView} iconOnly Icon={Settings} />
```

`SETUP_ITEMS` itself is unchanged — same 6 pages, same view IDs. Only the trigger's presentation changes.

- [ ] **Step 4: Typecheck, test, and manual sanity check**

Run: `npm run typecheck`
Run: `npm test` — expect 0 regressions (no test currently asserts on the literal string "Live" or "Setup" in the nav — confirm this by grepping `src/renderer/src/**/*.test.tsx` for `'Live'` / `'Setup'` / `TopBar` before assuming it's safe; fix any test that does assert the old label).

```bash
git add src/renderer/src/NavMenu.tsx src/renderer/src/TopBar.tsx
git commit -m "feat(nav): rename Live Control/Media-Library, gear-icon Settings trigger"
```

---

### Task 4: Dark-theme `ScenePresetRow.tsx`, finish dark-theming `ZoneScreenGrid.tsx`

Both were found still partially light-themed while reading them for this plan (`ScenePresetRow.tsx` is fully light; `ZoneScreenGrid.tsx` has a handful of light-theme leftovers in its Safe-area/Build-slides/Advanced controls). Apply the same conversion table used throughout the rest of the app's dark redesign — `bg-white`/`bg-slate-100` → `bg-panel`/`bg-panel-raised`, `border-slate-*` → `border-border`/`border-border-strong`, `text-slate-900` → `text-content-primary`, `text-slate-500/600` → `text-content-secondary`, `text-slate-400` → `text-content-tertiary`, bare `-700`/`-800` text on a translucent tint → `-400`.

**Files:**
- Modify: `src/renderer/src/ScenePresetRow.tsx`
- Modify: `src/renderer/src/zones/ZoneScreenGrid.tsx`

- [ ] **Step 1: `ScenePresetRow.tsx`**

Line 28 (active chip): `border-blue-500 bg-blue-500/10 text-blue-800` → `border-blue-500 bg-blue-500/10 text-blue-400`. Inactive chip: `border-slate-200 bg-white text-slate-600 hover:border-slate-300` → `border-border bg-panel text-content-secondary hover:border-border-strong`. Line 37 (custom chip): `border-slate-300 bg-slate-100 text-slate-600` → `border-border-strong bg-panel-raised text-content-secondary`.

- [ ] **Step 2: `ZoneScreenGrid.tsx`**

Line 153: `showSafeArea ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'` → `showSafeArea ? 'text-blue-400' : 'text-content-tertiary hover:text-content-secondary'`.
Line 162: `text-blue-600 hover:text-blue-700 disabled:text-slate-400` → `text-blue-400 hover:text-blue-300 disabled:text-content-tertiary`.
Line 206: `text-slate-400 hover:text-slate-600` (Advanced toggle) → `text-content-tertiary hover:text-content-secondary`.
Line 211: `border-slate-200 bg-slate-100/70` (Advanced panel) → `border-border bg-panel-raised`.
Line 216: `text-slate-400 hover:text-slate-600` (Reset-to-default link) → `text-content-tertiary hover:text-content-secondary`.

- [ ] **Step 3: Typecheck, test, commit**

Run: `npm run typecheck`
Run: `npm test` — expect 0 regressions.
Grep both files for leftover `slate-`/`bg-white` and confirm zero remain.

```bash
git add src/renderer/src/ScenePresetRow.tsx src/renderer/src/zones/ZoneScreenGrid.tsx
git commit -m "feat(theme): dark-palette ScenePresetRow, finish ZoneScreenGrid"
```

---

### Task 5: `ZoneScreenGrid` compact mode

The right-hand inspector (Task 8) needs a small, non-dominant rendering of the 4-zone preview instead of today's large center-column treatment — same interactivity (click-to-cycle role, drag-drop), smaller footprint.

**Files:**
- Modify: `src/renderer/src/zones/ZoneScreenCard.tsx`
- Modify: `src/renderer/src/zones/ZoneScreenGrid.tsx`
- Test: `src/renderer/src/zones/ZoneScreenGrid.test.tsx` (only if a test file for this component already exists — check first; if none exists, this is a visual-only change, skip adding a new test file rather than inventing test infrastructure for an untested component)

- [ ] **Step 1: Add a `compact` prop to `ZoneScreenCard`**

Add `compact?: boolean` to its props (in the destructured prop list, alongside `showSafeArea`). Find the card's root container and its preview-text sizing (read the rest of the file beyond what was captured during planning — lines 40-120 — before writing this step's exact classNames; the pattern to apply is: compact reduces the card's padding and preview text size by roughly one step each, e.g. if the normal card uses `p-3`/`text-sm` for its label and a larger preview font, compact uses `p-2`/`text-xs` and a smaller preview font, while keeping the same aspect-ratio box and the same click/drag handlers untouched). Do not change any non-visual behavior — this is a sizing-only variant.

- [ ] **Step 2: Add a `compact` prop to `ZoneScreenGrid`, and stop it rendering its own `ScenePresetRow` in that mode**

Add `compact?: boolean` to `ZoneScreenGrid`'s props. When `compact` is true:
- **Skip rendering its own `<ScenePresetRow .../>`** (lines 139-146, the first element in the non-deck branch). `ZoneScreenGrid` currently owns scene-picking entirely internally; Task 8 adds a second, persistent `ScenePresetRow` in the new bottom Scene Selector bar, driven by the same `effectiveRouting`/`matchScene`/`pickScene` data. Rendering both would show two identical chip-rows on screen at once — one in the compact right-column preview, one across the bottom — which is redundant and doesn't match the approved mockup (there, the right panel's "Scene" line is a single compact summary, and the bottom bar is the one interactive picker). In compact mode, `ZoneScreenGrid` becomes purely the 4-zone preview + Advanced escape hatch; the bottom bar (Task 8) is the only scene-picking UI. Non-compact mode (unused after this plan ships, since every current call site becomes `compact` — see Task 8 — but kept working rather than deleted, since it's a small conditional and removing the non-compact path entirely isn't in scope here) keeps rendering `ScenePresetRow` as it does today.
- The 2×2 `grid grid-cols-2 gap-3` container (line 174) becomes `grid grid-cols-2 gap-1.5` (tighter gap, same 2-column layout — a narrower right-column width fits 2 narrow columns better than forcing 1 column and losing the "these are the 4 physical screens" spatial mental model).
- Pass `compact` through to each `ZoneScreenCard` (line 178-192).
- The root container's `max-w-3xl` (line 119) becomes conditional: `compact ? 'max-w-full' : 'max-w-3xl'` (the compact host is already width-constrained by its parent column, so an inner max-width fights it).
- `ZoneSlideFilmstrip` (line 201) and the `Advanced` toggle section (lines 203-223) still render in compact mode, unchanged — an operator using the compact inspector still needs the same escape hatches, just in a narrower space; Tailwind's flex-wrap in those child components already handles narrower widths without further changes (confirm this by inspection, not assumption — if either genuinely breaks at narrow widths during the manual verification pass in Task 9, fix it then with a targeted class change, not preemptively here).
- The deck-mode branch (`ZoneDeckComposer`, lines 120-136) is unchanged in compact mode — deck editing is already a deliberate, focused task the operator does at full width by design; compact mode is for the routine "which zones show this song" case, not deck-building. If an operator selects an item with a deck while the compact inspector is showing, `ZoneDeckComposer` renders at its own existing size regardless of `compact` — acceptable since building a deck is inherently a wider-content task and this doesn't regress anything that works today.

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck`
Run: `npm test` — expect 0 regressions.

```bash
git add src/renderer/src/zones/ZoneScreenCard.tsx src/renderer/src/zones/ZoneScreenGrid.tsx
git commit -m "feat: add compact mode to ZoneScreenGrid for the consolidated inspector"
```

---

### Task 6: `TemplatesPanel` — dark-theme + de-modal

**Files:**
- Modify: `src/renderer/src/TemplatesPanel.tsx`

- [ ] **Step 1: Dark-theme the file**

Apply the standard conversion table throughout: `border-slate-200`→`border-border`, `bg-[#f4f6f9]`/`bg-white`/`bg-slate-100`→`bg-panel`/`bg-panel-raised` per nesting depth (the panel's own wrapper is currently `bg-[#f4f6f9]` — since this becomes a persistent section nested inside `ServiceBuilder`'s left rail card in Task 7, treat it as one level deeper than a top-level page card: `bg-panel-raised`), `text-slate-900`→`text-content-primary`, `text-slate-500/600/700`→`text-content-secondary`, error box `text-red-600`→`text-red-400`. The "Save Current Service as Template" box (`border-blue-500/30 bg-blue-500/10`) is already on-palette — leave it, just lighten anything inside it that's still dark-on-light. The 2 inputs (name, description) currently `border-slate-200 bg-slate-100 text-slate-900` → `border-border bg-panel text-content-primary` (one level lighter than the section's own `bg-panel-raised`, avoiding a same-shade collision — this exact collision class was the most common bug found during the earlier Setup-stage dark redesign, so trace this nesting carefully rather than pattern-matching the table blindly). Template list rows `border-slate-200 bg-slate-100 hover:bg-slate-200` → `border-border bg-panel hover:bg-panel-raised` (same one-level-lighter-than-section reasoning). Delete button `bg-red-600/20 text-red-600 hover:bg-red-600/30` → `bg-red-600/20 text-red-400 hover:bg-red-600/30`.

- [ ] **Step 2: Make it usable as an inline section, not only a modal**

`TemplatesPanel` currently always renders wrapped in `<Modal>` (line 103). `ServiceBuilder` (Task 7) needs it as a persistent, always-visible section instead. Add an `inline?: boolean` prop: when true, skip the `<Modal>` wrapper and the header's close button (no `onClose` call needed inline — there's nothing to close), rendering just the save-form + templates-list content directly. `onClose` becomes optional (`onClose?: () => void`), only called/rendered when `!inline`.

```tsx
export function TemplatesPanel({
  currentService,
  onLoadTemplate,
  onClose,
  inline
}: {
  currentService: ServiceFull | null
  onLoadTemplate: (items: any[], theme: string | null, themeColors: any | null) => Promise<void>
  onClose?: () => void
  inline?: boolean
}): JSX.Element {
```

Wrap the existing body content (everything currently inside `<Modal>...</Modal>`) in a conditional:

```tsx
  const body = (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h2 id="templates-panel-title" className="text-xl font-bold text-content-primary">Service Templates</h2>
        {!inline && onClose && (
          <button onClick={onClose} className="inline-flex items-center justify-center text-content-secondary hover:text-content-primary" aria-label="Close">
            <X size={18} />
          </button>
        )}
      </div>
      {/* ...unchanged: error box, save-form, templates list... */}
    </>
  )

  if (inline) return <div>{body}</div>

  return (
    <Modal onClose={onClose!} labelledBy="templates-panel-title" className="w-full max-w-2xl rounded-xl border border-border bg-panel-raised p-6 shadow-2xl max-h-[80vh] overflow-y-auto">
      {body}
    </Modal>
  )
```

(`onClose!` is safe there: the non-inline branch is only reached when a caller passes `onClose`, matching every current call site, which all pass one — but if TypeScript's control-flow analysis can't narrow `onClose` from optional to required across the `inline` branch, use an explicit runtime check instead of the non-null assertion: `if (!onClose) throw new Error('onClose is required when inline is false')` before the modal return, so a future caller that forgets it fails loudly during development rather than silently doing nothing on click.)

- [ ] **Step 3: Typecheck, test, commit**

Run: `npm run typecheck`
Run: `npm test` — expect 0 regressions (existing modal usage, if any test covers it, must still pass unchanged since `inline` defaults to falsy).

```bash
git add src/renderer/src/TemplatesPanel.tsx
git commit -m "feat(theme): dark-palette TemplatesPanel, add inline (non-modal) mode"
```

---

### Task 7: `ServiceBuilder.tsx` — dark-theme + restructure left rail

**Files:**
- Modify: `src/renderer/src/ServiceBuilder.tsx`

- [ ] **Step 1: Dark-theme the file**

Apply the standard conversion table. Root wrapper (line 156): `bg-[#e9ecf1]` → remove (page bg comes from the parent `bg-app`), keep `flex h-full min-h-0 gap-4 p-4`. Services-list card (line 159): `border-slate-200 bg-[#f4f6f9]` → `border-border bg-panel`. Delete-confirm modal (lines 138-139): `text-slate-600`/`text-slate-900` → `text-content-secondary`/`text-content-primary`. Import status text (line 201): `text-slate-600` → `text-content-secondary`. Empty-state text (line 204): `text-slate-500` → `text-content-secondary`. Service row (lines 212-216): selected `bg-blue-500/10 ring-1 ring-blue-500/30 text-slate-900` → `bg-blue-500/10 ring-1 ring-blue-500/30 text-content-primary`; unselected `text-slate-700 hover:bg-slate-100` → `text-content-secondary hover:bg-panel-raised`. Open-service card (line 229): `border-slate-200 bg-[#f4f6f9]` → `border-border bg-panel`. Empty-open-service text (line 231): `text-slate-500` → `text-content-secondary`.

- [ ] **Step 2: Promote Templates from a modal to a persistent left-rail section**

Remove the `showTemplates` state (line 14) and the `{showTemplates && <TemplatesPanel .../>}` block (lines 259-265) — Templates is no longer conditionally shown.

Change the "Service Templates" button (lines 195-200) — it currently opens the modal via `setShowTemplates(true)`. Since Templates is now always visible below it, this button no longer makes sense as an "open" action. Remove the button entirely; its purpose (discoverability + the save-as-template action) is now served by the always-visible section itself.

Add the `TemplatesPanel` as a persistent section within the same services-list card, below the existing services list (after the `</div>` that closes the `min-h-0 flex-1 space-y-1 overflow-auto` services list, still inside the outer `w-72` card):

```tsx
          <div className="mt-3 border-t border-border pt-3">
            <TemplatesPanel
              currentService={service}
              onLoadTemplate={loadTemplateIntoService}
              inline
            />
          </div>
```

Since the services list above it is already in a `min-h-0 flex-1 overflow-auto` container, the card's height budget goes: fixed-height controls (new-service input, import buttons) + flexible-but-scrollable services list + a now-also-potentially-long templates list. If both lists can grow, the outer card needs its own scroll behavior reconsidered — the simplest correct fix is to make the whole left-rail card (`w-72 flex flex-col ... p-3`) itself `overflow-y-auto` at the outer level instead of only the inner services-list div, so a long templates list scrolls the whole rail together with the services list rather than fighting it for a fixed inner height. Change the outer card's className (line 159) to add `overflow-y-auto` and remove `min-h-0 flex-1 overflow-auto` from the inner services-list div (line 203) since the outer container now owns scrolling.

- [ ] **Step 3: Typecheck, test, commit**

Run: `npm run typecheck`
Run: `npm test` — expect 0 regressions.
Grep the file for leftover `slate-`/`bg-white`/`showTemplates` and confirm zero remain (the last one confirms the dead state var and its button were fully removed, not just its call site).

```bash
git add src/renderer/src/ServiceBuilder.tsx
git commit -m "feat(theme): dark-palette ServiceBuilder, promote Templates to persistent section"
```

---

### Task 8: `ServiceEditor.tsx` — restructure body layout, header status pill

The biggest task in this plan. Restructures the 3-column body (today: run-of-show left / big zone-preview center / item-inspector right) into the approved layout (services rail stays outside this component per Task 7; within `ServiceEditor` itself: run-of-show becomes the dominant center column, the zone-preview shrinks into the top of a consolidated right inspector alongside the existing item editor, and a persistent Scene Selector bar sits across the bottom).

**Files:**
- Modify: `src/renderer/src/ServiceEditor.tsx`

- [ ] **Step 1: Header — status pill + Preflight Check button**

Add the import: `import { usePreflightChecks } from './usePreflightChecks'`. Add the import: `import { estimateServiceDuration, formatDurationEstimate } from '../../shared/serviceDuration'`.

Inside the component, call the hook and compute the duration:

```ts
  const { needsAttention } = usePreflightChecks()
  const duration = service ? estimateServiceDuration(service.items) : null
```

In the header's `<div className="flex items-center justify-between gap-3">` block (around line 237), after the date input and before `{headerActions && ...}`, add the status pill and duration readout:

```tsx
          {duration && duration.knownItemCount > 0 && (
            <span className="shrink-0 text-xs text-content-secondary" title={`${duration.knownItemCount} of ${duration.totalItemCount} items have a known duration`}>
              {formatDurationEstimate(duration.totalSeconds)}
            </span>
          )}
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
            needsAttention ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'
          }`}>
            {needsAttention ? 'Needs attention' : 'Ready to plan'}
          </span>
```

(Emerald here is a legitimate use per this app's narrow-role rule for emerald — "Ready to plan" is a genuine ready/healthy status, not a plain selection indicator, matching how the rest of the app already reserves emerald for real status.)

The "Preflight Check" button itself (relocated from Home) — Home's version doesn't currently exist as a standalone button (its checklist is just always-visible inline on the Home screen, no click-to-open affordance). For Build Service's header, add a button that navigates back to Home where the full checklist lives, rather than duplicating the whole checklist UI in two places:

```tsx
          <button
            onClick={() => optionalSvc?.setSelectedItemId(null)}
            className="hidden"
          />
```

Wait — `ServiceEditor` has no `setView` prop today (it's rendered by `ServiceBuilder`, which itself has no `setView` either — that lives in `AppShell`). Adding a "Preflight Check" button that navigates to Home requires threading a `setView` callback down two levels (`AppShell` → `ServiceBuilder` → `ServiceEditor`) or lifting the check. Given the added plumbing this needs and that it's a small, non-blocking nicety (the status pill already answers "is something wrong," which is the operator's actual question in the moment), **descope the separate Preflight Check button from this task** — ship the status pill only. If Ryan wants a direct link after seeing it, that's a fast follow (thread `setView` through, or make the whole pill clickable and navigate to Home), not a blocker for this plan. Do not add a non-functional button as a placeholder.

- [ ] **Step 2: Restructure the body — center = run of show, right = consolidated inspector**

Replace the current `{/* Body */}` block (lines 263-323) — three columns (`w-80` deck / `flex-1` zone grid / `CardEditPanel`) — with two columns (center run-of-show at `flex-1`, right inspector at fixed width) plus a bottom bar:

```tsx
      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex min-h-0 flex-1 gap-3">
          {/* Center: run of show (moved from the left column) */}
          <div className="flex min-w-0 flex-1 flex-col min-h-0">
            <ScheduledAnnouncements
              serviceDate={service.service_date}
              addedRefIds={new Set(service.items.filter((it) => it.type === 'announcement' && it.ref_id != null).map((it) => it.ref_id as number))}
              onAdd={addAnnouncement}
            />
            <ServiceDeck
              service={service}
              track={track}
              onTrackChange={setTrack}
              trackAssignment={trackAssignment}
              onTrackAssignmentChange={setTrackAssignment}
              songs={songs}
              announcements={announcements}
              liveItemId={live?.main.liveServiceItemId ?? null}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAdd={addCard}
              onAddSong={addSong}
              onAddAnnouncement={addAnnouncement}
              onGoLive={(it) => sendItemLive(it, it.track)}
              onDelete={delItem}
              onDuplicate={duplicateItem}
              onBatchDelete={batchDeleteItems}
              onReordered={reload}
            />
          </div>

          {/* Right: consolidated inspector — compact zone preview + item editor */}
          {selectedItem && (
            <div className="flex w-80 shrink-0 flex-col gap-3 overflow-auto">
              <ZoneScreenGrid
                item={selectedItem}
                serviceId={service.id}
                serviceTheme={service.theme}
                serviceColors={service.themeColors}
                songFull={selectedSongFull}
                slides={itemSlides[selectedItem.id] ?? []}
                trackAssignment={trackAssignment}
                onChanged={reload}
                compact
              />
              <CardEditPanel
                item={selectedItem}
                serviceTheme={service.theme}
                serviceColors={service.themeColors}
                showPreview={false}
                onClose={() => setSelectedId(null)}
                onChanged={reload}
                onDelete={delItem}
              />
            </div>
          )}
          {!selectedItem && (
            <div className="flex w-80 shrink-0 items-center justify-center text-sm text-content-secondary">
              Select an item to preview &amp; style it
            </div>
          )}
        </div>
      </div>
```

Note what changed from today's layout: `ServiceDeck` moved from the `w-80` left column to the `flex-1` center column (dominant width, matching the approved mockup). `ZoneScreenGrid` moved from the `flex-1` center column to the top of the new `w-80` right column, with `compact` passed (Task 5). `CardEditPanel` stays in the right column, now stacked below `ZoneScreenGrid` instead of beside it. The "Select an item" placeholder moves from where the old center column was to the new right column, since that's now where "there's nothing to show you yet" applies.

`CardEditPanel`'s own root already renders as a `w-80 shrink-0` card (`ItemEditor.tsx` line 110: `className="card-lg flex w-80 shrink-0 flex-col..."`) — now that it's nested inside this task's own `w-80` wrapper div, that's a doubled width constraint. Remove `w-80 shrink-0` from `ItemEditor.tsx`'s root className (change it to just `flex flex-col gap-3 overflow-auto text-content-primary animate-[fade-in_0.15s_ease-out]`, dropping `card-lg` too since the outer wrapper here doesn't give it its own card chrome — check whether removing `card-lg` leaves the item editor's content looking unstyled/inconsistent with the rest of the inspector during the Task 9 visual check, and if so, move `card-lg`'s classes to the outer `w-80` wrapper div in this step's JSX instead of dropping them) so it sizes to its new parent instead of asserting its own width redundantly.

- [ ] **Step 3: Persistent bottom Scene Selector bar**

After the body's closing `</div>` (from Step 2) and before the `{/* Confirm delete item(s) modal */}` block, add the bottom bar. It needs the same `config`/`routing`/`matched`/`pickScene` data `ZoneScreenGrid` already computes internally — rather than duplicating that fetch-and-derive logic in `ServiceEditor` itself, lift it up: `ServiceEditor` fetches `SceneConfig` once (it doesn't today) and passes the derived values down to both `ZoneScreenGrid` (Step 2) and the new bottom bar, so they can never disagree and the scene config isn't fetched twice per render.

Add state and the fetch effect near the component's other `useEffect`s:

```ts
  const [sceneConfig, setSceneConfig] = useState<SceneConfig | null>(null)
  useEffect(() => { void window.wf.scenesGet().then(setSceneConfig) }, [])
```

Add the import: `import type { SceneConfig } from '../../shared/zoneScenes'` and `import { effectiveRouting, matchScene, expandScene } from '../../shared/zoneScenes'` and `import ScenePresetRow from './ScenePresetRow'`.

Add the bottom bar, rendered only when there's a selected item and the scene config has loaded (mirrors `ZoneScreenGrid`'s own existing `if (!config) return <></>` guard — don't render a scene selector for routing data that hasn't loaded yet):

```tsx
        {selectedItem && sceneConfig && (
          <div className="shrink-0 rounded-xl border border-border bg-panel p-3">
            <div className="section-header mb-2">Scene Selector</div>
            <ScenePresetRow
              config={sceneConfig}
              itemType={selectedItem.type}
              routing={effectiveRouting(selectedItem, sceneConfig)}
              matched={matchScene(effectiveRouting(selectedItem, sceneConfig), selectedItem.type, sceneConfig)}
              isDefault={selectedItem.zoneRouting == null}
              onPick={(sceneId) => {
                const scene = sceneConfig.scenes.find((s) => s.id === sceneId)
                if (!scene) return
                void window.wf.zoneSetRouting(selectedItem.id, expandScene(scene, selectedItem.type)).then(reload)
              }}
            />
          </div>
        )}
```

This duplicates `ZoneScreenGrid`'s own internal `pickScene` logic (lines 106-110 of that file) rather than sharing it, because `ZoneScreenGrid` doesn't currently expose its scene-picking as a callback prop — it owns that interaction entirely internally. Extracting a shared `pickScene`-as-prop is a reasonable future cleanup but is more invasive than this plan's scope justifies (it would mean `ZoneScreenGrid` no longer owns its own scene state, becoming a controlled component — a bigger refactor than "add a compact mode"). Two call sites computing the same well-tested pure function (`expandScene`) and calling the same existing IPC method (`zoneSetRouting`) is an acceptable, contained duplication, not a maintenance trap — if `expandScene`'s behavior ever needs to change, both call sites pick it up automatically since neither reimplements it, only calls it.

- [ ] **Step 4: Typecheck, test, commit**

Run: `npm run typecheck`
Run: `npm test` — expect 0 regressions. Pay particular attention to any existing test that renders `ServiceEditor` or `ServiceBuilder` and asserts on DOM structure/column layout (search `src/renderer/src` for `.test.tsx` files importing either) — update any that assumed the old 3-column structure.

```bash
git add src/renderer/src/ServiceEditor.tsx src/renderer/src/ItemEditor.tsx
git commit -m "feat: restructure Build Service layout — center run-of-show, consolidated right inspector, bottom Scene Selector bar"
```

---

### Task 9: Verification pass + visual check

**Files:** None modified — verification only.

- [ ] **Step 1: Full typecheck and test suite**

Run: `npm run typecheck`
Run: `npm test`
Expected: both clean, 0 failures.

- [ ] **Step 2: Build and serve**

Run: `npm run build`. Serve `out/renderer` locally (the pattern used throughout the visual redesign — a temporary `.claude/launch.json` pointing `npx --yes serve -l 4173 <out/renderer path>`).

- [ ] **Step 3: Manual walkthrough**

With a real (or the browser-mock) service loaded, confirm against the approved mockup:
- Top nav reads "Live Control" and "Media/Library"; Setup is now a gear icon that still opens the same 6 pages.
- Build Service: left rail shows services + a persistent Templates section (no modal); center shows the run of show at full width; selecting an item shows a compact 4-zone preview above the item editor in the right column; the bottom bar shows Scene Selector chips that match what the compact zone preview is currently routed to (click a chip, confirm both the compact preview AND the per-row scene tag in the center list update together — they read the same underlying `zoneRouting`, so this is really confirming no stale-cache bug, not a new feature).
- Header shows "Ready to plan" / "Needs attention" and, when any item has a known duration, a `~N min` readout.
- Deck-mode items (sermon/announcement blocks with a built slide deck) still open `ZoneDeckComposer` correctly from the compact-mode entry point (Task 5 Step 2 flagged this as needing a real check, not just an assumption).
- Nothing regresses in Live/Home/Library/Setup — this task only touched Build Service, the nav bar, and two shared files (`usePreflightChecks`, `serviceDuration`) with no other consumers yet.

Clean up: stop the preview server, delete the temporary `launch.json`.

- [ ] **Step 4: Self-review diff**

Run `git diff <base-commit> --stat` and skim every changed file once more for: any `ring-offset-N` without an explicit color, any same-shade parent/child collision (the single most common bug class across every prior stage of this app's dark redesign — specifically re-check the `TemplatesPanel` inputs/rows nested inside `ServiceBuilder`'s left rail, called out explicitly in Task 6), and confirm no `slate-`/`bg-white`/`bg-[#e9ecf1]`/`bg-[#f4f6f9]` class remains in any of the 7 files this plan touched.
