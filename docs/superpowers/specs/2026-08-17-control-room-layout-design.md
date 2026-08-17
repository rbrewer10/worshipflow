# Control Room Layout Redesign — Build Service + Live Control

## Overview

WorshipFlow Pro's dark "Control Room" *color* redesign is complete (all 7 planned stages, shipped on `feat/zone-decks`). This spec is the next step: a *layout/information-architecture* redesign of the two screens an operator actually runs a service from — Build Service and Live Control — based on two reference mockups Ryan shared and approved during brainstorming.

This is a bigger change than the color work: it restructures how panels are arranged and, for Live Control, changes the core interaction model from "click any slide in a grid" to "step through a run of show with CURRENT/NEXT/AFTER-NEXT always visible." The color palette itself does not change — everything here builds on the tokens (`bg-app`/`bg-panel`/`bg-panel-raised`, `text-content-*`, Snow Hill blue, champagne gold, narrow-role emerald) already established.

## Goals

- Build Service: tighten the existing layout (services list, run of show, contextual inspector) and promote the existing scene-preset system to a persistent, always-visible bottom bar.
- Live Control: replace the click-any-slide grid with a CURRENT/NEXT/AFTER-NEXT triptych, add an always-visible outputs strip for the 4 physical zones, and add a Service Controls panel for a small set of one-click service-wide actions.
- Consolidate today's 6-page Setup section behind a single gear icon, reframed as Settings — no changes to the Setup pages themselves.
- Preserve every piece of safety-critical logic already in place (tap-to-confirm, Stage Rehearsal auto-disarm, zone connectivity heartbeat) by reusing and relaying out existing components rather than rewriting them.

## Non-goals

- Home screen, Volunteer mode, and the Media/Library screens themselves (Song/Announcement/Scripture/Background libraries) — unchanged, out of scope.
- OBS/streaming controls — Ryan confirmed OBS runs on a separate stream computer; Live Control's "Livestream Check" is a read-only status glance, not a control surface. Setup's existing OBS Connect page is untouched.
- The Yamaha mixer integration — "All Mics Muted" ships as a visible, disabled control with an explanatory tooltip; real behavior is blocked on that integration being finished, which is separate, already-tracked work.
- Any change to the underlying zone-routing/scene data model beyond the one small addition described below (Service Control mode mapping).

## Architecture approach: reuse and relayout, not rebuild

Every panel in both screens maps to an existing component. The redesign is almost entirely about *where* things sit and *how prominent* they are, not new state or new IPC surface. The one exception (Service Control mode shortcuts) is called out explicitly below with its own small, additive data model change.

---

## 1. Top-level navigation

`TopBar.tsx`'s five buttons change from text-button rows to this:

| Today | Becomes |
|---|---|
| Home | Home (unchanged) |
| Live | **Live Control** |
| Build service | Build Service (unchanged) |
| Library | **Media/Library** |
| Setup | small **gear icon**, opens the same 6 existing Setup pages (Screens & Zones, Tablet Remote, OBS Connect, Diagnostics, Logo, Sound Check) — page content itself is untouched |

Volunteer mode's launch button is unchanged. `AppShell.tsx`'s view-switching logic doesn't need new view names — this is a rename + one text-button-to-icon-button conversion.

## 2. Build Service screen

**Left rail** — `ServiceBuilder.tsx`'s existing service list and `+ New Service` button, unchanged. `TemplatesPanel`, currently opened as a modal (`showTemplates` state), becomes a persistent section in the same rail instead — same component, same data, just always rendered instead of conditionally opened.

**Center — Run of Show** — `ServiceDeck.tsx`, mostly as today (numbered rows, reorder controls, click-to-select). Two additions:
- A small scene-tag pill per row, reading the same per-item routing `ZoneScreenGrid` already computes via `matchScene()` — no new state, just surfacing an existing computed value next to each row instead of only inside the inspector.
- A total-duration readout in the header. Best-effort: sums items with a known duration (countdown/welcome's `seconds`, any other item that stores an explicit duration). Items without one (most songs) don't contribute — the total is a helpful estimate, not a promise, and the UI should read as such (e.g. "~52 min" not a false-precision "52:00").

**Right — Inspector** — `CardEditPanel.tsx`, unchanged for the type-specific fields it already renders (Background, Font, Lyrics, Presenter Notes, etc.). One relocation: the Scene control currently lives nested inside `ZoneScreenGrid`'s Advanced view — pull it up to sit directly in the inspector, using the same `ScenePresetRow` component, so it and the bottom bar (below) always show and set the same value for the selected item.

**Bottom — Scene Selector bar** — the one new layout element on this screen, and it's a visibility promotion, not a new feature. Existing `ScenePresetRow`, rendered as an always-visible bar instead of nested inside the zone-routing sub-panel. Selecting a scene here does exactly what selecting one in `ZoneScreenGrid` does today (`pickScene` → `expandScene` → save) — same function, new location, always visible instead of one click away.

**Header** — service name/date (existing), a status pill computed from the same `PreflightLevel` checks `HomeView.tsx` already runs (reused, not reimplemented — "Ready to plan" when all checks are `ok`, otherwise a warn-colored label), a Preflight Check button relocated from Home, a Share Service button (existing, if not already present here), and the gear icon from §1.

## 3. Live Control screen

**Left — Run of Show** — `ServiceRail.tsx`'s item list becomes the *only* way to jump to an arbitrary item (per Ryan's decision to retire the click-any-slide grid). No logic changes: same tap-to-confirm safety behavior (`usePendingConfirm`), same live-item highlighting. Add a search icon that opens the existing `QuickSearchOverlay` (already built for Build Service, reused here rather than building a second search UI). `LiveZoneStatus` and `LooksPanel`, currently pinned below the item list in `ServiceRail`, move into the new right-hand panel (§ below) since the left rail's job narrows to "the run of show" specifically.

**Center — CURRENT / NEXT / AFTER NEXT** — replaces `SlideGrid.tsx`. Three panels of decreasing size and prominence, all reading from the same `LiveState` that `LiveTools.tsx` already consumes (`live.line`, `live.next`, `live.index`/`live.total` for the progress readout) — no new IPC. CURRENT is large, shows the live line with a progress bar and slide count. NEXT is clearly secondary but fully legible. AFTER NEXT is a small thumbnail-only preview one step further out; if the live state doesn't expose an "after next" value today, compute it client-side the same way `ServiceRail`'s `goNext` already looks ahead in the item list, rather than adding new main-process state. Advancing still calls the existing `send('next')` / `sendIntent` path.

**Right — Presenter Notes + pinned status + Service Controls** — Presenter Notes reuses the existing per-item field. `LiveZoneStatus` and `LooksPanel` relocate here from the left rail (§ above), unchanged. Below them, a **collapsible Service Controls drawer**:

- **Sermon Mode / Worship Mode / Invitation Mode** — one-click shortcuts that apply an existing zone-routing scene preset to whatever item is currently live, using the exact same `pickScene`/`expandScene`/save call `ZoneScreenGrid` already makes — just triggered for the live item instead of the item being edited. See "Service Control mode mapping" below for the one new (small) piece this needs.
- **All Mics Muted** — visible, disabled, tooltip explains it's waiting on the mixer integration. No backend call.
- **Livestream Check** — read-only, reuses the existing OBS-connected boolean already surfaced in `ObsPanel`'s status. Not a control; Setup's OBS Connect page remains the only place to actually manage OBS.
- **Quick Cues** (Applause / Amen / Bible / Thank You, or similar) — small new UI, no new backend: each button fires the existing text-overlay send path (`window.wf.liveLoadText('main', ...)`) with a fixed short phrase, exactly like the Volunteer/Build Service ticker mechanism already does for arbitrary text.
- **Timer** — small new UI over the existing countdown-load path (`window.wf.liveLoadCountdown`), rather than a second timer system.

**Bottom — Outputs strip + Scene Selector** — 4 tiles, one per physical zone, using their real existing names (Back Left, Back Right, Lyrics TVs, Stage Monitors — no relabeling, confirmed with Ryan). Each tile reuses `ZoneStatusBox` (already built with a `connected` prop from the Setup-stage work) laid out horizontally instead of the vertical stack it's used in today. Below the outputs, the same Scene Selector bar as Build Service (§2) — here it overrides the *live* item's routing rather than the item being edited, same underlying mechanism.

**Safety Reset** — the existing "clear everything" emergency control (already present somewhere in `LiveTools`/`StageRehearsalTools` per the codebase's prior safety work) relocates into this right-hand panel as the one deliberately loud, red, always-visible control — not buried in a menu.

### Service Control mode mapping (the one new, small data-model piece)

Scene presets are user-editable per church (`SceneConfig`, no fixed IDs — a church might not have anything named "Sermon" or "Focus"). So "Sermon Mode"/"Worship Mode"/"Invitation Mode" can't hardcode a scene ID. Add one small new setting, stored the same way `SceneConfig` itself is (a JSON blob via the existing settings mechanism):

```ts
interface ServiceControlModeMapping {
  sermon?: string    // sceneId
  worship?: string   // sceneId
  invitation?: string // sceneId
}
```

Default mapping on first run, referencing the *starter* scene IDs so it works out of the box for a church that hasn't customized anything: `sermon → 'focus'`, `worship → 'lyrics-tvs-only'`, `invitation → 'everywhere'`. If a mapped `sceneId` doesn't exist in the church's current `SceneConfig` (customized away, or deleted), that mode button disables itself with a tooltip rather than applying nothing silently or crashing — same defensive fallback philosophy `zoneScenes.ts` already uses for unknown scene IDs elsewhere. No settings UI is required for v1 — the mapping just needs to exist and be readable; editing it can reuse whatever simple key-value settings pattern the app already has for other JSON settings, as a fast-follow if Ryan wants it configurable sooner.

---

## Component mapping (existing → reused/relocated)

| New location | Existing component | Change |
|---|---|---|
| Build Service left rail, Templates section | `TemplatesPanel` | Modal → persistent section |
| Build Service center | `ServiceDeck` | + scene-tag pill, + duration header |
| Build Service right | `CardEditPanel` | Scene control relocated to top-level |
| Build Service bottom | `ScenePresetRow` | Nested → always-visible bar |
| Live Control left | `ServiceRail` (item list only) | Narrows scope; status panels move out |
| Live Control center | *(new triptych, replaces `SlideGrid`)* | Reads existing `LiveState` |
| Live Control right (status) | `LiveZoneStatus`, `LooksPanel` | Relocated from left rail, unchanged |
| Live Control right (drawer) | *(new Service Controls drawer)* | Thin UI over existing send/scene/countdown paths |
| Live Control bottom | `ZoneStatusBox` ×4 | Vertical → horizontal layout |
| Live Control bottom | `ScenePresetRow` | Same bar as Build Service, targets live item |
| Live Control right (danger) | existing Safety Reset control | Relocated, more prominent |

## Error handling / edge cases

- Duration total: items with no duration data are silently excluded, never block the total from rendering.
- AFTER NEXT: if there's no third item ahead (end of service, or next item can't go live), the panel shows an empty/"end of service" state rather than nothing or an error.
- Service Control mode buttons: disable (not hide) when their mapped scene ID doesn't resolve, so an operator always sees the three buttons in the same place and understands *why* one isn't working, rather than the drawer's layout shifting service to service.
- Outputs strip: reuses `ZoneStatusBox`'s existing disconnected-state treatment (red "Offline" pill) — no new states to design.
- Retiring `SlideGrid`: confirm nothing else imports it before deleting it (a quick grep during implementation) — it may be reachable from a code path this spec didn't examine.

## Testing approach

- Unit tests for the one new pure logic: computing the duration total (best-effort sum, skip unknowns) and resolving the Service Control mode mapping (including the disabled-when-unresolvable fallback).
- No new IPC surface to test beyond what Build Service/Live already exercise — the triptych, outputs strip, and Quick Cues/Timer are all thin UI over existing `window.wf.*` calls, so existing integration coverage for those calls continues to apply.
- Manual verification pass (same pattern as every stage of the color redesign): build, serve, click through both screens, confirm tap-to-confirm and Stage Rehearsal behavior are unchanged before/after.

## Implementation phasing

Two separate implementation passes, each following the same worktree → subagent-driven-development → review → merge process used for the color redesign:

1. **Build Service** — smaller delta, lower risk, ships first.
2. **Live Control** — the bigger paradigm shift (retiring `SlideGrid`, the new triptych, Service Controls drawer). Built and reviewed with extra care around the safety-critical logic being relocated, not rewritten.

Each phase gets its own implementation plan via `writing-plans` when its turn comes.
