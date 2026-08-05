# Looks (saved zone-pin presets) + Safety Reset — design

**Date:** 2026-08-05
**App:** WorshipFlow Pro (Electron + React)
**Status:** Design approved, ready for implementation plan

## Context

ProPresenter's "Looks" let an operator save a full multi-screen configuration and recall it in one or two clicks, instead of reconfiguring each screen separately live. Community-documented "macro" patterns include a "safety reset" — one button that returns the whole show to a neutral state when a cue misfires, directly targeting the worst live-failure mode (wrong content stuck on screen).

WorshipFlow's actual architecture is different from ProPresenter's generic per-screen-layer model: it has 4 fixed zones (Back Left, Back Right, Lyrics TVs, Stage Monitors), and **zone pins already exist** as the top of a precedence chain (`computeZoneStates()`, `src/main/index.ts`): pin > authored deck > per-item zone routing > idle default. A pin (`ZonePin`, `src/shared/zonePins.ts`) forces one zone to hold a specific item's title card, or a fixed mode (logo/black/live-text), regardless of what's actually live — this already IS "override this zone right now," it just only works one zone at a time today, via `ZonePinPicker.tsx` on the Setup screen (`wf:zone:setPin`).

There is no existing concept of snapshotting a whole 4-zone combination, and no existing "clear everything" action beyond narrower tools (`wf:zone:clearPins` clears pins only; ending a service resets pins/tracks but leaves live track mode, stage messages, and more untouched).

## Decisions locked with the user

- **Two concrete features, not a general macro system**: "Looks" (saved 4-zone pin presets) and "Safety Reset" (one hardcoded action). A fully generic action-sequence/macro builder (arbitrary triggers, hotkeys, external control) is explicitly out of scope — a separate, larger feature if wanted later.
- **A Look is a snapshot of zone pins only** — not zone→track assignment, not the scene palette. Keeps the feature additive on top of the existing precedence chain with zero new rules.
- **Safety Reset is screens-only**: pins all 4 zones to the church logo, unconditionally. Does not touch Sound Check, Room Feed, track assignment, or anything audio-related — consistent with Sound Check being explicitly deferred elsewhere this session.
- **Safety Reset targets Logo on all 4 zones**, including Stage Monitors — one simple, always-correct rule, not a special case per zone.
- **Looks are created by "save current pins,"** not a dedicated builder screen: pin the 4 zones the way you want using the picker that already exists, then save that exact combination with a name. No new zone-configuration UI.
- **Looks are recalled from the Live tab** (not Setup) — this is meant for in-the-moment use, matching the whole point of a one-click preset.

## Design

### 1. Architecture

A `Look` (`{ id: string, name: string, pins: Record<ZoneId, ZonePin | null> }`) is a full snapshot of all 4 zones' pin state at save time — `null` for a zone means "was unpinned (following the service) when saved," and applying the Look later explicitly clears that zone's pin too, not just leaves it alone. This gives predictable "what you saved is what you get back" recall semantics, rather than a Look only ever affecting zones that happened to be pinned.

Looks are stored the same way the existing scene palette is (`zone_scenes` setting) — one JSON-serialized list under a new `setting` key (`zone_looks`), via `getSetting`/`setSetting`. No new database table. A new pure module, `src/shared/zoneLooks.ts`, mirrors `zoneScenes.ts`'s shape: `parseLooksConfig(json: string | null): Look[]` (never throws, defaults to `[]`) and `validateLook`/`validateLooksConfig` for the same never-trust-stored-JSON discipline already used for scenes and zone-track-assignment.

Applying a Look reuses the exact validation `wf:zone:setPin` already has (`assertZoneId`, `validateZonePins`) per zone, looping all 4 zones and calling the same `zonePins.set()`/`.delete()` primitives — but as one batched operation ending in a single `broadcast()`, not 4 separate ones (avoiding a visible per-zone flicker). Safety Reset is its own small, separate, hardcoded handler (not a disguised/special Look) that unconditionally sets all 4 zones to `{ kind: 'mode', mode: 'logo' }` — kept independent specifically so it can never be accidentally edited, renamed, or deleted the way a user-created Look can.

### 2. Component structure

**Setup screen** (near the existing `ZoneLiveGrid.tsx`/`ZonePanel.tsx`): a "Save current as a Look" action, prompting for a name, that reads the current in-memory `zonePins` and persists it as a new `Look`. Reuses the zone screen operators already know.

**Live tab**: a new panel listing saved Looks as one-click buttons (with a way to delete one), sitting alongside the existing read-only `LiveZoneStatus`. A visually distinct, always-present Safety Reset button — not part of the Looks list, not deletable, always available regardless of whether any Looks have been saved yet.

### 3. Error handling

- A stored Look referencing an invalid/stale pin (e.g. a "hold this item" pin whose item was later deleted) — applying it falls back to unpinning just that one zone rather than failing the whole recall, matching how the rest of this precedence chain already degrades gracefully on missing data (e.g. a missing pinned item already falls back to `'logo'` today).
- Saving a Look with an empty/duplicate name — reuses whatever simple validation convention this codebase already uses for naming things (services, scenes).

### 4. Testing

`zoneLooks.ts`'s parse/validate functions are pure and unit-testable the same way `zoneScenes.ts`/`zoneTrack.ts` already are. The IPC handlers and UI are exercised manually, matching this codebase's existing posture toward Electron-glue code and zone-related UI.

## Non-goals

- A general-purpose macro/action-sequence builder (arbitrary triggers, hotkeys, slide-attached actions, external control surfaces like Stream Deck/Companion).
- Looks affecting zone→track assignment or the scene palette.
- Safety Reset touching Sound Check, Room Feed, or any audio state.
- Per-zone customization of what Safety Reset targets (it's always Logo, on all 4 zones).

## Success criteria

An operator can set the 4 zones up for a specific moment (e.g. an announcement, a special segment) once, save it as a named Look, and recall that exact combination in one click from the Live tab for as long as it's useful. A single, always-available Safety Reset button returns all 4 zones to the church logo in one click, independent of whatever else is live, with no effect on audio.
