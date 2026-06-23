# Live Slide-Grid + Tools Panel (Phase 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Live tab a click-a-slide grid — each service item shows its slides as thumbnails with real lyric text, and clicking one sends that exact slide live — with the existing controls reorganized into a right tools panel.

**Architecture:** Main process gains a pure `computeItemSlides(item)` (reusing a shared `songLines` helper) exposed via `wf:service:slides`, plus a `wf:live:goLiveAt(itemId, index)`. The renderer's `LiveView` becomes `<SlideGrid/>` + `<LiveTools/>`; `SlideGrid` renders thumbnails (reusing `SlideThumb`) and highlights the live one from `LiveState`.

**Tech Stack:** Electron + React 18 + TypeScript, Tailwind v3, Vite.

**Verification note:** No unit-test framework. Pure logic verified with a throwaway Node check; UI via `npm run typecheck` + boot + manual. Commits to current branch (`master`). Build inline.

---

### Task 1: Backend — item-slide computation + `wf:service:slides`

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Extract a shared `songLines` helper** (place above `doLoadSong`)

```ts
function songLines(full: SongFull): string[] {
  const sorted = [...full.sections].sort((a, b) => a.ordinal - b.ordinal)
  const ordered = full.arrangement && full.arrangement.length > 0
    ? full.arrangement.map((i) => sorted[i]).filter(Boolean)
    : sorted
  const rawLines: string[] = []
  for (const section of ordered) {
    for (const raw of section.lyrics.split('\n')) {
      const line = raw.trim()
      if (line) rawLines.push(line)
    }
  }
  return groupLines(rawLines, full.linesPerSlide ?? 2)
}
```
Add `SongFull` to the `from '../shared/types'` import if not present.

- [ ] **Step 2: Use it in `doLoadSong`** — replace the inline ordering/grouping block

In `doLoadSong`, replace the lines that build `sorted`/`ordered`/`rawLines`/`groupLines(...)` and set `liveSong` with:
```ts
  liveSong = { title: full.title, lines: songLines(full), background: full.background ?? null }
```
(Keep the rest of `doLoadSong`: `liveSongId`, `liveScriptureRef = null`, `liveBgFit`, `liveSongMeta`, `hmsLoadedAt`, `verseNumber`, `state.mode`/`index`, `logServiceEvent`, `recordSongUsage`.)

- [ ] **Step 3: Add `computeItemSlides`** (place near `handleTabletLoadItem`)

```ts
// Pure: the slides an item would show, without going live (for the slide grid).
async function computeItemSlides(item: ServiceItem): Promise<string[]> {
  if (item.type === 'song' && item.ref_id != null) {
    const full = await getSong(item.ref_id)
    return full ? songLines(full) : []
  }
  if (item.type === 'scripture') {
    const ref = item.payload.reference as string
    if (!ref) return []
    const result = bibleTranslation === 'kjv' ? lookupScripture(ref) : await fetchScripture(ref, bibleTranslation)
    if (!result.ok || !result.verses) return []
    return result.verses.length === 1 ? [result.verses[0].text] : result.verses.map((v) => `${v.n}  ${v.text}`)
  }
  if (item.type === 'text' || item.type === 'ticker') {
    const title = (item.payload.title as string) ?? ''
    const body = (item.payload.body as string) ?? (item.payload.text as string) ?? ''
    const lines: string[] = []
    if (title) lines.push(title)
    body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).forEach((b) => lines.push(b))
    return lines.length ? lines : (title ? [title] : [])
  }
  if (item.type === 'countdown' || item.type === 'welcome') {
    const secs = (item.payload.seconds as number) ?? 0
    return [`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`]
  }
  if (item.type === 'image') return ['🖼']
  return []
}
```

- [ ] **Step 4: Add the `wf:service:slides` IPC** (near the other `wf:services:*` handlers)

```ts
ipcMain.handle('wf:service:slides', async (_e, serviceId: number): Promise<{ id: number; slides: string[] }[]> => {
  const svc = getService(serviceId)
  if (!svc) return []
  const out: { id: number; slides: string[] }[] = []
  for (const item of svc.items) {
    if (itemCanGoLive(item)) out.push({ id: item.id, slides: await computeItemSlides(item) })
  }
  return out
})
```

- [ ] **Step 5: Add the preload method** (next to `serviceReorder`)

```ts
  serviceSlides: (serviceId: number): Promise<{ id: number; slides: string[] }[]> =>
    ipcRenderer.invoke('wf:service:slides', serviceId),
```

- [ ] **Step 6: Typecheck + Node check of `songLines` grouping**

Run: `cd C:\Dev\worshipflow; npm run typecheck` → no errors.
Create `check-slides.mjs`:
```js
function groupLines(lines, per){ const out=[]; for(let i=0;i<lines.length;i+=per) out.push(lines.slice(i,i+per).join('\n')); return out }
console.log(JSON.stringify(groupLines(['a','b','c','d','e'], 2)))
```
Run: `node check-slides.mjs` → `["a\nb","c\nd","e"]`. Then `Remove-Item check-slides.mjs`.
(If `groupLines` in index.ts differs, mirror its real signature — confirm by reading it.)

---

### Task 2: Backend — `wf:live:goLiveAt`

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add the IPC** (near `handleTabletLoadItem` / live IPCs)

```ts
ipcMain.handle('wf:live:goLiveAt', async (_e, itemId: number, slideIndex: number) => {
  await handleTabletLoadItem(itemId)  // loads the item live (index 0) + broadcasts + resolves theme
  const last = liveSong.lines.length - 1
  state.index = Math.max(0, Math.min(slideIndex, last < 0 ? 0 : last))
  broadcast()
})
```

- [ ] **Step 2: Add the preload method** (next to `liveSetItemId`)

```ts
  liveGoLiveAt: (itemId: number, slideIndex: number): Promise<void> =>
    ipcRenderer.invoke('wf:live:goLiveAt', itemId, slideIndex),
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` → no errors.

---

### Task 3: SlideGrid component

**Files:**
- Create: `src/renderer/src/SlideGrid.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useRef, useState } from 'react'
import type { LiveState, ServiceItem } from '../../shared/types'
import { useService } from './ServiceContext'
import SlideThumb from './SlideThumb'
import { canGoLive } from './liveActions'

const ICON: Record<ServiceItem['type'], string> = {
  song: '🎵', scripture: '📖', text: '📝', countdown: '⏱', image: '🖼', welcome: '👋', ticker: '📰'
}

function SlideGrid(): JSX.Element {
  const { activeService } = useService()
  const [live, setLive] = useState<LiveState | null>(null)
  const [slides, setSlides] = useState<Record<number, string[]>>({})
  const liveRowRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const off = window.wf.onState(setLive)
    window.wf.getState().then(setLive)
    return off
  }, [])

  useEffect(() => {
    if (activeService == null) { setSlides({}); return }
    window.wf.serviceSlides(activeService.id).then((rows) => {
      const map: Record<number, string[]> = {}
      rows.forEach((r) => { map[r.id] = r.slides })
      setSlides(map)
    })
  }, [activeService?.id, activeService?.items.length])

  useEffect(() => {
    liveRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [live?.liveServiceItemId])

  const liveItemId = live?.liveServiceItemId ?? null
  const liveIndex = live?.index ?? -1

  if (!activeService) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-500">No service loaded — pick one in the Services tab.</div>
  }

  const items = activeService.items.filter(canGoLive)

  return (
    <div className="h-full min-h-0 space-y-3 overflow-auto p-3">
      {items.length === 0 && <p className="py-8 text-center text-sm text-slate-500">This service has no go-live items yet.</p>}
      {items.map((it) => {
        const its = slides[it.id] ?? ['']
        const isLiveItem = liveItemId === it.id
        return (
          <div key={it.id} ref={isLiveItem ? liveRowRef : null} className="rounded-lg border border-white/[0.07] bg-[#1a1a1d] p-2.5">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-200">
              <span>{ICON[it.type]}</span>
              <span className="truncate">{it.title}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {its.map((slideText, idx) => {
                const isLiveSlide = isLiveItem && liveIndex === idx
                return (
                  <button
                    key={idx}
                    onClick={() => window.wf.liveGoLiveAt(it.id, idx)}
                    className={`overflow-hidden rounded-md transition-shadow ${isLiveSlide ? 'ring-2 ring-blue-500' : 'ring-1 ring-white/10 hover:ring-white/30'}`}
                    title={`Go live: slide ${idx + 1}`}
                  >
                    <SlideThumb label={slideText} itemStyle={it.style} serviceTheme={activeService.theme} serviceColors={activeService.themeColors} />
                    <div className="bg-[#0e0e11] px-1.5 py-0.5 text-left text-[9px] text-slate-500">{idx + 1}</div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default SlideGrid
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` → no errors.

---

### Task 4: LiveTools — the right tools panel (extract controls from LiveView)

**Files:**
- Create: `src/renderer/src/LiveTools.tsx`
- Reference (source of the control JSX/state to move): `src/renderer/src/LiveView.tsx`

`LiveTools` holds the controls currently in `LiveView`. Move (cut) the relevant state, handlers, and JSX from `LiveView` into `LiveTools`, organized into sections. This is a mechanical move; keep each control's existing logic intact.

- [ ] **Step 1: Create `LiveTools.tsx` shell with the section structure**

```tsx
import { useEffect, useState } from 'react'
import type { LiveState } from '../../shared/types'
import ObsPanel from './ObsPanel'

function LiveTools(): JSX.Element {
  const [live, setLive] = useState<LiveState | null>(null)
  const [showMore, setShowMore] = useState(false)
  useEffect(() => {
    const off = window.wf.onState(setLive)
    window.wf.getState().then(setLive)
    return off
  }, [])

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-auto border-l border-white/[0.07] bg-[#15151a] p-3">
      {/* 1. Stage message + presets — MOVE from LiveView */}
      {/* 2. Quick Scripture + Bible KJV/WEB/BBE — MOVE from LiveView */}
      {/* 3. Font size — MOVE from LiveView */}
      {/* 4. Auto-advance (+ loop) — MOVE from LiveView */}

      <ObsPanel />

      <button onClick={() => setShowMore((v) => !v)} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.08]">
        {showMore ? '▴ Less' : '▾ More'}
      </button>
      {showMore && (
        <div className="space-y-3">
          {/* Hymn timer · Verse # · Service log · Keyboard shortcuts · Displays · Tablet URL — MOVE from LiveView */}
        </div>
      )}
    </aside>
  )
}

export default LiveTools
```

- [ ] **Step 2: Move the control state + handlers from `LiveView` into `LiveTools`**

From `LiveView`, cut these state hooks and their handlers/effects into `LiveTools` (and the `info`/`live`/`tabletUrl`/`serviceLog` they depend on):
`stageMsg`, `msgSent`, `presets`, `editingPresets`, `newPreset` (+ `addPreset`/`deletePreset`/`editPreset`/`sendStageMessage`/`clearStageMessage` + the persist effect + the clear-on-`live.stageMessage` effect); `scriptureRef` (+ `quickScripture`); `bibleTranslation`; `autoAdvanceSecs`, `autoAdvanceLoop`; `info` (+ `getInfo` calls for displays); `tabletUrl` (+ `getTabletUrl`); `showCheatSheet`; `serviceLog`; `autoAdvanceRunning`/`hmsElapsedSecs` derived values. Drop the `theme`/`setThemeLocal`/`appTheme` operator-theme state and its JSX entirely (the flat look replaces it).

- [ ] **Step 3: Move the matching JSX sections** into the `LiveTools` slots

Paste each control's existing JSX from `LiveView` into its slot above: Stage message + presets block → slot 1; Quick Scripture input + the Bible `kjv/web/bbe` buttons → slot 2; the Text-size block → slot 3; the Auto-Advance block (with the Loop checkbox) → slot 4; and Hymn timer, Verse #, Service-log viewer, Keyboard-shortcuts cheat sheet, Displays info, and the Tablet Remote URL → into the `More` block. Delete the operator-theme `Theme` selector JSX.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`. Resolve references (LiveTools must import the types/helpers each moved control used). Re-run until clean.

---

### Task 5: LiveView becomes the grid + tools layout

**Files:**
- Modify: `src/renderer/src/LiveView.tsx`

- [ ] **Step 1: Slim `LiveView` to the layout + keyboard handler**

Replace `LiveView`'s body (after removing the controls moved to `LiveTools` in Task 4) with:
```tsx
import { useEffect } from 'react'
import SlideGrid from './SlideGrid'
import LiveTools from './LiveTools'

function LiveView(): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.code === 'Space' || e.code === 'ArrowRight') { e.preventDefault(); window.wf.sendIntent('next') }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); window.wf.sendIntent('prev') }
      else if (e.key.toLowerCase() === 'b') window.wf.sendIntent('black')
      else if (e.key.toLowerCase() === 'l') window.wf.sendIntent('logo')
      else if (e.key.toLowerCase() === 's') window.wf.sendIntent('lyrics')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full min-h-0">
      <SlideGrid />
      <LiveTools />
    </div>
  )
}

export default LiveView
```
Remove all now-unused imports, the `ThemeType` import from `./App`, the `Btn` helper if unused, and any leftover state. (The old service-order panel, operator preview, now-playing list, and transport block are deleted — the rail + grid + keyboard replace them.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`. Remove any unused imports/vars it flags. Re-run until clean.

- [ ] **Step 3: Boot + full visual check**

Run: `npm run dev`. Live tab shows the slide grid (each item a panel of thumbnails with lyric text) + the right tools panel. Clicking a thumbnail sends that slide live (blue outline moves; rail output preview updates). Keyboard Space/←/→/B/L/S work. The tools panel's stage message + presets, quick scripture + bible switch, font, auto-advance work; OBS works; "More ▾" reveals hymn timer / verse # / service log / shortcuts / displays / tablet URL.

---

### Task 6: Final verification pass

- [ ] **Step 1: Full typecheck** — `npm run typecheck` → no errors.
- [ ] **Step 2: Cold boot** — `npm run dev` boots clean.
- [ ] **Step 3: Acceptance (per spec):**
  - Live tab = slide grid; thumbnails show real lyric text on theme backgrounds; click → go live at that exact slide; blue outline tracks the live slide; keyboard advance works.
  - Tools panel: all kept controls function; no operator-theme switcher remains.
  - Regression: rail, output preview, Services deck (incl. inline song editing), Songs, Scripture, OBS, CCLI, tablet, imports all still work.

---

## Self-Review Notes (addressed)

- **Spec coverage:** slide grid + click-to-go-live-at-slide (Tasks 2–3, 5), item-slide computation + `wf:service:slides` (Task 1), `goLiveAt` (Task 2), reorganized tools panel with "More ▾" + theme-switcher removal (Tasks 4–5), LiveView reorganization (Task 5). All covered.
- **Naming:** `songLines`, `computeItemSlides`, IPC `wf:service:slides` / `wf:live:goLiveAt`, preload `serviceSlides` / `liveGoLiveAt`; `SlideGrid`, `LiveTools`. Consistent across tasks.
- **Reuse:** `SlideThumb` (slide text as label), `canGoLive` (`liveActions`), `ServiceContext`, `ObsPanel`, theme helpers — no duplication of those.
- **Risk note:** Task 4 (extracting controls into `LiveTools`) is a large mechanical move; verified by typecheck after each move. Tasks 1–3 (backend + grid) are additive and low-risk; if Task 4/5 balloon, the grid already works alongside the old controls.
