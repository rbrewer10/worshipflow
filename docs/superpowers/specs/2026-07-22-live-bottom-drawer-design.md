# Live Tab Bottom Drawer

**Date:** 2026-07-22
**App:** WorshipFlow Pro (Electron + React + sql.js)
**Status:** Design approved, ready for implementation plan

## Context

Today, grabbing a song, scripture reference, or announcement that isn't already
in the loaded service means leaving the Live tab entirely via the sidebar —
exactly the wrong moment to navigate away mid-service. `LiveTools` already has
a lightweight quick-scripture lookup, but nothing for songs, announcements, or
backgrounds.

Inspiration: **FreeShow** (an open-source church presentation app) docks a
tabbed content strip (Shows / Media / Audio / Overlays / Scripture / …) at the
bottom of its window, always reachable without leaving the main view. This spec
adapts that pattern to WorshipFlow's Live tab.

## Decisions locked with the user

- **Scope:** Live tab only. Volunteer mode is unchanged — it's a deliberately
  simplified touchscreen UI and doesn't get this feature. Build Service already
  has its own add-item flow and isn't touched either.
- **Tabs:** Songs, Scripture, Announcements, Backgrounds.
- **Placement:** a tab strip docked at the bottom, spanning under
  `SlideGrid + LiveTools` (not under `ServiceRail`, which — like FreeShow's
  "Projects" panel — stays visible above the drawer).
- **Interaction:** collapsed by default (just the tab strip, so `SlideGrid`
  keeps full height mid-service). Clicking a tab slides the drawer open with a
  smooth CSS transition (not a jump-cut); clicking the active tab again, or
  picking an item, slides it closed.
- **Songs / Scripture / Announcements click behavior:** added to the service
  order (a real `ServiceItem`, so it shows in `ServiceRail` and — critically —
  gets a Phase-1 recording marker) *and* sent live, in one click. This is
  implemented as add-then-go-live through the app's existing `sendItemLive()`
  chokepoint, not a separate "quick push" path, so it can't drift from the
  marker/zone-routing logic the recording pipeline depends on.
- **Backgrounds click behavior:** applies to whichever item is *currently live*
  (not the selected-in-editor item), matching how backgrounds are already
  applied in Build Service.

## Design

### 1. Component structure

**New:**
- `LiveDrawer.tsx` — the tab strip + sliding panel shell. Owns which tab is
  open (`null | 'songs' | 'scripture' | 'announcements' | 'backgrounds'`), the
  open/close CSS transition, and closing on Escape. Mounted inside
  `LiveView.tsx`, below the existing `<SlideGrid /><LiveTools />` row.
- `SongsDrawerTab.tsx` — search input + result list. Click → add-then-go-live.
- `ScriptureDrawerTab.tsx` — reference input + lookup preview (mirrors the
  existing quick-scripture box in `LiveTools`). Click "use this" → add-then-go-live.
- `AnnouncementsDrawerTab.tsx` — search input + result list. Click → add-then-go-live.
- `BackgroundsDrawerTab.tsx` — a thumbnail grid of background **image/video
  files** (the same file list `ItemBackgroundPanel`/`BackgroundPanel` already
  browse). Click → apply that file to the live item. This tab is scoped to file
  selection only — it does **not** expose theme picking or color-override
  editing (those stay in Build Service's per-item editor); it's a quick "swap
  the background image" action, not a style editor.

**Not touched:** `SongLibrary`, `AnnouncementsLibrary`, `ScriptureLookup` stay
exactly as they are — those are full management screens (search, edit, upload,
delete), not drawer content. The four drawer-tab components are new, narrow,
purpose-built views over the same underlying data and IPC calls.

### 2. Data flow

Songs, Scripture, and Announcements all funnel through the same sequence:

```
click item
  → serviceAddItem(activeServiceId, { type, ref_id | payload })
  → reloadActiveService()            (existing ServiceContext refresh)
  → sendItemLive(newItem)            (the SAME shared helper ServiceDeck uses)
  → close drawer
```

- **Songs:** `{ type: 'song', ref_id: songId }`
- **Scripture:** operator types a reference, the drawer previews it via the
  existing lookup call; on confirm, `{ type: 'scripture', payload: { reference } }`
- **Announcements:** `{ type: 'announcement', ref_id: announcementId }`

**Backgrounds** does not add a new item. It resolves the currently-live item
from `LiveState` (the live item id, looked up in `activeService.items`), then
calls `serviceSetItemStyle` / `serviceSetItemPayload` on that item — the same
calls `ItemBackgroundPanel` already makes.

### 3. Error handling

- **No active service loaded:** the drawer still browses (harmless), but a
  click shows a toast ("Load a service first") instead of crashing, since
  `serviceAddItem` requires a real `serviceId`.
- **Backgrounds, nothing live yet:** clicking shows a toast ("Nothing is live
  yet") instead of a silent no-op.
- **Scripture lookup fails:** matches the existing rule in `liveActions.ts` —
  "a failed lookup must NOT mark the item live." The drawer surfaces the
  failure and does not add or go live.

### 4. Testing

This repo only unit-tests pure logic (`vitest.config.ts` is `node`-environment,
no DOM/component test setup exists anywhere in the codebase today) — this spec
follows that convention rather than introducing a new testing layer:
- Any real branching logic worth isolating (e.g. resolving which item is
  currently live for the Backgrounds tab) is extracted into a small pure,
  unit-tested helper.
- The drawer UI and interactions (open/close animation, search, click-to-add-
  and-go-live) are verified by hand in `npm run dev`, the same way every other
  panel in this app is verified.

## Non-goals

- Volunteer mode support (explicitly deferred by the user).
- Build Service integration (it already has its own add-item flow).
- Drag-and-drop from the drawer into the service order.
- Reordering or editing songs/scripture/announcements from within the drawer —
  that stays in the full library pages.
- A dedicated Media/video tab (FreeShow has one; not requested here — the
  existing "image" item type + Backgrounds tab cover the current need).

## Success criteria

From the Live tab, with a service loaded: clicking a drawer tab slides it open
smoothly over the bottom of the slide grid; searching and clicking a song,
scripture reference, or announcement adds it to the service (visible in
`ServiceRail`) and sends it live in one click, and the drawer closes. Clicking
a background while something is live applies it to that live item immediately.
With no active service, drawer actions toast instead of crashing. Volunteer
mode and Build Service are unchanged.
