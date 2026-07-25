# Live Drawer Targets the Builder Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Build Service screen, clicking a background in the Live Drawer's "Backgrounds" tab applies to the item currently selected in the builder — not whatever's live. Everywhere else, behavior is unchanged. Also fix `resolveBackgroundApply()` to recognize Scripture/Countdown/Welcome, not just Song/Text.

**Architecture:** `ServiceContext` gains a `selectedItemId` field mirrored (one-way) from `ServiceEditor`'s existing local selection state via a new non-throwing `useOptionalService()` hook — safe for the standalone pop-out Build Service window, which has no `ServiceProvider` and must keep working unmodified. `AppShell` tells `LiveDrawer` which screen is active; `BackgroundsDrawerTab` branches its apply-target resolution on that flag.

**Tech Stack:** React 18 + TypeScript (Electron renderer).

**Design doc:** [`docs/superpowers/specs/2026-07-25-drawer-build-targeting-design.md`](../specs/2026-07-25-drawer-build-targeting-design.md)

---

## Testing convention

Matches this codebase's established pattern: this is UI/state-wiring, not new pure logic — no unit tests to add. Verified manually (Task 6) plus `npm run typecheck` / `npm test` (regression-only) after each task.

## File Structure

- **Modify** `src/renderer/src/drawer/resolveBackgroundApply.ts` — recognize Text/Scripture/Countdown/Welcome, not just Text.
- **Modify** `src/renderer/src/ServiceContext.tsx` — add `selectedItemId`/`setSelectedItemId`, `itemsChangedTick`, and a new non-throwing `useOptionalService()` hook.
- **Modify** `src/renderer/src/ServiceEditor.tsx` — mirror local selection into context; re-fetch on `itemsChangedTick` bump.
- **Modify** `src/renderer/src/AppShell.tsx` — pass `isBuildService` to `LiveDrawer`.
- **Modify** `src/renderer/src/LiveDrawer.tsx` — thread `isBuildService` to `BackgroundsDrawerTab`.
- **Modify** `src/renderer/src/drawer/BackgroundsDrawerTab.tsx` — branch apply-target resolution on `isBuildService`.

---

### Task 1: Broaden `resolveBackgroundApply()`

**Files:**
- Modify: `src/renderer/src/drawer/resolveBackgroundApply.ts`

- [ ] **Step 1: Replace the file in full**

```ts
import type { ServiceItem, ServiceItemType } from '../../../shared/types'

export type BackgroundApplyAction =
  | { kind: 'song'; songId: number; path: string }
  | { kind: 'payload'; itemId: number; payload: Record<string, unknown>; path: string }
  | { kind: 'unsupported'; itemType: string }

// Item types whose live rendering supports a custom file background via
// payload.background — mirrors ItemBackgroundPanel.tsx's FILE_BACKGROUND_TYPES.
const PAYLOAD_BACKGROUND_TYPES: ServiceItemType[] = ['text', 'scripture', 'countdown', 'welcome']

// Pure decision: given a service item and a background file path, decide what
// update to make. Songs store their background on the song record; Text/
// Scripture/Countdown/Welcome items store it in their own payload; everything
// else doesn't support a background (matches ItemBackgroundPanel.tsx's rules).
export function resolveBackgroundApply(item: ServiceItem, path: string): BackgroundApplyAction {
  if (item.type === 'song' && item.ref_id != null) {
    return { kind: 'song', songId: item.ref_id, path }
  }
  if (PAYLOAD_BACKGROUND_TYPES.includes(item.type)) {
    return { kind: 'payload', itemId: item.id, payload: { ...(item.payload ?? {}), background: path }, path }
  }
  return { kind: 'unsupported', itemType: item.type }
}
```

- [ ] **Step 2: Update the one existing consumer's `kind` check**

In `src/renderer/src/drawer/BackgroundsDrawerTab.tsx`, find the `pick()` function's `if (action.kind === 'text')` branch and rename it to match the new kind name:

```ts
      } else if (action.kind === 'payload') {
        await window.wf.serviceSetItemPayload(action.itemId, action.payload)
```

(This is the only other place `BackgroundApplyAction`'s `kind` is checked — confirm by reading `BackgroundsDrawerTab.tsx`'s `pick()` function first. Don't change anything else in that file yet; the rest of this task's file's job is Task 5.)

- [ ] **Step 3: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/drawer/resolveBackgroundApply.ts src/renderer/src/drawer/BackgroundsDrawerTab.tsx
git commit -m "fix: resolveBackgroundApply recognizes Scripture/Countdown/Welcome, not just Text"
```

---

### Task 2: `ServiceContext` gains selection bridge + non-throwing accessor

**Files:**
- Modify: `src/renderer/src/ServiceContext.tsx`

- [ ] **Step 1: Replace the file in full**

```tsx
import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { ServiceFull, ServiceSummary } from '../../shared/types'

interface ServiceCtx {
  services: ServiceSummary[]
  activeServiceId: number | null
  activeService: ServiceFull | null
  selectService: (id: number | null) => void
  reloadActiveService: () => void
  refreshServices: () => void
  // Which item is selected in the Build Service builder right now (null when
  // nothing's selected, or when the builder isn't the active screen). Mirrored
  // one-way from ServiceEditor's own local selection state — see useOptionalService().
  selectedItemId: number | null
  setSelectedItemId: (id: number | null) => void
  // Bumped every time reloadActiveService() runs, so components that keep their
  // own separate copy of service data (like ServiceEditor) know to re-fetch.
  itemsChangedTick: number
}

const Ctx = createContext<ServiceCtx | null>(null)

export function ServiceProvider({ children }: { children: ReactNode }): JSX.Element {
  const [services, setServices] = useState<ServiceSummary[]>([])
  const [activeServiceId, setActiveServiceId] = useState<number | null>(null)
  const [activeService, setActiveService] = useState<ServiceFull | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [itemsChangedTick, setItemsChangedTick] = useState(0)

  const refreshServices = (): void => { window.wf.servicesList().then(setServices) }
  const reloadActiveService = (): void => {
    if (activeServiceId != null) {
      // Keep the main-process live-routing cache in sync with edits (add/remove,
      // template load, reorder) — otherwise newly added items can't go live.
      window.wf.serviceRefreshActiveItems(activeServiceId)
      window.wf.serviceGet(activeServiceId).then(setActiveService)
    }
    setItemsChangedTick((t) => t + 1)
  }
  const selectService = (id: number | null): void => {
    setActiveServiceId(id)
    window.wf.setActiveService(id)
    if (id == null) setActiveService(null)
    else window.wf.serviceGet(id).then(setActiveService)
  }

  useEffect(() => {
    window.wf.servicesList().then((list) => {
      setServices(list)
      if (list.length > 0) selectService(list[0].id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Ctx.Provider value={{
      services, activeServiceId, activeService, selectService, reloadActiveService, refreshServices,
      selectedItemId, setSelectedItemId, itemsChangedTick
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useService(): ServiceCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useService must be used within ServiceProvider')
  return v
}

// Same as useService(), but returns null instead of throwing when there's no
// ServiceProvider ancestor. For components used in BOTH contexts — e.g.
// ServiceEditor, which is also rendered standalone (no provider) by the
// pop-out Build Service window (App.tsx's #/service route).
export function useOptionalService(): ServiceCtx | null {
  return useContext(Ctx)
}
```

- [ ] **Step 2: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean (both new context fields are consumed nowhere yet, which is fine — they're additive).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/ServiceContext.tsx
git commit -m "feat: ServiceContext gains selectedItemId bridge and a non-throwing useOptionalService()"
```

---

### Task 3: `ServiceEditor` mirrors selection outward and reloads on tick

**Files:**
- Modify: `src/renderer/src/ServiceEditor.tsx`

- [ ] **Step 1: Import the new hook**

Find the top of the file. Add an import:

```ts
import { useOptionalService } from './ServiceContext'
```

- [ ] **Step 2: Call the hook and mirror selection**

Find where `selectedId`/`setSelectedId` and `service` are declared (near the top of the component body, alongside the other `useState` calls). Right after them, add:

```ts
  const optionalSvc = useOptionalService()

  // Mirror this component's selection outward so the Live Drawer (a sibling in
  // the tree, only reachable via ServiceContext) knows what's selected when
  // Build Service is the active screen. No-op in the standalone pop-out window,
  // which has no ServiceProvider — optionalSvc is null there.
  useEffect(() => {
    optionalSvc?.setSelectedItemId(selectedId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  // Clear the mirrored selection on unmount (e.g. navigating away from Build
  // Service), so a stale id doesn't linger once this screen isn't showing.
  useEffect(() => {
    return () => { optionalSvc?.setSelectedItemId(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

- [ ] **Step 3: Re-fetch when the shared context signals a change**

Find the existing `reload` function and the `useEffect` that calls it on `[serviceId]` (the one that also calls `window.wf.setActiveService(serviceId)`, `songsList()`, etc.). Below that `useEffect`, add a new one that re-runs `reload()` whenever `itemsChangedTick` changes, skipping the very first render (the `[serviceId]` effect above already covers the initial load):

```ts
  // Re-fetch this component's own copy of the service whenever something
  // outside it (e.g. the Live Drawer applying a background to the selected
  // item) calls the shared context's reloadActiveService(). ServiceEditor
  // fetches its own data independently of ServiceContext's activeService, so
  // without this its on-screen preview would go stale after such an edit.
  const skipFirstTick = useRef(true)
  useEffect(() => {
    if (skipFirstTick.current) { skipFirstTick.current = false; return }
    if (optionalSvc) reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionalSvc?.itemsChangedTick])
```

Add `useRef` to the existing `import { useEffect, useState } from 'react'` line at the top of the file:

```ts
import { useEffect, useRef, useState } from 'react'
```

- [ ] **Step 4: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/ServiceEditor.tsx
git commit -m "feat: ServiceEditor mirrors its selection into ServiceContext and re-fetches on external changes"
```

---

### Task 4: Thread `isBuildService` down and target the builder selection

**Files:**
- Modify: `src/renderer/src/AppShell.tsx`
- Modify: `src/renderer/src/LiveDrawer.tsx`
- Modify: `src/renderer/src/drawer/BackgroundsDrawerTab.tsx`

This task is kept as one unit (rather than split across files) so typecheck stays clean at every commit — `LiveDrawer`/`AppShell` passing a new `isBuildService` prop and `BackgroundsDrawerTab` accepting it are two halves of the same wire; splitting them would leave a real type error in between.

- [ ] **Step 1: `AppShell.tsx` passes the flag**

Find `<LiveDrawer key={view} />`. Replace it:

```tsx
        <LiveDrawer key={view} isBuildService={view === 'service'} />
```

- [ ] **Step 2: `LiveDrawer.tsx` accepts and forwards it**

Replace the function signature:

```tsx
function LiveDrawer({ isBuildService }: { isBuildService: boolean }): JSX.Element {
```

Find the line `{open === 'backgrounds' && <BackgroundsDrawerTab onDone={close} />}`. Replace it:

```tsx
          {open === 'backgrounds' && <BackgroundsDrawerTab onDone={close} isBuildService={isBuildService} />}
```

- [ ] **Step 3: Read `BackgroundsDrawerTab.tsx`'s current state**

Confirm its current `pick()` function and props match what Task 1 (Step 2) and the design describe: it currently takes `{ onDone }: { onDone: () => void }`, uses `useService()` for `activeService`/`reloadActiveService`, and `window.wf.onState()`/`getState('main')` for `live`.

- [ ] **Step 4: Replace the file in full**

```tsx
import { useEffect, useState } from 'react'
import type { LiveState } from '../../../shared/types'
import { useService } from '../ServiceContext'
import { notifyLocal } from '../NotifyToasts'
import { resolveBackgroundApply } from './resolveBackgroundApply'

interface BgEntry {
  filename: string
  path: string
  kind: 'upload' | 'generated'
  isVideo: boolean
}

function toAssetUrl(p: string): string {
  return 'wf-asset://?path=' + encodeURIComponent(p)
}

export default function BackgroundsDrawerTab({ onDone, isBuildService }: { onDone: () => void; isBuildService: boolean }): JSX.Element {
  const { activeService, reloadActiveService, selectedItemId } = useService()
  const [backgrounds, setBackgrounds] = useState<BgEntry[]>([])
  const [live, setLive] = useState<LiveState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.wf.bgList().then(setBackgrounds)
    // onState only pushes future broadcasts — seed the current state too, or this
    // tab thinks nothing is live until the next unrelated state change (matches
    // the same getState()+onState() pattern ServiceRail.tsx already uses).
    window.wf.getState('main').then(setLive)
    const off = window.wf.onState((s) => setLive(s.main))
    return off
  }, [])

  const pick = async (path: string): Promise<void> => {
    if (busy) return

    // On Build Service, target whatever's selected in the builder — never the
    // live item, which may be something unrelated the operator hasn't touched.
    // Everywhere else, target the live item, exactly as before this feature.
    const targetItem = isBuildService
      ? (activeService?.items.find((it) => it.id === selectedItemId) ?? null)
      : (activeService?.items.find((it) => it.id === live?.liveServiceItemId) ?? null)

    if (!targetItem) {
      notifyLocal(
        isBuildService
          ? 'Select an item in the builder first.'
          : 'Nothing is live yet — send something live first.',
        'warn'
      )
      return
    }

    setBusy(true)
    try {
      const action = resolveBackgroundApply(targetItem, path)
      if (action.kind === 'song') {
        await window.wf.songSetBackground(action.songId, action.path)
      } else if (action.kind === 'payload') {
        await window.wf.serviceSetItemPayload(action.itemId, action.payload)
      } else {
        notifyLocal(`Backgrounds aren't supported on ${action.itemType} items.`, 'warn')
        return
      }
      // Only push the live projector when we're actually targeting the live
      // item (i.e. not building) — building shouldn't change what's on air.
      if (!isBuildService) {
        await window.wf.liveSetBackground('main', action.path)
      }
      reloadActiveService()
      onDone()
    } catch {
      notifyLocal('Could not apply that background.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid grid-cols-6 gap-2">
      {backgrounds.length === 0 && (
        <p className="col-span-6 text-xs text-slate-400">No backgrounds yet — add some in Build Service.</p>
      )}
      {backgrounds.map((bg) => (
        <button
          key={bg.path}
          onClick={() => void pick(bg.path)}
          disabled={busy}
          className="overflow-hidden rounded border border-slate-200 hover:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ aspectRatio: '16/9' }}
          title={bg.filename}
        >
          {bg.isVideo ? (
            <video src={toAssetUrl(bg.path)} className="h-full w-full object-cover" muted />
          ) : (
            <img src={toAssetUrl(bg.path)} className="h-full w-full object-cover" alt={bg.filename} />
          )}
        </button>
      ))}
    </div>
  )
}
```

(This drops the unused `useService`'s `reloadActiveService` import ambiguity — note `reloadActiveService` is still used; only the old `pick()` logic's live-only resolution is replaced. The `import { useService } from '../ServiceContext'` line is unchanged in this rewrite; do NOT switch this file to `useOptionalService` — `BackgroundsDrawerTab` is only ever rendered inside `LiveDrawer`, which is only ever rendered inside `AppShell`'s `ServiceProvider`, so the strict `useService()` is correct and safe here, same as before this task.)

- [ ] **Step 5: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/AppShell.tsx src/renderer/src/LiveDrawer.tsx src/renderer/src/drawer/BackgroundsDrawerTab.tsx
git commit -m "feat: Live Drawer backgrounds tab targets the builder selection on Build Service"
```

---

### Task 5: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm typecheck and the full test suite are clean**

Run: `cd C:\Dev\worshipflow && npm run typecheck && npm test`
Expected: both clean/passing.

- [ ] **Step 2: Confirm build-context targeting**

Run `npm run dev`. Go to Build Service, select a Text item (or Scripture/Countdown/Welcome/Song), open the drawer's Backgrounds tab, click a thumbnail. Confirm: it applies to the *selected* item (visible in the preview immediately, no reselect needed), nothing changes on the live projector, and the drawer closes.

- [ ] **Step 3: Confirm the "nothing selected" case**

On Build Service with no item selected, open the drawer's Backgrounds tab and click a thumbnail. Confirm a "Select an item in the builder first" warning, and nothing gets changed.

- [ ] **Step 4: Confirm Scripture/Countdown/Welcome now work via the drawer**

Select a Scripture, Countdown, and Welcome item in turn; confirm each accepts a drawer-applied background (this was broken before Task 1, unrelated to the targeting fix).

- [ ] **Step 5: Confirm unchanged behavior everywhere else**

Go to the Live screen (not Build Service). With nothing live, click a drawer background — confirm the original "Nothing is live yet" warning still appears. With something live, click a background — confirm it applies to the live item and pushes to the projector, exactly as before this feature.

- [ ] **Step 6: Confirm the pop-out Build Service window still works**

Click "Pop out" from Build Service's header. Confirm the new window opens without crashing, shows the service, and selecting items still works normally there (it has no Live Drawer, so nothing to test regarding backgrounds — just confirm no console errors and normal operation).

- [ ] **Step 7: Final commit**

If Steps 2-6 required any fixes, stage and commit them now with a message describing what was fixed. If no fixes were needed, run `git log --oneline -7` to confirm the full commit sequence for this feature is present, and report completion.
