# Top Bar Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace WorshipFlow's left `Sidebar` with a horizontal `TopBar` — brand far left, all 8 nav destinations as flat tabs, a status cluster (live-output + OBS on-air) and a set-apart Volunteer button far right — with zero change to any screen's content.

**Architecture:** `TopBar.tsx` is a near-1:1 restructure of `Sidebar.tsx`'s existing state/hooks/data (output polling, OBS status polling, the `elapsed()` timer helper) into a horizontal `<header>` instead of a vertical `<aside>`. `AppShell.tsx` swaps the component and flips its outer container from a row (`Sidebar` beside a content column) to a column (`TopBar` above a content row) — the content switch itself (`view === 'live' ? ... : ...`) is untouched. `Sidebar.tsx` is deleted once nothing references it.

**Tech Stack:** Electron (renderer), TypeScript, React 18, Tailwind v3, lucide-react.

---

## File Structure

**Create:**
- `src/renderer/src/TopBar.tsx` — the new navigation chrome.

**Modify:**
- `src/renderer/src/AppShell.tsx` — swap `Sidebar` for `TopBar`; flip the outer flex container from row to column.

**Delete:**
- `src/renderer/src/Sidebar.tsx` — fully replaced; no remaining callers after Task 2.

**Not touched:** every view component (`HomeView`, `LiveView`, `ServiceRail`, `ServiceBuilder`, `SongLibrary`, `AnnouncementsLibrary`, `ScriptureLookup`, `SoundCheckTab`, `LogoSettings`, `VolunteerView`) and everything inside them, including the Live-tab bottom drawer shipped 2026-07-22.

---

## Task 1: Create `TopBar.tsx`

**Files:**
- Create: `src/renderer/src/TopBar.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/src/TopBar.tsx`. This carries `Sidebar.tsx`'s existing state, polling, and `elapsed()` helper over unchanged — only the JSX layout changes, from a vertical rail to a horizontal bar. The 8 nav destinations are data-driven (`NAV_ITEMS`) instead of individually written `nav()` calls, since a flat row reads more naturally that way than the sidebar's grouped-with-headers version. "Zone screens" / "Stage monitor" are intentionally NOT included (dropped per the spec — they're still reachable via `HomeView`'s cards). The nav row gets its own `overflow-x-auto` so a narrower window scrolls the tabs rather than breaking the layout; the brand and the right-hand status/Volunteer cluster stay pinned.

```tsx
import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { Home, Play, ListMusic, Music, Megaphone, BookOpen, Mic, Image as ImageIcon, User } from 'lucide-react'
import type { AppInfo, ObsStatus } from '../../shared/types'
import type { View } from './AppShell'
import BrandMark from './BrandMark'

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

const NAV_ITEMS: { id: View; Icon: IconType; label: string }[] = [
  { id: 'home', Icon: Home, label: 'Home' },
  { id: 'live', Icon: Play, label: 'Live' },
  { id: 'service', Icon: ListMusic, label: 'Build Service' },
  { id: 'songs', Icon: Music, label: 'Songs' },
  { id: 'announcements', Icon: Megaphone, label: 'Announcements' },
  { id: 'scripture', Icon: BookOpen, label: 'Scripture' },
  { id: 'soundcheck', Icon: Mic, label: 'Sound Check' },
  { id: 'settings', Icon: ImageIcon, label: 'Logo & BG' }
]

function TopBar({ view, setView }: { view: View; setView: (v: View) => void }): JSX.Element {
  const [outputs, setOutputs] = useState(0)
  const [build, setBuild] = useState<{ version: string; isPackaged: boolean } | null>(null)
  const [obs, setObs] = useState<ObsStatus | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const load = (): void => {
      window.wf.getInfo().then((i: AppInfo) => {
        setOutputs(i.outputs)
        setBuild({ version: i.appVersion, isPackaged: i.isPackaged })
      })
    }
    load()
    const t = setInterval(load, 2000)
    window.wf.obsGetStatus().then(setObs)
    const off = window.wf.obsOnStatus(setObs)
    return () => { clearInterval(t); off() }
  }, [])

  const onAir = Boolean(obs?.streaming || obs?.recording)
  useEffect(() => {
    if (!onAir) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [onAir])

  return (
    <header className="flex flex-shrink-0 items-center gap-1 border-b border-slate-200 bg-[#f4f6f9] px-3 py-2">
      <div className="mr-3 flex flex-shrink-0 items-center gap-2">
        <BrandMark size={26} className="flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-medium leading-tight text-slate-900">
            WorshipFlow <span className="font-normal text-slate-500">Pro</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] leading-tight text-slate-500">
            <span>v{build?.version ?? '…'}</span>
            {build && !build.isPackaged && (
              <span className="rounded bg-amber-100 px-1 font-bold text-amber-700">DEV</span>
            )}
          </div>
        </div>
      </div>

      <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {NAV_ITEMS.map(({ id, Icon, label }) => (
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
      </nav>

      <div className="flex flex-shrink-0 items-center gap-2">
        {outputs > 0 ? (
          <div className="flex items-center gap-1.5 rounded-lg bg-blue-500/10 px-3 py-1.5">
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
            <span className="text-xs font-semibold text-blue-700">
              {outputs} screen{outputs !== 1 ? 's' : ''} live
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-400" />
            <span className="text-xs text-slate-500">No output</span>
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
                <span className="text-xs font-bold uppercase tracking-wide text-red-700">Live</span>
                <span className="font-mono text-xs tabular-nums text-red-700">{elapsed(obs.streamStartedAt, now)}</span>
              </div>
            )}
            {obs?.recording && (
              <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1">
                <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-amber-500" />
                <span className="text-xs font-bold uppercase tracking-wide text-amber-700">Rec</span>
                <span className="font-mono text-xs tabular-nums text-amber-700">{elapsed(obs.recordStartedAt, now)}</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="ml-2 flex flex-shrink-0 items-center border-l border-slate-200 pl-3">
        <button
          onClick={() => setView('volunteer')}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
            view === 'volunteer'
              ? 'border-blue-600 bg-blue-600 text-white'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <User size={15} className="flex-shrink-0" />
          Volunteer mode
        </button>
      </div>
    </header>
  )
}

export default TopBar
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS. (Nothing imports `TopBar` yet, so it exists but isn't used — that's fine, this file alone must still typecheck cleanly against `ObsStatus`/`AppInfo`/`View`.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/TopBar.tsx
git commit -m "feat(nav): TopBar component (horizontal nav, not yet wired in)"
```

---

## Task 2: Wire `TopBar` into `AppShell`

**Files:**
- Modify: `src/renderer/src/AppShell.tsx`

- [ ] **Step 1: Swap the import and the component, flip row→column**

Replace the full contents of `src/renderer/src/AppShell.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { ServiceProvider } from './ServiceContext'
import TopBar from './TopBar'
import ServiceRail from './ServiceRail'
import HomeView from './HomeView'
import LiveView from './LiveView'
import ServiceBuilder from './ServiceBuilder'
import SongLibrary from './SongLibrary'
import AnnouncementsLibrary from './AnnouncementsLibrary'
import ScriptureLookup from './ScriptureLookup'
import VolunteerView from './VolunteerView'
import LogoSettings from './LogoSettings'
import SoundCheckTab from './sound-check/SoundCheckTab'
import NotifyToasts from './NotifyToasts'

export type View = 'home' | 'live' | 'service' | 'songs' | 'announcements' | 'scripture' | 'volunteer' | 'settings' | 'soundcheck'

function AppShell(): JSX.Element {
  const [view, setView] = useState<View>('home')

  // Global keyboard shortcuts for live control (available from any tab)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Don't intercept while typing in a field
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      // Ignore if modifier keys are held (avoid interfering with app shortcuts)
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const key = e.key.toLowerCase()

      // B = black screen
      if (key === 'b') {
        e.preventDefault()
        window.wf.sendIntent('black')
        return
      }

      // L = logo screen
      if (key === 'l') {
        e.preventDefault()
        window.wf.sendIntent('logo')
        return
      }

      // N = next slide/item
      if (key === 'n') {
        e.preventDefault()
        window.wf.sendIntent('next')
        return
      }

      // P = previous slide/item
      if (key === 'p') {
        e.preventDefault()
        window.wf.sendIntent('prev')
        return
      }

      // S = toggle lyrics/slides display
      if (key === 's') {
        e.preventDefault()
        window.wf.sendIntent('lyrics')
        return
      }

      // Space or ArrowRight = next slide
      if (key === ' ' || key === 'arrowright') {
        e.preventDefault()
        window.wf.sendIntent('next')
        return
      }

      // ArrowLeft = previous slide
      if (key === 'arrowleft') {
        e.preventDefault()
        window.wf.sendIntent('prev')
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Restore recovery state after renderer is ready and activeServiceItems is populated
  useEffect(() => {
    window.wf.restoreRecovery().catch(err => {
      console.error('Failed to restore recovery state:', err)
    })
  }, [])

  if (view === 'volunteer') {
    return (
      <ServiceProvider>
        <NotifyToasts />
        <VolunteerView onExit={() => setView('home')} />
      </ServiceProvider>
    )
  }
  return (
    <ServiceProvider>
      <NotifyToasts />
      <div className="flex h-screen flex-col overflow-hidden bg-[#e9ecf1] text-slate-900">
        <TopBar view={view} setView={setView} />
        <div className="flex min-h-0 flex-1 flex-col">
          {view === 'home' ? (
            <HomeView setView={setView} />
          ) : view === 'live' ? (
            <div className="flex min-h-0 flex-1">
              <ServiceRail />
              <main className="min-h-0 flex-1 overflow-hidden"><LiveView /></main>
            </div>
          ) : view === 'service' ? (
            <ServiceBuilder />
          ) : view === 'songs' ? (
            <SongLibrary />
          ) : view === 'announcements' ? (
            <AnnouncementsLibrary />
          ) : view === 'soundcheck' ? (
            <SoundCheckTab />
          ) : view === 'settings' ? (
            <LogoSettings />
          ) : (
            <ScriptureLookup />
          )}
        </div>
      </div>
    </ServiceProvider>
  )
}

export default AppShell
```

The only real changes from the current file: the import (`Sidebar` → `TopBar`), the outer container's `flex-row` → `flex-col`, `<Sidebar .../>` → `<TopBar .../>`, and the inner content wrapper's `min-w-0 flex-1 flex-col` → `min-h-0 flex-1 flex-col` (the correct flex-axis constraint now that it's stacked under a header instead of beside a rail — same `min-h-0` idiom already used one level down for `view === 'live'`'s row). Everything else — the keyboard handler, the recovery-restore effect, the `view === 'volunteer'` early-return, and the entire content switch — is byte-for-byte unchanged.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/AppShell.tsx
git commit -m "feat(nav): wire TopBar into AppShell, flip shell to a column layout"
```

---

## Task 3: Delete `Sidebar.tsx`

**Files:**
- Delete: `src/renderer/src/Sidebar.tsx`

- [ ] **Step 1: Confirm nothing else references it**

Run: `grep -rn "from './Sidebar'" src/renderer/src`
Expected: no matches (Task 2 already removed the only import, in `AppShell.tsx`).

- [ ] **Step 2: Delete the file**

```bash
git rm src/renderer/src/Sidebar.tsx
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(nav): remove Sidebar.tsx, fully replaced by TopBar"
```

---

## Task 4: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: PASS (node + web).

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: PASS — same count as before (this feature adds no new test files, matching the spec's testing section: no component-test infra exists in this repo, verification is manual).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual smoke test (documented, run in `npm run dev`)**

Document these steps for the check-through:
1. Launch the app. Confirm the left sidebar is gone and a top bar spans the full width: brand at the far left, 8 tabs, then (on the far right) the output-status area and a visually distinct Volunteer button.
2. Click through all 8 tabs (Home, Live, Build Service, Songs, Announcements, Scripture, Sound Check, Logo & Background) — confirm each one navigates exactly as it did before, and the clicked tab highlights.
3. On Live, confirm `ServiceRail` (loaded service list) and the bottom drawer (Songs/Scripture/Announcements/Backgrounds, shipped 2026-07-22) are both present and working exactly as before — this task shouldn't have touched either.
4. With no output window open, confirm "No output" + an "Open on projector" button show in the top bar; click it, confirm an output window opens and the badge switches to "N screen(s) live".
5. Start an OBS stream and/or recording (or toggle `obs?.streaming`/`obs?.recording` via the OBS panel if easier) — confirm "● Live" / "● Rec" badges with a counting-up elapsed time appear in the top bar's status cluster, and disappear when stopped.
6. Click **Volunteer mode** — confirm it swaps to the full-screen volunteer UI with no top bar visible at all (matching the existing `view === 'volunteer'` early-return); confirm exiting returns to Home with the top bar back.
7. On Home, confirm the "Zone screens" and "Stage monitor" cards still work (they were dropped from the top bar, not from Home).
8. Resize the window narrower — confirm the 8 nav tabs scroll horizontally within their own row rather than the whole top bar breaking or the brand/status/Volunteer cluster getting squeezed off-screen.

- [ ] **Step 5: Commit** (only if fixes were needed during the smoke test)

```bash
git add -A
git commit -m "test: verify TopBar navigation end-to-end"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** brand far-left + 8 flat tabs + status cluster + set-apart Volunteer button (Task 1); row→column shell restructure with `ServiceRail`/content untouched (Task 2); `Sidebar.tsx` removal (Task 3); OBS on-air indicator carried into the status cluster, "Zone screens"/"Stage monitor" deliberately dropped (both explicit in Task 1's `TopBar.tsx`), Volunteer's full-screen early-return unaffected (explicit in Task 2's file, matches spec's data-flow note) — all covered. Success-criteria checklist mapped 1:1 into Task 4's manual smoke test.
- **Placeholder scan:** none — every step has complete code or an exact command.
- **Type consistency:** `TopBar`'s props (`{ view: View; setView: (v: View) => void }`) match exactly what `AppShell.tsx` passed to `Sidebar` and now passes to `TopBar`; `NAV_ITEMS`' `id` values are all valid `View` union members (verified against `AppShell.tsx`'s `export type View = 'home' | 'live' | 'service' | 'songs' | 'announcements' | 'scripture' | 'volunteer' | 'settings' | 'soundcheck'` — 8 of the 9 members appear in `NAV_ITEMS`, `'volunteer'` intentionally excluded since it's the set-apart button, not a flat tab).
