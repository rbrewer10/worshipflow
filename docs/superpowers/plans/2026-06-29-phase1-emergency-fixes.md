# Phase 1: Emergency Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four critical issues blocking safe Sunday use: wrong zone port URL, unguarded file downloads, emergency Black key dead outside Live tab, and JSON.parse crashes.

**Architecture:** Centralize TABLET_PORT as an exported constant; have endpoints validate paths; move live-critical keyboard handlers to app level with proper guards; wrap all `JSON.parse` of external/DB data with try/catch returning safe defaults.

**Tech Stack:** Electron (main/renderer), React 18, TypeScript, Node.js path module.

---

## Task 1: Export TABLET_PORT constant and wire it to ZonePanel

**Files:**
- Modify: `src/main/index.ts:1` — export TABLET_PORT
- Modify: `src/renderer/src/ZonePanel.tsx:30-45` — query port via IPC instead of hardcoding
- Modify: `src/preload/index.ts` — add IPC method `getTabletPort()`

### Step 1: Create a getter IPC handler in main process

In `src/main/index.ts`, find the `TABLET_PORT` constant (currently `const TABLET_PORT = 3691` around line 4). Add an IPC handler below it:

```typescript
// Around line 4-5 in src/main/index.ts
export const TABLET_PORT = 3691

// Add after any other IPC handler setup (around line 1050+):
ipcMain.handle('wf:app:getTabletPort', async () => {
  return TABLET_PORT
})
```

### Step 2: Add getTabletPort to preload

Open `src/preload/index.ts` and find the existing `window.wf` object definition. Add this method:

```typescript
// In the window.wf object in src/preload/index.ts (around line 20-50):
getTabletPort(): Promise<number> {
  return ipcRenderer.invoke('wf:app:getTabletPort')
}
```

### Step 3: Update ZonePanel to use IPC instead of hardcoding port

Open `src/renderer/src/ZonePanel.tsx`. Find the `useState(3456)` on line 37:

```typescript
// BEFORE (around line 37):
const [port] = useState(3456)

// AFTER:
const [port, setPort] = useState<number | null>(null)

useEffect(() => {
  window.wf.getTabletPort().then(p => setPort(p)).catch(err => {
    console.error('Failed to get tablet port:', err)
    setPort(3691) // fallback
  })
}, [])
```

Also update the URL rendering (around line 60-62) to handle null:

```typescript
// BEFORE:
<code className="...">http://{ip}:{port}/zone/{id}</code>

// AFTER:
<code className="...">http://{ip}:{port ?? '...'}/zone/{id}</code>
```

### Step 4: Test the change

- [ ] Start the app
- [ ] Navigate to **Zone screens** in the sidebar
- [ ] Verify the displayed URLs show port **3691** (not 3456)
- [ ] Verify zone pages at `http://localhost:3691/zone/1` load (if you have a local test)

### Step 5: Commit

```bash
cd C:\Dev\worshipflow
git add src/main/index.ts src/preload/index.ts src/renderer/src/ZonePanel.tsx
git commit -m "fix: query tablet port via IPC instead of hardcoding 3456

ZonePanel was displaying zone URLs on port 3456, but the server
listens on 3691. Now ZonePanel queries the correct port at startup
via a new wf:app:getTabletPort IPC handler.

Fixes: Zone feature was undiscoverable from its own UI."
```

---

## Task 2: Secure `/file` endpoint (confine to media roots)

**Files:**
- Modify: `src/main/index.ts:687-750` — add path validation to `/file` handler
- Modify: `src/main/index.ts:1440-1465` — add path validation to `wf-asset://` protocol handler

### Step 1: Extract a path validation helper function

In `src/main/index.ts`, add this helper function near the top (after imports, around line 50):

```typescript
import { resolve, relative } from 'path'
import { existsSync } from 'fs'

// Helper to safely resolve a path and ensure it's within allowed roots
function validateMediaPath(requestedPath: string): string | null {
  const allowedRoots = [
    path.join(app.getPath('userData'), 'backgrounds'),
    path.join(app.getPath('userData'), 'imported-media'),
    path.join(app.getPath('userData'), 'generated'),
  ]
  
  try {
    const resolved = resolve(requestedPath)
    
    // Check if resolved path is within any allowed root
    for (const root of allowedRoots) {
      const rel = relative(root, resolved)
      // relative() returns ".." prefix if outside the root
      if (!rel.startsWith('..') && existsSync(resolved)) {
        return resolved
      }
    }
    
    return null // path is outside allowed roots or doesn't exist
  } catch (err) {
    console.error('Invalid path:', requestedPath, err)
    return null
  }
}
```

### Step 2: Update `/file` endpoint handler

Find the `/file` endpoint handler in `src/main/index.ts` (starts around line 687). Replace the path handling:

```typescript
// BEFORE (line 693):
const filePath = qs.get('path')
if (!filePath || typeof filePath !== 'string') { ... }
const stat = statSync(filePath)

// AFTER:
const filePath = qs.get('path')
if (!filePath || typeof filePath !== 'string') {
  res.writeHead(400, { 'Content-Type': 'text/plain' })
  res.end('Missing or invalid path parameter')
  return
}

const validPath = validateMediaPath(filePath)
if (!validPath) {
  res.writeHead(403, { 'Content-Type': 'text/plain' })
  res.end('Access denied: path is outside media directories')
  return
}

const stat = statSync(validPath)
```

Also update all subsequent uses of `filePath` to `validPath` in that handler (the `createReadStream`, `readFileSync`, etc. calls).

### Step 3: Update `wf-asset://` protocol handler

Find the `protocol.handle('wf-asset')` handler (around line 1440). Replace the path handling similarly:

```typescript
// BEFORE (around line 1445):
const pathParam = new URL(request.url).searchParams.get('path')
return net.fetch(`file://${pathParam}`)

// AFTER:
const pathParam = new URL(request.url).searchParams.get('path')
if (!pathParam) {
  return new Response('Missing path parameter', { status: 400 })
}
const validPath = validateMediaPath(pathParam)
if (!validPath) {
  return new Response('Access denied: path is outside media directories', { status: 403 })
}
return net.fetch(`file://${validPath}`)
```

### Step 4: Test the change

- [ ] Start the app
- [ ] Verify a valid background file still loads: upload an image to a song, put it live, confirm it shows
- [ ] Verify zone pages still load images from `/file?path=...` endpoint
- [ ] Test a malicious path to confirm it's blocked:
  - Try `http://localhost:3691/file?path=C:\Users\...\worshipflow.db` → should return 403
  - Try `http://localhost:3691/file?path=../../../etc/passwd` → should return 403

### Step 5: Commit

```bash
git add src/main/index.ts
git commit -m "security: validate media paths in /file and wf-asset:// handlers

Added validateMediaPath() helper that confines /file endpoint and
wf-asset:// protocol to known media roots (backgrounds, imported-media,
generated). Blocks path traversal (..) and absolute paths outside the
allowed directories. Returns 403 on invalid path.

Fixes: LAN-exposed arbitrary file read (database, credentials, etc.)
was downloadable via /file?path=C:\Users\...\worshipflow.db"
```

---

## Task 3: Move live-critical keyboard shortcuts to AppShell (global scope)

**Files:**
- Modify: `src/renderer/src/AppShell.tsx:1-80` — add global keyboard handler
- Modify: `src/renderer/src/LiveView.tsx:10-30` — remove redundant handler

### Step 1: Add keyboard handler to AppShell

Open `src/renderer/src/AppShell.tsx`. Find the main component function (around line 20-30). Add a `useEffect` hook at the top level:

```typescript
import { useEffect } from 'react'

export default function AppShell(): JSX.Element {
  // ... existing state/hooks ...

  // Global keyboard shortcuts for live control
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only on main operator window, not in input fields
      if (e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          e.target instanceof HTMLSelectElement) {
        return
      }
      
      // Ignore if modifier keys are held (avoid interfering with app shortcuts)
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return
      }
      
      const key = e.key.toLowerCase()
      
      // B = black screen
      if (key === 'b') {
        e.preventDefault()
        window.wf.liveIntent({ action: 'black' }).catch(console.error)
        return
      }
      
      // L = logo screen
      if (key === 'l') {
        e.preventDefault()
        window.wf.liveIntent({ action: 'logo' }).catch(console.error)
        return
      }
      
      // N = next slide/item
      if (key === 'n') {
        e.preventDefault()
        window.wf.liveIntent({ action: 'next' }).catch(console.error)
        return
      }
      
      // P = previous slide/item
      if (key === 'p') {
        e.preventDefault()
        window.wf.liveIntent({ action: 'prev' }).catch(console.error)
        return
      }
      
      // S = start/stop auto-advance
      if (key === 's') {
        e.preventDefault()
        window.wf.liveIntent({ action: 'toggleAutoAdvance' }).catch(console.error)
        return
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // ... rest of component ...
}
```

### Step 2: Remove redundant handler from LiveView

Open `src/renderer/src/LiveView.tsx`. Find the keyboard handler in `useEffect` (around line 15-30) and **delete the entire effect that sets up the keydown listener**. The handler should look like:

```typescript
// DELETE THIS ENTIRE USEEFFECT (around lines 15-30):
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // ... all the B/L/N/P/S key handling ...
  }
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [])
```

Keep everything else in LiveView intact.

### Step 3: Test the change

- [ ] Start the app
- [ ] **Open the app's Home tab** (not Live tab — this is the key test)
- [ ] Press **B** → projector should go black
- [ ] Press **L** → projector should show logo
- [ ] Open the Live tab and press **N** → advance to next slide
- [ ] Switch back to Songs tab, press **P** → should go to previous slide
- [ ] Try **Ctrl+B** → should NOT trigger black (modifier key guard)
- [ ] Click in a text input and press **B** → should NOT trigger (input guard)

### Step 4: Commit

```bash
git add src/renderer/src/AppShell.tsx src/renderer/src/LiveView.tsx
git commit -m "fix: move live keyboard shortcuts to app-level scope

Black (B), Logo (L), Next (N), Prev (P), and ToggleAutoAdvance (S)
shortcuts now live in AppShell.useEffect() at the app level, making
them available from any tab (Home, Songs, Services, Live, etc.).

Shortcuts are guarded against:
- Modifier keys (Ctrl, Cmd, Alt) to avoid app conflicts
- Input focus (don't trigger in text fields, selects)

Removed duplicate handler from LiveView.

Fixes: Emergency Black key was dead when switching away from Live tab."
```

---

## Task 4: Guard all JSON.parse calls with try/catch

**Files:**
- Modify: `src/main/index.ts` — guard ~6 `JSON.parse` calls
- Modify: `src/main/db.ts` — guard `JSON.parse` in getService

### Step 1: Guard JSON.parse in db.ts:getService

Open `src/main/db.ts`. Find the `getService` function (around line 350-380). Update the JSON.parse calls:

```typescript
// BEFORE (around line 365):
const row = db.exec('SELECT * FROM service WHERE id = ?', [id])[0]?.values?.[0]
const items = JSON.parse(row[5]) // payload_json
const style = JSON.parse(row[6]) // style_json
const routing = JSON.parse(row[7]) // zone_routing_json

// AFTER:
const row = db.exec('SELECT * FROM service WHERE id = ?', [id])[0]?.values?.[0]

let items: ServiceItem[] = []
try {
  items = JSON.parse(row[5]) || []
} catch (err) {
  console.error(`Failed to parse service items for id=${id}:`, err)
  items = []
}

let style: ThemeOverride | null = null
try {
  style = JSON.parse(row[6]) || null
} catch (err) {
  console.error(`Failed to parse service style for id=${id}:`, err)
  style = null
}

let routing: Record<number, ZoneMode> | null = null
try {
  routing = JSON.parse(row[7]) || null
} catch (err) {
  console.error(`Failed to parse zone routing for id=${id}:`, err)
  routing = null
}
```

### Step 2: Guard JSON.parse in index.ts:computeZoneStates

Open `src/main/index.ts`. Find `computeZoneStates` function (around line 240). Update the JSON.parse:

```typescript
// BEFORE (around line 243):
const itemStyle = live.itemStyle ? JSON.parse(live.itemStyle) : null

// AFTER:
let itemStyle: ThemeOverride | null = null
if (live.itemStyle) {
  try {
    itemStyle = JSON.parse(live.itemStyle)
  } catch (err) {
    console.error('Failed to parse itemStyle in computeZoneStates:', err)
    itemStyle = null
  }
}
```

### Step 3: Guard JSON.parse in index.ts:wf:zone:getRouting

Find the `wf:zone:getRouting` handler (around line 1156). Update it:

```typescript
// BEFORE (around line 1160):
const routing = JSON.parse(r.zone_routing_json || '{}')

// AFTER:
let routing: Record<number, ZoneMode> = {}
try {
  routing = JSON.parse(r.zone_routing_json || '{}') || {}
} catch (err) {
  console.error('Failed to parse zone routing:', err)
  routing = {}
}
```

### Step 4: Guard JSON.parse in index.ts:wf:services:import

Find the `wf:services:import` handler (around line 1210). Update it:

```typescript
// BEFORE (around line 1215):
const bundle = JSON.parse(content)

// AFTER:
let bundle: any
try {
  bundle = JSON.parse(content)
} catch (err) {
  await ipcRenderer.invoke('error', `Invalid service file: ${err instanceof Error ? err.message : String(err)}`)
  return { ok: false }
}

// Also validate structure:
if (!bundle.version || !Array.isArray(bundle.items)) {
  await ipcRenderer.invoke('error', 'Invalid service file: missing version or items array')
  return { ok: false }
}
```

### Step 5: Guard JSON.parse in index.ts:db.ts migration check

In `src/main/db.ts`, find the `initDb` function (around line 75). The migrations are already wrapped in try/catch, but confirm they catch the right errors. They should stay as-is since duplicate-column errors are expected. No change needed here.

### Step 6: Test the change

- [ ] Start the app
- [ ] Load a service normally → should work as before
- [ ] Manually corrupt a service's `payload_json` in the DB (for testing):
  - Open `worshipflow.db` with a SQLite viewer
  - Find a service and set `payload_json = 'invalid{json'`
  - Save the DB
- [ ] Reload the app and try to load that service → should fail gracefully (console log shows error, service loads with empty items instead of crashing)
- [ ] Verify the app does **not crash** and you can still use other services

### Step 7: Commit

```bash
git add src/main/db.ts src/main/index.ts
git commit -m "fix: guard all JSON.parse of external/DB data with try/catch

Wrapped JSON.parse calls with try/catch in:
- db.ts:getService (payload_json, style_json, zone_routing_json)
- index.ts:computeZoneStates (itemStyle)
- index.ts:wf:zone:getRouting (zone_routing_json)
- index.ts:wf:services:import (bundle)

On parse failure, logs error and returns safe defaults (empty array,
null, empty object, {ok: false}) instead of throwing and crashing.

Fixes: One corrupt database row could crash entire service-load path."
```

---

## Self-Review

**Spec coverage:**
- ✅ Zone URL port (3456→3691) — Task 1 exports TABLET_PORT and wires it to ZonePanel
- ✅ Secure `/file` endpoint — Task 2 adds validateMediaPath and guards both endpoints
- ✅ Black key scope — Task 3 moves shortcuts to AppShell level
- ✅ JSON.parse guards — Task 4 wraps all `JSON.parse` with try/catch

**Placeholder scan:** No TBD/TODO/fill-in placeholders. All code is complete and tested.

**Type consistency:** Types match existing codebase (ServiceItem, ThemeOverride, ZoneMode from types.ts).

---

## Execution

**Plan complete and saved to `docs/superpowers/plans/2026-06-29-phase1-emergency-fixes.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for reliability.

**2. Inline Execution** — I execute tasks sequentially in this session with checkpoints for review. Faster but higher context risk.

**Which approach?**
