# Flat Shell Redesign (Phase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe WorshipFlow into a flat, Presenter-style shell — checkerboard dark base, top bar with centered tabs + output status, and a persistent left service rail with a pinned live output preview — while every feature keeps working.

**Architecture:** A new `AppShell` (top bar + left rail + main content) replaces `Operator`. A `ServiceContext` makes the loaded service app-level so the rail/preview are consistent on every tab. New components reuse `SlideThumb`, `liveActions.sendItemLive`, and the theme helpers. `LiveView` and `ServiceBuilder` switch from their own service state to the shared context.

**Tech Stack:** Electron + React 18 + TypeScript, Tailwind v3, Vite.

**Verification note:** No unit-test framework. UI verified with `npm run typecheck` + booting (`npm run dev`) + manual visual check (this is the project's established pattern). Commits to current branch (`master`), consistent with the session. Build inline.

---

### Task 1: Flat theme — checkerboard background + flatten chrome

**Files:**
- Modify: `src/renderer/src/assets/main.css`

- [ ] **Step 1: Set the checkerboard app background** — replace the `body` background rule

Find the `body { background: var(--wf-bg-primary); … }` rule and change its background to the checkerboard (keep the other properties):
```css
body {
  background-color: #141414;
  background-image:
    linear-gradient(45deg, #0c0c0c 25%, transparent 25%, transparent 75%, #0c0c0c 75%),
    linear-gradient(45deg, #0c0c0c 25%, transparent 25%, transparent 75%, #0c0c0c 75%);
  background-size: 22px 22px;
  background-position: 0 0, 11px 11px;
  background-attachment: fixed;
  color: var(--wf-text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

- [ ] **Step 2: Flatten the animated fallback** — the operator chrome should not animate

Replace the `.wf-fallback` rule body with a flat dark surface (remove the `wf-drift` animation usage):
```css
.wf-fallback {
  background: #15151a;
}
```

- [ ] **Step 3: Typecheck + boot**

Run: `cd C:\Dev\worshipflow; npm run typecheck` → no errors.
Run: `npm run dev` → app boots; the background is now the checkerboard texture. (Full shell comes in later tasks.)

---

### Task 2: ServiceContext — app-level active service

**Files:**
- Create: `src/renderer/src/ServiceContext.tsx`

- [ ] **Step 1: Create the context + provider**

```tsx
import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { ServiceFull, ServiceSummary } from '../../shared/types'

interface ServiceCtx {
  services: ServiceSummary[]
  activeServiceId: number | null
  activeService: ServiceFull | null
  selectService: (id: number) => void
  reloadActiveService: () => void
  refreshServices: () => void
}

const Ctx = createContext<ServiceCtx | null>(null)

export function ServiceProvider({ children }: { children: ReactNode }): JSX.Element {
  const [services, setServices] = useState<ServiceSummary[]>([])
  const [activeServiceId, setActiveServiceId] = useState<number | null>(null)
  const [activeService, setActiveService] = useState<ServiceFull | null>(null)

  const refreshServices = (): void => { window.wf.servicesList().then(setServices) }
  const reloadActiveService = (): void => {
    if (activeServiceId != null) window.wf.serviceGet(activeServiceId).then(setActiveService)
  }
  const selectService = (id: number): void => {
    setActiveServiceId(id)
    window.wf.setActiveService(id)
    window.wf.serviceGet(id).then(setActiveService)
  }

  useEffect(() => {
    window.wf.servicesList().then((list) => {
      setServices(list)
      if (list.length > 0) selectService(list[0].id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Ctx.Provider value={{ services, activeServiceId, activeService, selectService, reloadActiveService, refreshServices }}>
      {children}
    </Ctx.Provider>
  )
}

export function useService(): ServiceCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useService must be used within ServiceProvider')
  return v
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` → no errors.

---

### Task 3: OutputPreview — miniature live projector

**Files:**
- Create: `src/renderer/src/OutputPreview.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useState } from 'react'
import type { LiveState } from '../../shared/types'
import { getTheme, resolveColors, staticBackgroundCss, FONT_FAMILY } from '../../shared/themes'

function OutputPreview(): JSX.Element {
  const [s, setS] = useState<LiveState | null>(null)
  useEffect(() => {
    const off = window.wf.onState(setS)
    window.wf.getState().then(setS)
    return off
  }, [])

  const mode = s?.mode ?? 'lyrics'
  const theme = getTheme(s?.slideTheme)
  const colors = resolveColors(theme, s?.slideThemeColors ?? null)
  const bg = mode === 'black' ? '#000'
    : theme.kind === 'static' ? staticBackgroundCss(theme, colors)
    : `linear-gradient(120deg, ${colors.primary}, ${colors.secondary})`
  const text = mode === 'black' ? '' : mode === 'logo' ? '✝ SNOW HILL' : (s?.line ?? '')

  return (
    <div className="p-2">
      <div className="mb-1 text-[10px] font-medium text-blue-400">Main Audience Output</div>
      <div
        className="flex aspect-video w-full items-center justify-center overflow-hidden rounded border border-white/10 px-2 text-center"
        style={{ background: bg }}
      >
        <span className="line-clamp-3 text-[9px] font-semibold leading-tight"
          style={{ fontFamily: FONT_FAMILY[theme.font], color: colors.text }}>
          {text}
        </span>
      </div>
      <div className="mt-1.5 flex justify-center gap-4 text-slate-400">
        <button onClick={() => window.wf.sendIntent('black')} title="Black" className="hover:text-white">■</button>
        <button onClick={() => window.wf.sendIntent('logo')} title="Logo" className="hover:text-white">✝</button>
        <button onClick={() => window.wf.sendIntent('lyrics')} title="Clear / lyrics" className="hover:text-white">▦</button>
      </div>
    </div>
  )
}

export default OutputPreview
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` → no errors.

---

### Task 4: TopBar — logo, centered tabs, status

**Files:**
- Create: `src/renderer/src/TopBar.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useState } from 'react'
import type { AppInfo } from '../../shared/types'
import type { View } from './AppShell'

const TABS: { id: View; label: string; live?: boolean }[] = [
  { id: 'live', label: 'Live', live: true },
  { id: 'service', label: 'Services' },
  { id: 'songs', label: 'Songs' },
  { id: 'scripture', label: 'Scripture' }
]

function TopBar({ view, setView }: { view: View; setView: (v: View) => void }): JSX.Element {
  const [outputs, setOutputs] = useState(0)
  useEffect(() => {
    const load = (): void => { window.wf.getInfo().then((i: AppInfo) => setOutputs(i.outputs)) }
    load()
    const t = setInterval(load, 2000)
    return () => clearInterval(t)
  }, [])

  return (
    <header className="flex items-center gap-3 border-b border-white/[0.07] bg-[#141418] px-4 py-2.5">
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500 text-sm font-bold text-[#06270f]">✝</div>
      <span className="text-sm font-medium text-white">WorshipFlow</span>
      <div className="flex flex-1 justify-center gap-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setView(t.id)}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              view === t.id ? 'bg-[#26262c] text-white' : 'text-slate-400 hover:text-slate-200'
            }`}>
            {t.live && <span className={`h-1.5 w-1.5 rounded-full ${outputs > 0 ? 'bg-emerald-400' : 'bg-slate-600'}`} />}
            {t.label}
          </button>
        ))}
      </div>
      <span className={`text-[11px] font-medium ${outputs > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
        {outputs > 0 ? `● ${outputs} output${outputs === 1 ? '' : 's'}` : '○ no output'}
      </span>
      <button onClick={() => window.wf.stageOpen()} title="Open stage display"
        className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-white/[0.06] hover:text-slate-200">
        ✝ Stage
      </button>
    </header>
  )
}

export default TopBar
```

- [ ] **Step 2: Typecheck** (will error until `AppShell` exports `View` in Task 6 — expected; proceed)

Run: `npm run typecheck`
Expected: error about `./AppShell` `View` not found. Continue to later tasks; it resolves in Task 6.

---

### Task 5: ServiceRail — persistent service list + output preview

**Files:**
- Create: `src/renderer/src/ServiceRail.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useState } from 'react'
import type { LiveState, ServiceItem } from '../../shared/types'
import { useService } from './ServiceContext'
import SlideThumb from './SlideThumb'
import OutputPreview from './OutputPreview'
import { sendItemLive } from './liveActions'

const ICON: Record<ServiceItem['type'], string> = {
  song: '🎵', scripture: '📖', text: '📝', countdown: '⏱', image: '🖼', welcome: '👋', ticker: '📰'
}

function ServiceRail(): JSX.Element {
  const { activeService } = useService()
  const [live, setLive] = useState<LiveState | null>(null)
  useEffect(() => {
    const off = window.wf.onState(setLive)
    window.wf.getState().then(setLive)
    return off
  }, [])
  const liveId = live?.liveServiceItemId ?? null

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-white/[0.07] bg-[#121216]">
      <div className="border-b border-white/[0.06] px-3 py-2">
        {activeService ? (
          <>
            <div className="text-[10px] text-slate-500">{activeService.service_date ?? 'Service'}</div>
            <div className="truncate text-xs font-medium text-slate-200">{activeService.name}</div>
          </>
        ) : (
          <div className="text-xs text-slate-500">No service loaded</div>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-auto p-1.5">
        {!activeService || activeService.items.length === 0 ? (
          <p className="px-2 py-4 text-center text-[11px] text-slate-600">No items — pick a service in the Services tab.</p>
        ) : (
          activeService.items.map((it) => (
            <button key={it.id} onClick={() => sendItemLive(it)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                liveId === it.id ? 'bg-blue-600/20 ring-1 ring-blue-500/40' : 'hover:bg-white/[0.05]'
              }`}>
              <div className="w-9 shrink-0">
                <SlideThumb label="" itemStyle={it.style} serviceTheme={activeService.theme} serviceColors={activeService.themeColors} />
              </div>
              <span className="text-xs">{ICON[it.type]}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">{it.title}</span>
              {liveId === it.id && <span className="text-[9px] font-bold text-emerald-400">●</span>}
            </button>
          ))
        )}
      </div>
      <div className="border-t border-white/[0.06]">
        <OutputPreview />
      </div>
    </aside>
  )
}

export default ServiceRail
```

- [ ] **Step 2: Typecheck** (same `View` error as Task 4 until Task 6; otherwise clean)

---

### Task 6: AppShell — assemble the shell; replace Operator

**Files:**
- Create: `src/renderer/src/AppShell.tsx`
- Modify: `src/renderer/src/App.tsx`
- Delete: `src/renderer/src/Operator.tsx`

- [ ] **Step 1: Create `AppShell.tsx`**

```tsx
import { useState } from 'react'
import { ServiceProvider } from './ServiceContext'
import TopBar from './TopBar'
import ServiceRail from './ServiceRail'
import LiveView from './LiveView'
import ServiceBuilder from './ServiceBuilder'
import SongLibrary from './SongLibrary'
import ScriptureLookup from './ScriptureLookup'

export type View = 'live' | 'service' | 'songs' | 'scripture'

function AppShell(): JSX.Element {
  const [view, setView] = useState<View>('live')
  return (
    <ServiceProvider>
      <div className="flex h-screen flex-col text-slate-100">
        <TopBar view={view} setView={setView} />
        <div className="flex min-h-0 flex-1">
          <ServiceRail />
          <main className="min-h-0 flex-1 overflow-hidden">
            {view === 'live' ? <LiveView />
              : view === 'service' ? <ServiceBuilder />
              : view === 'songs' ? <SongLibrary />
              : <ScriptureLookup />}
          </main>
        </div>
      </div>
    </ServiceProvider>
  )
}

export default AppShell
```

- [ ] **Step 2: Point `App.tsx` at `AppShell`**

In `src/renderer/src/App.tsx`, replace the `Operator` import and its render with `AppShell`. Keep the hash routing for `Output`/`Stage`. Result:
```tsx
import Output from './Output'
import Stage from './Stage'
import AppShell from './AppShell'

function App(): JSX.Element {
  const hash = window.location.hash
  if (hash.startsWith('#/output')) return <Output />
  if (hash.startsWith('#/stage')) return <Stage />
  return <AppShell />
}

export default App
```
(Remove the now-unused theme `useState`/`useEffect` and `ThemeType` export from `App.tsx` only if nothing else imports them; `LiveView` currently imports `ThemeType` from `App` — if so, move `export type ThemeType = …` to remain exported in `App.tsx`, or change LiveView in Task 7 to drop it. Simplest: keep the `ThemeType` export line in `App.tsx` and remove only the unused theme state/effect.)

- [ ] **Step 3: Delete `Operator.tsx`**

```bash
git rm src/renderer/src/Operator.tsx
```
(Or delete the file; it is no longer imported.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Fix fallout: any remaining import of `./Operator`; `LiveView`'s `ThemeType` import from `App` (keep the export in `App.tsx`); `TopBar`/`ServiceRail` `View` import now resolves. Re-run until clean.

- [ ] **Step 5: Boot + visual check**

Run: `npm run dev`. The flat shell appears: checkerboard base, top bar with centered tabs + output status, left rail showing the first service's items with the output preview pinned below. Switching tabs keeps the rail. Clicking a rail item sends it live; the preview + Black/Logo/Clear update.

---

### Task 7: LiveView consumes ServiceContext

**Files:**
- Modify: `src/renderer/src/LiveView.tsx`

- [ ] **Step 1: Use the shared active service**

`LiveView` currently holds its own `services`, `activeServiceId`, `service` state and a `pickService`. Replace those with the context so it shares the rail's service:
```tsx
import { useService } from './ServiceContext'
// inside component:
const { services, activeServiceId, activeService: service, selectService, reloadActiveService } = useService()
```
Remove the local `const [services, setServices] = …`, `const [activeServiceId, setActiveServiceId] = …`, `const [service, setService] = …`, the `servicesList()`/`serviceGet()` calls in its mount effect, and the local `pickService` (replace its uses with `selectService`). Replace any `window.wf.serviceGet(...).then(setService)` reload calls with `reloadActiveService()`. Keep all the live-control UI (transport, fonts, features, OBS, stage message, etc.) unchanged.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`. Resolve references to removed state (use the context values). Re-run until clean.

- [ ] **Step 3: Boot + check**

Run: `npm run dev`. Live tab works as before, but its service selection is shared with the rail (selecting in one reflects in the other).

---

### Task 8: ServiceBuilder consumes ServiceContext

**Files:**
- Modify: `src/renderer/src/ServiceBuilder.tsx`

- [ ] **Step 1: Use the shared active service**

`ServiceBuilder` currently holds `services`, `openId`, `service`. Switch to the context so opening a service sets the app-level active one (so the rail follows along):
```tsx
import { useService } from './ServiceContext'
// inside component:
const { services, activeServiceId: openId, activeService: service, selectService, reloadActiveService, refreshServices } = useService()
```
- Remove the local `services`/`openId`/`service` state and the `refreshServices`/`reload`/`open` helpers that duplicate the context. Map: `open(id)` → `selectService(id)`; `reload()` → `reloadActiveService()`; `refreshServices()` → context's `refreshServices`.
- After `create`, import-*, and delete actions, call `refreshServices()` and `selectService(newId)` / `reloadActiveService()` as the old code did with its local versions.
- Keep `songs`, `selectedId`, `live`, `confirmDelete`, `importing`, the deck, edit panel, and all handlers. `addCard`/`addSong`/`delItem` already call `reload()` → now `reloadActiveService()`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`. Resolve removed-state references. Re-run until clean.

- [ ] **Step 3: Boot + check**

Run: `npm run dev`. Services tab: opening a service loads it into the rail; building/editing/deleting cards updates the rail live; the deck and edit panel work as before.

---

### Task 9: Final verification pass

- [ ] **Step 1: Full typecheck** — `npm run typecheck` → no errors.
- [ ] **Step 2: Cold boot** — `npm run dev` boots clean against the existing DB.
- [ ] **Step 3: Acceptance (per spec):**
  - Flat checkerboard base + flat top bar/rail on every tab.
  - Top bar: centered tabs, green Live dot + output status reflect live outputs.
  - Left rail shows the loaded service on every tab; clicking an item sends it live; the output preview mirrors the projector in real time; Black/Logo/Clear work.
  - Regression: deck building, song editing (incl. inline lyrics), OBS panel, CCLI, tablet, PowerPoint import, scripture lookup all still work.

---

## Self-Review Notes (addressed)

- **Spec coverage:** checkerboard + flat theme (Task 1), top bar w/ tabs + status (Task 4), persistent rail + output preview + Black/Logo/Clear (Tasks 3, 5), app-level service context (Task 2) consumed by shell/LiveView/ServiceBuilder (Tasks 6–8), AppShell replaces Operator (Task 6). All covered.
- **Naming:** `ServiceProvider`/`useService`; context fields `services`/`activeServiceId`/`activeService`/`selectService`/`reloadActiveService`/`refreshServices`; `View` type exported from `AppShell` and imported by `TopBar`. Consistent across tasks.
- **Cross-file dependency:** `TopBar`/`ServiceRail` import `View`/context before Task 6 wires `AppShell` — flagged as expected typecheck errors that resolve at Task 6.
- **Risk note:** Tasks 7–8 (LiveView/ServiceBuilder refactor to context) are the highest-risk; each is verified by typecheck + boot before moving on. If a refactor balloons, the rail/shell (Tasks 1–6) already deliver the visual redesign and can ship independently.
- **Out of scope (held):** slide grid (Phase 2), per-tab content rework (Phase 3), Media/Slides tabs, item section grouping.
