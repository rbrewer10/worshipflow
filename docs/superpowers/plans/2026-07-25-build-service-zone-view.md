# Build Service 4-Zone Screen View — Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single slide preview in the centre of Build Service with a 2×2 grid of live previews of the four zone screens, where each screen's role (Content / Logo / Black) is set by dragging a chip onto it or clicking to cycle.

**Architecture:** Pure role↔mode conversion lives in `src/shared/zoneScenes.ts` and is unit-tested. Three new presentational components under `src/renderer/src/zones/` compose into `ZoneScreenGrid`, which owns routing state for the selected item and persists through the **existing** `window.wf.zoneSetRouting` IPC. No database, IPC, or main-process data change — the only main-process edit is reverting a superseded workaround.

**Tech Stack:** Electron + electron-vite, React 18, TypeScript, Tailwind v3, vitest, sql.js.

**Spec:** `docs/superpowers/specs/2026-07-25-build-service-zone-view-design.md`

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `src/renderer/src/ScenePresetRow.tsx` | The preset chip row (Lyrics TVs only / Everywhere / …), extracted so Build Service and the Live tab share one implementation. Presentational — no IPC. |
| `src/renderer/src/zones/ZoneRolePalette.tsx` | The three draggable role chips, plus the shared role label/colour maps. Presentational. |
| `src/renderer/src/zones/ZoneScreenCard.tsx` | One screen: name, live 16:9 preview, drop target, click-to-cycle. Presentational — takes a mode, emits a role. |
| `src/renderer/src/zones/ZoneScreenGrid.tsx` | Owns routing + scene config + logo path for the selected item. Renders preset row, palette, 2×2 grid, Advanced disclosure. The only new file that touches `window.wf`. |

**Modify:**

| File | Change |
|---|---|
| `src/shared/zoneScenes.ts` | Add `roleForMode()` and `modeForRole()`; make `expandScene` use `modeForRole`. |
| `src/shared/zoneScenes.test.ts` | Tests for both new functions. |
| `src/renderer/src/SceneChips.tsx` | Render `ScenePresetRow` instead of inline chips. Component itself stays — `ZonePanel.tsx:153` still mounts it. |
| `src/renderer/src/ItemEditor.tsx` | Remove the `SceneChips` mount (lines 181–184) and its import (line 6). |
| `src/renderer/src/ServiceEditor.tsx` | Swap the centre big preview (lines 177–197) for `ZoneScreenGrid`. |
| `src/main/index.ts` | Revert commit `3ea15e0` (the superseded track-assignment override). |

**Do not touch:** `src/renderer/src/ZonePanel.tsx`, `src/renderer/src/ZoneRoutingGrid.tsx`, `src/renderer/src/ZoneStripBadge.tsx`, `src/renderer/src/ServiceSlidePreview.tsx`. All four are consumed as-is.

---

## Task 1: Role ↔ mode conversion in the shared module

**Files:**
- Modify: `src/shared/zoneScenes.ts:51-60`
- Test: `src/shared/zoneScenes.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/shared/zoneScenes.test.ts`, after the existing `describe('contentModeFor', …)` block:

```ts
describe('roleForMode', () => {
  it('maps filler modes to their own role', () => {
    expect(roleForMode('logo')).toBe('logo')
    expect(roleForMode('black')).toBe('black')
  })
  it('maps every content-bearing mode to content', () => {
    expect(roleForMode('lyrics')).toBe('content')
    expect(roleForMode('text')).toBe('content')
    expect(roleForMode('countdown')).toBe('content')
    expect(roleForMode('image')).toBe('content')
  })
  it('returns null for modes with no role equivalent', () => {
    expect(roleForMode('off')).toBeNull()
    expect(roleForMode('stage')).toBeNull()
  })
  it('round-trips every starter scene role for zones 1-3', () => {
    for (const scene of STARTER_SCENES) {
      const routing = expandScene(scene, 'song')
      for (const z of ['1', '2', '3'] as const) {
        expect(roleForMode(routing[Number(z) as 1 | 2 | 3])).toBe(scene.zones[z])
      }
    }
  })
})

describe('modeForRole', () => {
  it('content resolves against the item type', () => {
    expect(modeForRole('content', 'song')).toBe('lyrics')
    expect(modeForRole('content', 'countdown')).toBe('countdown')
    expect(modeForRole('content', 'image')).toBe('image')
    expect(modeForRole('content', 'sermon')).toBe('text')
  })
  it('logo and black ignore the item type', () => {
    expect(modeForRole('logo', 'song')).toBe('logo')
    expect(modeForRole('black', 'image')).toBe('black')
  })
  it('a missing role falls back to logo (safe filler)', () => {
    expect(modeForRole(undefined, 'song')).toBe('logo')
  })
})
```

Then extend the import at the top of the same file (currently lines 2–5) to include the two new names:

```ts
import {
  STARTER_SCENES, starterConfig, contentModeFor, expandScene, roleForMode, modeForRole,
  defaultRoutingFor, effectiveRouting, matchScene, parseSceneConfig, validateSceneConfig
} from './zoneScenes'
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- zoneScenes`
Expected: FAIL — `roleForMode is not a function` (and `modeForRole is not a function`).

- [ ] **Step 3: Implement both functions**

In `src/shared/zoneScenes.ts`, replace the existing `expandScene` (lines 51–60) with:

```ts
// Role -> mode. The single place that decides what "show the content" means for
// a given item type; expandScene and the Build Service zone grid both go
// through it so they can never disagree.
export function modeForRole(role: ZoneRole | undefined, type: ServiceItemType): ZoneMode {
  return role === 'content' ? contentModeFor(type) : role === 'black' ? 'black' : 'logo'
}

// Mode -> role, the inverse of modeForRole. Returns null for modes no role can
// express ('off', and 'stage' which only zone 4 renders) — callers show those
// read-only and leave the Advanced grid as the way to change them.
export function roleForMode(mode: ZoneMode): ZoneRole | null {
  if (mode === 'logo') return 'logo'
  if (mode === 'black') return 'black'
  if (mode === 'lyrics' || mode === 'text' || mode === 'countdown' || mode === 'image') return 'content'
  return null
}

export function expandScene(scene: SceneDef, type: ServiceItemType): ZoneRouting {
  return {
    1: modeForRole(scene.zones?.['1'], type),
    2: modeForRole(scene.zones?.['2'], type),
    3: modeForRole(scene.zones?.['3'], type),
    4: 'stage',
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- zoneScenes`
Expected: PASS. The pre-existing `expandScene` tests must still pass — the refactor is behaviour-preserving.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: 12 test files pass (test count rises from 130 by the new cases); typecheck silent.

- [ ] **Step 6: Commit**

```bash
git add src/shared/zoneScenes.ts src/shared/zoneScenes.test.ts
git commit -m "feat: add roleForMode/modeForRole to zoneScenes

Both directions of the role<->mode mapping in one place. expandScene now
uses modeForRole rather than its own inline copy, so the Build Service zone
grid and scene expansion can't disagree about what 'content' means."
```

---

## Task 2: Revert the superseded track-assignment override

Commit `3ea15e0` made a zone reassigned away from its default track ignore the live item's per-item routing. It was a workaround for that routing being invisible; this feature makes it visible, and the override costs per-item control. The spec retires it.

**Files:**
- Modify: `src/main/index.ts` (via `git revert`)

- [ ] **Step 1: Revert the commit**

```bash
git revert --no-edit 3ea15e0
```

Expected: a clean revert. No other commit has touched these lines since.

- [ ] **Step 2: Verify the reverted code reads correctly**

Open `src/main/index.ts` and confirm `computeZoneStates()` now contains:

```ts
    const routedMode = override ?? (routing ? routing[zoneId] : idleDefault)
    const mode = routedMode ?? 'off'
```

…that `item` is a `const` declared **inside** the `if (t.serviceItemId != null)` block, and that `contentModeFor` is **no longer** in the `../shared/zoneScenes` import (it stays exported for the renderer).

If the revert conflicted, make those three edits by hand instead.

- [ ] **Step 3: Verify nothing else broke**

Run: `npm test && npm run typecheck`
Expected: all tests pass; typecheck silent. Specifically, `contentModeFor` must not be reported as an unused import.

- [ ] **Step 4: Commit**

The revert already created a commit. Amend its message for clarity:

```bash
git commit --amend -m "revert: track-assignment override, superseded by the zone grid

Reverts 3ea15e0. That override existed because per-item zone routing was
invisible in the UI; the Build Service zone grid makes it visible and
editable, so the override now only removes per-item control from the zones
the operator reassigns most. Restores one uniform rule: track assignment
picks which item a screen follows, the grid picks what it shows."
```

---

## Task 3: Extract ScenePresetRow out of SceneChips

`SceneChips` currently renders the preset chips inline. Build Service needs the same row, and `ZonePanel.tsx:153` must keep working unchanged, so the row moves to its own component consumed by both.

**Files:**
- Create: `src/renderer/src/ScenePresetRow.tsx`
- Modify: `src/renderer/src/SceneChips.tsx:54-76`

- [ ] **Step 1: Create the component**

Create `src/renderer/src/ScenePresetRow.tsx`:

```tsx
import { Wrench } from 'lucide-react'
import type { ServiceItemType, ZoneRouting } from '../../shared/types'
import type { SceneConfig } from '../../shared/zoneScenes'
import { expandScene } from '../../shared/zoneScenes'
import ZoneStripBadge from './ZoneStripBadge'

// The one-tap scene preset chips. Presentational and fully controlled — shared
// by SceneChips (Live tab) and ZoneScreenGrid (Build Service) so the two can't
// drift apart. `matched` is matchScene()'s result; `isDefault` is true when the
// item has no stored routing, which is what earns the "(default)" suffix.
export default function ScenePresetRow({ config, itemType, routing, matched, isDefault, onPick }: {
  config: SceneConfig
  itemType: ServiceItemType
  routing: ZoneRouting
  matched: string | 'custom'
  isDefault: boolean
  onPick: (sceneId: string) => void
}): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {config.scenes.map((s) => {
        const active = matched === s.id
        return (
          <button
            key={s.id}
            onClick={() => onPick(s.id)}
            className={`flex flex-col items-start gap-1 rounded-lg border-2 px-2 py-1.5 text-[11px] font-semibold transition-colors ${
              active ? 'border-blue-500 bg-blue-500/10 text-blue-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            <ZoneStripBadge routing={expandScene(s, itemType)} title={s.name} />
            <span>{s.name}{active && isDefault ? ' (default)' : ''}</span>
          </button>
        )
      })}
      {matched === 'custom' && (
        <span className="flex flex-col items-start gap-1 rounded-lg border-2 border-slate-300 bg-slate-100 px-2 py-1.5 text-[11px] font-semibold text-slate-600">
          <ZoneStripBadge routing={routing} />
          <span className="inline-flex items-center gap-1"><Wrench size={10} /> Custom</span>
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Consume it from SceneChips**

In `src/renderer/src/SceneChips.tsx`, replace the whole `<div className="flex flex-wrap gap-1.5"> … </div>` block (lines 54–76) with:

```tsx
      <ScenePresetRow
        config={config}
        itemType={item.type}
        routing={routing}
        matched={matched}
        isDefault={isDefault}
        onPick={pick}
      />
```

Add the import alongside the existing ones:

```tsx
import ScenePresetRow from './ScenePresetRow'
```

Then remove now-unused imports from `SceneChips.tsx`: `Wrench` (keep `Pencil`), `expandScene` is still used by `pick()` so it stays, and `ZoneStripBadge` is no longer referenced — delete its import line.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test`
Expected: typecheck silent (no unused-import errors), all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/ScenePresetRow.tsx src/renderer/src/SceneChips.tsx
git commit -m "refactor: extract ScenePresetRow from SceneChips

Build Service's zone grid needs the same preset chips the Live tab shows.
One controlled component, two consumers, so they can't drift."
```

---

## Task 4: ZoneRolePalette

**Files:**
- Create: `src/renderer/src/zones/ZoneRolePalette.tsx`

- [ ] **Step 1: Create the component**

Create `src/renderer/src/zones/ZoneRolePalette.tsx`:

```tsx
import type { ZoneRole } from '../../../shared/zoneScenes'

// The MIME type carrying a role between the palette and a screen card. A custom
// type (rather than text/plain) means an unrelated text drag can't be mistaken
// for a role drop.
export const ROLE_DND_TYPE = 'application/x-wf-zone-role'

export const ROLES: ZoneRole[] = ['content', 'logo', 'black']

export const ROLE_LABEL: Record<ZoneRole, string> = {
  content: 'Content',
  logo: 'Logo',
  black: 'Black',
}

// Matches ZoneStripBadge's cell colours so the palette, the chips, and the
// cards all read as the same vocabulary.
export const ROLE_CLASS: Record<ZoneRole, string> = {
  content: 'bg-blue-600 text-white',
  logo: 'bg-slate-300 text-slate-800',
  black: 'bg-slate-800 text-white',
}

export default function ZoneRolePalette(): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Drag onto a screen
      </span>
      {ROLES.map((role) => (
        <span
          key={role}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(ROLE_DND_TYPE, role)
            e.dataTransfer.effectAllowed = 'copy'
          }}
          className={`cursor-grab select-none rounded px-2.5 py-1 text-[11px] font-semibold ${ROLE_CLASS[role]}`}
        >
          {ROLE_LABEL[role]}
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: silent.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/zones/ZoneRolePalette.tsx
git commit -m "feat: add ZoneRolePalette draggable role chips"
```

---

## Task 5: ZoneScreenCard

**Files:**
- Create: `src/renderer/src/zones/ZoneScreenCard.tsx`

- [ ] **Step 1: Create the component**

Create `src/renderer/src/zones/ZoneScreenCard.tsx`:

```tsx
import { useState } from 'react'
import type { ZoneId, ZoneMode, ServiceItem, ThemeColors, SongFull } from '../../../shared/types'
import { ZONE_NAMES } from '../../../shared/types'
import type { ZoneRole } from '../../../shared/zoneScenes'
import { roleForMode } from '../../../shared/zoneScenes'
import ServiceSlidePreview from '../ServiceSlidePreview'
import { ROLE_DND_TYPE, ROLES, ROLE_LABEL } from './ZoneRolePalette'

function toAssetUrl(p: string): string {
  return 'wf-asset://?path=' + encodeURIComponent(p)
}

// One physical screen. Renders what that screen will actually show for this
// item, and accepts a role by drop or by click-to-cycle. A mode with no role
// equivalent ('off', 'stage') renders read-only — the Advanced grid remains the
// way to change those.
export default function ZoneScreenCard({
  zoneId, mode, item, serviceTheme, serviceColors, songFull, logoPath, onRoleChange
}: {
  zoneId: ZoneId
  mode: ZoneMode
  item: ServiceItem
  serviceTheme: string | null
  serviceColors: ThemeColors | null
  songFull: SongFull | null
  logoPath: string | null
  onRoleChange: (role: ZoneRole) => void
}): JSX.Element {
  const [dragOver, setDragOver] = useState(false)
  const role = roleForMode(mode)
  const editable = role !== null

  const cycle = (): void => {
    if (role === null) return
    onRoleChange(ROLES[(ROLES.indexOf(role) + 1) % ROLES.length])
  }

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.getData(ROLE_DND_TYPE)
    if (dropped === 'content' || dropped === 'logo' || dropped === 'black') onRoleChange(dropped)
  }

  const body = (): JSX.Element => {
    if (role === 'content') {
      return <ServiceSlidePreview item={item} serviceTheme={serviceTheme} serviceColors={serviceColors} songFull={songFull} />
    }
    // Same 16:9 box shape ServiceSlidePreview uses, so all four cards line up.
    return (
      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-2xl ring-1 ring-white/10"
             style={{ background: role === 'black' ? '#000' : '#2b2f36' }}>
          {role === 'logo' && logoPath && (
            <img src={toAssetUrl(logoPath)} alt="" className="max-h-[70%] max-w-[70%] object-contain" />
          )}
          {role === 'logo' && !logoPath && (
            <span className="text-[11px] font-semibold text-white/30">Logo</span>
          )}
          {role === null && (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-white/40">{mode}</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => { if (editable) { e.preventDefault(); setDragOver(true) } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={cycle}
      role={editable ? 'button' : undefined}
      tabIndex={editable ? 0 : undefined}
      onKeyDown={(e) => { if (editable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); cycle() } }}
      title={editable ? `${ZONE_NAMES[zoneId]} — click to cycle, or drop a role here` : ZONE_NAMES[zoneId]}
      className={`rounded-xl border-2 p-2 transition-colors ${
        dragOver ? 'border-blue-500 bg-blue-500/10' : 'border-slate-200 bg-white'
      } ${editable ? 'cursor-pointer hover:border-slate-300' : 'cursor-default'}`}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{ZONE_NAMES[zoneId]}</span>
        <span className="text-[10px] font-semibold text-slate-400">{role ? ROLE_LABEL[role] : mode}</span>
      </div>
      {body()}
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: silent.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/zones/ZoneScreenCard.tsx
git commit -m "feat: add ZoneScreenCard live screen preview with role drop target"
```

---

## Task 6: ZoneScreenGrid

**Files:**
- Create: `src/renderer/src/zones/ZoneScreenGrid.tsx`

- [ ] **Step 1: Create the component**

Create `src/renderer/src/zones/ZoneScreenGrid.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { ServiceItem, ThemeColors, SongFull, ZoneId, ZoneRouting } from '../../../shared/types'
import type { SceneConfig, ZoneRole } from '../../../shared/zoneScenes'
import { effectiveRouting, matchScene, expandScene, modeForRole } from '../../../shared/zoneScenes'
import ScenePresetRow from '../ScenePresetRow'
import ZoneRoutingGrid from '../ZoneRoutingGrid'
import ZoneRolePalette from './ZoneRolePalette'
import ZoneScreenCard from './ZoneScreenCard'

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

// The four physical screens for the selected item: preset row, drag palette,
// 2x2 grid of live previews, and the raw-mode Advanced escape hatch. Writes the
// same per-item zone_routing the scene chips always have, through the existing
// zoneSetRouting IPC — no new persistence.
export default function ZoneScreenGrid({ item, serviceTheme, serviceColors, songFull, onChanged }: {
  item: ServiceItem
  serviceTheme: string | null
  serviceColors: ThemeColors | null
  songFull: SongFull | null
  onChanged: () => void
}): JSX.Element {
  const [config, setConfig] = useState<SceneConfig | null>(null)
  const [logoPath, setLogoPath] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => { void window.wf.scenesGet().then(setConfig) }, [])
  useEffect(() => { void window.wf.logoGet().then(({ logoPath: p }) => setLogoPath(p)) }, [])

  if (!config) return <></>

  const routing = effectiveRouting(item, config)
  const matched = matchScene(routing, item.type, config)
  const isDefault = item.zoneRouting == null

  const save = (next: ZoneRouting): void => {
    void window.wf.zoneSetRouting(item.id, next).then(onChanged)
  }

  const pickScene = (sceneId: string): void => {
    const scene = config.scenes.find((s) => s.id === sceneId)
    if (!scene) return
    save(expandScene(scene, item.type))
  }

  // Dropping/cycling a role stamps a full explicit routing onto the item, the
  // same thing tapping a preset chip has always done.
  const setRole = (zoneId: ZoneId, role: ZoneRole): void => {
    save({ ...routing, [zoneId]: modeForRole(role, item.type) })
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <ScenePresetRow
        config={config}
        itemType={item.type}
        routing={routing}
        matched={matched}
        isDefault={isDefault}
        onPick={pickScene}
      />

      <ZoneRolePalette />

      <div className="grid grid-cols-2 gap-3">
        {ZONE_IDS.map((zoneId) => (
          <ZoneScreenCard
            key={zoneId}
            zoneId={zoneId}
            mode={routing[zoneId]}
            item={item}
            serviceTheme={serviceTheme}
            serviceColors={serviceColors}
            songFull={songFull}
            logoPath={logoPath}
            onRoleChange={(role) => setRole(zoneId, role)}
          />
        ))}
      </div>

      <div>
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-[10px] font-semibold text-slate-400 hover:text-slate-600"
        >
          Advanced {showAdvanced ? '▴' : '▾'}
        </button>
        {showAdvanced && (
          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-100/70 p-2.5">
            <ZoneRoutingGrid routing={routing} onChange={save} />
            {!isDefault && (
              <button
                onClick={() => { void window.wf.zoneSetRouting(item.id, null).then(onChanged) }}
                className="mt-2 text-[10px] font-semibold text-slate-400 hover:text-slate-600"
              >
                Reset to default for this type
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: silent.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/zones/ZoneScreenGrid.tsx
git commit -m "feat: add ZoneScreenGrid composing presets, palette and the 2x2 screens"
```

---

## Task 7: Wire into Build Service, drop the duplicate Screens panel

**Files:**
- Modify: `src/renderer/src/ServiceEditor.tsx:6` and `:177-197`
- Modify: `src/renderer/src/ItemEditor.tsx:6` and `:181-184`

- [ ] **Step 1: Swap the centre preview in ServiceEditor**

In `src/renderer/src/ServiceEditor.tsx`, replace the import on line 6:

```tsx
import ServiceSlidePreview from './ServiceSlidePreview'
```

with:

```tsx
import ZoneScreenGrid from './zones/ZoneScreenGrid'
```

Then replace the whole centre block (lines 177–197) with:

```tsx
        {/* Center: the four zone screens for the selected item */}
        <div className="flex min-w-0 flex-1 items-center justify-center overflow-auto p-2">
          {selectedItem ? (
            <ZoneScreenGrid
              item={selectedItem}
              serviceTheme={service.theme}
              serviceColors={service.themeColors}
              songFull={selectedSongFull}
              onChanged={reload}
            />
          ) : (
            <div className="text-sm text-slate-500">Select an item to preview &amp; style it</div>
          )}
        </div>
```

- [ ] **Step 2: Remove the now-duplicate Screens panel from ItemEditor**

In `src/renderer/src/ItemEditor.tsx`, delete the import on line 6:

```tsx
import SceneChips from './SceneChips'
```

and delete this block (lines 181–184):

```tsx
      {/* ── Screens (zone scenes) ── */}
      <div className="border-t border-slate-200 pt-3">
        <SceneChips item={item} onChanged={onChanged} />
      </div>
```

Leave `ItemEditor`'s own `ServiceSlidePreview` (line 99) and `ItemBackgroundPanel` alone.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test`
Expected: typecheck silent — in particular `ServiceSlidePreview` must no longer be reported as an unused import in `ServiceEditor.tsx`. All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/ServiceEditor.tsx src/renderer/src/ItemEditor.tsx
git commit -m "feat: Build Service centre shows the four zone screens

Replaces the single slide preview with the 2x2 zone grid, and drops the
Screens chips from the item editor so zone routing lives in exactly one
place. ZonePanel's copy on the Live tab is unchanged."
```

---

## Task 8: Build, install, and verify end to end

**Files:** none — verification only.

- [ ] **Step 1: Full check**

Run: `npm run typecheck && npm test`
Expected: typecheck silent; all test files pass.

- [ ] **Step 2: Build the installer**

Run: `npm run dist`
Expected: ends with `building block map … WorshipFlow Pro Setup 0.9.0.exe.blockmap`.

- [ ] **Step 3: Close the running app and launch the installer**

```bash
taskkill //F //IM "WorshipFlow Pro.exe"
start "" "C:\Dev\worshipflow\dist-installer\WorshipFlow Pro Setup 0.9.0.exe"
```

The installer runs elevated, so its buttons cannot be driven by automation — ask Ryan to click through Next → Install → Finish.

- [ ] **Step 4: Confirm the install actually landed**

```bash
powershell -Command "Get-Item 'C:\Program Files\WorshipFlow Pro\resources\app.asar' | Select-Object LastWriteTime"
```

Expected: a timestamp from the build in Step 2, not an earlier one.

- [ ] **Step 5: Verify in the app**

Open WorshipFlow Pro → Build Service and check each of these:

1. Selecting an item shows four cards — Back Left, Back Right, Lyrics TVs, Stage Monitors — not one big preview.
2. A Content card renders the item's real background and text; a Logo card renders the church logo; Stage Monitors reads "stage" and does not respond to clicks.
3. Dragging **Black** onto Back Right turns that card black and the preset row switches to Custom.
4. Clicking Back Right cycles Content → Logo → Black.
5. Tapping the **Everywhere** preset sets Back Left, Back Right, and Lyrics TVs all to Content at once.
6. The right-hand item editor no longer has a Screens section; Background & Color is still there.
7. Live tab → the DISPLAY ZONES panel still shows its own scene chips and they still work.
8. With Lyrics TVs assigned to Second and a scripture item live on Second, setting that item to **Back screens only** now genuinely blanks Lyrics TVs to Logo — and you can see it on the card and fix it with one drag. (This is the reverted override; the behaviour change is intended.)

- [ ] **Step 6: Commit any fixes found**

If a verification step fails, fix it, re-run `npm run typecheck && npm test`, and commit with a `fix:` message describing the specific symptom.

---

## Notes for the implementer

- **Tailwind must stay on v3.** v4 silently emits no CSS and the app renders unstyled.
- **Never run the dev server with the Bash tool.** This is an Electron app; verification happens through the built installer, per Task 8.
- `window.wf.scenesGet`, `window.wf.logoGet`, and `window.wf.zoneSetRouting` all already exist in the preload surface and in `browserWfMock.ts`. No preload or mock change is needed.
- `ZoneRoutingGrid` already refuses to offer `stage` to zones 1–3, so the Advanced disclosure needs no extra guarding.
