# App-Wide Bottom Drawer (Phase 2 of the FreeShow-style Shell Redesign)

**Date:** 2026-07-23
**App:** WorshipFlow Pro (Electron + React)
**Status:** Design approved, ready for implementation plan

## Context

Phase 1 (merged 2026-07-23) replaced the left sidebar with a `TopBar`. This is
**Phase 2**: the docked content drawer shipped 2026-07-22 (Songs / Scripture /
Announcements / Backgrounds — `LiveDrawer.tsx`) currently only lives on the
Live tab, mounted inside `LiveView.tsx`. This phase makes it available from
every screen in the app, matching FreeShow's "the dock is always there"
pattern.

Phase 3 (a corner clock + remaining polish) is a separate future spec.

## Decisions locked with the user

Every decision landed on the simplest option — this phase turns out to be
almost purely a **relocation**, not a behavior change:

- **Click behavior is identical everywhere.** Songs/Scripture/Announcements:
  click → add to the service **and** go live, exactly as today on Live — no
  different behavior on other screens (e.g. no "add-only" mode elsewhere).
- **Backgrounds still only applies to whatever's currently live**, on every
  screen, with the same "nothing is live yet" toast guard as today. No
  fallback to an editor-selected item when prepping.
- **Volunteer mode is still excluded**, same as Phase 1 — it's a deliberately
  simplified, separate UI and doesn't gain the drawer.
- **Layout: full width on every screen, including under `ServiceRail` on the
  Live tab.** Phase 1's drawer specifically dodged `ServiceRail` (the loaded-
  service rail); that exception goes away — the drawer becomes one single,
  consistent, full-width component with no per-screen special-casing.
- **Auto-closes on navigation.** Switching screens (clicking a top-bar tab)
  closes the drawer if it was open, rather than carrying its open tab/search
  text across to the new screen.

## Design

### 1. Component relocation

`LiveDrawer.tsx` moves from being mounted inside `LiveView.tsx` (Live-tab-only)
to being mounted once in `AppShell.tsx`, as the last child of the shell — a
sibling to `TopBar` and the screen-switch, below everything (including the
`ServiceRail + LiveView` row when on Live). `LiveView.tsx` reverts to just
`SlideGrid + LiveTools` (drops the `<LiveDrawer />` line and the wrapping
column div it needed to stack the drawer beneath itself).

**No changes are needed inside `LiveDrawer.tsx` or any of its four tab
components** (`SongsDrawerTab`, `ScriptureDrawerTab`, `AnnouncementsDrawerTab`,
`BackgroundsDrawerTab`). They already read/write through `useService()`
(`ServiceContext`), which is already provided at the `AppShell` level — wrapping
every screen except Volunteer mode — so nothing about their data access changes
by moving where `LiveDrawer` itself is mounted. This is why the "identical
behavior everywhere" decision above costs nothing to implement: it was already
true by construction, it just wasn't reachable from anywhere but Live.

The file-level comment in `LiveDrawer.tsx` ("...docked drawer for the Live
tab...") gets a one-line update since it's no longer Live-tab-specific.

`AppShell.tsx` has a separate early-return for `view === 'volunteer'` that
renders `<VolunteerView>` full-screen before reaching the main shell's JSX at
all (this is also how the `TopBar` is already excluded from Volunteer mode).
Mounting `<LiveDrawer>` inside the main shell's return — not the early-return
branch — means Volunteer mode's exclusion requires no extra guard; it's
already structurally impossible for the drawer to render there.

### 2. Auto-close on navigation

`LiveDrawer` owns its open/closed state internally (`const [open, setOpen] =
useState<DrawerTabId | null>(null)`) and takes no props today. Rather than
lifting that state up into `AppShell` or a context (a real refactor), the
call site passes `key={view}`: `<LiveDrawer key={view} />`. React remounts a
component whenever its `key` changes, so switching screens naturally resets
`LiveDrawer` to its initial closed state (and clears any in-progress search
text in whichever tab was open) — no new state-management code, no prop
threading.

### 3. Layout

`AppShell`'s outer shell is already a `flex-col` (`TopBar` above a content
row, from Phase 1). Adding `<LiveDrawer key={view} />` as one more child after
the content-switch div is a direct, structurally clean fit — no new wrapper
elements needed, no CSS changes inside `LiveDrawer.tsx` itself (its own root
is already just a plain `flex-shrink-0` column item).

### 4. Error handling

None new — every existing guard (no active service, nothing live for
Backgrounds, failed scripture lookup) is already implemented and unaffected by
where the component is mounted.

### 5. Testing

Matches the existing convention: no component-test infrastructure exists in
this codebase, so this is verified by hand in `npm run dev` — opening the
drawer from several different screens (not just Live), confirming Songs/
Scripture/Announcements/Backgrounds all still work exactly as they did on
Live, confirming the drawer spans full width including under `ServiceRail`,
and confirming it closes automatically when a top-bar tab is clicked while
open.

## Non-goals for this phase

- Any change to what the drawer's four tabs do or how they look.
- The corner clock (Phase 3).
- Volunteer mode support (explicitly excluded, same as Phase 1).
- Adding new tabs to the drawer (e.g. Media) — out of scope; this phase is
  purely about reach, not content.

## Success criteria

The bottom drawer's tab strip is visible at the bottom of every screen except
Volunteer mode — Home, Live, Build Service, Songs, Announcements, Scripture,
Sound Check, and Logo & Background. Opening it and using any of the four tabs
behaves identically regardless of which screen you opened it from (same
add-and-go-live behavior, same background-applies-to-live-item behavior, same
error toasts). On the Live tab, the drawer spans the full width, including
under `ServiceRail`. Clicking a different top-bar tab while the drawer is open
closes it.
