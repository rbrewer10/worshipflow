# Live Drawer Targets the Builder Selection — Design

Date: 2026-07-25
Status: Approved (design), pending implementation plan

## Problem

The bottom Live Drawer's "Backgrounds" tab (`src/renderer/src/drawer/BackgroundsDrawerTab.tsx`) is visible on every screen except Volunteer mode — including Build Service — but clicking a thumbnail always applies it to whatever item is currently **live** (`live?.liveServiceItemId`), never to the item selected in the builder. Confirmed live: with "Countdown 5:00" selected in Build Service and a different song live, clicking a background silently changed the live song's background instead — no warning, no indication it went to the wrong place.

Separately, `resolveBackgroundApply()` — the pure function that decides how to save a background onto an item — only recognizes `song` and `text` types. Scripture, Countdown, and Welcome items have supported custom backgrounds since earlier tonight's work, but this function was never updated, so even the *correct*-target path fails silently ("unsupported") for those three types today.

## Solution overview

1. **Broaden `resolveBackgroundApply()`** to cover Text, Scripture, Countdown, and Welcome (the same set `ItemBackgroundPanel.tsx`'s `FILE_BACKGROUND_TYPES` already covers) instead of just Text — a straightforward fix riding along with the targeting change, since both live in the same function.
2. **Give Build Service a "selected item" the drawer can see.** Add `selectedItemId`/`setSelectedItemId` to `ServiceContext`, mirrored from `ServiceEditor`'s existing local selection state.
3. **Tell the drawer which screen it's on.** `AppShell` passes `isBuildService` down to `LiveDrawer` → `BackgroundsDrawerTab`.
4. **Switch the apply target based on screen.** On Build Service, clicking a background applies to the builder-selected item (data-only save, no live push — building shouldn't force an instant change on whatever happens to be live). Everywhere else, behavior is unchanged: applies to the live item, pushes live, warns if nothing's live.

## Why not just always use "selected" when something's selected, everywhere?

Only Build Service has a meaningful "selected item" concept. Live/Songs/Scripture/Announcements/Sound Check don't have anything analogous — for those, live-targeting remains the only thing that makes sense, so the switch is keyed on the active screen, not on selection state alone.

## The pop-out Build Service window constraint

`ServiceEditor.tsx` is also rendered standalone by the pop-out `#/service` window (`App.tsx`), completely outside `AppShell`/`ServiceProvider` — calling the existing `useService()` there throws (`useService must be used within ServiceProvider`). The fix must not touch that path. Two additions keep it safe:

- A new **`useOptionalService()`** hook alongside the existing `useService()` — returns `null` instead of throwing when there's no provider. `ServiceEditor` uses this one to *optionally* mirror its selection into context; the pop-out window's instance simply gets `null` and mirrors nothing.
- `ServiceEditor`'s own local `selectedId` state is left completely alone as the real source of truth for its own rendering — only mirrored outward, never replaced by context. Existing selection/keyboard behavior in both the main window and the pop-out is unaffected.

## Keeping the Build Service preview in sync

`ServiceEditor` fetches its own `service` data independently of `ServiceContext`'s `activeService` copy — calling the context's existing `reloadActiveService()` (which the drawer already calls after every apply) doesn't refresh what `ServiceEditor` is showing on screen. Fix: `reloadActiveService()` also bumps a small `itemsChangedTick` counter on the context; `ServiceEditor` (via `useOptionalService()`) re-runs its own `reload()` whenever that tick changes. No-op in the pop-out (no context, tick is never observed).

## Non-goals

- No change to drawer behavior on any screen other than Build Service.
- No change to the Songs/Scripture/Announcements drawer tabs — only Backgrounds.
- No live-push when applying in Build Service context, even if the selected item happens to also be live right now — building stays inert with respect to what's on air.
- No redesign of the right-tab `ItemBackgroundPanel`/`BackgroundLibraryGrid` UI itself — this only changes what the *drawer* targets.

## Testing

Manual (matches this codebase's established convention — no test coverage exists for these files to extend):
- Select a Text/Scripture/Countdown/Welcome/Song item in Build Service (nothing live, or something unrelated live), click a drawer background, confirm it lands on the *selected* item and the preview updates without needing to reselect.
- Confirm nothing is pushed to the live projector when doing this.
- With nothing selected in Build Service, click a drawer background — confirm a clear "select an item first" message instead of a silent no-op or misdirected apply.
- On the Live screen (not Build Service), confirm existing behavior is unchanged: applies to the live item, warns if nothing's live.
- Confirm the standalone pop-out Build Service window still opens and works normally (no crash from the context change).
