# Visual Redesign — Live Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Live tab — the screen an operator actually runs a real service from — to the confirmed dark navy/graphite/blue/emerald palette. This is stage 3 of the design spec's rollout order (`docs/superpowers/specs/2026-08-11-visual-redesign-design.md`, Section 4): "the screen the operator actually runs services from, so it gets the most scrutiny and is proven out before the lower-traffic screens."

**Architecture:** Same mechanical migration as the Foundation and TopBar+Home stages — replace raw light-theme utility classes (`bg-white`, `border-slate-200`, `text-slate-900`, etc.) with the already-shipped semantic tokens (`bg-app`/`bg-panel`/`bg-panel-raised`, `border-border`/`border-border-strong`, `text-content-primary`/`-secondary`/`-tertiary`) and the shared `.btn*`/`.card*` classes from `main.css`. No behavior/logic changes — every `useState`/`useEffect`/handler/prop stays byte-identical, only `className` strings change.

**Scope correction vs. the design spec's literal wording:** the spec names "ZonePanel.tsx/ZoneLiveGrid.tsx" for this stage, but tracing actual imports shows `ZonePanel.tsx` only renders inside `src/renderer/src/setup/ScreensZonesTab.tsx` (the Setup tab, stage 6 — not touched here) and `ZoneLiveGrid.tsx` only renders there too (via Setup's interactive pin grid). The Live tab's actual zone-status widget is `src/renderer/src/zones/LiveZoneStatus.tsx` (rendered from `ServiceRail.tsx`, the Live tab's persistent left rail), which this plan covers instead. `ServiceRail.tsx` itself — the loaded-service item list + zone status + Looks panel that lives in `AppShell.tsx` alongside the Live view whenever `view === 'live'` — is also in scope even though the spec doesn't name it explicitly, since it's the Live tab's own chrome, not a separate stage.

**One shared component gets touched early, deliberately:** `ZoneTrackToggle.tsx` (Task 7) is shared between `ZonePinPicker.tsx` (Live tab, in scope) and `ZonePanel.tsx` (Setup, not yet migrated). Migrating it now will make Setup's zone-track toggle render in dark colors too, ahead of Setup's own stage — this is the same "shared infrastructure updates once, ripples everywhere" pattern the Foundation stage's `main.css` classes already established (e.g. `.btn-primary` already renders dark on every screen, migrated or not). Accept this; it's expected, not a bug to fix later.

**Tech Stack:** React, Tailwind CSS v3 (tokens from the Foundation stage).

---

## Conversion rules (same as the TopBar+Home stage — reapplied here)

| Old (light theme) | New (dark theme) |
|---|---|
| `bg-white`, `bg-[#f4f6f9]` (panels/rails) | `bg-panel` |
| `bg-[#e9ecf1]` (page-level neutral chip background) | `bg-app` |
| `border-slate-200`, `border-slate-300` | `border-border` |
| `ring-slate-200` (ring-based borders) | `ring-border` |
| `text-slate-900` | `text-content-primary` |
| `text-slate-500`, `text-slate-600`, `text-slate-700` | `text-content-secondary` (or `text-content-primary` where the current shade is clearly the more prominent/high-contrast one in context — noted per-task below) |
| `text-slate-400` on a decorative/icon-only element (search icon, delete-X icon, chevron) | `text-content-tertiary` |
| `text-slate-400` on real word/sentence content (empty-state messages, mode labels, helper captions) | `text-content-secondary` — `text-content-tertiary` (#6f6858 on `#131a29`/`bg-panel`) computes to ~3.1:1, below WCAG AA's 4.5:1 for normal text; reserve the tertiary tier for icon glyphs and disabled/placeholder inputs (its original design intent per the Foundation stage's token table), not for anything a screen reader would read as content. Caught mid-Task-1 by code review on ServiceRail's "No items" message — corrected here and in every other task below before they were implemented, not left to repeat. |
| `hover:bg-slate-100`, `hover:bg-slate-200` | `hover:bg-panel-raised` |
| Solid pastel badges/boxes (`bg-red-50 text-red-700`, `bg-violet-50 text-violet-800`, `bg-red-100 text-red-700`) | translucent-chip pattern: `bg-{color}-500/10` (or `/20` for a slightly stronger fill) `text-{color}-400`, e.g. `bg-red-500/10 text-red-400` |
| Bare text-only `text-blue-600` (not sitting on a solid blue fill) | `text-blue-400` |
| `hover:bg-blue-50` (light blue wash) | `hover:bg-blue-500/10` |

Do not touch: `.btn`, `.btn-primary`, `.card-lg` and any other shared class from `main.css` — those are already dark-themed by the Foundation stage. Do not touch solid-fill elements where white/black text already has correct contrast regardless of theme (e.g. `bg-black text-white`, `bg-blue-600 text-white`, `bg-violet-600 text-white`, `bg-slate-800 text-white`). Do not touch the always-dark zone-preview box in `ZoneStatusBox.tsx` (`background: #000` / `#2b2f36`, `ring-white/10`, `text-white/80`/`text-white/40`) — that's an intentionally theme-independent "what's actually on the physical screen" preview, confirmed unchanged since before the Foundation stage. Do not touch any `useState`/`useEffect`/prop/handler.

**Typecheck command:** use `npm run typecheck` (or `npm run typecheck:node`/`npm run typecheck:web`). Do NOT use `npx tsc --noEmit -p .` — the root `tsconfig.json` has `"files": []` and only resolves project references in `--build` mode, so that command silently checks nothing.

---

## File structure

- Modify: `src/renderer/src/ServiceRail.tsx` — the Live tab's left rail (service item list, wraps `LiveZoneStatus`/`LooksPanel`).
- Modify: `src/renderer/src/zones/LiveZoneStatus.tsx`, `src/renderer/src/zones/ZoneStatusBox.tsx` — the zone-status widget.
- Modify: `src/renderer/src/LiveView.tsx`, `src/renderer/src/LiveTools.tsx` — the main Live tab layout + right-hand control panel.
- Modify: `src/renderer/src/SlideGrid.tsx` — the clickable slide-thumbnail grid.
- Modify: `src/renderer/src/StageRehearsalTools.tsx` — the Stage Rehearsal control panel.
- Modify: `src/renderer/src/zones/LooksPanel.tsx` — saved zone-pin presets + Safety Reset.
- Modify: `src/renderer/src/zones/ZonePinPicker.tsx`, `src/renderer/src/ZoneTrackToggle.tsx` — the zone pin popover menu.

---

### Task 1: `ServiceRail.tsx` — the Live tab's left rail

**Files:**
- Modify: `src/renderer/src/ServiceRail.tsx`

Full target content:

```tsx
import { useEffect, useState } from 'react'
import { Hourglass } from 'lucide-react'
import type { LiveState, ServiceItem } from '../../shared/types'
import { useService } from './ServiceContext'
import SlideThumb from './SlideThumb'
import LiveZoneStatus from './zones/LiveZoneStatus'
import LooksPanel from './zones/LooksPanel'
import { sendItemLive, itemThumbBackground, usePendingConfirm } from './liveActions'

// Persistent left rail: the loaded service's items + the pinned zone status.
function ServiceRail(): JSX.Element {
  const { activeService } = useService()
  const [live, setLive] = useState<LiveState | null>(null)
  const { pendingKey, trigger, cancel } = usePendingConfirm()
  const [songBg, setSongBg] = useState<Record<number, string | null>>({})
  useEffect(() => {
    const off = window.wf.onState((s) => setLive(s.main))
    window.wf.getState('main').then(setLive)
    // Also cancel a pending tap-to-confirm on unmount so it can't fire the
    // wrong item live after the operator navigates away from the Live tab.
    return () => { off(); cancel() }
  }, [cancel])

  useEffect(() => {
    window.wf.songsList().then((list) => {
      const map: Record<number, string | null> = {}
      list.forEach((s) => { map[s.id] = s.background ?? null })
      setSongBg(map)
    })
  }, [activeService?.id, activeService?.items.length])

  const liveId = live?.liveServiceItemId ?? null

  const handleItemClick = (it: ServiceItem): void => {
    trigger(String(it.id), () => { sendItemLive(it, 'main') })
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-panel">
      <div className="border-b border-border px-3 py-3">
        {activeService ? (
          <>
            <div className="text-sm text-content-secondary">{activeService.service_date ?? 'Service'}</div>
            <div className="truncate text-base font-medium text-content-primary">{activeService.name}</div>
          </>
        ) : (
          <div className="text-base text-content-secondary">No service loaded</div>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-auto p-2">
        {(() => {
          // This rail is Main-only (same scope as the zone status it's pinned
          // above) — without this filter, Second-track items would interleave by
          // per-track ordinal and tapping one would incorrectly go live on Main.
          const mainItems = activeService?.items.filter((it) => it.track === 'main') ?? []
          return mainItems.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-content-secondary">No items — pick a service in the Services tab.</p>
          ) : (
            mainItems.map((it) => (
              <button
                key={it.id}
                onClick={() => handleItemClick(it)}
                aria-label={`Go live: ${it.title}`}
                className={`relative flex w-full items-center gap-2 rounded-md px-2 py-2.5 text-left transition-colors min-h-10 ${
                  liveId === it.id
                    ? 'bg-blue-600/15 ring-1 ring-blue-500/50'
                    : pendingKey === String(it.id)
                    ? 'bg-amber-500/20 ring-2 ring-amber-500/60'
                    : 'hover:bg-panel-raised'
                }`}
              >
                {pendingKey === String(it.id) && (
                  <div className="absolute inset-0 rounded-md border-2 border-amber-400 animate-pulse" />
                )}
                <div className="w-10 shrink-0">
                  <SlideThumb label="" itemStyle={it.style} serviceTheme={activeService?.theme ?? null} serviceColors={activeService?.themeColors ?? null} bgFile={itemThumbBackground(it, songBg)} />
                </div>
                <span className="min-w-0 flex-1 truncate text-sm text-content-primary">{it.title}</span>
                {pendingKey === String(it.id)
                  ? <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-amber-400"><Hourglass size={11} /> tap to cancel</span>
                  : liveId === it.id
                  ? <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                  : null
                }
              </button>
            ))
          )
        })()}
      </div>
      <div className="border-t border-border">
        <LiveZoneStatus />
      </div>
      <div className="border-t border-border">
        <LooksPanel />
      </div>
    </aside>
  )
}

export default ServiceRail
```

**What changed:** aside bg/border, header block colors, "No items"/"No service loaded" text, item-row default hover color, item title color, "tap to cancel" text color (`-700`→`-400`), bottom dividers. The active/pending item-row states (`bg-blue-600/15 ring-blue-500/50`, `bg-amber-500/20 ring-amber-500/60`) and the live-indicator dot (`bg-blue-500`) are unchanged — already correct. Every `useState`/`useEffect`/handler is untouched.

- [ ] **Step 1: Apply the file content above.**
- [ ] **Step 2: Verify** — `npm run typecheck` and `npm test`, expect no errors, 410/410.
- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/ServiceRail.tsx
git commit -m "feat(theme): dark-palette ServiceRail"
```

---

### Task 2: `LiveZoneStatus.tsx` + `ZoneStatusBox.tsx`

**Files:**
- Modify: `src/renderer/src/zones/LiveZoneStatus.tsx`
- Modify: `src/renderer/src/zones/ZoneStatusBox.tsx`

Full target content for `LiveZoneStatus.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import type { AppInfo, ZoneId, ZoneState } from '../../../shared/types'
import ZoneStatusBox from './ZoneStatusBox'

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

// Read-only per-zone status for the Live tab's rail — replaces the old
// "Main Audience Output" preview, which showed a generic, un-zoned render
// that could visibly disagree with what the real screens were doing (it
// didn't run through zone routing at all, and its "Program" badge was gated
// on a local-output-window counter that's always 0 for an all-zone setup).
// Shares ZoneStatusBox/readout with Setup's interactive ZoneLiveGrid so the
// two views can never disagree. No pin controls here — pinning stays a
// Setup-only action. See the 2026-08-01 design spec.
function LiveZoneStatus(): JSX.Element {
  const [zoneStates, setZoneStates] = useState<Record<ZoneId, ZoneState> | null>(null)
  const [zonesConnected, setZonesConnected] = useState<ZoneId[]>([])

  const refreshStates = useCallback((): void => { void window.wf.zoneGetStates().then(setZoneStates) }, [])

  // Zone state isn't part of the wf:state push payload itself (that's just
  // main/second track state) — a push is the signal to re-fetch, the same
  // pattern ZoneLiveGrid already uses.
  useEffect(() => {
    refreshStates()
    const off = window.wf.onState(() => refreshStates())
    return off
  }, [refreshStates])

  // Connectivity isn't part of the wf:state push (that's content, not transport) —
  // poll wf:getInfo the same way TopBar/HomeView already do for the same field.
  useEffect(() => {
    const load = (): void => { window.wf.getInfo().then((i: AppInfo) => setZonesConnected(i.zonesConnected)) }
    load()
    const t = setInterval(load, 2000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="p-2">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-content-secondary">Zones</div>
      <div className="grid grid-cols-2 gap-2">
        {ZONE_IDS.map((zoneId) => (
          <div key={zoneId} className="rounded-xl border-2 border-border bg-panel p-2">
            <ZoneStatusBox zoneId={zoneId} zoneState={zoneStates?.[zoneId]} connected={zonesConnected.includes(zoneId)} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default LiveZoneStatus
```

Full target content for `ZoneStatusBox.tsx`:

```tsx
import type { ZoneId, ZoneState } from '../../../shared/types'
import { ZONE_NAMES } from '../../../shared/types'
import { MODE_LABELS } from '../ZoneRoutingGrid'
import { readout } from './zoneReadout'

interface ZoneStatusBoxProps {
  zoneId: ZoneId
  zoneState: ZoneState | undefined
  // Omit (or pass true) when the caller doesn't track connectivity (e.g. Setup's
  // ZoneLiveGrid, which is not what an operator watches mid-service) — only a
  // literal `false` renders the disconnected state.
  connected?: boolean
}

// The zone name/mode header plus the 16:9 dark preview showing what a zone is
// actually displaying right now. Shared between Setup's interactive pin grid
// (ZoneLiveGrid) and the Live tab's read-only status widget (LiveZoneStatus)
// so the same zone always reads the same way in both places — see the
// 2026-08-01 design spec.
function ZoneStatusBox({ zoneId, zoneState, connected = true }: ZoneStatusBoxProps): JSX.Element {
  const { primary, secondary } = readout(zoneState)
  return (
    <>
      <div className="mb-1.5">
        <div className="flex items-center justify-between gap-1">
          {/* min-w-0 is required for truncate to work inside a flex row — without
              it the flex item won't shrink below its content's intrinsic width. */}
          <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-wide text-content-secondary" title={ZONE_NAMES[zoneId]}>
            {ZONE_NAMES[zoneId]}
          </span>
          {connected && (
            <span className="shrink-0 text-[10px] font-semibold text-content-secondary">{MODE_LABELS[zoneState?.mode ?? 'off']}</span>
          )}
        </div>
        {/* On its own line rather than competing with the name for the same
            narrow row — in the Live rail's real 2-column width (~79px of
            header space), sharing a row truncated names like "Back Left" and
            "Back Right" down to an indistinguishable "B…", defeating the
            point of an at-a-glance disconnected indicator. */}
        {!connected && (
          <span className="mt-0.5 flex w-fit items-center gap-1 rounded bg-red-500/20 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-400">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" /> Offline
          </span>
        )}
      </div>
      {/* Same 16:9 box the Build Service zone cards use, so every screen of
          the app describes the same hardware the same way. This preview box
          is intentionally theme-independent — it renders what the physical
          zone screen actually shows, dark regardless of app theme, same as
          before the visual redesign. */}
      <div className={`relative w-full ${connected ? '' : 'opacity-40'}`} style={{ paddingBottom: '56.25%' }}>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg px-1.5 ring-1 ring-white/10"
          style={{ background: zoneState?.mode === 'black' ? '#000' : '#2b2f36' }}
        >
          <span className="max-h-full overflow-hidden text-center text-[10px] font-medium leading-tight text-white/80">{primary}</span>
          {secondary && (
            <span className="max-h-full overflow-hidden text-center text-[9px] leading-tight text-white/40">{secondary}</span>
          )}
        </div>
      </div>
    </>
  )
}

export default ZoneStatusBox
```

**What changed:** `LiveZoneStatus.tsx`'s section label and zone-card wrapper colors. `ZoneStatusBox.tsx`'s name/mode label colors and the "Offline" badge (solid pastel `bg-red-100 text-red-700` → translucent `bg-red-500/20 text-red-400`), plus one clarifying comment added above the always-dark preview box (no code change there — confirming explicitly in-file why it's untouched, since Task 2's own diff otherwise recolors everything around it). No logic changes in either file.

- [ ] **Step 1: Apply both files' content above.**
- [ ] **Step 2: Verify** — `npm run typecheck` and `npm test`, expect no errors, 410/410.
- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/zones/LiveZoneStatus.tsx src/renderer/src/zones/ZoneStatusBox.tsx
git commit -m "feat(theme): dark-palette zone status widget"
```

---

### Task 3: `LiveView.tsx` + `LiveTools.tsx`

**Files:**
- Modify: `src/renderer/src/LiveView.tsx`
- Modify: `src/renderer/src/LiveTools.tsx`

Full target content for `LiveView.tsx` (one-line change: the border color on line 34):

```tsx
import { useEffect, useState } from 'react'
import SlideGrid from './SlideGrid'
import LiveTools from './LiveTools'
import StageRehearsalTools from './StageRehearsalTools'

// The Live tab: the click-a-slide grid + the right-hand tools panel, for Main —
// plus, while Stage Rehearsal is armed, a Second column reusing SlideGrid with
// StageRehearsalTools. (The loaded service + output preview live in the
// shell's left rail — ServiceRail, in AppShell. The bottom content drawer is
// mounted app-wide in AppShell too, not here — see LiveDrawer.tsx.)
// Keyboard shortcuts (B/L/N/P/S) are handled globally in AppShell and always
// target the Main track.
// The general-purpose Main/Second track UI (SecondTrackTools, a "Second" tab
// in Build Service) stays removed — it's the thing that once left a zone
// pointed at an empty track with no obvious cause. Stage Rehearsal reuses the
// same engine through a narrower, guarded door instead: see
// docs/superpowers/plans/2026-08-08-stage-rehearsal.md.
function LiveView(): JSX.Element {
  const [stageRehearsalActive, setStageRehearsalActive] = useState(false)

  useEffect(() => {
    window.wf.getStageRehearsal().then((s) => setStageRehearsalActive(s.active))
  }, [])

  return (
    <div className="flex h-full min-h-0">
      {/* No visible title by design — an sr-only heading still gives
          screen-reader heading-navigation something to land on for this tab. */}
      <h1 className="sr-only">Live</h1>
      <div className="flex min-h-0 min-w-0 flex-1">
        <SlideGrid track="main" />
        <LiveTools track="main" />
      </div>
      <div className="flex min-h-0 border-l border-border">
        {stageRehearsalActive && <SlideGrid track="second" />}
        <StageRehearsalTools onActiveChange={setStageRehearsalActive} />
      </div>
    </div>
  )
}

export default LiveView
```

Full target content for `LiveTools.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { MonitorOff, Image as ImageIcon, Play, Timer } from 'lucide-react'
import type { LiveState, TrackId } from '../../shared/types'
import { useService } from './ServiceContext'
import { PresenterPanel } from './PresenterPanel'
import { StageMessagePanel } from './StageMessagePanel'
import { TimingPanel } from './TimingPanel'
import { notifyLocal } from './NotifyToasts'

// The Live tab's right-hand control panel for the Main track. Deliberately holds
// only what an operator reaches for *during* a service: the panic row, presenter
// notes, stage messages, and text size/auto-advance. Everything configured once
// and then left alone (zones, tablet PIN, logs, displays) lives under Setup, and
// quick scripture lives in the app-wide bottom drawer — see the 2026-08-01 spec.
// A control added back here should be one that is genuinely used mid-service.
// (Second track gets the leaner SecondTrackTools.)
function LiveTools({ track }: { track: TrackId }): JSX.Element {
  const { activeService } = useService()
  const [live, setLive] = useState<LiveState | null>(null)
  const [stageMsg, setStageMsg] = useState('')
  const [msgSent, setMsgSent] = useState(false)
  const [autoAdvanceSecs, setAutoAdvanceSecs] = useState('10')
  const [autoAdvanceLoop, setAutoAdvanceLoop] = useState(false)

  useEffect(() => {
    const off = window.wf.onState((s) => setLive(track === 'main' ? s.main : s.second))
    return off
  }, [track])
  useEffect(() => { if (!live?.stageMessage) setStageMsg('') }, [live?.stageMessage])

  const liveItem = activeService?.items.find((it) => it.id === live?.liveServiceItemId && it.track === track) ?? null

  const hmsElapsedSecs = live?.hmsLoadedAt ? Math.floor((Date.now() - live.hmsLoadedAt) / 1000) : 0
  const autoAdvanceRunning = live?.autoAdvanceMs != null && live.autoAdvanceMs > 0

  const sendStageMessage = (preset?: string): void => {
    const msg = (preset ?? stageMsg).trim()
    if (!msg) return
    window.wf.liveSetStageMessage(track, msg)
    setMsgSent(true); setTimeout(() => setMsgSent(false), 3000)
  }
  const clearStageMessage = (): void => { setStageMsg(''); window.wf.liveSetStageMessage(track, null) }

  return (
    <aside className="flex w-96 shrink-0 flex-col gap-4 overflow-auto border-l border-border bg-panel p-4">
      {/* Emergency controls */}
      <div className="flex gap-2">
        <button
          onClick={() => window.wf.sendIntent(track, 'black')}
          className="flex-1 btn bg-black text-white border-white/40"
        >
          <MonitorOff size={14} /> Black
        </button>
        <button
          onClick={() => window.wf.sendIntent(track, 'logo')}
          className="flex-1 btn"
        >
          <ImageIcon size={14} /> Logo
        </button>
        <button
          onClick={() => window.wf.sendIntent(track, 'lyrics')}
          className="flex-1 btn-primary"
        >
          <Play size={14} /> Live
        </button>
      </div>

      {/* Keyboard shortcut strip */}
      <div className="flex justify-around rounded-lg border border-border bg-panel-raised px-2 py-1.5 text-[10px] text-content-secondary">
        <span><span className="font-bold text-content-primary">Space</span> Next</span>
        <span><span className="font-bold text-content-primary">←→</span> Prev/Next</span>
        <span><span className="font-bold text-content-primary">B</span> Black</span>
        <span><span className="font-bold text-content-primary">L</span> Logo</span>
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Presenter notes + timer */}
      <PresenterPanel liveState={live} liveItem={liveItem} />

      {/* Stage message + presets */}
      <StageMessagePanel
        inputValue={stageMsg}
        liveMessage={live?.stageMessage ?? null}
        msgSent={msgSent}
        onInputChange={setStageMsg}
        onSendMessage={sendStageMessage}
        onClearMessage={clearStageMessage}
      />

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Text size + Auto-advance */}
      <TimingPanel
        fontScale={live?.fontScale ?? 6}
        autoAdvanceSecs={autoAdvanceSecs}
        autoAdvanceRunning={autoAdvanceRunning}
        autoAdvanceLoop={autoAdvanceLoop}
        liveState={live}
        onFontScaleDecrease={() => window.wf.liveSetFontScale(track, (live?.fontScale ?? 6) - 0.5)}
        onFontScaleIncrease={() => window.wf.liveSetFontScale(track, (live?.fontScale ?? 6) + 0.5)}
        onFontScaleSave={() => window.wf.liveSaveFontScale(track)}
        onAutoAdvanceSecsChange={setAutoAdvanceSecs}
        onAutoAdvanceStart={() => {
          const secs = parseFloat(autoAdvanceSecs)
          if (isNaN(secs) || secs <= 0 || secs > 3600) {
            notifyLocal('Auto-advance must be between 1 and 3600 seconds', 'warn')
            return
          }
          window.wf.featuresStartAutoAdvance(secs * 1000, autoAdvanceLoop)
        }}
        onAutoAdvanceStop={() => window.wf.featuresStopAutoAdvance()}
        onAutoAdvanceLoopToggle={setAutoAdvanceLoop}
      />

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Status strip: hymn timer + verse */}
      {(hmsElapsedSecs > 0 || live?.verseNumber != null) && (
        <div className="flex gap-2 rounded-lg border border-border bg-panel-raised px-3 py-1.5 text-xs text-content-secondary">
          {hmsElapsedSecs > 0 && <span className="inline-flex items-center gap-1 tabular-nums"><Timer size={12} /> {Math.floor(hmsElapsedSecs / 60)}:{String(hmsElapsedSecs % 60).padStart(2, '0')}</span>}
          {live?.verseNumber != null && <span>· Verse {live.verseNumber}</span>}
        </div>
      )}

    </aside>
  )
}

export default LiveTools
```

**What changed:** `LiveView.tsx` — the border between the Main and Second columns. `LiveTools.tsx` — the aside bg/border, the keyboard-shortcut strip and status-strip colors, the three dividers. The Black/Logo/Live buttons (`.btn`/`.btn-primary`/`bg-black`) are unchanged — already correctly dark via the shared classes and solid-fill contrast. `PresenterPanel`, `StageMessagePanel`, `TimingPanel` are separate files NOT in scope for this task (not named in this stage's file structure) — their own colors are untouched here.

- [ ] **Step 1: Apply both files' content above.**
- [ ] **Step 2: Verify** — `npm run typecheck` and `npm test`, expect no errors, 410/410.
- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/LiveView.tsx src/renderer/src/LiveTools.tsx
git commit -m "feat(theme): dark-palette LiveView and LiveTools"
```

---

### Task 4: `SlideGrid.tsx`

**Files:**
- Modify: `src/renderer/src/SlideGrid.tsx`

Full target content:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { Music, BookOpen, Type, Timer, Image as ImageIcon, Hand, ScrollText, Megaphone, Play, Mic, FileQuestion, Minus, HelpCircle, Hourglass, Video } from 'lucide-react'
import type { LiveState, ServiceItem, TrackId } from '../../shared/types'
import { useService } from './ServiceContext'
import SlideThumb from './SlideThumb'
import { canGoLive, itemThumbBackground, usePendingConfirm } from './liveActions'

type IconType = ComponentType<{ size?: number | string; className?: string }>

const ICON: Record<ServiceItem['type'], IconType> = {
  song: Music, scripture: BookOpen, text: Type, countdown: Timer, image: ImageIcon, welcome: Hand, ticker: ScrollText, announcement: Megaphone, sermon: Mic, livecall: Video,
  header: Minus, placeholder: HelpCircle
}

// The Live tab's main area: each item a panel of clickable slide thumbnails.
// Used for both the Main and Second columns — `track` selects which live
// cursor/state this instance follows and drives.
function SlideGrid({ track }: { track: TrackId }): JSX.Element {
  const { activeService } = useService()
  const [live, setLive] = useState<LiveState | null>(null)
  const [slides, setSlides] = useState<Record<number, string[]>>({})
  const [songBg, setSongBg] = useState<Record<number, string | null>>({})
  const liveRowRef = useRef<HTMLDivElement | null>(null)
  const { pendingKey, trigger, cancel } = usePendingConfirm()

  useEffect(() => {
    const off = window.wf.onState((s) => setLive(track === 'main' ? s.main : s.second))
    window.wf.getState(track).then(setLive)
    // Also cancel a pending tap-to-confirm on unmount so it can't fire the
    // wrong item live after the operator navigates away from this tab.
    return () => { off(); cancel() }
  }, [track, cancel])

  useEffect(() => {
    window.wf.songsList().then((list) => {
      const map: Record<number, string | null> = {}
      list.forEach((s) => { map[s.id] = s.background ?? null })
      setSongBg(map)
    })
  }, [activeService?.id, activeService?.items.length])

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
    return <div className="flex h-full min-w-0 flex-1 items-center justify-center text-sm text-content-secondary">No service loaded — pick one in the Services tab.</div>
  }

  const items = activeService.items.filter((it) => it.track === track).filter(canGoLive)

  return (
    <div className="h-full min-h-0 min-w-0 flex-1 space-y-3 overflow-auto p-3">
      {items.length === 0 && (
        <p className="py-8 text-center text-sm text-content-secondary">
          {track === 'main' ? 'This service has no go-live items yet.' : 'No second-track items yet — add some in Build Service.'}
        </p>
      )}
      {items.map((it) => {
        const its = slides[it.id] ?? ['']
        const isLiveItem = liveItemId === it.id
        // See ServiceDeck: an unknown item type must not blank the tab.
        const Icon = ICON[it.type] ?? FileQuestion
        const bgFile = itemThumbBackground(it, songBg)
        return (
          <div key={it.id} ref={isLiveItem ? liveRowRef : null} className="card-lg">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-content-primary">
              <Icon size={13} className="shrink-0 text-content-secondary" />
              <span className="truncate">{it.title}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {its.map((slideText, idx) => {
                const isLiveSlide = isLiveItem && liveIndex === idx
                const slideKey = `${it.id}:${idx}`
                const isPending = pendingKey === slideKey
                const goLive = (): void => { window.wf.liveGoLiveAt(track, it.id, idx) }
                // Navigating within the item that's ALREADY live is just moving
                // the cursor (same as Next/Prev) — instant. Jumping to a DIFFERENT
                // item switches what the congregation sees, so it gets the same
                // tap-to-confirm gesture as the item rail, instead of firing on
                // the first stray click the way this used to.
                const handleClick = (): void => { isLiveItem ? goLive() : trigger(slideKey, goLive) }
                return (
                  <button
                    key={idx}
                    onClick={handleClick}
                    aria-label={`Play slide ${idx + 1} of ${its.length}`}
                    className={`overflow-hidden rounded-md transition-shadow min-h-10 cursor-pointer group relative ${
                      isLiveSlide ? 'ring-2 ring-blue-500' : isPending ? 'ring-2 ring-amber-500/70' : 'ring-1 ring-white/10 hover:ring-blue-400/50'
                    }`}
                    title={isPending ? 'Tap again to confirm' : `Click to play slide ${idx + 1}`}
                  >
                    <SlideThumb label={slideText} itemStyle={it.style} serviceTheme={activeService.theme} serviceColors={activeService.themeColors} bgFile={bgFile} />
                    {isPending ? (
                      <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/55 text-[10px] font-bold text-amber-300 animate-pulse">
                        <Hourglass size={13} /> tap to confirm
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play size={20} className="text-white" fill="currentColor" />
                      </div>
                    )}
                    <div className="bg-app px-1.5 py-0.5 text-left text-[9px] text-content-secondary">{idx + 1}</div>
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

**What changed:** the "no service loaded" / "no items" messages, item-card header text/icon colors, the default (non-live, non-pending) slide-thumbnail ring color, and the per-slide index chip's background/text colors. `SlideThumb` itself is a separate, already theme-agnostic component (confirmed via `grep` — it has zero light-theme-specific classes) and is not touched. The pending/live-slide overlays (`bg-black/55`, `bg-black/40`, `text-amber-300`, `ring-blue-500`, `ring-amber-500/70`) are unchanged — already correct.

- [ ] **Step 1: Apply the file content above.**
- [ ] **Step 2: Verify** — `npm run typecheck` and `npm test`, expect no errors, 410/410.
- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/SlideGrid.tsx
git commit -m "feat(theme): dark-palette SlideGrid"
```

---

### Task 5: `StageRehearsalTools.tsx`

**Files:**
- Modify: `src/renderer/src/StageRehearsalTools.tsx`

Full target content:

```tsx
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Mic2, Square, Search } from 'lucide-react'
import type { LiveState, SongSummary } from '../../shared/types'
import type { StageRehearsalState } from '../../shared/stageRehearsal'

// Purpose-built rehearsal control: automatically steps through the active
// service's songs, in order, on the Stage Monitor (Zone 4), while Zones 1-3
// loop through the service's announcements on Main — untouched by the
// operator. Deliberately narrower than the general Main/Second track UI (no
// scripture, no black/logo) — see docs/superpowers/plans/
// 2026-08-08-stage-rehearsal.md for why that general UI stays hidden.
function StageRehearsalTools({ onActiveChange }: { onActiveChange: (active: boolean) => void }): JSX.Element {
  const [state, setState] = useState<StageRehearsalState | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<SongSummary[]>([])
  const [allSongs, setAllSongs] = useState<SongSummary[]>([])
  const [live, setLive] = useState<LiveState | null>(null)

  useEffect(() => {
    window.wf.getStageRehearsal().then(setState)
    window.wf.songsList().then(setAllSongs)
    const off = window.wf.onState((s) => setLive(s.second))
    window.wf.getState('second').then(setLive)
    return off
  }, [])

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return }
    void window.wf.songsList(search).then(setSearchResults)
  }, [search])

  const titleFor = (songId: number): string => allSongs.find((s) => s.id === songId)?.title ?? `Song #${songId}`

  const refresh = async (): Promise<void> => {
    const next = await window.wf.getStageRehearsal()
    setState(next)
    onActiveChange(next.active)
  }

  const start = async (): Promise<void> => {
    setStarting(true)
    setStartError(null)
    try {
      await window.wf.setStageRehearsal(true)
      await refresh()
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Could not start rehearsal.')
    } finally {
      setStarting(false)
    }
  }

  const stop = async (): Promise<void> => {
    await window.wf.setStageRehearsal(false)
    await refresh()
  }

  const nextSong = async (): Promise<void> => { await window.wf.stageRehearsalNextSong(); await refresh() }
  const prevSong = async (): Promise<void> => { await window.wf.stageRehearsalPrevSong(); await refresh() }
  const goToSong = async (index: number): Promise<void> => { await window.wf.stageRehearsalGoToSong(index); await refresh() }

  const pickSong = async (id: number): Promise<void> => {
    await window.wf.liveLoadSong('second', id)
    window.wf.liveSetItemId('second', null)
  }

  if (!state) return <></>

  if (!state.active) {
    return (
      <aside className="flex w-96 shrink-0 flex-col gap-3 overflow-auto border-l border-border bg-panel p-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-content-secondary">
          <Mic2 size={14} /> Stage Rehearsal
        </div>
        <p className="text-xs text-content-secondary">
          Steps through this service's songs, in order, on the Stage Monitor only — Zones 1-3 automatically loop
          through the service's announcements the whole time.
        </p>
        {startError && <p className="text-xs font-medium text-red-400">{startError}</p>}
        <button
          onClick={start}
          disabled={starting}
          className="btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Mic2 size={14} /> {starting ? 'Starting…' : 'Start Stage Rehearsal'}
        </button>
      </aside>
    )
  }

  const atStart = state.songIndex === 0
  const atEnd = state.songIndex >= state.songQueue.length - 1

  return (
    <aside className="flex w-96 shrink-0 flex-col gap-3 overflow-auto border-l border-border bg-panel p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-violet-400">
          <Mic2 size={14} /> Rehearsing
        </div>
        <button onClick={stop} className="btn bg-slate-800 text-white">
          <Square size={12} /> Stop
        </button>
      </div>

      <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-400">
        Stage Monitor shows the song below. Zones 1-3 are looping the service's announcements.
      </div>

      {live?.songTitle && (
        <div className="rounded-lg border border-border bg-panel px-3 py-2">
          <p className="text-sm font-semibold text-content-primary">{live.songTitle}</p>
          <p className="text-[11px] text-content-secondary">
            Song {state.songIndex + 1} of {state.songQueue.length}
            {live.total > 0 && ` · Slide ${live.index + 1} of ${live.total}`}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={prevSong}
          disabled={atStart}
          className="btn flex-1 justify-center disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft size={14} /> Prev song
        </button>
        <button
          onClick={nextSong}
          disabled={atEnd}
          className="btn-primary flex-1 justify-center disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next song <ChevronRight size={14} />
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => window.wf.sendIntent('second', 'prev')}
          disabled={!live?.songTitle}
          className="btn flex-1 justify-center text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          Back a slide
        </button>
        <button
          onClick={() => window.wf.sendIntent('second', 'next')}
          disabled={!live?.songTitle}
          className="btn flex-1 justify-center text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next slide
        </button>
      </div>

      <div className="border-t border-border" />

      <p className="text-[11px] font-semibold uppercase tracking-widest text-content-secondary">Service order</p>
      <div className="flex flex-col gap-1">
        {state.songQueue.map((id, i) => (
          <button
            key={`${id}-${i}`}
            onClick={() => void goToSong(i)}
            className={[
              'rounded-lg px-3 py-2 text-left text-sm',
              i === state.songIndex ? 'bg-violet-600 text-white' : 'text-content-primary hover:bg-panel-raised',
            ].join(' ')}
          >
            {i + 1}. {titleFor(id)}
          </button>
        ))}
      </div>

      <div className="border-t border-border" />

      <p className="text-[11px] font-semibold uppercase tracking-widest text-content-secondary">
        Warm up on something else
      </p>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-content-tertiary" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search any song…"
          className="w-full rounded-lg border border-border bg-panel py-2 pl-8 pr-3 text-sm outline-none focus:border-blue-500"
        />
      </div>
      {search.trim() && (
        <div className="flex flex-col gap-1">
          {searchResults.map((s) => (
            <button
              key={s.id}
              onClick={() => pickSong(s.id)}
              className="rounded-lg px-3 py-2 text-left text-sm text-content-primary hover:bg-panel-raised"
            >
              {s.title}
            </button>
          ))}
          {searchResults.length === 0 && <p className="px-3 py-2 text-xs text-content-secondary">No songs match.</p>}
        </div>
      )}
    </aside>
  )
}

export default StageRehearsalTools
```

**What changed:** both aside states' bg/border, the start-error text color (`-600`→`-400`), the "Rehearsing" header text (`-700`→`-400`, matching the exact fix already applied to the TopBar's own Stage Rehearsal badge in the TopBar+Home stage), the info box (solid pastel `border-violet-200 bg-violet-50 text-violet-800` → translucent `border-violet-500/30 bg-violet-500/10 text-violet-400`), the live-song preview box, the service-order list's inactive-item colors, all dividers/section labels, the search icon/input, and the search-results list. The Stop button (`bg-slate-800 text-white`) is deliberately left unchanged — it's already dark and provides a distinct "stop" affordance against the new `bg-panel` background without needing a color swap. The active service-order item (`bg-violet-600 text-white`) and the primary/secondary `.btn`/`.btn-primary` buttons are unchanged — already correct.

- [ ] **Step 1: Apply the file content above.**
- [ ] **Step 2: Verify** — `npm run typecheck` and `npm test`, expect no errors, 410/410.
- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/StageRehearsalTools.tsx
git commit -m "feat(theme): dark-palette StageRehearsalTools"
```

---

### Task 6: `LooksPanel.tsx`

**Files:**
- Modify: `src/renderer/src/zones/LooksPanel.tsx`

Full target content:

```tsx
// src/renderer/src/zones/LooksPanel.tsx
// Saved zone-pin presets ("Looks") + the safety-reset button — both live here
// on the Live tab since they're meant for in-the-moment use, unlike pinning
// itself, which stays a Setup-only action (see ZoneLiveGrid.tsx / ZonePanel.tsx).
import { useCallback, useEffect, useState } from 'react'
import { ShieldAlert, X } from 'lucide-react'
import type { Look } from '../../../shared/zoneLooks'

function LooksPanel(): JSX.Element {
  const [looks, setLooks] = useState<Look[]>([])

  const refresh = useCallback((): void => { void window.wf.looksList().then(setLooks) }, [])

  useEffect(() => { refresh() }, [refresh])

  const applyLook = (lookId: string): void => {
    void window.wf.looksApply(lookId)
  }

  const deleteLook = (lookId: string): void => {
    void window.wf.looksDelete(lookId).then(refresh)
  }

  const safetyReset = (): void => {
    void window.wf.zoneSafetyReset()
  }

  return (
    <div className="space-y-2 p-2">
      <button
        onClick={safetyReset}
        title="Force all 4 zones to the logo — screens only, doesn't touch audio"
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/20"
      >
        <ShieldAlert size={13} /> Safety Reset
      </button>

      {looks.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-content-secondary">Looks</div>
          {looks.map((look) => (
            <div key={look.id} className="group flex items-center gap-1">
              <button
                onClick={() => applyLook(look.id)}
                className="min-w-0 flex-1 truncate rounded-lg border border-border bg-panel px-2 py-1.5 text-left text-xs font-medium text-content-primary hover:border-blue-400 hover:bg-blue-500/10"
              >
                {look.name}
              </button>
              <button
                onClick={() => deleteLook(look.id)}
                title={`Delete "${look.name}"`}
                aria-label={`Delete "${look.name}"`}
                className="hidden shrink-0 rounded p-1 text-content-tertiary hover:bg-panel-raised hover:text-content-primary group-hover:block"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default LooksPanel
```

**What changed:** the Safety Reset button (solid pastel `border-red-300 bg-red-50 text-red-700 hover:bg-red-100` → translucent `border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20` — this is a genuinely important, frequently-reached-for safety control, so keep its red identity strong, just dark-theme-appropriate), the "Looks" section label, each saved Look's apply-button colors (including its blue hover wash, `hover:bg-blue-50`→`hover:bg-blue-500/10`), and the delete button.

- [ ] **Step 1: Apply the file content above.**
- [ ] **Step 2: Verify** — `npm run typecheck` and `npm test`, expect no errors, 410/410.
- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/zones/LooksPanel.tsx
git commit -m "feat(theme): dark-palette LooksPanel"
```

---

### Task 7: `ZonePinPicker.tsx` + `ZoneTrackToggle.tsx`

**Files:**
- Modify: `src/renderer/src/zones/ZonePinPicker.tsx`
- Modify: `src/renderer/src/ZoneTrackToggle.tsx`

**Note:** `ZoneTrackToggle.tsx` is also used by `ZonePanel.tsx` (Setup tab, not yet migrated) — migrating it here will make Setup's zone-track toggle render in dark colors ahead of Setup's own stage. This is expected, matching how the Foundation stage's shared `main.css` classes already affect every screen regardless of migration order — see this plan's header note.

Full target content for `ZonePinPicker.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import type { ServiceItem, ZoneId } from '../../../shared/types'
import type { ZonePin } from '../../../shared/zonePins'
import type { ZoneTrackAssignment } from '../../../shared/zoneTrack'
import ZoneTrackToggle from '../ZoneTrackToggle'

// Only these two item types carry a title/speaker/passage worth freezing onto a
// screen — pinning a song or a countdown as a title card would render a card
// nobody authored.
const HOLDABLE_TYPES = ['sermon', 'text']

function Row({ checked, label, muted, onClick }: {
  checked?: boolean
  label: string
  muted?: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-panel-raised ${
        muted ? 'text-[11px] text-content-secondary' : 'text-xs text-content-primary'
      }`}
    >
      <span className="w-3 shrink-0">{checked && <Check size={12} className="text-blue-400" />}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}

// The pin menu for one zone card. Every choice is a pin (or "Follow service",
// which is the absence of one) so there is exactly one mental model for holding
// a screen — the old Auto/Black/Logo/Lyrics chips lived alongside three other
// controls that could contradict them.
export default function ZonePinPicker({
  zoneId, pin, liveItem, items, serviceId, trackAssignment, onTrackAssignmentChange, onTrackAssignmentPersisted,
  onPick, onClose, placement, align
}: {
  zoneId: ZoneId
  pin: ZonePin | null
  // The main track's live item, offered as the one-click "hold what's on now".
  liveItem: ServiceItem | null
  // Every item of the active service, both tracks — a pin is deliberately not
  // track-scoped (see computeZoneStates), so neither is this list.
  items: ServiceItem[]
  serviceId: number | null
  trackAssignment: ZoneTrackAssignment
  onTrackAssignmentChange: (next: ZoneTrackAssignment) => void
  // Changing the track a zone follows only fires zoneBroadcast() in main (the
  // zone pages), not the wf:state push the grid listens to — so the grid has to
  // be told to re-read the zone states itself.
  onTrackAssignmentPersisted: () => void
  onPick: (pin: ZonePin | null) => void
  onClose: () => void
  placement: 'above' | 'below'
  align: 'left' | 'right'
}): JSX.Element {
  const [showOthers, setShowOthers] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const holdable = items.filter((it) => HOLDABLE_TYPES.includes(it.type) && it.id !== liveItem?.id)
  const liveHoldable = liveItem && HOLDABLE_TYPES.includes(liveItem.type) ? liveItem : null
  const heldId = pin?.kind === 'titleCard' ? pin.itemId : null

  return (
    <>
      {/* Backdrop, not a document-level mousedown listener: the card itself is
          this popover's trigger, so a listener would close on mousedown and the
          card's own click would immediately reopen it. Swallowing the whole
          click here closes it exactly once. The keyboard equivalent (Escape)
          is handled by the document-level keydown listener above, not this
          element, since this div is a click-catcher only and isn't focusable. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div
        className={`absolute z-30 w-64 rounded-xl border border-border bg-panel-raised p-1.5 shadow-lg ${
          placement === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'
        } ${align === 'right' ? 'right-0' : 'left-0'}`}
      >
        <Row checked={pin == null} label="Follow service" onClick={() => onPick(null)} />
        {liveHoldable && (
          <Row
            checked={heldId === liveHoldable.id}
            label={`Hold “${liveHoldable.title}”`}
            onClick={() => onPick({ kind: 'titleCard', itemId: liveHoldable.id })}
          />
        )}
        {holdable.length > 0 && (
          <>
            <button
              onClick={() => setShowOthers((v) => !v)}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-content-primary hover:bg-panel-raised"
            >
              <span className="w-3 shrink-0">{heldId != null && heldId !== liveHoldable?.id && <Check size={12} className="text-blue-400" />}</span>
              <span className="flex-1 truncate">Hold another item…</span>
              {showOthers ? <ChevronUp size={12} className="text-content-tertiary" /> : <ChevronDown size={12} className="text-content-tertiary" />}
            </button>
            {showOthers && (
              <div className="max-h-40 overflow-auto border-l border-border pl-1.5">
                {holdable.map((it) => (
                  <Row
                    key={it.id}
                    checked={heldId === it.id}
                    label={it.title || it.type}
                    onClick={() => onPick({ kind: 'titleCard', itemId: it.id })}
                  />
                ))}
              </div>
            )}
          </>
        )}

        <div className="my-1 border-t border-border" />

        <Row checked={pin?.kind === 'mode' && pin.mode === 'logo'} label="Logo" onClick={() => onPick({ kind: 'mode', mode: 'logo' })} />
        <Row checked={pin?.kind === 'mode' && pin.mode === 'black'} label="Black" onClick={() => onPick({ kind: 'mode', mode: 'black' })} />
        {/* Secondary on purpose: holding raw live text on a back screen is the
            rare case, and it is what the old "Lyrics" chip actually did. */}
        <Row muted checked={pin?.kind === 'mode' && pin.mode === 'lyrics'} label="Live text" onClick={() => onPick({ kind: 'mode', mode: 'lyrics' })} />

        {serviceId != null && (
          <>
            <div className="my-1 border-t border-border" />
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] text-content-secondary hover:bg-panel-raised"
            >
              <span className="flex-1">Advanced</span>
              {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showAdvanced && (
              <div className="px-2 pb-1">
                <div className="mb-1 text-[10px] text-content-secondary">Which track this screen follows</div>
                <ZoneTrackToggle
                  serviceId={serviceId}
                  zoneId={zoneId}
                  assignment={trackAssignment}
                  onChanged={onTrackAssignmentChange}
                  onPersisted={onTrackAssignmentPersisted}
                />
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
```

Full target content for `ZoneTrackToggle.tsx`:

```tsx
import type { ZoneId, TrackId } from '../../shared/types'
import type { ZoneTrackAssignment } from '../../shared/zoneTrack'

// The Main/Second button pair for a single zone — shared by ZonePanel (Live tab)
// and Build Service's zone-assignment popover, both driving the same per-service
// zone_track_assignment through window.wf.zoneTrackAssignmentSet.
function ZoneTrackToggle({ serviceId, zoneId, assignment, onChanged, onPersisted }: {
  serviceId: number
  zoneId: ZoneId
  assignment: ZoneTrackAssignment
  onChanged: (next: ZoneTrackAssignment) => void
  // Fired after zoneTrackAssignmentSet resolves — lets a caller (e.g. ZonePanel)
  // refresh dependent state (like zoneStates' mode labels) at the same point the
  // pre-extraction inline implementation did, not immediately on click.
  onPersisted?: () => void
}): JSX.Element {
  const setZoneTrack = (track: TrackId): void => {
    const next = { ...assignment, [zoneId]: track }
    onChanged(next)
    void window.wf.zoneTrackAssignmentSet(serviceId, next).then(() => onPersisted?.())
  }

  return (
    <div className="flex gap-1">
      {(['main', 'second'] as TrackId[]).map((tb) => (
        <button
          key={tb}
          onClick={() => setZoneTrack(tb)}
          className={`rounded px-2 py-0.5 text-[10px] font-semibold ring-1 ring-border transition-colors ${
            assignment[zoneId] === tb ? 'bg-blue-600 text-white' : 'text-content-secondary hover:bg-panel-raised'
          }`}
        >
          {tb === 'main' ? 'Main' : 'Second'}
        </button>
      ))}
    </div>
  )
}

export default ZoneTrackToggle
```

**What changed:** `ZonePinPicker.tsx` — the popover panel background (`bg-white`→`bg-panel-raised`, matching the dropdown-elevation convention `NavMenu.tsx` already established in the TopBar+Home stage), every `Row`/button's text/hover colors, all check-icons (`text-blue-600`→`text-blue-400`), dividers, and chevron/helper-text colors. `ZoneTrackToggle.tsx` — the ring color and inactive-button colors; the active state (`bg-blue-600 text-white`) is unchanged.

- [ ] **Step 1: Apply both files' content above.**
- [ ] **Step 2: Verify** — `npm run typecheck` and `npm test`, expect no errors, 410/410.
- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/zones/ZonePinPicker.tsx src/renderer/src/ZoneTrackToggle.tsx
git commit -m "feat(theme): dark-palette ZonePinPicker and ZoneTrackToggle"
```

---

### Task 8: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Typecheck, lint, test**

Run: `npm run typecheck`, `npm run lint`, `npm test`.
Expected: typecheck clean, lint 0 errors (pre-existing warnings in unrelated files are fine), 410/410 tests pass.

- [ ] **Step 2: Build and visually verify**

Run `npm run build` (the electron-vite renderer build is sufficient — no need for the full `pack:dir` installer step). Serve `out/renderer` and view it in a browser (the Foundation and TopBar+Home stages both used a `.claude/launch.json` config running `npx serve -l 4173 out/renderer` via the project's preview tooling — reuse that same approach). Since a pixel screenshot may not always be available, computed-style verification (`getComputedStyle` on key elements via the browser's JS execution tool) is an acceptable, equally rigorous substitute — both prior stages used this successfully.

Confirm in the running app, on the Live tab specifically (click "Live" in the top nav):
- The left rail (`ServiceRail`) is a dark panel: service name/date legible, item list items readable, the currently-live item shows its blue highlight, the Zones grid below it shows dark zone-preview boxes with legible labels, the Looks/Safety-Reset panel below that is legible with the red Safety Reset button still reading clearly as a danger action.
- The center slide grid (`SlideGrid`) shows dark item-group cards (via `.card-lg`) with legible titles, and slide thumbnails have a visible ring/border.
- The right panel (`LiveTools`) is a dark panel: Black/Logo/Live buttons render correctly (Black solid black, Logo neutral, Live blue), the keyboard-shortcut strip and any status strip are legible.
- Arm Stage Rehearsal (or inspect the not-yet-armed state) and confirm `StageRehearsalTools`' panel is dark and legible, including the violet "Rehearsing" label and info box once armed.
- Click a zone's pin control (if reachable in this browser-mock environment) and confirm `ZonePinPicker`'s popover renders as a dark panel, legible.
- Nothing is broken, misaligned, or illegible anywhere on the Live tab.

- [ ] **Step 3: Report status**

If everything in Step 2 looks right, this stage is done. The next stage per the design spec's rollout order is Build Service (`ServiceEditor.tsx`, `ServiceDeck.tsx`, `ItemEditor.tsx` and its type-specific editors) — write that as its own plan when it starts.

---

## Self-Review

**Spec coverage:** Every file the design spec's rollout order intends for "the Live tab" is covered, with the one documented scope correction (the spec's literal `ZonePanel.tsx`/`ZoneLiveGrid.tsx` naming doesn't match what actually renders on the Live tab — `LiveZoneStatus.tsx`/`ZoneStatusBox.tsx`/`ServiceRail.tsx` do, and are covered instead). `PresenterPanel.tsx`, `StageMessagePanel.tsx`, `TimingPanel.tsx` (rendered inside `LiveTools.tsx`) and `SlideThumb.tsx` are explicitly out of scope — not named by the spec for this stage, and (for `SlideThumb.tsx`) confirmed to have no light-theme colors needing a change anyway.

**Placeholder scan:** Every task gives complete target file content plus an explicit "what changed" summary. No TBDs.

**Type consistency:** No type/signature changes anywhere in this plan — every task is a pure `className` migration. `ZoneTrackToggle`'s props are unchanged, so its Setup-tab consumer (`ZonePanel.tsx`, out of scope) keeps compiling without modification.
