# Zone Pins + Sermon Backdrop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One concept for holding content on a screen — click a zone card, pin it (sermon title card / logo / black), it survives every Next until unpinned — plus a designed sermon backdrop that replaces the plain-text rendering behind the pastor.

**Architecture:** `zoneOverrides` (mode-only, in-memory) becomes `zonePins` (`Map<ZoneId, ZonePin>` where `ZonePin = {kind:'mode',mode} | {kind:'titleCard',itemId}`), resolved at the TOP of `computeZoneStates()` — pins beat decks, routing, and track assignment. A new `'sermon'` ZoneMode renders the designed backdrop in `zoneHtml.ts` (system fonts only — zone pages embed no webfonts); the sermon item type also defaults its back-screen routing to it, so the backdrop appears even without a pin. The Live tab's zone panel is rebuilt as four clickable live cards with a pin picker; the lying Auto/Black/Logo/Lyrics chips and the duplicated ZonePanel mount are deleted. Pins persist via the existing recovery.json snapshot and clear on service switch.

**Tech Stack:** Electron + electron-vite, React 18, TypeScript, Tailwind v3, sql.js, vitest.

**Design sources (2026-07-25):** three-agent design round — UX-vs-codebase design, sermon-backdrop visual design (preview at scratchpad `sermon-backdrop-preview.html`, verified by screenshot), and the five-control confusion audit. Key audit findings honoured here: overrides invisible + never cleared on service switch; "Manual" badge was fake local state; deck made Live-tab chips dead buttons; per-item Screens silently blanked assigned zones.

**Precedence after this plan (document as a comment in computeZoneStates):**

```
pin  >  deck (t.deckSlides)  >  per-item zone_routing  >  scene typeDefault  >  idleDefault
```

---

## Task PN-1: zonePins pure module (TDD)

**Files:**
- Create: `src/shared/zonePins.ts`
- Create: `src/shared/zonePins.test.ts`

- [ ] **Step 1: Failing tests** — mirror `zoneTrack.test.ts` conventions:

```ts
import { describe, it, expect } from 'vitest'
import { parseZonePins, validateZonePins, pinLabel } from './zonePins'
import type { ZonePin, ZonePins } from './zonePins'

const pins: ZonePins = { 1: { kind: 'titleCard', itemId: 42 }, 4: { kind: 'mode', mode: 'black' } }

describe('validateZonePins', () => {
  it('accepts a partial record with valid pins', () => expect(validateZonePins(pins)).toBe(true))
  it('rejects unknown kinds and bad modes', () => {
    expect(validateZonePins({ 1: { kind: 'nope' } })).toBe(false)
    expect(validateZonePins({ 1: { kind: 'mode', mode: 'stage' } })).toBe(false) // only logo|black|lyrics pinnable
    expect(validateZonePins({ 1: { kind: 'titleCard' } })).toBe(false) // itemId required
  })
  it('accepts empty object', () => expect(validateZonePins({})).toBe(true))
})

describe('parseZonePins', () => {
  it('null/garbage/invalid -> empty pins, never throws', () => {
    expect(parseZonePins(null)).toEqual({})
    expect(parseZonePins('{{nope')).toEqual({})
    expect(parseZonePins('[1,2]')).toEqual({})
  })
  it('round-trips', () => expect(parseZonePins(JSON.stringify(pins))).toEqual(pins))
})

describe('pinLabel', () => {
  const items = [{ id: 42, title: 'He’s Risen' }] as never[]
  it('mode labels', () => {
    expect(pinLabel({ kind: 'mode', mode: 'logo' }, items)).toBe('Logo')
    expect(pinLabel({ kind: 'mode', mode: 'black' }, items)).toBe('Black')
    expect(pinLabel({ kind: 'mode', mode: 'lyrics' }, items)).toBe('Live text')
  })
  it('titleCard uses the item title, tolerates missing item', () => {
    expect(pinLabel({ kind: 'titleCard', itemId: 42 }, items)).toContain('He’s Risen')
    expect(pinLabel({ kind: 'titleCard', itemId: 999 }, items)).toBe('Held item')
  })
})
```

- [ ] **Step 2:** run `npm test -- zonePins`, confirm FAIL (module missing).
- [ ] **Step 3:** implement:

```ts
// Live-operation pins: "this screen holds X until unpinned." Top of the zone
// precedence chain — a pin beats decks, per-item routing and track assignment,
// because it is the operator's most recent, most explicit intent. Pure module.
import type { ZoneId } from './types'

export type ZonePin =
  | { kind: 'mode'; mode: 'logo' | 'black' | 'lyrics' }
  | { kind: 'titleCard'; itemId: number }

export type ZonePins = Partial<Record<ZoneId, ZonePin>>

const PIN_MODES = ['logo', 'black', 'lyrics'] as const

export function validateZonePins(value: unknown): value is ZonePins {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  for (const [k, pin] of Object.entries(value as Record<string, unknown>)) {
    if (!['1', '2', '3', '4'].includes(k)) return false
    if (typeof pin !== 'object' || pin === null) return false
    const p = pin as ZonePin
    if (p.kind === 'mode') { if (!PIN_MODES.includes(p.mode as never)) return false }
    else if (p.kind === 'titleCard') { if (typeof p.itemId !== 'number') return false }
    else return false
  }
  return true
}

export function parseZonePins(json: string | null): ZonePins {
  if (!json) return {}
  try {
    const parsed = JSON.parse(json)
    return validateZonePins(parsed) ? parsed : {}
  } catch { return {} }
}

export function pinLabel(pin: ZonePin, items: { id: number; title: string }[]): string {
  if (pin.kind === 'mode') return pin.mode === 'logo' ? 'Logo' : pin.mode === 'black' ? 'Black' : 'Live text'
  const item = items.find((it) => it.id === pin.itemId)
  return item ? `Holding “${item.title}”` : 'Held item'
}
```

- [ ] **Step 4:** `npm test && npm run typecheck` — all green (154 + new).
- [ ] **Step 5:** commit `feat: add zonePins pure module`.

## Task PN-2: engine — pins, 'sermon' mode, recovery, IPC

**Files:**
- Modify: `src/shared/types.ts` (ZoneMode += `'sermon'`; ZoneState += `speaker: string | null`, `passage: string | null`; `ZONE_ROUTING_DEFAULTS.sermon` → `{1:'sermon',2:'sermon',3:'logo',4:'stage'}`)
- Modify: `src/main/index.ts`
- Modify: `src/main/recovery.ts` (+ optional `pins` on RecoverySnapshot)
- Modify: `src/preload/index.ts`

- [ ] `zoneOverrides` → `const zonePins = new Map<ZoneId, ZonePin>()`. Delete the old mode-only semantics.
- [ ] `computeZoneStates()`: pin branch FIRST (before the deck branch):
  - `kind:'mode'` → proceed with that mode through the existing population code (like old override).
  - `kind:'titleCard'` → `result[zoneId] = titleCardZoneState(item, live)`; item looked up in `activeServiceItems` **without track filtering**; missing item → mode `'logo'` + logWarn, never black.
  - `titleCardZoneState`: mode `'sermon'`, `title` = payload.title ?? item.title, `speaker`/`passage` from payload (sermon) else null, `background` = payload.background ?? null, themeColors resolved as the text branch does.
- [ ] New `'sermon'` mode population branch in the normal (routing) path too, mirroring lyrics/text: `base.title = live.songTitle; base.line = live.line;` + fill `base.speaker`/`base.passage` from the live item payload when it is a sermon; same `theme:` background/color resolution.
- [ ] `emptyZoneState` gains `speaker: null, passage: null`.
- [ ] **idleDefault companion fix**: when `trackShowingContent`, zone 3 → `'text'`/`'lyrics'` (matching t.mode as zones 1/2 do) and zone 4 → `'stage'` — Quick Scripture during the sermon must not blank the Lyrics TVs.
- [ ] Deck comment update: deck "wins outright… except a pin".
- [ ] IPC: `wf:zone:setPin (zoneId, pin | null)`, `wf:zone:clearPins`, `wf:zone:getPins` replacing `wf:zone:setOverride`/`clearOverrides` (rename outright; only callers are ZonePanel + mock). `setPin` calls `broadcast()` (zones + operator + recovery all refresh).
- [ ] Recovery: include `pins` in the snapshot written by broadcast; on restore, drop `titleCard` pins whose itemId is absent from `activeServiceItems`.
- [ ] `wf:setActiveService`: `zonePins.clear()` in both branches.
- [ ] Preload: `zoneSetPin`, `zoneClearPins`, `zoneGetPins`.
- [ ] `npm test && npm run typecheck` green (renderer will fail to compile until PN-4 updates MODE_LABELS/CELL_COLOR — if so, add the `sermon` entries to `ZoneRoutingGrid.tsx` MODE_LABELS/`ZonePanel.tsx` MODE_COLORS/`ZoneStripBadge.tsx` CELL_COLOR in THIS task to stay green, UI overhaul still PN-4).
- [ ] Commit `feat: zone pins in the engine + designed sermon mode state`.

## Task PN-3: zoneHtml sermon backdrop

**Files:**
- Modify: `src/main/zoneHtml.ts`
- Reference: scratchpad `sermon-backdrop-preview.html` (PORTABLE BLOCK markers) — the CSS is port-ready; change `--u:19.2px` → `--u:1vw`, drop the `.s-bg` rule (reuse `#bgimg`).

- [ ] Append `SERMON_CSS` to `FLEX_CSS` and `LYRICS_CSS`.
- [ ] Add `<div id="sermon" style="display:none"></div>` sibling in `FLEX_BODY`/`LYRICS_BODY_INNER`.
- [ ] Add `sermonHtml(s)` + `prevSermonKey` to `SHARED_JS` (from the design: rule → kicker "Today's Message" → title → hairline → speaker → passage → corner mark from `s.churchName` if present; accent = themeColors.secondary fallback `#c8102e`).
- [ ] `FLEX_SCRIPT` `render()`: teardown lines at top (`sermon` hidden, bg filters cleared) + `m==='sermon'` branch per the design (applyBg, saturate/brighten filter, 240s drift animation, themed fallback gradient when no background, innerHTML only when content key changes, `fitText` title 9→4.2vw at 60% width).
- [ ] `STAGE_SCRIPT`: small branch — title prominent, speaker/passage as subtext.
- [ ] Multiview: no changes.
- [ ] Verify by serving: run the built app later (PN-6) — but first sanity-render: `npm run typecheck` + a node smoke test is impossible for HTML strings, so verification is visual in PN-6. Commit `feat: designed sermon backdrop on zone displays`.

## Task PN-4: Live tab — clickable zone cards + pin picker

**Files:**
- Create: `src/renderer/src/zones/ZoneLiveGrid.tsx` (~120 lines)
- Create: `src/renderer/src/zones/ZonePinPicker.tsx` (~90 lines)
- Modify: `src/renderer/src/ZonePanel.tsx` (gut to ZoneLiveGrid + Pi URLs block)
- Modify: `src/renderer/src/SecondTrackTools.tsx` (drop its ZonePanel mount)
- Modify: `src/renderer/src/browserWfMock.ts` (zoneSetPin/zoneClearPins/zoneGetPins stubs)

- [ ] `ZoneLiveGrid`: 2×2 cards named per `ZONE_NAMES`, each showing the zone's current mode/line (from `zoneGetStates()` + refresh on `onState`), amber ring + 📌 chip with `pinLabel()` + × unpin when pinned (server truth via `zoneGetPins`, NOT local state — the audit's #1 fix), amber "N screens pinned — Unpin all" banner, and the suggestion chip: when the main track's live item is a sermon and zone 1 unpinned → `📌 Hold "<title>" on Back Left` → one click pins `{kind:'titleCard', itemId}`.
- [ ] `ZonePinPicker` popover on card click: Follow service / Hold "<live item>" (sermon|text live) / Hold another item… (sermon|text items in service) / Logo / Black / Live text (small) / Advanced ▾ → existing `ZoneTrackToggle`.
- [ ] Delete the Auto/Black/Logo/Lyrics chips, the local `overridden` Set, the 2s poll (pins refresh via onState pushes + explicit refetch after set).
- [ ] The old "Clear overrides" → banner "Unpin all" → `zoneClearPins`.
- [ ] `npm run typecheck && npm test` green. Commit `feat: clickable zone cards with pins replace override chips`.

## Task PN-5: consistency sweep

- [ ] `ZONE_MODE_OPTIONS` in `ZoneRoutingGrid.tsx`: add `'sermon'` for zones 1-3 (it's a routable mode now, it IS the sermon default for zones 1/2).
- [ ] `ScenePresetRow`/scenes: no change (roles still content/logo/black; sermon mode comes from type default or Advanced).
- [ ] grep for `setOverride|clearOverrides|zoneOverrides` — zero hits outside git history.
- [ ] Full `npm test && npm run typecheck`. Commit `chore: pin-era consistency sweep`.

## Task PN-6: build, install, verify live (the two-click Sunday test)

- [ ] `npm run typecheck && npm test`; then `npm run dist` run ALONE; verify installer `.exe` NEWER than `win-unpacked\resources\app.asar`.
- [ ] Kill app; launch `dist-installer\win-unpacked\WorshipFlow Pro.exe` directly (fast loop, shares userData).
- [ ] Verify in-app, in order:
  1. Live tab shows 4 zone cards with live content and no old chips.
  2. Go live on "He's Risen" sermon → Back Left/Back Right cards show the DESIGNED backdrop (serif title, eyebrow, red rule) — screenshot.
  3. Suggestion chip appears; click it → Back Left pinned (amber ring + chip).
  4. Quick Scripture "Psalm 90:4-12" → Go → verses on Back Right + Lyrics TVs (NOT blanked — the idleDefault fix), Back Left still holds — screenshot in Zone Multiview.
  5. Space ×3 — verses advance, Back Left immobile.
  6. Unpin via chip × — Back Left resumes following.
  7. Switch service away/back — no pins survive.
  8. Restart the app mid-pin (relaunch) → recovery restores the pin.
- [ ] Then rebuild installer if fixes were needed, and hand the final installer to Ryan (elevated clicks are his).

## Notes for implementers
- Tailwind v3 only. Never run a dev server. Zone pages have NO webfonts — system fonts only in zoneHtml.
- Do not touch the deck composer or Build Service routing surfaces beyond PN-5's option list.
- Pins are in-memory + recovery.json — no DB migration anywhere in this plan.
