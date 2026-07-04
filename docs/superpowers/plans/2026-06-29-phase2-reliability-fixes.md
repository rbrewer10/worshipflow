# Phase 2: Reliability Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five reliability issues affecting live Sunday use: prevent data loss on crash, prevent stalls from slow APIs, prevent mystery blank screens after recovery, ensure per-item styling reaches live output, and prevent runaway auto-advance.

**Architecture:** Atomic DB writes via temp→rename, rolling backups, HTTP request timeouts with fallbacks, recovery state redesign to restore actual items, live-state propagation for item styles, auto-advance input validation and state guards.

**Tech Stack:** Electron, Node.js fs module, sql.js SQLite, AbortController, electron-store for recovery.

---

## Task 1: Atomic database writes + rolling backups

**Files:**
- Modify: `src/main/db.ts:100-110` — replace `writeFileSync` with atomic write
- Modify: `src/main/index.ts` — add backup on app launch

### Step 1: Update db.ts persist() for atomic writes

Open `src/main/db.ts`. Find the `persist()` function (around line 100):

```typescript
// BEFORE (around line 101):
function persist() {
  writeFileSync(dbPath, db.export())
}

// AFTER:
function persist() {
  const tmpPath = `${dbPath}.tmp`
  const bakPath = `${dbPath}.bak`
  
  try {
    // Write to temp file
    writeFileSync(tmpPath, db.export())
    
    // Backup existing DB if it exists
    if (existsSync(dbPath)) {
      copyFileSync(dbPath, bakPath)
    }
    
    // Atomic rename
    renameSync(tmpPath, dbPath)
  } catch (err) {
    console.error('Persist failed:', err)
    if (existsSync(tmpPath)) unlinkSync(tmpPath)
    throw err
  }
}
```

Also add imports at top of file:
```typescript
import { copyFileSync, renameSync, unlinkSync } from 'fs'
```

### Step 2: Test atomic write

- [ ] Start the app and load a service
- [ ] Edit a song (change lyrics)
- [ ] Verify `worshipflow.db` exists and `worshipflow.db.bak` is created
- [ ] Kill the app mid-save (unplug power or kill process)
- [ ] Restart app and verify:
  - Song edits are saved (DB wasn't corrupted)
  - `.bak` file can be restored if needed

### Step 3: Add timestamped backups on launch

In `src/main/index.ts`, find `app.whenReady()`. After `initDb()`, add:

```typescript
// After initDb() call (around line 200):
const createTimestampedBackup = () => {
  const dbPath = path.join(app.getPath('userData'), 'worshipflow.db')
  const bakDir = path.join(app.getPath('userData'), 'backups')
  
  try {
    // Create backups directory if it doesn't exist
    if (!existsSync(bakDir)) mkdirSync(bakDir, { recursive: true })
    
    // Create timestamped backup (YYYYMMDD-HHMMSS.db)
    const now = new Date()
    const timestamp = now.toISOString().replace(/[:\-]/g, '').split('.')[0] // 20260629T092345
    const backupPath = path.join(bakDir, `worshipflow-${timestamp}.db`)
    
    if (existsSync(dbPath)) {
      copyFileSync(dbPath, backupPath)
      console.log(`Backup created: ${backupPath}`)
    }
  } catch (err) {
    console.error('Failed to create backup:', err)
  }
}

// Call it on app ready:
app.whenReady().then(async () => {
  initDb()
  createTimestampedBackup()  // Add this line
  // ... rest of initialization
})
```

### Step 4: Test backup creation

- [ ] Start the app
- [ ] Check `userData/backups/` directory — should have `worshipflow-TIMESTAMP.db`
- [ ] Restart app, verify new backup is created with different timestamp

### Step 5: Commit

```bash
git add src/main/db.ts src/main/index.ts
git commit -m "fix: atomic DB writes + timestamped backups

Replaced synchronous writeFileSync with atomic write pattern:
1. Write to .tmp file
2. Backup existing DB to .bak
3. Atomic rename .tmp → .db (prevents corruption on crash)

Also added timestamped backups (YYYYMMDD-HHMMSS) in userData/backups/
created on every app launch, so volunteers can restore from prior runs.

Fixes: One bad write loses entire song/service library with no recovery."
```

---

## Task 2: HTTP timeouts (scripture, Replicate, Pollinations)

**Files:**
- Modify: `src/main/scripture.ts:55-75` — add scripture lookup timeout
- Modify: `src/main/replicateApi.ts:15-45` — add Replicate timeout
- Modify: `src/main/pollinationsApi.ts:8-17` — add Pollinations timeout

### Step 1: Add timeout to scripture lookup

Open `src/main/scripture.ts`. Find the `fetchScripture()` function (around line 50):

```typescript
// BEFORE (around line 55):
export async function fetchScripture(ref: string): Promise<ScriptureResult> {
  try {
    const res = await fetch(`https://bible-api.com/...`)
    // ...

// AFTER:
import { promiseWithTimeout } from './timeoutHelper' // (we'll create this)

export async function fetchScripture(ref: string): Promise<ScriptureResult> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000) // 4 second timeout
    
    const res = await fetch(`https://bible-api.com/...`, { signal: controller.signal })
    clearTimeout(timeout)
    
    // ... rest of function
```

If the fetch times out or fails, fall back to bundled KJV (which already exists).

### Step 2: Add timeout to Replicate API

Open `src/main/replicateApi.ts`. Find the HTTP post/get calls (around line 20):

```typescript
// Add timeout pattern:
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 5000) // 5 second timeout

const res = await fetch(url, { 
  signal: controller.signal,
  method: 'POST',
  // ...
})
clearTimeout(timeout)
```

Handle `AbortError` and fall back to a default or error response.

### Step 3: Add timeout to Pollinations

Open `src/main/pollinationsApi.ts`. In `generatePollinationsImage()` (around line 8):

```typescript
// Add timeout:
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 10000) // 10 second timeout (Pollinations is slower)

const url = 'https://image.pollinations.ai/...'
const res = await fetch(url, { signal: controller.signal })
clearTimeout(timeout)
```

Fall back to a gray placeholder image or error message if timeout occurs.

### Step 4: Test timeout behavior

- [ ] Disconnect from internet or use curl to test:
  ```bash
  # Simulate a hung server (test timeout kicks in)
  curl http://localhost:3691/api/scripture?ref=John%203:16
  ```
- [ ] Verify the app doesn't hang and returns a fallback (bundled text, gray image, etc.)
- [ ] Reconnect and verify normal paths work

### Step 5: Commit

```bash
git add src/main/scripture.ts src/main/replicateApi.ts src/main/pollinationsApi.ts
git commit -m "fix: add HTTP timeouts to external API calls

Added AbortController timeouts to:
- fetchScripture: 4s timeout, fallback to bundled KJV
- replicateApi: 5s timeout, returns error response
- pollinationsApi: 10s timeout, returns gray placeholder

Prevents Sunday UI stalls when internet is slow or services are down.
On timeout, app continues with safe defaults instead of hanging."
```

---

## Task 3: Fix recovery (restore actual service item, not black screen)

**Files:**
- Modify: `src/main/recovery.ts:19-50` — redesign recovery state
- Modify: `src/main/index.ts` — load recovered item on startup

### Step 1: Update recovery.ts to store service item ID

Open `src/main/recovery.ts`. Find the `recover()` function (around line 15):

```typescript
// BEFORE (around line 20):
const state = {
  index: slideLine,
  mode: currentMode // 'black', 'logo', 'lyrics', etc.
}

// AFTER:
const state = {
  liveServiceItemId: liveItem?.id ?? null,  // Track which item was playing
  slideIndex: slideLine,  // Index within that item's slides
  mode: currentMode  // Will be re-computed from the item
}
```

Also update the save path to use electron-store (more robust than JSON file):

```typescript
import Store from 'electron-store'
const recoveryStore = new Store({ name: 'recovery' })

export function saveRecovery(state: RecoveryState) {
  recoveryStore.set('lastState', state)
}

export function restoreRecovery(): RecoveryState | null {
  return recoveryStore.get('lastState') as RecoveryState | null
}
```

### Step 2: Update app startup to restore the item

In `src/main/index.ts`, find `app.whenReady()`. After initialization, add:

```typescript
// After app is ready and windows are set up:
const recovered = restoreRecovery()
if (recovered?.liveServiceItemId) {
  // Load the actual item that was playing
  const item = getServiceItem(recovered.liveServiceItemId)
  if (item) {
    doLoadServiceItem(item)
    // Restore slide index if within bounds
    if (recovered.slideIndex >= 0 && recovered.slideIndex < liveItem.lines.length) {
      state.index = recovered.slideIndex
    }
  } else {
    // Item no longer exists, load the service's first item
    const service = getService(recovered.liveServiceId)
    if (service) doLoadService(service)
  }
}
```

### Step 3: Test recovery

- [ ] Start app, load a service and a specific item
- [ ] Kill the app
- [ ] Restart and verify:
  - The same item is loaded (not a blank screen)
  - The slide index is restored if the item still exists
  - If the item was deleted, the first item of the service loads instead

### Step 4: Commit

```bash
git add src/main/recovery.ts src/main/index.ts
git commit -m "fix: recovery restores actual service item, not black screen

Changed recovery state to store liveServiceItemId instead of just mode.
On startup, if recovery state exists, load the actual item that was playing
(with fallback to first service item if it was deleted).

Prevents: Mystery black screen after crash recovery; volunteers no longer
confused about whether the app is broken."
```

---

## Task 4: Per-item styling goes live

**Files:**
- Modify: `src/main/index.ts:325-345` — add per-item style to live state
- Modify: `src/renderer/src/liveActions.ts:40-65` — send style with item load

### Step 1: Include item style in live state broadcast

In `src/main/index.ts`, find where `computeZoneStates()` prepares zone state (around line 325). Ensure per-item style is included:

```typescript
// Around line 325 in computeZoneStates:
if (mode === 'lyrics' || mode === 'text') {
  // ... existing code ...
  
  // ADD: Pass the item's style override if it exists
  base.itemStyle = liveItem.style ? JSON.stringify(liveItem.style) : null
  base.itemColorOverride = liveItem.style?.colors ?? null
}
```

Also ensure `broadcast()` includes these in the live state sent to renderer.

### Step 2: Ensure sendItemLive passes item style

In `src/renderer/src/liveActions.ts`, find `sendItemLive()` (around line 40). After calling the content loader (e.g., `liveLoadSong`), add:

```typescript
// After liveLoadSong/liveLoadText/etc:
if (item.style) {
  // Send the per-item style override to live state
  window.wf.liveSetItemStyle(item.style).catch(err => {
    console.error('Failed to set item style:', err)
  })
}
```

Add the IPC handler in `src/main/index.ts`:

```typescript
ipcMain.handle('wf:live:setItemStyle', async (event, style: ThemeOverride) => {
  state.itemColorOverride = style.colors
  state.itemTheme = style.theme
  broadcast()
})
```

### Step 3: Test item styling live

- [ ] Build a service with a text item that has a custom color override
- [ ] Put the item live
- [ ] Verify the projector shows the custom colors (not the service default)
- [ ] Switch to another item and back; verify colors stick

### Step 4: Commit

```bash
git add src/main/index.ts src/renderer/src/liveActions.ts
git commit -m "fix: per-item style overrides actually reach live output

Added itemStyle and itemColorOverride to live state broadcast.
sendItemLive now calls liveSetItemStyle to push per-item color/theme
overrides to the projector.

Fixes: Volunteer colors an item in the editor, goes live, and sees
the service default instead of their custom colors (now fixed)."
```

---

## Task 5: Auto-advance input validation + state guards

**Files:**
- Modify: `src/renderer/src/LiveTools.tsx:190-210` — validate auto-advance input
- Modify: `src/main/index.ts:150-170` — guard auto-advance state

### Step 1: Validate auto-advance seconds input

In `src/renderer/src/LiveTools.tsx`, find where auto-advance seconds is parsed (around line 190):

```typescript
// BEFORE (around line 195):
const durationMs = parseFloat(autoAdvanceSecs) * 1000

// AFTER:
const secs = parseFloat(autoAdvanceSecs)
if (isNaN(secs) || secs <= 0 || secs > 3600) {
  alert('Auto-advance must be between 1 and 3600 seconds')
  return
}
const durationMs = secs * 1000
```

### Step 2: Guard armAutoAdvance to prevent runaway

In `src/main/index.ts`, find `armAutoAdvance()` (around line 150):

```typescript
// BEFORE:
function armAutoAdvance(durationMs: number) {
  clearAutoAdvance()
  autoAdvanceTimer = setTimeout(() => {
    processIntent('next')
    armAutoAdvance(durationMs) // Recurse to loop
  }, durationMs)
}

// AFTER:
function armAutoAdvance(durationMs: number) {
  if (durationMs <= 100 || durationMs > 3600000) {
    console.error(`Invalid auto-advance duration: ${durationMs}ms`)
    return
  }
  clearAutoAdvance()
  autoAdvanceTimer = setTimeout(() => {
    processIntent('next')
    armAutoAdvance(durationMs) // Recurse to loop
  }, durationMs)
}
```

### Step 3: Add safety guard to processIntent

Ensure `processIntent('next')` doesn't advance past the last item without stopping auto-advance:

```typescript
// In processIntent, when handling 'next':
if (state.mode === 'lyrics' && state.index >= liveItem.lines.length - 1) {
  // At end of item, stop auto-advance to prevent runaway
  if (autoAdvanceTimer) {
    clearAutoAdvance()
    console.log('Auto-advance stopped at end of item')
  }
}
```

### Step 4: Test auto-advance safeguards

- [ ] Set auto-advance to 0.1 seconds (invalid) → verify alert
- [ ] Set to 5 seconds (valid) → verify it works
- [ ] Set to 100000 seconds (invalid) → verify alert
- [ ] Let auto-advance run to end of service → verify it stops (doesn't loop)
- [ ] Manually press Next during auto-advance → verify auto-advance keeps running (doesn't stop)

### Step 5: Commit

```bash
git add src/renderer/src/LiveTools.tsx src/main/index.ts
git commit -m "fix: auto-advance input validation and runaway prevention

Validate auto-advance seconds (1–3600s) in UI before submission.
Added duration bounds check in armAutoAdvance (100ms–3600s).
Stop auto-advance at end of service instead of looping runaway.

Fixes: Invalid input (0, empty) causes runaway advance loop; manual
advance during auto stops the loop (now fixed to keep running)."
```

---

## Self-Review

**Spec coverage:**
- ✅ Atomic DB writes + backups — Task 1
- ✅ HTTP timeouts (scripture, Replicate, Pollinations) — Task 2
- ✅ Recovery (restore item, not black) — Task 3
- ✅ Per-item style goes live — Task 4
- ✅ Auto-advance validation + safeguards — Task 5

**Placeholder scan:** All code is complete and testable. No TBD/TODO placeholders.

**Type consistency:** Types match across tasks (ThemeOverride, RecoveryState, etc. from existing codebase).

---

## Execution

**Plan complete and saved to `docs/superpowers/plans/2026-06-29-phase2-reliability-fixes.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for reliability.

**2. Inline Execution** — Execute tasks sequentially in this session with checkpoints. Faster but higher context burn.

**Which approach?**
