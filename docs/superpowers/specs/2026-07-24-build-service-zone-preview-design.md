# Build Service Zone Assignment Preview — Design

Date: 2026-07-24
Status: Approved (design), pending implementation plan

## Problem

Which physical screens Main vs. Second feed is only visible/editable from the Live tab's Zone panel (`ZonePanel.tsx`). While building a service (`ServiceDeck.tsx`'s Main/Second tabs), there's no way to see — or change — which TVs each track will drive without leaving Build Service.

## Solution overview (approved)

**A small zone-strip badge next to the Main/Second tabs that opens a popover with the same per-zone Main/Second control already used in the Live tab.**

- Extract the per-zone Main/Second toggle UI currently inline in `ZonePanel.tsx` (the buttons + `zoneTrackAssignmentGet`/`Set` fetch/save logic) into a new shared component, `ZoneTrackAssignmentPanel.tsx`. `ZonePanel.tsx` uses it exactly as before — no behavior change there.
- `ServiceDeck.tsx` gets a `ZoneStripBadge`-style strip (reusing that existing per-zone-cell visual) next to the Main/Second tab strip, shown only when `hasSecond` (same gate as the tabs themselves).
- Clicking the strip opens a popover containing `ZoneTrackAssignmentPanel`; closes on outside-click.
- No new IPC, no new data model — both consumers read/write the same per-service `zone_track_assignment` (`wf:service:zoneTrackAssignment:get/:set`) that already exists.

## Data flow

Unchanged from today: `ZoneTrackAssignmentPanel` fetches `zoneTrackAssignmentGet(activeService.id)` on mount / service change, and calls `zoneTrackAssignmentSet(activeService.id, next)` on each button click — exactly the logic already in `ZonePanel.tsx`, just relocated into a component both `ZonePanel` and the new `ServiceDeck` popover mount.

The strip badge itself needs the current assignment too (to color its cells) — it fetches the same `zoneTrackAssignmentGet` independently (matching the existing pattern of each mounted consumer holding its own copy, e.g. `ZonePanel`'s dual-instance-with-poll approach) rather than lifting shared state into context, to keep this a small, self-contained addition.

## Component changes

- **New `src/renderer/src/ZoneTrackAssignmentPanel.tsx`** — the 4 zone rows + Main/Second buttons, extracted verbatim from `ZonePanel.tsx`. Props: `serviceId: number`, `assignment: ZoneTrackAssignment`, `onChanged: (next: ZoneTrackAssignment) => void` (so the caller can update its own local copy/badge without a full re-fetch).
- **`ZonePanel.tsx`** — replaces its inline zone-track buttons with `<ZoneTrackAssignmentPanel .../>`. No behavior change; this is a pure extraction.
- **New small strip badge in `ServiceDeck.tsx`** — sits next to the Main/Second tab strip, only when `hasSecond`. Click opens a popover (simple absolutely-positioned panel, closes on outside click — matches the existing "Add item" panel's show/hide pattern in the same file) containing `ZoneTrackAssignmentPanel`.

## Non-goals

- No change to `ZonePanel.tsx`'s layout, polling behavior, or the Live tab's existing dual-instance-sync fix (that fix lives in the polling `useEffect`, untouched by this extraction).
- No new backend/IPC — reuses `zoneTrackAssignmentGet`/`Set` exactly as-is.
- No visibility on the Main-only tab (only shown once `hasSecond`), matching the existing tab-strip and "Start a Second track" gating already in `ServiceDeck.tsx`.

## Testing

Manual: build a service with both tracks, open the strip popover from Build Service, reassign a zone, confirm it updates (compare against the Live tab's Zone panel showing the same new assignment on next poll). Confirm the strip is absent for a Main-only service. Confirm `ZonePanel.tsx`'s existing behavior (including the dual-instance sync fix) is unaffected by the extraction.

## Success criteria

- From Build Service, you can see at a glance which physical screens Main and Second each feed.
- You can reassign a zone's track from Build Service without switching to the Live tab.
- The Live tab's existing Zone panel behavior is unchanged.
