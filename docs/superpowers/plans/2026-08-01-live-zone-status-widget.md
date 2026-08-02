# Live tab zone status widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Live tab rail's misleading "Main Audience Output" preview box with an accurate, read-only status of all 4 real zones, sharing its logic with Setup's existing zone grid so the two can never disagree.

**Architecture:** Extract the pure "what is this zone showing" logic and its small presentational card out of the existing `ZoneLiveGrid` (Setup → Screens & zones) into two shared files. Build a new, lean, read-only widget for the Live tab's rail on top of those shared pieces — no click handlers, no pin picker. Swap it in for the old `OutputPreview` and delete that file.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, existing `window.wf` IPC bridge (`zoneGetStates`, `onState`).

**Spec:** `docs/superpowers/specs/2026-08-01-live-zone-status-widget-design.md`

---

## Before you start

Mandatory gate before every commit:

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

As of this plan, that gate passes with **329 tests, 0 lint errors** (11 pre-existing warnings in unrelated files — do not touch them). Do not commit if any of the four fails.

Repo conventions already established this session, still in force:

1. **Never `git add -A` or `git add .`.** Stage only the exact files each task names.
2. **This sandbox cannot launch Electron.** Task 4 is marked **[manual]** — verified by the user, not by you.
3. This is a pure UI refactor/swap — no new IPC, no new types, no schema changes.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/renderer/src/zones/zoneReadout.ts` | Pure functions: `mmss()` (seconds → `m:ss`) and `readout()` (a `ZoneState` → what to show, in plain words). Extracted verbatim from `ZoneLiveGrid.tsx`, no behavior change. |
| `src/renderer/src/zones/ZoneStatusBox.tsx` | The small presentational card (zone name, mode label, dark 16:9 preview with primary/secondary text) for a single zone. No click handling, no pin state — just a `zoneId` + `zoneState` in, JSX out. Shared by both `ZoneLiveGrid` (interactive, Setup) and the new `LiveZoneStatus` (read-only, Live tab). |
| `src/renderer/src/zones/LiveZoneStatus.tsx` | The new Live-tab rail widget: fetches zone state itself, renders a 2×2 grid of `ZoneStatusBox`, nothing clickable. |

**Modified:**

| File | Change |
|---|---|
| `src/renderer/src/zones/ZoneLiveGrid.tsx` | Uses `zoneReadout.ts` and `ZoneStatusBox` instead of its own local copies. Behavior in Setup is unchanged — this is a refactor for sharing, not a feature change. |
| `src/renderer/src/ServiceRail.tsx` | Swaps `<OutputPreview />` for `<LiveZoneStatus />`. |

**Removed:**

| File | Why |
|---|---|
| `src/renderer/src/OutputPreview.tsx` | Its only consumer (`ServiceRail.tsx`) no longer uses it. |

**Not touched:** `wf:getInfo`, the `outputs` field, `HomeView.tsx`, `TopBar.tsx`, `DiagnosticsTab.tsx`, `ZonePinPicker.tsx`, `ZoneRoutingGrid.tsx` (still the source of `MODE_LABELS`), `computeZoneStates`, and everything about how zones are actually routed.

---

## Task 1: Extract shared zone-readout logic and status box

This is one task, not two, on purpose: splitting the pure-function extraction from the component extraction would leave `ZoneLiveGrid.tsx` with an import it doesn't use yet (or a call site it's about to lose) in between — messier to review and no real benefit. Doing both together keeps every commit in a working, lint-clean state.

**Files:**
- Create: `src/renderer/src/zones/zoneReadout.ts`
- Create: `src/renderer/src/zones/ZoneStatusBox.tsx`
- Modify: `src/renderer/src/zones/ZoneLiveGrid.tsx`

- [ ] **Step 1: Create the shared readout module**

Create `src/renderer/src/zones/zoneReadout.ts`:

```ts
import type { ZoneState } from '../../../shared/types'

export function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// What this screen is showing RIGHT NOW, in the operator's words. Showing only
// a mode chip would mean a screen holding the wrong sermon and a screen
// following the service look identical.
export function readout(zs: ZoneState | undefined): { primary: string; secondary: string | null } {
  if (!zs) return { primary: '…', secondary: null }
  switch (zs.mode) {
    case 'off': return { primary: 'Off', secondary: null }
    case 'black': return { primary: 'Black', secondary: null }
    case 'logo': return { primary: 'Logo', secondary: null }
    case 'image': return { primary: zs.title || 'Image', secondary: null }
    case 'countdown': return { primary: mmss(zs.secondsLeft), secondary: zs.title || null }
    case 'stage': return { primary: zs.stageMessage || zs.line || 'Stage', secondary: zs.title || null }
    case 'sermon': return {
      primary: zs.title || 'Sermon',
      secondary: [zs.speaker, zs.passage].filter(Boolean).join(' · ') || null
    }
    case 'livecall': return { primary: 'Live Call', secondary: zs.title || null }
    case 'lyrics':
    case 'text': return { primary: zs.line || zs.title || '—', secondary: zs.line ? zs.title || null : null }
  }
}
```

This is `ZoneLiveGrid.tsx`'s existing `mmss`/`readout` functions moved verbatim (character-for-character body, just `export`ed and given their own file) — do not change any logic while moving it.

- [ ] **Step 2: Create the shared status box component**

Create `src/renderer/src/zones/ZoneStatusBox.tsx`:

```tsx
import type { ZoneId, ZoneState } from '../../../shared/types'
import { ZONE_NAMES } from '../../../shared/types'
import { MODE_LABELS } from '../ZoneRoutingGrid'
import { readout } from './zoneReadout'

interface ZoneStatusBoxProps {
  zoneId: ZoneId
  zoneState: ZoneState | undefined
}

// The zone name/mode header plus the 16:9 dark preview showing what a zone is
// actually displaying right now. Shared between Setup's interactive pin grid
// (ZoneLiveGrid) and the Live tab's read-only status widget (LiveZoneStatus)
// so the same zone always reads the same way in both places — see the
// 2026-08-01 design spec.
function ZoneStatusBox({ zoneId, zoneState }: ZoneStatusBoxProps): JSX.Element {
  const { primary, secondary } = readout(zoneState)
  return (
    <>
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">{ZONE_NAMES[zoneId]}</span>
        <span className="shrink-0 text-[10px] font-semibold text-slate-400">{MODE_LABELS[zoneState?.mode ?? 'off']}</span>
      </div>
      {/* Same 16:9 box the Build Service zone cards use, so every screen of
          the app describes the same hardware the same way. */}
      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
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

- [ ] **Step 3: Update ZoneLiveGrid.tsx's imports**

In `src/renderer/src/zones/ZoneLiveGrid.tsx`, find the top of the file:

```ts
import { useCallback, useEffect, useState } from 'react'
import { Pin, X } from 'lucide-react'
import type { ZoneId, ZoneState } from '../../../shared/types'
import { ZONE_NAMES, DEFAULT_ZONE_TRACK } from '../../../shared/types'
import type { ZonePin, ZonePins } from '../../../shared/zonePins'
import { pinLabel } from '../../../shared/zonePins'
import type { ZoneTrackAssignment } from '../../../shared/zoneTrack'
import { MODE_LABELS } from '../ZoneRoutingGrid'
import { useService } from '../ServiceContext'
import ZonePinPicker from './ZonePinPicker'

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// What this screen is showing RIGHT NOW, in the operator's words. The old panel
// showed only a mode chip, which meant a screen holding the wrong sermon and a
// screen following the service looked identical.
function readout(zs: ZoneState | undefined): { primary: string; secondary: string | null } {
  if (!zs) return { primary: '…', secondary: null }
  switch (zs.mode) {
    case 'off': return { primary: 'Off', secondary: null }
    case 'black': return { primary: 'Black', secondary: null }
    case 'logo': return { primary: 'Logo', secondary: null }
    case 'image': return { primary: zs.title || 'Image', secondary: null }
    case 'countdown': return { primary: mmss(zs.secondsLeft), secondary: zs.title || null }
    case 'stage': return { primary: zs.stageMessage || zs.line || 'Stage', secondary: zs.title || null }
    case 'sermon': return {
      primary: zs.title || 'Sermon',
      secondary: [zs.speaker, zs.passage].filter(Boolean).join(' · ') || null
    }
    case 'livecall': return { primary: 'Live Call', secondary: zs.title || null }
    case 'lyrics':
    case 'text': return { primary: zs.line || zs.title || '—', secondary: zs.line ? zs.title || null : null }
  }
}
```

Replace the whole block with:

```ts
import { useCallback, useEffect, useState } from 'react'
import { Pin, X } from 'lucide-react'
import type { ZoneId, ZoneState } from '../../../shared/types'
import { ZONE_NAMES, DEFAULT_ZONE_TRACK } from '../../../shared/types'
import type { ZonePin, ZonePins } from '../../../shared/zonePins'
import { pinLabel } from '../../../shared/zonePins'
import type { ZoneTrackAssignment } from '../../../shared/zoneTrack'
import { useService } from '../ServiceContext'
import ZonePinPicker from './ZonePinPicker'
import ZoneStatusBox from './ZoneStatusBox'

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]
```

Note what's gone: the `MODE_LABELS` import (only `ZoneStatusBox` needs it now) and the local `mmss`/`readout` functions (moved to `zoneReadout.ts`, and `ZoneLiveGrid.tsx` itself no longer calls either directly after Step 4). `ZoneState` stays imported — it's still used for the `zoneStates` state's type.

- [ ] **Step 4: Replace the inline box JSX with ZoneStatusBox**

Still in `src/renderer/src/zones/ZoneLiveGrid.tsx`, find the zone grid's `.map()`:

```tsx
      <div className="grid grid-cols-2 gap-2">
        {ZONE_IDS.map((zoneId) => {
          const zs = zoneStates?.[zoneId]
          const pin = pins[zoneId] ?? null
          const { primary, secondary } = readout(zs)
          return (
            <div key={zoneId} className="relative">
              <div
                onClick={() => setOpenZone(zoneId)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenZone(zoneId) } }}
                title={`${ZONE_NAMES[zoneId]} — click to hold or follow the service`}
                className={`cursor-pointer rounded-xl border-2 p-2 transition-colors ${
                  pin ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-400/30' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between gap-1">
                  <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">{ZONE_NAMES[zoneId]}</span>
                  <span className="shrink-0 text-[10px] font-semibold text-slate-400">{MODE_LABELS[zs?.mode ?? 'off']}</span>
                </div>
                {/* Same 16:9 box the Build Service zone cards use, so the two
                    screens of the app describe the same hardware the same way. */}
                <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg px-1.5 ring-1 ring-white/10"
                    style={{ background: zs?.mode === 'black' ? '#000' : '#2b2f36' }}
                  >
                    <span className="max-h-full overflow-hidden text-center text-[10px] font-medium leading-tight text-white/80">{primary}</span>
                    {secondary && (
                      <span className="max-h-full overflow-hidden text-center text-[9px] leading-tight text-white/40">{secondary}</span>
                    )}
                  </div>
                </div>
                {pin && (
                  <div className="mt-1.5 flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5">
                    <Pin size={10} className="shrink-0 text-amber-600" />
                    <span className="flex-1 truncate text-[10px] font-semibold text-amber-700">{pinLabel(pin, items)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setPin(zoneId, null) }}
                      title="Unpin — follow the service again"
                      className="shrink-0 rounded text-amber-600 hover:bg-amber-200/60 hover:text-amber-800"
                    >
                      <X size={11} />
                    </button>
                  </div>
                )}
              </div>
              {openZone === zoneId && (
                <ZonePinPicker
                  zoneId={zoneId}
                  pin={pin}
                  liveItem={liveMainItem}
                  items={items}
                  serviceId={activeService?.id ?? null}
                  trackAssignment={trackAssignment}
                  onTrackAssignmentChange={setTrackAssignment}
                  onTrackAssignmentPersisted={refreshStates}
                  onPick={(next) => { setPin(zoneId, next); closePicker() }}
                  onClose={closePicker}
                  placement={zoneId >= 3 ? 'above' : 'below'}
                  align={zoneId % 2 === 0 ? 'right' : 'left'}
                />
              )}
            </div>
          )
        })}
      </div>
```

Replace with (only the `const { primary, secondary } = readout(zs)` line and the header/box `<div>`s inside the clickable wrapper change — the pin badge and `ZonePinPicker` block are untouched):

```tsx
      <div className="grid grid-cols-2 gap-2">
        {ZONE_IDS.map((zoneId) => {
          const zs = zoneStates?.[zoneId]
          const pin = pins[zoneId] ?? null
          return (
            <div key={zoneId} className="relative">
              <div
                onClick={() => setOpenZone(zoneId)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenZone(zoneId) } }}
                title={`${ZONE_NAMES[zoneId]} — click to hold or follow the service`}
                className={`cursor-pointer rounded-xl border-2 p-2 transition-colors ${
                  pin ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-400/30' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <ZoneStatusBox zoneId={zoneId} zoneState={zs} />
                {pin && (
                  <div className="mt-1.5 flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5">
                    <Pin size={10} className="shrink-0 text-amber-600" />
                    <span className="flex-1 truncate text-[10px] font-semibold text-amber-700">{pinLabel(pin, items)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setPin(zoneId, null) }}
                      title="Unpin — follow the service again"
                      className="shrink-0 rounded text-amber-600 hover:bg-amber-200/60 hover:text-amber-800"
                    >
                      <X size={11} />
                    </button>
                  </div>
                )}
              </div>
              {openZone === zoneId && (
                <ZonePinPicker
                  zoneId={zoneId}
                  pin={pin}
                  liveItem={liveMainItem}
                  items={items}
                  serviceId={activeService?.id ?? null}
                  trackAssignment={trackAssignment}
                  onTrackAssignmentChange={setTrackAssignment}
                  onTrackAssignmentPersisted={refreshStates}
                  onPick={(next) => { setPin(zoneId, next); closePicker() }}
                  onClose={closePicker}
                  placement={zoneId >= 3 ? 'above' : 'below'}
                  align={zoneId % 2 === 0 ? 'right' : 'left'}
                />
              )}
            </div>
          )
        })}
      </div>
```

- [ ] **Step 5: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, **329 tests** (no new tests — this step is a pure extraction/refactor with no behavior change), **0 lint errors**. Typecheck and lint are the meaningful checks here — they will catch a leftover unused import (`MODE_LABELS`, `readout`, `mmss`) or a missed reference immediately.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/zones/zoneReadout.ts src/renderer/src/zones/ZoneStatusBox.tsx src/renderer/src/zones/ZoneLiveGrid.tsx
git commit -m "refactor: share zone readout logic and status box between Setup and a future Live tab widget"
```

---

## Task 2: LiveZoneStatus — the read-only Live tab widget

**Files:**
- Create: `src/renderer/src/zones/LiveZoneStatus.tsx`

- [ ] **Step 1: Write the component**

Create `src/renderer/src/zones/LiveZoneStatus.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import type { ZoneId, ZoneState } from '../../../shared/types'
import ZoneStatusBox from './ZoneStatusBox'

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

// Read-only per-zone status for the Live tab's rail — replaces the old
// "Main Audience Output" preview, which showed a generic, un-zoned render
// that could visibly disagree with what the real screens were doing (it
// didn't run through zone routing at all, and its "Program" badge was gated
// on a local-output-window counter that's always 0 for an all-zone setup).
// Shares ZoneStatusBox/readout with Setup's interactive ZoneLiveGrid so the
// two views can never disagree. No pin controls here — pinning stays a
// Setup-only action. See the 2026-08-01 design spec.
function LiveZoneStatus(): JSX.Element {
  const [zoneStates, setZoneStates] = useState<Record<ZoneId, ZoneState> | null>(null)

  const refreshStates = useCallback((): void => { void window.wf.zoneGetStates().then(setZoneStates) }, [])

  // Zone state isn't part of the wf:state push payload itself (that's just
  // main/second track state) — a push is the signal to re-fetch, the same
  // pattern ZoneLiveGrid already uses.
  useEffect(() => {
    refreshStates()
    const off = window.wf.onState(() => refreshStates())
    return off
  }, [refreshStates])

  return (
    <div className="p-2">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Zones</div>
      <div className="grid grid-cols-2 gap-2">
        {ZONE_IDS.map((zoneId) => (
          <div key={zoneId} className="rounded-xl border-2 border-slate-200 bg-white p-2">
            <ZoneStatusBox zoneId={zoneId} zoneState={zoneStates?.[zoneId]} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default LiveZoneStatus
```

- [ ] **Step 2: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, **329 tests** (no new tests — this is a thin read-only UI component, matching how `OutputPreview.tsx` and `ZoneLiveGrid.tsx` themselves have no tests), **0 lint errors**.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/zones/LiveZoneStatus.tsx
git commit -m "feat: read-only per-zone status widget for the Live tab rail"
```

---

## Task 3: Wire it in and remove the old preview

**Files:**
- Modify: `src/renderer/src/ServiceRail.tsx`
- Delete: `src/renderer/src/OutputPreview.tsx`

- [ ] **Step 1: Swap the import and usage**

In `src/renderer/src/ServiceRail.tsx`, find:

```ts
import OutputPreview from './OutputPreview'
```

Replace with:

```ts
import LiveZoneStatus from './zones/LiveZoneStatus'
```

Find:

```tsx
      <div className="border-t border-slate-200">
        <OutputPreview />
      </div>
```

Replace with:

```tsx
      <div className="border-t border-slate-200">
        <LiveZoneStatus />
      </div>
```

- [ ] **Step 2: Fix the now-stale comment**

Still in `src/renderer/src/ServiceRail.tsx`, find:

```ts
// Persistent left rail: the loaded service's items + the pinned output preview.
```

Replace with:

```ts
// Persistent left rail: the loaded service's items + the pinned zone status.
```

- [ ] **Step 3: Delete the old preview component**

```bash
git rm src/renderer/src/OutputPreview.tsx
```

Confirm nothing else references it before running the gate:

```bash
grep -r "OutputPreview" src/
```

Expected: no output (the only reference was the import in `ServiceRail.tsx`, already changed in Step 1).

- [ ] **Step 4: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, **329 tests**, **0 lint errors**. Typecheck will fail loudly if any reference to `OutputPreview` or `./OutputPreview` was missed.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/ServiceRail.tsx
git commit -m "feat: replace the Live tab's Main Audience Output preview with real zone status"
```

(`git rm` from Step 3 already staged the deletion — this commit picks that up along with the `ServiceRail.tsx` change. Verify with `git status` before committing that only these two changes — the modified file and the deleted file — are staged.)

---

## Task 4: Manual verification

No more code changes. This task is entirely **[manual]** — this sandbox cannot launch Electron. Ask the user to run through this list before trusting the new widget for a real service.

- [ ] **Step 1: The rail shows real zone status**

Open the Live tab with a service loaded. Confirm the rail's bottom widget shows a 2×2 grid of the 4 zone names (Back Left, Back Right, Lyrics TVs, Stage Monitors) with a mode label and current content for each — not the old "Main Audience Output" box, and no red "Program" badge anywhere (it's gone, by design).

- [ ] **Step 2: Song content matches**

Go live with a song. Confirm the Lyrics TVs box shows the live lyric line, and the back-screen boxes reflect whatever they're actually routed to show (logo, by default for a song).

- [ ] **Step 3: Sermon content matches Setup exactly**

Go live with a sermon item. Confirm the back-screen boxes show the sermon title/speaker in the Live tab's widget, and that this matches Setup → Screens & zones exactly for the same zones at the same moment — the two should never disagree, since they now share the same `readout()` logic.

- [ ] **Step 4: Pinned zones show correctly, without a way to unpin from Live**

From Setup → Screens & zones, pin one zone to something. Confirm the Live tab's widget shows that zone's held content, but there's no click/pin-picker available on the Live tab's version — only Setup can change it.

- [ ] **Step 5: Setup is unchanged**

Confirm Setup → Screens & zones itself still behaves exactly as before this change — pin/unpin, the sermon-suggestion banner, the popover picker. This refactor should be completely invisible there.

---

## Self-review notes

**Spec coverage.** Component structure (spec §1) → Tasks 1–3 create/modify/remove exactly the files listed. Data flow (§2) → Task 2's `LiveZoneStatus` uses the same fetch-on-mount + refetch-on-push pattern as `ZoneLiveGrid`, per the spec. Error handling (§3) → both "no zone data yet" and "zone off" fall out of the existing `readout()` function unchanged, nothing new to build. Testing (§4) → no new tests, matching the spec's reasoning; Task 4 covers the spec's 5-step manual verification list one-to-one.

**Non-goals respected.** No pin controls added to the Live tab (Task 2's `LiveZoneStatus` has no click handlers, no state writes, no `ZonePinPicker` import). No change to `computeZoneStates`, zone routing, `wf:getInfo`, `HomeView.tsx`, or `TopBar.tsx` — none of those files appear in any task's file list.

**Type consistency check.** `ZoneStatusBoxProps` (`{ zoneId: ZoneId; zoneState: ZoneState | undefined }`, Task 1) is the exact shape both call sites use: `ZoneLiveGrid.tsx`'s `<ZoneStatusBox zoneId={zoneId} zoneState={zs} />` (Task 1 Step 4) and `LiveZoneStatus.tsx`'s `<ZoneStatusBox zoneId={zoneId} zoneState={zoneStates?.[zoneId]} />` (Task 2) — same prop names, same optionality. `readout()`'s return shape (`{ primary: string; secondary: string | null }`, Task 1 Step 1) is only ever consumed inside `ZoneStatusBox.tsx` itself now, not re-destructured anywhere else, so there's no second place that could drift out of sync with it.
