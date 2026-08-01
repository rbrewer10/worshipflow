# Live Call Room Feed — design

**Date:** 2026-08-01
**App:** WorshipFlow Pro (Electron + React)
**Status:** Design approved, ready for implementation plan

## Context

Live Call (merged today, `docs/superpowers/specs/2026-07-26-live-call-design.md`)
brings a traveling preacher onto the sanctuary screens from his phone. It is
one-way by design — the room sees him, but he has no way to see or hear the
congregation. The user asked for a return path: a camera and the mixer's audio
routed to a second tablet in front of him, independent of whether his own call
is currently live.

Confirmed against the code before designing, not assumed: `LivecallRooms`
(`src/main/livecallRooms.ts`) is already a generic multi-room state machine —
`room` is an arbitrary string, defaulting to `'sanctuary'` when absent, and
the join/leave/addressing logic has no hardcoded awareness of which room it is
managing. A second room needs **zero changes** to the signaling server itself.

`LivecallConfig` (`src/shared/types.ts`) already carries a `room` field, and
`wf:livecall:config`'s handler already returns `room: 'sanctuary'` alongside
the Tailscale-aware URL — the same shape serves a second room with no new type.

## Decisions locked with the user

- **Feed content:** a real camera aimed at the room/platform, not the program
  output already going to the projector. New hardware (a dedicated webcam) is
  explicitly part of this, not something to route around.
- **Camera location:** plugged into the same computer that runs WorshipFlow.
  Not a separate mounted device — simplest wiring, at the cost of the camera
  being stuck wherever that computer physically sits.
- **Audio source:** the church's existing mixer connection — the same
  physical input Sound Check's `AudioCapture` already uses (`src/main/audio-capture.ts`).
  No new audio hardware; the work is selecting the right input device, not
  acquiring one.
- **Lifecycle: independent of the outbound call.** The room feed is its own
  start/stop, not tied to whether a Live Call service item is live. It lives
  in Setup, not inside the per-item `LiveCallEditor`.
- **Operator-controlled, not always-on.** The camera and mixer input only open
  when the operator clicks Start. No background capture with nothing on
  screen indicating it.
- **Sound Check precedence: Room Feed always wins, unconditionally.**
  Starting Room Feed stops Sound Check's `AudioCapture` if it is running,
  regardless of which device either is nominally configured for. Sound
  Check's Start control is disabled while Room Feed is active. Stopping Room
  Feed does not auto-restart Sound Check.
  This is deliberately a blanket rule, not a device-correlation check:
  `AudioCapture` (native, via the `mic` package) and the browser's own
  `getUserMedia` go through two entirely different OS audio paths, and
  reliably proving "is this actually the same physical device" across both
  is its own hard problem. The two features are not expected to run
  simultaneously in real use — Sound Check is a pre-service tuning tool, Room
  Feed is a during-service feature — so being more conservative than strictly
  necessary costs nothing.

## Design

### 1. Architecture

```
 sanctuary camera + mixer audio        WorshipFlow machine              preacher's 2nd tablet
 ┌──────────────────────────┐   getUserMedia   ┌────────────────────┐   wss (room 'room-feed')  ┌─────────────┐
 │ USB webcam (video)        │─────────────────▶│ RoomFeedSender     │───────────────────────────▶│ /room-feed   │
 │ mixer input (audio)       │                   │ (renderer, joins  │   video+audio, viewer role │ static page  │
 └──────────────────────────┘                   │ as receiver/hub)  │                            └─────────────┘
                                                  └────────────────────┘
```

Same signaling server, same WebSocket upgrade path, same shared token as the
existing call — just a second `room` value (`'room-feed'`) and a sender that
captures local devices instead of relaying a phone's inbound stream.

The control machine plays the **receiver** role for this room (the hub that
can address multiple viewers), the same role it already plays for the
outbound call — but there is no separate **caller** device this time. The
"inbound" media is captured locally rather than received over a peer
connection, then pushed to viewers exactly the way `LiveCallRelay`'s existing
viewer fan-out already works (pre-negotiated per-viewer connections,
`replaceTrack` when the real track arrives).

### 2. Component structure

**New:**

- `src/renderer/src/livecall/iceServers.ts` — `export const ICE_SERVERS` (a
  one-line array). Currently duplicated identically in `LiveCallRelay.ts` and
  `LiveCallViewer.ts`; adding a third consumer (`RoomFeedSender`) is the
  moment to stop copying it a third time. `LiveCallRelay.ts` and
  `LiveCallViewer.ts` both switch to importing it — a small, targeted cleanup
  that directly serves this work, not a drive-by refactor.
- `src/renderer/src/livecall/RoomFeedSender.ts` — captures the chosen camera
  + audio input via `getUserMedia`, joins `room: 'room-feed'` as the
  `receiver` role, and fans tracks out to viewer peer connections. Structured
  like the viewer-fan-out half of `LiveCallRelay.ts` (same
  `addTransceiver`/`replaceTrack` pre-negotiation pattern), but with no
  inbound peer connection — the "inbound" media is the local
  `MediaStream` — and no audio playback (nothing to play locally; the source
  is local).
- `src/main/roomFeedViewerHtml.ts` — the static page the tablet loads.
  Mirrors `phoneClientHtml.ts`'s structure and its insecure-origin guard, but
  is video-only: no `getUserMedia`, no `RTCPeerConnection.addTrack` — it
  joins as `viewer` and plays whatever track arrives, matching
  `LiveCallViewer.ts`'s `ontrack` handling (including the same
  `ev.streams[0] ?? new MediaStream([ev.track])` fallback that fixed a real
  black-screen bug on the existing viewers). A mute toggle is the only
  control; audio defaults muted until the operator (on the tablet) taps to
  unmute, since autoplay-with-sound is blocked by mobile browsers without a
  user gesture regardless.
- `src/renderer/src/setup/RoomFeedTab.tsx` — new Setup destination.
  `navigator.mediaDevices.enumerateDevices()` for the camera and audio-input
  pickers, Start/Stop, a live status line (mirrors `LiveCallEditor`'s
  "Standby" / "N screens connected"), and the QR code for the tablet — reuses
  the same `qrcode` package and `QRCode.toDataURL` call already in
  `LiveCallEditor.tsx`.

**Changed:**

- `src/main/index.ts` — new `ipcMain.handle('wf:roomfeed:config', ...)`,
  structurally identical to `wf:livecall:config` (same `tailscaleHttpsBase()`
  call, same `livecallToken()`), returning `room: 'room-feed'` and
  `phoneUrl` pointing at `/room-feed` instead of `/phone`. New route branch
  in the tablet HTTP server's request handler: `else if (path === '/room-feed')`,
  mirroring the existing `else if (path === '/phone')` branch line-for-line
  aside from which HTML function it calls.
- `src/main/sound-check/sound-check-ipc.ts` — the capture-start handler
  checks a new "room feed active" flag and rejects with a clear reason if
  set, instead of calling `state.audioCapture.start(deviceId)`.
- Wherever Room Feed's Start action lands in main (a new
  `wf:roomfeed:start` handler) — calls `state.audioCapture.stop()` first if
  `state.audioCapture.isActive()`, unconditionally, before proceeding.

**Not touched:** `LivecallRooms` (`src/main/livecallRooms.ts`),
`livecallSignaling.ts`, the WebSocket upgrade router, `LiveCallEditor.tsx`,
`doLoadLiveCall`, `canGoLive`/`sendItemLive`, and everything about how the
outbound call reaches zone screens and output windows. This is additive
alongside that code, not a modification of it.

### 3. Data flow

1. Operator opens Setup → Room Feed, picks a camera and an audio input from
   the enumerated device lists.
2. Operator clicks Start. Renderer calls `getUserMedia` with the two chosen
   `deviceId`s. Main process is told capture started (so it can enforce the
   Sound Check precedence rule) and stops `AudioCapture` if it was running.
3. `RoomFeedSender` joins the signaling server as `receiver` in room
   `'room-feed'`, using the same token every other role already presents.
4. Operator's Setup panel shows the QR/link (from `wf:roomfeed:config`); the
   preacher opens it on his tablet, which joins as `viewer` in the same room.
5. `RoomFeedSender` pre-negotiates each viewer connection and pushes the
   local camera/audio tracks in, the same `replaceTrack`-on-arrival pattern
   the existing relay already uses for the outbound direction.
6. Operator clicks Stop. Only the explicit Stop button ends capture —
   navigating away from the Setup panel to another screen does **not** stop
   it, the same way opening a different Setup destination doesn't stop OBS
   streaming or close the tablet remote server. `getUserMedia` tracks are
   stopped, the signaling connection leaves the room, viewers see their
   track end.

### 4. Error handling

- **Camera/mic permission denied:** Setup panel shows the browser's denial
  reason plainly and disables Start, the same posture `phoneClientHtml.ts`
  already takes for the phone's own camera failures.
- **No devices enumerated:** picker shows "No camera found" / "No audio
  input found"; Start stays disabled. Distinct from a permission denial —
  different message, since the fix is different (plug something in, vs.
  grant a permission).
- **Sound Check running when Room Feed starts:** stopped automatically, per
  the locked decision above. Not surfaced as an error — this is the designed
  behavior, not a failure.
- **Sound Check start attempted while Room Feed is active:** rejected with a
  message naming Room Feed as the reason, not a generic failure.
- **Tablet opens the page before Start:** same "Waiting for a call" pattern
  the outbound call's screens already use for the pre-connection state —
  here, "Waiting for the room feed to start."
- **Viewer's connection drops:** relies on the same resilience already built
  and proven for the existing viewer fan-out (pre-negotiated connections,
  the `ev.streams[0] ?? new MediaStream(...)` fallback) — no new reconnect
  logic invented for this feature specifically.

### 5. Testing

- No new pure logic to unit test — `LivecallRooms` needs no changes, and the
  new pieces are either UI (device pickers, Start/Stop) or WebRTC (capture,
  peer connections), neither unit-testable under this repo's Node-only
  Vitest config, matching how the outbound call's WebRTC halves were already
  "verified manually" rather than unit tested (see the original Live Call
  spec's own Testing section).
- Manual verification, in order, before this is trusted for a real service:
  1. Camera + audio-input pickers actually list real devices.
  2. Start with Sound Check idle: feed reaches the tablet, video and audio
     both present.
  3. Start Sound Check, then start Room Feed: confirm Sound Check's capture
     actually stops (not just that Room Feed's audio arrives — check for
     device-contention symptoms specifically, since that is the one risk
     flagged going in and it is not provable by reading code).
  4. Attempt to start Sound Check while Room Feed is active: confirm it is
     blocked with the stated reason, not a silent failure or a device fight.
  5. Stop Room Feed: confirm the tablet's video ends cleanly and Sound Check
     can be started normally again afterward.
  6. Real cross-network run: tablet on a different network than the church
     (matching how the outbound call itself still needs this), confirm the
     Tailscale address already configured for the phone call reaches
     `/room-feed` with no additional Tailscale setup.

## Non-goals

- Tying the feed to the Live Call item's own live/not-live state (explicitly
  rejected — independent lifecycle was the locked decision).
- Multiple simultaneous room-feed viewers. The `viewer` role already
  supports many in the underlying room model, so this is not blocked by the
  architecture, but it is not a requirement being designed for or tested
  here — one tablet.
- Recording the room feed.
- A device-correlation check between `AudioCapture` and `getUserMedia` to
  make the Sound Check precedence rule more surgical. The blanket rule is
  the design, not a placeholder for a smarter one.
- Any change to how the outbound call works, is configured, or is tested.

## Success criteria

A camera and a chosen mixer audio input can be started from a new Setup
page, reach a tablet on a completely different network via the same
Tailscale address already configured for the outbound call, with no new
Tailscale setup required. The feed starts and stops only on explicit
operator action. Starting it reliably stops Sound Check's own capture if
running, and Sound Check cannot be started while it is active. None of this
touches the outbound call's code paths, config, or behavior.
