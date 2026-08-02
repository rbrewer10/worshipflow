# Zone connection status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Home screen and the top bar accurately report how many real screens are connected (zones + local outputs combined), naming any missing zones by name, instead of always reading 0 for an all-zone setup.

**Architecture:** The zone client already sends `{type:'hello', zone: N}` the instant its WebSocket opens — the server just never reads it. Add a small, pure `zoneConnections` module tracking which zone IDs currently have a live socket, wire the server's existing message handler to feed it, expose the result on `wf:getInfo`, and combine it with the existing local-output count in the two renderer files that display it.

**Tech Stack:** Electron 33, TypeScript, `ws` (Node WebSocket server, message handling only — no protocol/wire-format changes), React 18, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-02-zone-connection-status-design.md`

---

## Before you start

Mandatory gate before every commit:

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

As of this plan, that gate passes with **329 tests, 0 lint errors**. Do not commit if any of the four fails.

Repo conventions already established this session, still in force:

1. **Never `git add -A` or `git add .`.** Stage only the exact files each task names.
2. **This sandbox cannot launch Electron** and has no real zone Pi to connect. Task 5 is marked **[manual]** — verified by the user, not by you.
3. **The zone client (`src/main/zoneHtml.ts`) does not need to change.** It already sends the `hello` message this plan reads server-side — confirm this yourself by reading the file before starting Task 2, but do not edit it.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/main/zoneConnections.ts` | Pure module: which zone IDs currently have a live connection. The one piece of this feature that's genuinely unit-testable. |
| `src/main/zoneConnections.test.ts` | Tests for the above. |

**Modified:**

| File | Change |
|---|---|
| `src/main/index.ts` | Reads the zone client's existing `hello` message, feeds `zoneConnections`, and exposes it on `wf:getInfo`. |
| `src/shared/types.ts` | `AppInfo` gains `zonesConnected: ZoneId[]`; new shared `ZONE_IDS` constant. |
| `src/renderer/src/browserWfMock.ts` | Mock `AppInfo` gains `zonesConnected: []`. |
| `src/renderer/src/HomeView.tsx` | Preflight check combines outputs + zones into one "screens connected" count, names missing zones. |
| `src/renderer/src/TopBar.tsx` | Status badge combines outputs + zones the same way; missing zones surface in the badge's tooltip. |

**Not touched:** `src/main/zoneHtml.ts` (already sends what's needed), `src/renderer/src/setup/DiagnosticsTab.tsx` (its own `outputs` display is a different, legitimate question — see the design spec), `computeZoneStates()`, zone routing/pinning, and the existing 30s heartbeat/liveness mechanism (its dead-socket cleanup already triggers the same `close`/`error` handlers this plan hooks into — no separate change needed for it).

---

## Task 1: zoneConnections — pure tracking module

**Files:**
- Create: `src/main/zoneConnections.ts`
- Test: `src/main/zoneConnections.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/main/zoneConnections.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { markZoneConnected, markZoneDisconnected, getConnectedZoneIds } from './zoneConnections'

describe('zoneConnections', () => {
  // Module-level state persists across tests in this file (same pattern as
  // roomFeedPrecedence.ts) — markZoneDisconnected only clears an entry if the
  // exact socket passed matches what's on record, so each test tracks and
  // releases the sockets it created rather than relying on a blanket reset.
  const toRelease: Array<{ zoneId: 1 | 2 | 3 | 4; socket: unknown }> = []
  afterEach(() => {
    while (toRelease.length) {
      const { zoneId, socket } = toRelease.pop()!
      markZoneDisconnected(zoneId, socket)
    }
  })

  it('starts with no zones connected', () => {
    expect(getConnectedZoneIds()).toEqual([])
  })

  it('marks a zone connected', () => {
    const socket = {}
    markZoneConnected(1, socket)
    toRelease.push({ zoneId: 1, socket })
    expect(getConnectedZoneIds()).toEqual([1])
  })

  it('tracks multiple zones independently', () => {
    const a = {}
    const b = {}
    markZoneConnected(2, a)
    markZoneConnected(4, b)
    toRelease.push({ zoneId: 2, socket: a }, { zoneId: 4, socket: b })
    expect(getConnectedZoneIds().slice().sort()).toEqual([2, 4])
  })

  it('removes a zone on disconnect', () => {
    const socket = {}
    markZoneConnected(3, socket)
    markZoneDisconnected(3, socket)
    expect(getConnectedZoneIds()).not.toContain(3)
  })

  it('does not remove a zone if an older socket disconnects after a reconnect', () => {
    const oldSocket = {}
    const newSocket = {}
    markZoneConnected(1, oldSocket)
    markZoneConnected(1, newSocket) // zone reconnected with a new socket
    markZoneDisconnected(1, oldSocket) // the old connection's close handler fires late
    toRelease.push({ zoneId: 1, socket: newSocket })
    expect(getConnectedZoneIds()).toContain(1) // the newer connection must survive
  })

  it('overwrites the tracked socket when a zone reconnects', () => {
    const oldSocket = {}
    const newSocket = {}
    markZoneConnected(2, oldSocket)
    markZoneConnected(2, newSocket)
    markZoneDisconnected(2, newSocket)
    expect(getConnectedZoneIds()).not.toContain(2)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx vitest run src/main/zoneConnections.test.ts
```

Expected: fails to collect — `Failed to resolve import "./zoneConnections"`.

- [ ] **Step 3: Write the module**

Create `src/main/zoneConnections.ts`:

```ts
import type { ZoneId } from '../shared/types'

// Tracks which zone screens (Back Left, Back Right, Lyrics TVs, Stage
// Monitors) currently have a live WebSocket connection, so wf:getInfo can
// report real zone connectivity instead of the always-zero local-output-
// window count for an all-zone setup. See the 2026-08-02 design spec.
//
// Generic over the socket type (kept as `unknown`) so this stays decoupled
// from the `ws` library and is trivially testable with plain objects —
// nothing here ever reads a property off the socket, only compares identity.
const zoneConnections = new Map<ZoneId, unknown>()

export function markZoneConnected(zoneId: ZoneId, socket: unknown): void {
  zoneConnections.set(zoneId, socket)
}

// Only clears the entry if `socket` is still the one on record for this
// zone. If the zone already reconnected with a newer socket before this
// older one's close/error handler fired, that newer connection must not be
// evicted by the older one's belated cleanup.
export function markZoneDisconnected(zoneId: ZoneId, socket: unknown): void {
  if (zoneConnections.get(zoneId) === socket) zoneConnections.delete(zoneId)
}

export function getConnectedZoneIds(): ZoneId[] {
  return Array.from(zoneConnections.keys())
}
```

- [ ] **Step 4: Run it and confirm it passes**

```bash
npx vitest run src/main/zoneConnections.test.ts
```

Expected: `Tests 6 passed (6)`.

- [ ] **Step 5: Run the full gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: 335 tests passing (329 + 6 new), 0 lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/main/zoneConnections.ts src/main/zoneConnections.test.ts
git commit -m "feat: pure module tracking which zone screens are currently connected"
```

---

## Task 2: Wire it into the WebSocket server and wf:getInfo

This is the one task in this plan where placement matters more than the code itself — read the "Where exactly to add the new branch" note before editing.

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/renderer/src/browserWfMock.ts`

- [ ] **Step 1: Confirm the zone client already sends `hello` (read-only check, no edit)**

Read `src/main/zoneHtml.ts` around its `connect()` function and confirm it contains:

```js
ws.onopen=function(){ ws.send(JSON.stringify({type:'hello',zone:ZONE})); };
```

`ZONE` is the numeric zone ID (1-4) baked into the page when it was generated. If this line is missing or looks different, STOP — the rest of this task assumes it exists exactly as shown, and the plan's design doc explains why (this was verified while writing this plan, not assumed).

- [ ] **Step 2: Add the shared `ZONE_IDS` constant and the `AppInfo` field**

In `src/shared/types.ts`, find:

```ts
export const ZONE_NAMES: Record<ZoneId, string> = {
  1: 'Back Left',
  2: 'Back Right',
  3: 'Lyrics TVs',
  4: 'Stage Monitors',
}
```

Add immediately after it:

```ts

export const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]
```

Then find `AppInfo`:

```ts
export interface AppInfo {
  song: Song
  state: LiveState
  displays: DisplayInfo[]
  outputs: number
  startupMs: number
  appVersion: string   // package.json version of the running build
  isPackaged: boolean  // false when running via `npm run dev`
}
```

Replace with:

```ts
export interface AppInfo {
  song: Song
  state: LiveState
  displays: DisplayInfo[]
  outputs: number
  zonesConnected: ZoneId[]
  startupMs: number
  appVersion: string   // package.json version of the running build
  isPackaged: boolean  // false when running via `npm run dev`
}
```

(`ZoneId` is declared later in the same file — that's fine, TypeScript type references within a module aren't order-dependent.)

- [ ] **Step 3: Where exactly to add the new branch in `src/main/index.ts`**

Find this block inside `startTabletServer()`'s `wss.on('connection', ...)` handler:

```ts
  wss.on('connection', (ws: WsSocket, req: IncomingMessage) => {
    const remoteIp = req.socket.remoteAddress ?? 'unknown'
    tabletClients.add(ws)
    aliveClients.add(ws)
```

Replace with (adds one new per-connection variable):

```ts
  wss.on('connection', (ws: WsSocket, req: IncomingMessage) => {
    const remoteIp = req.socket.remoteAddress ?? 'unknown'
    // Set when this connection's zone identifies itself via `hello` — used
    // both to feed zoneConnections and to know which entry to release if
    // this exact socket later closes (see the close/error handlers below).
    let helloZoneId: ZoneId | null = null
    tabletClients.add(ws)
    aliveClients.add(ws)
```

Now find the message handler's type declaration and its `auth` branch:

```ts
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type: string; intent?: string; itemId?: number; pin?: string }

        if (msg.type === 'auth') {
```

Replace with (widens the parsed shape to include `zone`, and inserts the new `hello` branch BEFORE the `auth` branch and, critically, before the auth-required guard further down):

```ts
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type: string; intent?: string; itemId?: number; pin?: string; zone?: number }

        // Zone screens never authenticate — they're a read-only display, not
        // a control surface — so this must be handled and return here, ahead
        // of the "everything below requires auth" guard a few lines down.
        // Placing it after that guard would mean a zone's hello silently hits
        // the same authResult:false dead end its already-sent-but-unread
        // hello hits today (see the 2026-08-02 design spec).
        if (msg.type === 'hello' && typeof msg.zone === 'number' && Number.isInteger(msg.zone) && msg.zone >= 1 && msg.zone <= 4) {
          helloZoneId = msg.zone as ZoneId
          markZoneConnected(helloZoneId, ws)
          return
        }

        if (msg.type === 'auth') {
```

Do not change anything else inside the `auth` branch or the `authedTabletClients` guard below it — this task only adds the new branch ahead of them.

- [ ] **Step 4: Clean up on disconnect**

Find:

```ts
    ws.on('close', () => { tabletClients.delete(ws); aliveClients.delete(ws) })
    ws.on('error', () => { tabletClients.delete(ws); aliveClients.delete(ws) })
  })
```

Replace with:

```ts
    ws.on('close', () => {
      tabletClients.delete(ws)
      aliveClients.delete(ws)
      if (helloZoneId !== null) markZoneDisconnected(helloZoneId, ws)
    })
    ws.on('error', () => {
      tabletClients.delete(ws)
      aliveClients.delete(ws)
      if (helloZoneId !== null) markZoneDisconnected(helloZoneId, ws)
    })
  })
```

- [ ] **Step 5: Add the import**

Near the other local imports at the top of `src/main/index.ts` (alongside `./roomFeedPrecedence` or similar), add:

```ts
import { markZoneConnected, markZoneDisconnected, getConnectedZoneIds } from './zoneConnections'
```

- [ ] **Step 6: Expose it on `wf:getInfo`**

Find:

```ts
ipcMain.handle('wf:getInfo', (): AppInfo => ({
  song: tracks.main.song,
  state: renderState('main'),
  displays: describeDisplays(),
  outputs: outputWins.size,
  startupMs: Date.now() - startTime,
  appVersion: app.getVersion(),
  isPackaged: app.isPackaged
}))
```

Replace with:

```ts
ipcMain.handle('wf:getInfo', (): AppInfo => ({
  song: tracks.main.song,
  state: renderState('main'),
  displays: describeDisplays(),
  outputs: outputWins.size,
  zonesConnected: getConnectedZoneIds(),
  startupMs: Date.now() - startTime,
  appVersion: app.getVersion(),
  isPackaged: app.isPackaged
}))
```

- [ ] **Step 7: Update the browser-preview mock**

In `src/renderer/src/browserWfMock.ts`, find:

```ts
function appInfo(): AppInfo {
  return {
    song: { title: liveState.songTitle, lines: demoLines, background: liveState.background },
    state: clone(liveState),
    displays,
    outputs: 0,
    startupMs: 0,
    appVersion: '0.0.0-browser',
    isPackaged: false
  }
```

Replace with:

```ts
function appInfo(): AppInfo {
  return {
    song: { title: liveState.songTitle, lines: demoLines, background: liveState.background },
    state: clone(liveState),
    displays,
    outputs: 0,
    zonesConnected: [],
    startupMs: 0,
    appVersion: '0.0.0-browser',
    isPackaged: false
  }
```

- [ ] **Step 8: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 335 tests, 0 lint errors. Typecheck is the meaningful check here — it will immediately catch a missed `AppInfo` field or a type mismatch on `helloZoneId`/`msg.zone`.

- [ ] **Step 9: Commit**

```bash
git add src/main/index.ts src/shared/types.ts src/renderer/src/browserWfMock.ts
git commit -m "feat: read the zone client's existing hello message to track real connections"
```

---

## Task 3: HomeView — combined screen count with named missing zones

**Files:**
- Modify: `src/renderer/src/HomeView.tsx`

- [ ] **Step 1: Update imports**

Find:

```tsx
import type { View } from './AppShell'
import type { AppInfo, ObsStatus } from '../../shared/types'
import { useService } from './ServiceContext'
```

Replace with:

```tsx
import type { View } from './AppShell'
import type { AppInfo, ObsStatus, ZoneId } from '../../shared/types'
import { ZONE_IDS, ZONE_NAMES } from '../../shared/types'
import { useService } from './ServiceContext'
```

- [ ] **Step 2: Track zone connectivity**

Find:

```tsx
  const { activeService } = useService()
  const [outputs, setOutputs] = useState(0)
  const [rehearsal, setRehearsal] = useState(false)
```

Replace with:

```tsx
  const { activeService } = useService()
  const [outputs, setOutputs] = useState(0)
  const [zonesConnected, setZonesConnected] = useState<ZoneId[]>([])
  const [rehearsal, setRehearsal] = useState(false)
```

- [ ] **Step 3: Fetch it alongside outputs**

Find:

```tsx
  useEffect(() => {
    const load = (): void => {
      window.wf.getInfo().then((i: AppInfo) => setOutputs(i.outputs))
      window.wf.getRehearsalMode().then(setRehearsal)
    }
```

Replace with:

```tsx
  useEffect(() => {
    const load = (): void => {
      window.wf.getInfo().then((i: AppInfo) => { setOutputs(i.outputs); setZonesConnected(i.zonesConnected) })
      window.wf.getRehearsalMode().then(setRehearsal)
    }
```

- [ ] **Step 4: Combine into one check, naming missing zones**

Find:

```tsx
  const checks: { level: PreflightLevel; label: string }[] = [
    rehearsal
      ? { level: 'warn', label: 'Rehearsal mode is armed — real outputs are showing nothing' }
      : { level: 'ok', label: 'Rehearsal mode off' },
    outputs > 0
      ? { level: 'ok', label: `${outputs} output${outputs !== 1 ? 's' : ''} connected` }
      : { level: 'warn', label: 'No outputs connected yet' },
    activeService
      ? { level: 'ok', label: `"${activeService.name}" loaded` }
      : { level: 'warn', label: 'No service loaded yet' },
    { level: obs?.connected ? 'ok' : 'info', label: obs?.connected ? 'OBS connected' : 'OBS not connected' }
  ]
```

Replace with:

```tsx
  const screenCount = outputs + zonesConnected.length
  const missingZoneNames = ZONE_IDS.filter((id) => !zonesConnected.includes(id)).map((id) => ZONE_NAMES[id])

  const checks: { level: PreflightLevel; label: string }[] = [
    rehearsal
      ? { level: 'warn', label: 'Rehearsal mode is armed — real outputs are showing nothing' }
      : { level: 'ok', label: 'Rehearsal mode off' },
    screenCount === 0
      ? { level: 'warn', label: 'No screens connected yet' }
      : missingZoneNames.length > 0
      ? { level: 'warn', label: `${screenCount} screen${screenCount !== 1 ? 's' : ''} connected — ${missingZoneNames.join(', ')} not connected` }
      : { level: 'ok', label: `${screenCount} screen${screenCount !== 1 ? 's' : ''} connected` },
    activeService
      ? { level: 'ok', label: `"${activeService.name}" loaded` }
      : { level: 'warn', label: 'No service loaded yet' },
    { level: obs?.connected ? 'ok' : 'info', label: obs?.connected ? 'OBS connected' : 'OBS not connected' }
  ]
```

- [ ] **Step 5: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 335 tests, 0 lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/HomeView.tsx
git commit -m "feat: Home preflight combines outputs and zones, names missing screens"
```

---

## Task 4: TopBar — combined screen count in the live-status badge

**Files:**
- Modify: `src/renderer/src/TopBar.tsx`

- [ ] **Step 1: Update imports**

Find:

```tsx
import type { AppInfo, ObsStatus } from '../../shared/types'
import type { View } from './AppShell'
```

Replace with:

```tsx
import type { AppInfo, ObsStatus, ZoneId } from '../../shared/types'
import { ZONE_IDS, ZONE_NAMES } from '../../shared/types'
import type { View } from './AppShell'
```

- [ ] **Step 2: Track zone connectivity**

Find:

```tsx
function TopBar({ view, setView }: { view: View; setView: (v: View) => void }): JSX.Element {
  const [outputs, setOutputs] = useState(0)
  const [build, setBuild] = useState<{ version: string; isPackaged: boolean } | null>(null)
```

Replace with:

```tsx
function TopBar({ view, setView }: { view: View; setView: (v: View) => void }): JSX.Element {
  const [outputs, setOutputs] = useState(0)
  const [zonesConnected, setZonesConnected] = useState<ZoneId[]>([])
  const [build, setBuild] = useState<{ version: string; isPackaged: boolean } | null>(null)
```

- [ ] **Step 3: Fetch it alongside outputs**

Find:

```tsx
  useEffect(() => {
    const load = (): void => {
      window.wf.getInfo().then((i: AppInfo) => {
        setOutputs(i.outputs)
        setBuild({ version: i.appVersion, isPackaged: i.isPackaged })
      })
    }
```

Replace with:

```tsx
  useEffect(() => {
    const load = (): void => {
      window.wf.getInfo().then((i: AppInfo) => {
        setOutputs(i.outputs)
        setZonesConnected(i.zonesConnected)
        setBuild({ version: i.appVersion, isPackaged: i.isPackaged })
      })
    }
```

- [ ] **Step 4: Derive the combined count and missing names**

Find:

```tsx
  const onAir = Boolean(obs?.streaming || obs?.recording)
```

Replace with:

```tsx
  const screenCount = outputs + zonesConnected.length
  const missingZoneNames = ZONE_IDS.filter((id) => !zonesConnected.includes(id)).map((id) => ZONE_NAMES[id])

  const onAir = Boolean(obs?.streaming || obs?.recording)
```

- [ ] **Step 5: Use it in the badge**

Find:

```tsx
        ) : outputs > 0 ? (
          <div className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 ring-1 ring-red-500/30" title="Real screens are connected — anything sent live reaches the congregation">
            <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-red-500" />
            <span className="text-xs font-bold uppercase tracking-wide text-red-700">
              Live armed · {outputs} screen{outputs !== 1 ? 's' : ''}
            </span>
          </div>
        ) : (
```

Replace with:

```tsx
        ) : screenCount > 0 ? (
          <div
            className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 ring-1 ring-red-500/30"
            title={missingZoneNames.length > 0
              ? `Real screens are connected — anything sent live reaches the congregation. Not connected: ${missingZoneNames.join(', ')}.`
              : 'Real screens are connected — anything sent live reaches the congregation'}
          >
            <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-red-500" />
            <span className="text-xs font-bold uppercase tracking-wide text-red-700">
              Live armed · {screenCount} screen{screenCount !== 1 ? 's' : ''}
            </span>
          </div>
        ) : (
```

The `outputs === 0` fallback branch (the grey "No output" state with the "Open on projector" button) is unchanged — leave it exactly as it is. That button opens a local output window, which is a different action than anything this task covers.

- [ ] **Step 6: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 335 tests, 0 lint errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/TopBar.tsx
git commit -m "feat: top bar status badge combines outputs and zones, missing zones in tooltip"
```

---

## Task 5: Manual verification

No more code changes. This task is entirely **[manual]** — this sandbox cannot launch Electron and has no real zone Pi to connect. Ask the user to run through this list before trusting the new indicator.

- [ ] **Step 1: Cold start, nothing connected**

Open the app with no zone pages open anywhere. Confirm Home shows "No screens connected yet" (not a stale count, not a crash) and the top bar shows the grey "No output" state.

- [ ] **Step 2: One zone connects**

Open one zone page in a browser (e.g. `http://<ip>:<port>/zone/1`). Within about 2 seconds (the existing poll interval), confirm Home and the top bar both update to show 1 screen connected, and that the missing-zone message names the other three by name (Back Right, Lyrics TVs, Stage Monitors).

- [ ] **Step 3: All 4 zones connect**

Open all 4 zone pages. Confirm both Home and the top bar show "4 screens connected" with no missing-zone warning, and that the top bar badge's tooltip no longer mentions any missing screens.

- [ ] **Step 4: Clean disconnect**

Close one zone page's browser tab. Confirm the count drops by 1 and that zone's name reappears in the missing list within the poll interval.

- [ ] **Step 5: Unclean disconnect**

Disconnect a zone Pi's network without closing its browser tab (unplug it, or kill WiFi). Confirm the count eventually drops once the existing 30-second heartbeat notices — this is expected to take up to ~32 seconds, not be instant.

- [ ] **Step 6: Diagnostics is unaffected**

Confirm Setup → Diagnostics & backups still shows its own local-output count exactly as it did before this change — this feature doesn't touch that screen.

---

## Self-review notes

**Spec coverage.** Architecture (§1) → Task 2 wires exactly the flow described (existing client hello → server tracking → `wf:getInfo`). Component structure (§2) → every file listed in the spec's "Changed"/"Created" tables has a task; `zoneHtml.ts` is explicitly confirmed unchanged (Task 2 Step 1) rather than silently skipped. Data flow (§3) → Task 2's placement note directly addresses the auth-guard ordering risk called out in the spec. Error handling (§4) → malformed hello validation (Task 2 Step 3's `Number.isInteger`/range check), reconnect-race handling (Task 1's tests), and server-restart behavior (inherent to `zoneConnections`' module-level Map starting empty, no extra code needed) are all covered. Testing (§5) → Task 1 is exactly the pure-module extraction the spec calls for; Task 5 covers the spec's 6-step manual list one-to-one.

**Non-goals respected.** No change to `zoneHtml.ts`, `computeZoneStates()`, zone routing/pinning, `DiagnosticsTab.tsx`, or the heartbeat cadence — none of those files appear in any task's file list, and Task 5 Step 6 explicitly re-confirms Diagnostics is untouched.

**Type consistency check.** `markZoneConnected(zoneId: ZoneId, socket: unknown)` / `markZoneDisconnected(zoneId: ZoneId, socket: unknown)` / `getConnectedZoneIds(): ZoneId[]` (Task 1) are the exact names and signatures Task 2 imports and calls — no renaming between definition and use. `AppInfo.zonesConnected: ZoneId[]` (Task 2) is read identically as `i.zonesConnected` in both Task 3 (`HomeView.tsx`) and Task 4 (`TopBar.tsx`), and stubbed with the same type-correct empty array (`zonesConnected: []`) in Task 2's `browserWfMock.ts` update. `ZONE_IDS`/`ZONE_NAMES` (introduced/reused in Task 2 Step 2) are imported with matching names in both Task 3 and Task 4. `screenCount`/`missingZoneNames` are computed with the identical expression (`outputs + zonesConnected.length` / `ZONE_IDS.filter(...).map(...)`) in both `HomeView.tsx` and `TopBar.tsx` — not accidentally diverging logic in two places that both claim to answer the same question.
