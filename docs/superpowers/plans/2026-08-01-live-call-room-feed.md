# Live Call Room Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send a camera and the church's mixer audio back to a tablet in front of the remote preacher, on a second signaling room, independent of whether his own outbound Live Call is active.

**Architecture:** A new room (`'room-feed'`) on the exact WebSocket signaling server Live Call already runs — confirmed the server needs zero changes, since `LivecallRooms` is already a generic multi-room state machine. The WorshipFlow renderer captures a chosen camera + audio input via `getUserMedia`, joins as the `receiver` role (the same hub role the control machine already plays for the outbound call), and pushes both tracks straight onto each viewer's peer connection — no pre-negotiation dance is needed here, unlike the outbound relay, because the local stream is guaranteed to exist before any viewer can connect. The tablet loads a small new static page, served the same way the phone client already is, that joins as a `viewer` and plays what arrives.

**Tech Stack:** Electron 33, React 18, TypeScript, `ws` (Node WebSocket server, unchanged), browser `RTCPeerConnection`/`getUserMedia`, `qrcode` (already a dependency), Vitest (Node-only pure-logic tests).

**Spec:** `docs/superpowers/specs/2026-08-01-live-call-room-feed-design.md`

---

## Before you start

Mandatory gate before every commit:

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

As of this plan, that gate passes with **326 tests, 0 lint errors**. Do not commit if any of the four fails.

Repo conventions already established this session, still in force:

1. **Never `git add -A` or `git add .`.** Stage only the exact files each task names.
2. **This sandbox cannot launch Electron** (`app.requestSingleInstanceLock()` fails with no interactive desktop). Tasks needing a real window, a real camera, or a real second device are marked **[manual]** — verified by the user, not by you.
3. Prefer editing existing files over new ones, but this feature genuinely needs several new files — each one is scoped to a single responsibility, matching how `LiveCallRelay.ts`/`LiveCallViewer.ts`/`phoneClientHtml.ts` are already split.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/renderer/src/livecall/iceServers.ts` | The one-line `ICE_SERVERS` config, extracted so a third consumer doesn't copy it a third time. |
| `src/main/roomFeedPrecedence.ts` | Pure module: is the room feed currently capturing? The one thing about this feature that's actually unit-testable. |
| `src/main/roomFeedPrecedence.test.ts` | Tests for the above. |
| `src/main/roomFeedViewerHtml.ts` | The static page the tablet loads. Video-only viewer, no capture. |
| `src/renderer/src/livecall/RoomFeedSender.ts` | Captures local devices, joins as `receiver`, fans tracks out to viewers. |
| `src/renderer/src/livecall/useRoomFeed.ts` | React binding for `RoomFeedSender`, with explicit start/stop (not auto-started, unlike `useLiveCall`'s relay). |
| `src/renderer/src/setup/RoomFeedTab.tsx` | New Setup destination: device pickers, Start/Stop, QR code, status. |

**Modified:**

| File | Change |
|---|---|
| `src/renderer/src/livecall/LiveCallRelay.ts` | Imports `ICE_SERVERS` instead of declaring its own copy. |
| `src/renderer/src/livecall/LiveCallViewer.ts` | Same. |
| `src/main/sound-check/sound-check-ipc.ts` | `startAudioCapture` checks room-feed precedence before starting. |
| `src/renderer/src/sound-check/EngineerDashboard.tsx` | Surfaces the block reason instead of discarding it. |
| `src/main/index.ts` | New `wf:roomfeed:config` and `wf:roomfeed:notifyCapturing` handlers; new `/room-feed` HTTP route. |
| `src/preload/index.ts` | Bindings for the two new IPC calls; widens `startAudioCapture`'s return type. |
| `src/renderer/src/AppShell.tsx` | New `'roomfeed'` view. |
| `src/renderer/src/TopBar.tsx` | New Setup menu entry. |

**Not touched:** `src/main/livecallRooms.ts`, `src/main/livecallSignaling.ts`, the WebSocket upgrade router, `LiveCallEditor.tsx`, `useLiveCall.ts`, `doLoadLiveCall`, `canGoLive`/`sendItemLive`, and everything about how the outbound call reaches zone screens and output windows.

---

## Task 1: Extract the shared ICE server config

`ICE_SERVERS` is declared identically in `LiveCallRelay.ts` and `LiveCallViewer.ts`. Task 7 adds a third identical copy in `RoomFeedSender.ts` if this isn't fixed first — the moment to stop duplicating it.

**Files:**
- Create: `src/renderer/src/livecall/iceServers.ts`
- Modify: `src/renderer/src/livecall/LiveCallRelay.ts`
- Modify: `src/renderer/src/livecall/LiveCallViewer.ts`

- [ ] **Step 1: Create the shared module**

Create `src/renderer/src/livecall/iceServers.ts`:

```ts
// Shared by every WebRTC peer connection in Live Call and the room feed.
// Tailscale host candidates are the real path for both features; this STUN
// entry is a best-effort fallback and is not required for the tailnet to work.
export const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
```

- [ ] **Step 2: Update LiveCallRelay.ts**

In `src/renderer/src/livecall/LiveCallRelay.ts`, replace:

```ts
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
```

with:

```ts
import { ICE_SERVERS } from './iceServers'
```

Move this import to the top of the file, alongside no other imports currently exist in this file — it becomes the file's first line.

- [ ] **Step 3: Update LiveCallViewer.ts**

In `src/renderer/src/livecall/LiveCallViewer.ts`, replace:

```ts
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
```

with:

```ts
import { ICE_SERVERS } from './iceServers'
```

Same placement — first line of the file.

- [ ] **Step 4: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 326 tests (no new tests yet), 0 lint errors. This step only moves a constant — if typecheck fails, the import path is wrong, not the logic.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/livecall/iceServers.ts src/renderer/src/livecall/LiveCallRelay.ts src/renderer/src/livecall/LiveCallViewer.ts
git commit -m "refactor: share one ICE server config across the two Live Call peers"
```

---

## Task 2: Pure room-feed precedence module

Sound Check's `AudioCapture` (native, via the `mic` package) and the room feed's `getUserMedia` capture go through two entirely different OS audio paths. Proving "is this actually the same physical device" across both is a hard, unreliable problem — the design deliberately sidesteps it with a blanket rule instead: room feed always wins, full stop. This task builds the one piece of that rule worth unit testing: a plain flag, kept out of `SoundCheckState` on purpose so testing it doesn't require instantiating that class's native-module dependencies (`YamahaController`, `AudioCapture` itself) just to test a boolean.

**Files:**
- Create: `src/main/roomFeedPrecedence.ts`
- Test: `src/main/roomFeedPrecedence.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/roomFeedPrecedence.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { isRoomFeedActive, setRoomFeedActive } from './roomFeedPrecedence'

describe('roomFeedPrecedence', () => {
  beforeEach(() => { setRoomFeedActive(false) })

  it('starts inactive', () => {
    expect(isRoomFeedActive()).toBe(false)
  })

  it('reflects the last value set', () => {
    setRoomFeedActive(true)
    expect(isRoomFeedActive()).toBe(true)
    setRoomFeedActive(false)
    expect(isRoomFeedActive()).toBe(false)
  })

  it('setting the same value twice is harmless', () => {
    setRoomFeedActive(true)
    setRoomFeedActive(true)
    expect(isRoomFeedActive()).toBe(true)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx vitest run src/main/roomFeedPrecedence.test.ts
```

Expected: fails to collect — `Failed to resolve import "./roomFeedPrecedence"`.

- [ ] **Step 3: Write the module**

Create `src/main/roomFeedPrecedence.ts`:

```ts
// Whether the room feed (camera + mixer audio to the remote preacher's
// tablet) is currently capturing. A plain module-level flag, deliberately
// kept out of SoundCheckState: the two features' arbitration rule is "room
// feed always wins, unconditionally" — see the 2026-08-01 design spec for
// why this doesn't try to prove the two capture paths are fighting over the
// literal same device. sound-check-ipc.ts reads this to block Sound Check's
// own start; index.ts's wf:roomfeed:notifyCapturing handler is the only writer.
let roomFeedActive = false

export function setRoomFeedActive(active: boolean): void {
  roomFeedActive = active
}

export function isRoomFeedActive(): boolean {
  return roomFeedActive
}
```

- [ ] **Step 4: Run it and confirm it passes**

```bash
npx vitest run src/main/roomFeedPrecedence.test.ts
```

Expected: `Tests 3 passed (3)`.

- [ ] **Step 5: Run the full gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: 329 tests passing (326 + 3 new), 0 lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/main/roomFeedPrecedence.ts src/main/roomFeedPrecedence.test.ts
git commit -m "feat: pure module for the room-feed/sound-check precedence rule"
```

---

## Task 3: Wire precedence into Sound Check

**Files:**
- Modify: `src/main/sound-check/sound-check-ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/sound-check/EngineerDashboard.tsx`
- Modify: `src/renderer/src/browserWfMock.ts`

- [ ] **Step 1: Block Sound Check's start handler**

In `src/main/sound-check/sound-check-ipc.ts`, add the import at the top of the file, alongside the existing imports:

```ts
import { isRoomFeedActive } from '../roomFeedPrecedence'
```

Replace:

```ts
  ipcMain.handle('wf:sound-check:startAudioCapture', async (_e, deviceId?: string) => {
    await state.audioCapture.start(deviceId)
    return { success: true }
  })
```

with:

```ts
  ipcMain.handle('wf:sound-check:startAudioCapture', async (_e, deviceId?: string) => {
    if (isRoomFeedActive()) {
      return { success: false, reason: 'The room feed is using the audio input right now — stop it first.' }
    }
    await state.audioCapture.start(deviceId)
    return { success: true }
  })
```

- [ ] **Step 2: Widen the preload return type**

In `src/preload/index.ts`, replace:

```ts
    startAudioCapture: (deviceId?: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('wf:sound-check:startAudioCapture', deviceId),
```

with:

```ts
    startAudioCapture: (deviceId?: string): Promise<{ success: boolean; reason?: string }> =>
      ipcRenderer.invoke('wf:sound-check:startAudioCapture', deviceId),
```

- [ ] **Step 3: Match the browser-preview mock's type**

In `src/renderer/src/browserWfMock.ts`, find `startAudioCapture` and confirm its return type still satisfies `Promise<{ success: boolean; reason?: string }>`. It currently returns `{ success: true }` unconditionally, which already satisfies the widened type (`reason` is optional) — no change needed here. Run `npm run typecheck` after Step 2 to confirm this file doesn't error; if it does, the mock's declared return type needs updating to match, but based on reading it now, it should not.

- [ ] **Step 4: Surface the reason in the UI**

In `src/renderer/src/sound-check/EngineerDashboard.tsx`, replace:

```ts
      } else {
        await window.wf.soundCheck.startAudioCapture()
        if (mountedRef.current) setIsCapturing(true)
```

with:

```ts
      } else {
        const result = await window.wf.soundCheck.startAudioCapture()
        if (!result.success) {
          if (mountedRef.current) setCaptureError(result.reason ?? 'Could not start audio capture.')
          return
        }
        if (mountedRef.current) { setCaptureError(null); setIsCapturing(true) }
```

Locate this by finding the `toggleAudioCapture` function (search `const toggleAudioCapture`); the `else` branch is the one calling `startAudioCapture()`, immediately after the `if (isCapturing)` branch that calls `stopAudioCapture()`.

- [ ] **Step 5: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 329 tests, 0 lint errors. Typecheck is the meaningful check here — it will catch a mismatched return type immediately.

- [ ] **Step 6: Commit**

```bash
git add src/main/sound-check/sound-check-ipc.ts src/preload/index.ts src/renderer/src/sound-check/EngineerDashboard.tsx
git commit -m "feat: block Sound Check capture while the room feed is active"
```

(If Step 3 required a change to `browserWfMock.ts`, add it to this commit too.)

---

## Task 4: `wf:roomfeed:config` — the connection info the sender and the QR code both need

Mirrors `wf:livecall:config` exactly, reusing the same `LivecallConfig` type rather than adding a parallel one — a room-feed config and a live-call config carry identical fields (`url`, `phoneUrl`, `phoneUrlIsSecure`, `tabletPort`, `token`, `room`), just with `room: 'room-feed'` and `phoneUrl` pointing at `/room-feed` instead of `/phone`. Reusing `LivecallConfig` here is deliberate, not an oversight — a second, identical type would just be one more thing to keep in sync.

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add the handler**

In `src/main/index.ts`, find the existing `wf:livecall:config` handler:

```ts
ipcMain.handle('wf:livecall:config', async (): Promise<LivecallConfig> => {
  // Prefer the Tailscale HTTPS name: it is the only address a phone will grant
  // camera access on, and the only one reachable when he is out of town.
  const ts = await tailscaleHttpsBase()
  return {
    url: `ws://127.0.0.1:${boundTabletPort}/livecall`,
    phoneUrl: ts ? `${ts}/phone` : `http://${getLocalIp()}:${boundTabletPort}/phone`,
    phoneUrlIsSecure: ts !== null,
    tabletPort: boundTabletPort,
    token: livecallToken(),
    room: 'sanctuary',
  }
})
```

Add immediately after it:

```ts
ipcMain.handle('wf:roomfeed:config', async (): Promise<LivecallConfig> => {
  // Same server, same shared token, same Tailscale-detection logic as the
  // outbound call — just a different room and a different served page.
  const ts = await tailscaleHttpsBase()
  return {
    url: `ws://127.0.0.1:${boundTabletPort}/livecall`,
    phoneUrl: ts ? `${ts}/room-feed` : `http://${getLocalIp()}:${boundTabletPort}/room-feed`,
    phoneUrlIsSecure: ts !== null,
    tabletPort: boundTabletPort,
    token: livecallToken(),
    room: 'room-feed',
  }
})
```

- [ ] **Step 2: Add the preload binding**

In `src/preload/index.ts`, find:

```ts
  livecallConfig: (): Promise<LivecallConfig> =>
    ipcRenderer.invoke('wf:livecall:config'),
```

Add immediately after it:

```ts
  roomFeedConfig: (): Promise<LivecallConfig> =>
    ipcRenderer.invoke('wf:roomfeed:config'),
```

- [ ] **Step 3: Add the browser-preview mock**

In `src/renderer/src/browserWfMock.ts`, find:

```ts
    livecallConfig: async (): Promise<LivecallConfig> => ({
      url: 'ws://127.0.0.1:3691/livecall',
      phoneUrl: 'http://127.0.0.1:3691/phone',
      phoneUrlIsSecure: false,
      tabletPort: 3691,
      token: '',
      room: 'sanctuary',
    }),
```

Add immediately after it:

```ts
    roomFeedConfig: async (): Promise<LivecallConfig> => ({
      url: 'ws://127.0.0.1:3691/livecall',
      phoneUrl: 'http://127.0.0.1:3691/room-feed',
      phoneUrlIsSecure: false,
      tabletPort: 3691,
      token: '',
      room: 'room-feed',
    }),
```

- [ ] **Step 4: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 329 tests, 0 lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/renderer/src/browserWfMock.ts
git commit -m "feat: wf:roomfeed:config IPC handler"
```

---

## Task 5: `wf:roomfeed:notifyCapturing` — enforcing precedence from the renderer

The renderer is what actually knows when `getUserMedia` succeeds or ends (Task 7). Main needs to know too, so it can flip the precedence flag and stop Sound Check's capture. This handler is the boundary between them.

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add the handler in the right scope**

This handler needs `soundCheckState`, and that variable is **not** available at module top level — it's declared inside `app.whenReady().then(async () => { ... })` (starting at line 3366 as of this plan), which is also where `registerSoundCheckHandlers(soundCheckState)` itself is called. A handler placed up near `wf:livecall:config`/`wf:roomfeed:config` (both top-level, outside that callback) cannot see it — those two handlers only need module-level functions and variables (`tailscaleHttpsBase()`, `boundTabletPort`, `livecallToken()`), which is why they don't have this problem.

In `src/main/index.ts`, find:

```ts
  const soundCheckState = new SoundCheckState()
  await soundCheckState.initialize()
  registerSoundCheckHandlers(soundCheckState)
```

Replace with:

```ts
  const soundCheckState = new SoundCheckState()
  await soundCheckState.initialize()
  registerSoundCheckHandlers(soundCheckState)

  ipcMain.handle('wf:roomfeed:notifyCapturing', (_e, active: boolean) => {
    setRoomFeedActive(active)
    // Room feed always wins — see roomFeedPrecedence.ts. Stopping Sound Check
    // here does not restart it when the room feed later stops; the operator
    // starts it again if they still want it.
    if (active && soundCheckState.audioCapture.isActive()) {
      soundCheckState.audioCapture.stop()
    }
  })
```

Add the import at the top of `src/main/index.ts`, alongside other local imports:

```ts
import { setRoomFeedActive } from './roomFeedPrecedence'
```

- [ ] **Step 2: Add the preload binding**

In `src/preload/index.ts`, add next to `roomFeedConfig`:

```ts
  roomFeedNotifyCapturing: (active: boolean): Promise<void> =>
    ipcRenderer.invoke('wf:roomfeed:notifyCapturing', active),
```

- [ ] **Step 3: Add the browser-preview mock**

In `src/renderer/src/browserWfMock.ts`, immediately after the `roomFeedConfig` entry added in Task 4 Step 3, add:

```ts
    roomFeedNotifyCapturing: noop,
```

`noop` (`const noop = async (): Promise<void> => {}`, line 205 as of this plan) is already defined and in scope in this file — every other fire-and-forget mock here already uses it.

- [ ] **Step 4: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 329 tests, 0 lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/renderer/src/browserWfMock.ts
git commit -m "feat: wf:roomfeed:notifyCapturing enforces Sound Check precedence"
```

---

## Task 6: The tablet's viewer page and its HTTP route

**Files:**
- Create: `src/main/roomFeedViewerHtml.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Create the viewer page**

Create `src/main/roomFeedViewerHtml.ts`:

```ts
/**
 * Live Call — room feed viewer page.
 *
 * What the preacher's second tablet loads: a full-bleed video of the room,
 * nothing else. Joins the 'room-feed' room as a viewer — the same role a
 * zone screen already plays for the outbound call — and plays whatever
 * track arrives. No camera, no microphone; the only control is mute, and
 * audio starts muted because mobile browsers block autoplay-with-sound
 * without a user gesture regardless, so defaulting to muted avoids a silent
 * failure reading as "this is broken."
 */

const VIEWER_CSS = `
* { box-sizing: border-box; }
html, body {
  margin: 0; height: 100%; background: #000; overflow: hidden;
  -webkit-user-select: none; user-select: none;
  font-family: -apple-system, system-ui, "Segoe UI", sans-serif;
}
#app { height: 100dvh; position: relative; }
video#feed { width: 100%; height: 100%; object-fit: contain; background: #000; }
.waiting {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: #8b909c; font-size: 15px; text-align: center; padding: 0 32px;
}
.mute-btn {
  position: absolute; right: max(16px, env(safe-area-inset-right)); bottom: max(16px, env(safe-area-inset-bottom));
  padding: 10px 16px; border-radius: 12px; border: none; background: rgba(255,255,255,.14);
  color: #e8e9ec; font-size: 13px; font-weight: 600; -webkit-tap-highlight-color: transparent;
}
.hidden { display: none !important; }
`

const VIEWER_MARKUP = `
<div id="app">
  <video id="feed" autoplay playsinline muted></video>
  <div id="waiting" class="waiting">Waiting for the room feed to start&hellip;</div>
  <button id="btn-mute" class="mute-btn" aria-pressed="true">Unmute</button>
</div>
`

const VIEWER_JS = String.raw`
const els = {
  feed: document.getElementById('feed'),
  waiting: document.getElementById('waiting'),
  btnMute: document.getElementById('btn-mute'),
};

let config = null;
let ws = null;
let pc = null;
let attempt = 0;
let timer = null;

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
];

function connect() {
  if (timer) { clearTimeout(timer); timer = null; }
  ws = new WebSocket(config.url);

  ws.addEventListener('open', () => {
    attempt = 0;
    ws.send(JSON.stringify({ type: 'hello', token: config.token, role: 'viewer', room: config.room }));
  });

  ws.addEventListener('message', async (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'offer') {
      if (pc) pc.close();
      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      pc.addEventListener('track', (e) => {
        els.feed.srcObject = e.streams[0] || new MediaStream([e.track]);
        els.waiting.classList.add('hidden');
      });
      pc.addEventListener('icecandidate', (e) => {
        if (e.candidate) sendSignal({ type: 'ice-candidate', candidate: e.candidate });
      });

      try {
        await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({ type: 'answer', sdp: answer.sdp });
      } catch (e) { /* the sender will re-offer */ }
    } else if (msg.type === 'ice-candidate' && pc && msg.candidate) {
      try { await pc.addIceCandidate(msg.candidate); } catch (e) { /* benign */ }
    }
  });

  ws.addEventListener('close', () => {
    attempt++;
    timer = setTimeout(connect, Math.min(1000 * Math.pow(2, attempt), 15000));
  });
}

function sendSignal(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

els.btnMute.addEventListener('click', () => {
  const nowMuted = !els.feed.muted;
  els.feed.muted = nowMuted;
  els.btnMute.setAttribute('aria-pressed', String(nowMuted));
  els.btnMute.textContent = nowMuted ? 'Unmute' : 'Mute';
});

(function boot() {
  config = { url: __ROOMFEED_URL__, token: __ROOMFEED_TOKEN__, room: __ROOMFEED_ROOM__ };
  connect();
})();

if ('wakeLock' in navigator) {
  let wakeLock = null;
  const requestWakeLock = async () => {
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* ignore */ }
  };
  requestWakeLock();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestWakeLock();
  });
}
`

export function roomFeedViewerHtml(url: string, token: string, room: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#000000">
<title>WorshipFlow Room Feed</title>
<style>${VIEWER_CSS}</style>
</head>
<body>
${VIEWER_MARKUP}
<script>
const __ROOMFEED_URL__ = ${JSON.stringify(url)};
const __ROOMFEED_TOKEN__ = ${JSON.stringify(token)};
const __ROOMFEED_ROOM__ = ${JSON.stringify(room)};
${VIEWER_JS}
</script>
</body>
</html>`
}
```

- [ ] **Step 2: Add the HTTP route**

In `src/main/index.ts`, find the `/phone` branch inside `startTabletServer`'s request handler:

```ts
    } else if (path === '/phone') {
      const host = req.headers.host ?? `localhost:${boundTabletPort}`
      // Match the scheme the page was loaded over: Tailscale Serve terminates
      // HTTPS in front of this plain-HTTP server, and a page served over https
      // cannot open a ws:// socket.
      const proto = req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws'
      res.writeHead(200, htmlHeaders)
      res.end(phoneClientHtml(`${proto}://${host}/livecall`, livecallToken(), 'sanctuary'))
    } else if (path === '/file') {
```

Add a new branch between them:

```ts
    } else if (path === '/phone') {
      const host = req.headers.host ?? `localhost:${boundTabletPort}`
      // Match the scheme the page was loaded over: Tailscale Serve terminates
      // HTTPS in front of this plain-HTTP server, and a page served over https
      // cannot open a ws:// socket.
      const proto = req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws'
      res.writeHead(200, htmlHeaders)
      res.end(phoneClientHtml(`${proto}://${host}/livecall`, livecallToken(), 'sanctuary'))
    } else if (path === '/room-feed') {
      const host = req.headers.host ?? `localhost:${boundTabletPort}`
      const proto = req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws'
      res.writeHead(200, htmlHeaders)
      res.end(roomFeedViewerHtml(`${proto}://${host}/livecall`, livecallToken(), 'room-feed'))
    } else if (path === '/file') {
```

Add the import near the existing `phoneClientHtml` import:

```ts
import { roomFeedViewerHtml } from './roomFeedViewerHtml'
```

- [ ] **Step 3: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 329 tests, 0 lint errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/roomFeedViewerHtml.ts src/main/index.ts
git commit -m "feat: serve the room feed viewer page at /room-feed"
```

- [ ] **Step 5: [manual] Verify the route directly**

This sandbox cannot launch Electron. Ask the user to run `npm run dev`, then open `http://localhost:3691/room-feed` in a browser. Expected: a black page showing "Waiting for the room feed to start…" and an "Unmute" button in the corner — no JavaScript console errors. This confirms the route and the page's own JS parse before any sender exists to connect to.

---

## Task 7: RoomFeedSender — capture and fan-out

The core difference from `LiveCallRelay`'s viewer fan-out: there is no inbound peer connection, and no pre-negotiation/`replaceTrack` dance. `start()` captures the local stream **before** joining signaling, so by the time any `viewer-joined` message can arrive, both tracks already exist — they go straight onto the new peer connection with `addTrack`.

**Files:**
- Create: `src/renderer/src/livecall/RoomFeedSender.ts`

- [ ] **Step 1: Write the class**

Create `src/renderer/src/livecall/RoomFeedSender.ts`:

```ts
/**
 * Live Call — room feed sender.
 *
 * Captures a chosen camera and audio input on the WorshipFlow machine and
 * offers them to every viewer (the preacher's tablet) in the 'room-feed'
 * room. Unlike LiveCallRelay's phone relay, there is no inbound peer
 * connection: start() captures the local stream BEFORE joining signaling,
 * so both tracks already exist by the time any viewer-joined message can
 * arrive, and go straight onto the new peer connection with addTrack — no
 * addTransceiver/replaceTrack pre-negotiation needed.
 */
import { ICE_SERVERS } from './iceServers'

export type SenderState = 'idle' | 'starting' | 'live' | 'error'

export interface RoomFeedSenderCallbacks {
  onStateChange?: (state: SenderState) => void
  onError?: (message: string) => void
  onViewerCount?: (n: number) => void
}

const MAX_BACKOFF_MS = 15000

export class RoomFeedSender {
  private ws: WebSocket | null = null
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private closing = false

  private localStream: MediaStream | null = null
  private viewers = new Map<string, RTCPeerConnection>()

  private state: SenderState = 'idle'
  private cb: RoomFeedSenderCallbacks = {}

  constructor(
    private url: string,
    private token: string,
    private room: string
  ) {}

  setCallbacks(cb: RoomFeedSenderCallbacks): void { this.cb = cb }

  getState(): SenderState { return this.state }
  getViewerCount(): number { return this.viewers.size }
  getStream(): MediaStream | null { return this.localStream }

  async start(cameraId: string, audioId: string): Promise<void> {
    if (this.state !== 'idle') return
    this.setState('starting')
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: cameraId } },
        audio: { deviceId: { exact: audioId } },
      })
    } catch (err) {
      this.setState('error')
      this.cb.onError?.(err instanceof Error ? err.message : String(err))
      return
    }
    this.closing = false
    this.connect()
  }

  stop(): void {
    this.closing = true
    for (const [, pc] of this.viewers) pc.close()
    this.viewers.clear()
    this.cb.onViewerCount?.(0)
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop())
      this.localStream = null
    }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    this.ws?.close()
    this.ws = null
    this.setState('idle')
  }

  // ----------------------------------------------------------- signaling --

  private connect(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    this.ws = new WebSocket(this.url)

    this.ws.addEventListener('open', () => {
      this.reconnectAttempt = 0
      this.send({ type: 'hello', token: this.token, role: 'receiver', room: this.room })
    })

    this.ws.addEventListener('message', (ev) => { void this.onMessage(ev) })

    this.ws.addEventListener('close', () => {
      if (this.closing) return
      this.reconnectAttempt++
      const delay = Math.min(1000 * 2 ** this.reconnectAttempt, MAX_BACKOFF_MS)
      this.reconnectTimer = setTimeout(() => this.connect(), delay)
    })
  }

  private async onMessage(ev: MessageEvent): Promise<void> {
    let msg: Record<string, unknown>
    try { msg = JSON.parse(String(ev.data)) } catch { return }

    switch (msg.type) {
      case 'joined':
        this.setState('live')
        break

      case 'ice-candidate': {
        const from = typeof msg.from === 'string' ? msg.from : null
        const pc = from ? this.viewers.get(from) : null
        if (pc && msg.candidate) {
          try { await pc.addIceCandidate(msg.candidate as RTCIceCandidateInit) } catch { /* benign */ }
        }
        break
      }

      case 'answer': {
        const from = typeof msg.from === 'string' ? msg.from : null
        const pc = from ? this.viewers.get(from) : null
        if (pc) await pc.setRemoteDescription({ type: 'answer', sdp: String(msg.sdp) })
        break
      }

      case 'viewer-joined':
        await this.addViewer(String(msg.id))
        break

      case 'viewer-left':
        this.removeViewer(String(msg.id))
        break

      case 'error':
        this.setState('error')
        this.cb.onError?.(`signaling: ${String(msg.reason)}`)
        break
    }
  }

  private send(obj: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj))
  }

  // -------------------------------------------------------------- viewers --

  private async addViewer(id: string): Promise<void> {
    if (!this.localStream) return
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    this.viewers.set(id, pc)
    this.cb.onViewerCount?.(this.viewers.size)

    pc.addEventListener('icecandidate', (ev) => {
      if (ev.candidate) this.send({ type: 'ice-candidate', to: id, candidate: ev.candidate })
    })

    for (const track of this.localStream.getTracks()) {
      pc.addTrack(track, this.localStream)
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    this.send({ type: 'offer', to: id, sdp: offer.sdp })
  }

  private removeViewer(id: string): void {
    this.viewers.get(id)?.close()
    this.viewers.delete(id)
    this.cb.onViewerCount?.(this.viewers.size)
  }

  private setState(s: SenderState): void {
    if (this.state === s) return
    this.state = s
    this.cb.onStateChange?.(s)
  }
}
```

No tests for this file — it is pure WebRTC/WebSocket orchestration, not unit-testable under this repo's Node-only Vitest config, same posture the spec takes on `LiveCallRelay.ts`/`LiveCallViewer.ts`.

- [ ] **Step 2: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 329 tests, 0 lint errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/livecall/RoomFeedSender.ts
git commit -m "feat: RoomFeedSender captures local devices and fans out to viewers"
```

---

## Task 8: useRoomFeed — the React binding, explicit start/stop

Unlike `useLiveCall`'s relay (a module-level singleton, always started on app boot so screens are pre-negotiated and ready the instant a call comes in), the room feed is explicitly operator-controlled — the design says the camera and mic must not open until Start is clicked. So this hook does **not** auto-start anything; it exposes `start`/`stop` and lets `RoomFeedTab.tsx` (Task 9) call them.

**Files:**
- Create: `src/renderer/src/livecall/useRoomFeed.ts`

- [ ] **Step 1: Write the hook**

Create `src/renderer/src/livecall/useRoomFeed.ts`:

```ts
/**
 * Live Call — React binding for the room feed sender.
 *
 * Unlike useLiveCall's relay, this is NOT a module-level singleton started on
 * app boot — the camera and mixer input must not open until the operator
 * explicitly clicks Start (see the 2026-08-01 design spec). One sender per
 * mounted RoomFeedTab is fine: there is only ever one Setup destination for
 * it, and stop() tears everything down on unmount so navigating away doesn't
 * leave a hidden capture running with nothing on screen showing it.
 */
import { useEffect, useRef, useState } from 'react'
import { RoomFeedSender, type SenderState } from './RoomFeedSender'

export interface RoomFeedUi {
  state: SenderState
  error: string | null
  viewerCount: number
  stream: MediaStream | null
  feedUrl: string
  feedUrlIsSecure: boolean
  tabletPort: number
  cameras: MediaDeviceInfo[]
  microphones: MediaDeviceInfo[]
  requestDevicePermission: () => Promise<void>
  start: (cameraId: string, audioId: string) => Promise<void>
  stop: () => void
}

export function useRoomFeed(): RoomFeedUi {
  const senderRef = useRef<RoomFeedSender | null>(null)
  const [state, setState] = useState<SenderState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [viewerCount, setViewerCount] = useState(0)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [feedUrl, setFeedUrl] = useState('')
  const [feedUrlIsSecure, setFeedUrlIsSecure] = useState(false)
  const [tabletPort, setTabletPort] = useState(3691)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([])

  useEffect(() => {
    let cancelled = false
    void window.wf.roomFeedConfig().then((cfg) => {
      if (cancelled) return
      setFeedUrl(cfg.phoneUrl)
      setFeedUrlIsSecure(cfg.phoneUrlIsSecure)
      setTabletPort(cfg.tabletPort)
    })
    void refreshDevices()
    return () => {
      cancelled = true
      // Stop on unmount: this is the one component that ever shows Room Feed
      // is running, so leaving it running with the panel gone would be a
      // camera/mic active with nothing telling the operator so.
      senderRef.current?.stop()
      void window.wf.roomFeedNotifyCapturing(false)
    }
  }, [])

  async function refreshDevices(): Promise<void> {
    const devices = await navigator.mediaDevices.enumerateDevices()
    setCameras(devices.filter((d) => d.kind === 'videoinput'))
    setMicrophones(devices.filter((d) => d.kind === 'audioinput'))
  }

  async function requestDevicePermission(): Promise<void> {
    // Device labels are blank until a permission has been granted at least
    // once — without this, the pickers show "Camera 1" / "Microphone 1"
    // instead of real names, and the operator can't tell which is which.
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      probe.getTracks().forEach((t) => t.stop())
      await refreshDevices()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function start(cameraId: string, audioId: string): Promise<void> {
    setError(null)
    const cfg = await window.wf.roomFeedConfig()
    const sender = new RoomFeedSender(cfg.url, cfg.token, cfg.room)
    senderRef.current = sender
    sender.setCallbacks({
      onStateChange: (s) => { setState(s); setStream(sender.getStream()) },
      onError: setError,
      onViewerCount: setViewerCount,
    })
    await sender.start(cameraId, audioId)
    if (sender.getState() === 'error') return
    void window.wf.roomFeedNotifyCapturing(true)
  }

  function stop(): void {
    senderRef.current?.stop()
    senderRef.current = null
    setState('idle')
    setStream(null)
    setViewerCount(0)
    void window.wf.roomFeedNotifyCapturing(false)
  }

  return {
    state, error, viewerCount, stream, feedUrl, feedUrlIsSecure, tabletPort,
    cameras, microphones, requestDevicePermission, start, stop,
  }
}
```

No tests — this is a thin React/WebRTC binding, same posture as `useLiveCall.ts`.

- [ ] **Step 2: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 329 tests, 0 lint errors. Typecheck will catch it if `window.wf.roomFeedConfig`/`window.wf.roomFeedNotifyCapturing` (Tasks 4-5) don't match this hook's usage.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/livecall/useRoomFeed.ts
git commit -m "feat: useRoomFeed hook with explicit start/stop"
```

---

## Task 9: RoomFeedTab — the Setup page

**Files:**
- Create: `src/renderer/src/setup/RoomFeedTab.tsx`

- [ ] **Step 1: Write the component**

Create `src/renderer/src/setup/RoomFeedTab.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Camera, Monitor, QrCode } from 'lucide-react'
import QRCode from 'qrcode'
import { useRoomFeed } from '../livecall/useRoomFeed'

const STATE_LABEL: Record<string, { label: string; className: string }> = {
  idle: { label: 'Standby', className: 'bg-slate-100 text-slate-500 ring-slate-200' },
  starting: { label: 'Starting…', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  live: { label: 'Live', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  error: { label: 'Error', className: 'bg-red-50 text-red-700 ring-red-200' },
}

// Setup destination for the return feed: a camera and the mixer's audio,
// sent to a tablet in front of the remote preacher so he can see and hear
// the room. Independent of the outbound Live Call — see the 2026-08-01
// design spec for why the two are deliberately not tied together.
function RoomFeedTab(): JSX.Element {
  const {
    state, error, viewerCount, stream, feedUrl, feedUrlIsSecure, tabletPort,
    cameras, microphones, requestDevicePermission, start, stop,
  } = useRoomFeed()
  const [cameraId, setCameraId] = useState('')
  const [audioId, setAudioId] = useState('')
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    if (!feedUrl) return
    QRCode.toDataURL(feedUrl, { width: 240, margin: 1 })
      .then(setQr)
      .catch(() => setQr(null))
  }, [feedUrl])

  useEffect(() => {
    if (cameras.length && !cameraId) setCameraId(cameras[0].deviceId)
  }, [cameras, cameraId])
  useEffect(() => {
    if (microphones.length && !audioId) setAudioId(microphones[0].deviceId)
  }, [microphones, audioId])

  const pill = STATE_LABEL[state] ?? STATE_LABEL.idle
  const canStart = state === 'idle' && !!cameraId && !!audioId
  const hasLabels = cameras.some((c) => c.label) || microphones.some((m) => m.label)

  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="mb-1 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Camera size={18} className="text-slate-500" /> Room feed
          </h1>
          <p className="text-sm text-slate-500">
            Sends a camera and the mixer&apos;s audio to a tablet in front of a remote
            preacher, so he can see and hear the room. Independent of Live Call — start
            and stop this whenever you want, whether or not his call is live.
          </p>
        </div>

        {!hasLabels && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="mb-3 text-sm text-slate-600">
              Grant camera and microphone access once so the pickers below can show real
              device names.
            </p>
            <button onClick={() => void requestDevicePermission()} className="btn text-xs">
              Grant access
            </button>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${pill.className}`}>
              {pill.label}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <Monitor size={12} />
              {viewerCount === 1 ? '1 tablet connected' : `${viewerCount} tablets connected`}
            </span>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Camera</span>
              <select
                value={cameraId}
                onChange={(e) => setCameraId(e.target.value)}
                disabled={state !== 'idle'}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              >
                {cameras.length === 0 && <option value="">No camera found</option>}
                {cameras.map((c) => (
                  <option key={c.deviceId} value={c.deviceId}>{c.label || 'Camera'}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Audio input</span>
              <select
                value={audioId}
                onChange={(e) => setAudioId(e.target.value)}
                disabled={state !== 'idle'}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              >
                {microphones.length === 0 && <option value="">No audio input found</option>}
                {microphones.map((m) => (
                  <option key={m.deviceId} value={m.deviceId}>{m.label || 'Microphone'}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="relative mb-3 aspect-video w-full overflow-hidden rounded-lg bg-black">
            <video
              ref={(el) => { if (el) el.srcObject = stream }}
              autoPlay
              playsInline
              muted
              className="h-full w-full"
              style={{ objectFit: 'contain' }}
            />
            {state === 'idle' && (
              <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-400">
                Not started
              </div>
            )}
          </div>

          {error && <p className="mb-3 text-[11px] text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => void start(cameraId, audioId)}
              disabled={!canStart}
              className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-40"
            >
              Start
            </button>
            <button
              onClick={stop}
              disabled={state === 'idle'}
              className="btn text-xs disabled:cursor-not-allowed disabled:opacity-40"
            >
              Stop
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="section-header mb-2 flex items-center gap-1.5">
            <QrCode size={12} /> Set up the tablet
          </div>
          <div className="flex items-start gap-3">
            {qr && <img src={qr} alt="QR code linking to the room feed viewer page" className="h-[120px] w-[120px] rounded bg-slate-50 p-1" />}
            <div className="space-y-1.5 text-[11px] leading-snug text-slate-500">
              <p>Scan this on the tablet, then Share &rarr; Add to Home Screen.</p>
              <p className="break-all font-mono text-[10px] text-slate-400">{feedUrl}</p>
              {feedUrlIsSecure ? (
                <p className="rounded bg-emerald-50 p-2 text-emerald-800 ring-1 ring-emerald-200">
                  Tailscale address detected — the same one already set up for Live Call.
                  No additional setup needed.
                </p>
              ) : (
                <p className="rounded bg-amber-50 p-2 text-amber-800 ring-1 ring-amber-200">
                  <b>Tailscale not detected.</b> Set it up the same way you did for Live
                  Call — install Tailscale on this computer and the tablet, run{' '}
                  <code className="font-mono">tailscale serve --bg {tabletPort}</code>, and
                  reopen this panel.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RoomFeedTab
```

- [ ] **Step 2: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 329 tests, 0 lint errors.

`eslint-plugin-jsx-a11y` is enabled. If it flags anything (e.g. the `<select>`/`<label>` pairing), fix the markup — do not add a disable comment.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/setup/RoomFeedTab.tsx
git commit -m "feat: Room feed Setup page — device pickers, Start/Stop, QR code"
```

---

## Task 10: Route it — AppShell and TopBar

**Files:**
- Modify: `src/renderer/src/AppShell.tsx`
- Modify: `src/renderer/src/TopBar.tsx`

- [ ] **Step 1: Add the view**

In `src/renderer/src/AppShell.tsx`, replace:

```ts
export type View =
  | 'home' | 'live' | 'service'
  | 'songs' | 'announcements' | 'scripture' | 'backgrounds'
  | 'zones' | 'obs' | 'settings' | 'tablet' | 'diagnostics'
  | 'volunteer' | 'soundcheck'
```

with:

```ts
export type View =
  | 'home' | 'live' | 'service'
  | 'songs' | 'announcements' | 'scripture' | 'backgrounds'
  | 'zones' | 'obs' | 'settings' | 'tablet' | 'diagnostics' | 'roomfeed'
  | 'volunteer' | 'soundcheck'
```

Add the import near the other Setup imports:

```tsx
import RoomFeedTab from './setup/RoomFeedTab'
```

Add the render branch next to the existing `'diagnostics'`/`'tablet'` branches:

```tsx
          ) : view === 'tablet' ? (
            <TabletRemoteTab />
          ) : view === 'roomfeed' ? (
            <RoomFeedTab />
          ) : view === 'diagnostics' ? (
            <DiagnosticsTab />
          ) : view === 'obs' ? (
```

- [ ] **Step 2: Add the nav entry**

In `src/renderer/src/TopBar.tsx`, find:

```ts
const SETUP_ITEMS: NavMenuItem<View>[] = [
  { id: 'zones', Icon: Monitor, label: 'Screens & zones' },
  { id: 'obs', Icon: Video, label: 'OBS connect' },
  { id: 'settings', Icon: Palette, label: 'Logo & branding' },
  { id: 'tablet', Icon: Tablet, label: 'Tablet remote' },
  { id: 'diagnostics', Icon: Stethoscope, label: 'Diagnostics & backups' }
]
```

Replace with:

```ts
const SETUP_ITEMS: NavMenuItem<View>[] = [
  { id: 'zones', Icon: Monitor, label: 'Screens & zones' },
  { id: 'obs', Icon: Video, label: 'OBS connect' },
  { id: 'settings', Icon: Palette, label: 'Logo & branding' },
  { id: 'tablet', Icon: Tablet, label: 'Tablet remote' },
  { id: 'roomfeed', Icon: Camera, label: 'Room feed' },
  { id: 'diagnostics', Icon: Stethoscope, label: 'Diagnostics & backups' }
]
```

Add `Camera` to the lucide-react import at the top of the file — find the existing import line (it currently imports `Home, Play, ListMusic, ...` and more) and add `Camera` to that same list.

- [ ] **Step 3: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 329 tests, 0 lint errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/AppShell.tsx src/renderer/src/TopBar.tsx
git commit -m "feat: route the Room feed Setup destination"
```

---

## Task 11: Manual verification

No more code changes. This task is entirely **[manual]** — this sandbox cannot launch Electron, has no camera, and has no second physical device, so none of the following can be exercised here. Ask the user to run through this list, in order, before trusting Room Feed for a real service.

- [ ] **Step 1: Devices actually list**

Open Setup → Room feed. Click "Grant access", allow the camera/mic prompt. Confirm both dropdowns show real device names (not "Camera 1"/"Microphone 1") — confirms `enumerateDevices()` picked up real labels after the permission probe.

- [ ] **Step 2: Basic start, with Sound Check idle**

Pick the camera and the mixer-connected audio input. Click Start. Confirm the local preview shows real video. Scan the QR on a tablet (same network is fine for this first check — Tailscale isn't the thing being tested here). Confirm the tablet shows the same video, and unmuting it produces the room's actual audio, not silence or noise.

- [ ] **Step 3: Sound Check precedence — the one thing that couldn't be verified by reading code**

Start Sound Check's audio capture first (Volunteer/Engineer sound check screen). Confirm it's running. Then start Room Feed on the *same* audio input. Confirm:
  - Sound Check's capture actually stops (not just that Room Feed's audio arrives at the tablet — check Sound Check's own UI shows it stopped).
  - No error, no device-in-use failure on either side.

- [ ] **Step 4: Reverse order**

With Room Feed still running, try to start Sound Check's capture. Confirm it's blocked and the reason ("The room feed is using the audio input right now — stop it first.") appears on screen, not a silent failure.

- [ ] **Step 5: Stop and recover**

Stop Room Feed. Confirm the tablet's video ends cleanly (shows "Waiting for the room feed to start…" again, not a frozen last frame). Confirm Sound Check can now be started normally.

- [ ] **Step 6: Real cross-network run**

With Tailscale already configured for the outbound Live Call, confirm the *same* Tailscale address now also reaches `/room-feed` with no additional Tailscale setup — put the tablet on a genuinely different network (cellular hotspot is an easy way to test this) and confirm it still connects.

- [ ] **Step 7: Independence from the outbound call**

Start Room Feed with no Live Call item live. Confirm it works on its own. Then separately go live on a Live Call item while Room Feed is running. Confirm neither interferes with the other — the outbound call reaches the sanctuary screens exactly as before, and Room Feed keeps sending to the tablet.

---

## Self-review notes

**Spec coverage.** Architecture (§1) → Tasks 6-7. Component structure (§2) → every task. Data flow (§3) → Tasks 7-9 implement it end to end; Task 11 Step 2 is the first real exercise of it. Error handling (§4): permission denied and no-devices → Task 9's `error` state and empty-option fallback; Sound Check precedence → Tasks 2-3, verified for real in Task 11 Steps 3-4; "waiting" state on the tablet → built into Task 6's viewer page; reconnect resilience → inherited from the same patterns already proven on `LiveCallViewer.ts`, not reinvented. Testing (§5) → Task 2 covers the one pure-logic piece; Task 11 covers everything else, matching the spec's own list almost line for line.

**Non-goals respected.** No tie to the Live Call item's lifecycle (Task 10 routes it as an independent Setup destination, not through `ItemEditor`/`canGoLive`). No multi-viewer requirement was designed for, though nothing in `RoomFeedSender` prevents it — `viewers` is already a `Map`. No device-correlation logic was added — Task 3's precedence check is unconditional, exactly as specified. No changes to any outbound-call file beyond the shared `iceServers.ts` extraction in Task 1, which the spec explicitly calls for.

**Type consistency check.** `RoomFeedSender.start(cameraId, audioId)` (Task 7) matches `useRoomFeed`'s `start(cameraId, audioId)` (Task 8) matches `RoomFeedTab`'s `start(cameraId, audioId)` call (Task 9) — same two-string-argument signature throughout, not renamed at any layer. `SenderState` (`'idle' | 'starting' | 'live' | 'error'`) is defined once in `RoomFeedSender.ts` and imported everywhere else that references it, never redeclared. `window.wf.roomFeedConfig`/`window.wf.roomFeedNotifyCapturing` (Tasks 4-5) are the exact names `useRoomFeed.ts` (Task 8) calls.
