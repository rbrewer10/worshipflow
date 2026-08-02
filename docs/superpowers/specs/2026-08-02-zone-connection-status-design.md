# Zone connection status — design

**Date:** 2026-08-02
**App:** WorshipFlow Pro (Electron + React)
**Status:** Design approved, ready for implementation plan

## Context

The Home screen's preflight checklist and the top bar's live-status badge both
key off `AppInfo.outputs` (`wf:getInfo().outputs`, backed by `outputWins.size`
in `src/main/index.ts`) to tell the operator whether real screens are
connected. `outputWins` only ever holds local Electron `BrowserWindow`s opened
on monitors directly attached to the booth computer (`createOutput()`,
`layoutOutputs()`) — it has no relationship to the four networked zone
screens (Back Left, Back Right, Lyrics TVs, Stage Monitors) this church
actually uses.

This is the same root cause as the Live tab's "Main Audience Output" box,
fixed earlier tonight (`docs/superpowers/specs/2026-08-01-live-zone-status-widget-design.md`)
— except that fix only touched the Live tab. `HomeView.tsx`'s preflight
("No outputs connected yet") and `TopBar.tsx`'s status badge ("Live armed ·
N screens" / a grey "not connected" state) still read the same always-zero
counter, so both permanently under-report this church's actual live status,
every time the app is open — not just during a service.

Confirmed by reading `layoutOutputs()`, not assumed: when the app finds no
monitors directly attached beyond the primary display, it does **not** create
any output windows at all — it explicitly falls back to zones/multiview
instead (the code's own comment: "Nothing to fill, so show the four zones
rather than a stray output window"). Outputs and zones are already treated as
alternatives to each other by the app's own logic, not two independent
concepts that need to coexist ambiguously in this fix.

Also confirmed by reading the WebSocket server: zone screens, tablet remotes,
and the OBS lyrics overlay all connect to the same `wss` (`src/main/index.ts`,
`startTabletServer()`) with no way for the server to tell them apart — no
zone ID is ever sent by a zone page today. Building an accurate zone-specific
count requires a small identification handshake; there's no way to derive it
from data that already exists.

## Decisions locked with the user

- **Build real tracking, not a workaround.** Add a client→server handshake so
  each zone screen identifies itself on connect, rather than papering over the
  symptom with different wording.
- **Name the missing screens, not just a count.** When fewer than 4 zones are
  connected, the warning names which ones (e.g. "Stage Monitors not
  connected") — actionable before a service, not just "something's off."
- **Combine outputs + zones into one number.** Home/top bar show a single
  "screens connected" count summing both mechanisms — an operator doesn't
  care about the internal distinction, only whether real screens are showing
  anything. Justified by the `layoutOutputs()` finding above: the two are
  already mutually exclusive by the app's own design, not overlapping
  concepts that need separate treatment.
- **`DiagnosticsTab.tsx` is not touched.** Its own use of `outputs` is
  specifically about confirming a locally-attached monitor is plugged in and
  detected — a legitimately different, narrower question than "are my zone
  screens up," and outside this fix's scope.

## Design

### 1. Architecture

```
 Zone Pi (browser)                      Main process                    Renderer (Home/TopBar)
 ┌──────────────┐   ws open + hello    ┌─────────────────────┐  wf:getInfo  ┌────────────────────┐
 │ /zone/2 page  │─────────────────────▶│ zoneConnections Map  │─────────────▶│ combined "N screens │
 │ (zoneHtml.ts) │  {kind:'zone',       │ (ZoneId → WsSocket)  │  zonesConnected│  connected" + named │
 └──────────────┘   zoneId: 2}         └─────────────────────┘  ZoneId[]     │  missing zones      │
                                                                              └────────────────────┘
```

Same WebSocket server every zone page already connects to — no new port, no
new endpoint. Just one new message type on an existing connection, and one
new field on an existing IPC response.

### 2. Component structure

**Changed:**

- `src/main/zoneHtml.ts` — the zone page's client-side JS sends
  `{ type: 'hello', kind: 'zone', zoneId }` immediately after its existing
  `new WebSocket('ws://'+location.host)` call opens. `zoneId` is already a
  value baked into the generated page (it's how `zoneHtmlFor(zoneId, ...)`
  renders the page in the first place) — no new data needed, just sending
  something that already exists.
- `src/main/index.ts`:
  - New `const zoneConnections = new Map<ZoneId, WsSocket>()` alongside the
    existing `tabletClients`/`authedTabletClients` sets, declared in the same
    scope as `startTabletServer()`.
  - Inside `wss.on('connection', (ws, req) => {...})`, a per-connection
    `let helloZoneId: ZoneId | null = null` closure variable. The existing
    `ws.on('message', ...)` handler gains a new branch: `msg.type === 'hello'
    && msg.kind === 'zone'` validates `msg.zoneId` is `1|2|3|4`, sets
    `helloZoneId`, and does `zoneConnections.set(helloZoneId, ws)`.
  - The existing `ws.on('close', ...)` / `ws.on('error', ...)` handlers gain
    one line each: if `helloZoneId !== null && zoneConnections.get(helloZoneId)
    === ws`, delete that entry. The `=== ws` check matters — if a zone Pi
    reconnects (new socket registers the same zoneId) before the old socket's
    close event fires, the old handler must not delete the newer, live
    connection.
  - The existing 30s heartbeat loop (which already force-terminates dead
    sockets that missed a pong) needs no changes — it operates on
    `tabletClients`, and the `close`/`error` cleanup above already handles
    `zoneConnections` whenever a socket actually closes, including a
    heartbeat-forced `ws.terminate()`.
  - `wf:getInfo`'s handler adds `zonesConnected: Array.from(zoneConnections.keys())`
    to its returned `AppInfo`.
- `src/shared/types.ts` — `AppInfo` gains `zonesConnected: ZoneId[]`.
- `src/renderer/src/HomeView.tsx` — the preflight check derives
  `const screenCount = outputs + zonesConnected.length` and
  `const missingZones = ([1,2,3,4] as ZoneId[]).filter(id => !zonesConnected.includes(id))`.
  The existing "No outputs connected yet" / "N outputs connected" check
  becomes: `screenCount > 0` → ok, naming `missingZones.map(id => ZONE_NAMES[id])`
  if any are missing even while some are connected; `screenCount === 0` → warn,
  "No screens connected yet."
- `src/renderer/src/TopBar.tsx` — same combined `screenCount` derivation,
  feeding the existing "Live armed · N screens" / grey "not connected" badge.
  Missing-zone names surface in the badge's `title` tooltip rather than the
  compact badge text itself, keeping the top bar's fixed-height single-line
  layout intact.

**Not touched:** `DiagnosticsTab.tsx` (per the locked decision above),
`layoutOutputs()`/`createOutput()` (the local-output mechanism itself is
unchanged — this only adds a second source of truth alongside it),
`computeZoneStates()` and everything about what content a zone shows (this is
purely about connection presence, not content).

### 3. Data flow

1. A zone Pi loads `/zone/2`, gets `zoneHtmlFor(2, ...)`, and its embedded JS
   opens a WebSocket to the same host, same as it already does today.
2. Immediately after `ws.onopen`, the page sends the new `hello` message.
   This happens once per connection, not repeated.
3. Main records `zoneConnections.set(2, ws)`. The zone's existing behavior —
   receiving `state`/`zones` broadcasts and rendering — is completely
   unaffected; this is an additive message the server now also understands.
4. Whenever the renderer calls `window.wf.getInfo()` (both `HomeView.tsx` and
   `TopBar.tsx` already poll this every 2 seconds), it now includes which
   zone IDs are currently connected.
5. If the Pi loses power or network, its socket eventually closes (either
   cleanly, or forcibly by the 30s heartbeat once it stops responding to
   pings) and `zoneConnections` drops that entry on the next `getInfo` poll's
   read — within at most ~32 seconds of an actual disconnect (2s poll +
   30s heartbeat worst case), which is an acceptable latency for a status
   indicator, not a real-time alarm.

### 4. Error handling

- **A non-zone client (tablet remote, OBS overlay) sends unexpected message
  types:** already handled — the existing `ws.on('message')` handler only
  acts on message types it recognizes and silently ignores the rest (this is
  existing behavior, unchanged).
- **Malformed `hello` (missing/invalid `zoneId`):** the handler validates
  `msg.zoneId` is one of `1|2|3|4` before registering anything; anything else
  is ignored, same permissive-but-safe posture the existing `auth`/`intent`
  handlers already take toward malformed messages.
- **Duplicate hello from the same zone (e.g. a Pi's browser reloads without a
  clean disconnect first):** `zoneConnections.set()` on an existing key just
  overwrites the value — the newer socket becomes the tracked one, matching
  the reconnect-race handling described in the component structure section.
- **Server restart:** `zoneConnections` is a fresh empty Map on every process
  start, same as `tabletClients` — zones simply reconnect and re-hello within
  moments, same as they already reconnect their WebSocket after a restart
  today (`zoneHtml.ts`'s existing reconnect-with-backoff logic, unchanged).

### 5. Testing

- `zoneConnections` tracking itself (add on hello, remove on close/error,
  overwrite on reconnect) is reasonably close to pure state management and
  could be extracted into a small standalone module with unit tests — e.g.
  `src/main/zoneConnections.ts` exporting `markZoneConnected(id, ws)` /
  `markZoneDisconnected(id, ws)` / `getConnectedZoneIds()`, tested with fake
  socket objects (just needs object identity, not a real `WsSocket`). This
  mirrors this session's earlier precedent (`roomFeedPrecedence.ts`) of
  pulling the one genuinely-testable piece out of otherwise
  WebSocket/Electron-only code.
- The WebSocket message handling itself, `zoneHtml.ts`'s client-side change,
  and the `HomeView.tsx`/`TopBar.tsx` UI changes are not unit-testable under
  this repo's Node-only Vitest config, consistent with everything else
  touching the tablet/zone server and the live-status UI.
- Manual verification (this sandbox cannot launch Electron or connect a real
  zone Pi):
  1. Open the app with no zone pages loaded anywhere. Confirm Home/top bar
     show "0 screens connected" / "No screens connected yet" (or equivalent),
     not a stale or crashed state.
  2. Open one zone page in a browser (e.g. `http://<ip>:<port>/zone/1`).
     Confirm Home/top bar update to show 1 screen connected within ~2 seconds,
     and if fewer than 4, that the specific missing zone names appear.
  3. Open all 4 zone pages. Confirm "4/4" / no missing-zone warning.
  4. Close one zone page's browser tab (a clean disconnect). Confirm the
     count drops and that zone's name reappears in the missing list within
     the poll interval.
  5. Kill a zone Pi's network connection without closing its tab (an unclean
     disconnect). Confirm the count still eventually drops once the 30s
     heartbeat notices — this is the "at most ~32s" latency case, not
     instant, and that's expected.
  6. Confirm `DiagnosticsTab.tsx`'s own display is unaffected — still shows
     the raw local-output count exactly as it did before this change.

## Non-goals

- Real-time (sub-second) disconnect detection — the existing 30s heartbeat
  cadence is inherited as-is, not tightened for this feature.
- Any change to what content a zone shows, `computeZoneStates()`, or zone
  routing/pinning.
- Any change to `DiagnosticsTab.tsx`'s existing "Displays" section.
- Distinguishing *why* a zone isn't connected (network down vs. Pi off vs.
  browser crashed) — only whether it currently is.
- Tracking connections for the tablet remote or OBS overlay the same way —
  this is scoped to zone screens specifically, since those are the ones this
  feature's status indicators care about.

## Success criteria

Home screen and the top bar accurately reflect how many real screens
(zones + any local outputs) are actually connected right now, for a
zone-only setup as much as a local-output one. When fewer than all 4 zones
are connected, the specific missing screens are named, not just counted.
`DiagnosticsTab.tsx` is unaffected. No change to zone content or routing.
