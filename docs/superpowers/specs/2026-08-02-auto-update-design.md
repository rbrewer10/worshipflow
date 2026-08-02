# Auto-update — design

**Date:** 2026-08-02
**App:** WorshipFlow Pro (Electron + React)
**Status:** Design approved, ready for implementation plan

## Context

Every update to WorshipFlow Pro today requires rebuilding a fresh installer
(`npm run dist`) and walking the operator through downloading and running it
by hand — exactly what happened twice tonight, for Room Feed and for the
zone-connection-status fix. There is no mechanism for the running app to
notice a newer version exists, fetch it, or offer to install it.

Confirmed by checking the repo directly, not assumed:

- **No git remote is configured at all** (`git remote -v` returns nothing).
  This repo has never been pushed anywhere. Any hosting-based update
  mechanism needs that decided first, not assumed to already exist.
- **No code-signing certificate is explicitly configured** in
  `electron-builder.yml` or via `CSC_LINK`/`CSC_KEY_PASSWORD` — the
  "signing with signtool.exe" step seen during tonight's builds is using
  whatever electron-builder auto-detected locally, not a purchased
  certificate. This doesn't block auto-update functionally (the update
  mechanism verifies a file hash from its own metadata file, not an
  Authenticode trust chain), but it means installs will keep showing a
  Windows "unknown publisher"-style prompt regardless of this feature —
  a pre-existing, separate concern, not something this design fixes.
- **No secrets exist in the source tree.** Grepped for API keys, passwords,
  tokens, and certificate files — every hit found is a variable name
  (`apiKey` parameters for the Anthropic/Replicate integrations, an OBS
  `password` parameter) or an at-rest encryption prefix
  (`SECRET_PREFIX = 'wfenc1:'` in `db.ts`, used with Electron's
  `safeStorage`), never a hardcoded secret value. All real credentials
  (API keys, OBS password, the Live Call/Room Feed shared token) are
  user-entered at runtime and stored encrypted in the local SQLite database,
  not in source. This matters because the chosen hosting option makes the
  source public.
- **No `gh` CLI is installed or authenticated** in this environment. Creating
  the GitHub repo and pushing to it is a step the user does themselves —
  not something that can be done from here without their GitHub credentials.
- **`electron-updater` is not yet a dependency.**

## Decisions locked with the user

- **Hosting: a new public GitHub repo**, `rbrewer10/worshipflow`. Chosen over
  a private repo (which would require embedding a GitHub access token in the
  shipped app — a real, ongoing security tradeoff) and over other hosting
  (nothing else is already set up). Confirmed safe by the secrets scan above.
- **Update flow: download automatically, prompt to restart.** The app checks
  for a new version, downloads it quietly in the background if one exists,
  and shows a "Restart to update" control whenever the operator is ready —
  never forces an interruption.
- **Check timing: on startup only, never periodically.** No background
  re-check while the app stays open — this is the one guarantee that a
  version check can never fire mid-service. A church that keeps WorshipFlow
  open for days between restarts simply won't see a new version until the
  next time the app opens, which is an acceptable tradeoff for that
  guarantee.
- **Silent failure.** A failed check (no internet, GitHub unreachable) is
  logged, not surfaced to the operator — a volunteer shouldn't see "update
  check failed" noise on every offline booth computer. It just tries again
  next startup.
- **Manual release process for now, not automated.** Each release means:
  bump the version, run `npm run dist` (unchanged from tonight), then
  manually create a GitHub Release and attach the installer, its
  `.blockmap`, and the `latest.yml` file electron-builder already generates
  alongside them. Building a release-automation script is explicitly
  deferred — worth doing once this process has actually been run a few
  times, not before.

## Design

### 1. Architecture

```
 GitHub Releases (rbrewer10/worshipflow, public)
 ┌────────────────────────────────────────┐
 │ vX.Y.Z release: installer .exe,         │
 │ .exe.blockmap, latest.yml                │
 └──────────────────┬───────────────────────┘
                     │ HTTPS check, on startup only
                     ▼
 ┌────────────────────────────────────────┐   IPC: update-ready   ┌─────────────────────┐
 │ src/main/autoUpdate.ts                  │──────────────────────▶│ Top bar: "Restart to │
 │ (wraps electron-updater)                │◀──────────────────────│  update" button       │
 └────────────────────────────────────────┘   IPC: install now     └─────────────────────┘
```

`electron-builder.yml`'s new `publish` block is what tells both
`electron-builder` (at build time, to generate `latest.yml` correctly) and
`electron-updater` (at runtime, packaged into the app as `app-update.yml`)
which GitHub repo to look at. No custom server, no new backend — GitHub
Releases *is* the update feed.

### 2. Component structure

**New:**

- `src/main/autoUpdate.ts` — wraps `electron-updater`'s `autoUpdater`.
  Exports a single `initAutoUpdate(): void`, called once from the app's
  startup sequence. Internally:
  - Guards on `app.isPackaged` — does nothing at all under `npm run dev`,
    where there's no packaged update metadata to check against.
  - Sets `autoUpdater.autoDownload = true` (download without asking, per the
    locked decision).
  - Calls `autoUpdater.checkForUpdates()` exactly once, at startup — no
    `setInterval`, no re-check trigger anywhere.
  - Listens for `update-downloaded` → sets a module-level flag and notifies
    every renderer window via `webContents.send('wf:update:ready')` (mirrors
    the existing `wf:state`-style push pattern already used elsewhere in
    this codebase, e.g. `broadcast()`).
  - Listens for `error` → logs via the existing `logInfo`-style helper, does
    nothing else. No dialog, no renderer notification.
  - Exposes a small internal `installUpdateNow(): void` calling
    `autoUpdater.quitAndInstall()`, invoked by a new IPC handler.
- New IPC: `wf:update:installNow` (renderer → main, no args, no return
  value — quits and installs, so there's nothing to respond with) and a
  push channel the preload already has a pattern for extending (see
  `onState` in `src/preload/index.ts` for the closest existing shape) for
  `wf:update:ready` (main → renderer, fired once when a download completes).

**Changed:**

- `electron-builder.yml` — new `publish` section:
  ```yaml
  publish:
    provider: github
    owner: rbrewer10
    repo: worshipflow
  ```
- `package.json` — add `electron-updater` as a dependency.
- `src/main/index.ts` — calls `initAutoUpdate()` once during startup,
  alongside the other one-time setup calls already made in
  `app.whenReady().then(async () => {...})`.
- `src/preload/index.ts` — adds `updateInstallNow(): void` and
  `onUpdateReady(cb: () => void): () => void` to the `window.wf` bridge.
- `src/renderer/src/TopBar.tsx` — next to the existing version display
  (`v{build?.version}`), a small button appears only once an update is
  ready, labeled "Restart to update", calling `window.wf.updateInstallNow()`.
- `src/renderer/src/browserWfMock.ts` — mock bindings for
  `updateInstallNow`/`onUpdateReady` (a no-op and a subscribe-that-never-fires,
  matching how other push-style bindings are already mocked there).

**Not touched:** anything about how the app currently builds
(`npm run dist` stays exactly as it is), the existing NSIS installer config,
signing setup, or any other Setup/Home/Live screen.

**New doc (not code):** `docs/RELEASING.md` — the exact manual steps for
cutting a release: bump the version in `package.json`, run `npm run dist`,
create a GitHub Release tagged `vX.Y.Z`, attach the three generated files
from `dist-installer/`. Written so future-you (or anyone else) can follow it
without re-deriving the process.

### 3. Data flow

1. App starts, packaged build. `initAutoUpdate()` runs once, calls
   `autoUpdater.checkForUpdates()`.
2. `electron-updater` reads the packaged `app-update.yml` (auto-generated
   from `electron-builder.yml`'s `publish` block at build time) to know
   which GitHub repo to query, fetches that repo's latest release's
   `latest.yml`, and compares versions.
3. If newer: downloads the installer in the background (no operator
   interaction), verifies it against the checksum in `latest.yml`, fires
   `update-downloaded`.
4. Main sends `wf:update:ready` to the renderer. The top bar's button
   appears. Nothing else changes — the operator keeps using the app exactly
   as before.
5. Operator clicks "Restart to update" whenever they choose to (could be
   immediately, could be days later, could be never for that session) →
   `wf:update:installNow` → `autoUpdater.quitAndInstall()` → app closes,
   installs the new version, reopens.
6. If no newer version, or the check/download fails: nothing observable
   happens. Logged internally, not surfaced.

### 4. Error handling

- **No internet / GitHub unreachable at startup:** `error` event logged,
  nothing shown. Retried next startup, not retried in-session.
- **Corrupt/partial download:** `electron-updater`'s own checksum
  verification (against `latest.yml`'s hash) rejects it before firing
  `update-downloaded` — this is handled by the library, not custom code.
- **No release has been published yet** (the realistic state immediately
  after this feature ships, before the first GitHub release exists): the
  check simply finds nothing newer than the current version and does
  nothing — same code path as "no update available," not a special case.
- **`npm run dev`:** `initAutoUpdate()` no-ops entirely under
  `!app.isPackaged` — no network call, no log spam, every time a developer
  runs the app locally.

### 5. Testing

`autoUpdate.ts` is almost entirely event wiring around a third-party library
and Electron's `app`/IPC objects — not meaningfully unit-testable under this
repo's Node-only Vitest config, matching the posture already taken toward
other Electron-glue code in this codebase (e.g. the tablet WebSocket server
itself has no unit tests; only the pure logic pulled out of it, like
`zoneConnections.ts`, does). No new tests planned for this feature.

Manual verification (this sandbox cannot launch Electron, cannot create a
GitHub repo, and cannot publish a real release):

1. Confirm `npm run dev` starts with no auto-update-related errors or log
   spam (the `!app.isPackaged` guard should make this a complete no-op).
2. After the GitHub repo is created and this feature's code is merged and
   released as the *first* published release (say `v0.13.0`): install that
   version, confirm the app opens normally with no "Restart to update"
   button (nothing newer exists yet).
3. Bump the version, publish a second release (`v0.13.1`). Reopen the
   *v0.13.0* install. Confirm within a reasonable time (electron-updater's
   own check + download, not instant) the "Restart to update" button
   appears in the top bar.
4. Click it. Confirm the app closes and the newer version opens
   automatically, with no manual installer double-click needed.
5. Confirm a version check with no network connection produces no visible
   error anywhere in the app.

## Non-goals

- Automating the release-publishing process (version bump → build → GitHub
  Release creation) — deferred until the manual process has been run a few
  times.
- Periodic/background re-checking while the app stays open.
- Any UI beyond the single "Restart to update" button — no changelog
  display, no "what's new" screen, no update-progress bar.
- Fixing the pre-existing lack of a trusted code-signing certificate — out
  of scope, unrelated to whether auto-update itself works.
- Any change to the manual installer flow used tonight (`npm run dist`,
  double-click to install) — that keeps working exactly as it does today for
  a first-time install or a manual reinstall.

## Success criteria

Once a GitHub release exists, a running (packaged, non-dev) copy of
WorshipFlow Pro notices a newer release at startup, downloads it silently,
and offers a one-click restart-to-update — with zero risk of interrupting an
already-running service, since the check only ever happens at startup and
failures are silent. `npm run dev` is completely unaffected. The manual
build/install process used tonight keeps working unchanged for anyone who'd
rather not wait for auto-update.
