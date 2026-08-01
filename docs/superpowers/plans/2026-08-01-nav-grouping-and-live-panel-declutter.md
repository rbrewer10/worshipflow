# Nav Grouping and Live Panel Declutter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the top bar from 8 flat destinations to 3 plus two dropdown menus, cut the Live right panel from 10 sections to the 4 an operator uses during a service, and consolidate the renderer's 12 colour families onto 4 semantic roles.

**Architecture:** A new `NavMenu` component backed by a pure reducer (`navMenuState.ts`) supplies the dropdowns. Controls leaving `LiveTools` are not rewritten — their JSX is relocated verbatim into four new destination components, which are then routed through the existing `AppShell` view switch. The styling pass is mechanical find-and-replace, done last so it never mixes with structural diffs.

**Tech Stack:** Electron 33, React 18, TypeScript, Tailwind v3, Vitest (Node environment, pure-logic only), Playwright (`_electron`), ESLint 9 flat config with `jsx-a11y`.

**Spec:** `docs/superpowers/specs/2026-08-01-nav-grouping-and-live-panel-declutter-design.md`

---

## Before you start

This repo has a mandatory verification gate. Run all four before every commit; do not commit if any fails:

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

`npm run lint` currently reports **11 pre-existing warnings and 0 errors**. Warnings are acceptable; any new *error* is not.

Two repo conventions you must follow:

1. **Never use `git add -A` or `git add .`.** Other work is in flight on this branch. Stage only the exact files each task names.
2. **This sandbox cannot launch Electron** (`app.requestSingleInstanceLock()` returns false with no interactive desktop). `npm run dev` and `npm run test:e2e` will appear to do nothing. That is environmental, not a bug you introduced. Tasks that need a real window are marked **[manual]** and are verified by the user on a real desktop.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/renderer/src/navMenuState.ts` | Pure open/close/highlight reducer. No React, no DOM. |
| `src/renderer/src/navMenuState.test.ts` | Unit tests for the reducer. |
| `src/renderer/src/NavMenu.tsx` | Accessible dropdown wrapping the reducer. |
| `src/renderer/src/setup/ScreensZonesTab.tsx` | Setup destination hosting `ZonePanel`. |
| `src/renderer/src/setup/TabletRemoteTab.tsx` | Setup destination for tablet URL + PIN. |
| `src/renderer/src/setup/DiagnosticsTab.tsx` | Setup destination for service log, displays, backups. |
| `src/renderer/src/BackgroundsTab.tsx` | Library destination wrapping `BackgroundLibraryGrid`. |

**Modified:**

| File | Change |
|---|---|
| `src/renderer/src/AppShell.tsx` | `View` union gains 4 members; 4 render branches added. |
| `src/renderer/src/TopBar.tsx` | Nav splits into 3 primary buttons + 2 `NavMenu`s. |
| `src/renderer/src/LiveTools.tsx` | Drops ~150 lines and 7 state hooks. |
| `src/renderer/src/LogoSettings.tsx` | `BackupsPanel` and `fmtBackupTime` removed. |
| `tests/e2e/sunday-workflow.spec.ts` | Nav selectors updated; ambiguous-name bug fixed. |

**Untouched (do not edit):** `VolunteerView.tsx`, `ServiceRail.tsx`, `SlideGrid.tsx`, `LiveDrawer.tsx`, `Output.tsx`, `Stage.tsx`, anything in `src/main/`, `src/preload/`, `src/shared/`.

---

## Task 1: Pure nav menu reducer

The dropdown's keyboard behaviour is the only genuinely new logic in this change. Vitest here runs in a Node environment with no DOM (`vitest.config.ts` has `include: ['src/**/*.test.ts']` — note `.ts`, not `.tsx`), so the logic is extracted into a plain module and tested directly. This mirrors `saveQueue.ts`, `saveRegistry.ts`, `ipcValidate.ts`, and `songDuplicates.ts`, which all exist for exactly this reason.

**Files:**
- Create: `src/renderer/src/navMenuState.ts`
- Test: `src/renderer/src/navMenuState.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/navMenuState.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { navMenuReducer, initialNavMenuState } from './navMenuState'
import type { NavMenuState } from './navMenuState'

const COUNT = 4
const reduce = (state: NavMenuState, action: Parameters<typeof navMenuReducer>[1]): NavMenuState =>
  navMenuReducer(state, action, COUNT)

const openState: NavMenuState = { open: true, highlighted: -1 }

describe('navMenuState', () => {
  it('starts closed with nothing highlighted', () => {
    expect(initialNavMenuState).toEqual({ open: false, highlighted: -1 })
  })

  it('opens from a mouse click with nothing highlighted', () => {
    expect(reduce(initialNavMenuState, { type: 'open' })).toEqual({ open: true, highlighted: -1 })
  })

  it('opens onto the first item for ArrowDown on the trigger', () => {
    expect(reduce(initialNavMenuState, { type: 'openAtFirst' })).toEqual({ open: true, highlighted: 0 })
  })

  it('opens onto the last item for ArrowUp on the trigger', () => {
    expect(reduce(initialNavMenuState, { type: 'openAtLast' })).toEqual({ open: true, highlighted: 3 })
  })

  it('toggles closed when already open', () => {
    expect(reduce(openState, { type: 'toggle' })).toEqual({ open: false, highlighted: -1 })
  })

  it('toggles open when closed', () => {
    expect(reduce(initialNavMenuState, { type: 'toggle' })).toEqual({ open: true, highlighted: -1 })
  })

  it('clears the highlight when closing', () => {
    expect(reduce({ open: true, highlighted: 2 }, { type: 'close' })).toEqual({ open: false, highlighted: -1 })
  })

  it('moves the highlight to the first item from nothing highlighted', () => {
    expect(reduce(openState, { type: 'next' }).highlighted).toBe(0)
  })

  it('wraps forward past the last item', () => {
    expect(reduce({ open: true, highlighted: 3 }, { type: 'next' }).highlighted).toBe(0)
  })

  it('wraps backward past the first item', () => {
    expect(reduce({ open: true, highlighted: 0 }, { type: 'prev' }).highlighted).toBe(3)
  })

  it('moves to the last item pressing prev with nothing highlighted', () => {
    expect(reduce(openState, { type: 'prev' }).highlighted).toBe(3)
  })

  it('jumps to the first and last items', () => {
    expect(reduce({ open: true, highlighted: 2 }, { type: 'first' }).highlighted).toBe(0)
    expect(reduce({ open: true, highlighted: 2 }, { type: 'last' }).highlighted).toBe(3)
  })

  it('sets an explicit highlight for mouse hover', () => {
    expect(reduce(openState, { type: 'highlight', index: 2 }).highlighted).toBe(2)
  })

  it('ignores an out-of-range explicit highlight', () => {
    expect(reduce(openState, { type: 'highlight', index: 9 }).highlighted).toBe(-1)
    expect(reduce(openState, { type: 'highlight', index: -3 }).highlighted).toBe(-1)
  })

  it('never moves the highlight while closed', () => {
    expect(reduce(initialNavMenuState, { type: 'next' })).toEqual(initialNavMenuState)
    expect(reduce(initialNavMenuState, { type: 'prev' })).toEqual(initialNavMenuState)
  })

  it('leaves nothing highlighted when the menu has no items', () => {
    expect(navMenuReducer(initialNavMenuState, { type: 'openAtFirst' }, 0)).toEqual({ open: true, highlighted: -1 })
    expect(navMenuReducer({ open: true, highlighted: -1 }, { type: 'next' }, 0).highlighted).toBe(-1)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npx vitest run src/renderer/src/navMenuState.test.ts
```

Expected: fails to collect — `Failed to resolve import "./navMenuState"`.

- [ ] **Step 3: Write the reducer**

Create `src/renderer/src/navMenuState.ts`:

```ts
// Pure keyboard/open-state logic for NavMenu, kept free of React and the DOM so
// it is testable under this repo's Node-only Vitest config (see saveQueue.ts,
// saveRegistry.ts, ipcValidate.ts for the same pattern). NavMenu.tsx owns the
// rendering and focus side effects; every decision about *what* the state
// should become lives here.
export interface NavMenuState {
  open: boolean
  // Index of the item the keyboard is on. -1 means "menu open, but the user
  // arrived by mouse and hasn't chosen a keyboard position yet".
  highlighted: number
}

export type NavMenuAction =
  | { type: 'open' }
  | { type: 'openAtFirst' }
  | { type: 'openAtLast' }
  | { type: 'close' }
  | { type: 'toggle' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'first' }
  | { type: 'last' }
  | { type: 'highlight'; index: number }

export const initialNavMenuState: NavMenuState = { open: false, highlighted: -1 }

const CLOSED: NavMenuState = { open: false, highlighted: -1 }

export function navMenuReducer(
  state: NavMenuState,
  action: NavMenuAction,
  itemCount: number
): NavMenuState {
  const last = itemCount - 1
  switch (action.type) {
    case 'open':
      return { open: true, highlighted: -1 }
    case 'openAtFirst':
      return { open: true, highlighted: itemCount > 0 ? 0 : -1 }
    case 'openAtLast':
      return { open: true, highlighted: itemCount > 0 ? last : -1 }
    case 'close':
      return CLOSED
    case 'toggle':
      return state.open ? CLOSED : { open: true, highlighted: -1 }
    case 'next':
      if (!state.open || itemCount === 0) return state
      return { open: true, highlighted: state.highlighted >= last ? 0 : state.highlighted + 1 }
    case 'prev':
      if (!state.open || itemCount === 0) return state
      return { open: true, highlighted: state.highlighted <= 0 ? last : state.highlighted - 1 }
    case 'first':
      if (!state.open || itemCount === 0) return state
      return { open: true, highlighted: 0 }
    case 'last':
      if (!state.open || itemCount === 0) return state
      return { open: true, highlighted: last }
    case 'highlight':
      if (!state.open) return state
      if (action.index < 0 || action.index > last) return state
      return { open: true, highlighted: action.index }
    default:
      return state
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npx vitest run src/renderer/src/navMenuState.test.ts
```

Expected: `Tests 16 passed (16)`.

- [ ] **Step 5: Run the full gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: typecheck silent, all tests pass (235 existing + 16 new = 251), lint reports 0 errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/navMenuState.ts src/renderer/src/navMenuState.test.ts
git commit -m "feat: pure reducer for nav dropdown keyboard state"
```

---

## Task 2: NavMenu component

**Files:**
- Create: `src/renderer/src/NavMenu.tsx`

There is no component-test infrastructure and this task deliberately does not add any (see spec §7). Correctness of the *logic* is covered by Task 1; correctness of the *rendering* is covered by Task 11's E2E test and manual verification.

- [ ] **Step 1: Write the component**

Create `src/renderer/src/NavMenu.tsx`:

```tsx
import { useEffect, useReducer, useRef } from 'react'
import type { ComponentType, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { navMenuReducer, initialNavMenuState } from './navMenuState'
import type { NavMenuAction, NavMenuState } from './navMenuState'

type IconType = ComponentType<{ size?: number | string; className?: string }>

export interface NavMenuItem<T extends string> {
  id: T
  label: string
  Icon: IconType
}

// A top-bar dropdown. Destinations the operator enters deliberately (libraries,
// setup) live in here rather than as flat tabs, so the bar stays readable —
// see the 2026-08-01 spec. Live-critical controls are never put behind one of
// these: a dropdown costs a click, and mid-service that matters.
function NavMenu<T extends string>({ label, items, activeId, onSelect }: {
  label: string
  items: NavMenuItem<T>[]
  activeId: T | null
  onSelect: (id: T) => void
}): JSX.Element {
  const [state, dispatch] = useReducer(
    (s: NavMenuState, a: NavMenuAction) => navMenuReducer(s, a, items.length),
    initialNavMenuState
  )
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (!state.open) return
    const onPointerDown = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) dispatch({ type: 'close' })
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [state.open])

  // DOM focus follows the reducer's highlight, so screen readers announce the
  // right item and Enter/Space activate it natively.
  useEffect(() => {
    if (state.open && state.highlighted >= 0) itemRefs.current[state.highlighted]?.focus()
  }, [state.open, state.highlighted])

  const close = (returnFocus: boolean): void => {
    dispatch({ type: 'close' })
    if (returnFocus) triggerRef.current?.focus()
  }

  const choose = (id: T): void => {
    onSelect(id)
    close(true)
  }

  const onTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); dispatch({ type: 'openAtFirst' }) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); dispatch({ type: 'openAtLast' }) }
    else if (e.key === 'Escape' && state.open) { e.preventDefault(); close(false) }
  }

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); dispatch({ type: 'next' }) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); dispatch({ type: 'prev' }) }
    else if (e.key === 'Home') { e.preventDefault(); dispatch({ type: 'first' }) }
    else if (e.key === 'End') { e.preventDefault(); dispatch({ type: 'last' }) }
    else if (e.key === 'Escape') { e.preventDefault(); close(true) }
    else if (e.key === 'Tab') close(false)
  }

  const containsActive = items.some((it) => it.id === activeId)

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        ref={triggerRef}
        onClick={() => dispatch({ type: 'toggle' })}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="menu"
        aria-expanded={state.open}
        className={`flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
          containsActive
            ? 'bg-blue-600 font-medium text-white'
            : 'font-normal text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
        }`}
      >
        {label}
        <ChevronDown size={14} className="flex-shrink-0" />
      </button>

      {state.open && (
        <div
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute left-0 top-full z-50 mt-1 min-w-[13rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {items.map((item, i) => (
            <button
              key={item.id}
              ref={(el) => { itemRefs.current[i] = el }}
              role="menuitem"
              onClick={() => choose(item.id)}
              onMouseEnter={() => dispatch({ type: 'highlight', index: i })}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                item.id === activeId ? 'font-medium text-blue-700' : 'text-slate-700'
              } ${state.highlighted === i ? 'bg-slate-100' : 'hover:bg-slate-100'}`}
            >
              <item.Icon size={15} className="flex-shrink-0 text-slate-500" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default NavMenu
```

- [ ] **Step 2: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 0 lint errors. If `jsx-a11y` flags anything, fix the markup rather than adding a disable comment — this component's whole purpose is to be keyboard-correct.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/NavMenu.tsx
git commit -m "feat: accessible NavMenu dropdown for top bar"
```

---

## Task 3: Screens & zones and Tablet remote destinations

The JSX in both is lifted from `LiveTools.tsx` **verbatim** apart from the wrapper and heading. Do not redesign it here; `LiveTools` is not edited until Task 8, so the app keeps working throughout.

**Files:**
- Create: `src/renderer/src/setup/ScreensZonesTab.tsx`
- Create: `src/renderer/src/setup/TabletRemoteTab.tsx`

- [ ] **Step 1: Create the screens & zones destination**

Create `src/renderer/src/setup/ScreensZonesTab.tsx`:

```tsx
import ZonePanel from '../ZonePanel'

// Zone routing is set up for the room and then left alone, so it lives here
// rather than in the Live panel where it used to sit (2026-08-01 spec).
function ScreensZonesTab(): JSX.Element {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 text-lg font-semibold text-slate-900">Screens &amp; zones</h1>
        <p className="mb-5 text-sm text-slate-500">
          What each screen in the room shows, and the address to open on each Pi.
        </p>
        <ZonePanel />
      </div>
    </div>
  )
}

export default ScreensZonesTab
```

- [ ] **Step 2: Create the tablet remote destination**

Create `src/renderer/src/setup/TabletRemoteTab.tsx`. The URL/PIN block is moved out of `LiveTools`'s collapsed "More" section, where it was effectively undiscoverable:

```tsx
import { useEffect, useState } from 'react'
import { Tablet } from 'lucide-react'

function TabletRemoteTab(): JSX.Element {
  const [tabletUrl, setTabletUrl] = useState('')
  const [tabletPin, setTabletPin] = useState('')

  useEffect(() => {
    window.wf.getTabletUrl().then(setTabletUrl)
    window.wf.getTabletPin().then(setTabletPin)
  }, [])

  const regenerate = (): void => {
    if (!window.confirm('Generate a new PIN? Any tablet already unlocked will need the new one.')) return
    window.wf.regenerateTabletPin().then(setTabletPin)
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Tablet size={18} className="text-slate-500" /> Tablet remote
        </h1>
        <p className="mb-5 text-sm text-slate-500">
          Open this address on an iPad or phone to use it as a wireless stage monitor.
          Volunteers need the PIN before they can send anything live.
        </p>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Address</div>
          <div className="break-all rounded-lg bg-slate-100 px-3 py-2 text-center font-mono text-sm text-blue-700">
            {tabletUrl || 'Starting server…'}
          </div>

          <div className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Unlock PIN</div>
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-slate-900 px-3 py-1.5 font-mono text-lg tracking-[0.3em] text-emerald-400">
              {tabletPin || '······'}
            </span>
            <button onClick={regenerate} className="btn text-xs">New PIN</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TabletRemoteTab
```

- [ ] **Step 3: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass. These components are not routed yet, so nothing changes visually.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/setup/ScreensZonesTab.tsx src/renderer/src/setup/TabletRemoteTab.tsx
git commit -m "feat: screens/zones and tablet remote setup destinations"
```

---

## Task 4: Diagnostics destination, and move BackupsPanel out of LogoSettings

`BackupsPanel` and its `fmtBackupTime` helper currently live at `src/renderer/src/LogoSettings.tsx:261-319` and are rendered at line 247. Both move here so Logo & branding is only about branding.

**Files:**
- Create: `src/renderer/src/setup/DiagnosticsTab.tsx`
- Modify: `src/renderer/src/LogoSettings.tsx`

- [ ] **Step 1: Create the diagnostics destination**

Create `src/renderer/src/setup/DiagnosticsTab.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { FileText, FolderOpen } from 'lucide-react'
import type { AppInfo } from '../../../shared/types'

function fmtBackupTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// The app already takes a full database backup on every launch (see
// createTimestampedBackup, main process) — this just closes the gap between
// "backups silently exist" and "an operator can actually use one" without
// touching the filesystem by hand.
function BackupsPanel(): JSX.Element {
  const [backups, setBackups] = useState<{ filename: string; timestamp: number }[]>([])
  const [restoring, setRestoring] = useState<string | null>(null)

  useEffect(() => { window.wf.backupsList().then(setBackups) }, [])

  const restore = (filename: string, timestamp: number): void => {
    const when = fmtBackupTime(timestamp)
    if (!confirm(
      `Restore the database to how it was on ${when}?\n\n` +
      'Everything added or changed since then will be gone. The app will ' +
      'restart automatically — your current database is also backed up first, ' +
      'just in case.'
    )) return
    setRestoring(filename)
    window.wf.backupsRestore(filename).catch((err) => {
      setRestoring(null)
      alert(`Restore failed: ${err instanceof Error ? err.message : String(err)}`)
    })
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4">
        <h2 className="font-semibold text-slate-900">Backups</h2>
        <div className="mt-0.5 text-xs text-slate-500">
          A snapshot of your whole database (songs, services, announcements) is taken automatically every time the app starts. Restoring rolls everything back to that point and restarts the app.
        </div>
      </div>
      {backups.length === 0 ? (
        <p className="text-xs text-slate-500">No backups yet — one is taken the next time you start the app.</p>
      ) : (
        <ul className="max-h-48 space-y-1 overflow-auto">
          {backups.map((b) => (
            <li key={b.filename} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-slate-50">
              <span className="text-slate-700">{fmtBackupTime(b.timestamp)}</span>
              <button
                onClick={() => restore(b.filename, b.timestamp)}
                disabled={restoring != null}
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                {restoring === b.filename ? 'Restoring…' : 'Restore'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DiagnosticsTab(): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [serviceLog, setServiceLog] = useState<Array<{ ts: number; event: string }>>([])

  useEffect(() => { window.wf.getInfo().then(setInfo) }, [])

  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="mb-1 text-lg font-semibold text-slate-900">Diagnostics &amp; backups</h1>
          <p className="text-sm text-slate-500">
            What the app can see, what it has been doing, and how to roll it back.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 font-semibold text-slate-900">Displays</h2>
          <div className="text-sm text-slate-600">
            <b className="text-slate-900">{info?.displays.length ?? '…'}</b> display(s) ·{' '}
            <span className={info && info.outputs > 0 ? 'text-blue-700' : 'text-amber-700'}>
              {info?.outputs ?? 0} live
            </span>
          </div>
          <div className="mt-1 space-y-0.5 text-sm text-slate-600">
            {info?.displays.map((d) => (
              <div key={d.id}>
                • {d.bounds.width}×{d.bounds.height}
                {d.primary && <span className="ml-1 text-blue-700">(primary)</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 font-semibold text-slate-900">Service log</h2>
          <div className="flex gap-2">
            <button onClick={() => window.wf.featuresGetServiceLog().then(setServiceLog)} className="btn text-xs">
              <FileText size={13} /> Load service log ({serviceLog.length})
            </button>
            <button onClick={() => window.wf.logsOpenFolder()} className="btn text-xs">
              <FolderOpen size={13} /> Open log folder
            </button>
          </div>
          {serviceLog.length > 0 && (
            <div className="mt-3 max-h-64 space-y-0.5 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              {serviceLog.slice().reverse().map((e, i) => (
                <div key={i}>
                  <span className="text-slate-400">{new Date(e.ts).toLocaleTimeString()}</span> {e.event}
                </div>
              ))}
            </div>
          )}
        </div>

        <BackupsPanel />
      </div>
    </div>
  )
}

export default DiagnosticsTab
```

- [ ] **Step 2: Remove BackupsPanel from LogoSettings**

In `src/renderer/src/LogoSettings.tsx`, delete these three things:

1. Line 247, the render call — delete the whole line:

```tsx
        <BackupsPanel />
```

2. The `fmtBackupTime` function (lines 261-264) and the entire `BackupsPanel` function (lines 266-319, including the three-line comment above it). Everything between the closing `}` of `LogoSettings` and `export default LogoSettings` is deleted, so the file now ends:

```tsx
      </div>
    </div>
  )
}

export default LogoSettings
```

- [ ] **Step 3: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass. If typecheck complains about a now-unused import in `LogoSettings.tsx`, remove that import too — `BackupsPanel` was the only consumer of some of them.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/setup/DiagnosticsTab.tsx src/renderer/src/LogoSettings.tsx
git commit -m "feat: diagnostics destination; move backups out of logo settings"
```

---

## Task 5: Backgrounds library destination

Backgrounds currently has no destination of its own — it exists only as a bottom-drawer tab and buried inside Logo & BG. `BackgroundLibraryGrid` already takes `{ activePath, onApply }`; here it is browse-only, so `activePath` is `null` and `onApply` is a no-op.

**Files:**
- Create: `src/renderer/src/BackgroundsTab.tsx`

- [ ] **Step 1: Create the destination**

Create `src/renderer/src/BackgroundsTab.tsx`:

```tsx
import BackgroundLibraryGrid from './BackgroundLibraryGrid'

// Browse/manage view for the background library. Applying a background to
// something still happens where that something is edited (song editor, item
// editor, bottom drawer) — this destination is for uploading, tagging and
// deleting, which previously had nowhere to live.
function BackgroundsTab(): JSX.Element {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-1 text-lg font-semibold text-slate-900">Backgrounds</h1>
        <p className="mb-5 text-sm text-slate-500">
          Upload, tag and delete backgrounds. To put one behind a song or item, pick it
          from that item&apos;s editor or the drawer at the bottom of the screen.
        </p>
        <BackgroundLibraryGrid activePath={null} onApply={() => {}} />
      </div>
    </div>
  )
}

export default BackgroundsTab
```

- [ ] **Step 2: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/BackgroundsTab.tsx
git commit -m "feat: backgrounds library destination"
```

---

## Task 6: Route the new destinations

**Files:**
- Modify: `src/renderer/src/AppShell.tsx`

**Critical:** the live keyboard shortcuts are gated at line 44 by `if (view !== 'live') return`. That is an equality check, so new views inherit "shortcuts off" automatically. **Do not** rewrite it as a list of excluded views — spec §6 calls this out specifically.

- [ ] **Step 1: Add the imports**

In `src/renderer/src/AppShell.tsx`, after the existing `import ObsConnectTab from './ObsConnectTab'` line, add:

```tsx
import BackgroundsTab from './BackgroundsTab'
import ScreensZonesTab from './setup/ScreensZonesTab'
import TabletRemoteTab from './setup/TabletRemoteTab'
import DiagnosticsTab from './setup/DiagnosticsTab'
```

- [ ] **Step 2: Extend the View union**

Replace line 19:

```tsx
export type View = 'home' | 'live' | 'service' | 'songs' | 'announcements' | 'scripture' | 'volunteer' | 'settings' | 'soundcheck' | 'obs'
```

with:

```tsx
export type View =
  | 'home' | 'live' | 'service'
  | 'songs' | 'announcements' | 'scripture' | 'backgrounds'
  | 'zones' | 'obs' | 'settings' | 'tablet' | 'diagnostics'
  | 'volunteer' | 'soundcheck'
```

- [ ] **Step 3: Add the render branches**

In the view switch, replace this existing fragment:

```tsx
          ) : view === 'obs' ? (
            <ObsConnectTab />
          ) : view === 'soundcheck' ? (
```

with:

```tsx
          ) : view === 'backgrounds' ? (
            <BackgroundsTab />
          ) : view === 'zones' ? (
            <ScreensZonesTab />
          ) : view === 'tablet' ? (
            <TabletRemoteTab />
          ) : view === 'diagnostics' ? (
            <DiagnosticsTab />
          ) : view === 'obs' ? (
            <ObsConnectTab />
          ) : view === 'soundcheck' ? (
```

- [ ] **Step 4: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass. The new destinations are routed but not yet reachable from the UI — that is Task 7.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/AppShell.tsx
git commit -m "feat: route backgrounds, zones, tablet and diagnostics views"
```

---

## Task 7: Restructure the top bar

**Files:**
- Modify: `src/renderer/src/TopBar.tsx`

- [ ] **Step 1: Replace the imports and nav constants**

In `src/renderer/src/TopBar.tsx`, replace the lucide import on line 3:

```tsx
import { Home, Play, ListMusic, Music, Megaphone, BookOpen, Video, Image as ImageIcon, User } from 'lucide-react'
```

with:

```tsx
import { Home, Play, ListMusic, Music, Megaphone, BookOpen, Video, Image as ImageIcon, User, Monitor, Palette, Tablet, Stethoscope } from 'lucide-react'
```

and add, after the `import BrandMark from './BrandMark'` line:

```tsx
import NavMenu from './NavMenu'
import type { NavMenuItem } from './NavMenu'
```

Then replace the whole `NAV_ITEMS` array (lines 21-33, including its comment) with:

```tsx
// Three destinations stay visible because they are what gets switched between
// week to week; the rest are entered deliberately, so a menu costs nothing.
// This is the grouping the 2026-07-23 top bar spec deferred until the bottom
// dock went app-wide — it has, so this is that phase, not a reversal.
const PRIMARY_ITEMS: { id: View; Icon: IconType; label: string }[] = [
  { id: 'home', Icon: Home, label: 'Home' },
  { id: 'live', Icon: Play, label: 'Live' },
  { id: 'service', Icon: ListMusic, label: 'Build service' }
]

const LIBRARY_ITEMS: NavMenuItem<View>[] = [
  { id: 'songs', Icon: Music, label: 'Songs' },
  { id: 'announcements', Icon: Megaphone, label: 'Announcements' },
  { id: 'scripture', Icon: BookOpen, label: 'Scripture' },
  { id: 'backgrounds', Icon: ImageIcon, label: 'Backgrounds' }
]

// Sound Check (Yamaha TF-Rack) is a prototype — fake channel data, unverified
// OSC addresses/fader curve (see yamaha-controller.ts). Still absent from the
// nav until it's real; the tab/route/controller code is untouched.
const SETUP_ITEMS: NavMenuItem<View>[] = [
  { id: 'zones', Icon: Monitor, label: 'Screens & zones' },
  { id: 'obs', Icon: Video, label: 'OBS connect' },
  { id: 'settings', Icon: Palette, label: 'Logo & branding' },
  { id: 'tablet', Icon: Tablet, label: 'Tablet remote' },
  { id: 'diagnostics', Icon: Stethoscope, label: 'Diagnostics & backups' }
]
```

- [ ] **Step 2: Replace the nav element**

Replace the entire `<nav>` block (lines 86-101) with:

```tsx
      <nav className="flex min-w-0 flex-1 items-center gap-1">
        {PRIMARY_ITEMS.map(({ id, Icon, label }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              view === id
                ? 'bg-blue-600 font-medium text-white'
                : 'font-normal text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
            }`}
          >
            <Icon size={15} className="flex-shrink-0" />
            {label}
          </button>
        ))}
        <NavMenu label="Library" items={LIBRARY_ITEMS} activeId={view} onSelect={setView} />
        <NavMenu label="Setup" items={SETUP_ITEMS} activeId={view} onSelect={setView} />
      </nav>
```

Note `overflow-x-auto` is deliberately dropped from the `<nav>` — with only five targets it is no longer needed, and it would clip the open dropdown panels.

- [ ] **Step 3: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 0 lint errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/TopBar.tsx
git commit -m "feat: group nav into Library and Setup dropdowns"
```

- [ ] **Step 5: [manual] Verify on a real desktop**

This sandbox cannot launch Electron. Ask the user to run `npm run dev` and confirm: both menus open on click and on ArrowDown/ArrowUp; arrow keys move through items and wrap; Escape closes and returns focus to the trigger; clicking outside closes; every item navigates; the trigger highlights blue while one of its own destinations is active.

---

## Task 8: Strip LiveTools to four sections

`LiveTools.tsx` currently renders 10 sections. After this task it renders 4. Everything removed is already reachable from its new home (Tasks 3-5) or from the app-wide bottom drawer.

**Files:**
- Modify: `src/renderer/src/LiveTools.tsx`

- [ ] **Step 1: Trim the imports**

Replace line 2:

```tsx
import { MonitorOff, Image as ImageIcon, Play, Timer, ChevronUp, ChevronDown, Keyboard, FileText, Tablet, FolderOpen } from 'lucide-react'
```

with:

```tsx
import { MonitorOff, Image as ImageIcon, Play, Timer } from 'lucide-react'
```

Delete these three import lines entirely:

```tsx
import type { AppInfo, LiveState, TrackId } from '../../shared/types'
import ZonePanel from './ZonePanel'
import { ScripturePanel } from './ScripturePanel'
```

and re-add the types import without `AppInfo`:

```tsx
import type { LiveState, TrackId } from '../../shared/types'
```

- [ ] **Step 2: Delete the dead state and handlers**

Remove these hooks from the component body:

```tsx
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [scriptureRef, setScriptureRef] = useState('')
  const [tabletUrl, setTabletUrl] = useState('')
  const [tabletPin, setTabletPin] = useState('')
  const [bibleTranslation, setBibleTranslation] = useState<'kjv' | 'web' | 'bbe'>('kjv')
  const [showCheatSheet, setShowCheatSheet] = useState(false)
  const [serviceLog, setServiceLog] = useState<Array<{ ts: number; event: string }>>([])
  const [showMore, setShowMore] = useState(false)
```

Remove the whole `quickScripture` function.

Replace the first `useEffect` with one that no longer fetches info, tablet URL or PIN:

```tsx
  useEffect(() => {
    const off = window.wf.onState((s) => setLive(track === 'main' ? s.main : s.second))
    return off
  }, [track])
```

Delete this line entirely — it existed only to refresh `info`:

```tsx
  useEffect(() => { if (live?.songTitle) window.wf.getInfo().then(setInfo) }, [live?.songTitle])
```

- [ ] **Step 3: Delete the removed JSX**

Delete, in order:

1. The `{/* Divider */}` + `<ScripturePanel ... />` block (the divider immediately before the "Quick scripture" comment, through the closing `/>`).
2. The `showMore` toggle button and its entire `{showMore && ( ... )}` block, along with the `{/* Divider */}` immediately preceding the toggle.
3. The `{/* Zone display system */}` `<section>` wrapper containing `<ZonePanel />`.

The component's returned JSX must end:

```tsx
      {/* Status strip: hymn timer + verse */}
      {(hmsElapsedSecs > 0 || live?.verseNumber != null) && (
        <div className="flex gap-2 rounded-lg border border-slate-200 bg-slate-100/70 px-3 py-1.5 text-xs text-slate-600">
          {hmsElapsedSecs > 0 && <span className="inline-flex items-center gap-1 tabular-nums"><Timer size={12} /> {Math.floor(hmsElapsedSecs / 60)}:{String(hmsElapsedSecs % 60).padStart(2, '0')}</span>}
          {live?.verseNumber != null && <span>· Verse {live.verseNumber}</span>}
        </div>
      )}
    </aside>
  )
}

export default LiveTools
```

- [ ] **Step 4: Update the file's header comment**

Replace the component's leading comment with one that describes what it is now:

```tsx
// The Live tab's right-hand control panel for the Main track. Deliberately holds
// only what an operator reaches for *during* a service: the panic row, presenter
// notes, stage messages, and text size/auto-advance. Everything configured once
// and then left alone (zones, tablet PIN, logs, displays) lives under Setup, and
// quick scripture lives in the app-wide bottom drawer — see the 2026-08-01 spec.
// A control added back here should be one that is genuinely used mid-service.
```

- [ ] **Step 5: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass. Typecheck is the real check here — it will flag any state or import left behind unused.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/LiveTools.tsx
git commit -m "refactor: cut live panel from 10 sections to 4"
```

---

## Task 9: Styling pass — retire the second neutral ramp

`slate` and `gray` are both in use (975 vs 68 occurrences). They are different temperatures, and mixing them is the single most visible source of inconsistency. Tailwind's `gray-N` and `slate-N` share the same numeric scale, so this is a safe one-for-one swap.

**Files:**
- Modify: `src/renderer/src/LogoSettings.tsx` **only**

Only two files in the renderer use `gray-` at all, and one of them must be left alone:

| File | `gray-` tokens | Status |
|---|---|---|
| `LogoSettings.tsx` | 56, of which 10 are inside the `BackupsPanel` block Task 4 deletes | tracked — swap it |
| `ObsConnectTab.tsx` | 12 | **untracked (`??`)** — someone else's uncommitted new file. Do not touch. |

So after Task 4 the renderer holds 58 `gray-` tokens: 46 in `LogoSettings.tsx` and 12 in the untracked file. This task swaps the 46. The remaining 12 get swapped by whoever commits `ObsConnectTab.tsx`, not by us — modifying an untracked file drags unrelated work into our commit.

- [ ] **Step 1: Confirm the starting counts**

```bash
grep -cohE "\b(bg|text|border|ring|from|to|via|divide|placeholder)-gray-[0-9]{2,3}\b" src/renderer/src/LogoSettings.tsx
git status --short src/renderer/src/ObsConnectTab.tsx
```

Expected: `46`, and `?? src/renderer/src/ObsConnectTab.tsx`.

If `LogoSettings.tsx` still reports 56, Task 4 was not completed — go back and finish it before continuing, or the deleted `BackupsPanel` will be re-styled pointlessly.

If `ObsConnectTab.tsx` now reports as tracked and clean, it has since been committed by its author; in that case include it in this swap and adjust the counts accordingly.

- [ ] **Step 2: Perform the swap**

```bash
sed -i -E 's/\b(bg|text|border|ring|from|to|via|divide|placeholder)-gray-([0-9]{2,3})\b/\1-slate-\2/g' src/renderer/src/LogoSettings.tsx
```

- [ ] **Step 3: Confirm the swap landed and nothing else moved**

```bash
grep -cohE "\b(bg|text|border|ring|from|to|via|divide|placeholder)-gray-[0-9]{2,3}\b" src/renderer/src/LogoSettings.tsx
git status --short src/renderer/src
```

Expected: `0` for the first command. The second must list `ObsConnectTab.tsx` as still `??` and unmodified — if it shows ` M`, the sed hit the wrong file; revert it with `git checkout --` is not possible on an untracked file, so restore it from the author instead and re-run with the explicit path.

- [ ] **Step 4: Read the diff**

```bash
git diff src/renderer/src/LogoSettings.tsx
```

Every hunk must be a `gray-` → `slate-` token change and nothing else. Tailwind's `gray-N` and `slate-N` share the same numeric scale, so shade numbers must be unchanged.

- [ ] **Step 5: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/LogoSettings.tsx
git commit -m "style: consolidate logo settings onto the slate neutral ramp"
```

- [ ] **Step 7: [manual] Visual check**

Ask the user to run `npm run dev`, open Logo & branding, and confirm nothing looks washed out or mismatched against the surrounding chrome.

---

## Task 10: Styling pass — retire the one-off accent hues

`purple` (15), `sky` (9), `indigo` (7) and `rose` (6) each appear a handful of times doing work `blue` or `red` already does. Unlike Task 9 this is **not** a blind swap — each site needs a judgement about whether it means "accent" or "danger".

**Files:**
- Modify: the files listed by Step 1

- [ ] **Step 1: List every occurrence, and check nothing is untracked**

```bash
grep -rnE "\b(bg|text|border|ring|from|to|via)-(purple|sky|indigo|rose)-[0-9]{2,3}\b" src/renderer/src --include=*.tsx
for f in $(grep -rlE "\b(bg|text|border|ring|from|to|via)-(purple|sky|indigo|rose)-[0-9]{2,3}\b" src/renderer/src --include=*.tsx); do printf "%-58s %s\n" "$f" "$(git status --short "$f")"; done
```

At the time of writing, all 8 affected files are tracked and clean:
`editor/SongEditor.tsx`, `RecordingsPanel.tsx`, `ServiceDeck.tsx`,
`sound-check/EngineerDashboard.tsx`, `sound-check/preview/VariantA.tsx`,
`sound-check/preview/VariantC.tsx`, `sound-check/VolunteerCheck.tsx`,
`ZoneTrackStripBadge.tsx`.

**If any file now shows `??` (untracked) or ` M` (modified by other in-flight work), skip that file** and note it in the commit message. Restyling a file someone else is mid-edit in either drags their work into our commit or creates a needless conflict. The same rule that protects `ObsConnectTab.tsx` in Task 9 applies here.

- [ ] **Step 2: Rewrite each occurrence by meaning**

Work through the list one at a time, applying this mapping:

| Current | Means | Becomes |
|---|---|---|
| `sky-*`, `indigo-*` | selection, primary action, informational | the same shade of `blue-*` |
| `purple-*` | decorative only | the same shade of `slate-*` |
| `rose-*` | error, destructive | the same shade of `red-*` |

If a `purple-*` site turns out to be carrying real meaning (a status, a category) rather than decoration, stop and ask rather than flattening it to slate.

- [ ] **Step 3: Confirm none remain**

```bash
grep -rnE "\b(bg|text|border|ring|from|to|via)-(purple|sky|indigo|rose)-[0-9]{2,3}\b" src/renderer/src --include=*.tsx | wc -l
```

Expected: `0`.

- [ ] **Step 4: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add <each file changed in step 2>
git commit -m "style: fold one-off accent hues onto blue, red and slate"
```

---

## Task 11: Fix and update the E2E spec

`tests/e2e/sunday-workflow.spec.ts` has never run successfully — it was written in a sandbox that cannot launch Electron. It carries a real bug independent of this redesign: line 28 uses `getByRole('button', { name: 'Songs' })`, but `LiveDrawer` is mounted app-wide and renders its own button named exactly "Songs", so Playwright strict mode rejects the ambiguous match. The same collision affects "Announcements" and "Scripture".

**Files:**
- Modify: `tests/e2e/sunday-workflow.spec.ts`

- [ ] **Step 1: Give the nav an addressable landmark**

In `src/renderer/src/TopBar.tsx`, add an accessible name to the `<nav>` opened in Task 7:

```tsx
      <nav aria-label="Main" className="flex min-w-0 flex-1 items-center gap-1">
```

- [ ] **Step 2: Update the song-creation navigation**

Songs now lives behind the Library menu. Replace line 28:

```ts
    await operator.getByRole('button', { name: 'Songs' }).click()
```

with:

```ts
    // Songs moved behind the Library menu in the 2026-08-01 nav regrouping.
    // Both clicks are scoped to the main nav because LiveDrawer renders its own
    // app-wide "Songs" tab button — an unscoped name match is ambiguous and
    // fails Playwright strict mode.
    const mainNav = operator.getByRole('navigation', { name: 'Main' })
    await mainNav.getByRole('button', { name: 'Library' }).click()
    await operator.getByRole('menuitem', { name: 'Songs' }).click()
```

- [ ] **Step 3: Scope the remaining nav clicks**

Replace line 43:

```ts
    await operator.getByRole('button', { name: 'Build Service' }).click()
```

with:

```ts
    await mainNav.getByRole('button', { name: 'Build service' }).click()
```

Note the lower-case "service" — Task 7 changed the label.

Replace line 50:

```ts
    await operator.getByRole('button', { name: 'Live' }).click()
```

with:

```ts
    await mainNav.getByRole('button', { name: 'Live' }).click()
```

- [ ] **Step 4: Add a regression test for the nav itself**

Append this second test to the end of the file, after the closing `})` of the existing test:

```ts
// Guards the 2026-08-01 nav regrouping: the menus must be openable and
// navigable by keyboard alone, since that is the part a mouse-only manual
// check will never exercise.
test('library and setup menus are keyboard operable', async () => {
  const { app, userDataDir } = await launchApp()
  try {
    await expect.poll(() => app.windows().length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2)
    const operator = app.windows().find((p) => !p.url().includes('#/output')) as Page
    const mainNav = operator.getByRole('navigation', { name: 'Main' })

    const setup = mainNav.getByRole('button', { name: 'Setup' })
    await setup.focus()
    await operator.keyboard.press('ArrowDown')
    await expect(operator.getByRole('menu', { name: 'Setup' })).toBeVisible()
    await expect(operator.getByRole('menuitem', { name: 'Screens & zones' })).toBeFocused()

    await operator.keyboard.press('ArrowUp')
    await expect(operator.getByRole('menuitem', { name: 'Diagnostics & backups' })).toBeFocused()

    await operator.keyboard.press('Escape')
    await expect(operator.getByRole('menu', { name: 'Setup' })).not.toBeVisible()
    await expect(setup).toBeFocused()

    await mainNav.getByRole('button', { name: 'Library' }).click()
    await operator.getByRole('menuitem', { name: 'Backgrounds' }).click()
    await expect(operator.getByRole('heading', { name: 'Backgrounds' })).toBeVisible()
  } finally {
    await closeApp(app, userDataDir)
  }
})
```

- [ ] **Step 5: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass. `npm test` does not run Playwright — `vitest.config.ts` only includes `src/**/*.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/sunday-workflow.spec.ts src/renderer/src/TopBar.tsx
git commit -m "test: fix ambiguous nav selectors and cover menu keyboard nav"
```

- [ ] **Step 7: [manual] Run the E2E suite for real**

This sandbox cannot launch Electron. Ask the user to run:

```bash
npm run test:e2e
```

This is the first genuine execution of this suite. Expect it to need correction — report actual failures rather than assuming the spec is right, and fix the test or the app depending on which is actually wrong.

---

## Self-review notes

**Spec coverage.** §1 nav structure → Tasks 6, 7. §2 live panel → Tasks 3, 4, 5, 8. §3 component structure → Tasks 1-8. §4 styling → Tasks 9, 10. §5 data flow → no task needed; no IPC or state-shape change is introduced. §6 error handling → the shortcut-gate warning is enforced in Task 6 Step 3; relocated controls keep their existing confirms verbatim in Tasks 3 and 4. §7 testing → Tasks 1 and 11.

**Known sequencing constraint.** Tasks 3-5 create destinations before Task 6 routes them and Task 7 links them; the app stays working at every commit, with new code merely unreachable until Task 7. Task 8 must come after Task 7, or controls would be removed from the Live panel before their new homes are reachable.

**Deferred deliberately (spec §4, "Non-goals").** Strict red-reserved-for-on-air is not in this plan. It requires auditing 94 sites and re-treating destructive actions, and belongs in its own change with its own visual review.
