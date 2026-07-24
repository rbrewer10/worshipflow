# App-Wide Bottom Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the bottom content drawer (Songs/Scripture/Announcements/Backgrounds) available on every screen instead of just the Live tab, with identical behavior everywhere and no logic changes inside the drawer itself.

**Architecture:** `LiveDrawer` moves from being mounted inside `LiveView.tsx` to being mounted once in `AppShell.tsx`, as the last child of the shell (below the whole screen-switch, including `ServiceRail` on Live). It's given `key={view}` so React remounts it — and therefore resets it closed — on every screen change, with no new state-management code. `LiveView.tsx` reverts to just `SlideGrid + LiveTools`. This is a pure relocation: `LiveDrawer` and its four tab components already read/write through the already-app-wide `ServiceContext`, so nothing inside them changes.

**Tech Stack:** Electron (renderer), TypeScript, React 18, Tailwind v3.

---

## File Structure

**Modify:**
- `src/renderer/src/AppShell.tsx` — mount `<LiveDrawer key={view} />` as the last child of the shell.
- `src/renderer/src/LiveView.tsx` — drop the `<LiveDrawer />` mount and the wrapping column div it needed.
- `src/renderer/src/LiveDrawer.tsx` — update the file-level comment (no logic change) to reflect it's app-wide, not Live-tab-only.

**Not touched:** `src/renderer/src/drawer/*` (all four tab components), `ServiceContext.tsx`, `ServiceRail.tsx`, and every other view component — none of them need any change for this phase.

---

## Task 1: Relocate `LiveDrawer` from `LiveView` to `AppShell`

**Files:**
- Modify: `src/renderer/src/AppShell.tsx`
- Modify: `src/renderer/src/LiveView.tsx`
- Modify: `src/renderer/src/LiveDrawer.tsx`

- [ ] **Step 1: Mount `LiveDrawer` in `AppShell.tsx`**

Replace the full contents of `src/renderer/src/AppShell.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { ServiceProvider } from './ServiceContext'
import TopBar from './TopBar'
import ServiceRail from './ServiceRail'
import HomeView from './HomeView'
import LiveView from './LiveView'
import LiveDrawer from './LiveDrawer'
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
        <LiveDrawer key={view} />
      </div>
    </ServiceProvider>
  )
}

export default AppShell
```

The only changes from the current file: a new `import LiveDrawer from './LiveDrawer'`, and a new `<LiveDrawer key={view} />` line after the content-switch div, still inside the same outer `flex h-screen flex-col` container (so it's a `flex-shrink-0` sibling below everything, including `ServiceRail` when `view === 'live'`). The `key={view}` is what makes it remount — and therefore reset closed — on every screen change. The `view === 'volunteer'` early-return above is untouched, so `LiveDrawer` is structurally never reachable in Volunteer mode (that branch returns before this JSX is ever built). Everything else is byte-for-byte identical to the current file.

- [ ] **Step 2: Revert `LiveView.tsx` to drop the drawer**

Replace the full contents of `src/renderer/src/LiveView.tsx`:

```tsx
import SlideGrid from './SlideGrid'
import LiveTools from './LiveTools'

// The Live tab: the click-a-slide grid + the right-hand tools panel.
// (The loaded service + output preview live in the shell's left rail —
// ServiceRail, in AppShell. The bottom content drawer is now mounted
// app-wide in AppShell too, not here — see LiveDrawer.tsx.)
// Keyboard shortcuts (B/L/N/P/S) are handled globally in AppShell.
function LiveView(): JSX.Element {
  return (
    <div className="flex h-full min-h-0">
      <SlideGrid />
      <LiveTools />
    </div>
  )
}

export default LiveView
```

This drops the `<LiveDrawer />` import/mount and the wrapping `flex-col` div `LiveView` needed to stack the drawer beneath `SlideGrid + LiveTools` — `LiveView` goes back to exactly the single-row layout it had before Phase 1 of the drawer feature (2026-07-22).

- [ ] **Step 3: Update `LiveDrawer.tsx`'s file comment**

In `src/renderer/src/LiveDrawer.tsx`, replace only the file-level comment above the `function LiveDrawer()` declaration:

```tsx
// A FreeShow-inspired docked drawer available on every screen (except
// Volunteer mode): a tab strip that's always visible, collapsed by default.
// Clicking a tab slides the drawer open (smooth max-height transition);
// clicking it again, picking an item, or Escape slides it closed. Remounted
// (via a `key` at the call site, in AppShell.tsx) whenever the active screen
// changes, so it resets closed rather than carrying state across screens.
```

This replaces the old comment ("...docked drawer for the Live tab..."). No other line in this file changes — the component's internals, its four tab renders, and its own root JSX are untouched.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/AppShell.tsx src/renderer/src/LiveView.tsx src/renderer/src/LiveDrawer.tsx
git commit -m "feat(drawer): make the bottom drawer app-wide (was Live-tab-only)"
```

---

## Task 2: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: PASS (node + web).

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: PASS — same count as before (this phase adds no new files, no new logic, matching the spec's testing section: no component-test infra exists, verification is manual).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual smoke test (documented, run in `npm run dev`)**

Document these steps for the check-through:
1. Launch the app, land on Home. Confirm the drawer's tab strip (Songs / Scripture / Announcements / Backgrounds) is now visible at the bottom of the Home screen, full width.
2. Click a few other top-bar tabs (Build Service, Songs, Sound Check, Logo & Background) — confirm the drawer tab strip is present at the bottom of every one of them.
3. On any non-Live screen, open the drawer's Songs tab, search, and click a song — confirm it adds to the loaded service and goes live on the projector, exactly as it does on the Live tab, and the drawer closes.
4. Same check for Scripture (including an invalid reference → toast, nothing goes live) and Announcements.
5. With something live, open Backgrounds from a non-Live screen and click a thumbnail — confirm it updates the live projector output. With nothing live, confirm the "Nothing is live yet" toast.
6. Go to the Live tab specifically — confirm the drawer now spans the full width, including under `ServiceRail` (not indented to dodge it, unlike Phase 1's original layout) — and that `ServiceRail`, `SlideGrid`, and `LiveTools` all still work exactly as before.
7. Open the drawer on one screen (e.g. Songs tab open on Home), then click a different top-bar tab — confirm the drawer closes automatically rather than staying open on the new screen.
8. Confirm Volunteer mode is still completely unaffected — no drawer, no top bar, entering/exiting works as before.

- [ ] **Step 5: Commit** (only if fixes were needed during the smoke test)

```bash
git add -A
git commit -m "test: verify the app-wide drawer end-to-end"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** identical click behavior everywhere (no code change needed — already true via `ServiceContext`, explicitly noted in Task 1) ✓; Backgrounds still live-only (unchanged code, noted) ✓; Volunteer mode exclusion (structural, via the untouched early-return, explicitly called out in Task 1 Step 1) ✓; full-width layout including under `ServiceRail` on Live (Task 1 Step 1's mount position, below the whole content-switch) ✓; auto-close on navigation (`key={view}`, Task 1 Step 1) ✓. Success-criteria checklist mapped into Task 2's manual smoke test.
- **Placeholder scan:** none — every step has complete code.
- **Type consistency:** `LiveDrawer` takes no props (confirmed against its current signature `function LiveDrawer(): JSX.Element`), so adding `key={view}` at the call site requires no interface change — `key` is a React-reserved prop, not part of the component's own prop type. `View` (used for the `key`) is the same type already imported/used throughout `AppShell.tsx`.
