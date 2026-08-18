# Control Room Layout Redesign — Live Control (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Live Control screen (today's "Live" tab) to the layout approved in `docs/superpowers/specs/2026-08-17-control-room-layout-design.md` §3 — a run-of-show-only left rail, a CURRENT/NEXT/AFTER-NEXT triptych replacing the click-any-slide grid, a right panel combining Presenter Notes + zone status + Looks + a new Service Controls drawer, and a bottom outputs strip + Scene Selector bar.

**Architecture:** This is the bigger of the two Phase implementations — it changes the core interaction model (step-through instead of click-any-slide) and relocates several pieces of genuinely safety-critical logic (tap-to-confirm, Stage Rehearsal, zone connectivity). Per the approved spec, every relocation reuses the existing component/hook that already implements that logic — nothing gets rewritten from scratch. Two small new pieces of *real* new logic: (1) client-side NEXT/AFTER-NEXT resolution (pure, since `LiveState.next` from the main process only looks one slide ahead within the current item, never across an item boundary), and (2) the Service Control Mode Mapping (a new tiny settings blob, explicitly called out as the one new data-model piece in the approved spec).

**Tech Stack:** Electron + React + TypeScript + Tailwind CSS v3 + Vitest.

**Out of scope:** Home, Volunteer mode, Media/Library screens, OBS controls (Setup's OBS Connect page is the only place to manage OBS), the Yamaha mixer integration, Stage Rehearsal's own UI/behavior (`StageRehearsalTools.tsx` is already fully dark-themed and functionally untouched by this plan — it keeps appearing as its own right-side panel when armed, unchanged).

---

## File structure

- Create: `src/renderer/src/liveUpcoming.ts` — pure NEXT/AFTER-NEXT slide resolution, crossing item boundaries
- Create: `src/renderer/src/liveUpcoming.test.ts`
- Create: `src/shared/serviceControlModes.ts` — the new `ServiceControlModeMapping` type + defaults + resolve/parse/validate (mirrors `zoneScenes.ts`'s style)
- Create: `src/shared/serviceControlModes.test.ts`
- Modify: `src/main/index.ts` — new `wf:service-control-modes:get`/`:set` IPC handlers
- Modify: `src/preload/index.ts` — expose `serviceControlModesGet`/`serviceControlModesSet`
- Modify: `src/renderer/src/PresenterPanel.tsx` — finish dark-theme (still fully light-themed, discovered during planning)
- Modify: `src/renderer/src/StageMessagePanel.tsx` — finish dark-theme (same)
- Modify: `src/renderer/src/TimingPanel.tsx` — finish dark-theme (same)
- Create: `src/renderer/src/live/LiveTriptych.tsx` — CURRENT/NEXT/AFTER-NEXT, replaces `SlideGrid` for the main track
- Create: `src/renderer/src/live/OutputsStrip.tsx` — the 4 zone tiles laid out horizontally
- Create: `src/renderer/src/live/ServiceControlsDrawer.tsx` — Sermon/Worship/Invitation Mode, All Mics Muted, Livestream Check, Quick Cues, Timer
- Modify: `src/renderer/src/ServiceRail.tsx` — narrow to run-of-show only; add search icon opening `QuickSearchOverlay`; remove `LiveZoneStatus`/`LooksPanel`
- Modify: `src/renderer/src/LiveView.tsx` — assemble the new layout
- Modify: `src/renderer/src/LiveTools.tsx` — becomes the right-panel assembly (Presenter Notes, Stage Message, Timing, relocated `LiveZoneStatus`/`LooksPanel`, new `ServiceControlsDrawer`); Safety Reset moves out of `LooksPanel.tsx` into here, prominently
- Modify: `src/renderer/src/zones/LooksPanel.tsx` — Safety Reset button removed (relocated to `LiveTools.tsx`)
- `src/renderer/src/SlideGrid.tsx` — UNCHANGED. It's still genuinely used for the Second track / Stage Rehearsal (`LiveView.tsx`'s `{stageRehearsalActive && <SlideGrid track="second" />}`), which is out of scope for this plan — only its main-track call site is swapped for `LiveTriptych` in Task 9. Not deleted.

---

### Task 1: `liveUpcoming.ts` — pure NEXT/AFTER-NEXT resolution

**Files:**
- Create: `src/renderer/src/liveUpcoming.ts`
- Test: `src/renderer/src/liveUpcoming.test.ts`

`LiveState.next` (set by the main process as `lines[t.index + 1] ?? ''`, per `src/main/index.ts`) only looks one slide ahead *within the current item* — it's `''` at the last slide of an item, with no cross-item lookahead. The CURRENT/NEXT/AFTER-NEXT triptych needs to look further, correctly crossing item boundaries. Rather than changing the main process (out of scope per the approved spec — "no new IPC"), compute this client-side from data the renderer already fetches today (`SlideGrid.tsx` already fetches per-item slide arrays via `window.wf.serviceSlides()`, and `ServiceRail.tsx`'s `goNext` already does exactly this kind of same-item-boundary-crossing lookahead for its own purposes).

- [ ] **Step 1: Write the pure resolver**

```ts
// src/renderer/src/liveUpcoming.ts
import type { ServiceItem, TrackId } from '../../shared/types'
import { canGoLive } from './liveActions'

export interface UpcomingSlide {
  itemId: number
  itemTitle: string
  slideIndex: number
  text: string
}

// Flattens every go-live-able item's slides (in service order, current track
// only) into one sequence, finds where the live cursor currently sits in that
// sequence, and returns the next two entries — crossing item boundaries
// transparently. This is the client-side equivalent of what a "next slide"
// preview means once you stop thinking item-by-item and start thinking of the
// whole service as one long deck, which is exactly the mental model the
// CURRENT/NEXT/AFTER-NEXT triptych is asking the operator to adopt.
export function resolveUpcoming(
  items: ServiceItem[],
  track: TrackId,
  slidesByItemId: Record<number, string[]>,
  liveItemId: number | null,
  liveIndex: number
): { next: UpcomingSlide | null; afterNext: UpcomingSlide | null } {
  const eligible = items.filter((it) => it.track === track).filter(canGoLive)

  const flat: UpcomingSlide[] = []
  for (const it of eligible) {
    // Same fallback SlideGrid.tsx uses when an item's slides haven't loaded
    // yet (or genuinely has none) — one empty-text slot rather than skipping
    // the item entirely, so the flat sequence's indices still line up with
    // what SlideGrid/the live engine consider "slide 0" of that item.
    const slides = slidesByItemId[it.id] ?? ['']
    slides.forEach((text, slideIndex) => {
      flat.push({ itemId: it.id, itemTitle: it.title, slideIndex, text })
    })
  }

  if (liveItemId == null) {
    // Nothing live yet: "next" is the very first eligible slide in the
    // service, "after next" the one after that — lets the triptych show a
    // useful preview before the operator has pressed anything.
    return { next: flat[0] ?? null, afterNext: flat[1] ?? null }
  }

  const pos = flat.findIndex((s) => s.itemId === liveItemId && s.slideIndex === liveIndex)
  if (pos === -1) {
    // The live item/slide isn't in this track's eligible flat sequence at all
    // (e.g. it went live from a source this function doesn't see, or the
    // service changed underneath it) — nothing meaningful to preview rather
    // than guessing.
    return { next: null, afterNext: null }
  }

  return { next: flat[pos + 1] ?? null, afterNext: flat[pos + 2] ?? null }
}
```

- [ ] **Step 2: Test it**

```ts
// src/renderer/src/liveUpcoming.test.ts
import { describe, it, expect } from 'vitest'
import { resolveUpcoming } from './liveUpcoming'
import type { ServiceItem } from '../../shared/types'

function item(overrides: Partial<ServiceItem>): ServiceItem {
  return {
    id: 1, ordinal: 0, type: 'song', ref_id: 1, payload: {}, title: 'x',
    notes: null, style: null, zoneRouting: null, track: 'main', ...overrides
  }
}

describe('resolveUpcoming', () => {
  const items = [
    item({ id: 1, title: 'Welcome Song', type: 'song', ref_id: 1 }),
    item({ id: 2, title: 'Scripture Reading', type: 'scripture', ref_id: null, payload: { reference: 'John 3:16' } }),
    item({ id: 3, title: 'Sermon', type: 'sermon' }),
  ]
  const slides = {
    1: ['Welcome slide 1', 'Welcome slide 2'],
    2: ['John 3:16 text'],
    3: ['Sermon title', 'Sermon point 1'],
  }

  it('returns the first two slides when nothing is live yet', () => {
    const { next, afterNext } = resolveUpcoming(items, 'main', slides, null, 0)
    expect(next).toEqual({ itemId: 1, itemTitle: 'Welcome Song', slideIndex: 0, text: 'Welcome slide 1' })
    expect(afterNext).toEqual({ itemId: 1, itemTitle: 'Welcome Song', slideIndex: 1, text: 'Welcome slide 2' })
  })

  it('looks ahead within the same item when not at its last slide', () => {
    const { next, afterNext } = resolveUpcoming(items, 'main', slides, 1, 0)
    expect(next).toEqual({ itemId: 1, itemTitle: 'Welcome Song', slideIndex: 1, text: 'Welcome slide 2' })
    expect(afterNext).toEqual({ itemId: 2, itemTitle: 'Scripture Reading', slideIndex: 0, text: 'John 3:16 text' })
  })

  it('crosses an item boundary for next when at the last slide of the current item', () => {
    const { next, afterNext } = resolveUpcoming(items, 'main', slides, 1, 1)
    expect(next).toEqual({ itemId: 2, itemTitle: 'Scripture Reading', slideIndex: 0, text: 'John 3:16 text' })
    expect(afterNext).toEqual({ itemId: 3, itemTitle: 'Sermon', slideIndex: 0, text: 'Sermon title' })
  })

  it('crosses TWO item boundaries when the next item has only one slide', () => {
    const { next, afterNext } = resolveUpcoming(items, 'main', slides, 2, 0)
    expect(next).toEqual({ itemId: 3, itemTitle: 'Sermon', slideIndex: 0, text: 'Sermon title' })
    expect(afterNext).toEqual({ itemId: 3, itemTitle: 'Sermon', slideIndex: 1, text: 'Sermon point 1' })
  })

  it('returns null for both at the end of the service', () => {
    const { next, afterNext } = resolveUpcoming(items, 'main', slides, 3, 1)
    expect(next).toBeNull()
    expect(afterNext).toBeNull()
  })

  it('returns null for afterNext but a real next one slide before the end', () => {
    const { next, afterNext } = resolveUpcoming(items, 'main', slides, 3, 0)
    expect(next).toEqual({ itemId: 3, itemTitle: 'Sermon', slideIndex: 1, text: 'Sermon point 1' })
    expect(afterNext).toBeNull()
  })

  it('excludes items on a different track', () => {
    const mixed = [...items, item({ id: 4, title: 'Second track song', track: 'second' })]
    const { next } = resolveUpcoming(mixed, 'main', slides, null, 0)
    expect(next?.itemId).not.toBe(4)
  })

  it('excludes items that cannot go live (e.g. an empty scripture reference)', () => {
    const withUnready = [item({ id: 1, title: 'Ready', type: 'song', ref_id: 1 }), item({ id: 2, title: 'Not ready', type: 'scripture', payload: {} })]
    const { next } = resolveUpcoming(withUnready, 'main', { 1: ['a'] }, null, 0)
    expect(next?.itemId).toBe(1)
  })

  it('returns null/null when the live position is not found in the eligible sequence', () => {
    const { next, afterNext } = resolveUpcoming(items, 'main', slides, 999, 0)
    expect(next).toBeNull()
    expect(afterNext).toBeNull()
  })
})
```

Run: `npm test -- liveUpcoming`.

- [ ] **Step 3: Typecheck, test, commit**

Run: `npm run typecheck` (NOT `npx tsc --noEmit -p .` — a documented no-op in this repo).
Run: `npm test` — expect the new tests passing, 0 regressions (baseline 427 as of the Build Service stage).

```bash
git add src/renderer/src/liveUpcoming.ts src/renderer/src/liveUpcoming.test.ts
git commit -m "feat: add client-side NEXT/AFTER-NEXT slide resolution, crossing item boundaries"
```

---

### Task 2: `serviceControlModes.ts` — the Service Control Mode Mapping

**Files:**
- Create: `src/shared/serviceControlModes.ts`
- Test: `src/shared/serviceControlModes.test.ts`

The one new, small data-model piece the approved spec calls out: Sermon/Worship/Invitation Mode buttons need to know which of the church's own (user-editable, no fixed IDs) scene presets each one applies. This module is pure logic — the settings persistence (Task 3) and the UI (Task 7) both depend on it.

- [ ] **Step 1: Write the module**

```ts
// src/shared/serviceControlModes.ts
// A small, user-editable mapping from the 3 Service Control mode buttons to
// one of the church's own zone-routing scene presets (see zoneScenes.ts —
// scene IDs are NOT fixed, a church might not have anything named "Sermon" or
// "Focus"). Mirrors zoneScenes.ts's parse/validate/default-on-missing style
// so both settings blobs behave the same way under corruption or a fresh
// install.
import type { SceneConfig, SceneDef } from './zoneScenes'

export type ServiceControlMode = 'sermon' | 'worship' | 'invitation'

export interface ServiceControlModeMapping {
  sermon?: string    // sceneId
  worship?: string   // sceneId
  invitation?: string // sceneId
}

// References the STARTER_SCENES ids from zoneScenes.ts, so this works out of
// the box for a church that hasn't customized their scene palette yet.
export const DEFAULT_MODE_MAPPING: ServiceControlModeMapping = {
  sermon: 'focus',
  worship: 'lyrics-tvs-only',
  invitation: 'everywhere',
}

export function validateServiceControlModeMapping(x: unknown): x is ServiceControlModeMapping {
  if (typeof x !== 'object' || x === null) return false
  const m = x as Record<string, unknown>
  for (const key of ['sermon', 'worship', 'invitation']) {
    if (key in m && m[key] !== undefined && typeof m[key] !== 'string') return false
  }
  return true
}

// Never throws; anything unusable yields the default mapping — same
// defensive philosophy as zoneScenes.ts's parseSceneConfig.
export function parseServiceControlModeMapping(json: string | null): ServiceControlModeMapping {
  if (!json) return DEFAULT_MODE_MAPPING
  try {
    const parsed = JSON.parse(json)
    return validateServiceControlModeMapping(parsed) ? parsed : DEFAULT_MODE_MAPPING
  } catch {
    return DEFAULT_MODE_MAPPING
  }
}

// Resolves a mode button to the actual SceneDef it should apply, or null if
// the mapped sceneId doesn't exist in the church's CURRENT scene config
// (customized away, or deleted) — callers use null to disable the button
// with an explanatory tooltip rather than silently doing nothing or crashing,
// per the approved spec's error-handling section.
export function resolveModeScene(
  mode: ServiceControlMode,
  mapping: ServiceControlModeMapping,
  config: SceneConfig
): SceneDef | null {
  const sceneId = mapping[mode]
  if (!sceneId) return null
  return config.scenes.find((s) => s.id === sceneId) ?? null
}
```

- [ ] **Step 2: Test it**

```ts
// src/shared/serviceControlModes.test.ts
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_MODE_MAPPING, parseServiceControlModeMapping, validateServiceControlModeMapping, resolveModeScene
} from './serviceControlModes'
import { starterConfig } from './zoneScenes'

describe('validateServiceControlModeMapping', () => {
  it('accepts an empty object', () => { expect(validateServiceControlModeMapping({})).toBe(true) })
  it('accepts all 3 keys as strings', () => {
    expect(validateServiceControlModeMapping({ sermon: 'a', worship: 'b', invitation: 'c' })).toBe(true)
  })
  it('rejects a non-object', () => {
    expect(validateServiceControlModeMapping('nope')).toBe(false)
    expect(validateServiceControlModeMapping(null)).toBe(false)
  })
  it('rejects a non-string value for a known key', () => {
    expect(validateServiceControlModeMapping({ sermon: 5 })).toBe(false)
  })
})

describe('parseServiceControlModeMapping', () => {
  it('returns the default mapping for null input', () => {
    expect(parseServiceControlModeMapping(null)).toEqual(DEFAULT_MODE_MAPPING)
  })
  it('returns the default mapping for invalid JSON', () => {
    expect(parseServiceControlModeMapping('{not json')).toEqual(DEFAULT_MODE_MAPPING)
  })
  it('returns the default mapping for valid JSON that fails validation', () => {
    expect(parseServiceControlModeMapping('{"sermon":5}')).toEqual(DEFAULT_MODE_MAPPING)
  })
  it('parses a real custom mapping', () => {
    expect(parseServiceControlModeMapping('{"sermon":"my-scene"}')).toEqual({ sermon: 'my-scene' })
  })
})

describe('resolveModeScene', () => {
  const config = starterConfig()

  it('resolves the default mapping against the starter scene palette', () => {
    expect(resolveModeScene('sermon', DEFAULT_MODE_MAPPING, config)?.id).toBe('focus')
    expect(resolveModeScene('worship', DEFAULT_MODE_MAPPING, config)?.id).toBe('lyrics-tvs-only')
    expect(resolveModeScene('invitation', DEFAULT_MODE_MAPPING, config)?.id).toBe('everywhere')
  })
  it('returns null when the mapped sceneId does not exist in the current config', () => {
    expect(resolveModeScene('sermon', { sermon: 'deleted-scene' }, config)).toBeNull()
  })
  it('returns null when the mode has no mapping at all', () => {
    expect(resolveModeScene('sermon', {}, config)).toBeNull()
  })
})
```

Run: `npm test -- serviceControlModes`.

- [ ] **Step 3: Typecheck, test, commit**

Run: `npm run typecheck` — must be clean.
Run: `npm test` — expect 0 regressions.

```bash
git add src/shared/serviceControlModes.ts src/shared/serviceControlModes.test.ts
git commit -m "feat: add Service Control Mode Mapping (sermon/worship/invitation scene shortcuts)"
```

---

### Task 3: Main process + preload — persist the Service Control Mode Mapping

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

This mirrors the existing `wf:scenes:get`/`wf:scenes:set` pattern exactly (same file, search for `'wf:scenes:get'` to find it — it's near `// --- Scene palette (Build Service screen scenes) ---`).

- [ ] **Step 1: Add the IPC handlers to `src/main/index.ts`**

Find the existing scene-palette handlers:
```ts
// --- Scene palette (Build Service screen scenes) ---
ipcMain.handle('wf:scenes:get', () => parseSceneConfig(getSetting('zone_scenes')))
ipcMain.handle('wf:scenes:set', (_e, config: SceneConfig) => {
  if (!validateSceneConfig(config)) throw new Error('Invalid scene configuration')
  setSetting('zone_scenes', JSON.stringify(config))
  broadcast() // typeDefaults may have changed → zones with default routing re-resolve
})
```

Add the import at the top of the file, alongside the existing `zoneScenes` import (find `import { parseSceneConfig, validateSceneConfig } from '../shared/zoneScenes'` or similar and add a line right after it):
```ts
import { parseServiceControlModeMapping, validateServiceControlModeMapping } from '../shared/serviceControlModes'
import type { ServiceControlModeMapping } from '../shared/serviceControlModes'
```

Add the new handlers directly after the scene-palette ones:
```ts
// --- Service Control mode mapping (Live Control's Sermon/Worship/Invitation
// Mode shortcuts — which of the church's own scene presets each one applies) ---
ipcMain.handle('wf:service-control-modes:get', () => parseServiceControlModeMapping(getSetting('service_control_mode_mapping')))
ipcMain.handle('wf:service-control-modes:set', (_e, mapping: ServiceControlModeMapping) => {
  if (!validateServiceControlModeMapping(mapping)) throw new Error('Invalid service control mode mapping')
  setSetting('service_control_mode_mapping', JSON.stringify(mapping))
})
```

No `broadcast()` call needed here (unlike `wf:scenes:set`) — this mapping doesn't affect any zone's currently-rendered routing by itself, only what happens the next time an operator clicks a mode button, which already triggers its own `zoneSetRouting` call (and that call's existing handler already broadcasts).

- [ ] **Step 2: Expose it in `src/preload/index.ts`**

Find `scenesGet`/`scenesSet` (search for `'wf:scenes:get'`) and add the new methods right after them, matching the exact same style:

```ts
  serviceControlModesGet: (): Promise<ServiceControlModeMapping> => ipcRenderer.invoke('wf:service-control-modes:get'),
  serviceControlModesSet: (mapping: ServiceControlModeMapping): Promise<void> => ipcRenderer.invoke('wf:service-control-modes:set', mapping),
```

Add the corresponding import at the top of the file, alongside the existing `SceneConfig` import: `import type { ServiceControlModeMapping } from '../shared/serviceControlModes'`.

**Important**: this file likely also has a TypeScript interface/type declaration for the full shape of `window.wf` (check for something like `interface WfApi { scenesGet: ... }` or a `contextBridge.exposeInMainWorld('wf', { ... })` call whose object literal itself IS the type via inference, plus a separate `.d.ts` declaring `declare global { interface Window { wf: ... } }`). Find wherever `scenesGet`/`scenesSet` are type-declared (not just where they're implemented) and add matching declarations for `serviceControlModesGet`/`serviceControlModesSet` there too, or `npm run typecheck` will fail on every renderer file that references `window.wf.serviceControlModesGet`.

- [ ] **Step 3: Typecheck, test, commit**

Run: `npm run typecheck` — must be clean (this task touches main-process code — `typecheck:node` is what would catch a mistake here, make sure it passes, not just `typecheck:web`).
Run: `npm test` — expect 0 regressions. If any existing test mocks/stubs the full `window.wf` shape (grep for `window.wf =` or a shared test-setup file), add the two new methods to that mock so tests referencing them later (Task 7) don't fail for an unrelated reason.

```bash
git add src/main/index.ts src/preload/index.ts
git commit -m "feat: add wf:service-control-modes IPC (get/set), mirrors the existing scenes pattern"
```

---

### Task 4: Finish dark-theming `PresenterPanel.tsx`, `StageMessagePanel.tsx`, `TimingPanel.tsx`

All three are still fully light-themed (leftover from before the color redesign — discovered while reading them for this plan). They're directly in scope: the approved spec's "Right — Presenter Notes" section explicitly reuses `PresenterPanel`, and `StageMessagePanel`/`TimingPanel` are siblings inside `LiveTools.tsx`, which this plan relocates into the new right panel (Task 8) — carrying their light-theme styling forward unfixed would put three visibly broken light panels in the middle of an otherwise dark screen.

**Files:**
- Modify: `src/renderer/src/PresenterPanel.tsx`
- Modify: `src/renderer/src/StageMessagePanel.tsx`
- Modify: `src/renderer/src/TimingPanel.tsx`

**Confirmed dark palette tokens:** `bg-app` (#0b0f1a), `bg-panel` (#131a29), `bg-panel-raised` (#1c2536), `text-content-primary` (#efe7d8), `text-content-secondary` (#a89e8c), `text-content-tertiary` (#6f6858), `border-border` (#212a3d), `border-border-strong` (#2f3b52), `blue-300/400/500/600` for selection/links.

All three files use the shared `.surface`/`.section-header`/`.badge*` classes (already dark-themed globally in `main.css` from the Foundation stage) for their outer structure — only the manually-hardcoded `slate-*`/`white`-family classes inside them need conversion.

- [ ] **Step 1: `PresenterPanel.tsx`**

Read the file first. Convert: elapsed-time readout `text-blue-700` → `text-blue-400`. "No item loaded" / all 4 `text-slate-500`/`text-slate-400`/`text-slate-700` instances → `text-content-secondary` (the `text-slate-400` sub-caption under "No notes for this item" specifically → `text-content-tertiary`, matching the established secondary/tertiary distinction used everywhere else in this app — a sub-caption below the main message is the tertiary case). `.surface` nested inside another `.surface` (the notes-scroll box) needs no extra work — `.surface` is already a shared dark class.

- [ ] **Step 2: `StageMessagePanel.tsx`**

Read the file first. Convert: empty-quick-messages text `text-slate-400` → `text-content-tertiary`. The editing-presets box: `bg-white border-slate-200` → `bg-panel-raised border-border` (nested one level inside `.surface`, which per `main.css` is already `bg-panel` — raising to `bg-panel-raised` here is correct, matching the depth convention used throughout this app's dark redesign).

- [ ] **Step 3: `TimingPanel.tsx`**

Read the file first. Convert: font-scale readout `text-slate-500` → `text-content-secondary`. Divider `border-slate-200` → `border-border`. Auto-advance progress track `bg-slate-100` → `bg-panel-raised` (nested inside `.surface`/`bg-panel`, same reasoning as Step 2). Loop-checkbox label `text-slate-600` → `text-content-secondary`.

- [ ] **Step 4: Typecheck, test, commit**

Run: `npm run typecheck` — must be clean.
Run: `npm test` — expect 0 regressions.
Grep all three files for leftover `slate-`/`bg-white` and confirm zero remain.

```bash
git add src/renderer/src/PresenterPanel.tsx src/renderer/src/StageMessagePanel.tsx src/renderer/src/TimingPanel.tsx
git commit -m "feat(theme): dark-palette PresenterPanel, StageMessagePanel, TimingPanel"
```

---

### Task 5: `LiveTriptych.tsx` — CURRENT / NEXT / AFTER NEXT

**Files:**
- Create: `src/renderer/src/live/LiveTriptych.tsx`

Replaces `SlideGrid` for the main track (the click-any-slide grid). Reads the same `LiveState` `LiveTools.tsx` already consumes, plus `resolveUpcoming` (Task 1) for the NEXT/AFTER-NEXT preview text. Advancing still goes through the existing `sendIntent`/keyboard-shortcut path (unchanged, handled in `AppShell.tsx`) — this component's own click handlers are a convenience on top of that, not a replacement for it.

- [ ] **Step 1: Write the component**

```tsx
// src/renderer/src/live/LiveTriptych.tsx
import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { LiveState, TrackId } from '../../../shared/types'
import { useService } from '../ServiceContext'
import { resolveUpcoming } from '../liveUpcoming'

// Replaces the click-any-slide SlideGrid for the main track. CURRENT/NEXT are
// read straight off LiveState (main process already computes them); AFTER
// NEXT needs the client-side lookahead in liveUpcoming.ts since the main
// process's own `next` field never looks past the current item's own slides.
function LiveTriptych({ track }: { track: TrackId }): JSX.Element {
  const { activeService } = useService()
  const [live, setLive] = useState<LiveState | null>(null)
  const [slides, setSlides] = useState<Record<number, string[]>>({})

  useEffect(() => {
    const off = window.wf.onState((s) => setLive(track === 'main' ? s.main : s.second))
    window.wf.getState(track).then(setLive)
    return off
  }, [track])

  useEffect(() => {
    if (activeService == null) { setSlides({}); return }
    window.wf.serviceSlides(activeService.id).then((rows) => {
      const map: Record<number, string[]> = {}
      rows.forEach((r) => { map[r.id] = r.slides })
      setSlides(map)
    })
  }, [activeService?.id, activeService?.items.length])

  if (!activeService) {
    return <div className="flex h-full min-w-0 flex-1 items-center justify-center text-sm text-content-secondary">No service loaded — pick one in the Services tab.</div>
  }

  const { next, afterNext } = resolveUpcoming(
    activeService.items,
    track,
    slides,
    live?.liveServiceItemId ?? null,
    live?.index ?? 0
  )

  const advance = (): void => { void window.wf.sendIntent(track, 'next') }

  const progressPct = live && live.total > 0 ? ((live.index + 1) / live.total) * 100 : 0

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col gap-3 overflow-auto p-3">
      {/* CURRENT — large, dominant */}
      <div className="card-lg flex min-h-0 flex-[3] flex-col justify-center gap-3 p-6">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-content-secondary">
          <span>{live?.songTitle || 'Current'}</span>
          {live && live.total > 0 && <span className="tabular-nums">Slide {live.index + 1} of {live.total}</span>}
        </div>
        <p className="whitespace-pre-line text-center text-3xl font-semibold leading-snug text-content-primary">
          {live?.line || <span className="italic text-content-tertiary">Nothing live</span>}
        </p>
        {live && live.total > 0 && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-raised">
            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </div>

      {/* NEXT — clearly secondary, clickable as a convenience (the real
          advance path is the existing keyboard shortcuts / sendIntent, this
          just gives the same action a visible on-screen target) */}
      <button
        onClick={advance}
        disabled={!next}
        title={next ? 'Click to advance' : 'End of service'}
        className="card-lg flex min-h-0 flex-[2] flex-col justify-center gap-1.5 p-4 text-left transition-colors hover:bg-panel-raised disabled:cursor-default disabled:hover:bg-transparent"
      >
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-content-secondary">
          <span className="inline-flex items-center gap-1"><ChevronRight size={13} /> Next</span>
          {next && next.itemTitle && <span className="truncate text-content-tertiary">{next.itemTitle}</span>}
        </div>
        <p className="whitespace-pre-line text-xl font-medium text-content-primary">
          {next?.text || <span className="italic text-content-tertiary">End of service</span>}
        </p>
      </button>

      {/* AFTER NEXT — small, thumbnail-only preview */}
      <div className="card-lg flex min-h-0 flex-1 items-center gap-2 p-3">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-content-tertiary">After next</span>
        <p className="min-w-0 flex-1 truncate text-sm text-content-secondary">
          {afterNext?.text || <span className="italic text-content-tertiary">—</span>}
        </p>
      </div>
    </div>
  )
}

export default LiveTriptych
```

- [ ] **Step 2: Typecheck and commit**

Run: `npm run typecheck` — must be clean (this component isn't wired into `LiveView.tsx` yet — that's Task 8 — so this is a standalone compile check for now).
Run: `npm test` — expect 0 regressions.

```bash
git add src/renderer/src/live/LiveTriptych.tsx
git commit -m "feat: add LiveTriptych (CURRENT/NEXT/AFTER-NEXT), not yet wired into LiveView"
```

---

### Task 6: `OutputsStrip.tsx` — the 4 zone tiles, horizontal

**Files:**
- Create: `src/renderer/src/live/OutputsStrip.tsx`

Reuses `ZoneStatusBox` (already built with a `connected` prop from the Setup-stage dark redesign) exactly as `LiveZoneStatus.tsx` does today, just laid out in a single row instead of a 2×2 grid, and using the real zone names (Back Left, Back Right, Lyrics TVs, Stage Monitors — no relabeling per Ryan's explicit decision during brainstorming).

- [ ] **Step 1: Write the component**

```tsx
// src/renderer/src/live/OutputsStrip.tsx
import { useCallback, useEffect, useState } from 'react'
import type { AppInfo, ZoneId, ZoneState } from '../../../shared/types'
import ZoneStatusBox from '../zones/ZoneStatusBox'

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

// Live Control's bottom outputs strip — same data/logic as LiveZoneStatus
// (Setup's ZoneLiveGrid and this share ZoneStatusBox so they can never
// disagree), laid out horizontally instead of a 2x2 grid to fit a bottom bar.
function OutputsStrip(): JSX.Element {
  const [zoneStates, setZoneStates] = useState<Record<ZoneId, ZoneState> | null>(null)
  const [zonesConnected, setZonesConnected] = useState<ZoneId[]>([])

  const refreshStates = useCallback((): void => { void window.wf.zoneGetStates().then(setZoneStates) }, [])

  useEffect(() => {
    refreshStates()
    const off = window.wf.onState(() => refreshStates())
    return off
  }, [refreshStates])

  useEffect(() => {
    const load = (): void => { window.wf.getInfo().then((i: AppInfo) => setZonesConnected(i.zonesConnected)) }
    load()
    const t = setInterval(load, 2000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="grid grid-cols-4 gap-2">
      {ZONE_IDS.map((zoneId) => (
        <div key={zoneId} className="rounded-xl border-2 border-border bg-panel p-2">
          <ZoneStatusBox zoneId={zoneId} zoneState={zoneStates?.[zoneId]} connected={zonesConnected.includes(zoneId)} />
        </div>
      ))}
    </div>
  )
}

export default OutputsStrip
```

This is deliberately near-identical to `LiveZoneStatus.tsx`'s own logic (same hooks, same IPC calls) rather than trying to extract a shared parent — `LiveZoneStatus` itself is being relocated (unchanged) into the right panel in Task 8 for its own separate "Zones" mini-panel purpose (glanceable status while working the run-of-show), while `OutputsStrip` is a new, differently-purposed bottom bar (the primary "are we actually on air" status). Two small components reading the same well-tested IPC calls is an acceptable, contained duplication — not a maintenance trap, matching the precedent already set in the Build Service stage for the bottom Scene Selector bar vs. `ZoneScreenGrid`'s own scene state.

- [ ] **Step 2: Typecheck and commit**

Run: `npm run typecheck` — must be clean.
Run: `npm test` — expect 0 regressions.

```bash
git add src/renderer/src/live/OutputsStrip.tsx
git commit -m "feat: add OutputsStrip (horizontal 4-zone status bar), not yet wired into LiveView"
```

---

### Task 7: `ServiceControlsDrawer.tsx`

**Files:**
- Create: `src/renderer/src/live/ServiceControlsDrawer.tsx`

The collapsible drawer with Sermon/Worship/Invitation Mode, All Mics Muted (stub), Livestream Check (read-only), Quick Cues, and Timer.

- [ ] **Step 1: Write the component**

```tsx
// src/renderer/src/live/ServiceControlsDrawer.tsx
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Mic, MicOff, Radio, Timer as TimerIcon } from 'lucide-react'
import type { ObsStatus, TrackId } from '../../../shared/types'
import type { SceneConfig } from '../../../shared/zoneScenes'
import { expandScene } from '../../../shared/zoneScenes'
import type { ServiceControlMode, ServiceControlModeMapping } from '../../../shared/serviceControlModes'
import { DEFAULT_MODE_MAPPING, resolveModeScene } from '../../../shared/serviceControlModes'
import { useService } from '../ServiceContext'

const MODE_LABEL: Record<ServiceControlMode, string> = {
  sermon: 'Sermon Mode',
  worship: 'Worship Mode',
  invitation: 'Invitation Mode',
}

// Quick Cues fire the same text-overlay path the ticker item type already
// uses (window.wf.liveLoadText), briefly replacing whatever's live with a
// short phrase. Deliberately NOT behind tap-to-confirm: unlike the dense item
// rail or a slide grid (many closely-packed targets where a stray tap is
// likely), this is a sparse row of 4 labeled buttons inside a drawer the
// operator has to deliberately open first — the same "isolated, deliberate
// control, no confirm needed" precedent LiveTools' own Black/Logo/Live row
// already sets.
const QUICK_CUES = ['Applause', 'Amen', 'Bible', 'Thank You']

function ServiceControlsDrawer({ track, liveItemId }: { track: TrackId; liveItemId: number | null }): JSX.Element {
  const { activeService } = useService()
  const [open, setOpen] = useState(true)
  const [sceneConfig, setSceneConfig] = useState<SceneConfig | null>(null)
  const [modeMapping, setModeMapping] = useState<ServiceControlModeMapping>(DEFAULT_MODE_MAPPING)
  const [obs, setObs] = useState<ObsStatus | null>(null)
  const [timerSecs, setTimerSecs] = useState('300')

  useEffect(() => { void window.wf.scenesGet().then(setSceneConfig) }, [])
  useEffect(() => { void window.wf.serviceControlModesGet().then(setModeMapping) }, [])
  useEffect(() => {
    window.wf.obsGetStatus().then(setObs)
    const off = window.wf.obsOnStatus(setObs)
    return off
  }, [])

  const liveItem = activeService?.items.find((it) => it.id === liveItemId) ?? null

  const applyMode = (mode: ServiceControlMode): void => {
    if (!sceneConfig || !liveItem) return
    const scene = resolveModeScene(mode, modeMapping, sceneConfig)
    if (!scene) return
    void window.wf.zoneSetRouting(liveItem.id, expandScene(scene, liveItem.type))
  }

  const fireQuickCue = (phrase: string): void => {
    void window.wf.liveLoadText(track, 'Announcement', phrase)
  }

  const startTimer = (): void => {
    const secs = parseFloat(timerSecs)
    if (isNaN(secs) || secs <= 0) return
    void window.wf.liveLoadCountdown(track, secs, null, undefined)
  }

  return (
    <section className="surface">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
      >
        <h2 className="section-header">Service Controls</h2>
        {open ? <ChevronUp size={14} className="text-content-secondary" /> : <ChevronDown size={14} className="text-content-secondary" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Mode shortcuts */}
          <div className="grid grid-cols-3 gap-1.5">
            {(['sermon', 'worship', 'invitation'] as ServiceControlMode[]).map((mode) => {
              const scene = sceneConfig ? resolveModeScene(mode, modeMapping, sceneConfig) : null
              const disabled = !scene || !liveItem
              return (
                <button
                  key={mode}
                  onClick={() => applyMode(mode)}
                  disabled={disabled}
                  title={
                    !liveItem
                      ? 'Nothing is live yet'
                      : !scene
                      ? `No scene mapped for ${MODE_LABEL[mode]} (or it was deleted) — set one in Setup`
                      : `Apply the "${scene.name}" scene to what's live now`
                  }
                  className="btn text-xs disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {MODE_LABEL[mode]}
                </button>
              )
            })}
          </div>

          {/* All Mics Muted — stub, waiting on the mixer integration */}
          <button
            disabled
            title="Waiting on the mixer integration to be finished — not wired up yet"
            className="btn w-full justify-center text-xs disabled:cursor-not-allowed disabled:opacity-40"
          >
            <MicOff size={13} /> All Mics Muted
          </button>

          {/* Livestream Check — read-only */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-panel-raised px-3 py-2 text-xs">
            <span className="inline-flex items-center gap-1.5 text-content-secondary"><Radio size={13} /> Livestream</span>
            <span className={`font-semibold ${obs?.connected ? 'text-emerald-400' : 'text-content-tertiary'}`}>
              {obs?.connected ? 'OBS connected' : 'OBS not connected'}
            </span>
          </div>

          {/* Quick Cues */}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-content-secondary">Quick Cues</div>
            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_CUES.map((cue) => (
                <button key={cue} onClick={() => fireQuickCue(cue)} className="btn-pill text-xs">
                  <Mic size={11} /> {cue}
                </button>
              ))}
            </div>
          </div>

          {/* Timer */}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-content-secondary">Timer</div>
            <div className="flex gap-1.5">
              <input
                type="number"
                value={timerSecs}
                onChange={(e) => setTimerSecs(e.target.value)}
                className="w-20 text-xs"
                aria-label="Timer seconds"
              />
              <button onClick={startTimer} className="btn-primary flex-1 justify-center text-xs">
                <TimerIcon size={12} /> Start
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default ServiceControlsDrawer
```

- [ ] **Step 2: Typecheck and commit**

Run: `npm run typecheck` — must be clean.
Run: `npm test` — expect 0 regressions.

```bash
git add src/renderer/src/live/ServiceControlsDrawer.tsx
git commit -m "feat: add ServiceControlsDrawer, not yet wired into LiveView"
```

---

### Task 8: Restructure `ServiceRail.tsx` — run-of-show only

**Files:**
- Modify: `src/renderer/src/ServiceRail.tsx`

Narrows `ServiceRail`'s job to just the run-of-show item list (the only way to jump to an arbitrary item, per Ryan's decision to retire the click-any-slide grid). Adds a search icon opening the existing `QuickSearchOverlay`. Removes `LiveZoneStatus` and `LooksPanel` from the bottom of this rail — they relocate into the new right panel in Task 9.

- [ ] **Step 1: Read the current file, remove the pinned bottom sections**

Remove the `<div className="border-t border-border"><LiveZoneStatus /></div>` and `<div className="border-t border-border"><LooksPanel /></div>` blocks (and their now-unused imports) from the bottom of the `<aside>`.

- [ ] **Step 2: Add a search icon that opens `QuickSearchOverlay`**

`QuickSearchOverlay` needs `songs`, `announcements`, `onAddSong`, `onAddAnnouncement`, `onAddScripture`, `onClose`. `ServiceEditor.tsx` already does exactly this for Build Service (its own `songs`/`announcements` state, fetched via `window.wf.songsList()`/`window.wf.announcementsList()`, and its own `addSong`/`addAnnouncement`/`addScripture` handlers calling `window.wf.serviceAddItem`) — mirror that exact pattern here, adapted to `ServiceRail`'s context: it has `activeService`/`reloadActiveService` from `useService()` (not `serviceId`/`reload`/`setSelectedId`, which are Build Service's own local concepts `ServiceRail` doesn't have — there's no "selected item" to move focus to here, the operator finds the newly-added item in the run-of-show list themselves).

`ServiceRail.tsx`'s current `useService()` call only destructures `activeService` (`const { activeService } = useService()`) — change it to also pull `reloadActiveService`: `const { activeService, reloadActiveService } = useService()`.

Add state and fetches:

```ts
  const [songs, setSongs] = useState<SongSummary[]>([])
  const [announcements, setAnnouncements] = useState<AnnouncementSummary[]>([])
  const [showSearch, setShowSearch] = useState(false)
  useEffect(() => { window.wf.songsList().then(setSongs) }, [])
  useEffect(() => { window.wf.announcementsList().then(setAnnouncements) }, [])
```

Add the handlers (using `activeService.id` and `reloadActiveService` from the `useService()` destructure already at the top of this file — track is always `'main'` here, since Live Control's run-of-show is main-track-only, same scope as the rest of this component per its existing `mainItems` filter):

```ts
  const addSongFromSearch = async (songId: number): Promise<void> => {
    if (!activeService) return
    await window.wf.serviceAddItem(activeService.id, { type: 'song', ref_id: songId, track: 'main' })
    reloadActiveService()
    setShowSearch(false)
  }
  const addAnnouncementFromSearch = async (announcementId: number): Promise<void> => {
    if (!activeService) return
    await window.wf.serviceAddItem(activeService.id, { type: 'announcement', ref_id: announcementId, track: 'main' })
    reloadActiveService()
    setShowSearch(false)
  }
  const addScriptureFromSearch = async (reference: string): Promise<void> => {
    if (!activeService) return
    await window.wf.serviceAddItem(activeService.id, { type: 'scripture', payload: { reference }, track: 'main' })
    reloadActiveService()
    setShowSearch(false)
  }
```

Add the search icon button in the rail's header area (near the service name, inside the existing `border-b border-border px-3 py-3` header div), and render the overlay conditionally:

```tsx
<button
  onClick={() => setShowSearch(true)}
  aria-label="Quick search: add a song, announcement, or scripture"
  className="btn-pill text-xs"
>
  <Search size={13} /> Add
</button>
{showSearch && (
  <QuickSearchOverlay
    songs={songs}
    announcements={announcements}
    onAddSong={addSongFromSearch}
    onAddAnnouncement={addAnnouncementFromSearch}
    onAddScripture={addScriptureFromSearch}
    onClose={() => setShowSearch(false)}
  />
)}
```

Add the imports: `Search` from `lucide-react`, `SongSummary`/`AnnouncementSummary` from `'../../shared/types'` (alongside the existing type imports), `QuickSearchOverlay` from `./QuickSearchOverlay`.

- [ ] **Step 3: Typecheck, test, commit**

Run: `npm run typecheck` — must be clean.
Run: `npm test` — expect 0 regressions.

```bash
git add src/renderer/src/ServiceRail.tsx
git commit -m "feat: narrow ServiceRail to run-of-show only, add quick-search"
```

---

### Task 9: Assemble the new layout — `LiveView.tsx`, `LiveTools.tsx`, `LooksPanel.tsx`

**Files:**
- Modify: `src/renderer/src/LiveView.tsx`
- Modify: `src/renderer/src/LiveTools.tsx`
- Modify: `src/renderer/src/zones/LooksPanel.tsx`
- `src/renderer/src/SlideGrid.tsx` — UNCHANGED (only its main-track call site in `LiveView.tsx` is swapped; the file itself stays, still used for Second track / Stage Rehearsal — see Step 2)

The final content task — wires together everything built in Tasks 1-8.

- [ ] **Step 1: `LooksPanel.tsx`  — remove Safety Reset**

Remove the `safetyReset` function and its button (lines with `ShieldAlert`/`Safety Reset`) — it relocates to `LiveTools.tsx` in Step 3 below, more prominent. Remove the now-unused `ShieldAlert` import if nothing else in the file uses it (check first).

- [ ] **Step 2: `LiveView.tsx` — swap `SlideGrid` for `LiveTriptych` on the main track**

Read the current file. Change the import from `SlideGrid` to `LiveTriptych` (`import LiveTriptych from './live/LiveTriptych'`). In the main-track section (`<SlideGrid track="main" />`), replace with `<LiveTriptych track="main" />`. **Leave the Second-track/Stage-Rehearsal section untouched** — `{stageRehearsalActive && <SlideGrid track="second" />}` stays exactly as it is; Stage Rehearsal's own UI is explicitly out of scope for this plan (see the plan header). This means `SlideGrid` is still imported and used for the second track — it is NOT deleted, confirmed once more in Step 5 below.

Add the bottom bar (Outputs strip + Scene Selector) below the existing flex row. You'll need the live item's `zoneRouting`/type for the Scene Selector, and `SceneConfig` — fetch it here the same way `ServiceEditor.tsx` (Build Service) already does for its own bottom bar:

```tsx
  const [sceneConfig, setSceneConfig] = useState<SceneConfig | null>(null)
  useEffect(() => { void window.wf.scenesGet().then(setSceneConfig) }, [])
  const [live, setLive] = useState<LiveState | null>(null)
  useEffect(() => {
    const off = window.wf.onState((s) => setLive(s.main))
    window.wf.getState('main').then(setLive)
    return off
  }, [])
  const { activeService } = useService()
  const liveItem = activeService?.items.find((it) => it.id === live?.liveServiceItemId) ?? null
```

```tsx
      {/* Bottom: outputs + scene selector */}
      <div className="flex flex-col gap-2 border-t border-border p-3">
        <OutputsStrip />
        {liveItem && sceneConfig && (
          <ScenePresetRow
            config={sceneConfig}
            itemType={liveItem.type}
            routing={effectiveRouting(liveItem, sceneConfig)}
            matched={matchScene(effectiveRouting(liveItem, sceneConfig), liveItem.type, sceneConfig)}
            isDefault={liveItem.zoneRouting == null}
            onPick={(sceneId) => {
              const scene = sceneConfig.scenes.find((s) => s.id === sceneId)
              if (!scene) return
              void window.wf.zoneSetRouting(liveItem.id, expandScene(scene, liveItem.type))
            }}
          />
        )}
      </div>
```

Add the necessary imports: `OutputsStrip` from `./live/OutputsStrip`, `ScenePresetRow` from `./ScenePresetRow`, `effectiveRouting`/`matchScene`/`expandScene`/`SceneConfig` type from `../../shared/zoneScenes`, `useService` from `./ServiceContext`.

**Same-shade collision check** (this exact bug class recurred repeatedly in the Build Service phase — check it explicitly here, don't skip it): trace what `LiveView.tsx` is rendered inside (`AppShell.tsx`'s `<main className="min-h-0 flex-1 overflow-hidden"><LiveView /></main>`, itself inside the app's `bg-app` root) and what background this new bottom bar div ends up with. If it needs an explicit background at all (vs. staying transparent against the `bg-app` root, which is a valid non-colliding choice too, unlike nesting inside another already-`bg-panel`/`bg-panel-raised` container), pick one that's genuinely distinct from its real ambient — verify by tracing the actual DOM, don't assume.

- [ ] **Step 3: `LiveTools.tsx` — assemble the new right panel**

Read the current file. Keep the existing emergency-controls row (Black/Logo/Live), keyboard-shortcut strip, `PresenterPanel`, `StageMessagePanel`, `TimingPanel`, and the hymn-timer/verse status strip exactly as they are (all already dark-themed by Task 4, or already dark from before). Add, in this order after the existing content:

1. **Safety Reset**, relocated from `LooksPanel.tsx` (Step 1) — the one deliberately loud, always-visible danger control:
```tsx
      <button
        onClick={() => void window.wf.zoneSafetyReset()}
        title="Force all 4 zones to the logo — screens only, doesn't touch audio"
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/20"
      >
        <ShieldAlert size={13} /> Safety Reset
      </button>
```
(Add the `ShieldAlert` import from `lucide-react`.)

2. **`LiveZoneStatus`** (relocated from `ServiceRail.tsx`, Task 8) — unchanged, just a new import + render location: `<LiveZoneStatus />`.

3. **`LooksPanel`** (relocated from `ServiceRail.tsx`, Task 8; its Safety Reset button already removed in Step 1) — `<LooksPanel />`.

4. **`ServiceControlsDrawer`** (Task 7) — needs `track` (already a prop on `LiveTools`) and `liveItemId` (already computed in this file as `live?.liveServiceItemId` for `PresenterPanel`'s `liveItem` lookup — reuse the same value): `<ServiceControlsDrawer track={track} liveItemId={live?.liveServiceItemId ?? null} />`.

Add the new imports: `ShieldAlert` (lucide-react), `LiveZoneStatus` from `./zones/LiveZoneStatus`, `LooksPanel` from `./zones/LooksPanel`, `ServiceControlsDrawer` from `./live/ServiceControlsDrawer`.

This makes `LiveTools`'s `<aside>` noticeably taller — it already has `overflow-auto`, so it scrolls rather than overflowing the screen; no other change needed for that, just confirm it during Task 10's visual check.

- [ ] **Step 4: `ServiceRail.tsx` — remove now-redundant fetches**

Wait — Task 8 already removed `LiveZoneStatus`/`LooksPanel` FROM `ServiceRail.tsx`. Nothing further needed here in this task; this sub-step exists only to remind you to re-run the full typecheck/test pass (next step) after both files have changed, since a mistake in either file's import/removal could only surface once both are in their final state.

- [ ] **Step 5: Confirm `SlideGrid.tsx` is still genuinely needed — do not delete it**

Grep the whole repo for `SlideGrid` (not just this file) — per the approved spec's own error-handling note ("confirm nothing else imports it before deleting it — it may be reachable from a code path this spec didn't examine"). At this point in the plan, the only remaining import should be `LiveView.tsx`'s second-track/Stage-Rehearsal usage from Step 2 (`{stageRehearsalActive && <SlideGrid track="second" />}`), which this plan deliberately keeps. `SlideGrid.tsx` stays exactly as it is — this step is a verification, not an action.

- [ ] **Step 6: Typecheck, test, commit**

Run: `npm run typecheck` — must be clean.
Run: `npm test` — expect 0 regressions (427 as of the Build Service stage, plus this plan's own new tests from Tasks 1-2).

```bash
git add src/renderer/src/LiveView.tsx src/renderer/src/LiveTools.tsx src/renderer/src/zones/LooksPanel.tsx
git commit -m "feat: assemble Live Control's new layout — triptych, outputs strip, relocated status/Looks/Safety-Reset, Service Controls drawer"
```

---

### Task 10: Verification pass + visual check

**Files:** None modified — verification only.

- [ ] **Step 1: Full typecheck and test suite**

Run: `npm run typecheck`
Run: `npm test`
Expected: both clean, 0 failures.

- [ ] **Step 2: Build and serve**

Run: `npm run build`. Serve `out/renderer` locally (the pattern used throughout this whole redesign — a temporary `.claude/launch.json` pointing `npx --yes serve -l <port> <out/renderer path>`).

- [ ] **Step 3: Manual walkthrough**

With a service loaded and something live (or using the browser-mock's demo service), confirm against the approved mockup and this plan's specific risk areas:
- The run-of-show list in `ServiceRail` is the only way to jump to an arbitrary item; tap-to-confirm still works exactly as before (tap once = arm, tap again on the SAME item = cancel, tap a DIFFERENT item = re-arm).
- `LiveTriptych`'s CURRENT/NEXT/AFTER-NEXT update correctly as you advance — specifically test crossing an item boundary (advance to the last slide of one item, confirm NEXT correctly shows the first slide of the FOLLOWING item, not a blank/broken state) — this is the one genuinely new piece of logic in this whole phase, verify it for real, not just via the unit tests.
- Stage Rehearsal still works exactly as before when armed (starts, steps through songs, the second-track `SlideGrid` still renders) — this plan deliberately didn't touch that code path, confirm it's really untouched.
- Safety Reset is now in `LiveTools`'s right panel, not `LooksPanel`; clicking it still does the same thing (all 4 zones to logo).
- Service Controls drawer: Sermon/Worship/Invitation Mode buttons are disabled with a sensible tooltip when nothing is live; enabled and functional once something is; All Mics Muted is visibly disabled; Livestream Check reflects real OBS connection state; Quick Cues actually change the live output when clicked; Timer starts a real countdown.
- Outputs strip shows all 4 zones with correct connect/disconnect status, matching what `LiveZoneStatus`'s relocated copy in the right panel shows (they read the same underlying state, so they must never visually disagree).
- Zero light-theme patches remain anywhere on this screen (`PresenterPanel`/`StageMessagePanel`/`TimingPanel` were the known gaps, confirm they're actually fixed on screen, not just in the diff).

Clean up: stop the preview server, delete the temporary `launch.json`.

- [ ] **Step 4: Self-review diff and full-branch sanity sweep**

Run `git diff <base-commit> --stat` and skim every changed file once more for the recurring same-shade-collision bug class (traced explicitly at least once in Task 9 Step 2 — recheck it here against the actual rendered output, not just the code). Also re-run the whole-branch light-theme grep one more time (`grep -rl "bg-\[#e9ecf1\]\|bg-\[#f4f6f9\]\|text-slate-900" src/renderer/src`) to confirm this phase didn't leave any NEW gap, and that the count of remaining files matches what's already recorded in memory as known, deliberately out-of-scope (`SongEditor.tsx`, `AnnouncementEditor.tsx`, `BackgroundPanel.tsx`, `ReflowEditor.tsx`, `ChordDisplay.tsx`) plus nothing else new.
