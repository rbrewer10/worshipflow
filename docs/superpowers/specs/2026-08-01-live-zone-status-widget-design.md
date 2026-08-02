# Live tab zone status widget — design

**Date:** 2026-08-01
**App:** WorshipFlow Pro (Electron + React)
**Status:** Design approved, ready for implementation plan

## Context

The Live tab's left rail pins a small preview box at the bottom, labeled "Main
Audience Output" (`src/renderer/src/OutputPreview.tsx`). It renders a generic,
un-zoned preview of the raw live-state (mode, current line, theme colors) and
shows a red "Program" badge when `wf:getInfo().outputs > 0` — where `outputs`
counts local Electron `BrowserWindow`s opened on monitors directly attached to
the booth computer (`outputWins` in `src/main/index.ts`), a holdover from
before the zone system existed.

This church's screens are four independently-networked Raspberry Pi devices
(Back Left, Back Right, Lyrics TVs, Stage Monitors), not locally-attached
monitors. Confirmed by reading the code, not assumed: `outputWins` is only
ever populated by `createOutput()`, which is unrelated to the zone HTTP/WS
route the Pi devices actually connect through. Two real problems result:

- The preview box's content doesn't run through the same per-zone routing
  logic (`computeZoneStates`) that decides what each real screen shows, so it
  can visibly disagree with the actual screens (e.g. a sermon's designed
  title-card backdrop on the back screens vs. plain text in the box).
- The red "Program" badge is gated on a counter that is very likely always 0
  for an all-zone setup, so it never lights up even while fully live —
  actively misleading rather than merely uninformative.

Setup → Screens & zones already has an accurate per-zone status widget,
`ZoneLiveGrid` (`src/renderer/src/zones/ZoneLiveGrid.tsx`), reading real state
via `window.wf.zoneGetStates()` with live push updates, and rendering each of
the 4 zones' actual current content in a small box. This is the source of
truth the replacement should be built from.

## Decisions locked with the user

- **Replace, don't just remove.** The rail keeps a glanceable "what's live"
  indicator — it just needs to be accurate instead of generic.
- **Read-only.** The replacement shows what each zone is doing; it does not
  let the operator pin/unpin a zone from the Live tab. Pinning stays a
  Setup-only action, matching the recent nav-declutter redesign's intent to
  keep the Live tab down to the controls an operator reaches for moment to
  moment during a service, not one-time/occasional configuration.
- **Visual style: 2×2 grid, matching Setup's existing zone boxes.** Not a
  4-row compact list — the small preview-card look already established in
  Setup → Screens & zones carries over directly, so the same zone reads the
  same way in both places.
- **No pin indicator.** The read-only version won't show a little icon
  marking "this zone is being held/pinned" — just current on-screen content.
  If an operator needs to know *why* a zone looks stuck, that's what Setup →
  Screens & zones is for.
- **Out of scope, flagged for awareness only:** `HomeView.tsx` and
  `TopBar.tsx` also surface the same `outputs` counter (via
  `window.wf.getInfo()`) and will likely also always read 0 for this church's
  all-zone setup. Not touched by this work — `wf:getInfo`/`outputs` is a
  legitimate, real concept for churches using directly-attached monitors, and
  `DiagnosticsTab.tsx`'s own use of it is a valid, different context
  (confirming a screen is plugged in and detected).

## Design

### 1. Component structure

**New:**

- `src/renderer/src/zones/zoneReadout.ts` — pure function(s) extracted
  verbatim from `ZoneLiveGrid.tsx`: `readout(zoneState)` (mode → what to show,
  e.g. sermon → title + speaker/passage, countdown → mm:ss + title) and the
  `mmss()` time-formatting helper it depends on. No behavior change — this is
  a lift-and-share, not a rewrite.
- `src/renderer/src/zones/ZoneStatusBox.tsx` — the small presentational card
  (zone name label, mode label, dark preview area with primary/secondary
  text) extracted from `ZoneLiveGrid`'s current inline JSX for a single zone
  cell. Takes `zoneId` and `zoneState` as props. No click handler, no pin
  badge, no popover — purely presentational, so both the interactive Setup
  grid and the new read-only rail widget render pixel-identical boxes.
- `src/renderer/src/zones/LiveZoneStatus.tsx` — the new Live-tab rail widget.
  Fetches zone state itself (`window.wf.zoneGetStates()` on mount, refreshed
  on every `window.wf.onState()` push — the same pattern `ZoneLiveGrid`
  already uses, self-contained rather than lifted into `ServiceRail`, matching
  how `OutputPreview` already managed its own state independently). Renders a
  `grid-cols-2 gap-2` of 4 `ZoneStatusBox`es, no pins, no click handling, no
  popover, no "Pi Display URLs" section.

**Changed:**

- `src/renderer/src/zones/ZoneLiveGrid.tsx` — imports `readout`/`mmss` from
  `zoneReadout.ts` instead of defining them locally; renders `ZoneStatusBox`
  for each cell's visual, wrapped in its existing click/pin/popover logic
  (the sermon-suggestion banner, pinned-count header, and `ZonePinPicker`
  integration are unchanged). Behavior in Setup is identical before and after
  — this is a refactor for sharing, not a feature change to the Setup screen.
- `src/renderer/src/ServiceRail.tsx` — replaces `<OutputPreview />` with
  `<LiveZoneStatus />` in the same slot at the bottom of the rail (`import
  OutputPreview from './OutputPreview'` → `import LiveZoneStatus from
  './zones/LiveZoneStatus'`).

**Removed:**

- `src/renderer/src/OutputPreview.tsx` — deleted. Confirmed its only consumer
  is `ServiceRail.tsx` (the file being updated in this same change), so
  nothing else references it.

**Not touched:** `wf:getInfo`, the `outputs` field, `HomeView.tsx`,
`TopBar.tsx`, `DiagnosticsTab.tsx`, `ZonePinPicker.tsx`, `ZoneRoutingGrid.tsx`
(still the source of `MODE_LABELS`, imported by both the Setup grid and the
new rail widget), and everything about how zones are actually computed or
routed (`computeZoneStates` itself is untouched — this work only changes
which UI reads its output, not the logic that produces it).

### 2. Data flow

1. `LiveZoneStatus` mounts inside `ServiceRail`, calls
   `window.wf.zoneGetStates()` once for initial state, and subscribes to
   `window.wf.onState()` to refresh on every live-state push — identical
   subscription shape to `ZoneLiveGrid`'s existing `refreshStates`/`onState`
   pattern, just without the pin-state (`zoneGetPins`) or track-assignment
   fetches, since this view never shows or edits either.
2. Each of the 4 zone IDs renders through `readout(zoneState)` (from the
   shared `zoneReadout.ts`) into a `ZoneStatusBox`, exactly the same
   transformation Setup's grid already performs — a sermon shows title +
   speaker/passage, a countdown shows mm:ss + title, lyrics/text shows the
   current line, etc.
3. No writes happen from this component at all — it is purely a subscriber,
   unlike `ZoneLiveGrid` which also calls `zoneSetPin`/`zoneClearPins`.

### 3. Error handling

- No connected zones / all zones "off": each box already has a defined
  `readout()` case for `mode: 'off'` (renders "Off") — no special handling
  needed, this falls out of the existing pure function.
- Zone state not yet loaded (`zoneStates` is `null` before the first fetch
  resolves): render the same "…" placeholder `readout()` already produces for
  an `undefined` zone state, matching `ZoneLiveGrid`'s existing behavior for
  the same moment.

### 4. Testing

No new unit tests. `zoneReadout.ts`'s extracted functions are pure and could
theoretically be tested, but they're being lifted verbatim from
already-untested code (`ZoneLiveGrid.tsx` has no test file today) with no
behavior change — adding tests here would be new coverage for pre-existing
logic, not verification of new logic, and is out of scope for a UI-widget
swap. `ZoneStatusBox.tsx` and `LiveZoneStatus.tsx` are presentational/live-IPC
React components, consistent with this repo's established posture that
UI/WebRTC/live-state components aren't unit tested under the Node-only Vitest
config — matching `OutputPreview.tsx`, `ZoneLiveGrid.tsx`, and every other
component in this area today.

Manual verification (this sandbox cannot launch Electron):

1. Open the Live tab with a service loaded. Confirm the rail's bottom widget
   shows a 2×2 grid of the 4 zone names, each with a mode label and current
   content — not the old "Main Audience Output" box.
2. Go live with a song. Confirm the Lyrics TVs box shows the live lyric line,
   and the back-screen boxes reflect whatever they're actually routed to show
   (logo, by default).
3. Go live with a sermon item. Confirm the back-screen boxes show the sermon
   title/speaker, matching what Setup → Screens & zones shows for the same
   zones at the same moment (the two views should never disagree, since they
   now share the same `readout()` logic).
4. Pin a zone from Setup → Screens & zones. Confirm the Live tab's read-only
   widget shows that zone's held content (since `readout()` reflects actual
   `ZoneState`, pinned or not) but has no way to unpin it from the Live tab.
5. Confirm Setup → Screens & zones itself still behaves exactly as before
   (pin/unpin, sermon-suggestion banner, popover) — this refactor should be
   invisible there.

## Non-goals

- Reintroducing pin/unpin controls to the Live tab.
- Any change to `computeZoneStates`, zone routing rules, or how a real screen
  decides what to show — this is purely about which UI surfaces that already-
  correct state.
- Fixing the same `outputs`-counter issue in `HomeView.tsx` or `TopBar.tsx`.
- Any change to `wf:getInfo`, `outputWins`, or the local-output-window
  concept itself — it remains valid for churches using directly-attached
  monitors.

## Success criteria

The Live tab's rail shows an accurate, glanceable readout of all 4 real
zones, sharing its underlying logic with Setup's existing zone grid so the
two can never disagree. The misleading "Main Audience Output" label and the
never-lighting "Program" badge are gone. No pin controls exist on the Live
tab. Setup → Screens & zones is unchanged in behavior.
