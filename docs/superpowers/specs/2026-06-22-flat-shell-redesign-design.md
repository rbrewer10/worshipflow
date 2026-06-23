# WorshipFlow — Flat Shell Redesign (Phase 1 of UI overhaul)

**Date:** 2026-06-22
**Status:** Approved design, ready for implementation plan
**Stage:** Phase 1 of 3 (inspired by the "WorshipTools Presenter" layout the user shared)

## Goal

Transform WorshipFlow's look and navigation into a flat, professional, Presenter-style
shell: a checkerboard-textured dark base, a clean top bar with centered tabs + status
icons, and a **persistent left service rail with a pinned live output preview** that stays
visible on every tab. Every existing feature keeps working; only the frame and styling
change. (The click-a-slide grid is Phase 2; reworking each tab's content is Phase 3.)

This is WorshipFlow's own clean adaptation of that layout — not a clone of any product.

## The shell layout

A fixed three-zone shell wraps the whole app (replaces today's top-nav + full-page-per-tab):

```
┌───────────────────────────────────────────────┐
│ TOP BAR: logo · WorshipFlow · [tabs] · status  │
├──────────┬────────────────────────────────────┤
│ SERVICE  │                                     │
│  RAIL    │         MAIN CONTENT (per tab)       │
│ (items)  │                                     │
│          │                                     │
│ ── ── ── │                                     │
│ OUTPUT   │                                     │
│ PREVIEW  │                                     │
└──────────┴────────────────────────────────────┘
```

## Flat theme + checkerboard background

- **Base background** (the app body, behind everything): a CSS checkerboard of black +
  dark-grey squares (no image file). Reference values: `background-color:#141414;
  background-image: linear-gradient(45deg,#0c0c0c 25%,transparent 25%,transparent 75%,#0c0c0c 75%),
  linear-gradient(45deg,#0c0c0c 25%,transparent 25%,transparent 75%,#0c0c0c 75%);
  background-size:22px 22px; background-position:0 0,11px 11px;` (final size/contrast tuned
  in implementation).
- **Surfaces sit solid on top** for readability: top bar `#141418`, panels `#1a1a1d`,
  cards `#1f1f24`, hairline borders `rgba(255,255,255,0.07–0.12)`.
- **Accents:** green `#22c55e` (brand + "live"/online), blue `#2563eb` (active output +
  selected item/slide).
- Replaces the purple gradient + glassmorphism in the operator chrome. The existing
  per-slide *projector* themes (Stage 1) are unaffected — this is the operator UI only.

## Top bar

- **Left:** logo mark + "WorshipFlow" wordmark.
- **Center:** tab group as a flat segmented control — `Live` (with a green dot) ·
  `Services` · `Songs` · `Scripture`. (Tab set stays as today's, renamed "Service"→
  "Services"; `Slides`/`Media` are not separate tabs in WorshipFlow and are out of scope.)
- **Right:** an **output status** indicator (green when ≥1 output is live, grey otherwise,
  reusing `AppInfo.outputs`) and a **settings** affordance (opens the existing controls —
  Stage Display button + operator theme; a light dropdown is fine).

## Persistent left service rail

- **Header:** active service name + date + a `⋮` menu (rename/close — minimal for Phase 1).
- **Item list:** each item of the active service as a row: a small `SlideThumb`
  (the Stage-2 thumbnail, reused) + title + type icon; the live item highlighted.
  Clicking a row **sends that item live** (reuses `sendItemLive` from `liveActions.ts`).
- **Empty state:** "No service loaded — pick one in Services."

## Pinned output preview

- At the bottom of the rail: an **`OutputPreview`** — a small 16:9 live render of the
  projector. It subscribes to `window.wf.onState` and renders the current slide using the
  live theme (reuse `getTheme`/`resolveColors`/`staticBackgroundCss` + the current `line`),
  i.e. a miniature of `Output`. Label "Main Audience Output" above it.
- Below it: quick controls — **Black**, **Logo**, **Clear/Lyrics** (reuse
  `window.wf.sendIntent`).

## App-level active-service state (the one real refactor)

Today `LiveView` and `ServiceBuilder` each load + select services independently. Phase 1
lifts "the loaded service" to the shell so the rail/preview are consistent everywhere:

- Introduce a small **`ServiceContext`** (React context) provided by the shell:
  `{ activeServiceId, activeService, selectService(id), reloadActiveService() }`.
- `selectService(id)` sets state, calls `window.wf.setActiveService(id)`, and loads
  `serviceGet(id)` into `activeService`.
- The **Service rail** and **`LiveView`** consume the context instead of holding their own
  service selection. The **Services tab** (current `ServiceBuilder`) sets the active service
  via the context when one is opened. `reloadActiveService()` is called after edits so the
  rail/preview refresh.
- `ServiceBuilder` keeps its deck/edit internals; it just reads/writes the shared active
  service rather than a local `openId`/`service` pair.

## Components / files

- **New:** `src/renderer/src/AppShell.tsx` — the three-zone shell (top bar + rail + main),
  hosts `ServiceContext` and the tab/view state. Fully replaces `Operator.tsx`.
- **New:** `src/renderer/src/ServiceContext.tsx` — the context + provider hook.
- **New:** `src/renderer/src/TopBar.tsx` — logo, centered tabs, status icons.
- **New:** `src/renderer/src/ServiceRail.tsx` — service item list (reuses `SlideThumb`).
- **New:** `src/renderer/src/OutputPreview.tsx` — miniature live projector render + controls.
- **Delete:** `src/renderer/src/Operator.tsx` — its tab/view logic moves into `AppShell`.
- **Modify:** `src/renderer/src/App.tsx` — render `<AppShell>` instead of `<Operator>`;
  default the operator look to flat.
- **Modify:** `src/renderer/src/assets/main.css` — checkerboard body background + flat
  surface tokens; flatten existing gradient/glass chrome rules.
- **Modify:** `LiveView.tsx`, `ServiceBuilder.tsx` — consume `ServiceContext` for the active
  service instead of independent selection; reskin panels flat.

## Scope

In scope (Phase 1):
- Flat theme + checkerboard background; flattened operator chrome.
- New top bar (centered tabs + output status + settings).
- Persistent left service rail (click item → go live) + pinned live output preview + Black/
  Logo/Clear controls.
- App-level active-service context.

Out of scope:
- The click-a-**slide** grid in the main area (per-slide thumbnails) → **Phase 2**.
- Reworking Services/Songs/Scripture main-area content into the new layouts → **Phase 3**
  (Phase 1 just reskins them flat in place).
- A `Media` or `Slides` tab.
- Section grouping of service items ("Music Set 1"/"Sermon") — later, optional.

## Testing / verification

- `npm run typecheck` clean; app boots; no console errors.
- Manual: the shell renders with checkerboard base + flat panels on every tab; the left rail
  shows the loaded service and stays put when switching tabs; clicking a rail item sends it
  live; the output preview mirrors the projector in real time; Black/Logo/Clear work.
- Regression: existing features still work (deck building, song editing, OBS, CCLI, tablet,
  PowerPoint import) — just restyled.

## Roadmap (context)

1. **Phase 1 (this spec)** — flat shell: theme + top bar + persistent rail + output preview.
2. **Phase 2** — the Live slide-grid (service items expand to clickable slide thumbnails).
3. **Phase 3** — rework Services / Songs / Scripture main areas into the new layouts.
