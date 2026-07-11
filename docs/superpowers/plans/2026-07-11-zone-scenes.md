# Zone Scenes in Build Service — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the live-only 4-dropdown zone routing with one-tap, editable "scene" chips in Build Service (plus a truthful per-item screen badge and an Advanced escape hatch), per the approved spec `docs/superpowers/specs/2026-07-11-zone-scenes-design.md`.

**Architecture:** A scene is a named placement rule (`content|logo|black` per zone 1–3; Z4 always `stage`) that expands to a full `ZoneRouting` per item type. Pure logic lives in `src/shared/zoneScenes.ts` (unit-tested). The palette is stored as JSON in the existing `setting` table under key `zone_scenes` (no migration). Tapping a chip stamps the expanded routing via the existing `zoneSetRouting` IPC (snapshot semantics). `computeZoneStates()` resolves defaults through the palette's `typeDefaults`, falling back to `ZONE_ROUTING_DEFAULTS`.

**Tech Stack:** Electron main (TS), React renderer (Tailwind v3 light theme, emerald accent, lucide-react), sql.js `setting` table, vitest.

**Verified anchors (2026-07-11):** `getSetting`/`setSetting` `src/main/db.ts:700-712`; routing resolution in `computeZoneStates` `src/main/index.ts:327-346`; preload zone API `src/preload/index.ts:210-222`; `ItemEditor.tsx` Background section at lines 168-171 (insert Screens above it); `ZonePanel.tsx` routing grid at lines 147-178; `ServiceDeck.tsx` row subtitle at lines 96-101.

---

### Task 1: Pure scene logic (TDD) — `src/shared/zoneScenes.ts`

**Files:**
- Create: `src/shared/zoneScenes.ts`
- Test: `src/shared/zoneScenes.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/shared/zoneScenes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  STARTER_SCENES, starterConfig, contentModeFor, expandScene,
  defaultRoutingFor, effectiveRouting, matchScene, parseSceneConfig, validateSceneConfig
} from './zoneScenes'
import { ZONE_ROUTING_DEFAULTS } from './types'
import type { SceneDef } from './zoneScenes'

const lyricsTvsOnly = STARTER_SCENES.find((s) => s.id === 'lyrics-tvs-only')!
const everywhere = STARTER_SCENES.find((s) => s.id === 'everywhere')!
const config = starterConfig()

describe('contentModeFor', () => {
  it('maps each type to its natural mode', () => {
    expect(contentModeFor('song')).toBe('lyrics')
    expect(contentModeFor('scripture')).toBe('text')
    expect(contentModeFor('text')).toBe('text')
    expect(contentModeFor('ticker')).toBe('text')
    expect(contentModeFor('announcement')).toBe('text')
    expect(contentModeFor('countdown')).toBe('countdown')
    expect(contentModeFor('welcome')).toBe('countdown')
    expect(contentModeFor('image')).toBe('image')
  })
})

describe('expandScene', () => {
  it('expands content role per item type, Z4 always stage', () => {
    expect(expandScene(lyricsTvsOnly, 'song')).toEqual({ 1: 'logo', 2: 'logo', 3: 'lyrics', 4: 'stage' })
    expect(expandScene(everywhere, 'scripture')).toEqual({ 1: 'text', 2: 'text', 3: 'text', 4: 'stage' })
    expect(expandScene(everywhere, 'image')).toEqual({ 1: 'image', 2: 'image', 3: 'image', 4: 'stage' })
  })
  it('treats a missing zone key as logo (safe filler)', () => {
    const partial = { id: 'p', name: 'P', zones: { '3': 'content' } } as unknown as SceneDef
    expect(expandScene(partial, 'song')).toEqual({ 1: 'logo', 2: 'logo', 3: 'lyrics', 4: 'stage' })
  })
})

describe('defaultRoutingFor / effectiveRouting', () => {
  it('starter typeDefaults reproduce todays hardcoded defaults', () => {
    expect(defaultRoutingFor('song', config)).toEqual(ZONE_ROUTING_DEFAULTS.song)
    expect(defaultRoutingFor('scripture', config)).toEqual(ZONE_ROUTING_DEFAULTS.scripture)
  })
  it('falls back to ZONE_ROUTING_DEFAULTS when type has no palette default', () => {
    expect(defaultRoutingFor('countdown', config)).toEqual(ZONE_ROUTING_DEFAULTS.countdown)
    expect(defaultRoutingFor('image', config)).toEqual(ZONE_ROUTING_DEFAULTS.image)
  })
  it('falls back when typeDefault points at a deleted scene', () => {
    const cfg = { ...config, typeDefaults: { song: 'no-such-scene' } }
    expect(defaultRoutingFor('song', cfg)).toEqual(ZONE_ROUTING_DEFAULTS.song)
  })
  it('effectiveRouting: stored routing wins over defaults', () => {
    const item = { type: 'song' as const, zoneRouting: { 1: 'black', 2: 'black', 3: 'lyrics', 4: 'stage' } as const }
    expect(effectiveRouting(item, config)[1]).toBe('black')
    expect(effectiveRouting({ type: 'song', zoneRouting: null }, config)).toEqual(ZONE_ROUTING_DEFAULTS.song)
  })
})

describe('matchScene', () => {
  it('null-routing (default) and an explicitly stamped default match the SAME scene', () => {
    const stamped = expandScene(lyricsTvsOnly, 'song')
    expect(matchScene(stamped, 'song', config)).toBe('lyrics-tvs-only')
    expect(matchScene(effectiveRouting({ type: 'song', zoneRouting: null }, config), 'song', config)).toBe('lyrics-tvs-only')
  })
  it('hand-tuned routing (incl. Z4 changed) is custom', () => {
    expect(matchScene({ 1: 'lyrics', 2: 'black', 3: 'logo', 4: 'stage' }, 'song', config)).toBe('custom')
    expect(matchScene({ 1: 'logo', 2: 'logo', 3: 'lyrics', 4: 'black' }, 'song', config)).toBe('custom')
  })
})

describe('parse/validate', () => {
  it('null, garbage, and wrong-shape JSON all yield the starter config', () => {
    expect(parseSceneConfig(null)).toEqual(starterConfig())
    expect(parseSceneConfig('not json{{')).toEqual(starterConfig())
    expect(parseSceneConfig('{"scenes": "nope"}')).toEqual(starterConfig())
  })
  it('valid JSON round-trips', () => {
    const json = JSON.stringify(config)
    expect(parseSceneConfig(json)).toEqual(config)
  })
  it('validateSceneConfig rejects empty list, duplicate ids, blank names', () => {
    expect(validateSceneConfig({ scenes: [], typeDefaults: {} })).toBe(false)
    const dup = { scenes: [lyricsTvsOnly, { ...everywhere, id: 'lyrics-tvs-only' }], typeDefaults: {} }
    expect(validateSceneConfig(dup)).toBe(false)
    const blank = { scenes: [{ ...lyricsTvsOnly, name: '  ' }], typeDefaults: {} }
    expect(validateSceneConfig(blank)).toBe(false)
    expect(validateSceneConfig(config)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/zoneScenes.test.ts`
Expected: FAIL — cannot resolve `./zoneScenes`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/zoneScenes.ts`:

```ts
// Scenes: named, user-editable placement rules for the 4 display zones.
// A scene says, for zones 1-3, whether the screen shows the item's CONTENT or a
// filler (logo / black). Zone 4 (stage monitor) is always 'stage' — only the
// Advanced per-zone grid can change it. Pure module: no DB, no Electron.

import type { ServiceItemType, ZoneRouting, ZoneMode } from './types'
import { ZONE_ROUTING_DEFAULTS } from './types'

export type ZoneRole = 'content' | 'logo' | 'black'

export interface SceneDef {
  id: string
  name: string
  zones: Record<'1' | '2' | '3', ZoneRole>
}

export interface SceneConfig {
  scenes: SceneDef[]
  typeDefaults: Partial<Record<ServiceItemType, string>> // type → sceneId
}

export const STARTER_SCENES: SceneDef[] = [
  { id: 'lyrics-tvs-only',   name: 'Lyrics TVs only',   zones: { '1': 'logo',    '2': 'logo',    '3': 'content' } },
  { id: 'everywhere',        name: 'Everywhere',        zones: { '1': 'content', '2': 'content', '3': 'content' } },
  { id: 'back-screens-only', name: 'Back screens only', zones: { '1': 'content', '2': 'content', '3': 'logo' } },
  { id: 'focus',             name: 'Focus',             zones: { '1': 'black',   '2': 'black',   '3': 'content' } },
  { id: 'all-logo',          name: 'All logo',          zones: { '1': 'logo',    '2': 'logo',    '3': 'logo' } },
]

export const STARTER_TYPE_DEFAULTS: SceneConfig['typeDefaults'] = {
  song: 'lyrics-tvs-only',
  scripture: 'everywhere',
  text: 'everywhere',
  ticker: 'everywhere',
  announcement: 'everywhere',
  // countdown / welcome / image keep the built-in ZONE_ROUTING_DEFAULTS
}

export function starterConfig(): SceneConfig {
  return { scenes: STARTER_SCENES.map((s) => ({ ...s, zones: { ...s.zones } })), typeDefaults: { ...STARTER_TYPE_DEFAULTS } }
}

// The one mode that shows this item type's actual content on a zone screen.
export function contentModeFor(type: ServiceItemType): ZoneMode {
  if (type === 'song') return 'lyrics'
  if (type === 'countdown' || type === 'welcome') return 'countdown'
  if (type === 'image') return 'image'
  return 'text' // scripture, text, ticker, announcement
}

export function expandScene(scene: SceneDef, type: ServiceItemType): ZoneRouting {
  const roleToMode = (role: ZoneRole | undefined): ZoneMode =>
    role === 'content' ? contentModeFor(type) : role === 'black' ? 'black' : 'logo'
  return {
    1: roleToMode(scene.zones?.['1']),
    2: roleToMode(scene.zones?.['2']),
    3: roleToMode(scene.zones?.['3']),
    4: 'stage',
  }
}

// Default routing for a type: the palette's typeDefault scene (if it exists),
// else the built-in hardcoded defaults. Deleted/unknown sceneIds fall through.
export function defaultRoutingFor(type: ServiceItemType, config: SceneConfig): ZoneRouting {
  const sceneId = config.typeDefaults[type]
  const scene = sceneId ? config.scenes.find((s) => s.id === sceneId) : undefined
  return scene ? expandScene(scene, type) : ZONE_ROUTING_DEFAULTS[type]
}

export function effectiveRouting(
  item: { type: ServiceItemType; zoneRouting: ZoneRouting | null },
  config: SceneConfig
): ZoneRouting {
  return item.zoneRouting ?? defaultRoutingFor(item.type, config)
}

// Reverse-match a routing against every scene's expansion for this type.
// Compares all four zones (so an Advanced-edited Z4 correctly reads as custom).
export function matchScene(routing: ZoneRouting, type: ServiceItemType, config: SceneConfig): string | 'custom' {
  for (const scene of config.scenes) {
    const exp = expandScene(scene, type)
    if (exp[1] === routing[1] && exp[2] === routing[2] && exp[3] === routing[3] && exp[4] === routing[4]) {
      return scene.id
    }
  }
  return 'custom'
}

const ROLES: ZoneRole[] = ['content', 'logo', 'black']

export function validateSceneConfig(config: unknown): config is SceneConfig {
  if (typeof config !== 'object' || config == null) return false
  const c = config as SceneConfig
  if (!Array.isArray(c.scenes) || c.scenes.length === 0) return false
  if (typeof c.typeDefaults !== 'object' || c.typeDefaults == null) return false
  const ids = new Set<string>()
  for (const s of c.scenes) {
    if (typeof s?.id !== 'string' || !s.id || ids.has(s.id)) return false
    ids.add(s.id)
    if (typeof s.name !== 'string' || !s.name.trim()) return false
    if (typeof s.zones !== 'object' || s.zones == null) return false
    for (const z of ['1', '2', '3'] as const) {
      const role = s.zones[z]
      if (role != null && !ROLES.includes(role)) return false
    }
  }
  return true
}

// Never throws; anything unusable yields the starter palette.
export function parseSceneConfig(json: string | null): SceneConfig {
  if (!json) return starterConfig()
  try {
    const parsed = JSON.parse(json)
    return validateSceneConfig(parsed) ? (parsed as SceneConfig) : starterConfig()
  } catch {
    return starterConfig()
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shared/zoneScenes.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/shared/zoneScenes.ts src/shared/zoneScenes.test.ts
git commit -m "feat(scenes): pure scene logic with tests"
```

---

### Task 2: Scenes IPC + preload + mock

**Files:**
- Modify: `src/main/index.ts` (imports; handlers next to the zone IPC block; default resolution in `computeZoneStates`)
- Modify: `src/preload/index.ts` (methods + type import)
- Modify: `src/renderer/src/browserWfMock.ts` (mock methods)

- [ ] **Step 1: Main-process imports**

In `src/main/index.ts`, add next to the other shared imports (near line 12-13):

```ts
import { parseSceneConfig, validateSceneConfig, defaultRoutingFor } from '../shared/zoneScenes'
import type { SceneConfig } from '../shared/zoneScenes'
```

(`getSetting`/`setSetting` are already imported from `./db` — verify; if not, add them to that import list.)

- [ ] **Step 2: Register IPC handlers**

Add near the existing zone IPC handlers (search `'wf:zone:setRouting'`):

```ts
// --- Scene palette (Build Service screen scenes) ---
ipcMain.handle('wf:scenes:get', () => parseSceneConfig(getSetting('zone_scenes')))
ipcMain.handle('wf:scenes:set', (_e, config: SceneConfig) => {
  if (!validateSceneConfig(config)) throw new Error('Invalid scene configuration')
  setSetting('zone_scenes', JSON.stringify(config))
  broadcast() // typeDefaults may have changed → zones with default routing re-resolve
})
```

- [ ] **Step 3: Route defaults through the palette in `computeZoneStates`**

Find (currently `src/main/index.ts:329-346`):

```ts
  // Get routing for the active item (or defaults by type).
  let routing: ZoneRouting | null = null
  if (liveServiceItemId != null) {
    const item = activeServiceItems.find((it) => it.id === liveServiceItemId)
    if (item) {
      const stored = getItemZoneRouting(item.id)
      if (stored) {
        try {
          routing = JSON.parse(stored) as ZoneRouting
        } catch (err) {
          console.error(`Failed to parse zone routing for item id=${item.id}:`, err)
          routing = ZONE_ROUTING_DEFAULTS[item.type]
        }
      } else {
        routing = ZONE_ROUTING_DEFAULTS[item.type]
      }
    }
  }
```

Replace with:

```ts
  // Get routing for the active item (or defaults: scene palette typeDefault,
  // falling back to the built-in ZONE_ROUTING_DEFAULTS).
  let routing: ZoneRouting | null = null
  if (liveServiceItemId != null) {
    const item = activeServiceItems.find((it) => it.id === liveServiceItemId)
    if (item) {
      const sceneConfig = parseSceneConfig(getSetting('zone_scenes'))
      const stored = getItemZoneRouting(item.id)
      if (stored) {
        try {
          routing = JSON.parse(stored) as ZoneRouting
        } catch (err) {
          console.error(`Failed to parse zone routing for item id=${item.id}:`, err)
          routing = defaultRoutingFor(item.type, sceneConfig)
        }
      } else {
        routing = defaultRoutingFor(item.type, sceneConfig)
      }
    }
  }
```

- [ ] **Step 4: Preload methods**

In `src/preload/index.ts`, add `SceneConfig` to imports:

```ts
import type { SceneConfig } from '../shared/zoneScenes'
```

Then after `zoneGetIp` (line ~222), add:

```ts
  scenesGet: (): Promise<SceneConfig> => ipcRenderer.invoke('wf:scenes:get'),
  scenesSet: (config: SceneConfig): Promise<void> => ipcRenderer.invoke('wf:scenes:set', config),
```

- [ ] **Step 5: Browser mock**

In `src/renderer/src/browserWfMock.ts`, add near the zone mocks (search `zoneSetRouting`), plus the import at the top:

```ts
import { starterConfig } from '../../shared/zoneScenes'
```

```ts
    scenesGet: async () => starterConfig(),
    scenesSet: noop,
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/renderer/src/browserWfMock.ts
git commit -m "feat(scenes): scene palette IPC, preload bridge, palette-aware zone defaults"
```

---

### Task 3: `ZoneStripBadge` — the truthful 4-cell strip

**Files:**
- Create: `src/renderer/src/ZoneStripBadge.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { ZoneRouting, ZoneMode } from '../../shared/types'

// Tiny truthful visual of a ZoneRouting: Z1 Z2 (back screens), Z3 (lyrics TVs),
// narrow Z4 (stage). Emerald = the item's content is on that screen.
const CELL_COLOR: Record<ZoneMode, string> = {
  lyrics: 'bg-emerald-600', text: 'bg-emerald-600', countdown: 'bg-emerald-600', image: 'bg-emerald-600',
  logo: 'bg-slate-300',
  black: 'bg-slate-800',
  stage: 'bg-slate-500',
  off: 'bg-slate-200 border border-dashed border-slate-400',
}

export default function ZoneStripBadge({ routing, title }: { routing: ZoneRouting; title?: string }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-[2px] align-middle" title={title ?? `Back L: ${routing[1]} · Back R: ${routing[2]} · Lyrics TVs: ${routing[3]} · Stage: ${routing[4]}`}>
      <span className={`h-[10px] w-[15px] rounded-[2px] ${CELL_COLOR[routing[1]]}`} />
      <span className={`h-[10px] w-[15px] rounded-[2px] ${CELL_COLOR[routing[2]]}`} />
      <span className={`h-[10px] w-[15px] rounded-[2px] ${CELL_COLOR[routing[3]]}`} />
      <span className={`h-[10px] w-[9px] rounded-[2px] ${CELL_COLOR[routing[4]]}`} />
    </span>
  )
}
```

- [ ] **Step 2: Typecheck web** — `npm run typecheck:web` → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/ZoneStripBadge.tsx
git commit -m "feat(scenes): zone strip badge component"
```

---

### Task 4: `ZoneRoutingGrid` — extract the Advanced grid from ZonePanel

**Files:**
- Create: `src/renderer/src/ZoneRoutingGrid.tsx`
- Modify: `src/renderer/src/ZonePanel.tsx` (use the shared grid; behavior unchanged in this task)

- [ ] **Step 1: Create the shared grid** (mode labels/options move here from `ZonePanel.tsx:7-31`)

```tsx
import type { ZoneId, ZoneRouting, ZoneState } from '../../shared/types'
import { ZONE_NAMES } from '../../shared/types'

export const MODE_LABELS: Record<ZoneState['mode'], string> = {
  lyrics: 'Lyrics', stage: 'Stage', black: 'Black', logo: 'Logo',
  countdown: 'Countdown', text: 'Text', image: 'Image', off: 'Off',
}

const ZONE_MODE_OPTIONS: ZoneState['mode'][] = ['lyrics', 'stage', 'black', 'logo', 'countdown', 'text', 'image', 'off']
const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

// The raw per-zone mode grid (the "Advanced" escape hatch). Fully controlled.
export default function ZoneRoutingGrid({ routing, onChange }: {
  routing: ZoneRouting
  onChange: (r: ZoneRouting) => void
}): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {ZONE_IDS.map((zoneId) => (
        <div key={zoneId} className="flex items-center gap-1.5">
          <span className="w-6 text-[10px] font-bold text-slate-400" title={ZONE_NAMES[zoneId]}>Z{zoneId}</span>
          <select
            value={routing[zoneId]}
            onChange={(e) => onChange({ ...routing, [zoneId]: e.target.value as ZoneState['mode'] })}
            className="flex-1 rounded border border-slate-200 bg-slate-100 py-0.5 text-[11px] text-slate-700 outline-none focus:border-emerald-500/50"
          >
            {ZONE_MODE_OPTIONS.map((m) => (
              <option key={m} value={m}>{MODE_LABELS[m]}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Use it in ZonePanel**

In `src/renderer/src/ZonePanel.tsx`: delete the local `ZONE_MODE_OPTIONS` const (lines 29-31) and import instead:

```tsx
import ZoneRoutingGrid, { MODE_LABELS } from './ZoneRoutingGrid'
```

Delete the local `MODE_LABELS` const (lines 7-16; keep `MODE_COLORS`). Replace the routing dropdown grid JSX (the `<div className="grid grid-cols-2 gap-1.5">…</div>` inside the "Routing for active item" section, lines 161-176) with:

```tsx
          <ZoneRoutingGrid routing={routing} onChange={saveRouting} />
```

- [ ] **Step 3: Typecheck** — `npm run typecheck:web` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/ZoneRoutingGrid.tsx src/renderer/src/ZonePanel.tsx
git commit -m "refactor(zones): extract shared ZoneRoutingGrid from ZonePanel"
```

---

### Task 5: `SceneEditorModal` — edit the palette

**Files:**
- Create: `src/renderer/src/SceneEditorModal.tsx`

- [ ] **Step 1: Create the modal**

```tsx
import { useEffect, useState } from 'react'
import { Plus, RotateCcw, X } from 'lucide-react'
import type { ServiceItemType } from '../../shared/types'
import type { SceneConfig, SceneDef, ZoneRole } from '../../shared/zoneScenes'
import { starterConfig, expandScene } from '../../shared/zoneScenes'
import ZoneStripBadge from './ZoneStripBadge'

const ROLE_CYCLE: ZoneRole[] = ['content', 'logo', 'black']
const ROLE_LABEL: Record<ZoneRole, string> = { content: 'Content', logo: 'Logo', black: 'Black' }
const ROLE_STYLE: Record<ZoneRole, string> = {
  content: 'bg-emerald-600 text-white',
  logo: 'bg-slate-200 text-slate-600',
  black: 'bg-slate-800 text-slate-300',
}
const ZONE_LABEL: Record<'1' | '2' | '3', string> = { '1': 'Back L', '2': 'Back R', '3': 'Lyrics TVs' }
const DEFAULTABLE_TYPES: ServiceItemType[] = ['song', 'scripture', 'text', 'countdown', 'image', 'welcome', 'ticker', 'announcement']

// Palette editor: rename scenes, tap zone pills to cycle Content → Logo → Black,
// add/delete/reset, and assign per-type default scenes. Saves on Done.
export default function SceneEditorModal({ onClose, onSaved }: {
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const [config, setConfig] = useState<SceneConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { window.wf.scenesGet().then(setConfig) }, [])

  if (!config) return <></>

  const updateScene = (idx: number, patch: Partial<SceneDef>): void => {
    const scenes = config.scenes.map((s, i) => (i === idx ? { ...s, ...patch } : s))
    setConfig({ ...config, scenes })
  }

  const cycleZone = (idx: number, zone: '1' | '2' | '3'): void => {
    const cur = config.scenes[idx].zones[zone] ?? 'logo'
    const next = ROLE_CYCLE[(ROLE_CYCLE.indexOf(cur) + 1) % ROLE_CYCLE.length]
    updateScene(idx, { zones: { ...config.scenes[idx].zones, [zone]: next } })
  }

  const addScene = (): void => {
    const id = `scene-${Date.now()}`
    setConfig({
      ...config,
      scenes: [...config.scenes, { id, name: 'New scene', zones: { '1': 'logo', '2': 'logo', '3': 'content' } }]
    })
  }

  const deleteScene = (idx: number): void => {
    const removed = config.scenes[idx]
    const typeDefaults = { ...config.typeDefaults }
    for (const t of Object.keys(typeDefaults) as ServiceItemType[]) {
      if (typeDefaults[t] === removed.id) delete typeDefaults[t] // reverts to built-in default
    }
    setConfig({ typeDefaults, scenes: config.scenes.filter((_, i) => i !== idx) })
  }

  const save = async (): Promise<void> => {
    if (config.scenes.length === 0) { setError('Keep at least one scene.'); return }
    if (config.scenes.some((s) => !s.name.trim())) { setError('Every scene needs a name.'); return }
    try {
      await window.wf.scenesSet(config)
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="max-h-[85vh] w-[560px] overflow-auto rounded-xl border border-slate-200 bg-[#f4f6f9] p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Edit scenes</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-200"><X size={15} /></button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Tap a screen pill to cycle Content → Logo → Black. The Stage monitor always stays on Stage.
          Changes apply to slides you tag from now on — already-built services keep what they have.
        </p>

        <div className="space-y-2">
          {config.scenes.map((s, idx) => (
            <div key={s.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center gap-2">
                <input
                  value={s.name}
                  onChange={(e) => updateScene(idx, { name: e.target.value })}
                  className="w-44 rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500"
                />
                <ZoneStripBadge routing={expandScene(s, 'song')} />
                <button onClick={() => deleteScene(idx)} className="ml-auto rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-red-500/10 hover:text-red-600">✕</button>
              </div>
              <div className="flex gap-1.5">
                {(['1', '2', '3'] as const).map((z) => (
                  <button
                    key={z}
                    onClick={() => cycleZone(idx, z)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold ${ROLE_STYLE[s.zones[z] ?? 'logo']}`}
                    title={`${ZONE_LABEL[z]} — click to change`}
                  >
                    {ZONE_LABEL[z]}: {ROLE_LABEL[s.zones[z] ?? 'logo']}
                  </button>
                ))}
                <span className="flex items-center rounded-md bg-slate-500 px-2 text-[11px] font-bold text-white" title="Stage monitor — always Stage">Stage</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          <button onClick={addScene} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-400">
            <Plus size={13} /> Add scene
          </button>
          <button onClick={() => setConfig(starterConfig())} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-400">
            <RotateCcw size={13} /> Reset to starter five
          </button>
        </div>

        {/* Per-type defaults */}
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Default scene per item type</div>
          <div className="grid grid-cols-2 gap-1.5">
            {DEFAULTABLE_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-2 text-xs capitalize text-slate-600">
                <span className="w-24">{t}</span>
                <select
                  value={config.typeDefaults[t] ?? ''}
                  onChange={(e) => setConfig({ ...config, typeDefaults: { ...config.typeDefaults, ...(e.target.value ? { [t]: e.target.value } : (() => { const d = { ...config.typeDefaults }; delete d[t]; return d })()) } })}
                  className="flex-1 rounded border border-slate-200 bg-slate-100 py-0.5 text-[11px] text-slate-700 outline-none"
                >
                  <option value="">Built-in default</option>
                  {config.scenes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold hover:bg-slate-200">Cancel</button>
          <button onClick={save} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">Done</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck:web` → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/SceneEditorModal.tsx
git commit -m "feat(scenes): scene palette editor modal"
```

---

### Task 6: `SceneChips` — the one-tap front door

**Files:**
- Create: `src/renderer/src/SceneChips.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useState } from 'react'
import { Pencil, Wrench } from 'lucide-react'
import type { ServiceItem } from '../../shared/types'
import type { SceneConfig } from '../../shared/zoneScenes'
import { expandScene, effectiveRouting, matchScene } from '../../shared/zoneScenes'
import ZoneStripBadge from './ZoneStripBadge'
import ZoneRoutingGrid from './ZoneRoutingGrid'
import SceneEditorModal from './SceneEditorModal'

// One-tap scene chips for an item's zone routing, with "Edit scenes" and an
// Advanced disclosure exposing the raw per-zone grid. Tapping a chip STAMPS the
// expanded routing onto the item (snapshot) via zoneSetRouting.
export default function SceneChips({ item, onChanged }: {
  item: ServiceItem
  onChanged: () => void
}): JSX.Element {
  const [config, setConfig] = useState<SceneConfig | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const loadConfig = (): void => { void window.wf.scenesGet().then(setConfig) }
  useEffect(loadConfig, [])

  if (!config) return <></>

  const routing = effectiveRouting(item, config)
  const matched = matchScene(routing, item.type, config)
  const isDefault = item.zoneRouting == null

  const pick = (sceneId: string): void => {
    const scene = config.scenes.find((s) => s.id === sceneId)
    if (!scene) return
    void window.wf.zoneSetRouting(item.id, expandScene(scene, item.type)).then(onChanged)
  }

  const useDefault = (): void => {
    void window.wf.zoneSetRouting(item.id, null).then(onChanged)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="section-header">Screens</span>
        <span className="flex items-center gap-2">
          <button onClick={() => setShowEditor(true)} className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-slate-600">
            <Pencil size={10} /> Edit scenes
          </button>
          <button onClick={() => setShowAdvanced((v) => !v)} className="text-[10px] font-semibold text-slate-400 hover:text-slate-600">
            Advanced {showAdvanced ? '▴' : '▾'}
          </button>
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {config.scenes.map((s) => {
          const active = matched === s.id
          return (
            <button
              key={s.id}
              onClick={() => pick(s.id)}
              className={`flex flex-col items-start gap-1 rounded-lg border-2 px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                active ? 'border-emerald-500 bg-emerald-500/10 text-emerald-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              <ZoneStripBadge routing={expandScene(s, item.type)} title={s.name} />
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

      {showAdvanced && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-100/70 p-2.5">
          <ZoneRoutingGrid
            routing={routing}
            onChange={(r) => { void window.wf.zoneSetRouting(item.id, r).then(onChanged) }}
          />
          {!isDefault && (
            <button onClick={useDefault} className="mt-2 text-[10px] font-semibold text-slate-400 hover:text-slate-600">
              Reset to default for this type
            </button>
          )}
        </div>
      )}

      {showEditor && (
        <SceneEditorModal
          onClose={() => setShowEditor(false)}
          onSaved={() => { loadConfig(); onChanged() }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck:web` → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/SceneChips.tsx
git commit -m "feat(scenes): scene chips with advanced escape hatch"
```

---

### Task 7: Wire Screens section into Build Service (`ItemEditor`)

**Files:**
- Modify: `src/renderer/src/ItemEditor.tsx` (import + new section above the Background block at lines 168-171)

- [ ] **Step 1: Add import**

```tsx
import SceneChips from './SceneChips'
```

- [ ] **Step 2: Insert the Screens section**

Find (`ItemEditor.tsx:168-171`):

```tsx
      {/* ── Background & Color ── */}
      <div className="border-t border-slate-200 pt-3">
        <ItemBackgroundPanel item={item} onChanged={onChanged} />
      </div>
```

Replace with:

```tsx
      {/* ── Screens (zone scenes) ── */}
      <div className="border-t border-slate-200 pt-3">
        <SceneChips item={item} onChanged={onChanged} />
      </div>

      {/* ── Background & Color ── */}
      <div className="border-t border-slate-200 pt-3">
        <ItemBackgroundPanel item={item} onChanged={onChanged} />
      </div>
```

- [ ] **Step 3: Typecheck** — `npm run typecheck:web` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/ItemEditor.tsx
git commit -m "feat(scenes): Screens section in Build Service item editor"
```

---

### Task 8: Deck badges (`ServiceDeck`)

**Files:**
- Modify: `src/renderer/src/ServiceDeck.tsx` (load config; badge + scene name in each row's subtitle at lines 96-101)

- [ ] **Step 1: Imports + config state**

Add imports:

```tsx
import { useEffect, useState } from 'react'   // extend the existing `useState` import
import type { SceneConfig } from '../../shared/zoneScenes'
import { effectiveRouting, matchScene } from '../../shared/zoneScenes'
import ZoneStripBadge from './ZoneStripBadge'
```

Inside `ServiceDeck` (after the `showAdd` state):

```tsx
  const [sceneConfig, setSceneConfig] = useState<SceneConfig | null>(null)
  useEffect(() => { void window.wf.scenesGet().then(setSceneConfig) }, [service])
```

- [ ] **Step 2: Badge in the row subtitle**

Find (`ServiceDeck.tsx:96-101`):

```tsx
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">{it.title || it.type}</div>
                <div className="truncate text-xs text-slate-600">
                  {it.type} · #{i + 1}{preview ? ` · ${preview}` : ''}
                </div>
              </div>
```

Replace with:

```tsx
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">{it.title || it.type}</div>
                <div className="flex items-center gap-1.5 truncate text-xs text-slate-600">
                  <span className="truncate">{it.type} · #{i + 1}{preview ? ` · ${preview}` : ''}</span>
                  {sceneConfig && (() => {
                    const routing = effectiveRouting(it, sceneConfig)
                    const matched = matchScene(routing, it.type, sceneConfig)
                    const name = matched === 'custom' ? 'Custom' : sceneConfig.scenes.find((s) => s.id === matched)?.name
                    return (
                      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-slate-400">
                        <ZoneStripBadge routing={routing} title={name} />
                      </span>
                    )
                  })()}
                </div>
              </div>
```

- [ ] **Step 3: Typecheck** — `npm run typecheck:web` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/ServiceDeck.tsx
git commit -m "feat(scenes): zone strip badges on service deck rows"
```

---

### Task 9: Same chips in Live Control (`ZonePanel`)

**Files:**
- Modify: `src/renderer/src/ZonePanel.tsx` (replace the "Routing for active item" section with `SceneChips`; add MANUAL pill on overridden zones)

- [ ] **Step 1: Imports + override tracking**

Add import:

```tsx
import SceneChips from './SceneChips'
```

Add local override tracking (after the existing state declarations):

```tsx
  const [overridden, setOverridden] = useState<Set<ZoneId>>(new Set())
```

Update `setOverride` and `clearOverrides` (lines 68-78) to:

```tsx
  const setOverride = (zoneId: ZoneId, mode: ZoneState['mode'] | null): void => {
    setOverridden((prev) => {
      const next = new Set(prev)
      if (mode == null) next.delete(zoneId); else next.add(zoneId)
      return next
    })
    void window.wf.zoneSetOverride(zoneId, mode).then(() =>
      window.wf.zoneGetStates().then(setZoneStates)
    )
  }

  const clearOverrides = (): void => {
    setOverridden(new Set())
    void window.wf.zoneClearOverrides().then(() =>
      window.wf.zoneGetStates().then(setZoneStates)
    )
  }
```

- [ ] **Step 2: MANUAL pill on zone rows**

In the zone-row header (next to the mode badge, `ZonePanel.tsx` lines 113-121), change the badge span block to:

```tsx
                <span className="flex items-center gap-1">
                  {overridden.has(zoneId) && (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-600">Manual</span>
                  )}
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${MODE_COLORS[mode]}`}>
                    {MODE_LABELS[mode]}
                  </span>
                </span>
```

- [ ] **Step 3: Replace the routing section with SceneChips**

Replace the entire "Routing for active item" block (`{liveItem && routing && ( … )}` — the section that now contains the header, Reset button, and `<ZoneRoutingGrid …/>`) with:

```tsx
      {/* Scene chips for the live item (same UI as Build Service) */}
      {liveItem && (
        <div className="rounded-lg border border-slate-200 bg-slate-100/70 p-2.5">
          <SceneChips
            item={liveItem}
            onChanged={() => { void window.wf.zoneGetStates().then(setZoneStates) }}
          />
        </div>
      )}
```

Then remove the now-unused `routing` state, the routing-loading `useEffect` (lines 49-58), `saveRouting`, `resetRouting`, and the now-unused `ZONE_ROUTING_DEFAULTS` / `ZoneRouting` imports. (`ZoneRoutingGrid` import can go too — `SceneChips` brings its own; keep `MODE_LABELS` import.)

**Caveat for the executor:** `liveItem` here must carry current `zoneRouting`; `LiveTools.tsx` passes the `ServiceItem` from the loaded service. After a chip tap in Live Control, the item prop's `zoneRouting` may be stale until the service reloads — `SceneChips` computes its active chip from the item prop, so after tapping, the chip highlight may lag until the parent refreshes. Acceptable for v1: the zones themselves update instantly (main re-broadcasts). Note it in the manual test.

- [ ] **Step 4: Typecheck** — `npm run typecheck:web` → PASS (this catches every removed-symbol leftover).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/ZonePanel.tsx
git commit -m "feat(scenes): scene chips in Live Control zone panel"
```

---

### Task 10: Full verification

**Files:** none

- [ ] **Step 1: Automated gates**

Run: `npm run typecheck && npm test && npm run build`
Expected: all PASS (test count grows by the new `zoneScenes` suite).

- [ ] **Step 2: Manual walkthrough** (`npm run dev`)

- [ ] Build Service → select a song → **Screens** section shows the five chips; "Lyrics TVs only" is ringed with "(default)".
- [ ] Tap "Everywhere" → deck badge strip turns all-emerald; go live → all zones show lyrics (multiview).
- [ ] Advanced ▾ → change Z2 to Black → chips show **Custom**; badge shows the black cell; "Reset to default for this type" restores the default chip.
- [ ] ✎ Edit scenes → rename "Focus" to "Communion" → chips relabel; tap-cycle a zone pill in a scene → its strip updates; Add scene / delete scene / Reset to starter five all work; Done persists (reopen to confirm).
- [ ] Set songs' default to "Everywhere" in the editor → a song with NO stamped routing now shows "Everywhere (default)" and its zones follow when live; a previously-stamped song is unchanged.
- [ ] Live Control → same chips appear for the live item; tapping one re-routes zones immediately; per-zone override buttons still work and show the amber **Manual** pill; Clear overrides clears pills.
- [ ] Existing services built before this feature look and behave unchanged.

- [ ] **Step 3: Commit any verification tweaks**

```bash
git add -A
git commit -m "fix(scenes): verification tweaks"
```

*(Packaging: after the user confirms the walkthrough, bump the version and `npm run dist` per the usual flow — not part of this plan.)*

---

## Self-Review

- **Spec coverage:** scene model + Z4 rule (Task 1); starter palette + type defaults (Task 1); settings storage, seed-on-missing, corrupt-JSON fallback (Tasks 1-2); IPC/preload/mock (Task 2); palette-aware `computeZoneStates` with override precedence untouched (Task 2 Step 3); `ZoneStripBadge` (Task 3); Advanced grid shared component (Task 4); scene editor incl. rename/tap-cycle/add/delete/reset/typeDefaults + delete-reverts-default (Task 5); chips + Custom + "(default)" + stamp-on-tap + reset-to-default (Task 6); ItemEditor Screens section above Background (Task 7); deck badges (Task 8); Live Control chips + MANUAL pill (Task 9); validation rules (Task 1 `validateSceneConfig`, Task 2 `scenesSet` throw, Task 5 inline errors); testing per spec (Tasks 1, 10). No gaps.
- **Placeholders:** none — every code step shows full code; the single executor caveat (stale chip highlight in Live Control) is a documented behavior note, not an unfinished step.
- **Type consistency:** `SceneDef.zones` uses string keys `'1'|'2'|'3'` everywhere (JSON-faithful); `expandScene`/`effectiveRouting`/`matchScene`/`defaultRoutingFor`/`parseSceneConfig`/`validateSceneConfig`/`starterConfig` names match across Tasks 1, 2, 5, 6, 8; `scenesGet`/`scenesSet` match preload (Task 2) and all callers (Tasks 5, 6, 8); `ZoneRoutingGrid` props `{routing, onChange}` match both call sites (Tasks 6, 9); `MODE_LABELS` exported from `ZoneRoutingGrid` and imported by `ZonePanel` (Tasks 4, 9).
