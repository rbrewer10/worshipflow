# Corner Clock (Phase 3 of the FreeShow-style Shell Redesign)

**Date:** 2026-07-23
**App:** WorshipFlow Pro (Electron + React)
**Status:** Design approved, ready for implementation plan

## Context

Phases 1 (top bar) and 2 (app-wide bottom drawer) of the FreeShow-inspired
shell redesign are merged. This is **Phase 3**, the last phase: an
always-visible clock, matching FreeShow's bottom-right corner clock. Scope was
explicitly confirmed with the user as **just the clock** — no other polish
items are in this phase.

## Decisions locked with the user

- **Placement:** the bottom drawer's tab strip (`LiveDrawer.tsx`), right-
  aligned — matching FreeShow's actual bottom-right position. Since the tab
  strip never collapses (only the content panel below it does), the clock is
  visible at all times on every screen the drawer already reaches (every
  screen except Volunteer mode, per Phase 2).
- **Format:** time only, no seconds and no date (e.g. "12:48 PM") — a glance-
  check clock, not a FreeShow-exact replica. Chosen specifically to avoid a
  once-per-second re-render for information nobody needs at that granularity.

## Design

### 1. Component

New `src/renderer/src/Clock.tsx` — a small, self-contained component with one
job: render the current time, locale-formatted, refreshing periodically.

```tsx
import { useEffect, useState } from 'react'

function formatNow(): string {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// A small always-on clock for the bottom drawer's tab strip, matching
// FreeShow's corner clock. Refreshes every 15s — frequent enough that the
// displayed minute is never meaningfully stale, infrequent enough to avoid
// a once-a-second re-render for information nobody needs at that granularity.
function Clock(): JSX.Element {
  const [now, setNow] = useState(formatNow)
  useEffect(() => {
    const t = setInterval(() => setNow(formatNow()), 15000)
    return () => clearInterval(t)
  }, [])
  return <span className="text-xs font-medium tabular-nums text-slate-500">{now}</span>
}

export default Clock
```

`toLocaleTimeString` handles AM/PM and locale formatting natively — no manual
12/24-hour logic needed.

### 2. Placement in `LiveDrawer.tsx`

The tab strip row is currently:

```tsx
<div className="flex items-center border-b border-slate-200">
  {TABS.map(...)}
</div>
```

Add `pr-3` to that row's className (so the clock isn't flush against the
window edge, matching the `px-4` horizontal rhythm the tab buttons already
use), and add a flex-spacer + the clock as the last two children, after the
`{TABS.map(...)}` block:

```tsx
<div className="flex items-center border-b border-slate-200 pr-3">
  {TABS.map(...)}
  <div className="flex-1" />
  <Clock />
</div>
```

No other line in `LiveDrawer.tsx` changes.

### 3. Data flow

None — this is pure client-side `Date` formatting, no IPC, no app state.

### 4. Error handling

None applicable — `toLocaleTimeString` cannot throw for the no-argument /
options-only call used here.

### 5. Testing

Matches the existing convention: no component-test infrastructure exists in
this codebase. `formatNow()` is a pure function and could technically be unit
tested, but its entire body is a single native `Date.toLocaleTimeString` call
with no branching logic — there's nothing of this project's own to verify
beyond what the JS runtime already guarantees, so per YAGNI this stays
manually verified (glance at the clock in `npm run dev`, confirm it matches
the system clock and updates within ~15s).

## Non-goals for this phase

- Seconds or date display (explicitly declined — time-only was the chosen
  option).
- Any other visual polish beyond the clock itself (explicitly confirmed as
  out of scope).
- Clock in the top bar (the drawer's tab strip was the chosen placement).
- Timezone selection/configuration — always shows the local system time,
  matching every other timestamp already displayed in this app.

## Success criteria

A clock showing the current time (no seconds, e.g. "12:48 PM") is visible at
the right edge of the bottom drawer's tab strip on every screen the drawer
already reaches (every screen except Volunteer mode). It updates to stay
accurate to within about 15 seconds of the real time, with no other visible
change to the drawer or any other part of the app.
