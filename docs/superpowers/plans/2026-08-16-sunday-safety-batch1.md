# Sunday Safety — Batch 1 (Critical) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the highest-severity gaps found by a pre-launch audit — the ones that could cause a visible failure, data exposure, or silent wrong-content-on-screen during a real live Sunday service — before WorshipFlow goes into real-world church use.

**Architecture:** Seven independent, surgical fixes across the existing main-process live-state engine (`src/main/index.ts`), the DB persistence layer (`src/main/db.ts`), the crash-recovery snapshot store (`src/main/recovery.ts`), and one server-rendered page (`src/main/pulpitHtml.ts`). No new subsystems — each task closes a specific, already-diagnosed gap in code that exists today.

**Tech Stack:** Electron main process (Node), electron-store (crash recovery), sql.js (DB persist), vanilla-JS server-rendered pages, Vitest for pure-logic tests.

**Source:** every task below comes from a verified finding in a 7-dimension automated audit (data safety, security, build/release, operational flow, feature stability, performance, backlog). Each task's "Audit finding" section is that finding's own detail/evidence/recommendation, verbatim — treat it as the authoritative diagnosis; you do not need to re-diagnose the bug, only design and implement the fix.

---

## File Structure

- **Modify** `src/main/index.ts` — the tablet WS connection handler and `tabletBroadcast()` (gate sensitive fields behind auth), the Live Call token routes (stop exposing to unauthenticated pages), `armStageRehearsalAnnouncementLoop()` (auto-disarm guard), `wf:app:restoreRecovery` handler (self-load the right service, staleness check, return richer result), `broadcast()`'s call to `writeRecovery()` (throttle).
- **Modify** `src/main/recovery.ts` — add `serviceId`/`ts` to the snapshot shape.
- **Modify** `src/main/pulpitHtml.ts` — add a connection-status indicator matching `tabletHtml.ts`'s existing pattern.
- **Modify** `src/main/db.ts` — rotate `.bak` instead of single-generation overwrite.
- **Modify** `src/renderer/src/AppShell.tsx` — surface the restore result as a toast.

---

### Task 1: Stop broadcasting sermon notes/reference to unauthenticated connections

**Files:**
- Modify: `src/main/index.ts` (the `wss.on('connection', ...)` initial send, and `tabletBroadcast()`)

**Audit finding:** Full live-service state, including sermon notes, is broadcast unauthenticated to any device that opens a WebSocket to the server. On every new WS connection, the server immediately sends the full `renderState('main')` payload and the zones payload before any PIN check occurs (`src/main/index.ts:1973-1981`). The PIN gate only blocks the control-action branch (intent/loadItem/clearStageMessage) — this is a documented, intentional tradeoff for read-only zone display. In practice any device on the church WiFi can open a raw WebSocket to `ws://<lan-ip>:3691/` (no HTTP page load needed) and receive the live state stream, which includes `sermonNotes`/`sermonReference` (rendered by `pulpitHtml.ts:118-120`) — the pastor's private prep notes, not just what's projected on screen.

**Fix direction:** Split what gets sent to a socket based on whether that socket has authenticated (`authedTabletClients.has(ws)`). Unauthenticated sockets (the Pi zone screens, by design) should keep receiving everything they currently need to render (`line`, `next`, `songTitle`, `background`, `mode`, `index`, `total`, etc.) — do not regress zone rendering. Only strip `sermonNotes`/`sermonReference` from the payload sent to sockets that have not authed. Since a socket's auth state can change mid-connection (the pulpit page authenticates after connecting), this needs to happen both at initial-connect time (the `ws.send(...)` calls right after `tabletClients.add(ws)`) and on every subsequent `tabletBroadcast()` call — meaning `tabletBroadcast()` needs to build two payload variants (or the same payload with the two sensitive fields stripped) and send the right one per-client based on `authedTabletClients.has(client)`, rather than reusing one `JSON.stringify`'d string for every client as it does today.

**Verification:**
- [ ] Write the fix, keeping the existing zone-rendering fields flowing to unauthed sockets unchanged.
- [ ] `npx tsc --noEmit -p .` clean.
- [ ] `npm test` — all existing tests still pass (this is main-process orchestration code with no existing unit test coverage for this exact path; verify by careful reading plus the manual check below, matching this codebase's own established pattern for `src/main/index.ts` changes).
- [ ] Manually verify: with the app running, open DevTools and run `new WebSocket('ws://localhost:3691/').onmessage = e => console.log(JSON.parse(e.data))` without ever sending `{type:'auth',...}` — confirm the received `state` payload does NOT contain `sermonNotes`/`sermonReference` (or contains them as `null`), while a genuinely-authed pulpit page still receives real values when a sermon with verses is live.
- [ ] Commit: `git add src/main/index.ts && git commit -m "fix: gate sermon notes/reference behind auth in the tablet broadcast"`

---

### Task 2: Stop exposing the Live Call join token to unauthenticated page loads

**Files:**
- Modify: `src/main/index.ts` (the `/phone` and `/room-feed` route handlers in `startTabletServer`)

**Audit finding:** `livecallToken()` (`src/main/index.ts:1827`) is a strong 256-bit secret, correctly verified with a timing-safe comparison when a livecall client joins (`src/main/livecallRooms.ts:56-64`). But the token is embedded in plaintext inside the HTML/JS served by the `/phone` and `/room-feed` routes (`src/main/index.ts:1866,1871`), and neither route requires the tablet PIN — the HTTP server binds to all interfaces, so any device on the church WiFi can `GET http://<lan-ip>:3691/phone` (or `/room-feed`) and read the token straight out of the page source with zero authentication. With that token, an attacker can open a WS connection to `/livecall` and join the room as `caller` or `receiver` — a single-occupancy slot where "the newest connection wins" (`src/main/livecallRooms.ts:96-107`) — evicting the real preacher's connection and hijacking or disrupting the live call mid-service.

**Fix direction:** The `/zone/1-4` routes ALSO embed this token (needed so zones can render an incoming call), and those are intentionally unauthenticated display-only endpoints on the trusted-by-design LAN — leave that as-is per the existing "zone screens never authenticate" design decision (do not change `/zone/N`). The actual attack surface is `/phone` and `/room-feed`: these are the pages that let someone actively JOIN the call (not just display it), so gate those two specifically. Require the existing tablet PIN before serving the real token: e.g. have `/phone` and `/room-feed` serve a page that itself prompts for the tablet PIN (reusing the same `getTabletPin()`/lockout logic already used for WS auth) and only reveals/embeds the real livecall token client-side after that PIN is entered correctly — rather than baking the token directly into the initially-served HTML. Match the existing WS auth lockout behavior (`TABLET_AUTH_MAX_FAILURES`/`TABLET_AUTH_LOCKOUT_MS`) so this doesn't introduce a new, weaker guessing surface.

**Verification:**
- [ ] Write the fix. Confirm `/zone/1-4` are unchanged (still unauthenticated, still get the token, since they're read-only).
- [ ] `npx tsc --noEmit -p .` clean.
- [ ] `npm test` passes.
- [ ] Manually verify: `curl http://localhost:3691/phone` no longer contains the raw livecall token in the response body; entering the correct tablet PIN in a browser at that URL does let a real call connect end-to-end (test with Live Call armed).
- [ ] Commit: `git add src/main/index.ts && git commit -m "fix: require the tablet PIN before exposing the Live Call join token"`

---

### Task 3: Auto-disarm Stage Rehearsal when something else takes over Main

**Files:**
- Modify: `src/main/index.ts` (`armStageRehearsalAnnouncementLoop`, and wherever the loop's `doLoadAnnouncement` call sets live-track state)

**Audit finding:** `armStageRehearsalAnnouncementLoop`'s `setInterval` callback (`src/main/index.ts:547-556`) only checks `stageRehearsal.active` before calling `doLoadAnnouncement('main', ...)` every 8 seconds — it never checks whether the operator has since loaded real service content onto Main. If Stage Rehearsal is left armed from before the service and the operator then starts the real service (loading a real song/sermon onto Main via the normal Live UI), the loop keeps firing and silently overwrites whatever is live on Main with the next announcement slide, repeatedly, in front of the congregation, until someone notices and manually stops rehearsal.

**Fix direction:** Track which service-item id the rehearsal loop itself most recently loaded onto Main (a new module-level variable, e.g. `stageRehearsalLastLoadedItemId`, set right after each `doLoadAnnouncement` call in the loop). On each timer tick, before loading the next announcement, compare `tracks.main.serviceItemId` against that tracked value: if they don't match, something else has claimed Main since the loop last touched it — call the existing rehearsal-disarm path (`setStageRehearsal(false)`, or whatever function fully clears `stageRehearsal.active` and the timer) instead of loading another announcement, and `broadcast()` so the UI reflects rehearsal turning off. This detects the hijack condition directly (Main changed out from under the loop) rather than trying to enumerate every legitimate way an operator could load something.

**Verification:**
- [ ] Write the fix.
- [ ] `npx tsc --noEmit -p .` clean.
- [ ] `npm test` passes (check whether `src/shared/stageRehearsal.ts`/`stageRehearsal.test.ts` need a new pure-logic case for this — if the hijack-detection logic can be expressed as a small pure function taking `(loopLoadedId, currentMainServiceItemId) => boolean`, extract it there and add a test; if it's inherently tied to the live `tracks`/timer state, it's fine to leave untested per this codebase's established convention for `src/main/index.ts` orchestration code).
- [ ] Manually verify: arm Stage Rehearsal, let it loop once, then load a real song onto Main via the normal Live tab — confirm rehearsal auto-disarms (its indicator turns off) instead of the announcement loop continuing to fight the real content.
- [ ] Commit: `git add -A && git commit -m "fix: Stage Rehearsal auto-disarms when the operator loads real content onto Main"`

---

### Task 4: Pulpit tablet shows a connection-status indicator instead of silently freezing

**Files:**
- Modify: `src/main/pulpitHtml.ts`

**Audit finding:** `pulpitHtml.ts`'s `connect()` function's `ws.onclose` only schedules a reconnect (`setTimeout(connect, 2000)`) with no UI change at all — no status dot, no "disconnected" text. This is a regression relative to the sibling `tabletHtml.ts` it explicitly borrows its pattern from: that page has a visible connection dot (`elDot.className = 'ok'`/`''`) toggled on open/close/error. A pastor whose tablet loses WiFi mid-sermon keeps seeing frozen (last-known) notes/verse with zero visual cue it's stale, and no cue when it silently reconnects either.

**Fix direction:** Add a small, always-visible connection indicator to `pulpitHtml.ts`, matching `tabletHtml.ts`'s existing dot pattern (read `src/main/tabletHtml.ts`'s `elDot`/`ws.onopen`/`ws.onclose`/`ws.onerror` handling for the exact convention to mirror — same visual language, e.g. green dot when connected, red/grey when not). Toggle it in `pulpitHtml.ts`'s own `ws.onopen`/`ws.onclose`/`ws.onerror`. While disconnected, also visually mark the notes/verse content as stale (e.g. reduced opacity) so it reads as "this may be out of date" rather than a live, trustworthy display — since unlike the sanctuary zone screens (where a frozen frame is the intentionally-preferred look for the congregation), this is the pastor's own working tool and he specifically needs to know if it's live.

**Verification:**
- [ ] Write the fix.
- [ ] `npx tsc --noEmit -p .` clean.
- [ ] `npm test` passes (no new tests expected — this is a server-rendered vanilla-JS page, same as the rest of this file, untestable under this project's Vitest config by established convention).
- [ ] Manually verify: load `/pulpit` in a browser, confirm the dot shows connected; stop/restart the WorshipFlow app (or block port 3691 briefly) and confirm the dot flips to disconnected and the content visibly dims, then confirm it recovers automatically when the connection returns.
- [ ] Commit: `git add src/main/pulpitHtml.ts && git commit -m "fix: pulpit tablet shows a connection-status indicator instead of silently freezing"`

---

### Task 5: Crash recovery self-loads the right service and reports what happened

**Files:**
- Modify: `src/main/recovery.ts` (snapshot shape)
- Modify: `src/main/index.ts` (`writeRecovery` call site in `broadcast()`, and the `wf:app:restoreRecovery` handler)
- Modify: `src/renderer/src/AppShell.tsx` (surface the result as a toast)

**Audit finding (two combined):**
1. *Recovery likely no-ops on the exact scenario it exists for.* `AppShell.tsx`'s `useEffect(() => { window.wf.restoreRecovery() }, [])` (`AppShell.tsx:130-135`) fires once, immediately, when the app shell mounts — before the operator has (re)opened any service. The main-process restore handler matches the recovered item against `activeServiceItems`, which is only populated once the operator explicitly opens a service via `wf:setActiveService`. On a real crash-and-relaunch, restore almost certainly runs while `activeServiceItems` is still empty, so both the restore and fallback branches find nothing and recovery silently does nothing.
2. *No confirmation, no staleness check, silent wrong-item fallback.* `RecoverySnapshot` stores only `liveServiceItemId`/`slideIndex`/`mode` — no timestamp, no `serviceId`. Restore runs unconditionally on every launch (not gated behind "did we actually crash last time"), and when the recorded item no longer exists in whatever service happens to be active, it silently falls back to loading the FIRST item of that track with no operator prompt. `AppShell` only `.catch`es the promise — it never inspects the resolved `{restored, fallback}` value, so there's no UI signal either way.

**Fix direction:**
- Add `serviceId: number | null` and `ts: number` (a `Date.now()` timestamp) to the snapshot written by `writeRecovery` — capture the current `activeServiceId` (already tracked as a module-level variable in `src/main/index.ts`) and the write time each time it fires.
- In `wf:app:restoreRecovery`, before attempting to match/restore tracks: if `recovered.serviceId` is set, call the existing `refreshActiveServiceItems(recovered.serviceId)` function (`src/main/index.ts` — already used by `wf:setActiveService`) to self-load that service's items into `activeServiceItems`, so restore no longer depends on the operator having navigated anywhere first.
- Add a staleness cutoff: if `Date.now() - recovered.ts` exceeds a reasonable threshold (pick something sensible for "this is clearly not from a recent crash," e.g. a few hours — long enough to cover a mid-service crash-and-relaunch, short enough that launching the app on a totally different day doesn't resurrect an old snapshot), skip restoring and return a `stale: true` result instead.
- Change the handler's return type to include enough for the UI to describe what happened (e.g. `{ ok, restored, fallback, stale, serviceName }`).
- In `AppShell.tsx`, use the resolved value (not just `.catch`) to show a toast: e.g. "Restored [service name] after a restart" when `restored`, "Couldn't find the exact spot — showing the start of [service name] instead" when `fallback`, nothing when `stale` or no snapshot existed. Check how this codebase already surfaces toasts (`notifyOperator`/`wf:notify` is used elsewhere in `src/main/index.ts` — reuse that channel from the main process right after the restore completes, rather than inventing a new renderer-side toast mechanism, if that pattern fits).

**Verification:**
- [ ] Write the fix.
- [ ] `npx tsc --noEmit -p .` clean.
- [ ] `npm test` passes.
- [ ] Manually verify: build a service, go live on an item partway through its slides, force-quit the app (simulating a crash), relaunch — confirm the SAME service auto-loads with a toast confirming what was restored, without needing to manually reopen the service first. Also verify: relaunching the app normally (not after a crash) doesn't spuriously show a stale/wrong restore toast if a recent snapshot exists but nothing meaningfully changed.
- [ ] Commit: `git add -A && git commit -m "fix: crash recovery self-loads the correct service and confirms what it restored"`

---

### Task 6: Throttle the crash-recovery disk write during auto-advance

**Files:**
- Modify: `src/main/index.ts` (`broadcast()`'s call to `writeRecovery()`)

**Audit finding:** `broadcast()` unconditionally calls `writeRecovery()` on every invocation. `writeRecovery()` uses `electron-store`'s synchronous `.set()`, which blocks Electron's single-threaded main process event loop until the write (temp file + fsync + rename) completes. `armAutoAdvance`'s `setInterval` calls `broadcast()` on every 100ms tick whenever auto-advance is armed (looping welcome slideshows, timed sermon/announcement decks) — so this is a synchronous, blocking disk write roughly 10 times per second, continuously, for as long as auto-advance runs, which in a real service can be minutes at a stretch.

**Fix direction:** Only call `writeRecovery()` when the recoverable state actually changed — compare the snapshot about to be written (item id / slide index / mode, per track) against the last-written one, and skip the write if nothing meaningful changed since the last call. This is the natural fix given `writeRecovery` already exists as a small, self-contained function — add the comparison in `broadcast()` right before the `writeRecovery(...)` call (or inside `writeRecovery` itself, keeping a last-written snapshot in module state to diff against). Keep the serviceId/ts fields from Task 5 out of the comparison (a timestamp obviously always differs) — compare only the fields that represent "what's actually live."

**Verification:**
- [ ] Write the fix.
- [ ] `npx tsc --noEmit -p .` clean.
- [ ] `npm test` passes.
- [ ] Manually verify: arm auto-advance on a welcome countdown or looping deck, confirm the app doesn't visibly stutter and that recovery still correctly restores the right slide after a crash mid-auto-advance (i.e. confirm you didn't accidentally make recovery MISS legitimate slide-index changes by throttling too aggressively — the write should still happen on every real index/item/mode change, just not on redundant repeated calls with no change).
- [ ] Commit: `git add src/main/index.ts && git commit -m "perf: stop writing the crash-recovery snapshot to disk on every unchanged broadcast tick"`

---

### Task 7: Rotate the database backup instead of overwriting the only copy every save

**Files:**
- Modify: `src/main/db.ts` (`persist()`)

**Audit finding:** `persist()` (`db.ts:323-340`) copies the current `dbPath` over `${dbPath}.bak` before every rename, unconditionally, on essentially every mutation (every song edit, every slide advance's implicit item-payload touch, etc.). If any write ever succeeds mechanically but produces bad/wrong data (a bug elsewhere, not a `persist()` failure), the one "last known good" `.bak` is overwritten and lost on the very next unrelated save — likely within seconds. This per-write `.bak` also has no restore path in the UI (only the once-per-launch timestamped backups under `wf:backups:restore` are user-restorable) — recovering it today requires manual file surgery.

**Fix direction:** Keep a small rotation of the last few generations instead of a single `.bak` — e.g. before overwriting `.bak`, if a `.bak` already exists, shift it to `.bak.1` (and `.bak.1` to `.bak.2`, etc., up to some small retention count like 3) before the new copy lands at `.bak`. Keep this cheap (it's still just file copies/renames, same cost class as what's already there) — don't add async I/O to the synchronous `persist()` path. This is a self-contained change to `persist()` alone; no other file needs to know about the extra generations unless you also choose to wire them into the existing `wf:backups:list`/`restore` UI (worth doing if it's a small addition once the files exist, but the core fix is the rotation itself — do that first and treat exposing it in the restore UI as a nice-to-have within this same task if time allows, not a separate task).

**Verification:**
- [ ] Write the fix.
- [ ] `npx tsc --noEmit -p .` clean.
- [ ] `npm test` passes — check if `db.test.ts` already covers `persist()`'s backup behavior and extend it with a case asserting multiple generations survive several successive saves, if the existing test setup makes that straightforward; otherwise verify manually (make several edits in a row, confirm `.bak`, `.bak.1`, `.bak.2` etc. all exist with different mtimes/content afterward).
- [ ] Commit: `git add src/main/db.ts && git commit -m "fix: rotate the database backup instead of overwriting the only copy every save"`

---

## Non-goals for this batch

- Code signing (needs a purchased certificate — a business decision, not a code fix; tracked separately).
- Auto-update republishing / CI pipeline / version-branch discipline — process fixes, tracked in a separate batch.
- Windows auto-relaunch watchdog after a full crash — deployment/OS-level task for the actual church machine, tracked separately.
- Zone disconnect visibility (heartbeat interval, operator-facing status panel), Stage Rehearsal's app-wide indicator and Second-track protection, onboarding help — real findings, but not in the "could silently show wrong/stale content or leak data during a live service" tier; tracked in the next batch.
- The visual "Control Room" redesign — already has its own approved spec/plan, tracked and executed separately.

## Self-Review

**Spec coverage:** All 7 tasks map 1:1 to a specific, verified audit finding (findings #1, #2, #3, #8, #11, #17+#18 combined, #19 from the audit's critical/high list). Nothing in scope was silently dropped.

**Placeholder scan:** Every task states the exact current broken behavior (with file:line), the concrete fix direction, and a real manual-verification scenario. Exact line-by-line diffs are intentionally left to the implementer given the number of tasks in this batch — each fix direction is specific enough that no implementation judgment beyond normal engineering is required, and each has a review gate (spec compliance + code quality) to catch drift.

**Type consistency:** Task 5's `RecoverySnapshot` shape change is the only cross-file type touched (`recovery.ts` defines it, `index.ts` and `AppShell.tsx` consume it) — call this out explicitly to whoever implements Task 5 so the type stays consistent across all three files in one commit.
