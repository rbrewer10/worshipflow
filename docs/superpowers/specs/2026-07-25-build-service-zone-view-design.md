# Build Service 4-Zone Screen View — Design

**Date:** 2026-07-25
**Status:** Approved, pending implementation plan
**Phase 1 of 2.** Phase 2 is `2026-07-25-multi-zone-slide-composer-design.md`,
which adds authored per-slide, per-zone content decks for sermon and text items
and reuses the `ZoneScreenCard` this phase builds.

## Goal

Replace the single slide preview in Build Service with a 2×2 grid of the four
physical zone screens, so the operator sets what each screen shows for an item
by looking at the screens themselves rather than at abstract preset chips.

## Background — the problem this solves

Zone routing is stored per service item in `service_item.zone_routing`, a JSON
`Record<ZoneId, ZoneMode>`. Today it is edited through `SceneChips.tsx` in the
right-hand item editor: five small preset chips (Lyrics TVs only, Everywhere,
Back screens only, Focus, All logo) plus an Advanced disclosure with raw
per-zone mode dropdowns.

Two things go wrong with that:

1. **The setting is invisible at a glance.** The chips show a 15px four-cell
   badge; you cannot tell from it what any given TV will actually display.
2. **It silently overrides zone-track assignment.** A zone reassigned to the
   Second track still had its content filtered by the live item's own preset.
   Assigning Lyrics TVs to Second appeared to do nothing whenever the live
   Second item happened to be set to "Back screens only". This was diagnosed
   and worked around on 2026-07-25 in commit `3ea15e0`; see "Retiring the
   track override" below.

The operator reports not using the Screens chips at all, working instead from
the zone-track badge beside the Main/Second tabs.

## What changes

Selecting an item in Build Service shows four zone cards in a 2×2 grid where
the single `ServiceSlidePreview` is today. Each card renders what that screen
will actually display for this item — the real background image, the real text,
the real church logo from `window.wf.logoGet()`.

Above the grid sits the same preset row, moved out of the right-hand editor.
(The Live tab's own copy in `ZonePanel` is unaffected and stays.) One click
sets all screens; then a **Content**, **Logo**, or **Black** chip is dragged
onto a single card to override that one screen. Clicking a card
cycles the same three roles, so drag is not the only route. An **Advanced**
disclosure below the grid keeps the raw per-zone mode dropdowns
(`ZoneRoutingGrid`) for modes with no role equivalent: Off, Image, Stage.

With no item selected the grid shows the existing empty state ("Select an item
to preview & style it").

The zone-track badge beside the Main/Second tabs is unchanged and stays where
it is.

## Architecture

New folder `src/renderer/src/zones/`:

| File | Responsibility |
|---|---|
| `ZoneScreenGrid.tsx` | Owns routing state for the selected item. Renders `ScenePresetRow`, the 2×2 grid, and the Advanced disclosure. Persists via `window.wf.zoneSetRouting`. |
| `ZoneScreenCard.tsx` | One screen: zone name, live preview, drop target, click-to-cycle. Stateless — takes a mode and an `onRoleChange` callback. |
| `ZoneRolePalette.tsx` | The three draggable role chips. Stateless. |

Modified:

- `src/shared/zoneScenes.ts` — add pure `roleForMode()`.
- `src/renderer/src/ScenePresetRow.tsx` (new) — the preset-chip row extracted
  out of `SceneChips.tsx`, so Build Service and the Live tab render one
  implementation. Takes the matched scene id and an `onPick(sceneId)` callback.
- `src/renderer/src/SceneChips.tsx` — consumes `ScenePresetRow` instead of
  rendering the chips inline. **The component itself stays**: `ZonePanel.tsx`
  mounts it in the Live tab, and that use is unchanged.
- `src/renderer/src/ItemEditor.tsx` — remove the `SceneChips` mount (line 183)
  and its import. The right-hand editor no longer carries a Screens section.
  `ItemEditor`'s own small `ServiceSlidePreview` (line 99, gated by
  `showPreview`) is left alone.
- `src/renderer/src/ServiceEditor.tsx` — swap the centre big preview
  (lines 177–197) for `ZoneScreenGrid`, keeping the existing
  "Select an item to preview & style it" empty state.
- `src/main/index.ts` — revert the track override (below).

`ServiceSlidePreview.tsx` is reused unchanged for Content cards.

### `roleForMode`

The inverse of the role→mode mapping already inside `expandScene`, so a stored
routing can be displayed as roles:

```ts
export function roleForMode(mode: ZoneMode): ZoneRole | null {
  if (mode === 'logo') return 'logo'
  if (mode === 'black') return 'black'
  if (mode === 'lyrics' || mode === 'text' || mode === 'countdown' || mode === 'image') return 'content'
  return null // 'off' and 'stage' have no role equivalent
}
```

A card whose mode maps to `null` renders that mode truthfully (labelled "Off" or
"Stage") and is not role-editable; Advanced remains the way to change it. This
matches `ZoneRoutingGrid`'s existing rule that only zone 4 may be set to Stage.

Dragging a role onto a card writes `expandScene`'s role→mode result for the
selected item's type, so Content resolves to `contentModeFor(item.type)` —
`lyrics` for songs, `countdown` for countdown/welcome, `image` for images,
`text` for everything else.

## Data model

Unchanged. The grid reads and writes the same `service_item.zone_routing` JSON
through the existing `wf:zone:getRouting` / `wf:zone:setRouting` IPC handlers.
No migration, no new table, no new IPC surface.

## Retiring the track override

Commit `3ea15e0` made a zone reassigned away from its default track ignore the
live item's per-item routing entirely, showing that track's content directly.
That was a workaround for the invisibility described above. This grid solves
the same problem properly, and the override costs per-item control on exactly
the zones the operator reassigns most.

So it is reverted as part of this work, restoring one uniform rule:

> **Track assignment picks which item a screen follows. The grid picks what
> that screen shows.**

Concretely, in `computeZoneStates()` in `src/main/index.ts`:

- Remove the `isReassigned` / `autoMode` branch, restoring
  `const routedMode = override ?? (routing ? routing[zoneId] : idleDefault)`
  and `const mode = routedMode ?? 'off'`.
- Move `item` back to a `const` inside the `if (t.serviceItemId != null)` block.
- Remove `contentModeFor` from the `../shared/zoneScenes` import in
  `src/main/index.ts` — it becomes unused there. It stays exported from
  `zoneScenes.ts` for the renderer's use.

The `hasLiveContent` ad-hoc-content fix (commit `5137b66`) is unrelated and stays.

Every zone card is therefore editable, and all four behave identically.

## Edge cases

- **No item selected** — empty state, no grid.
- **Item with no routing stored** — `defaultRoutingFor(item.type, sceneConfig)`
  supplies the display, exactly as `SceneChips` does today. Dragging any role
  stamps a full explicit routing onto the item, as `SceneChips` already does.
- **Zone 4 (Stage Monitors)** — `roleForMode('stage')` is `null`, so the card is
  display-only. Reachable through Advanced.
- **Song items** — `ServiceSlidePreview` needs `songFull` for the background and
  first lines; `ServiceEditor` already loads it for the current preview and
  passes it down unchanged.
- **Missing church logo** — `logoGet()` returns `logoPath: null`; the Logo card
  renders the same grey-charcoal fallback the real zone screen uses.

## Testing

- `roleForMode()` is pure and gets vitest cases in the existing
  `src/shared/zoneScenes.test.ts`, including the `null` returns for `off` and
  `stage`, and a round-trip check that `roleForMode(expandScene(s, type)[z])`
  returns the role `s` declared for zone `z`.
- Reverting the override is covered by re-running the existing suite; no test
  asserted the override behaviour, since it was main-process wiring.
- UI components follow the codebase convention of manual verification — no
  renderer component tests exist today.

## Out of scope

- Per-slide, per-zone content authoring. Deferred to Phase 2, which adds a
  `service_item.zone_slides` deck for sermon and text items — see
  `2026-07-25-multi-zone-slide-composer-design.md`. It is out of scope here
  because this phase deliberately makes no data-model change.
- Independent per-zone slide cursors (Back Left on slide 3 while Lyrics TVs are
  on slide 7). The Main/Second track pair already covers the real use case.
- Dragging backgrounds or images onto a zone. The Backgrounds drawer already
  handles per-item backgrounds.
