# Sunday Safety — Batch 2 (Reliability & Operator Feedback) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the "real findings, but not could-silently-show-wrong-content-during-a-live-service" tier of gaps from the same pre-launch audit that produced Batch 1 — faster zone-disconnect detection, an operator-facing zone connectivity panel, an app-wide Stage Rehearsal indicator, a Stage Rehearsal zone-track bug, and first-run onboarding — closing out the audit's full critical/high list before WorshipFlow goes into real-world church use.

**Architecture:** Five independent, surgical fixes across the main-process tablet/zone server (`src/main/index.ts`), the pure Stage Rehearsal logic module (`src/shared/stageRehearsal.ts`), and renderer UI (`TopBar.tsx`, the `zones/` status components, one new onboarding component). No new subsystems — every task closes a specific, already-diagnosed gap in code that exists today, and every data source needed (`zonesConnected`, `stageRehearsal.active`, `settingGet`/`settingSet`) already exists and is already wired to the renderer.

**Tech Stack:** Electron main process (Node, `ws` WebSocketServer), React/TypeScript renderer, Vitest for pure-logic tests (`src/shared/stageRehearsal.test.ts` already covers the module Task 4 touches).

**Source:** every task below comes from a verified finding in the same 7-dimension automated audit Batch 1 drew from (findings #9, #10, #14, #15, #16 from the audit's critical/high list — the raw finding text is quoted verbatim in `scratchpad/audit-crithigh.md` from that audit run). Each task's "Audit finding" section is that finding's own detail/evidence/recommendation; you do not need to re-diagnose the bug, only implement the fix below.

---

## File Structure

- **Modify** `src/main/index.ts` — the tablet-server heartbeat interval (Task 1).
- **Modify** `src/renderer/src/zones/ZoneStatusBox.tsx` — accept an optional `connected` prop and render a disconnected state.
- **Modify** `src/renderer/src/zones/LiveZoneStatus.tsx` — fetch `zonesConnected` and pass it through to `ZoneStatusBox` (Task 2).
- **Modify** `src/renderer/src/TopBar.tsx` — add the app-wide Stage Rehearsal badge (Task 3) and the onboarding help button + first-run auto-open (Task 5).
- **Modify** `src/shared/stageRehearsal.ts` and `src/shared/stageRehearsal.test.ts` — fix `zoneTrackFor` so zones 1-3 can't be hijacked onto the rehearsal song (Task 4).
- **Create** `src/renderer/src/OnboardingHelp.tsx` — the first-run/on-demand help panel (Task 5).

---

### Task 1: Shorten the zone heartbeat interval so disconnects are detected in seconds, not up to a minute

**Files:**
- Modify: `src/main/index.ts` (constants near line 385, and the `tabletHeartbeat = setInterval(...)` call at line 2181)

**Audit finding [14] HIGH — health-monitoring:** The only mechanism that detects a dead zone connection on the operator app's side is a ping/pong heartbeat running every 30 seconds (`tabletHeartbeat = setInterval(..., 30000)`, `src/main/index.ts:2181`) that terminates sockets which didn't pong since the last check. A hard, silent connection loss — exactly what a WiFi drop looks like (no clean TCP FIN) — can therefore take up to two heartbeat cycles (~60s) before `markZoneDisconnected` fires and the operator's screen-count/zone-status UI reflects it. During that window the app believes a screen is connected and healthy when it may already be frozen.

**Recommendation:** Shorten the heartbeat interval (e.g. 5-10s) for zone sockets specifically, since these are the screens the congregation is looking at.

**Fix direction:** This is a single-constant change plus giving it a name, matching the existing convention right above it (`TABLET_AUTH_MAX_FAILURES`/`TABLET_AUTH_LOCKOUT_MS` at lines 385-386).

Read `src/main/index.ts:380-390` yourself to confirm the exact current lines, then add the new constant alongside the existing tablet-server ones:

```ts
const TABLET_AUTH_MAX_FAILURES = 5
const TABLET_AUTH_LOCKOUT_MS = 60_000
// Zone Pi kiosks are the screens the congregation is looking at, so a dropped
// connection needs to surface fast — 8s means worst case one missed tick
// (~16s) before markZoneDisconnected fires, not the old ~60s (two 30s ticks).
const TABLET_HEARTBEAT_INTERVAL_MS = 8_000
```

Then update the interval call at (current) line 2181:

```ts
  tabletHeartbeat = setInterval(() => {
    for (const ws of tabletClients) {
      if (!aliveClients.has(ws)) {
        try { ws.terminate() } catch { /* ignore */ }
        tabletClients.delete(ws)
        continue
      }
      aliveClients.delete(ws)
      try { ws.ping() } catch { /* ignore */ }
    }
  }, TABLET_HEARTBEAT_INTERVAL_MS)
```

Do not change anything else about the heartbeat mechanism (the ping/pong/`aliveClients` WeakSet logic is correct as-is — this task is purely about the interval length).

**Verification:**
- [ ] Write the fix.
- [ ] `npx tsc --noEmit -p .` clean.
- [ ] `npm test` passes (no existing test covers this timer directly — verify by reading, matching this codebase's established convention for `src/main/index.ts` timer/orchestration changes).
- [ ] Manually verify by reasoning: confirm `TABLET_HEARTBEAT_INTERVAL_MS` is the only place `30000`/`8_000` for this timer appears, and that nothing else in the file (tests, other timers) assumed the old 30s value.
- [ ] Commit: `git add src/main/index.ts && git commit -m "perf: shorten the zone heartbeat interval so disconnects surface in seconds, not up to a minute"`

---

### Task 2: Show real connectivity in the Live tab's zone status panel, not just the app's intended content model

**Files:**
- Modify: `src/renderer/src/zones/ZoneStatusBox.tsx`
- Modify: `src/renderer/src/zones/LiveZoneStatus.tsx`

**Audit finding [15] HIGH — health-monitoring:** The 'Zones' panel pinned to the persistent Live rail (`ServiceRail.tsx` → `LiveZoneStatus.tsx` → `ZoneStatusBox.tsx`), the one piece of UI permanently on screen while operating a live service, renders only the app's *intended* content model for each zone via `computeZoneStates()`. It never consults `getConnectedZoneIds()`/`zonesConnected` at all. A zone whose Pi has silently dropped off WiFi still shows a perfectly normal-looking preview box in this panel — same mode label, same "what should be on screen" text — with no disconnected state, greying-out, or badge of any kind. The only place true connectivity (`zonesConnected` from `wf:getInfo`) surfaces today is the aggregate screen-count badge in `TopBar.tsx`/`HomeView.tsx`, and even there the specific missing zone name is buried inside a hover-only `title` tooltip — not something an operator glances at mid-service.

**Recommendation:** Merge `zonesConnected` into `ZoneStatusBox` so a disconnected zone visibly greys out or shows a "not connected" badge right in the panel the operator is already looking at.

**Fix direction:** `ZoneStatusBox` is shared between `LiveZoneStatus.tsx` (the Live rail, read-only) and `ZoneLiveGrid.tsx` (Setup's interactive pin grid) — read `src/renderer/src/zones/ZoneStatusBox.tsx` and both consumers yourself to confirm current shape. Add an **optional** `connected` prop, defaulting to "connected" when omitted, so `ZoneLiveGrid` (Setup, not in scope for this task) keeps working unchanged with no prop passed. Only wire the new prop into `LiveZoneStatus`, which is the panel finding #15 is about.

`src/renderer/src/zones/ZoneStatusBox.tsx`:

```tsx
import type { ZoneId, ZoneState } from '../../../shared/types'
import { ZONE_NAMES } from '../../../shared/types'
import { MODE_LABELS } from '../ZoneRoutingGrid'
import { readout } from './zoneReadout'

interface ZoneStatusBoxProps {
  zoneId: ZoneId
  zoneState: ZoneState | undefined
  // Omit (or pass true) when the caller doesn't track connectivity (e.g. Setup's
  // ZoneLiveGrid, which is not what an operator watches mid-service) — only a
  // literal `false` renders the disconnected state.
  connected?: boolean
}

function ZoneStatusBox({ zoneId, zoneState, connected = true }: ZoneStatusBoxProps): JSX.Element {
  const { primary, secondary } = readout(zoneState)
  return (
    <>
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">{ZONE_NAMES[zoneId]}</span>
        {connected ? (
          <span className="shrink-0 text-[10px] font-semibold text-slate-400">{MODE_LABELS[zoneState?.mode ?? 'off']}</span>
        ) : (
          <span className="flex shrink-0 items-center gap-1 rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Not connected
          </span>
        )}
      </div>
      {/* Same 16:9 box the Build Service zone cards use, so every screen of
          the app describes the same hardware the same way. */}
      <div className={`relative w-full ${connected ? '' : 'opacity-40'}`} style={{ paddingBottom: '56.25%' }}>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg px-1.5 ring-1 ring-white/10"
          style={{ background: zoneState?.mode === 'black' ? '#000' : '#2b2f36' }}
        >
          <span className="max-h-full overflow-hidden text-center text-[10px] font-medium leading-tight text-white/80">{primary}</span>
          {secondary && (
            <span className="max-h-full overflow-hidden text-center text-[9px] leading-tight text-white/40">{secondary}</span>
          )}
        </div>
      </div>
    </>
  )
}

export default ZoneStatusBox
```

`src/renderer/src/zones/LiveZoneStatus.tsx` — fetch `zonesConnected` the same way `TopBar.tsx`/`HomeView.tsx` already do (`window.wf.getInfo()` on a 2s poll — read `src/renderer/src/TopBar.tsx:61-76` for the exact established pattern before writing this), and pass `connected` through:

```tsx
import { useCallback, useEffect, useState } from 'react'
import type { AppInfo, ZoneId, ZoneState } from '../../../shared/types'
import ZoneStatusBox from './ZoneStatusBox'

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

function LiveZoneStatus(): JSX.Element {
  const [zoneStates, setZoneStates] = useState<Record<ZoneId, ZoneState> | null>(null)
  const [zonesConnected, setZonesConnected] = useState<ZoneId[]>([])

  const refreshStates = useCallback((): void => { void window.wf.zoneGetStates().then(setZoneStates) }, [])

  useEffect(() => {
    refreshStates()
    const off = window.wf.onState(() => refreshStates())
    return off
  }, [refreshStates])

  // Connectivity isn't part of the wf:state push (that's content, not transport) —
  // poll wf:getInfo the same way TopBar/HomeView already do for the same field.
  useEffect(() => {
    const load = (): void => { window.wf.getInfo().then((i: AppInfo) => setZonesConnected(i.zonesConnected)) }
    load()
    const t = setInterval(load, 2000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="p-2">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Zones</div>
      <div className="grid grid-cols-2 gap-2">
        {ZONE_IDS.map((zoneId) => (
          <div key={zoneId} className="rounded-xl border-2 border-slate-200 bg-white p-2">
            <ZoneStatusBox zoneId={zoneId} zoneState={zoneStates?.[zoneId]} connected={zonesConnected.includes(zoneId)} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default LiveZoneStatus
```

**Verification:**
- [ ] Write the fix.
- [ ] `npx tsc --noEmit -p .` clean.
- [ ] `npm test` passes.
- [ ] Confirm `src/renderer/src/zones/ZoneLiveGrid.tsx` (the other `ZoneStatusBox` consumer, in Setup) is untouched and still renders normally — it never passes `connected`, so it should keep defaulting to the connected look.
- [ ] Manually verify by reasoning: with all 4 zones connected, `zonesConnected` from `wf:getInfo` includes all 4 `ZoneId`s, so every box in the Live rail renders its normal mode label; if a zone Pi is closed/unreachable, its box should show the red "Not connected" badge and dim within ~2s (the poll interval) of the next heartbeat detecting the drop (Task 1 shortens that further).
- [ ] Commit: `git add src/renderer/src/zones/ZoneStatusBox.tsx src/renderer/src/zones/LiveZoneStatus.tsx && git commit -m "fix: show real zone connectivity in the Live rail's status panel, not just intended content"`

---

### Task 3: Show a persistent, app-wide badge while Stage Rehearsal is armed

**Files:**
- Modify: `src/renderer/src/TopBar.tsx`

**Audit finding [9] HIGH — stage-rehearsal:** The only visual cue that Stage Rehearsal is armed is the purple "Rehearsing" panel inside `StageRehearsalTools.tsx`, which is only mounted while `view === 'live'`. `TopBar.tsx`, `HomeView.tsx`, and every other tab have zero indication — `TopBar`'s existing amber "Rehearsing"/"Outputs held back" badge is for the unrelated, older `rehearsalMode` (global blank-outputs flag), not Stage Rehearsal. An operator who starts rehearsal, then switches to Service Builder or Songs to prep, has nothing telling them it's still running app-wide.

**Recommendation:** Surface a persistent, app-wide badge (e.g. in `TopBar`, visible from every tab) whenever `stageRehearsal.active` is true, matching how prominent the existing amber rehearsal-mode badge is.

**Fix direction:** `stageRehearsal.active` is already pushed on every `wf:state` broadcast (`buildStatePayload()` in `src/main/index.ts` includes it — confirm yourself by reading that function) — no new IPC is needed, `window.wf.onState(...)` (already used elsewhere in this codebase, e.g. `ZoneLiveGrid.tsx`) already delivers it.

Read `src/renderer/src/TopBar.tsx` yourself to confirm current line numbers before editing (it changes as earlier tasks land). Add state and a subscription alongside the existing `useEffect` that loads `outputs`/`zonesConnected`/etc (around line 61-76):

```tsx
  const [stageRehearsalActive, setStageRehearsalActive] = useState(false)
  useEffect(() => {
    window.wf.getStageRehearsal().then((s) => setStageRehearsalActive(s.active))
    const off = window.wf.onState((s) => setStageRehearsalActive(s.stageRehearsal.active))
    return off
  }, [])
```

Then render a badge matching the visual weight of the existing amber "Outputs held back" block, using violet — the color `StageRehearsalTools.tsx` already uses for rehearsal (`text-violet-700`, `bg-violet-50`, `border-violet-200`) — so the app-wide badge and the Live-tab panel read as the same feature. Place it right before the existing `{rehearsal ? (...) : screenCount > 0 ? (...) : (...)}` block (around line 153), so both badges can show at once if both are somehow active:

```tsx
        {stageRehearsalActive && (
          <button
            onClick={() => setView('live')}
            title="Stage Rehearsal is armed — Zone 4 is looping the rehearsal song, Zones 1-3 are looping announcements. Click to go manage it."
            className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-1.5 ring-1 ring-violet-500/30 hover:bg-violet-500/20"
          >
            <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-violet-500" />
            <span className="text-xs font-bold uppercase tracking-wide text-violet-700">
              Stage Rehearsal active
            </span>
          </button>
        )}
```

**Verification:**
- [ ] Write the fix.
- [ ] `npx tsc --noEmit -p .` clean.
- [ ] `npm test` passes.
- [ ] Manually verify by reasoning: confirm `buildStatePayload()` really does include `stageRehearsal` on every broadcast (already true per Task 5 of Batch 1's investigation — re-confirm by reading, don't assume), so the badge updates live without polling; confirm clicking the badge calls `setView('live')` using the same `setView` prop `TopBar` already receives (used elsewhere in this file, e.g. the Volunteer mode button).
- [ ] Commit: `git add src/renderer/src/TopBar.tsx && git commit -m "fix: show an app-wide badge while Stage Rehearsal is armed, not just on the Live tab"`

---

### Task 4: Stop Stage Rehearsal from hijacking a zone that's legitimately assigned to Second

**Files:**
- Modify: `src/shared/stageRehearsal.ts`
- Modify: `src/shared/stageRehearsal.test.ts`

**Audit finding [10] HIGH — stage-rehearsal:** `zoneTrackFor()` only forces zone 4 onto the Second track while rehearsal is active; zones 1-3 keep whatever track they're assigned via the ordinary, fully exposed per-service `zone_track_assignment` feature. If any zone 1-3 is configured to follow Second — a legitimate, real use case (e.g. a split-screen drama or video on Second) — starting Stage Rehearsal will make that real congregation/Lyrics-TV screen show the rehearsal song being stepped through, directly contradicting both the code's own comment ("Zones 1-3 keep showing a chosen announcement on Main, untouched") and the operator-facing UI copy in `StageRehearsalTools.tsx` ("Zones 1-3 automatically loop through the service's announcements the whole time").

**Recommendation:** Either force every zone (not just 4) back to Main while rehearsal is active, or explicitly warn/block starting Stage Rehearsal when any zone besides 4 is assigned to Second.

**Fix direction:** Force every zone besides 4 back to Main while armed — this is the simpler, self-contained fix, and it's what the code's own comment and the operator-facing copy already promise (no UI/copy changes needed, just making the behavior match what's already claimed). Read `src/shared/stageRehearsal.ts` yourself to confirm the current function before editing:

```ts
// Zone 4 follows Second while armed, regardless of the service's persisted
// zone_track_assignment — a temporary, session-only override, not a change
// to the service's saved config, so disarming needs no cleanup. Zones 1-3
// are forced onto Main for the same reason: an operator's real
// zone_track_assignment might legitimately point one of them at Second (e.g.
// a split-screen video), and if it does, rehearsal must not let the
// rehearsal song bleed onto that real congregation screen.
export function zoneTrackFor(zoneId: ZoneId, state: StageRehearsalState, assigned: TrackId): TrackId {
  if (!state.active) return assigned
  return zoneId === 4 ? 'second' : 'main'
}
```

This is a one-line behavioral change (`: assigned` → `: 'main'` for the non-4 case) plus the updated comment.

The existing test in `src/shared/stageRehearsal.test.ts` currently encodes the *buggy* behavior and must be corrected, not just left passing — it only exercises zones 1-3 with `assigned = 'main'`, which never distinguishes the fix from the bug. Replace this block:

```ts
  it('armed: zones 1-3 are untouched, keep their assigned track', () => {
    expect(zoneTrackFor(1, armed, 'main')).toBe('main')
    expect(zoneTrackFor(2, armed, 'main')).toBe('main')
    expect(zoneTrackFor(3, armed, 'main')).toBe('main')
  })
```

with:

```ts
  it('armed: zones 1-3 are forced onto Main even if assigned Second', () => {
    expect(zoneTrackFor(1, armed, 'main')).toBe('main')
    expect(zoneTrackFor(2, armed, 'second')).toBe('main') // the actual bug this closes
    expect(zoneTrackFor(3, armed, 'second')).toBe('main')
  })
```

**Verification:**
- [ ] Write the failing test first (the corrected assertions above against the *unfixed* function) and confirm it fails: `npx vitest run src/shared/stageRehearsal.test.ts` should show the `zoneId 2`/`3` cases returning `'second'` instead of the expected `'main'`.
- [ ] Apply the one-line fix to `zoneTrackFor`.
- [ ] Re-run: `npx vitest run src/shared/stageRehearsal.test.ts` — all cases pass.
- [ ] `npx tsc --noEmit -p .` clean.
- [ ] `npm test` passes (full suite, not just this file).
- [ ] Confirm no other caller of `zoneTrackFor` (check `src/main/index.ts`) assumed the old passthrough behavior for zones 1-3 — read the one call site (`computeZoneStates()`) to confirm it just forwards the return value with no zone-specific special-casing that would break.
- [ ] Commit: `git add src/shared/stageRehearsal.ts src/shared/stageRehearsal.test.ts && git commit -m "fix: Stage Rehearsal forces zones 1-3 onto Main so it can't bleed onto a zone assigned to Second"`

---

### Task 5: Add first-run onboarding + an always-available help panel

**Files:**
- Create: `src/renderer/src/OnboardingHelp.tsx`
- Modify: `src/renderer/src/TopBar.tsx`

**Audit finding [16] HIGH — usability-onboarding:** A repo-wide search for onboarding/tooltip/tour/help/quickstart/welcome components under `src/renderer/src` returned nothing — there is no first-run walkthrough, contextual tooltip system, or help screen anywhere in the app. Volunteer Mode (`VolunteerView.tsx`) is genuinely built for an unfamiliar operator, and it's reasonably discoverable (a card on the Home screen, a persistent button in `TopBar`). But nothing explains what "Logo" or "Black" actually do to the physical screens, there's no indication a service must already be fully built by someone else before Volunteer Mode is usable, and a substitute who instead lands in the full Live/Build Service surface gets no signal steering them toward the simpler mode or explaining any of the controls.

**Recommendation:** Add a short first-run overlay or persistent "?" help panel explaining Black/Logo/Lyrics modes and pointing an unfamiliar user at Volunteer Mode, since right now that knowledge exists only in the regular operator's head or in external docs/training, not in the app.

**Fix direction:** A generic per-key setting API already exists and is exposed to the renderer (`window.wf.settingGet(key)`/`settingSet(key, value)`, `src/preload/index.ts:216-218`) — no new IPC handler is needed. Use it to persist a "has the operator seen this" flag, and gate the automatic first-run open on it. Also add a permanent "?" button so it can be reopened any time, since a first-run overlay that only ever shows once is useless to the *next* new volunteer using a machine that's already past its first run.

Create `src/renderer/src/OnboardingHelp.tsx`:

```tsx
import { X } from 'lucide-react'

interface OnboardingHelpProps {
  onClose: () => void
  onGoToVolunteer: () => void
}

// First-run overlay + on-demand help (via TopBar's "?" button). Explains the
// three modes an unfamiliar operator will actually touch, and the one thing
// that trips people up most: Volunteer Mode only works once someone else has
// already built the service — see the 2026-08-16 audit finding this exists
// to close (no onboarding/help surface existed anywhere in the app before).
function OnboardingHelp({ onClose, onGoToVolunteer }: OnboardingHelpProps): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Quick start</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 text-sm text-slate-700">
          <p>
            Every screen shows one of three things: <strong>Lyrics</strong> (whatever slide is live —
            a song, sermon point, or announcement), <strong>Logo</strong> (the church logo, for
            between-service quiet), or <strong>Black</strong> (nothing at all).
          </p>
          <p>
            A service has to already be built — songs, sermon, announcements added in order — before
            anyone can run it live. If you&rsquo;re filling in and unsure what to do, use{' '}
            <strong>Volunteer Mode</strong>: it only shows Prev/Next and the Black/Logo/Lyrics buttons,
            and it needs someone else to have built the service first.
          </p>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100">
            Close
          </button>
          <button
            onClick={onGoToVolunteer}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Take me to Volunteer Mode
          </button>
        </div>
      </div>
    </div>
  )
}

export default OnboardingHelp
```

In `TopBar.tsx`: import the new component and `HelpCircle` from `lucide-react`, add state, a first-run check, and a permanent help button. Read the current file yourself first (line numbers shift after Tasks 2-4 land) — this sketch shows the additions in context of the existing `useEffect`/JSX you already have open from Task 3:

```tsx
import { HelpCircle } from 'lucide-react' // add to the existing lucide-react import
import OnboardingHelp from './OnboardingHelp'
```

```tsx
  const [helpOpen, setHelpOpen] = useState(false)
  useEffect(() => {
    window.wf.settingGet('has_seen_onboarding').then((v) => {
      if (v !== '1') {
        setHelpOpen(true)
        void window.wf.settingSet('has_seen_onboarding', '1')
      }
    })
  }, [])
```

Add the "?" button next to the existing Volunteer mode button (inside the `border-l border-slate-200 pl-3` group at the end of the header), and mount the panel conditionally at the end of the component:

```tsx
        <button
          onClick={() => setHelpOpen(true)}
          title="Quick start help"
          className="ml-1.5 flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-100"
        >
          <HelpCircle size={15} />
        </button>
      </div>
      {helpOpen && (
        <OnboardingHelp
          onClose={() => setHelpOpen(false)}
          onGoToVolunteer={() => { setView('volunteer'); setHelpOpen(false) }}
        />
      )}
    </header>
```

**Verification:**
- [ ] Write the fix.
- [ ] `npx tsc --noEmit -p .` clean.
- [ ] `npm test` passes (no new tests expected — this is presentational UI wired to already-tested/already-mocked APIs; `settingGet`/`settingSet`/`onState` are already covered by `src/renderer/src/browserWfMock.ts` for browser-preview use, confirm by reading that file that nothing there needs updating for this task).
- [ ] Manually verify by reasoning: on a machine where `settingGet('has_seen_onboarding')` has never been set, the panel should auto-open once and then not reappear on the next launch (since `settingSet` runs immediately after the check); the "?" button must always reopen it regardless of that flag, so a returning-but-unfamiliar volunteer can still find it.
- [ ] Commit: `git add src/renderer/src/OnboardingHelp.tsx src/renderer/src/TopBar.tsx && git commit -m "feat: add first-run onboarding + an always-available help panel explaining Black/Logo/Lyrics and Volunteer Mode"`

---

## Non-goals for this batch

- Zone screens (Pi kiosks) themselves gaining any visual disconnect indicator — finding #13 explicitly recommends keeping the frozen-frame look for the congregation-facing side and only adding operator-side awareness, which Tasks 1-2 do.
- Code signing, auto-update republishing, CI, and version/branch discipline — tracked as "Batch 3" per Batch 1's plan, a business/process decision (certificate purchase) plus deployment tooling, not code fixes of this shape.
- The visual "Control Room" redesign — already has its own approved spec/plan, tracked and executed separately.
- The corrupted `PTSerif-Bold.ttf` font file — needs a real replacement asset, not a code fix; tracked separately.

## Self-Review

**Spec coverage:** All 5 tasks map 1:1 to a specific, verified audit finding (#14, #15, #9, #10, #16) — the complete "Batch 2" scope called out in Batch 1's own Non-goals section (zone disconnect visibility = Tasks 1-2, Stage Rehearsal indicator + Second-track protection = Tasks 3-4, onboarding = Task 5). Finding #13 is explicitly addressed by not changing the Pi-side code, per its own recommendation. Nothing in scope was silently dropped.

**Placeholder scan:** Every task shows the actual current code, the actual new/changed code (not "similar to X" or "add appropriate handling"), and a concrete verification scenario. No TBDs.

**Type consistency:** `ZoneStatusBox`'s new `connected?: boolean` prop (Task 2) is consumed with the exact same name in `LiveZoneStatus.tsx`. `stageRehearsal.active`/`StageRehearsalState` (Task 3) and `zoneTrackFor`'s signature (Task 4) are unchanged from their existing declarations in `src/shared/stageRehearsal.ts` and `src/shared/types.ts` — only `zoneTrackFor`'s return value for the zones-1-3 case changes, not its signature, so no caller needs updating beyond the one call site confirmed in Task 4's verification. `OnboardingHelp`'s props (`onClose`, `onGoToVolunteer`) match exactly how `TopBar.tsx` invokes it in Task 5.
