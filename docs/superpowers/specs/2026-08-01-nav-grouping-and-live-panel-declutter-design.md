# Nav Grouping and Live Panel Declutter (Phase 2 of the Shell Redesign)

**Date:** 2026-08-01
**App:** WorshipFlow Pro (Electron + React)
**Status:** Design approved, ready for implementation plan

## Context

The user asked to make the UI "less cluttered and simple with drop tabs and other
things that look like a professional made program."

This is the trimming phase that `2026-07-23-topbar-nav-redesign-design.md`
deliberately deferred. That spec relocated all 8 destinations from the left
sidebar into a flat top bar and stated: *"Nothing is removed in this phase; any
trimming waits for Phase 2 to give those destinations a home in the app-wide
bottom dock."* Both of its blockers have since shipped — the drawer went
app-wide (`2026-07-23-appwide-drawer-design.md`, now mounted in `AppShell.tsx`)
and the corner clock landed (`2026-07-23-corner-clock-design.md`). So the
grouping it deferred is now unblocked.

### The measured problem

Two distinct problems, confirmed against the code rather than assumed:

**Density.** The Live tab presents 12 controls in the top bar, ~28 controls
across 10 stacked sections in the 384px `LiveTools` panel, 4 drawer tabs, and
the service rail — all at essentially equal visual weight, so nothing reads as
more important than anything else.

**Inconsistency.** `main.css` already defines a button and surface system
(`.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-warning`,
`.surface`) and its own comment states "one accent rule: emerald only." The
components largely bypass it. Counted across `src/renderer/src/**/*.tsx`:

| Measure | Count |
|---|---|
| Distinct Tailwind color-shade tokens | 70 |
| Hue families in use | 12 |
| Concurrent neutral ramps | 2 — `slate` (975 uses) and `gray` (68) |
| Hues doing "accent" work | 4 — `blue` (349), `emerald`, `sky`, `indigo` |
| Uses of the `btn` class family | 48 |

The second problem is most of why the app reads as homemade. It is not a layout
failure — it is an unenforced design system.

### Constraint: this is a live tool

WorshipFlow runs a live Sunday service. Every control moved behind a dropdown
becomes one click slower under pressure. The panic controls (Black / Logo / Live,
next/prev) must stay one click and always visible. Only controls that are
configured once and not touched during worship are eligible to move.

## Decisions locked with the user

- **Approach:** grouped dropdown nav (option A), chosen over a prepare/run mode
  switch (B) and a left icon rail (C). B was rejected because `VolunteerView`
  already *is* a stripped-down run mode with its own keyboard handling — adding a
  second mode switch would create two ways to do one thing. C was rejected
  because it relocates every control in a tool already in weekly production use,
  for no functional gain.
- **Scope:** whole app chrome — both the nav grouping and the Live panel trim.
- **Live panel keeps** exactly what the user reaches for during a service:
  Black/Logo/Live, presenter notes + timer, stage message + presets, and
  text size + auto-advance.
- **Quick scripture moves out.** The user does not reach for it live, and it
  remains available in the app-wide bottom drawer and on its own Scripture
  destination — so nothing becomes unreachable.
- **Zone panel moves out entirely.** The user confirmed zone routing is
  configured for the room beforehand, not re-pinned mid-service.
- **Styling: bounded pass, not full enforcement.** Mechanical consolidation only.
  Strict reservation of red for on-air (which would require auditing all 94
  current red uses) is explicitly deferred.
- **Volunteer mode is untouched**, exactly as in Phase 1.

## Design

### 1. Navigation structure

The top bar goes from 8 flat destinations to 3 visible destinations plus 2
menus. Home, Live and Build service stay visible because they are what the user
moves between week to week; Library and Setup are entered deliberately, so a
menu costs nothing.

```
WorshipFlow │ Home  Live  Build service  Library ▾  Setup ▾ │ [status] │ Volunteer
```

**Library ▾** — Songs, Announcements, Scripture, Backgrounds
**Setup ▾** — Screens & zones, OBS connect, Logo & branding, Tablet remote,
Diagnostics & backups

Backgrounds is *promoted* here. It currently exists only as a drawer tab and
buried inside `LogoSettings`, with no destination of its own, which is why it is
hard to find.

The status cluster (live-output badge, OBS on-air badges) and the set-apart
Volunteer button keep their Phase 1 treatment and position unchanged.

### 2. Live panel

`LiveTools.tsx` goes from 10 sections to 4, in priority order:

1. Black / Logo / Live + the compact keyboard-shortcut strip — always top
2. Presenter notes + timer (`PresenterPanel`)
3. Stage message + presets (`StageMessagePanel`)
4. Text size + auto-advance (`TimingPanel`)

Removed from the panel and rehomed:

| Leaves the live panel | New home |
|---|---|
| `ZonePanel` | Setup → Screens & zones |
| Tablet URL + PIN + regenerate | Setup → Tablet remote |
| Service log, log folder, display list | Setup → Diagnostics & backups |
| `ScripturePanel` | Already in the bottom drawer and the Scripture destination |
| Expandable shortcut cheat sheet | Deleted — it duplicates the strip that stays |

The `showMore` collapsible disappears along with its contents. The
hymn-timer/verse status strip stays, since it is passive live feedback rather
than a control.

`BackupsPanel` (currently inside `LogoSettings.tsx`) moves to Diagnostics &
backups, so Logo & branding is only about branding.

### 3. Component structure

**New:**
- `NavMenu.tsx` — the dropdown. Button + popup list, with click-outside and
  Escape to close, arrow-key navigation between items, Home/End, and correct
  `aria-haspopup="menu"` / `aria-expanded` / `role="menu"` / `role="menuitem"`
  wiring. Focus returns to the trigger on close. This is the only genuinely new
  interactive component in the change.
- `navMenuState.ts` — the pure open/close/highlight reducer behind `NavMenu`
  (see Testing).
- `setup/ScreensZonesTab.tsx`, `setup/TabletRemoteTab.tsx`,
  `setup/DiagnosticsTab.tsx` — new destinations, mostly relocated JSX.
- `BackgroundsTab.tsx` — a Library destination wrapping the existing background
  library grid.

**Changed:**
- `TopBar.tsx` — `NAV_ITEMS` splits into primary items and two menu groups.
- `AppShell.tsx` — the `View` union gains `zones`, `tablet`, `diagnostics`,
  `backgrounds`, with matching render branches.
- `LiveTools.tsx` — loses roughly 150 lines and 6 pieces of state
  (`scriptureRef`, `bibleTranslation`, `showCheatSheet`, `serviceLog`,
  `showMore`, `tabletUrl`/`tabletPin`).
- `LogoSettings.tsx` — `BackupsPanel` extracted out.

**Not touched:** `VolunteerView.tsx`, `ServiceRail.tsx`, `SlideGrid.tsx`,
`LiveDrawer.tsx` and its four drawer tabs, `Output.tsx`, `Stage.tsx`, and
everything in `src/main/`.

### 4. Styling pass (bounded)

Mechanical consolidation only, in this order:

1. `gray-*` → `slate-*` (68 occurrences). Two neutral ramps at slightly
   different temperatures is the single most visible source of "off" -ness.
2. Retire `purple` (15), `sky` (9), `indigo` (7), `rose` (6) — all one-off
   accent uses — onto the existing `blue` accent or neutral slate.
3. Route hand-rolled buttons through the existing `.btn` family where the markup
   is already equivalent. Not a rewrite — only where it is a direct swap.

Semantic roles after the pass: **slate** = every surface, border and label;
**blue** = selection and primary action; **red** = on air / destructive;
**amber** = rehearsal and warnings.

**Explicitly deferred:** strictly reserving red for on-air only. That requires
auditing all 94 red uses and re-treating destructive actions. It is now *safer*
than it was — deletes gained Undo in commit `a2cac96`, so a delete button no
longer needs to shout — but it is a separate change with its own visual review.

### 5. Data flow

No new IPC, no new state shape, no change to `LiveState`. The relocated panels
call the exact same `window.wf.*` methods from their new locations. `NavMenu` is
local component state only. `AppShell`'s existing `setView` wrapper — which
checks `hasFailedSaves()` before navigating — is reused unchanged, so the new
destinations inherit the unsaved-work guard for free.

### 6. Error handling

None new. Every relocated control keeps its existing error path (the tablet PIN
regenerate keeps its `confirm()`, auto-advance keeps its range validation and
`notifyLocal` warning, backups restore keeps its confirm + pre-restore safety
copy).

One interaction to preserve deliberately: `AppShell`'s live keyboard shortcuts
are gated on `view === 'live'`. The new destinations are additions to the `View`
union, and the gate is an equality check against `'live'`, so they inherit the
correct "shortcuts off" behavior without further work. This must not regress
into a `!==` list that needs updating per view.

### 7. Testing

- **`navMenuState.ts`** — pure reducer (open, close, highlight next/prev, wrap
  at ends, Escape, select). Unit-tested under the existing Node-only Vitest
  config, following the established pattern in this codebase (`saveQueue.ts`,
  `ipcValidate.ts`, `songDuplicates.ts`, `saveRegistry.ts`). This avoids adding
  jsdom purely for one dropdown.
- **`tests/e2e/sunday-workflow.spec.ts` must be updated in the same change.** It
  selects navigation by button name, so regrouping the nav breaks it. Note this
  test has never been executed successfully — the sandbox it was written in
  cannot run Electron — so this will be its first real exercise and it may need
  correction beyond the selector updates.

  It also carries a **pre-existing bug this change must fix**: line 28 uses
  `getByRole('button', { name: 'Songs' })`, but since the drawer went app-wide
  there are two buttons named exactly "Songs" on screen — the nav destination and
  the `LiveDrawer` tab. Playwright strict mode fails on the ambiguous match, so
  this line cannot ever have passed. The same collision applies to
  "Announcements" and "Scripture". Regrouping the nav removes the collision for
  Songs (it becomes a menu item under Library, reachable only after opening the
  menu), but the selectors should be disambiguated explicitly rather than relying
  on that side effect.
- **Manual verification** on a real desktop session: every menu item navigates,
  keyboard navigation works in both menus, the Live panel still drives a
  service, relocated controls still function from their new homes, and Volunteer
  mode is unchanged.
- The existing gate applies before any commit: `npm run typecheck`, `npm test`,
  `npm run lint`, `npm run build`.

## Non-goals

- Any change to `VolunteerView.tsx`.
- Strict red-reserved-for-on-air enforcement (deferred, see §4).
- The left icon rail (option C) — revisitable after this ships.
- Any change to `src/main/`, IPC, or the zone/output rendering model.
- Adding jsdom or a component-test framework.
- Touching the parallel in-flight work on this branch (service-plan
  integration, multi-zone composer, multi-select in `ServiceDeck`/
  `ServiceEditor`).

## Success criteria

The top bar shows 3 destinations and 2 dropdown menus instead of 8 flat tabs,
with both menus fully keyboard-operable. The Live right panel shows 4 sections
instead of 10, with Black/Logo/Live at the top and no collapsible "More". Every
relocated control is reachable and working from its new Setup or Library home,
and nothing that was reachable before is unreachable now. Backgrounds has a
destination of its own. `gray-*` no longer appears in any tracked renderer file,
and `rose` no longer duplicates `red`. The E2E spec is updated and passes.
Volunteer mode is byte-for-byte unchanged.

**Amended during implementation.** This criterion originally also required
retiring `purple`, `sky` and `indigo`. Inspecting every call site showed all
three encode meaning rather than decoration, so they are kept:

- `ServiceDeck.tsx` uses indigo for the multi-select state specifically to
  distinguish it from blue single-select; both render in the same list, so
  merging them would make two different states look identical.
- `ZoneTrackStripBadge.tsx` pairs blue (main track) with purple (second track).
- `sound-check/*` uses purple (Track) against blue (Mic) as a channel-category
  distinction — and that tab is an unreachable prototype whose `Variant*` files
  are design mockups.

Only `rose` was a true duplicate of an existing role. The design principle still
holds — one hue, one meaning — but §4's assumption that these four were all
strays was wrong, and enforcing it would have been a visual regression.

**Carve-out:** `ObsConnectTab.tsx` is an untracked, uncommitted file belonging to
other in-flight work on this branch, and holds 12 of the renderer's `gray-`
tokens. It is deliberately left alone — restyling a file its author has not yet
committed would pull their work into this change. Those 12 tokens are the one
known exception to the criterion above, to be swept up whenever that file lands.
