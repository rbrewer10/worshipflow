# Live Tab Bottom Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a FreeShow-inspired docked tab strip to the Live tab — Songs / Scripture / Announcements / Backgrounds — collapsed by default, sliding open on tab click, so the operator can grab content live without leaving Live control.

**Architecture:** A new `LiveDrawer.tsx` shell (tab strip + animated open/close panel) mounts inside `LiveView.tsx`, below the existing `SlideGrid + LiveTools` row. Four thin tab components handle search + click-to-act, all funneling through one shared `addAndGoLive()` helper that appends a real `ServiceItem` and sends it live via the app's existing `sendItemLive()` chokepoint — so Phase-1 recording markers and zone routing stay correct. A pure `resolveBackgroundApply()` helper decides how to apply a background depending on the live item's type (song vs. text vs. unsupported), and is the one piece with real branching logic worth unit-testing.

**Tech Stack:** Electron (renderer), TypeScript, React 18, Tailwind v3, Vitest.

---

## File Structure

**Create:**
- `src/renderer/src/drawer/resolveBackgroundApply.ts` — pure decision helper for the Backgrounds tab.
- `src/renderer/src/drawer/resolveBackgroundApply.test.ts` — Vitest tests for it.
- `src/renderer/src/drawer/addAndGoLive.ts` — shared "add item, sync cache, send live" orchestration used by Songs/Scripture/Announcements.
- `src/renderer/src/drawer/SongsDrawerTab.tsx`
- `src/renderer/src/drawer/ScriptureDrawerTab.tsx`
- `src/renderer/src/drawer/AnnouncementsDrawerTab.tsx`
- `src/renderer/src/drawer/BackgroundsDrawerTab.tsx`
- `src/renderer/src/LiveDrawer.tsx` — the tab strip + sliding panel shell.

**Modify:**
- `src/renderer/src/NotifyToasts.tsx` — add a renderer-only `notifyLocal()` trigger (for client-detected conditions like "no active service" that don't need a main-process round trip).
- `src/renderer/src/LiveView.tsx` — mount `<LiveDrawer />` below the existing row.

**Conventions confirmed in the codebase (used throughout below):**
- Files under `src/renderer/src/drawer/*.ts(x)` import shared types via `../../../shared/types` (same nesting depth as `src/renderer/src/editor/*.tsx`, which uses the identical path).
- Sibling imports from `src/renderer/src/*.tsx` (e.g. `ServiceContext`, `liveActions`, `NotifyToasts`) are `../ServiceContext` etc. from inside `drawer/`.
- Search-as-you-type with no debounce (`useEffect` on `[search]` calling the list IPC directly) — matches `SongLibrary.tsx`.
- Global CSS classes `.surface`, `.btn`, `.btn-primary`, `.section-header` already exist in `assets/main.css` and are used by `ScripturePanel`/`ItemBackgroundPanel`.
- `toAssetUrl(p) => 'wf-asset://?path=' + encodeURIComponent(p)` is defined locally in each file that needs it (already duplicated 3x in the codebase — not extracted to a shared util) — follow the same local-definition convention.
- Vitest runs pure-logic tests anywhere under `src/` in a `node` environment (`vitest.config.ts`); renderer test files already exist (`autoLabel.test.ts`, `chordUtils.test.ts`, `songText.test.ts`), so a test file under `drawer/` is picked up the same way.

---

## Task 1: Renderer-only toast helper

**Files:**
- Modify: `src/renderer/src/NotifyToasts.tsx`

- [ ] **Step 1: Replace the file with the toast-plus-local-trigger version**

Replace the full contents of `src/renderer/src/NotifyToasts.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { AlertTriangle, Info, X } from 'lucide-react'

interface Toast {
  id: number
  message: string
  level: 'info' | 'warn' | 'error'
}

// Renderer-only toast trigger for client-detected conditions (e.g. "no active
// service") that don't need a main-process round trip. Dispatches the same
// { message, level } shape onNotify delivers, so NotifyToasts renders both
// main-driven and local toasts through one code path.
export function notifyLocal(message: string, level: 'info' | 'warn' | 'error' = 'warn'): void {
  window.dispatchEvent(new CustomEvent('wf:localNotify', { detail: { message, level } }))
}

// Listens for operator notifications from the main process (wf:notify) AND
// local renderer-triggered ones (wf:localNotify) — used for save failures,
// scripture fallbacks, drawer validation, etc. so the operator is never left
// guessing when something went wrong.
function NotifyToasts(): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    let seq = 0
    const push = (n: { message: string; level: 'info' | 'warn' | 'error' }): void => {
      const id = ++seq
      setToasts((prev) => [...prev, { id, ...n }])
      // Errors linger longer so they can't be missed mid-service.
      const ttl = n.level === 'error' ? 12000 : 6000
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), ttl)
    }
    const off = window.wf.onNotify(push)
    const onLocal = (e: Event): void => push((e as CustomEvent<{ message: string; level: 'info' | 'warn' | 'error' }>).detail)
    window.addEventListener('wf:localNotify', onLocal)
    return () => { off(); window.removeEventListener('wf:localNotify', onLocal) }
  }, [])

  if (toasts.length === 0) return <></>

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[9999] flex flex-col items-center gap-2">
      {toasts.map((t) => {
        const tone =
          t.level === 'error' ? 'bg-red-600 text-white'
          : t.level === 'warn' ? 'bg-amber-500 text-white'
          : 'bg-slate-800 text-white'
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-lg items-start gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${tone}`}
          >
            {t.level === 'info' ? <Info size={16} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />}
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="mt-0.5 flex-shrink-0 opacity-70 hover:opacity-100"
              aria-label="Dismiss"
            >
              <X size={15} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default NotifyToasts
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/NotifyToasts.tsx
git commit -m "feat(ui): renderer-only notifyLocal toast trigger"
```

---

## Task 2: `resolveBackgroundApply` pure helper (TDD)

**Files:**
- Create: `src/renderer/src/drawer/resolveBackgroundApply.ts`
- Test: `src/renderer/src/drawer/resolveBackgroundApply.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/drawer/resolveBackgroundApply.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveBackgroundApply } from './resolveBackgroundApply'
import type { ServiceItem } from '../../../shared/types'

function makeItem(overrides: Partial<ServiceItem>): ServiceItem {
  return {
    id: 1, ordinal: 0, type: 'text', ref_id: null, payload: {}, title: 'x',
    notes: null, style: null, zoneRouting: null, ...overrides
  }
}

describe('resolveBackgroundApply', () => {
  it('targets the song record for a song item', () => {
    const item = makeItem({ type: 'song', ref_id: 42 })
    expect(resolveBackgroundApply(item, '/bg/a.jpg')).toEqual({ kind: 'song', songId: 42, path: '/bg/a.jpg' })
  })

  it('targets the item payload for a text item, preserving existing fields', () => {
    const item = makeItem({ type: 'text', payload: { title: 'Welcome', body: 'Hi' } })
    expect(resolveBackgroundApply(item, '/bg/b.jpg')).toEqual({
      kind: 'text',
      itemId: item.id,
      payload: { title: 'Welcome', body: 'Hi', background: '/bg/b.jpg' },
      path: '/bg/b.jpg'
    })
  })

  it('is unsupported for a song item with no ref_id', () => {
    const item = makeItem({ type: 'song', ref_id: null })
    expect(resolveBackgroundApply(item, '/bg/c.jpg')).toEqual({ kind: 'unsupported', itemType: 'song' })
  })

  it('is unsupported for item types with no background concept', () => {
    const item = makeItem({ type: 'scripture' })
    expect(resolveBackgroundApply(item, '/bg/d.jpg')).toEqual({ kind: 'unsupported', itemType: 'scripture' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/drawer/resolveBackgroundApply.test.ts`
Expected: FAIL — `Cannot find module './resolveBackgroundApply'`.

- [ ] **Step 3: Implement `resolveBackgroundApply`**

Create `src/renderer/src/drawer/resolveBackgroundApply.ts`:

```ts
import type { ServiceItem } from '../../../shared/types'

export type BackgroundApplyAction =
  | { kind: 'song'; songId: number; path: string }
  | { kind: 'text'; itemId: number; payload: Record<string, unknown>; path: string }
  | { kind: 'unsupported'; itemType: string }

// Pure decision: given the item that's currently live and a background file
// path, decide what update to make. Songs store their background on the song
// record; text items store it in their own payload; everything else doesn't
// support a background (matches itemThumbBackground's existing rules in
// liveActions.ts).
export function resolveBackgroundApply(item: ServiceItem, path: string): BackgroundApplyAction {
  if (item.type === 'song' && item.ref_id != null) {
    return { kind: 'song', songId: item.ref_id, path }
  }
  if (item.type === 'text') {
    return { kind: 'text', itemId: item.id, payload: { ...(item.payload ?? {}), background: path }, path }
  }
  return { kind: 'unsupported', itemType: item.type }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/drawer/resolveBackgroundApply.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/drawer/resolveBackgroundApply.ts src/renderer/src/drawer/resolveBackgroundApply.test.ts
git commit -m "feat(drawer): resolveBackgroundApply pure helper (TDD)"
```

---

## Task 3: `addAndGoLive` shared orchestration helper

**Files:**
- Create: `src/renderer/src/drawer/addAndGoLive.ts`

- [ ] **Step 1: Implement**

Create `src/renderer/src/drawer/addAndGoLive.ts`:

```ts
import type { NewServiceItem } from '../../../shared/types'
import { sendItemLive } from '../liveActions'
import { notifyLocal } from '../NotifyToasts'

// Shared by the Songs/Scripture/Announcements drawer tabs: append a new item to
// the active service, then send it live through the SAME chokepoint the rest of
// the app uses (sendItemLive) — this is what keeps Phase-1 recording markers and
// zone routing correct, instead of a separate "quick push" path.
//
// serviceRefreshActiveItems must run before sendItemLive: sendItemLive ends by
// calling liveSetItemId(item.id), and main resolves that id against its own
// activeServiceItems cache — a newly-added item isn't in that cache yet unless
// it's refreshed first. This mirrors exactly what ServiceContext's
// reloadActiveService() already does (refresh, then get).
export async function addAndGoLive(
  serviceId: number | null,
  newItem: NewServiceItem,
  reloadActiveService: () => void
): Promise<boolean> {
  if (serviceId == null) {
    notifyLocal('Load a service first (Build Service).', 'warn')
    return false
  }
  const itemId = await window.wf.serviceAddItem(serviceId, newItem)
  await window.wf.serviceRefreshActiveItems(serviceId)
  const fresh = await window.wf.serviceGet(serviceId)
  const item = fresh?.items.find((it) => it.id === itemId) ?? null
  if (!item) {
    notifyLocal('Could not load the new item.', 'error')
    return false
  }
  await sendItemLive(item)
  reloadActiveService()
  return true
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/drawer/addAndGoLive.ts
git commit -m "feat(drawer): addAndGoLive shared add-then-go-live helper"
```

---

## Task 4: `SongsDrawerTab`

**Files:**
- Create: `src/renderer/src/drawer/SongsDrawerTab.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/src/drawer/SongsDrawerTab.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import type { SongSummary } from '../../../shared/types'
import { useService } from '../ServiceContext'
import { addAndGoLive } from './addAndGoLive'

export default function SongsDrawerTab({ onDone }: { onDone: () => void }): JSX.Element {
  const { activeServiceId, reloadActiveService } = useService()
  const [search, setSearch] = useState('')
  const [songs, setSongs] = useState<SongSummary[]>([])

  useEffect(() => {
    window.wf.songsList(search).then(setSongs)
  }, [search])

  const pick = async (songId: number): Promise<void> => {
    const ok = await addAndGoLive(activeServiceId, { type: 'song', ref_id: songId }, reloadActiveService)
    if (ok) onDone()
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search songs…"
        className="rounded border border-slate-300 px-2 py-1 text-sm"
      />
      <div className="flex flex-col gap-1">
        {songs.length === 0 && <p className="text-xs text-slate-400">No songs found.</p>}
        {songs.map((s) => (
          <button
            key={s.id}
            onClick={() => void pick(s.id)}
            className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2 py-1.5 text-left text-sm hover:border-blue-400 hover:bg-blue-50"
          >
            <span className="truncate">
              {s.title}
              {s.author ? <span className="text-slate-400"> — {s.author}</span> : null}
            </span>
            <Play size={13} className="shrink-0 text-blue-600" />
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/drawer/SongsDrawerTab.tsx
git commit -m "feat(drawer): Songs tab"
```

---

## Task 5: `ScriptureDrawerTab`

**Files:**
- Create: `src/renderer/src/drawer/ScriptureDrawerTab.tsx`

- [ ] **Step 1: Implement**

This reuses the existing `ScripturePanel` presentational component (the same one `LiveTools`' quick-scripture box uses), but wires a different `onGoLive` — add-then-go-live instead of a bare quick-push. The translation setter mirrors `LiveTools.tsx` exactly (`window.wf.featuresSetBibleTranslation`), since there's no getter for the current value anywhere in the app today — `LiveTools` has the same "defaults to kjv locally" limitation, so this isn't a regression.

Create `src/renderer/src/drawer/ScriptureDrawerTab.tsx`:

```tsx
import { useState } from 'react'
import { ScripturePanel } from '../ScripturePanel'
import { useService } from '../ServiceContext'
import { addAndGoLive } from './addAndGoLive'

export default function ScriptureDrawerTab({ onDone }: { onDone: () => void }): JSX.Element {
  const { activeServiceId, reloadActiveService } = useService()
  const [scriptureRef, setScriptureRef] = useState('')
  const [bibleTranslation, setBibleTranslation] = useState<'kjv' | 'web' | 'bbe'>('kjv')

  const goLive = async (): Promise<void> => {
    const ref = scriptureRef.trim()
    if (!ref) return
    const ok = await addAndGoLive(
      activeServiceId,
      { type: 'scripture', payload: { reference: ref } },
      reloadActiveService
    )
    if (ok) {
      setScriptureRef('')
      onDone()
    }
  }

  return (
    <ScripturePanel
      scriptureRef={scriptureRef}
      bibleTranslation={bibleTranslation}
      onReferenceChange={setScriptureRef}
      onGoLive={() => void goLive()}
      onTranslationChange={(t) => { setBibleTranslation(t); window.wf.featuresSetBibleTranslation(t) }}
    />
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/drawer/ScriptureDrawerTab.tsx
git commit -m "feat(drawer): Scripture tab"
```

---

## Task 6: `AnnouncementsDrawerTab`

**Files:**
- Create: `src/renderer/src/drawer/AnnouncementsDrawerTab.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/src/drawer/AnnouncementsDrawerTab.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import type { AnnouncementSummary } from '../../../shared/types'
import { useService } from '../ServiceContext'
import { addAndGoLive } from './addAndGoLive'

export default function AnnouncementsDrawerTab({ onDone }: { onDone: () => void }): JSX.Element {
  const { activeServiceId, reloadActiveService } = useService()
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<AnnouncementSummary[]>([])

  useEffect(() => {
    window.wf.announcementsList(search).then(setItems)
  }, [search])

  const pick = async (id: number): Promise<void> => {
    const ok = await addAndGoLive(activeServiceId, { type: 'announcement', ref_id: id }, reloadActiveService)
    if (ok) onDone()
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search announcements…"
        className="rounded border border-slate-300 px-2 py-1 text-sm"
      />
      <div className="flex flex-col gap-1">
        {items.length === 0 && <p className="text-xs text-slate-400">No announcements found.</p>}
        {items.map((a) => (
          <button
            key={a.id}
            onClick={() => void pick(a.id)}
            className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2 py-1.5 text-left text-sm hover:border-blue-400 hover:bg-blue-50"
          >
            <span className="truncate">{a.title}</span>
            <Play size={13} className="shrink-0 text-blue-600" />
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/drawer/AnnouncementsDrawerTab.tsx
git commit -m "feat(drawer): Announcements tab"
```

---

## Task 7: `BackgroundsDrawerTab`

**Files:**
- Create: `src/renderer/src/drawer/BackgroundsDrawerTab.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/src/drawer/BackgroundsDrawerTab.tsx`:

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

export default function BackgroundsDrawerTab({ onDone }: { onDone: () => void }): JSX.Element {
  const { activeService, reloadActiveService } = useService()
  const [backgrounds, setBackgrounds] = useState<BgEntry[]>([])
  const [live, setLive] = useState<LiveState | null>(null)

  useEffect(() => {
    window.wf.bgList().then(setBackgrounds)
    const off = window.wf.onState(setLive)
    return off
  }, [])

  const pick = async (path: string): Promise<void> => {
    const liveItem = activeService?.items.find((it) => it.id === live?.liveServiceItemId) ?? null
    if (!liveItem) {
      notifyLocal('Nothing is live yet — send something live first.', 'warn')
      return
    }

    const action = resolveBackgroundApply(liveItem, path)
    if (action.kind === 'song') {
      await window.wf.songSetBackground(action.songId, action.path)
    } else if (action.kind === 'text') {
      await window.wf.serviceSetItemPayload(action.itemId, action.payload)
    } else {
      notifyLocal(`Backgrounds aren't supported on ${action.itemType} items.`, 'warn')
      return
    }
    reloadActiveService()
    onDone()
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
          className="overflow-hidden rounded border border-slate-200 hover:border-blue-400"
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

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/drawer/BackgroundsDrawerTab.tsx
git commit -m "feat(drawer): Backgrounds tab"
```

---

## Task 8: `LiveDrawer` shell (tab strip + slide animation)

**Files:**
- Create: `src/renderer/src/LiveDrawer.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/src/LiveDrawer.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Music, BookOpen, Megaphone, Image as ImageIcon } from 'lucide-react'
import SongsDrawerTab from './drawer/SongsDrawerTab'
import ScriptureDrawerTab from './drawer/ScriptureDrawerTab'
import AnnouncementsDrawerTab from './drawer/AnnouncementsDrawerTab'
import BackgroundsDrawerTab from './drawer/BackgroundsDrawerTab'

type DrawerTabId = 'songs' | 'scripture' | 'announcements' | 'backgrounds'

const TABS: { id: DrawerTabId; label: string; Icon: typeof Music }[] = [
  { id: 'songs', label: 'Songs', Icon: Music },
  { id: 'scripture', label: 'Scripture', Icon: BookOpen },
  { id: 'announcements', label: 'Announcements', Icon: Megaphone },
  { id: 'backgrounds', label: 'Backgrounds', Icon: ImageIcon }
]

const OPEN_HEIGHT = 280

// A FreeShow-inspired docked drawer for the Live tab: a tab strip that's always
// visible, collapsed by default so SlideGrid keeps full height mid-service.
// Clicking a tab slides the drawer open over the bottom of the grid (smooth
// max-height transition); clicking it again, picking an item, or Escape slides
// it closed.
function LiveDrawer(): JSX.Element {
  const [open, setOpen] = useState<DrawerTabId | null>(null)
  const close = (): void => setOpen(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="flex flex-shrink-0 flex-col border-t border-slate-200 bg-white">
      <div className="flex items-center border-b border-slate-200">
        {TABS.map(({ id, label, Icon }) => {
          const active = open === id
          return (
            <button
              key={id}
              onClick={() => setOpen(active ? null : id)}
              className={`flex items-center gap-1.5 border-r border-slate-200 px-4 py-2 text-xs font-medium transition-colors ${
                active ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          )
        })}
      </div>
      <div
        className="overflow-hidden transition-[max-height] duration-200 ease-out"
        style={{ maxHeight: open ? OPEN_HEIGHT : 0 }}
      >
        <div className="overflow-auto p-3" style={{ maxHeight: OPEN_HEIGHT }}>
          {open === 'songs' && <SongsDrawerTab onDone={close} />}
          {open === 'scripture' && <ScriptureDrawerTab onDone={close} />}
          {open === 'announcements' && <AnnouncementsDrawerTab onDone={close} />}
          {open === 'backgrounds' && <BackgroundsDrawerTab onDone={close} />}
        </div>
      </div>
    </div>
  )
}

export default LiveDrawer
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/LiveDrawer.tsx
git commit -m "feat(drawer): LiveDrawer tab-strip shell with slide animation"
```

---

## Task 9: Mount the drawer in `LiveView`

**Files:**
- Modify: `src/renderer/src/LiveView.tsx`

- [ ] **Step 1: Restructure to a column layout with the drawer below**

Replace the full contents of `src/renderer/src/LiveView.tsx`:

```tsx
import SlideGrid from './SlideGrid'
import LiveTools from './LiveTools'
import LiveDrawer from './LiveDrawer'

// The Live tab: the click-a-slide grid + the right-hand tools panel, with the
// bottom content drawer (Songs/Scripture/Announcements/Backgrounds) docked
// below both. (The loaded service + output preview live in the shell's left
// rail — ServiceRail — which stays above the drawer, outside this component.)
// Keyboard shortcuts (B/L/N/P/S) are now handled globally in AppShell.
function LiveView(): JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        <SlideGrid />
        <LiveTools />
      </div>
      <LiveDrawer />
    </div>
  )
}

export default LiveView
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/LiveView.tsx
git commit -m "feat(drawer): mount LiveDrawer on the Live tab"
```

---

## Task 10: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: PASS (node + web).

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: PASS — the existing suite plus the 4 new `resolveBackgroundApply.test.ts` assertions, no regressions.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual smoke test (documented, run in `npm run dev`)**

Document these steps for the check-through:
1. Open the Live tab with a service loaded. Confirm `SlideGrid` is full height and only the tab strip shows at the bottom (drawer collapsed).
2. Click **Songs** → drawer slides open smoothly. Type a search term → results filter. Click a song → it appears in `ServiceRail`, goes live on the projector, and the drawer slides closed.
3. Click **Songs** again (same tab, now closed) → confirm it re-collapses if you click it while already open, or opens if closed — verify the toggle behavior both ways.
4. Click **Scripture** → type a reference → Go (or Enter) → same add-then-live-then-close behavior. Try an invalid reference → confirm a toast appears and nothing goes live.
5. Click **Announcements** → same add-then-live flow.
6. With something live, click **Backgrounds** → click a thumbnail → confirm the live projector output updates. Try this with a live *song* item and a live *text* item to exercise both `resolveBackgroundApply` branches.
7. Clear the active service (no service loaded) → try adding a song from the drawer → confirm a toast ("Load a service first") instead of a crash.
8. With nothing live, click a background → confirm the "Nothing is live yet" toast.
9. Open a tab, press **Escape** → confirm the drawer closes.
10. Confirm Volunteer mode and Build Service are visually and functionally unchanged.

- [ ] **Step 5: Commit** (only if fixes were needed during the smoke test)

```bash
git add -A
git commit -m "test: verify Live tab bottom drawer end-to-end"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** scope (Live tab only, Volunteer mode/Build Service untouched — Task 9 confirms `LiveView` is the only mount point) ✓; tab set + placement (Task 8, docked under SlideGrid+LiveTools, `ServiceRail` unaffected since it lives in `AppShell`, outside `LiveView`) ✓; collapsed-by-default + animated open/close + toggle-to-close + Escape (Task 8) ✓; Songs/Scripture/Announcements add-then-go-live through `sendItemLive()` (Tasks 3–6) ✓; Backgrounds apply-to-live-item (Tasks 2, 7) ✓; error handling — no active service, nothing live, failed scripture lookup (Tasks 1, 3, 5, 7) ✓; testing convention — pure logic tested, UI verified by hand (Tasks 2, 10) ✓; Backgrounds scoped to file selection only, no theme/color editing (Task 7 has no theme UI) ✓.
- **Placeholder scan:** none — every step has complete code.
- **Type consistency:** `NewServiceItem`, `ServiceItem`, `SongSummary`, `AnnouncementSummary`, `LiveState` used identically to their `shared/types.ts` definitions across Tasks 2–7; `addAndGoLive(serviceId, newItem, reloadActiveService): Promise<boolean>` (Task 3) is called with matching arguments in Tasks 4–6; `resolveBackgroundApply(item, path): BackgroundApplyAction` (Task 2) is consumed with matching discriminated-union handling in Task 7; `notifyLocal(message, level?)` (Task 1) is imported and called identically in Tasks 3 and 7; every drawer tab component takes `{ onDone: () => void }` and is invoked that way from `LiveDrawer` (Task 8).
