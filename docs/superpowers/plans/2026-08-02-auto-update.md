# Auto-update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WorshipFlow Pro checks the now-public `rbrewer10/worshipflow` GitHub repo for a newer release once at startup, downloads it silently in the background if one exists, and offers a one-click "Restart to update" — no more manually rebuilding and walking someone through a fresh installer.

**Architecture:** `electron-updater` reads a `publish` block already pointed at the live GitHub repo. A small new `src/main/autoUpdate.ts` module wraps it: check once at startup (never again while the app stays open), download automatically, and push a single "ready" signal to the renderer when done. The top bar shows a button only once that signal arrives.

**Tech Stack:** Electron 33, `electron-updater`, TypeScript, React 18.

**Spec:** `docs/superpowers/specs/2026-08-02-auto-update-design.md`

---

## Before you start

Mandatory gate before every commit:

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

As of this plan, that gate passes with **335 tests, 0 lint errors**. Do not commit if any of the four fails.

Repo conventions already established this session, still in force:

1. **Never `git add -A` or `git add .`.** Stage only the exact files each task names.
2. **This sandbox cannot launch Electron, and no GitHub release has been published yet.** Task 6 is marked **[manual]** — real end-to-end verification (an actual update being detected and installed) can only happen once a first release exists on GitHub, which is beyond this plan's scope to create.
3. **The GitHub repo already exists and is public** (`https://github.com/rbrewer10/worshipflow`, confirmed reachable with no auth needed) — this plan only adds code, it does not touch git remotes, branches, or push anything beyond what each task's own commit does through the normal `git commit` flow already used all session.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/main/autoUpdate.ts` | Wraps `electron-updater`: check once at startup, auto-download, notify the renderer when ready, handle the "install now" request. Not meaningfully unit-testable — pure Electron/third-party-library wiring, matching the existing posture toward similar code in this repo. |
| `docs/RELEASING.md` | The manual steps for cutting a release: bump version, build, create the GitHub Release, attach the right files. |

**Modified:**

| File | Change |
|---|---|
| `package.json` | Adds `electron-updater` as a dependency. |
| `electron-builder.yml` | Adds a `publish` block pointing at `rbrewer10/worshipflow`. |
| `src/main/index.ts` | Calls `initAutoUpdate()` once during startup. |
| `src/preload/index.ts` | Adds `updateInstallNow()` and `onUpdateReady()` to the `window.wf` bridge. |
| `src/renderer/src/browserWfMock.ts` | Mocks for the two new bindings (no-ops, matching the pattern already used for other push-style bindings that don't apply in the browser preview). |
| `src/renderer/src/TopBar.tsx` | Shows a "Restart to update" button next to the version number once an update is ready. |

**Not touched:** the existing manual `npm run dist` build process, NSIS installer configuration, code signing, or any other screen.

---

## Task 1: Dependency and build config

**Files:**
- Modify: `package.json`
- Modify: `electron-builder.yml`

- [ ] **Step 1: Install the dependency**

```bash
npm install electron-updater
```

This adds `electron-updater` to `package.json`'s `dependencies` (it's used at runtime in the packaged app, not just at build time — unlike `electron-builder`, which stays a devDependency) and updates `package-lock.json`. Let npm resolve the actual version rather than hand-typing one.

- [ ] **Step 2: Point the build at the GitHub repo**

In `electron-builder.yml`, find the end of the file:

```yaml
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: always
  createStartMenuShortcut: true
  shortcutName: WorshipFlow Pro
  uninstallDisplayName: WorshipFlow Pro
```

Add immediately after it:

```yaml

# Where `npm run dist` looks to check "is there a newer release" at runtime
# (electron-updater reads this, packaged into the app as app-update.yml) and
# where electron-builder generates latest.yml at build time. The repo is
# public — created 2026-08-02 specifically so update checks need no auth
# token embedded in the shipped app. See the 2026-08-02 auto-update design
# spec for why.
publish:
  provider: github
  owner: rbrewer10
  repo: worshipflow
```

- [ ] **Step 3: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 335 tests (no new tests — this step only adds a dependency and build config), 0 lint errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json electron-builder.yml
git commit -m "chore: add electron-updater, point publish config at the GitHub repo"
```

Append a `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` trailer.

---

## Task 2: The autoUpdate module and startup wiring

**Files:**
- Create: `src/main/autoUpdate.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Write the module**

Create `src/main/autoUpdate.ts`:

```ts
import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { logError } from './logger'

// Checks GitHub (rbrewer10/worshipflow — see electron-builder.yml's `publish`
// block) once at startup for a newer release, downloads it silently in the
// background if one exists, and tells every open window once it's ready to
// install. Deliberately never re-checks while the app stays open — a version
// check must never have a chance to fire mid-service. See the 2026-08-02
// design spec.
export function initAutoUpdate(): void {
  if (!app.isPackaged) return // no update metadata exists under `npm run dev`

  autoUpdater.autoDownload = true

  autoUpdater.on('update-downloaded', () => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('wf:update:ready')
    }
  })

  // A failed check (offline, GitHub unreachable) is never shown to the
  // operator — it's not something a volunteer can act on, and a booth
  // computer is often offline between services. It just tries again next
  // startup, silently.
  autoUpdater.on('error', (err) => {
    logError('[autoUpdate] check failed', err)
  })

  ipcMain.on('wf:update:installNow', () => {
    autoUpdater.quitAndInstall()
  })

  void autoUpdater.checkForUpdates().catch((err) => {
    logError('[autoUpdate] checkForUpdates threw', err)
  })
}
```

- [ ] **Step 2: Call it once at startup**

In `src/main/index.ts`, find:

```ts
  startTabletServer()
  createOperator()
  // Fullscreen the audience output on a projector at launch, so the congregation
  // screen is never left dark waiting for a hotplug event. With no projector
  // attached this opens the zone multiview instead of a stray output window.
  layoutOutputs()
  broadcast()
  // Reconnect to OBS in the background if the operator connected before (non-blocking).
  void initObsAutoConnect()
```

Replace with:

```ts
  startTabletServer()
  createOperator()
  // Fullscreen the audience output on a projector at launch, so the congregation
  // screen is never left dark waiting for a hotplug event. With no projector
  // attached this opens the zone multiview instead of a stray output window.
  layoutOutputs()
  broadcast()
  // Reconnect to OBS in the background if the operator connected before (non-blocking).
  void initObsAutoConnect()
  // Startup-only update check (never repeats while the app stays open) — see
  // the 2026-08-02 design spec.
  initAutoUpdate()
```

Add the import near the other local imports at the top of the file:

```ts
import { initAutoUpdate } from './autoUpdate'
```

- [ ] **Step 3: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 335 tests (no new tests — this is Electron/third-party-library wiring, not unit-testable, matching this repo's existing posture toward similar code), 0 lint errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/autoUpdate.ts src/main/index.ts
git commit -m "feat: check for updates once at startup, notify when ready to install"
```

Append a `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` trailer.

---

## Task 3: Preload bindings and browser-preview mock

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/browserWfMock.ts`

- [ ] **Step 1: Add the bindings**

In `src/preload/index.ts`, find:

```ts
  getInfo: (): Promise<AppInfo> => ipcRenderer.invoke('wf:getInfo'),
  getState: (track?: TrackId): Promise<LiveState> => ipcRenderer.invoke('wf:getState', track),
```

Replace with:

```ts
  getInfo: (): Promise<AppInfo> => ipcRenderer.invoke('wf:getInfo'),
  getState: (track?: TrackId): Promise<LiveState> => ipcRenderer.invoke('wf:getState', track),
  updateInstallNow: (): void => ipcRenderer.send('wf:update:installNow'),
  onUpdateReady: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('wf:update:ready', handler)
    return () => ipcRenderer.removeListener('wf:update:ready', handler)
  },
```

- [ ] **Step 2: Add the browser-preview mock**

In `src/renderer/src/browserWfMock.ts`, find:

```ts
    getInfo: async (): Promise<AppInfo> => appInfo(),
    getState: async (_track?: TrackId): Promise<LiveState> => clone(liveState),
```

Replace with:

```ts
    getInfo: async (): Promise<AppInfo> => appInfo(),
    getState: async (_track?: TrackId): Promise<LiveState> => clone(liveState),
    updateInstallNow: (): void => {},
    onUpdateReady: (_cb: () => void): (() => void) => () => {},
```

There is nothing in the browser preview for this to ever fire — the mock exists only so the type-check passes and the TopBar component doesn't need to special-case "am I in a browser preview."

- [ ] **Step 3: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 335 tests, 0 lint errors. Typecheck is the meaningful check — it'll immediately flag a signature mismatch between the preload binding and its mock.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/renderer/src/browserWfMock.ts
git commit -m "feat: expose update-ready/install-now bindings on window.wf"
```

Append a `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` trailer.

---

## Task 4: Top bar — the "Restart to update" button

**Files:**
- Modify: `src/renderer/src/TopBar.tsx`

- [ ] **Step 1: Track update-ready state**

Find:

```tsx
function TopBar({ view, setView }: { view: View; setView: (v: View) => void }): JSX.Element {
  const [outputs, setOutputs] = useState(0)
  const [zonesConnected, setZonesConnected] = useState<ZoneId[]>([])
  const [build, setBuild] = useState<{ version: string; isPackaged: boolean } | null>(null)
  const [obs, setObs] = useState<ObsStatus | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [rehearsal, setRehearsal] = useState(false)
```

Replace with:

```tsx
function TopBar({ view, setView }: { view: View; setView: (v: View) => void }): JSX.Element {
  const [outputs, setOutputs] = useState(0)
  const [zonesConnected, setZonesConnected] = useState<ZoneId[]>([])
  const [build, setBuild] = useState<{ version: string; isPackaged: boolean } | null>(null)
  const [obs, setObs] = useState<ObsStatus | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [rehearsal, setRehearsal] = useState(false)
  const [updateReady, setUpdateReady] = useState(false)
```

- [ ] **Step 2: Subscribe to it**

Find:

```tsx
    load()
    const t = setInterval(load, 2000)
    window.wf.obsGetStatus().then(setObs)
    const off = window.wf.obsOnStatus(setObs)
    window.wf.getRehearsalMode().then(setRehearsal)
    return () => { clearInterval(t); off() }
  }, [])
```

Replace with:

```tsx
    load()
    const t = setInterval(load, 2000)
    window.wf.obsGetStatus().then(setObs)
    const off = window.wf.obsOnStatus(setObs)
    window.wf.getRehearsalMode().then(setRehearsal)
    const offUpdate = window.wf.onUpdateReady(() => setUpdateReady(true))
    return () => { clearInterval(t); off(); offUpdate() }
  }, [])
```

- [ ] **Step 3: Show the button**

Find:

```tsx
          <div className="flex items-center gap-1 text-[10px] leading-tight text-slate-500">
            <span>v{build?.version ?? '…'}</span>
            {build && !build.isPackaged && (
              <span className="rounded bg-amber-100 px-1 font-bold text-amber-700">DEV</span>
            )}
          </div>
```

Replace with:

```tsx
          <div className="flex items-center gap-1 text-[10px] leading-tight text-slate-500">
            <span>v{build?.version ?? '…'}</span>
            {build && !build.isPackaged && (
              <span className="rounded bg-amber-100 px-1 font-bold text-amber-700">DEV</span>
            )}
            {updateReady && (
              <button
                onClick={() => window.wf.updateInstallNow()}
                title="A new version has finished downloading — click to restart and install it"
                className="rounded bg-emerald-600 px-1.5 py-0.5 font-bold text-white hover:bg-emerald-700"
              >
                Restart to update
              </button>
            )}
          </div>
```

- [ ] **Step 4: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 335 tests (no new tests — UI display logic, matching this file's existing untested baseline), 0 lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/TopBar.tsx
git commit -m "feat: show a restart-to-update button once a download finishes"
```

Append a `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` trailer.

---

## Task 5: Document the release process

**Files:**
- Create: `docs/RELEASING.md`

- [ ] **Step 1: Write the doc**

Create `docs/RELEASING.md`:

```markdown
# Releasing a new version

WorshipFlow Pro checks GitHub for a newer release once at startup (see
`src/main/autoUpdate.ts`) and offers a one-click restart-to-update once it's
downloaded one. For that to have anything to find, a real GitHub Release
has to exist with the right files attached. This is a manual process today
— not automated, since it hasn't been run enough times yet to be worth
scripting.

## Steps

1. **Bump the version** in `package.json`'s `"version"` field (e.g.
   `0.12.4` → `0.13.0`). A patch bump for a bug fix, a minor bump for a new
   feature — whatever fits.

2. **Build the installer:**
   ```bash
   npm run dist
   ```
   This produces, in `dist-installer/`:
   - `WorshipFlow Pro Setup X.Y.Z.exe` — the installer itself.
   - `WorshipFlow Pro Setup X.Y.Z.exe.blockmap` — used by electron-updater
     for efficient differential downloads.
   - `latest.yml` — the manifest electron-updater reads to know the latest
     version number and the installer's checksum.

3. **Commit and push the version bump** (don't skip this — the next
   session needs `package.json` to reflect what was actually shipped):
   ```bash
   git add package.json package-lock.json
   git commit -m "chore: bump version to X.Y.Z"
   git push
   ```

4. **Create the GitHub Release:**
   - Go to https://github.com/rbrewer10/worshipflow/releases/new
   - Tag: `vX.Y.Z` (must start with `v`, matching electron-updater's
     expected format)
   - Title: whatever's clear — e.g. `X.Y.Z`
   - Attach all three files from `dist-installer/`: the `.exe`, the
     `.exe.blockmap`, and `latest.yml`.
   - Publish the release (not as a draft — draft releases aren't visible to
     the update check).

5. **Verify:** an already-installed older version, next time it's opened,
   should silently download this release in the background and show
   "Restart to update" in the top bar within a few minutes.

## Notes

- The repo is public specifically so this works with no access token
  embedded in the shipped app — see the 2026-08-02 auto-update design spec.
- If a release is ever published with the wrong files, or needs to be
  pulled, delete it entirely from GitHub rather than editing it in place —
  electron-updater caches metadata by tag, so an edited-in-place release can
  behave unpredictably.
```

- [ ] **Step 2: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 335 tests, 0 lint errors — this step is documentation-only and shouldn't affect any of the four, but running it keeps the habit consistent and catches anything unexpected immediately.

- [ ] **Step 3: Commit**

```bash
git add docs/RELEASING.md
git commit -m "docs: how to cut a release now that auto-update exists"
```

Append a `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` trailer.

---

## Task 6: Manual verification

No more code changes. This task is entirely **[manual]** — this sandbox cannot launch Electron, and genuine end-to-end verification needs a real published GitHub release, which doesn't exist yet. Ask the user to run through this once they've followed `docs/RELEASING.md` at least once.

- [ ] **Step 1: Dev mode is unaffected**

Run `npm run dev`. Confirm no auto-update-related errors, log spam, or network activity — `initAutoUpdate()`'s `!app.isPackaged` guard should make this a complete no-op.

- [ ] **Step 2: First release, nothing to find**

Following `docs/RELEASING.md`, publish the very first GitHub Release (e.g. `v0.13.0`). Install that build. Confirm the app opens normally with no "Restart to update" button — there's nothing newer than what's installed.

- [ ] **Step 3: A second release gets picked up**

Bump the version again and publish a second release (`v0.13.1`), per `docs/RELEASING.md`. Reopen the *v0.13.0* install (don't manually update it). Within a few minutes, confirm the "Restart to update" button appears next to the version number in the top bar.

- [ ] **Step 4: Installing it actually works**

Click "Restart to update." Confirm the app closes and the newer version opens automatically afterward — no manual installer double-click needed.

- [ ] **Step 5: Silent failure**

With no network connection, open a packaged build. Confirm nothing visible happens anywhere in the app — no error dialog, no broken screen, no console spam a volunteer would ever see.

---

## Self-review notes

**Spec coverage.** Architecture (§1) → Tasks 1-2 wire exactly the flow described. Component structure (§2) → every file in the spec's "New"/"Changed" lists has a task; nothing extra was added. Data flow (§3) → Task 2's `autoUpdate.ts` implements the startup-check → auto-download → notify-renderer → operator-clicks-restart sequence exactly as described, including the deliberate absence of any re-check trigger. Error handling (§4) → the silent-failure requirement (Task 2's `error` listener, no dialog, no renderer notification), the `!app.isPackaged` dev-mode guard, and the "no release published yet looks identical to no update available" case (both just mean `checkForUpdates()` finds nothing newer — no special-casing needed) are all covered. Testing (§5) → Task 6 covers the spec's 5-step manual list one-to-one; the "not unit-testable" reasoning for `autoUpdate.ts` is stated identically in both documents.

**Non-goals respected.** No release-automation script was built (Task 5 is a doc, not a script). No periodic re-check exists anywhere in Task 2's code. No changelog/progress-bar UI beyond the single button in Task 4. No change to `npm run dist`, NSIS config, or signing — none of those appear in any task's file list.

**Type consistency check.** `updateInstallNow(): void` and `onUpdateReady(cb: () => void): (() => void)` (Task 3, both the real preload binding and the browser mock) are the exact names and signatures Task 4's `TopBar.tsx` calls (`window.wf.updateInstallNow()`, `window.wf.onUpdateReady(() => setUpdateReady(true))`) — no renaming between definition and use. The IPC channel names (`wf:update:installNow`, `wf:update:ready`) match exactly between Task 2's `autoUpdate.ts` (`ipcMain.on('wf:update:installNow', ...)`, `.send('wf:update:ready')`) and Task 3's preload bindings (`ipcRenderer.send('wf:update:installNow')`, `ipcRenderer.on('wf:update:ready', ...)`) — no channel-name typos between the two sides.
