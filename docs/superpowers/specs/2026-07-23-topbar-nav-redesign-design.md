# Top Bar Navigation (Phase 1 of the FreeShow-style Shell Redesign)

**Date:** 2026-07-23
**App:** WorshipFlow Pro (Electron + React)
**Status:** Design approved, ready for implementation plan

## Context

The user asked for WorshipFlow's UI to move toward FreeShow's layout: work happens
at the bottom, not the left, with a slim top bar for navigation instead of a full
left rail. FreeShow's top bar is only 3 items (`Show / Edit / Stage`) because
almost everything else lives in its bottom dock — WorshipFlow's left `Sidebar.tsx`
today has 8 destinations (Home, Live, Build Service, Songs, Announcements,
Scripture, Sound Check, Logo & Background) plus a set-apart Volunteer mode
button, so a straight port isn't possible without either removing access to
things or accepting a denser top bar.

This is a multi-phase redesign, agreed with the user:

1. **Top bar replaces the left sidebar** (this spec) — nothing removed, just
   relocated. The load-bearing structural change everything else depends on.
2. **Bottom dock goes app-wide** — the drawer already shipped on the Live tab
   (Songs/Scripture/Announcements/Backgrounds) becomes reachable from every
   screen, and this is where destinations trimmed from the top bar could
   eventually move.
3. **Clock + polish** — an always-visible corner clock and remaining chrome
   details, matching FreeShow's bottom-right clock.

This spec covers **Phase 1 only**. Phases 2–3 are separate future specs.

### Precedent

An earlier `TopBar.tsx` existed in this codebase (deleted in commit `074f622`,
"light-theme redesign," as unused dead code once the app had already
consolidated onto the left-sidebar model). It was never rejected for being a
bad design — it simply predates several of today's destinations (Announcements,
Sound Check, and Logo & Background didn't have separate sidebar entries yet)
and used the app's old dark theme with emoji icons, both of which were replaced
app-wide since. Its structure (brand left, centered tabs, live-output badge and
a set-apart Volunteer button on the right) is a useful reference for this
rebuild, but the component itself needs to be rebuilt fresh in the current
light theme with lucide icons — not restored as-is.

## Decisions locked with the user

- **Density:** a flat row of all 8 current destinations, relocated as-is —
  nothing is grouped into dropdowns or reduced to icon-only. Nothing is removed
  in this phase; any trimming waits for Phase 2 to give those destinations a
  home in the app-wide bottom dock.
- **Volunteer mode:** visually set apart from the other 8 tabs (not just another
  tab in the row) — it swaps to an entirely different, simplified UI for a
  non-technical operator, not a "screen," so it keeps a distinct treatment,
  matching how it's already set apart today.
- **Layout:** brand mark + name anchor the far left; the 8 nav tabs sit
  center-left; the live-output status indicator and the Volunteer button anchor
  the far right, separated by a divider.
- **Everything below the top bar is unchanged.** `ServiceRail` (the loaded
  service list + output preview + Black/Logo/Clear, currently rendered by
  `AppShell.tsx` alongside `LiveView`, not by `Sidebar.tsx`) is untouched — it
  isn't part of the sidebar being removed. `SlideGrid`, `LiveTools`, and the
  `LiveDrawer` bottom drawer (shipped 2026-07-22) are untouched. `VolunteerView`
  itself is untouched — only its entry point moves.

## Design

### 1. Component structure

**New:**
- `TopBar.tsx` — replaces `Sidebar.tsx` as the app's navigation chrome. Renders
  the brand mark, the 8 flat nav tabs, the live-output status badge, and the
  set-apart Volunteer button. Same `{ view, setView }` prop contract
  `Sidebar.tsx` already has, so it's a drop-in swap in `AppShell.tsx`.

**Removed:**
- `Sidebar.tsx` — fully replaced by `TopBar.tsx`. No remaining callers once
  `AppShell.tsx` is updated.

**Not touched:**
- `ServiceRail.tsx`, `SlideGrid.tsx`, `LiveTools.tsx`, `LiveDrawer.tsx` and its
  four drawer tabs, `VolunteerView.tsx`, and every other view component
  (`HomeView`, `ServiceBuilder`, `SongLibrary`, `AnnouncementsLibrary`,
  `ScriptureLookup`, `SoundCheckTab`, `LogoSettings`) — Phase 1 only changes the
  navigation chrome around them, not their internals.

### 2. Layout (left to right)

1. **Brand** — `BrandMark` (existing component, unchanged) + "WorshipFlow Pro"
   wordmark, matching the current sidebar's brand treatment.
2. **8 nav tabs**, flat, in this order: Home, Live, Build Service, Songs,
   Announcements, Scripture, Sound Check, Logo & Background. Same icons
   `Sidebar.tsx` already uses (`Home`, `Play`, `ListMusic`, `Music`,
   `Megaphone`, `BookOpen`, `Mic`, `ImageIcon` from lucide-react) plus their
   labels, since horizontal space allows both (unlike a narrow left rail).
   Active tab uses the existing blue-accent treatment; inactive tabs are
   slate-grey with a hover state.
3. **Spacer** (flex-grow) pushes the remaining items to the right edge.
4. **Live-output status badge** — "● N screen(s) live" / "No output", the same
   data `Sidebar.tsx` already polls via `getInfo()`.
5. **Divider**, then **Volunteer mode button** — visually distinct (bordered
   button, not a plain tab), switches `view` to `'volunteer'` exactly as today.

### 3. Data flow

No new IPC, no new state shape. `TopBar` takes over the exact `{ view, setView
}: { view: View; setView: (v: View) => void }` props `Sidebar` already receives
from `AppShell.tsx`, and the exact same `getInfo()`-polling pattern for output
count. `AppShell.tsx` changes from a `flex-row` shell (`Sidebar` beside the
content column) to a `flex-col` shell (`TopBar` above a content row) — the
content column's internals (the `view === 'live' ? <ServiceRail/><LiveView/> :
...` switch) are untouched.

`AppShell.tsx` already has a separate early-return for `view === 'volunteer'`
that renders `<VolunteerView>` full-screen, with no `Sidebar` (and therefore no
`TopBar`) around it at all. That early-return is unaffected by this change —
clicking the Volunteer button sets `view` to `'volunteer'` exactly as today,
and the existing early-return is what makes the whole top bar disappear once
inside Volunteer mode.

### 4. Error handling

None new — this is a pure navigation/layout change over existing, already-
working data flows (`getInfo()` polling already has no error path to handle
differently here).

### 5. Testing

Matches the existing convention for this codebase's UI work: no component-test
infrastructure exists, so this is verified by hand in `npm run dev` — clicking
every tab, confirming Volunteer mode still enters/exits correctly, confirming
the live-output badge still updates, and confirming nothing on the Live tab
(ServiceRail, SlideGrid, LiveTools, the bottom drawer) changed.

## Non-goals for this phase

- Removing or grouping any of the 8 destinations (Phase 2's job, once the
  bottom dock is app-wide).
- Any change to the bottom drawer's scope (still Live-tab-only; Phase 2).
- The corner clock (Phase 3).
- Any change to `VolunteerView.tsx`'s own internal UI.
- Any change to how `ServiceRail` looks or behaves.

## Success criteria

The left sidebar is gone. A top bar spans the full width with the brand at the
far left, all 8 destinations as flat, clickable tabs, and the live-output
status + a visually set-apart Volunteer button at the far right. Clicking any
tab navigates exactly as it does today. Volunteer mode still enters/exits via
its button. The Live tab's `ServiceRail`, `SlideGrid`, `LiveTools`, and the
bottom drawer are pixel-for-pixel unchanged except for having more vertical
space now that the horizontal rail is gone.
