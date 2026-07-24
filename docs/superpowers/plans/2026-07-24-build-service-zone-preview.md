# Build Service Zone Assignment Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator see and change which physical screens Main/Second feed directly from Build Service, without switching to the Live tab.

**Architecture:** Extract the per-zone Main/Second toggle button pair out of `ZonePanel.tsx` into a small shared component (`ZoneTrackToggle.tsx`) so it can be reused. Add a new tiny 4-cell strip badge (`ZoneTrackStripBadge.tsx`, visually parallel to the existing `ZoneStripBadge.tsx`) that shows at a glance which track each zone follows. Wire both into `ServiceDeck.tsx` as a button-that-opens-a-popover next to the existing Main/Second tabs. No backend/IPC changes — everything reuses `zoneTrackAssignmentGet`/`Set`, already built.

**Tech Stack:** React 18 + TypeScript (Electron renderer).

**Design doc:** [`docs/superpowers/specs/2026-07-24-build-service-zone-preview-design.md`](../specs/2026-07-24-build-service-zone-preview-design.md)

---

## Testing convention

This is UI wiring over an existing, already-tested IPC surface (`zoneTrackAssignmentGet`/`Set`, covered by `src/shared/zoneTrack.test.ts`) — no new pure logic to unit test. Per this codebase's established convention (confirmed by the identical prior `ZonePanel`/`ServiceDeck` track-assignment work, which shipped without new tests), this plan is verified manually (Task 4) plus `npm run typecheck` / `npm test` (regression-only) after each task.

## File Structure

- **Create** `src/renderer/src/ZoneTrackToggle.tsx` — the Main/Second button pair for one zone. Shared by `ZonePanel.tsx` and the new Build Service popover.
- **Create** `src/renderer/src/ZoneTrackStripBadge.tsx` — the 4-cell "which track does each zone follow" visual, parallel to the existing `ZoneStripBadge.tsx`.
- **Modify** `src/renderer/src/ZonePanel.tsx` — replace its inline track-assignment buttons with `<ZoneTrackToggle/>` (pure extraction, zero layout/behavior change).
- **Modify** `src/renderer/src/ServiceDeck.tsx` — add the strip badge + popover next to the Main/Second tabs.

---

### Task 1: Extract `ZoneTrackToggle` out of `ZonePanel.tsx`

**Files:**
- Create: `src/renderer/src/ZoneTrackToggle.tsx`
- Modify: `src/renderer/src/ZonePanel.tsx`

- [ ] **Step 1: Create the shared toggle component**

Create `src/renderer/src/ZoneTrackToggle.tsx`:

```tsx
import type { ZoneId, TrackId } from '../../shared/types'
import type { ZoneTrackAssignment } from '../../shared/zoneTrack'

// The Main/Second button pair for a single zone — shared by ZonePanel (Live tab)
// and Build Service's zone-assignment popover, both driving the same per-service
// zone_track_assignment through window.wf.zoneTrackAssignmentSet.
function ZoneTrackToggle({ serviceId, zoneId, assignment, onChanged }: {
  serviceId: number
  zoneId: ZoneId
  assignment: ZoneTrackAssignment
  onChanged: (next: ZoneTrackAssignment) => void
}): JSX.Element {
  const setZoneTrack = (track: TrackId): void => {
    const next = { ...assignment, [zoneId]: track }
    onChanged(next)
    void window.wf.zoneTrackAssignmentSet(serviceId, next)
  }

  return (
    <div className="flex gap-1">
      {(['main', 'second'] as TrackId[]).map((tb) => (
        <button
          key={tb}
          onClick={() => setZoneTrack(tb)}
          className={`rounded px-2 py-0.5 text-[10px] font-semibold ring-1 ring-slate-200 transition-colors ${
            assignment[zoneId] === tb ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-200'
          }`}
        >
          {tb === 'main' ? 'Main' : 'Second'}
        </button>
      ))}
    </div>
  )
}

export default ZoneTrackToggle
```

This is a verbatim extraction of the button markup/logic currently inline in `ZonePanel.tsx` (its `setZoneTrack` function and the button pair in the `hasSecond &&` block) — no new behavior.

- [ ] **Step 2: Use it in `ZonePanel.tsx`**

In `src/renderer/src/ZonePanel.tsx`:

Add the import (near the other local imports):
```ts
import ZoneTrackToggle from './ZoneTrackToggle'
```

Delete the now-redundant `setZoneTrack` function (lines 76-86 in the current file — the one that takes `zoneId, track` and calls `zoneTrackAssignmentSet`). It's superseded by `ZoneTrackToggle`'s own internal `setZoneTrack`.

Replace the inline track-assignment block:

```tsx
              {/* Track assignment — only shown once the service has a Second track */}
              {hasSecond && (
                <div className="mb-1.5 flex gap-1">
                  {(['main', 'second'] as TrackId[]).map((tb) => (
                    <button
                      key={tb}
                      onClick={() => setZoneTrack(zoneId, tb)}
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold ring-1 ring-slate-200 transition-colors ${
                        trackAssignment[zoneId] === tb ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {tb === 'main' ? 'Main' : 'Second'}
                    </button>
                  ))}
                </div>
              )}
```

with:

```tsx
              {/* Track assignment — only shown once the service has a Second track */}
              {hasSecond && activeService && (
                <div className="mb-1.5">
                  <ZoneTrackToggle serviceId={activeService.id} zoneId={zoneId} assignment={trackAssignment} onChanged={setTrackAssignment} />
                </div>
              )}
```

Everything else in `ZonePanel.tsx` (the `trackAssignment` state, its fetch-on-mount effect, its poll effect, `hasSecond`, the rest of the zone row markup) stays completely unchanged — this task only touches the one inline block and removes the now-dead `setZoneTrack` function.

- [ ] **Step 3: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean (zero errors). If `TrackId` is now an unused import in `ZonePanel.tsx` (it's still used elsewhere — `assignment[zoneId] === tb` comparisons and the `useState<ZoneTrackAssignment>` line don't need it directly, but check), remove it only if genuinely unused; leave it if still referenced.

- [ ] **Step 4: Manual sanity check**

Run: `cd C:\Dev\worshipflow && npm run dev`. Build a service with a Second-track item. Open the Live tab, confirm the Zone panel's Main/Second buttons for each zone look and behave exactly as before (click one, confirm it highlights and persists — reload the page/service and confirm it stuck).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/ZoneTrackToggle.tsx src/renderer/src/ZonePanel.tsx
git commit -m "refactor: extract ZoneTrackToggle out of ZonePanel for reuse in Build Service"
```

---

### Task 2: Create `ZoneTrackStripBadge`

**Files:**
- Create: `src/renderer/src/ZoneTrackStripBadge.tsx`

- [ ] **Step 1: Create the strip badge**

Create `src/renderer/src/ZoneTrackStripBadge.tsx`:

```tsx
import type { ZoneId, TrackId } from '../../shared/types'
import { ZONE_NAMES } from '../../shared/types'
import type { ZoneTrackAssignment } from '../../shared/zoneTrack'

const CELL_COLOR: Record<TrackId, string> = {
  main: 'bg-blue-600',
  second: 'bg-purple-500',
}

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

// Tiny truthful visual of a ZoneTrackAssignment — same 4-cell shape as the
// existing ZoneStripBadge (Z1 Z2 back screens, Z3 lyrics TVs, narrow Z4 stage),
// but colored by which TRACK each zone follows rather than by content mode.
export default function ZoneTrackStripBadge({ assignment }: { assignment: ZoneTrackAssignment }): JSX.Element {
  const title = ZONE_IDS.map((z) => `${ZONE_NAMES[z]}: ${assignment[z] === 'main' ? 'Main' : 'Second'}`).join(' · ')
  return (
    <span className="inline-flex items-center gap-[2px] align-middle" title={title}>
      <span className={`h-[10px] w-[15px] rounded-[2px] ${CELL_COLOR[assignment[1]]}`} />
      <span className={`h-[10px] w-[15px] rounded-[2px] ${CELL_COLOR[assignment[2]]}`} />
      <span className={`h-[10px] w-[15px] rounded-[2px] ${CELL_COLOR[assignment[3]]}`} />
      <span className={`h-[10px] w-[9px] rounded-[2px] ${CELL_COLOR[assignment[4]]}`} />
    </span>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean. This is a new, standalone, currently-unused file — it should compile with no errors and not affect any other file yet (Task 3 wires it in).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/ZoneTrackStripBadge.tsx
git commit -m "feat: add ZoneTrackStripBadge, a 4-cell visual for per-zone track assignment"
```

---

### Task 3: Wire the strip + popover into `ServiceDeck.tsx`

**Files:**
- Modify: `src/renderer/src/ServiceDeck.tsx`

- [ ] **Step 1: Add imports, state, and effects**

In `src/renderer/src/ServiceDeck.tsx`, change the React import line (currently `import { useEffect, useState } from 'react'`) to:

```ts
import { useEffect, useRef, useState } from 'react'
```

Change the type import line (currently `import type { ServiceFull, ServiceItem, SongSummary, AnnouncementSummary, TrackId } from '../../shared/types'`) to:

```ts
import type { ServiceFull, ServiceItem, SongSummary, AnnouncementSummary, TrackId, ZoneId } from '../../shared/types'
import { ZONE_NAMES, DEFAULT_ZONE_TRACK } from '../../shared/types'
```

Add two more imports, near the existing `import ZoneStripBadge from './ZoneStripBadge'` line:

```ts
import type { ZoneTrackAssignment } from '../../shared/zoneTrack'
import ZoneTrackStripBadge from './ZoneTrackStripBadge'
import ZoneTrackToggle from './ZoneTrackToggle'
```

Add a module-level constant right after the existing `ADD_TYPES` constant:

```ts
const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]
```

Inside the `ServiceDeck` function body, add new state and effects right after the existing `const hasSecond = service.items.some((it) => it.track === 'second')` line:

```ts
  const [trackAssignment, setTrackAssignment] = useState<ZoneTrackAssignment>(DEFAULT_ZONE_TRACK)
  const [showZonePopover, setShowZonePopover] = useState(false)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void window.wf.zoneTrackAssignmentGet(service.id).then(setTrackAssignment)
  }, [service.id])

  useEffect(() => {
    if (!showZonePopover) return
    const onClickOutside = (e: MouseEvent): void => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setShowZonePopover(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [showZonePopover])
```

- [ ] **Step 2: Add the strip badge + popover next to the tabs**

Replace the existing track-tabs block:

```tsx
      {/* Track tabs — Second only appears once the service actually has second-track items,
          or once you're currently viewing it (so you can still see/empty it). */}
      {(hasSecond || track === 'second') && (
        <div className="mb-2 flex gap-1 rounded-lg bg-slate-100 p-1">
          {(['main', 'second'] as TrackId[]).map((tb) => (
            <button
              key={tb}
              onClick={() => onTrackChange(tb)}
              className={`flex-1 rounded-md py-1 text-xs font-semibold transition-colors ${
                track === tb ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tb === 'main' ? 'Main' : 'Second'}
            </button>
          ))}
        </div>
      )}
```

with:

```tsx
      {/* Track tabs — Second only appears once the service actually has second-track items,
          or once you're currently viewing it (so you can still see/empty it). The zone-
          assignment strip only appears once there's a Second track to distinguish from Main. */}
      {(hasSecond || track === 'second') && (
        <div className="mb-2 flex items-center gap-2">
          <div className="flex flex-1 gap-1 rounded-lg bg-slate-100 p-1">
            {(['main', 'second'] as TrackId[]).map((tb) => (
              <button
                key={tb}
                onClick={() => onTrackChange(tb)}
                className={`flex-1 rounded-md py-1 text-xs font-semibold transition-colors ${
                  track === tb ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tb === 'main' ? 'Main' : 'Second'}
              </button>
            ))}
          </div>
          {hasSecond && (
            <div ref={popoverRef} className="relative shrink-0">
              <button
                onClick={() => setShowZonePopover((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 hover:bg-slate-50"
                title="Which screens Main and Second feed"
              >
                <ZoneTrackStripBadge assignment={trackAssignment} />
              </button>
              {showZonePopover && (
                <div className="absolute right-0 top-full z-10 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                  <div className="mb-2 text-xs font-semibold text-slate-600">Screens</div>
                  <div className="space-y-1.5">
                    {ZONE_IDS.map((zoneId) => (
                      <div key={zoneId} className="flex items-center justify-between">
                        <span className="text-xs text-slate-700">{ZONE_NAMES[zoneId]}</span>
                        <ZoneTrackToggle serviceId={service.id} zoneId={zoneId} assignment={trackAssignment} onChanged={setTrackAssignment} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 3: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean, zero errors.

- [ ] **Step 4: Run the full test suite**

Run: `cd C:\Dev\worshipflow && npm test`
Expected: all existing tests still pass (this task adds no new tests — pure UI wiring per the established convention — but must not regress anything).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/ServiceDeck.tsx
git commit -m "feat: Build Service shows a zone-assignment strip + popover next to the track tabs"
```

---

### Task 4: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm the badge is absent for a Main-only service**

Run `npm run dev`. Open a service with no second-track items. Confirm: no track tabs, no zone-assignment badge (matches today's behavior exactly).

- [ ] **Step 2: Confirm the badge appears and reflects reality for a dual-track service**

Add a second-track item (or open an existing dual-track service). Confirm the tab strip and the small 4-cell zone badge both appear next to each other. Hover the badge — confirm the tooltip lists all 4 zones and their current track.

- [ ] **Step 3: Confirm the popover opens, edits, and persists**

Click the badge. Confirm a popover opens listing all 4 zones with Main/Second buttons matching the current assignment. Click a different track for one zone. Confirm: the button highlight updates immediately, the strip badge's color updates for that cell, and the change persists (switch to the Live tab's Zone panel and confirm it shows the same new assignment on its next poll — within ~2 seconds).

- [ ] **Step 4: Confirm outside-click closes the popover**

With the popover open, click anywhere outside it (e.g. the item list). Confirm it closes without changing anything.

- [ ] **Step 5: Confirm the Live tab's Zone panel is unaffected**

Open the Live tab. Confirm the Zone panel's per-zone Main/Second buttons still look and behave exactly as before this change (same position within each zone's card, same styling, same dual-instance-sync behavior from the earlier fix).

- [ ] **Step 6: Final commit (if any fixes were needed)**

If Steps 1-5 required any fixes, stage and commit them now with a message describing what was fixed. If no fixes were needed, confirm the commit sequence with `git log --oneline -6` and report completion.
