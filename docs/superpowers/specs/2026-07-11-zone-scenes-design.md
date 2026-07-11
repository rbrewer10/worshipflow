# Zone Scenes in Build Service — Design

Date: 2026-07-11
Status: Approved (design), pending implementation plan

## Problem

Which screens a slide drives (its `zoneRouting`) is invisible and near-uneditable while building a service: it's only editable in Live Control's ZonePanel, only for the item that is currently LIVE, via 4 raw dropdowns × 8 modes (4,096 combinations). Volunteers can't tell, while building, which zones a slide will hit or what the other screens will do.

## Solution overview (approved)

**Scene chips with room-diagram artwork, an editable scene palette, and an Advanced escape hatch.**

- A **scene** is a named placement rule: for each of Z1 (Back Left), Z2 (Back Right), Z3 (Lyrics TVs), a **role** — `content` | `logo` | `black`. **Z4 (Stage) is always `stage`** in every scene; only Advanced can change it per-item.
- The `content` role expands to the item type's natural mode (song→`lyrics`; scripture/text/ticker/announcement→`text`; countdown/welcome→`countdown`; image→`image`) — the same mapping already implicit in `ZONE_ROUTING_DEFAULTS`.
- Tapping a chip **stamps** the expanded `ZoneRouting` onto the item via the existing `zoneSetRouting` (snapshot semantics). Editing a scene later changes what future taps do — it never rewires already-built services.
- The palette is **user-editable**: rename, retask screens (tap-cycle the mini room diagram: Content → Logo → Black), delete, add, reset to the starter five, and set a per-item-type default scene.

## Starter scenes (seeded, all editable)

| Scene | Z1 | Z2 | Z3 | Z4 |
|---|---|---|---|---|
| Lyrics TVs only *(default: song)* | logo | logo | content | stage |
| Everywhere *(default: scripture, text, ticker, announcement)* | content | content | content | stage |
| Back screens only | content | content | logo | stage |
| Focus | black | black | content | stage |
| All logo | logo | logo | logo | stage |

Countdown/welcome and image types default to their existing `ZONE_ROUTING_DEFAULTS` (which match "Everywhere" semantics with their own content modes).

A **Custom** chip appears automatically (never pickable) when an item's effective routing matches no scene expansion — e.g. after an Advanced hand-tune. The truthful per-zone strip badge is always shown regardless.

## Data model

**No schema migration. No change to `service_item`.** Items keep storing full `ZoneRouting` JSON in `zone_routing` (null = defaults), exactly as today.

Scenes live in the existing `setting` key/value table under one key, `zone_scenes`:

```jsonc
{
  "scenes": [
    { "id": "lyrics-tvs-only", "name": "Lyrics TVs only", "zones": { "1": "logo", "2": "logo", "3": "content" } },
    // ... user-editable list
  ],
  "typeDefaults": { "song": "lyrics-tvs-only", "scripture": "everywhere" /* … */ }
}
```

- Missing/unset key → starter five + built-in type defaults (seed lazily on first read; "Reset to starter five" rewrites it).
- `typeDefaults` maps `ServiceItemType → sceneId`. Resolution for an item with `zone_routing = null`: settings `typeDefaults[type]` expanded for that type, falling back to the hardcoded `ZONE_ROUTING_DEFAULTS[type]` if the key/scene is missing.
- **Explicit semantics:** items with a stamped routing never change when scenes or defaults are edited. Items still on *default* (null routing) follow the current default — that is what "default" means; changing a type default is an explicit admin action in the scene editor.

## Shared logic — `src/shared/zoneScenes.ts` (pure, unit-tested)

- Types: `ZoneRole = 'content' | 'logo' | 'black'`, `SceneDef { id, name, zones: Record<1|2|3, ZoneRole> }`, `SceneConfig { scenes: SceneDef[], typeDefaults: Partial<Record<ServiceItemType, string>> }`.
- `STARTER_SCENES`, `STARTER_TYPE_DEFAULTS` constants.
- `contentModeFor(type: ServiceItemType): ZoneMode` — the natural content mode per type.
- `expandScene(scene: SceneDef, type: ServiceItemType): ZoneRouting` — roles → modes; Z4 = `stage`.
- `effectiveRouting(item, config): ZoneRouting` — stored routing ?? expanded typeDefault ?? `ZONE_ROUTING_DEFAULTS[type]`.
- `matchScene(routing: ZoneRouting, type, config): string | 'custom'` — reverse-match; MUST normalize so null-routing and an explicitly-stamped default match the same chip (no phantom "Custom").

## Main process / IPC

- `getSceneConfig()` / `setSceneConfig(config)` in `db.ts` over the `setting` table (JSON parse/stringify, seed-on-missing).
- IPC `wf:scenes:get` / `wf:scenes:set`, preload `scenesGet()` / `scenesSet(config)`.
- `computeZoneStates()` default-resolution changes from `ZONE_ROUTING_DEFAULTS[item.type]` to `effectiveRouting(item, sceneConfig)` (shared helper), preserving override precedence (manual zone overrides > item routing > defaults).
- Everything else (zoneSetRouting, broadcast, zone pages, tablet) unchanged.

## UI components

1. **`ZoneStripBadge.tsx`** — the tiny 4-cell strip (Z1 Z2 Z3 + narrow Z4 cell); color per role/mode (emerald=content, light=logo, dark=black, slate=stage, hatched=off). Used in the deck rows, chips, and scene editor.
2. **`SceneChips.tsx`** — chip row: each chip = strip + name, emerald ring on the matched scene, "(default)" tag when the item has null routing, automatic Custom chip. Tap → `zoneSetRouting(itemId, expandScene(...))`. Props: item, sceneConfig, onChanged. Includes "✎ Edit scenes" and "Advanced ▾" affordances.
3. **`ZoneRoutingGrid.tsx`** — the existing 4-dropdown grid extracted from `ZonePanel.tsx` into a shared component (used under Advanced in both places).
4. **`SceneEditorModal.tsx`** — scene list: name input, tap-cycle mini room diagram (Content → Logo → Black per zone), delete (✕), "+ Add scene", "Reset to starter five", per-type default assignment, Done. Writes via `scenesSet`.
5. **`ItemEditor.tsx`** — new **SCREENS** section (SceneChips + collapsed Advanced) placed above the Background section.
6. **`ServiceDeck.tsx`** — each row's subtitle gains the `ZoneStripBadge` + matched scene name (or "Custom").
7. **`ZonePanel.tsx`** (Live Control) — same `SceneChips` row above the existing live zone rows; raw grid moves under the same Advanced disclosure. Live `zoneSetOverride` behavior untouched; overridden zones get an amber "MANUAL" pill.

## Deleting a scene

Items stamped from a deleted scene keep their routing (snapshot) and simply match as Custom afterwards. If a deleted scene was a type default, that type's default reverts to the built-in `ZONE_ROUTING_DEFAULTS`.

## Error handling

- Corrupt/unparseable `zone_scenes` setting → log, treat as missing (starter five). Never crash `computeZoneStates`.
- Scene with missing zone keys → treat absent zones as `logo` (safe filler).
- `scenesSet` validates: non-empty scene list, unique ids, names trimmed non-empty; reject otherwise.

## Testing

- **Unit (vitest)**: `expandScene` per item type; `effectiveRouting` precedence (stored > typeDefault > builtin); `matchScene` normalization (null vs stamped-default → same chip; hand-tune → custom); config parse/seed/validate round-trip.
- **Manual**: chips render + stamp correctly in Build Service; deck badges truthful incl. Custom; scene editor rename/retask/add/delete/reset; type-default change affects only null-routing items; Live Control chips + Advanced parity; zones react correctly when items go live.

## Non-goals

- No new DB table; no per-service scene overrides; no scene import/export; no multi-venue profiles; no changes to zone page rendering (`zoneHtml.ts`) or the tablet remote.

## Success criteria

- While building a service, every item visibly shows which screens it will drive (strip badge + scene name) with zero clicks.
- Changing where a slide goes is one tap for the common cases; Advanced retains full per-zone control including Z4.
- The church can rename/retask/add/delete scenes and set per-type defaults without a developer.
- Existing services and the live-override system behave exactly as before until someone taps a chip.
