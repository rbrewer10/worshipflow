# WorshipFlow — Slide-Deck Builder + Per-Item Design (Stage 2)

**Date:** 2026-06-22
**Status:** Approved design, ready for implementation plan
**Stage:** 2 of 3 (builds on Stage 1 themes — see `2026-06-22-worshipflow-themes-design.md`)

## Goal

Replace the form-based service builder with a visual, PowerPoint-style **deck**: one
card per service item, with live mini-previews, add-buttons, drag-to-reorder, and a
click-to-edit panel. Each card can keep the service theme or **override it** with its own
theme + colors. This makes building a service fast and visual while keeping WorshipFlow's
live song auto-splitting.

## Card model

The deck shows **one card per service item** (a song is one card; WorshipFlow still splits
its verses live). Cards render in service order.

Each card shows:
- A **mini-preview** (16:9) using the item's effective theme: the theme background
  (gradient/solid; motion shown as a static gradient swatch in the thumbnail to stay light)
  plus the item's title or first line, in the theme font/color.
- A small **type icon** and **title** (e.g. "🎵 Amazing grace · 6 slides").
- A **● LIVE** marker when it's the live item; a **notes** indicator if notes exist.

## Interactions

- **Add buttons** — a row above the deck: Song, Scripture, Text, Image, Countdown,
  Welcome, Ticker. Clicking creates a card of that type and opens its edit panel.
- **Click a card** — opens the **edit panel** (right side) for that item: its content
  fields (by type) + its design section. Re-clicking or a Close button collapses it.
- **Drag to reorder** — native HTML5 drag-and-drop (`draggable`, `onDragStart`/`onDragOver`/
  `onDrop`); dropping persists the new order. The existing up/down buttons are removed
  (drag replaces them).
- **Go live** — a ▶ control on the card (same behavior as today).
- **Delete** — a card action with the existing confirm dialog.

## Edit panel — content

The edit panel shows the fields for the card's type (these are today's add-form fields,
relocated):
- **song** — song picker / shows linked song
- **scripture** — reference input
- **text** — title + body
- **countdown** / **welcome** — minutes
- **ticker** — text
- **image** — file path (via existing picker)
- **notes** — the operator/pastor notes field (existing)

Editing writes back via existing item update paths (a new `wf:services:updateItem` for
content where needed; notes already have an IPC).

## Edit panel — per-item design

A design section in the edit panel:
- A **"Use service theme"** toggle (default ON). When ON, the item inherits the service
  theme from Stage 1.
- When OFF, the operator picks a **theme for just this item** plus its **colors** — the
  same swatch grid + color pickers as Stage 1's `ThemePicker`, reused in "item mode".

## Data model

- Add a `style` column (TEXT JSON, nullable) to the `service_item` table (migration in
  `db.ts`, same pattern as the existing `notes` column).
- Shape: `ItemStyle = { theme?: string; colors?: ThemeColors }`. `null`/absent = use the
  service theme.
- `ServiceItem` gains `style: ItemStyle | null`; `getService` reads/parses it.
- New DB functions:
  - `setServiceItemStyle(itemId, style: ItemStyle | null)` — persists the override.
  - `reorderServiceItems(serviceId, orderedIds: number[])` — rewrites `ordinal` to match
    the given order (single transaction).
- Content edits: add `setServiceItemPayload(itemId, payload)` so the edit panel can update
  an existing card's content. (`updateServiceItemNotes` already exists for notes.)

## Live rendering (per-item theme resolution)

Stage 1 set the live theme per **service**. Stage 2 resolves per **item**, falling back to
the service:

- Keep the service-level baseline: rename Stage 1's `liveSlideTheme`/`liveSlideThemeColors`
  conceptually to a **service baseline** pair (`serviceSlideTheme`/`serviceSlideThemeColors`,
  set in `wf:setActiveService`), plus the **effective** pair (`liveSlideTheme`/
  `liveSlideThemeColors`) that `renderState()` broadcasts.
- When the live **item id** is set (in `wf:live:setItemId` and in `handleTabletLoadItem`),
  look up the item in `activeServiceItems`; if it has `style.theme`, set the effective theme
  to the override (theme + `style.colors`); otherwise set effective = service baseline.
- Quick-loads with no item (item id null) use the service baseline.
- The projector (`Output.tsx`) is unchanged from Stage 1 — it already renders whatever
  `slideTheme`/`slideThemeColors` it receives.

## Components / files

- **New:** `src/renderer/src/ServiceDeck.tsx` — the deck (cards grid, add buttons,
  drag-reorder, selection).
- **New:** `src/renderer/src/CardEditPanel.tsx` — the edit panel (content fields by type +
  design section).
- **New:** `src/renderer/src/SlideThumb.tsx` — the 16:9 mini-preview used on cards.
- **Modify:** `src/renderer/src/ServiceBuilder.tsx` — host the deck + edit panel in place of
  the form list (keep the services sidebar, theme picker, import buttons, print).
- **Modify:** `src/renderer/src/ThemePicker.tsx` — extract its swatch grid + color pickers
  into a shared `ThemeChooser` sub-component, used by both the service `ThemePicker` and the
  item design section (the item section adds the "Use service theme" toggle around it).
- **Modify:** `src/main/db.ts`, `src/shared/types.ts`, `src/main/index.ts`,
  `src/preload/index.ts` — `style` column, `ItemStyle` type, new DB/IPC/preload functions,
  per-item theme resolution.

## Scope

In scope (Stage 2):
- Deck UI (cards + thumbnails) replacing the form list, with add-buttons, drag-reorder,
  click-to-edit content, delete, go-live.
- Per-item theme override (use-service-theme default).
- Per-item theme resolution in the projector.

Out of scope:
- Per-slide (per-verse) cards — items remain the unit (Stage 1/2 decision).
- "Design it for me" auto-pick → **Stage 3**.
- Animating motion previews inside card thumbnails (thumbnails use a static gradient
  representation; the live projector still animates).
- Theming the stage monitor / OBS overlay.

## Testing / verification

- `npm run typecheck` clean; app boots; `service_item.style` migration adds the column
  without breaking existing services.
- Manual: build a service from scratch using only the deck (add each type, edit content,
  drag to reorder, delete). Confirm cards preview correctly.
- Confirm per-item override: set one item to a different theme; load items live and confirm
  the projector uses the item's theme for that item and the service theme for the rest.
- Confirm existing features still work from the cards: go-live, notes, tablet, OBS,
  CCLI logging, PowerPoint import.

## Roadmap (context)

1. **Stage 1 (done)** — themes + fonts + motion, per service.
2. **Stage 2 (this spec)** — slide-deck builder + per-item design override.
3. **Stage 3** — "Design it for me" smart auto-pick.
