# Live Call — design

Bring a traveling preacher onto the sanctuary screens from his phone, over
Tailscale, with no subscription and no third-party account.

Source material: a drop-in package at `C:\Users\ryan\Downloads\worshipflow-livecall`
(signaling server, phone PWA, and a receiver scene module). The phone client is
reused nearly verbatim. The rest is adapted, because the package assumes an
architecture WorshipFlow does not have.

## Why the package does not drop in as written

Its README targets a Proxmox/Docker box, a Tailscale tailnet, and Pi 5 players,
and tells you to feed the received `<video>` element "through the same
distribution mechanism your other scenes already use to reach the Pi 5 players."

That mechanism does not exist. WorshipFlow distributes **state, not pixels**:

- Zone browser pages open a WebSocket, receive `{type:'zones'}` blobs, and render
  the mode locally (`src/main/zoneHtml.ts:149`).
- Electron output windows receive `wf:state` over IPC and render locally
  (`src/main/index.ts:1701`).

Nothing in the app moves live pixels to a screen, because until now nothing
needed to. Live Call is the first feature that does, so the distribution hop is
the substance of this work — not an integration detail.

Two separate display paths both need the call, and neither can be handed a
`MediaStream` object: output windows are separate renderer processes, and zone
pages are separate machines.

One thing the package got right that we keep: WorshipFlow already runs an HTTP +
WebSocket server in main (`src/main/index.ts:1411`, with EADDRINUSE fallback to a
`boundTabletPort`). Signaling mounts onto that server. No Docker, no Proxmox, no
separate deployment.

### Socket separation (not optional)

The existing server is `new WebSocketServer({ server })` (`index.ts:1500`), which
claims **every** upgrade on the port. Its connection handler adds each socket to
`tabletClients` and immediately pushes the full service state and zone states
(`index.ts:1509-1521`). Livecall clients must not land there — the preacher's
phone would join the tablet broadcast fan-out and receive the entire service.

So the two protocols are separated by URL path:

- Tablet/zone/OBS clients → `ws://host/`
- Livecall clients → `ws://host/livecall`

This requires converting the tablet server to `WebSocketServer({ noServer: true })`
and adding one `server.on('upgrade')` handler that routes by `req.url` to either
the tablet WSS or the livecall WSS. Both then run `handleUpgrade` themselves. It is
a small, contained change, but it must land first — every other piece depends on
it, and the two message protocols would otherwise collide on `type`.

## Architecture

```
 preacher's phone          WorshipFlow machine                sanctuary
 ┌──────────────┐   wss   ┌──────────────────────────┐
 │ phone-client │────────▶│ signaling (added to the  │
 │   (caller)   │         │ tablet WS server already │
 └──────┬───────┘         │ running on boundTabletPort)
        │                 └───────────┬──────────────┘
        │   1 WebRTC stream           │ same server, ws://
        │   over Tailscale            │
        └────────────────────▶┌───────▼────────┐  video-only   ┌─────────────┐
                              │ control        │──────────────▶│ output wins │
                              │ renderer =     │──────────────▶│ zone pages  │
                              │ local relay    │               └─────────────┘
                              │ (plays audio)  │
                              └────────────────┘
```

**The phone uploads exactly once.** Hotel wifi upstream is the scarce resource,
so fanning out from the phone (one peer connection per screen) is the one thing
that must not happen. The control renderer receives that single stream and
re-offers its tracks to each display surface over the LAN, where bandwidth is
free.

**Every display surface is a `viewer`.** Output windows and zone pages speak the
same signaling protocol and run the same peer-connection code, so there is no
special case per display type.

**Audio plays only on the control machine.** Viewers get video-only tracks. If
four zone pages and several output windows each played the same voice a few
milliseconds apart the result is comb-filtered mush. The control machine's audio
output already feeds the board, so his voice reaches the PA the same way every
other computer sound does.

## Signaling protocol

Extends the package's protocol with a third role. Messages stay small JSON; the
server never touches media.

| Message | From | To | Notes |
|---|---|---|---|
| `hello {token, role, room}` | any | server | `role: 'caller' \| 'receiver' \| 'viewer'` |
| `joined {role, room, peerPresent}` | server | any | |
| `peer-joined` / `peer-left` | server | any | |
| `offer {sdp}` / `answer {sdp}` | peer | peer | relayed verbatim |
| `ice-candidate {candidate}` | peer | peer | relayed verbatim |
| `bye` | peer | peer | |

Rooms hold **one** caller, **one** receiver, and **many** viewers. Viewers get a
generated id so the relay can address them individually; caller/receiver keep the
package's "newest connection bumps the stale one" behavior, which is what makes a
phone reconnect after a wifi handoff work.

Token check stays timing-safe (`crypto.timingSafeEqual` with a length pre-check).
The token is the only authentication. Viewers are on the LAN and present the same
token, which the served pages already carry.

## Components

**`src/main/livecallSignaling.ts`** (new)
Room/role relay. Adapted from the package's `server.js`. Owns its own
`WebSocketServer({ noServer: true })`, which the shared `upgrade` handler routes
`/livecall` requests to. Owns the token, room map, and viewer ids. Never sees
media, and never touches `tabletClients`.

**`src/main/phoneClientHtml.ts`** (new)
Serves the phone PWA the way `tabletHtml` serves the tablet UI. The package's
`app.js`, `style.css`, `index.html`, `sw.js`, and `manifest.json` are inlined with
the signaling URL and token **baked in**, replacing the package's three-field
setup screen. Also renders a QR code, so setting up the phone is "scan this"
rather than "type this 64-character hex string on a phone keyboard."

**`src/renderer/src/livecall/LiveCallRelay.ts`** (new)
The core. Receives from the caller, fans out to viewers.
- Receiver half: answers the caller's offer, holds the inbound `MediaStream`.
- Relay half: for each viewer that joins, creates a peer connection, adds the
  **video track only**, and negotiates.
- Handles viewers joining and leaving at any time, including mid-call — a zone
  page reloads and must recover on its own.
- Handles the caller renegotiating (ICE restart) without disturbing viewers: the
  inbound stream's track is replaced via `sender.replaceTrack()` on every viewer
  connection rather than tearing the fan-out down.
- Exposes state (`idle | ringing | live | reconnecting`) and telemetry to the UI.

**`src/renderer/src/livecall/LiveCallViewer.ts`** (new)
The viewer half, shared by output windows and (as injected script) zone pages.
Connects, says `hello role:'viewer'`, answers the relay's offer, renders to a
`<video>`. Reconnects with backoff.

**`src/renderer/src/editors/LiveCallEditor.tsx`** (new)
Item editor: room name, live call status, telemetry line, and manual
accept/decline. Follows the existing editor pattern in `src/renderer/src/editors/`.

**Modified:**
- `src/shared/types.ts` — `'livecall'` added to `ServiceItemType` and `ZoneMode`;
  `ZONE_ROUTING_DEFAULTS` gains a `livecall` row. It does **not** join
  `PAYLOAD_BACKGROUND_TYPES` (the video is the whole frame).
- `src/renderer/src/Output.tsx` — mount a viewer for `mode: 'livecall'`.
- `src/main/zoneHtml.ts` — same, in the injected page script.
- `src/renderer/src/ItemEditor.tsx`, `ServiceBuilder.tsx`, `LiveDrawer.tsx` —
  register the type the way `sermon` is registered.
- `src/main/index.ts` — convert the tablet WSS to `noServer`, add the `upgrade`
  router, delegate `/livecall` to the signaling module, serve the phone client
  route.

## Zone routing default

```
livecall: { 1: 'livecall', 2: 'livecall', 3: 'livecall', 4: 'stage' }
```

Every audience screen shows him; stage monitors keep their normal stage view so
the platform team still sees what they need.

## Bugs in the source package, fixed rather than ported

1. **Peer connection leak on every reconnect.** `livecall-scene.js:131`
   `acceptCall()` assigns a fresh `RTCPeerConnection` to `pc` without closing the
   previous one. Since the phone sends a new offer on every ICE restart
   (`app.js:314`), a flaky network leaks a connection per blip — the exact path
   hotel wifi exercises repeatedly. Fix: close the existing connection, or apply
   the renegotiation to it.

2. **Auto-accept with no visibility.** `livecall-scene.js:70` accepts any offer
   immediately with no indication of who is calling. Fix: `ringing` state surfaces
   in the UI, with auto-accept as a setting rather than a code edit.

## Error handling

| Failure | Behavior |
|---|---|
| Phone loses network | Phone's existing backoff + ICE restart. Screens hold the last frame; state shows `reconnecting`. |
| Control machine loses tailnet | Signaling socket reconnects with backoff. Local fan-out to viewers is unaffected — LAN traffic never left the building. |
| Zone page reloads mid-call | Viewer reconnects and is re-offered. Other viewers untouched. |
| Caller connects with no receiver | Phone shows "waiting for console" and offers as soon as the receiver appears. |
| Bad token | Socket closed with `4001`; phone surfaces `signaling error: bad-token`. |
| Camera permission denied | Phone shows the failure inline (already handled, `app.js:147`). |

## Testing

Unit-testable in `vitest` alongside the existing suite:
- Signaling room/role logic: join, replace stale peer, viewer add/remove, relay
  targeting, token rejection. Pure state machine, no sockets.
- Zone routing defaults and type registration.

Not unit-testable, and therefore verified manually:
- The WebRTC paths. Both halves depend on real ICE.

Manual verification, in order:
0. **Regression first:** after the `noServer` conversion, confirm the tablet
   remote, zone pages, and OBS browser source all still connect and render. The
   upgrade router is the one change that can break existing, working features.
1. `demo.html` from the package against the built-in signaling server — proves
   the call path before any WorshipFlow UI is involved.
2. Phone to control renderer, video and audio arrive.
3. Fan-out to one output window.
4. Fan-out to a zone browser page on a second machine.
5. **Airplane mode for 10 seconds mid-call.** The reconnect path is the whole
   reason this design exists; it must be exercised deliberately, not assumed.
6. Switch phone from wifi to cellular mid-call.
7. Confirm audio comes out of the control machine only.

## Setup (one time)

1. Tailscale on the WorshipFlow machine and on his phone.
2. `tailscale serve --bg <boundTabletPort>` — Tailscale terminates real HTTPS at
   `https://<machine>.<tailnet>.ts.net` and proxies to the existing plain-HTTP
   server. This is what makes the camera work: `getUserMedia` requires a secure
   context, and this avoids self-signed certificates, browser warnings, and a
   broken PWA install.
3. Open the Live Call item, scan the QR with his phone, Add to Home Screen.

## Out of scope

- **Recording.** The existing recording pipeline can capture the control
  machine's output later.
- **TURN server.** Tailscale handles NAT traversal. A venue that blocks
  Tailscale's UDP breaks the call; rare, and a TURN server is its own project.
- **Multi-party.** One phone, one console. A real SFU is a much larger build.
- **Phone-side lower-thirds or graphics.** Name/title overlays belong in the
  existing scene composer, on top of the video, not on the phone.

## Effort

Roughly 700–900 lines net. The relay and its reconnection edge cases are the
bulk; the UI registration work is mechanical and follows `sermon` closely.
