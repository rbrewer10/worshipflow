# Visual Redesign — TopBar + Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the app's most visible, always-on-screen surface — `AppShell.tsx`'s root wrapper, `TopBar.tsx`, `NavMenu.tsx`, `OnboardingHelp.tsx`, and `HomeView.tsx` — from raw light-theme Tailwind utility classes to the Foundation stage's confirmed dark navy/graphite palette, semantic tokens, and shared component classes. This is stage 2 of the design spec's rollout order (`docs/superpowers/specs/2026-08-11-visual-redesign-design.md`, Section 4): "small, high-visibility surface; good early gut-check that the direction reads right before touching the rest of the app."

**Architecture:** The Foundation stage (merged, `docs/superpowers/plans/2026-08-11-visual-redesign-foundation.md`) already shipped the Tailwind semantic tokens (`bg-app`/`bg-panel`/`bg-panel-raised`, `border-border`/`border-border-strong`, `text-content-primary`/`-secondary`/`-tertiary`) and reskinned the shared `.btn*`/`.card*`/`.surface`/`.badge*`/`.section-header*` classes in `main.css`. This stage is pure per-screen migration: replace raw utility strings (`bg-white`, `border-slate-200`, `text-slate-900`, etc.) in the five files above with those tokens, and — per the design spec's explicit instruction that migration "replace raw utility-class strings with these primitives... not just re-colored in place" — adopt the shared `.card-interactive` class for `HomeView.tsx`'s action-card grid (currently hand-styled) and introduce `IconButton.tsx` (the one new shared primitive the Foundation spec deferred to "the first per-screen stage that needs it" — `TopBar.tsx`'s icon-only help button is that first case). No behavior/logic changes anywhere in this stage — every `useState`/`useEffect`/handler/prop is untouched, only `className` strings change (plus the one new component).

**Tech Stack:** React, Tailwind CSS v3 (tokens from the Foundation stage), the `cn()` helper (`src/renderer/src/ui/cn.ts`, also from Foundation).

---

## Conversion rules (apply consistently across every task below)

Blue (`bg-blue-*`, `border-blue-*`) is already Snow Hill blue — every existing `bg-blue-600`/`border-blue-600` usage in these files is already semantically correct (primary actions, selection state) and needs **no color change**, only the *surrounding* neutral colors change. The one blue adjustment needed: bare **text-only** blue used directly against the dark app background (not sitting on a solid blue button fill) needs to lighten from `-600`/`-700` to `-400` for contrast — e.g. `text-blue-600`/`text-blue-700` as a label color → `text-blue-400`.

| Old (light theme) | New (dark theme) | Where |
|---|---|---|
| `bg-white`, `bg-[#f4f6f9]`, `bg-slate-50` (panels/headers/dropdowns) | `bg-panel` (or `bg-panel-raised` for dropdowns/nested/hover-elevated surfaces) | throughout |
| `bg-[#e9ecf1]` (app-wide page background) | `bg-app` | `AppShell.tsx`, `HomeView.tsx` |
| `border-slate-200`, `border-slate-300` | `border-border` (or `border-border-strong` for emphasis) | throughout |
| `text-slate-900` | `text-content-primary` | throughout |
| `text-slate-500`, `text-slate-600`, `text-slate-700` | `text-content-secondary` | throughout |
| `text-slate-400` | `text-content-tertiary` | throughout |
| `hover:bg-slate-100`, `hover:bg-slate-200/60`, `hover:bg-slate-300`, `hover:bg-slate-50` | `hover:bg-panel-raised` | throughout |
| Status-badge **text** colors at `-700`/`-800` sitting on a translucent tint chip (`bg-amber-500/10`, `bg-red-500/10`, `bg-violet-500/10`, `bg-emerald-500/…`) | lighten to `-400` (e.g. `text-amber-700` → `text-amber-400`) — the tint/ring backgrounds themselves are unchanged, only the text needs to lighten for legibility on a dark app background | `TopBar.tsx`, `HomeView.tsx` |
| Solid pastel badge (`bg-amber-100 text-amber-700`, the DEV badge) | translucent-chip pattern matching the rest of the file: `bg-amber-500/20 text-amber-300` | `TopBar.tsx` |

Do not touch: solid-fill buttons where a light/white text sits on a saturated color background (e.g. `bg-blue-600 text-white`, `bg-emerald-600 text-white`, `bg-amber-500 text-black`) — those already have correct contrast regardless of theme and need no change. Do not touch any `useState`/`useEffect`/prop/handler — this is a styling-only stage.

---

## File structure

- Modify: `src/renderer/src/AppShell.tsx` — one line, the root shell wrapper's background/text color.
- Create: `src/renderer/src/IconButton.tsx` — new shared icon-only button primitive (per the Foundation spec's deferred plan).
- Modify: `src/renderer/src/TopBar.tsx` — full color migration, adopts `IconButton` for the help button.
- Modify: `src/renderer/src/NavMenu.tsx` — full color migration.
- Modify: `src/renderer/src/OnboardingHelp.tsx` — full color migration (small file, directly triggered from TopBar).
- Modify: `src/renderer/src/HomeView.tsx` — full color migration, adopts the shared `.card-interactive` class for the action-card grid.

`BrandMark.tsx` (the logo) is explicitly **not** touched — it's already its own navy-branded mark, independent of the app chrome theme, and out of scope for this stage.

---

### Task 1: `AppShell.tsx` root wrapper

**Files:**
- Modify: `src/renderer/src/AppShell.tsx:160`

**Why this is in scope for "TopBar + Home":** this single div is the direct shared parent of both `TopBar` and `HomeView` (and every other view). It currently paints `bg-[#e9ecf1]` (light gray) over the entire app, which is why the Foundation stage's `body { background: #0b0f1a }` change was invisible everywhere — this wrapper sits on top of `body` and covers it completely. Not fixing this one line would leave a light-gray flash/gap visible around/behind the newly-dark TopBar and Home screen.

- [ ] **Step 1: Change the wrapper's classes**

Find (line 160):

```tsx
      <div className="flex h-screen flex-col overflow-hidden bg-[#e9ecf1] text-slate-900">
```

Replace with:

```tsx
      <div className="flex h-screen flex-col overflow-hidden bg-app text-content-primary">
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck` (NOT `npx tsc --noEmit -p .` — that command is a near no-op in this repo, see the note in Step 3 below) and `npm test`.
Expected: no errors, 410/410 tests pass (this is a pure className change, no test should be affected).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/AppShell.tsx
git commit -m "feat(theme): dark-palette AppShell root wrapper"
```

**Note for every task's verification step in this plan:** always use `npm run typecheck` (or `npm run typecheck:node`/`npm run typecheck:web` individually). Do NOT use `npx tsc --noEmit -p .` — the root `tsconfig.json` has `"files": []` and only resolves the node/web project references in `--build` mode, so that command silently checks nothing and will falsely report "clean" even with real type errors present. This was discovered and documented mid-session on 2026-08-17; every verification step below assumes the correct command.

---

### Task 2: `IconButton.tsx` — new shared primitive

**Files:**
- Create: `src/renderer/src/IconButton.tsx`

**Why:** the Foundation design spec explicitly deferred this component: "`IconButton.tsx` — icon-only button with consistent hover/press feedback, still worth a small dedicated component since no existing class covers it. Added when the first per-screen stage that needs it starts." `TopBar.tsx`'s "?" help button (Task 3 below) is exactly that first case — currently a one-off hand-styled `<button>` with no shared class backing it.

- [ ] **Step 1: Create the component**

Create `src/renderer/src/IconButton.tsx`:

```tsx
import type { ComponentType, ButtonHTMLAttributes } from 'react'
import { cn } from './ui/cn'

type IconType = ComponentType<{ size?: number | string; className?: string }>

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconType
  size?: number
}

// Icon-only button with the shared hover/press treatment. No existing .btn*
// class in main.css covers a bare icon-only square button, so this is a
// small dedicated primitive rather than a one-off style per call site —
// see the 2026-08-11 visual-redesign design spec's Section 2. First
// consumer: TopBar's "?" help button.
function IconButton({ icon: Icon, size = 15, className, ...rest }: IconButtonProps): JSX.Element {
  return (
    <button
      className={cn(
        'flex items-center justify-center rounded-lg border border-border bg-panel p-1.5 text-content-secondary transition-colors hover:bg-panel-raised hover:text-content-primary',
        className
      )}
      {...rest}
    >
      <Icon size={size} />
    </button>
  )
}

export default IconButton
```

No test file — this is a presentational component with no logic beyond prop passthrough, consistent with this codebase's established convention (confirmed during the Foundation stage's code-quality review: no other `.tsx` component in this codebase has a component-level test; renderer tests are all pure-logic-module tests).

- [ ] **Step 2: Verify**

Run: `npm run typecheck`.
Expected: no errors. (No consumer exists yet — that's Task 3.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/IconButton.tsx
git commit -m "feat: add IconButton shared primitive"
```

---

### Task 3: `TopBar.tsx` full color migration

**Files:**
- Modify: `src/renderer/src/TopBar.tsx`

Read the current file yourself first to confirm it still matches (it was last touched by the Batch 2 Stage-Rehearsal-badge and onboarding-help work, both already merged — no changes since). Apply the conversion rules table above. The full target file content:

```tsx
import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { Home, Play, ListMusic, Music, Megaphone, BookOpen, Video, Image as ImageIcon, User, Monitor, Palette, Tablet, Stethoscope, Camera, HelpCircle } from 'lucide-react'
import type { AppInfo, ObsStatus, ZoneId } from '../../shared/types'
import { ZONE_IDS, ZONE_NAMES } from '../../shared/types'
import type { View } from './AppShell'
import BrandMark from './BrandMark'
import IconButton from './IconButton'
import NavMenu from './NavMenu'
import type { NavMenuItem } from './NavMenu'
import OnboardingHelp from './OnboardingHelp'

type IconType = ComponentType<{ size?: number | string; className?: string }>

function elapsed(startedAt: number | null, now: number): string {
  if (!startedAt) return '0:00'
  const s = Math.max(0, Math.floor((now - startedAt) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`
}

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
  { id: 'roomfeed', Icon: Camera, label: 'Room feed' },
  { id: 'diagnostics', Icon: Stethoscope, label: 'Diagnostics & backups' }
]

function TopBar({ view, setView }: { view: View; setView: (v: View) => void }): JSX.Element {
  const [outputs, setOutputs] = useState(0)
  const [zonesConnected, setZonesConnected] = useState<ZoneId[]>([])
  const [build, setBuild] = useState<{ version: string; isPackaged: boolean } | null>(null)
  const [obs, setObs] = useState<ObsStatus | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [rehearsal, setRehearsal] = useState(false)
  const [updateReady, setUpdateReady] = useState(false)
  const [stageRehearsalActive, setStageRehearsalActive] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  useEffect(() => {
    window.wf.settingGet('has_seen_onboarding').then((v) => {
      if (v !== '1') {
        setHelpOpen(true)
        void window.wf.settingSet('has_seen_onboarding', '1')
      }
    })
  }, [])
  useEffect(() => {
    const load = (): void => {
      window.wf.getInfo().then((i: AppInfo) => {
        setOutputs(i.outputs)
        setZonesConnected(i.zonesConnected)
        setBuild({ version: i.appVersion, isPackaged: i.isPackaged })
      })
    }
    load()
    const t = setInterval(load, 2000)
    window.wf.obsGetStatus().then(setObs)
    const off = window.wf.obsOnStatus(setObs)
    window.wf.getRehearsalMode().then(setRehearsal)
    const offUpdate = window.wf.onUpdateReady(() => setUpdateReady(true))
    window.wf.getStageRehearsal().then((s) => setStageRehearsalActive(s.active))
    const offStageRehearsal = window.wf.onState((s) => setStageRehearsalActive(s.stageRehearsal.active))
    return () => { clearInterval(t); off(); offUpdate(); offStageRehearsal() }
  }, [])

  const toggleRehearsal = (): void => {
    const next = !rehearsal
    setRehearsal(next)
    void window.wf.setRehearsalMode(next)
  }

  const screenCount = outputs + zonesConnected.length
  const missingZoneNames = ZONE_IDS.filter((id) => !zonesConnected.includes(id)).map((id) => ZONE_NAMES[id])

  const onAir = Boolean(obs?.streaming || obs?.recording)
  useEffect(() => {
    if (!onAir) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [onAir])

  return (
    <header className="flex flex-shrink-0 items-center gap-1 border-b border-border bg-panel px-3 py-2">
      <div className="mr-3 flex flex-shrink-0 items-center gap-2">
        <BrandMark size={26} className="flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-medium leading-tight text-content-primary">
            WorshipFlow <span className="font-normal text-content-secondary">Pro</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] leading-tight text-content-secondary">
            <span>v{build?.version ?? '…'}</span>
            {build && !build.isPackaged && (
              <span className="rounded bg-amber-500/20 px-1 font-bold text-amber-300">DEV</span>
            )}
            {updateReady && (
              <button
                onClick={() => window.wf.updateInstallNow()}
                title="A new version has finished downloading — click to restart and install it"
                className="rounded bg-emerald-600 px-1.5 py-0.5 font-bold text-white hover:bg-emerald-700"
              >
                Restart to update
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Named so tests and screen readers can address this nav specifically —
          the app-wide bottom drawer renders its own buttons with the same
          labels as some of these destinations. */}
      <nav aria-label="Main" className="flex min-w-0 flex-1 items-center gap-1">
        {PRIMARY_ITEMS.map(({ id, Icon, label }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              view === id
                ? 'bg-blue-600 font-medium text-white'
                : 'font-normal text-content-secondary hover:bg-panel-raised hover:text-content-primary'
            }`}
          >
            <Icon size={15} className="flex-shrink-0" />
            {label}
          </button>
        ))}
        <NavMenu label="Library" items={LIBRARY_ITEMS} activeId={view} onSelect={setView} />
        <NavMenu label="Setup" items={SETUP_ITEMS} activeId={view} onSelect={setView} />
      </nav>

      <div className="flex flex-shrink-0 items-center gap-2">
        <button
          onClick={toggleRehearsal}
          title={rehearsal ? 'Rehearsing — real outputs show nothing. Click to disarm.' : 'Arm rehearsal mode — real outputs will show nothing while you practice'}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
            rehearsal ? 'bg-amber-500 text-black' : 'bg-panel-raised text-content-secondary hover:bg-border-strong'
          }`}
        >
          {rehearsal ? 'Rehearsing' : 'Rehearsal'}
        </button>

        {stageRehearsalActive && (
          <button
            onClick={() => setView('live')}
            title="Stage Rehearsal is armed — Zone 4 is looping the rehearsal song, Zones 1-3 are looping announcements. Click to go manage it."
            className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-1.5 ring-1 ring-violet-500/30 hover:bg-violet-500/20"
          >
            <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-violet-500" />
            <span className="text-xs font-bold uppercase tracking-wide text-violet-400">
              Stage Rehearsal active
            </span>
          </button>
        )}

        {rehearsal ? (
          <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 ring-1 ring-amber-500/30" title="Rehearsal mode is armed — real outputs are showing nothing, regardless of what's happening here">
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
            <span className="text-xs font-bold uppercase tracking-wide text-amber-400">
              Outputs held back
            </span>
          </div>
        ) : screenCount > 0 ? (
          <div
            className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 ring-1 ring-red-500/30"
            title={missingZoneNames.length > 0
              ? `Real screens are connected — anything sent live reaches the congregation. Not connected: ${missingZoneNames.join(', ')}.`
              : 'Real screens are connected — anything sent live reaches the congregation'}
          >
            <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-red-500" />
            <span className="text-xs font-bold uppercase tracking-wide text-red-400">
              Live armed · {screenCount} screen{screenCount !== 1 ? 's' : ''}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-400" />
            <span className="text-xs text-content-secondary">No output</span>
            <button
              onClick={() => window.wf.outputOpen()}
              className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Open on projector
            </button>
          </div>
        )}

        {onAir && (
          <>
            {obs?.streaming && (
              <div className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-1">
                <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-red-500" />
                <span className="text-xs font-bold uppercase tracking-wide text-red-400">Live</span>
                <span className="font-mono text-xs tabular-nums text-red-400">{elapsed(obs.streamStartedAt, now)}</span>
              </div>
            )}
            {obs?.recording && (
              <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1">
                <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-amber-500" />
                <span className="text-xs font-bold uppercase tracking-wide text-amber-400">Rec</span>
                <span className="font-mono text-xs tabular-nums text-amber-400">{elapsed(obs.recordStartedAt, now)}</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="ml-2 flex flex-shrink-0 items-center border-l border-border pl-3">
        <button
          onClick={() => setView('volunteer')}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
            view === 'volunteer'
              ? 'border-blue-600 bg-blue-600 text-white'
              : 'border-border bg-panel text-content-secondary hover:bg-panel-raised'
          }`}
        >
          <User size={15} className="flex-shrink-0" />
          Volunteer mode
        </button>
        <IconButton
          icon={HelpCircle}
          onClick={() => setHelpOpen(true)}
          title="Quick start help"
          className="ml-1.5"
        />
      </div>
      {helpOpen && (
        <OnboardingHelp
          onClose={() => setHelpOpen(false)}
          onGoToVolunteer={() => { setView('volunteer'); setHelpOpen(false) }}
        />
      )}
    </header>
  )
}

export default TopBar
```

**What changed vs. the current file, summarized** (so you can sanity-check your diff): header bg/border, brand text colors, DEV badge (solid pastel → translucent chip), inactive primary-nav-button colors, Rehearsal-toggle inactive-state colors, Stage-Rehearsal-badge text (`-700`→`-400`), Outputs-held-back/Live-armed/onAir-Live/onAir-Rec badge text (`-700`→`-400`), "No output" label color, the bottom-right group's border/Volunteer-button-inactive colors, and the help button swapped from a hand-styled `<button>` to `<IconButton icon={HelpCircle} .../>`. Every `useState`, `useEffect`, handler, and prop is byte-identical to the current file — verify this yourself in your diff.

- [ ] **Step 1: Apply the file content above.**

- [ ] **Step 2: Verify**

Run: `npm run typecheck` and `npm test`.
Expected: no errors, 410/410 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/TopBar.tsx
git commit -m "feat(theme): dark-palette TopBar, adopt IconButton for the help button"
```

---

### Task 4: `NavMenu.tsx` full color migration

**Files:**
- Modify: `src/renderer/src/NavMenu.tsx`

Read the current file yourself first. Apply the conversion rules. Full target content:

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
    const onMouseDown = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) dispatch({ type: 'close' })
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
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
    // Focus the trigger BEFORE closing: Tab's default action resolves against
    // whatever is focused right now, and the item under focus is about to be
    // unmounted — leaving focus to fall back to <body> instead of moving on.
    else if (e.key === 'Tab') { triggerRef.current?.focus(); dispatch({ type: 'close' }) }
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
            : 'font-normal text-content-secondary hover:bg-panel-raised hover:text-content-primary'
        }`}
      >
        {label}
        <ChevronDown size={14} className="flex-shrink-0" />
      </button>

      {state.open && (
        <div
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          className="absolute left-0 top-full z-50 mt-1 min-w-[13rem] rounded-lg border border-border bg-panel-raised py-1 shadow-lg"
        >
          {items.map((item, i) => (
            <button
              key={item.id}
              ref={(el) => { itemRefs.current[i] = el }}
              role="menuitem"
              onClick={() => choose(item.id)}
              onMouseEnter={() => dispatch({ type: 'highlight', index: i })}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                item.id === activeId ? 'font-medium text-blue-400' : 'text-content-primary'
              } ${state.highlighted === i ? 'bg-panel' : 'hover:bg-panel'}`}
            >
              <item.Icon size={15} className="flex-shrink-0 text-content-secondary" />
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

**What changed:** trigger-button inactive-state colors, dropdown panel bg/border (`bg-panel-raised` — one tier lighter than the header it pops out of, matching the Foundation token model's elevation convention), menu-item active/default text color and hover/highlight background (`bg-panel` — deliberately one tier *darker* than the dropdown's own `bg-panel-raised`, since `panel-raised` is already the lightest neutral tier defined; an inset/pressed look reads clearly as "hovered" without needing a 4th tier). No logic changes — every `useReducer`/`useRef`/`useEffect`/handler is untouched.

- [ ] **Step 1: Apply the file content above.**

- [ ] **Step 2: Verify**

Run: `npm run typecheck` and `npm test`.
Expected: no errors, 410/410 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/NavMenu.tsx
git commit -m "feat(theme): dark-palette NavMenu dropdown"
```

---

### Task 5: `OnboardingHelp.tsx` full color migration

**Files:**
- Modify: `src/renderer/src/OnboardingHelp.tsx`

Small file, directly triggered from `TopBar`'s help button — included in this stage for visual cohesion. Full target content:

```tsx
import { X } from 'lucide-react'
import Modal from './Modal'

interface OnboardingHelpProps {
  onClose: () => void
  onGoToVolunteer: () => void
}

// First-run overlay + on-demand help (via TopBar's "?" button). Explains the
// three modes an unfamiliar operator will actually touch, and the one thing
// that trips people up most: Volunteer Mode only works once someone else has
// already built the service — see the 2026-08-16 audit finding this exists
// to close (no onboarding/help surface existed anywhere in the app before).
// Built on Modal (not a hand-rolled overlay) so it gets the same
// Escape-to-close/focus-trap/aria-dialog behavior every other dialog in the
// app already has — this being the one dialog aimed at an unfamiliar
// operator is exactly the wrong place to skip that.
function OnboardingHelp({ onClose, onGoToVolunteer }: OnboardingHelpProps): JSX.Element {
  return (
    <Modal onClose={onClose} label="Quick start" className="w-full max-w-md rounded-2xl bg-panel p-5 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-content-primary">Quick start</h2>
        <button onClick={onClose} className="rounded p-1 text-content-tertiary hover:bg-panel-raised hover:text-content-secondary">
          <X size={16} />
        </button>
      </div>

      <div className="space-y-3 text-sm text-content-secondary">
        <p>
          Every screen shows one of three things: <strong>Lyrics</strong> (whatever slide is live —
          a song, sermon point, or announcement), <strong>Logo</strong> (the church logo, for
          between-service quiet), or <strong>Black</strong> (nothing at all).
        </p>
        <p>
          A service has to already be built — songs, sermon, announcements added in order — before
          anyone can run it live. If you&rsquo;re filling in and unsure what to do, use{' '}
          <strong>Volunteer Mode</strong>: it only shows Prev/Next and the Black/Logo/Lyrics buttons,
          and it needs someone else to have built the service first.
        </p>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium text-content-secondary hover:bg-panel-raised">
          Close
        </button>
        <button
          onClick={onGoToVolunteer}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Take me to Volunteer Mode
        </button>
      </div>
    </Modal>
  )
}

export default OnboardingHelp
```

**What changed:** the modal panel background, heading/body text colors, the X button and Close button colors. The "Take me to Volunteer Mode" button (`bg-blue-600 text-white`) is unchanged — already correct.

- [ ] **Step 1: Apply the file content above.**

- [ ] **Step 2: Verify**

Run: `npm run typecheck` and `npm test`.
Expected: no errors, 410/410 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/OnboardingHelp.tsx
git commit -m "feat(theme): dark-palette OnboardingHelp modal"
```

---

### Task 6: `HomeView.tsx` full color migration, adopt `.card-interactive`

**Files:**
- Modify: `src/renderer/src/HomeView.tsx`

Read the current file yourself first. Apply the conversion rules, and replace the hand-styled action-card grid with the shared `.card-interactive` class from `main.css` (Foundation stage) instead of just recoloring its raw utilities in place — this is the one place in this stage where the design spec's "replaced with primitives, not just re-colored" instruction applies concretely. Full target content:

```tsx
import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { Play, LayoutGrid, MonitorSpeaker, ListMusic, Music, BookOpen, User, Check, TriangleAlert } from 'lucide-react'
import type { View } from './AppShell'
import type { AppInfo, ObsStatus, ZoneId } from '../../shared/types'
import { ZONE_IDS, ZONE_NAMES } from '../../shared/types'
import { useService } from './ServiceContext'
import BrandMark from './BrandMark'

type IconType = ComponentType<{ size?: number | string; className?: string }>

const CARDS: { view?: View; action?: string; Icon: IconType; label: string; sub: string }[] = [
  { action: 'multiview', Icon: LayoutGrid,     label: 'Zone screens',   sub: 'Open all 4 TVs' },
  { action: 'stage',     Icon: MonitorSpeaker, label: 'Stage monitor',  sub: 'Open stage display' },
  { view: 'service',     Icon: ListMusic,      label: 'Build service',  sub: 'Songs, slides, scripture' },
  { view: 'songs',       Icon: Music,          label: 'Song library',   sub: 'Upload & manage songs' },
  { view: 'scripture',   Icon: BookOpen,       label: 'Scripture',      sub: 'Look up Bible verses' },
  { view: 'volunteer',   Icon: User,           label: 'Volunteer mode', sub: 'Simple touch screen' },
]

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// A row's status. 'ok' and 'warn' are opinions ("this probably needs
// attention before Sunday"); 'info' is neutral — not every church streams
// every service, so no OBS connection isn't itself a problem.
type PreflightLevel = 'ok' | 'warn' | 'info'

function HomeView({ setView }: { setView: (v: View) => void }): JSX.Element {
  const { activeService } = useService()
  const [outputs, setOutputs] = useState(0)
  const [zonesConnected, setZonesConnected] = useState<ZoneId[]>([])
  const [rehearsal, setRehearsal] = useState(false)
  const [obs, setObs] = useState<ObsStatus | null>(null)

  // Startup preflight: the app used to say "Ready when you are" unconditionally,
  // with no way to tell whether outputs are actually connected, rehearsal mode
  // was left armed, or a service is even loaded. This surfaces that state
  // up front instead of leaving the operator to discover it live.
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

  const checks: { level: PreflightLevel; label: string }[] = [
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
  const needsAttention = checks.some((c) => c.level === 'warn')

  const handle = (card: typeof CARDS[0]): void => {
    if (card.view) setView(card.view)
    else if (card.action === 'multiview') window.wf.multiviewOpen()
    else if (card.action === 'stage') window.wf.stageOpen()
  }

  return (
    <div className="h-full overflow-auto bg-app p-6">
      <div className="mb-5 flex items-center gap-3">
        <BrandMark size={40} className="flex-shrink-0 rounded-[9px] shadow-sm" />
        <h1 className="flex items-baseline gap-1.5">
          <span className="text-2xl font-extrabold tracking-tight text-content-primary">WorshipFlow</span>
          <span className="text-base font-bold tracking-wide text-blue-400">PRO</span>
        </h1>
      </div>
      <div className="mb-1 text-xl font-semibold text-content-primary">{greeting()}</div>
      <div className="mb-3 text-sm text-content-secondary">
        {needsAttention ? 'A few things to check before you go live' : 'Ready when you are'}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {checks.map((c, i) => (
          <div
            key={i}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium ${
              c.level === 'warn'
                ? 'border-amber-500/30 bg-amber-500/[0.08] text-amber-400'
                : c.level === 'ok'
                ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400'
                : 'border-border bg-panel text-content-secondary'
            }`}
          >
            {c.level === 'warn' ? <TriangleAlert size={13} className="shrink-0" /> : c.level === 'ok' ? <Check size={13} className="shrink-0" /> : null}
            <span className="truncate">{c.label}</span>
          </div>
        ))}
      </div>

      <button
        onClick={() => setView('live')}
        className="mb-4 flex w-full items-center gap-4 rounded-xl border border-blue-500/30 bg-blue-500/[0.10] px-5 py-4 text-left transition-colors hover:bg-blue-500/[0.16]"
      >
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
          <Play size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-content-primary">Go live</div>
          <div className="truncate text-sm text-content-secondary">
            {activeService
              ? `${activeService.name} — ${activeService.items.length} item${activeService.items.length !== 1 ? 's' : ''} loaded`
              : 'Open live control'}
          </div>
        </div>
        <div className="flex-shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Start</div>
      </button>

      <div className="grid grid-cols-3 gap-3">
        {CARDS.map((card) => (
          <button key={card.label} onClick={() => handle(card)} className="card-interactive flex flex-col text-left">
            <card.Icon size={20} className="mb-2.5 text-content-secondary" />
            <div className="text-sm font-medium text-content-primary">{card.label}</div>
            <div className="text-xs text-content-secondary">{card.sub}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default HomeView
```

**What changed:** page background, brand/greeting/subtext colors, the four preflight-check pills' warn/ok/info colors, the "Go live" CTA's icon-circle text color, and — the one structural change in this stage — the `CARDS.map` action-card buttons dropped their hand-rolled `rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50` in favor of the shared `card-interactive` class (which already supplies `rounded-lg border p-3 cursor-pointer transition-all` plus the dark bg/border/hover-border-blue colors from `main.css`) alongside only the layout-specific `flex flex-col text-left` that class doesn't cover. **This is a deliberate minor visual-size change** (the cards go from `rounded-xl`/`p-4` to `rounded-lg`/`p-3`, matching every other interactive card in the app instead of this screen's own one-off sizing) — call this out explicitly when reviewing, it's intentional standardization per the design spec, not a mistake.

- [ ] **Step 1: Apply the file content above.**

- [ ] **Step 2: Verify**

Run: `npm run typecheck` and `npm test`.
Expected: no errors, 410/410 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/HomeView.tsx
git commit -m "feat(theme): dark-palette HomeView, adopt card-interactive for the action grid"
```

---

### Task 7: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Typecheck, lint, test**

Run: `npm run typecheck` (both node and web projects), `npm run lint`, `npm test`.
Expected: typecheck clean, lint 0 errors (pre-existing warnings in unrelated files are fine, don't fix them here), 410/410 tests pass.

- [ ] **Step 2: Build and visually verify in the running app**

Run `npm run pack:dir`, then either launch the built `.exe` directly (close it when done — don't leave it running on the user's screen) or, more reliably given this codebase's `browserWfMock.ts` renderer-only mock, serve `out/renderer` and view it in a browser (the Foundation stage established this pattern: use the project's `.claude/launch.json` "worshipflow" config with `npm run dev`, or a static server pointed at `out/renderer` — verify the exact approach that worked before reaching for a new one).

Confirm in the running app:
- Home screen: dark navy background, brand mark visible, greeting/subtext legible, all four preflight pills legible with correct warn(amber)/ok(emerald)/info(neutral) coloring, the "Go live" CTA reads clearly, all 6 action cards are dark panels with visible borders and readable text — hover one and confirm the border highlights blue.
- TopBar: dark panel header, active Home/Live/Build-service nav item shows blue fill, inactive items are legible against the dark header and highlight on hover, the Library/Setup dropdowns open as dark panels with legible items (open one, confirm items highlight on hover/keyboard-navigate), the Rehearsal toggle and Volunteer-mode button read correctly in both states, the "?" help button opens the dark-themed Quick Start modal.
- Arm Rehearsal Mode from the TopBar toggle and confirm the amber "Outputs held back" badge is legible (amber-400 text, not the old amber-700 that would have been unreadably dark-on-dark).
- Nothing is broken, misaligned, or illegible anywhere on either screen.

- [ ] **Step 3: Report status**

If everything in Step 2 looks right, this stage is done. The next stage per the design spec's rollout order is the Live tab (`LiveView.tsx`, `LiveTools.tsx`, `SlideGrid.tsx`, `StageRehearsalTools.tsx`, `ZonePanel.tsx`/`ZoneLiveGrid.tsx`) — write that as its own plan when it starts, for the same reason the Foundation stage deferred writing it: it depends on seeing how this stage actually looks/feels in the running app first, and TopBar+Home stays in view (and must keep working) throughout every later stage since it's the app-wide shell.

---

## Self-Review

**Spec coverage:** All five files the design spec's rollout order names for this stage (`TopBar.tsx`, `HomeView.tsx`, and their direct dependencies `NavMenu.tsx`/`OnboardingHelp.tsx`/`AppShell.tsx`'s wrapper) are covered. `BrandMark.tsx` is explicitly out of scope (already its own navy brand mark, spec doesn't call for touching it). The spec's "replaced with primitives, not just re-colored" instruction is satisfied concretely via `IconButton.tsx` (new) and `.card-interactive` adoption in `HomeView.tsx` — not just a global find-replace of hex-adjacent class names.

**Placeholder scan:** Every task gives the complete target file content (not a diff description) plus an explicit "what changed" summary so a reviewer can verify nothing besides className strings moved. No TBDs.

**Type consistency:** `IconButton`'s props (`icon`, `size`, plus passthrough `ButtonHTMLAttributes`) match exactly how `TopBar.tsx` invokes it (`icon={HelpCircle} onClick={...} title="..." className="ml-1.5"`). No other file's exported types/signatures change in this stage.
