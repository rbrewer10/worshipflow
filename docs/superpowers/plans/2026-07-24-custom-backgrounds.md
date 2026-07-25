# Custom Background Images for More Slide Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Scripture, Countdown, and Welcome items use a custom background image the same way Text items already can, and make the picker for all of them (plus Text) show a real "My Backgrounds" library — with an Open-folder button for bulk drops — instead of only the built-in gradient presets.

**Architecture:** Fix the actual root cause (`doLoadScripture`/`doLoadCountdown` in the main process hardcode the live background to `null`, ignoring the item's saved value) by threading an optional `background` parameter through the same call chain the Text-item fontScale fix already established. Extract the Song editor's existing background-upload UI into a shared, generic component so the item editor can reuse it instead of only showing gradients.

**Tech Stack:** Electron main process (TypeScript), React 18 renderer.

**Design doc:** [`docs/superpowers/specs/2026-07-24-custom-backgrounds-design.md`](../specs/2026-07-24-custom-backgrounds-design.md)

---

## Testing convention

Matches this codebase's established pattern (confirmed in the design doc's own Testing section, and in how the prior Text-item fontScale fix shipped): this is UI/rendering wiring over already-tested/already-working IPC (`wf:bg:*`), not new pure logic — no unit tests to add. Verified manually (Task 7) plus `npm run typecheck` / `npm test` (regression-only) after each task.

## File Structure

- **Modify** `src/main/index.ts` — thread `background` through `doLoadScripture`/`doLoadCountdown`, their IPC handlers, and `handleTabletLoadItem`; extend `computeZoneStates()`'s countdown branch; add `wf:bg:openFolder` IPC handler.
- **Modify** `src/main/backgroundLib.ts` — add `openBackgroundsFolder()`.
- **Modify** `src/preload/index.ts` — mirror the new IPC signatures + `bgOpenFolder`.
- **Modify** `src/renderer/src/liveActions.ts`, `src/renderer/src/VolunteerView.tsx` — pass the item's saved background through on scripture/countdown/welcome go-live.
- **Modify** `src/renderer/src/browserWfMock.ts` — add `bgOpenFolder` mock.
- **Create** `src/renderer/src/BackgroundLibraryGrid.tsx` — the shared "My Backgrounds" grid (search, drag-drop, thumbnails, Open-folder button), extracted from the Song editor's background panel.
- **Modify** `src/renderer/src/editor/BackgroundPanel.tsx` — use the extracted grid in its "My Uploads" tab (pure extraction).
- **Modify** `src/renderer/src/ItemBackgroundPanel.tsx` — add My Backgrounds / Presets tabs for Text/Scripture/Countdown/Welcome items; other item types unaffected.
- **Modify** `src/renderer/src/ServiceSlidePreview.tsx` — extend the background-file resolution to Scripture/Countdown/Welcome.

---

### Task 1: Thread `background` through `doLoadScripture`/`doLoadCountdown`

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/liveActions.ts`
- Modify: `src/renderer/src/VolunteerView.tsx`

- [ ] **Step 1: `doLoadCountdown` — accept and preserve `background`**

In `src/main/index.ts`, replace `doLoadCountdown`:

```ts
function doLoadCountdown(track: TrackId, seconds: number, background?: string | null): void {
  const t = tracks[track]
  clearCountdown(track)
  t.songId = null
  t.scriptureRef = null
  clearSongMeta(track)
  t.bgFit = 'cover'
  const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  let remaining = seconds
  const bg = background ?? null
  t.song = { title: 'Countdown', lines: [fmt(remaining)], background: bg }
  t.songTextColor = null; t.songFont = null
  t.mode = 'countdown' as Mode
  t.index = 0
  t.countdownTimer = setInterval(() => {
    remaining--
    if (remaining <= 0) {
      clearCountdown(track)
      t.song = { title: 'Countdown', lines: ['0:00'], background: bg }
      t.mode = 'black'
      broadcast()
      return
    }
    t.song = { title: 'Countdown', lines: [fmt(remaining)], background: bg }
    broadcast()
  }, 1000)
}
```

The key fix: `bg` is captured once, outside the interval, and reused on every tick — the original always rebuilt `t.song` with `background: null` every second, which would have silently wiped out a real background even if one had been passed in.

- [ ] **Step 2: `doLoadScripture` — accept `background`**

Replace `doLoadScripture`:

```ts
async function doLoadScripture(track: TrackId, reference: string, background?: string | null): Promise<boolean> {
  const result = bibleTranslation === 'kjv'
    ? lookupScripture(reference)
    : await fetchScripture(reference, bibleTranslation)
  if (!result.ok || !result.verses) {
    logWarn(`[scripture] lookup failed for reference="${reference}" translation=${bibleTranslation}`)
    return false
  }
  if (result.usedFallback) {
    notifyOperator(`Online lookup failed — showing KJV for "${reference}"`, 'warn')
  }
  const t = tracks[track]
  clearCountdown(track)
  t.songId = null
  t.scriptureRef = reference
  clearSongMeta(track)
  t.bgFit = 'cover'
  const lines =
    result.verses.length === 1
      ? [result.verses[0].text]
      : result.verses.map((v) => `${v.n}  ${v.text}`)
  t.song = { title: result.reference!, lines, background: background ?? null }
  t.songTextColor = null; t.songFont = null
  t.mode = 'lyrics'
  t.index = 0
  return true
}
```

- [ ] **Step 3: `handleTabletLoadItem` — pass the item's saved background through**

In `handleTabletLoadItem`, replace the `scripture` branch:

```ts
  } else if (item.type === 'scripture') {
    const ref = item.payload.reference as string
    if (!ref) return
    if (!(await doLoadScripture(track, ref, item.payload.background as string | null | undefined))) return  // lookup failed → don't mark it live
```

Replace the `countdown` branch:

```ts
  } else if (item.type === 'countdown') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return
    doLoadCountdown(track, secs, item.payload.background as string | null | undefined)
```

Replace the `welcome` branch:

```ts
  } else if (item.type === 'welcome') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return
    doLoadCountdown(track, secs, item.payload.background as string | null | undefined)
```

- [ ] **Step 4: IPC handlers — accept and pass `background`**

Replace `wf:live:loadCountdown`:

```ts
ipcMain.handle('wf:live:loadCountdown', (_e, track: TrackId, seconds: number, background?: string | null) => {
  doLoadCountdown(track, seconds, background); broadcast()
})
```

Replace `wf:live:loadScripture`:

```ts
ipcMain.handle('wf:live:loadScripture', async (_e, track: TrackId, reference: string, background?: string | null): Promise<boolean> => {
  const ok = await doLoadScripture(track, reference, background)
  if (ok) broadcast()
  return ok
})
```

- [ ] **Step 5: Preload — mirror the new signatures**

In `src/preload/index.ts`, replace:

```ts
  liveLoadScripture: (track: TrackId, reference: string, background?: string | null): Promise<boolean> =>
    ipcRenderer.invoke('wf:live:loadScripture', track, reference, background),
  liveLoadText: (track: TrackId, title: string, body: string, background?: string | null, fontScale?: number): Promise<void> =>
    ipcRenderer.invoke('wf:live:loadText', track, title, body, background ?? null, fontScale),
  liveLoadCountdown: (track: TrackId, seconds: number, background?: string | null): Promise<void> =>
    ipcRenderer.invoke('wf:live:loadCountdown', track, seconds, background),
```

(This replaces the existing `liveLoadScripture`, `liveLoadText` — unchanged, included only so you can locate the block — and `liveLoadCountdown` lines; `liveLoadText` itself is not modified in this task.)

- [ ] **Step 6: `liveActions.ts` — pass the item's saved background on go-live**

In `src/renderer/src/liveActions.ts`, replace the `scripture` branch inside `sendItemLive`:

```ts
  } else if (item.type === 'scripture') {
    const ref = item.payload.reference as string
    if (!ref) return false
    // A failed lookup must NOT mark the item live — that would leave the previous
    // content on screen re-themed as scripture while the deck says scripture is live.
    const ok = await window.wf.liveLoadScripture(track, ref, item.payload.background as string | null | undefined)
    if (!ok) return false
```

Replace the `countdown` branch:

```ts
  } else if (item.type === 'countdown') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return false
    await window.wf.liveLoadCountdown(track, secs, item.payload.background as string | null | undefined)
```

Replace the `welcome` branch:

```ts
  } else if (item.type === 'welcome') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return false
    await window.wf.liveLoadCountdown(track, secs, item.payload.background as string | null | undefined)
```

- [ ] **Step 7: `VolunteerView.tsx` — same fix, Main-only**

In `src/renderer/src/VolunteerView.tsx`, replace the `scripture` branch inside `loadItem`:

```ts
  } else if (item.type === 'scripture') {
    const ref = item.payload.reference as string
    if (!ref) return
    const ok = await window.wf.liveLoadScripture('main', ref, item.payload.background as string | null | undefined)
    if (!ok) return
```

Replace the `countdown` branch:

```ts
  } else if (item.type === 'countdown') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return
    await window.wf.liveLoadCountdown('main', secs, item.payload.background as string | null | undefined)
```

Replace the `welcome` branch:

```ts
  } else if (item.type === 'welcome') {
    await window.wf.liveLoadCountdown('main', (item.payload.seconds as number) ?? 300, item.payload.background as string | null | undefined)
```

- [ ] **Step 8: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean. **Note on `browserWfMock.ts`:** its existing `liveLoadScripture`/`liveLoadCountdown` mock implementations declare fewer parameters than the real API now has — this is fine and requires NO change: the mock object is force-cast (`as Window['wf']`) when installed, so TypeScript doesn't check its shape against the real interface, and at runtime a JS function simply ignores extra arguments a caller passes. Confirm typecheck is clean without touching `browserWfMock.ts` in this task.

- [ ] **Step 9: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/renderer/src/liveActions.ts src/renderer/src/VolunteerView.tsx
git commit -m "fix: Scripture/Countdown/Welcome items can carry a live background"
```

---

### Task 2: Zone screens show the countdown background too

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Extend `computeZoneStates()`'s `countdown` branch**

Find the `computeZoneStates()` function's mode-population `if/else if` chain. Replace the `countdown` branch:

```ts
    } else if (mode === 'countdown') {
      // Parse countdown from the live line ("M:SS" format).
      const parts = live.line.split(':')
      const mins = parseInt(parts[0] ?? '0', 10)
      const secs = parseInt(parts[1] ?? '0', 10)
      base.secondsLeft = (isNaN(mins) ? 0 : mins) * 60 + (isNaN(secs) ? 0 : secs)
      base.title = live.songTitle
      // Same background resolution the lyrics/text branch already does — a real
      // file background passes through as-is; a `theme:<id>` background can't be
      // loaded as a file by the zone page, so resolve it to colors for the
      // animated gradient instead.
      const isThemeBg = live.background?.startsWith('theme:') ?? false
      const themeId = isThemeBg ? live.background!.slice(6) : (live.slideTheme ?? null)
      base.background = isThemeBg ? null : live.background
      base.themeColors = resolveColors(getTheme(themeId), live.slideThemeColors)
```

Everything else in `computeZoneStates()` is unchanged — this only extends the one branch. Note `resolveColors`/`getTheme` are already imported and used earlier in the same function (in the `lyrics`/`text` branch), so no new imports are needed.

- [ ] **Step 2: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: Pi zone screens resolve a countdown's background, not just the main projector"
```

---

### Task 3: "Open folder" backend

**Files:**
- Modify: `src/main/backgroundLib.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/browserWfMock.ts`

- [ ] **Step 1: `backgroundLib.ts` — add `openBackgroundsFolder`**

In `src/main/backgroundLib.ts`, change the import line:

```ts
import { app, shell } from 'electron'
```

Add this new exported function, right after `uploadsDir()`'s definition (or anywhere below it, since it just calls `uploadsDir()`):

```ts
// Opens the uploads folder in the OS file manager so images can be dropped in
// directly instead of one at a time through the app's dialog. uploadsDir()
// already creates the directory if it doesn't exist yet, so this never fails
// on a fresh install with no uploads.
export async function openBackgroundsFolder(): Promise<void> {
  const dir = uploadsDir()
  const err = await shell.openPath(dir)
  if (err) throw new Error(err)
}
```

- [ ] **Step 2: `src/main/index.ts` — import it and add the IPC handler**

Change the existing import line:

```ts
import { listBackgrounds, copyBackground, deleteBackground, openBackgroundsFolder } from './backgroundLib'
```

Add a new IPC handler right after the existing `ipcMain.handle('wf:bg:list', ...)` handler:

```ts
ipcMain.handle('wf:bg:openFolder', () => openBackgroundsFolder())
```

- [ ] **Step 3: Preload — add `bgOpenFolder`**

In `src/preload/index.ts`, add this new method near the other `bg*` methods (next to `bgList`):

```ts
  bgOpenFolder: (): Promise<void> => ipcRenderer.invoke('wf:bg:openFolder'),
```

- [ ] **Step 4: `browserWfMock.ts` — add the mock**

In `src/renderer/src/browserWfMock.ts`, add this line right after the existing `bgOpenDialog: async (): Promise<{ canceled: boolean; filePaths: string[] }> => ({ canceled: true, filePaths: [] }),` line:

```ts
    bgOpenFolder: noop,
```

- [ ] **Step 5: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/main/backgroundLib.ts src/main/index.ts src/preload/index.ts src/renderer/src/browserWfMock.ts
git commit -m "feat: add an Open Folder action for the backgrounds library directory"
```

---

### Task 4: Extract the shared `BackgroundLibraryGrid` component

**Files:**
- Create: `src/renderer/src/BackgroundLibraryGrid.tsx`
- Modify: `src/renderer/src/editor/BackgroundPanel.tsx`

- [ ] **Step 1: Create the shared component**

Create `src/renderer/src/BackgroundLibraryGrid.tsx`:

```tsx
// src/renderer/src/BackgroundLibraryGrid.tsx
// Shared "My Backgrounds" library grid — search by mood, drag-drop/browse
// upload, an Open Folder shortcut, and a thumbnail grid with delete/tag/
// auto-tag. Used by both the Song editor's BackgroundPanel and the item
// editor's ItemBackgroundPanel so there's one library, one upload flow, one
// set of tags, everywhere a background gets picked.

import { useState, useEffect, useRef } from 'react'
import { Check, X, Pencil, Tag, Upload, FolderOpen } from 'lucide-react'

function toAssetUrl(p: string): string {
  return 'wf-asset://?path=' + encodeURIComponent(p)
}

interface BgEntry {
  filename: string
  path: string
  kind: 'upload' | 'generated'
  isVideo: boolean
}

interface BackgroundWithTags extends BgEntry {
  tags?: string[]
}

export default function BackgroundLibraryGrid({ activePath, onApply }: {
  activePath: string | null
  onApply: (path: string) => void
}): JSX.Element {
  const [uploads, setUploads] = useState<BackgroundWithTags[]>([])
  const [dragging, setDragging] = useState(false)
  const [searchTags, setSearchTags] = useState<string[]>([])
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [editingTags, setEditingTags] = useState<string>('')
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadUploads() }, [])

  async function loadUploads(): Promise<void> {
    try {
      const list = await window.wf.bgList()
      const withTags = await Promise.all(
        list.map(async (bg) => ({
          ...bg,
          tags: await window.wf.bgGetTags(bg.path)
        }))
      )
      setUploads(withTags)
    } catch {
      setUploads([])
    }
  }

  async function handleSaveTags(filePath: string, tags: string[]): Promise<void> {
    try {
      await window.wf.bgSetTags(filePath, tags)
      await loadUploads()
      setEditingPath(null)
      setEditingTags('')
    } catch (err) {
      console.error('Failed to save tags:', err)
    }
  }

  async function handleAutoTag(filePath: string): Promise<void> {
    try {
      const tags = await window.wf.bgAutoTag(filePath)
      await loadUploads()
      console.log(`[BackgroundLibraryGrid] Auto-tagged with: ${tags.join(', ')}`)
    } catch (err) {
      console.error('Failed to auto-tag:', err)
    }
  }

  const filteredUploads = searchTags.length === 0
    ? uploads
    : uploads.filter((bg) => bg.tags?.some((t) => searchTags.includes(t)))

  async function handleUploadFile(file: File): Promise<void> {
    const path = (file as File & { path?: string }).path
    if (!path) return
    try {
      const dest = await window.wf.bgUpload(path)
      onApply(dest)
      await loadUploads()
    } catch (e) {
      console.error('Upload failed', e)
    }
  }

  async function handleBrowse(): Promise<void> {
    const result = await window.wf.bgOpenDialog()
    if (!result.canceled && result.filePaths[0]) {
      const dest = await window.wf.bgUpload(result.filePaths[0])
      onApply(dest)
      await loadUploads()
    }
  }

  async function handleDelete(filePath: string): Promise<void> {
    await window.wf.bgDelete(filePath)
    await loadUploads()
    if (activePath === filePath) onApply('')
  }

  function onDragOver(e: React.DragEvent): void {
    e.preventDefault()
    setDragging(true)
  }
  function onDragLeave(): void { setDragging(false) }
  function onDrop(e: React.DragEvent): void {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUploadFile(file)
  }

  return (
    <div className="flex flex-col gap-3">

      {/* Search by tags */}
      <div className="rounded-lg border border-slate-200 bg-white p-2.5">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Filter by mood</p>
        <div className="flex flex-wrap gap-1.5">
          {['worship', 'prayer', 'energetic', 'peaceful', 'joyful', 'dark', 'bright', 'nature', 'modern', 'seasonal'].map((tag) => (
            <button
              key={tag}
              onClick={() =>
                setSearchTags((cur) =>
                  cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]
                )
              }
              className={[
                'rounded-full px-2 py-1 text-[10px] font-semibold transition-all',
                searchTags.includes(tag)
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {tag}
            </button>
          ))}
        </div>
        {searchTags.length > 0 && (
          <button
            onClick={() => setSearchTags([])}
            className="mt-2 text-[10px] text-slate-500 hover:text-slate-700"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Drag-drop zone + Open folder */}
      <div className="flex gap-2">
        <div
          ref={dropRef}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={handleBrowse}
          className={[
            'flex flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-7 text-center transition-all',
            dragging
              ? 'border-blue-400 bg-blue-500/10 text-blue-700'
              : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700',
          ].join(' ')}
        >
          <Upload size={20} />
          <span className="text-xs font-medium">Drop image or video here</span>
          <span className="text-[10px] text-slate-500">or click to browse</span>
        </div>
        <button
          onClick={() => window.wf.bgOpenFolder()}
          title="Open the backgrounds folder — drop in as many images as you want, then come back here"
          className="flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 px-4 text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700"
        >
          <FolderOpen size={20} />
          <span className="text-[10px] font-medium">Open folder</span>
        </button>
      </div>

      {/* Thumbnails grid */}
      {uploads.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-400">No uploads yet</p>
      ) : filteredUploads.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-400">No backgrounds match the selected mood</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filteredUploads.map((u) => {
            const active = activePath === u.path
            return (
              <div
                key={u.path}
                onClick={() => onApply(u.path)}
                className={[
                  'group relative cursor-pointer overflow-hidden rounded-lg transition-all duration-150',
                  active
                    ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-[#f4f6f9]'
                    : 'ring-1 ring-slate-200 hover:ring-slate-300 hover:scale-[1.02]',
                ].join(' ')}
                style={{ aspectRatio: '16/9' }}
              >
                {u.isVideo ? (
                  <video src={toAssetUrl(u.path)} className="h-full w-full object-cover" muted />
                ) : (
                  <div
                    className="h-full w-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${toAssetUrl(u.path)})` }}
                  />
                )}

                {active && (
                  <div className="absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white shadow">
                    <Check size={10} strokeWidth={3} />
                  </div>
                )}

                <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAutoTag(u.path) }}
                    className="h-5 w-5 flex items-center justify-center rounded-full bg-black/60 text-white shadow hover:bg-black/80"
                    title="Auto-tag by filename"
                  >
                    <Tag size={11} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingPath(u.path); setEditingTags((u.tags || []).join(', ')) }}
                    className="h-5 w-5 flex items-center justify-center rounded-full bg-black/60 text-white shadow hover:bg-black/80"
                    title="Edit tags"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(u.path) }}
                    className="h-5 w-5 flex items-center justify-center rounded-full bg-red-600/90 text-white shadow hover:bg-red-500"
                    title="Remove"
                  >
                    <X size={11} />
                  </button>
                </div>

                {u.tags && u.tags.length > 0 && (
                  <div className="absolute bottom-1 left-1 right-1 flex flex-wrap gap-1">
                    {u.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-slate-700/80 px-1.5 py-0.5 text-[8px] font-semibold text-slate-200"
                      >
                        {tag}
                      </span>
                    ))}
                    {u.tags.length > 2 && (
                      <span className="rounded-full bg-slate-700/80 px-1.5 py-0.5 text-[8px] font-semibold text-slate-200">
                        +{u.tags.length - 2}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Tag editing modal */}
      {editingPath && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-[#f4f6f9] p-4 shadow-2xl">
            <h3 className="mb-3 text-sm font-bold text-slate-900">Edit Tags</h3>
            <div className="mb-3 flex flex-wrap gap-2">
              {['worship', 'prayer', 'energetic', 'peaceful', 'joyful', 'dark', 'bright', 'nature', 'modern', 'seasonal', 'other'].map((tag) => (
                <button
                  key={tag}
                  onClick={() => {
                    const tags = editingTags.split(',').map((t) => t.trim()).filter(Boolean)
                    if (tags.includes(tag)) {
                      setEditingTags(tags.filter((t) => t !== tag).join(', '))
                    } else {
                      setEditingTags([...tags, tag].join(', '))
                    }
                  }}
                  className={[
                    'rounded-lg px-2 py-1 text-xs font-semibold transition-all',
                    editingTags.split(',').map((t) => t.trim()).includes(tag)
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                  ].join(' ')}
                >
                  {tag}
                </button>
              ))}
            </div>
            <textarea
              value={editingTags}
              onChange={(e) => setEditingTags(e.target.value)}
              placeholder="Tags separated by commas"
              className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 resize-none"
              rows={3}
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  const tags = editingTags.split(',').map((t) => t.trim()).filter(Boolean)
                  if (editingPath) handleSaveTags(editingPath, tags)
                }}
                className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditingPath(null)
                  setEditingTags('')
                }}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck the new file in isolation**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean. This is a new, currently-unused file (nothing imports it yet), so it should compile standalone with no effect elsewhere.

- [ ] **Step 3: Refactor `BackgroundPanel.tsx` to use it**

In `src/renderer/src/editor/BackgroundPanel.tsx`:

Change the import line (currently `import { Check, X, Pencil, Tag, Upload, Sparkles, Dices, MoveHorizontal, ZoomIn, Minus } from 'lucide-react'`) to drop the icons that only the extracted block used:

```ts
import { Check, X, Sparkles, Dices, MoveHorizontal, ZoomIn, Minus } from 'lucide-react'
```

Add a new import for the extracted component (path is one directory up, from `src/renderer/src/editor/` to `src/renderer/src/`):

```ts
import BackgroundLibraryGrid from '../BackgroundLibraryGrid'
```

Remove these now-unused pieces of local state (they moved into `BackgroundLibraryGrid`): `const [uploads, setUploads] = useState<BackgroundWithTags[]>([])`, `const [dragging, setDragging] = useState(false)`, `const [searchTags, setSearchTags] = useState<string[]>([])`, `const [editingPath, setEditingPath] = useState<string | null>(null)`, `const [editingTags, setEditingTags] = useState<string>('')`, `const dropRef = useRef<HTMLDivElement>(null)`.

Remove the `BgEntry` interface and the `BackgroundWithTags` interface entirely — both moved into `BackgroundLibraryGrid.tsx`, and in this file they were only ever used to type the now-removed `uploads` state, so nothing else in `BackgroundPanel.tsx` references them.

In the `useEffect` that currently reads:

```ts
  useEffect(() => {
    if (tab === 'uploads') loadUploads()
    if (tab === 'ai') {
      window.wf.settingGet('replicate_api_key').then((k) => { setApiKey(k); setApiKeyInput(k ?? '') })
      window.wf.settingGet('ai_provider').then((p) => setProvider(p === 'replicate' ? 'replicate' : 'pollinations'))
    }
  }, [tab])
```

remove the `if (tab === 'uploads') loadUploads()` line (the extracted component now owns its own load-on-mount), leaving:

```ts
  useEffect(() => {
    if (tab === 'ai') {
      window.wf.settingGet('replicate_api_key').then((k) => { setApiKey(k); setApiKeyInput(k ?? '') })
      window.wf.settingGet('ai_provider').then((p) => setProvider(p === 'replicate' ? 'replicate' : 'pollinations'))
    }
  }, [tab])
```

Remove these now-unused functions entirely (all moved into `BackgroundLibraryGrid`): `loadUploads`, `handleSaveTags`, `handleAutoTag`, the `filteredUploads` computed constant, `handleUploadFile`, `handleBrowse`, `handleDelete`, `onDragOver`, `onDragLeave`, `onDrop`.

Replace the entire `{tab === 'uploads' && ( ... )}` block (the whole "My Uploads" tab content — search-by-mood filter, drag-drop zone, thumbnails grid) with:

```tsx
        {/* ════════ MY UPLOADS ════════ */}
        {tab === 'uploads' && (
          <BackgroundLibraryGrid activePath={song.background ?? null} onApply={onApply} />
        )}
```

Remove the entire "Tag editing modal" block near the end of the component (the `{editingPath && ( ... )}` block, right before the component's closing `</div>` and `)` — it's now inside `BackgroundLibraryGrid`).

- [ ] **Step 4: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean — confirms no leftover references to the removed state/functions/interfaces.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/BackgroundLibraryGrid.tsx src/renderer/src/editor/BackgroundPanel.tsx
git commit -m "refactor: extract BackgroundLibraryGrid out of the Song editor's background panel"
```

---

### Task 5: `ItemBackgroundPanel.tsx` gets My Backgrounds / Presets tabs

**Files:**
- Modify: `src/renderer/src/ItemBackgroundPanel.tsx`

- [ ] **Step 1: Replace the full file**

Replace the full contents of `src/renderer/src/ItemBackgroundPanel.tsx`:

```tsx
// src/renderer/src/ItemBackgroundPanel.tsx
// Dark vertical panel for styling a single service item: pick a per-item theme,
// override colors, and (for types whose live rendering supports it) choose a
// background from your own library. Matches the song editor's BackgroundPanel look.

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { THEMES, getTheme, resolveColors } from '../../shared/themes'
import type { ServiceItem, ItemStyle, ThemeColors, ServiceItemType } from '../../shared/types'
import BackgroundLibraryGrid from './BackgroundLibraryGrid'

// Item types whose live rendering actually shows a custom file background —
// Song has its own separate background system, Image's payload.path already
// IS the background, and Sermon/Ticker/Announcement don't support one yet.
const FILE_BACKGROUND_TYPES: ServiceItemType[] = ['text', 'scripture', 'countdown', 'welcome']

export interface ItemBackgroundPanelProps {
  item: ServiceItem
  onChanged: () => void
}

export default function ItemBackgroundPanel({ item, onChanged }: ItemBackgroundPanelProps): JSX.Element {
  const [tab, setTab] = useState<'library' | 'presets'>('library')

  const apply = (style: ItemStyle): Promise<void> =>
    window.wf.serviceSetItemStyle(item.id, style).then(onChanged)
  const clearStyle = (): Promise<void> => window.wf.serviceSetItemStyle(item.id, null).then(onChanged)
  const savePayload = (next: Record<string, unknown>): Promise<void> =>
    window.wf.serviceSetItemPayload(item.id, next).then(onChanged)

  const motionThemes = THEMES.filter((t) => t.kind === 'motion')
  const overrideThemeId = item.style?.theme
  const serviceActive = !overrideThemeId

  const payload = (item.payload ?? {}) as Record<string, unknown>
  const fileBg = payload.background as string | undefined
  const supportsFileBackground = FILE_BACKGROUND_TYPES.includes(item.type)

  // Current resolved colors for the override theme (if any), used as <input> values.
  const colorValues = overrideThemeId
    ? resolveColors(getTheme(overrideThemeId), item.style?.colors)
    : null

  const colorRows: { key: keyof ThemeColors; label: string }[] = [
    { key: 'primary', label: 'Primary' },
    { key: 'secondary', label: 'Secondary' },
    { key: 'text', label: 'Text' }
  ]

  const presetsContent = (
    <>
      {/* ── Theme gallery ── */}
      <div className="flex flex-col gap-2">
        {!supportsFileBackground && (
          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Background &amp; Color
          </label>
        )}
        <div className="grid grid-cols-2 gap-2">
          {/* Use service theme (clear/none) */}
          <button
            onClick={() => clearStyle()}
            className={[
              'relative flex items-center justify-center overflow-hidden rounded-lg border transition-all duration-150',
              serviceActive
                ? 'border-blue-400 ring-2 ring-blue-400'
                : 'border-slate-200 hover:border-slate-300 hover:scale-[1.03]'
            ].join(' ')}
            style={{ aspectRatio: '16/9' }}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\'%3E%3Crect width=\'8\' height=\'8\' fill=\'%23222\'/%3E%3Crect x=\'8\' y=\'8\' width=\'8\' height=\'8\' fill=\'%23222\'/%3E%3Crect x=\'8\' width=\'8\' height=\'8\' fill=\'%23181818\'/%3E%3Crect y=\'8\' width=\'8\' height=\'8\' fill=\'%23181818\'/%3E%3C/svg%3E")'
              }}
            />
            <span className="relative z-10 px-1 text-center text-[10px] font-semibold text-slate-700">
              Use service theme
            </span>
            {serviceActive && (
              <div className="absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white shadow">
                <Check size={10} strokeWidth={3} />
              </div>
            )}
          </button>

          {/* Theme swatches */}
          {motionThemes.map((t) => {
            const active = overrideThemeId === t.id
            return (
              <button
                key={t.id}
                onClick={() => apply({ theme: t.id, colors: item.style?.colors })}
                className={[
                  'relative overflow-hidden rounded-lg border transition-all duration-150',
                  active
                    ? 'border-blue-400 ring-2 ring-blue-400'
                    : 'border-slate-200 hover:border-slate-300 hover:scale-[1.03]'
                ].join(' ')}
                style={{
                  aspectRatio: '16/9',
                  background: `linear-gradient(135deg, ${t.defaults.primary}, ${t.defaults.secondary})`
                }}
              >
                <span
                  className="absolute inset-x-0 bottom-0 flex items-end justify-center pb-1.5 text-[10px] font-semibold text-white"
                  style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7)' }}
                >
                  {t.name}
                </span>
                {active && (
                  <div className="absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white shadow">
                    <Check size={10} strokeWidth={3} />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Custom colors (only when an override theme is set) ── */}
      {overrideThemeId && colorValues && (
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Custom Colors
            </span>
            <button
              onClick={() => apply({ theme: overrideThemeId })}
              className="text-[10px] font-medium text-slate-600 hover:text-slate-900"
            >
              Reset colors
            </button>
          </div>
          {colorRows.map(({ key, label }) => (
            <label key={key} className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-600">{label}</span>
              <input
                type="color"
                value={colorValues[key] ?? '#000000'}
                onChange={(e) =>
                  apply({
                    theme: overrideThemeId,
                    colors: { ...(item.style?.colors ?? {}), [key]: e.target.value }
                  })
                }
                className="h-7 w-12 cursor-pointer rounded border border-slate-200 bg-transparent"
              />
            </label>
          ))}
        </div>
      )}
    </>
  )

  if (!supportsFileBackground) {
    return (
      <div className="flex flex-col gap-3 bg-[#f4f6f9] text-slate-900">
        {presetsContent}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 bg-[#f4f6f9] text-slate-900">
      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
        Background &amp; Color
      </label>

      {/* ── Tab strip ── */}
      <div className="flex rounded-lg bg-slate-100 p-0.5">
        {(['library', 'presets'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'flex-1 rounded-md py-1.5 text-[11px] font-semibold transition-all duration-150',
              tab === t
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-600 hover:text-slate-900',
            ].join(' ')}
          >
            {t === 'library' ? 'My Backgrounds' : 'Presets'}
          </button>
        ))}
      </div>

      {tab === 'library' && (
        <div className="flex flex-col gap-2">
          {fileBg && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-100 px-2.5 py-1.5">
              <span className="truncate text-xs text-slate-700" title={fileBg}>
                {fileBg.split(/[\\/]/).pop()}
              </span>
              <button
                onClick={() => savePayload({ ...payload, background: null })}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-600/90 text-white hover:bg-red-500"
                title="Remove background"
              >
                <X size={12} />
              </button>
            </div>
          )}
          <BackgroundLibraryGrid
            activePath={fileBg ?? null}
            onApply={(path) => savePayload({ ...payload, background: path || null })}
          />
        </div>
      )}

      {tab === 'presets' && presetsContent}
    </div>
  )
}
```

Note this removes the old single "Pick image/video…" `dialogOpenFile()` button entirely — the new library grid's own drag-drop/browse/Open-folder controls replace it, and going through `bgUpload` (rather than a bare file-dialog path) means the picked file joins the library for reuse on other items too, instead of being a one-off orphaned path.

- [ ] **Step 2: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean.

- [ ] **Step 3: Manual sanity check**

Run `npm run dev`. Open a Sermon or Song item's editor — confirm the panel looks exactly as before (no tabs, just the gradient gallery, since those types aren't in `FILE_BACKGROUND_TYPES`). Open a Scripture/Countdown/Welcome/Text item's editor — confirm the new tab strip appears, defaults to "My Backgrounds," and "Presets" still shows the same gradient gallery as before.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/ItemBackgroundPanel.tsx
git commit -m "feat: item editor's background picker gets My Backgrounds / Presets tabs"
```

---

### Task 6: Build Service preview shows the chosen background

**Files:**
- Modify: `src/renderer/src/ServiceSlidePreview.tsx`

- [ ] **Step 1: Extend the `bgFile` resolution**

In `src/renderer/src/ServiceSlidePreview.tsx`, replace:

```ts
  // Resolve a file/image background by item type (else fall back to gradient).
  let bgFile: string | null = null
  if (item.type === 'text') {
    const b = payload.background as string | undefined
    if (b) bgFile = b
  } else if (item.type === 'image') {
    const p = payload.path as string | undefined
    if (p) bgFile = p
  } else if (item.type === 'song') {
    const sb = songFull?.background
    if (sb && !sb.startsWith('theme:')) bgFile = sb
  }
```

with:

```ts
  // Resolve a file/image background by item type (else fall back to gradient).
  let bgFile: string | null = null
  if (item.type === 'text' || item.type === 'scripture' || item.type === 'countdown' || item.type === 'welcome') {
    const b = payload.background as string | undefined
    if (b) bgFile = b
  } else if (item.type === 'image') {
    const p = payload.path as string | undefined
    if (p) bgFile = p
  } else if (item.type === 'song') {
    const sb = songFull?.background
    if (sb && !sb.startsWith('theme:')) bgFile = sb
  }
```

- [ ] **Step 2: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/ServiceSlidePreview.tsx
git commit -m "feat: Build Service preview shows a custom background on Scripture/Countdown/Welcome"
```

---

### Task 7: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm typecheck and the full test suite are clean**

Run: `cd C:\Dev\worshipflow && npm run typecheck && npm test`
Expected: both clean/passing — no regression to any of the 126 existing tests from a purely-UI-and-rendering change.

- [ ] **Step 2: Confirm the folder round-trip**

Run `npm run dev`. Open a Scripture item's editor, click "Open folder" in the My Backgrounds tab. Confirm a File Explorer window opens on the backgrounds/uploads directory. Drop 2-3 image files into it directly (not through the app). Close the editor panel and reopen it (or switch tabs and back) — confirm the dropped images now appear in the grid.

- [ ] **Step 3: Confirm each of the four supported types**

For each of Text, Scripture, Countdown, Welcome: create or open an item of that type, pick a custom image from "My Backgrounds," confirm the Build Service preview immediately shows it. Go live with the item and confirm the main projector output shows the same image. If a Pi zone is available/assigned to that track, confirm it shows the image too (per Task 2's zone fix).

- [ ] **Step 4: Confirm a Countdown's background survives ticking**

Set a Countdown item's background to a custom image, go live, and watch it count down for several seconds — confirm the background stays in place the whole time (this is the exact bug Task 1 fixed: the timer used to silently reset the background to `null` on every tick).

- [ ] **Step 5: Confirm unaffected item types**

Open Song, Image, Sermon, Ticker, and Announcement item editors — confirm none of them show a "My Backgrounds"/"Presets" tab strip; Song's own editor (`SongEditor.tsx`) still shows its full three-tab `BackgroundPanel` (My Uploads/Presets/AI Generate) exactly as before, now backed by the shared grid but visually and behaviorally identical.

- [ ] **Step 6: Final commit**

If Steps 2-5 required any fixes, stage and commit them now with a message describing what was fixed. If no fixes were needed, run `git log --oneline -8` to confirm the full commit sequence for this feature is present, and report completion.
