# Background media bin with folders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real, flat, disk-backed folders for the Backgrounds library, reaching every place backgrounds are browsed or picked — the library screen, the song/item pickers, and the live drawer — while fixing the one real fragility folders introduce (moving a file must not silently lose its tags).

**Architecture:** A new pure module (`backgroundFolders.ts`) implements folder CRUD against any base directory, so it's unit-testable with a real temp directory — no Electron mocking needed. `backgroundLib.ts` wires that logic to the real `uploads`/`generated` directories. A new `db.ts` function keeps `background_tags` rows correct across moves/renames. Everything else is wiring: new IPC handlers, then a folder rail added to the two UI components that currently show backgrounds in a flat grid.

**Tech Stack:** Electron 33, TypeScript, Node `fs`, sql.js, React 18, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-03-background-folders-design.md`

---

## Before you start

Mandatory gate before every commit:

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

As of this plan, that gate passes with **335 tests, 0 lint errors**. Do not commit if any of the four fails.

Repo conventions already established this session, still in force:

1. **Never `git add -A` or `git add .`.** Stage only the exact files each task names.
2. **This sandbox cannot launch Electron.** Task 7 is marked **[manual]**.
3. **DB CRUD functions in this codebase are not unit tested** — `db.test.ts` only tests one pure, non-DB-touching helper (`normalizeTitleText`). The new `db.ts` functions in Task 3 follow that same established precedent: no new tests for them, matching every other DB function in this file.
4. **Push after each commit** — the user has asked for auto-push on this work; `git push` is part of every task's final step.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/main/backgroundFolders.ts` | Pure folder CRUD (list/create/rename/delete a folder, move a file into one), parameterized over base directories — the one part of this feature that's genuinely unit-testable. |
| `src/main/backgroundFolders.test.ts` | Tests for the above, against a real temp directory. |

**Modified:**

| File | Change |
|---|---|
| `src/main/backgroundLib.ts` | `BgEntry` gains `folder: string \| null`; `listBackgrounds()` walks one level into subdirectories; new wrapper functions call `backgroundFolders.ts` with the real uploads/generated directories. |
| `src/main/db.ts` | New `renameBackgroundTagPath()` (keeps tags correct across a move/rename) and `findBackgroundUsage()` (for the in-use warning). |
| `src/main/index.ts` | New IPC handlers: `wf:bg:listFolders`, `wf:bg:createFolder`, `wf:bg:renameFolder`, `wf:bg:deleteFolder`, `wf:bg:move`, `wf:bg:usage`. |
| `src/preload/index.ts` | Bindings for the six new channels. |
| `src/renderer/src/browserWfMock.ts` | Mocks for the six new bindings. |
| `src/renderer/src/BackgroundLibraryGrid.tsx` | Folder rail (All / Uncategorized / real folders / + New folder), folder-scoped grid, drag-to-move, "Move to folder…" action, in-use warning before move/delete. |
| `src/renderer/src/drawer/BackgroundsDrawerTab.tsx` | Same folder rail, compact layout, for the live drawer. |

**Not touched:** `BackgroundPanel.tsx` and `ItemBackgroundPanel.tsx` (they already just render `BackgroundLibraryGrid` — folders reach them for free), `BackgroundsTab.tsx` (same reason), anything about how a chosen background is *applied* to a song/item (unchanged — only how it's organized/found changes).

---

## Task 1: backgroundFolders.ts — pure folder CRUD

**Files:**
- Create: `src/main/backgroundFolders.ts`
- Test: `src/main/backgroundFolders.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/main/backgroundFolders.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  listFoldersIn, createFolderIn, renameFolderIn, moveFileToFolder, deleteFolderIn
} from './backgroundFolders'

describe('backgroundFolders', () => {
  let uploadsDir: string
  let generatedDir: string

  beforeEach(() => {
    const root = mkdtempSync(join(tmpdir(), 'wf-bg-folders-'))
    uploadsDir = join(root, 'uploads')
    generatedDir = join(root, 'generated')
    mkdirSync(uploadsDir, { recursive: true })
    mkdirSync(generatedDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(join(uploadsDir, '..'), { recursive: true, force: true })
  })

  it('lists no folders when none exist', () => {
    expect(listFoldersIn([uploadsDir, generatedDir])).toEqual([])
  })

  it('creates a folder and lists it', () => {
    createFolderIn(uploadsDir, [uploadsDir, generatedDir], 'Easter')
    expect(listFoldersIn([uploadsDir, generatedDir])).toEqual(['Easter'])
    expect(existsSync(join(uploadsDir, 'Easter'))).toBe(true)
  })

  it('rejects creating a folder with a name that already exists', () => {
    createFolderIn(uploadsDir, [uploadsDir, generatedDir], 'Easter')
    expect(() => createFolderIn(uploadsDir, [uploadsDir, generatedDir], 'Easter')).toThrow()
  })

  it('rejects a duplicate name even if the existing folder is in the other base dir', () => {
    createFolderIn(generatedDir, [uploadsDir, generatedDir], 'Christmas')
    expect(() => createFolderIn(uploadsDir, [uploadsDir, generatedDir], 'Christmas')).toThrow()
  })

  it('moves a file into a folder', () => {
    const filePath = join(uploadsDir, 'photo.jpg')
    writeFileSync(filePath, 'fake image data')
    const newPath = moveFileToFolder([uploadsDir, generatedDir], filePath, 'Easter')
    expect(newPath).toBe(join(uploadsDir, 'Easter', 'photo.jpg'))
    expect(existsSync(newPath)).toBe(true)
    expect(existsSync(filePath)).toBe(false)
  })

  it('moves a file back to Uncategorized when folderName is null', () => {
    const filePath = join(uploadsDir, 'Easter', 'photo.jpg')
    mkdirSync(join(uploadsDir, 'Easter'), { recursive: true })
    writeFileSync(filePath, 'fake image data')
    const newPath = moveFileToFolder([uploadsDir, generatedDir], filePath, null)
    expect(newPath).toBe(join(uploadsDir, 'photo.jpg'))
    expect(existsSync(newPath)).toBe(true)
  })

  it('rejects moving a file outside the allowed roots', () => {
    const outside = join(tmpdir(), 'not-a-backgrounds-dir.jpg')
    writeFileSync(outside, 'x')
    expect(() => moveFileToFolder([uploadsDir, generatedDir], outside, 'Easter')).toThrow()
    rmSync(outside, { force: true })
  })

  it('renames a folder and reports every file that moved', () => {
    mkdirSync(join(uploadsDir, 'Easter'), { recursive: true })
    writeFileSync(join(uploadsDir, 'Easter', 'a.jpg'), 'x')
    writeFileSync(join(uploadsDir, 'Easter', 'b.jpg'), 'x')
    const moves = renameFolderIn([uploadsDir, generatedDir], 'Easter', 'Spring')
    expect(moves.sort((a, b) => a.oldPath.localeCompare(b.oldPath))).toEqual([
      { oldPath: join(uploadsDir, 'Easter', 'a.jpg'), newPath: join(uploadsDir, 'Spring', 'a.jpg') },
      { oldPath: join(uploadsDir, 'Easter', 'b.jpg'), newPath: join(uploadsDir, 'Spring', 'b.jpg') }
    ])
    expect(existsSync(join(uploadsDir, 'Spring', 'a.jpg'))).toBe(true)
    expect(existsSync(join(uploadsDir, 'Easter'))).toBe(false)
  })

  it('rejects renaming a folder to a name that already exists', () => {
    mkdirSync(join(uploadsDir, 'Easter'), { recursive: true })
    mkdirSync(join(uploadsDir, 'Christmas'), { recursive: true })
    expect(() => renameFolderIn([uploadsDir, generatedDir], 'Easter', 'Christmas')).toThrow()
  })

  it('deletes a folder, moving its contents up to Uncategorized', () => {
    mkdirSync(join(uploadsDir, 'Easter'), { recursive: true })
    writeFileSync(join(uploadsDir, 'Easter', 'a.jpg'), 'x')
    const moves = deleteFolderIn([uploadsDir, generatedDir], 'Easter')
    expect(moves).toEqual([
      { oldPath: join(uploadsDir, 'Easter', 'a.jpg'), newPath: join(uploadsDir, 'a.jpg') }
    ])
    expect(existsSync(join(uploadsDir, 'a.jpg'))).toBe(true)
    expect(existsSync(join(uploadsDir, 'Easter'))).toBe(false)
  })

  it('deleting an empty folder just removes it, with no moves', () => {
    mkdirSync(join(uploadsDir, 'Empty'), { recursive: true })
    const moves = deleteFolderIn([uploadsDir, generatedDir], 'Empty')
    expect(moves).toEqual([])
    expect(existsSync(join(uploadsDir, 'Empty'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npx vitest run src/main/backgroundFolders.test.ts
```

Expected: fails to collect — `Failed to resolve import "./backgroundFolders"`.

- [ ] **Step 3: Write the module**

Create `src/main/backgroundFolders.ts`:

```ts
// Pure folder CRUD for the background media bin. Every function takes its
// base directory (or directories) as a parameter rather than reaching for
// Electron's app.getPath — that's what makes this testable with a real temp
// directory. backgroundLib.ts wires this to the real uploads/generated
// directories. See the 2026-08-03 design spec.
import { join, basename } from 'path'
import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync } from 'fs'

export function listFoldersIn(baseDirs: string[]): string[] {
  const names = new Set<string>()
  for (const dir of baseDirs) {
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) names.add(entry.name)
    }
  }
  return Array.from(names).sort()
}

export function createFolderIn(baseDir: string, allBaseDirs: string[], name: string): void {
  if (listFoldersIn(allBaseDirs).includes(name)) {
    throw new Error(`A folder named "${name}" already exists.`)
  }
  mkdirSync(join(baseDir, name), { recursive: true })
}

export interface FileMove {
  oldPath: string
  newPath: string
}

// Renames a folder in every base dir it exists in (a folder is a logical
// name shared across the uploads/generated trees, not tied to one of them).
// Returns every file that moved, so the caller can keep background_tags
// rows (keyed by absolute path) correct.
export function renameFolderIn(baseDirs: string[], oldName: string, newName: string): FileMove[] {
  if (listFoldersIn(baseDirs).includes(newName)) {
    throw new Error(`A folder named "${newName}" already exists.`)
  }
  const moves: FileMove[] = []
  for (const dir of baseDirs) {
    const oldDir = join(dir, oldName)
    if (!existsSync(oldDir)) continue
    const newDir = join(dir, newName)
    for (const f of readdirSync(oldDir)) {
      moves.push({ oldPath: join(oldDir, f), newPath: join(newDir, f) })
    }
    renameSync(oldDir, newDir)
  }
  return moves
}

// Moves a single file into a folder (or back to the root, if folderName is
// null) within whichever allowed root it's actually inside.
export function moveFileToFolder(allowedRoots: string[], filePath: string, folderName: string | null): string {
  const root = allowedRoots.find((d) => filePath.startsWith(d))
  if (!root) throw new Error('That file is outside the backgrounds library.')
  const filename = basename(filePath)
  const destDir = folderName ? join(root, folderName) : root
  if (folderName) mkdirSync(destDir, { recursive: true })
  const destPath = join(destDir, filename)
  if (destPath === filePath) return filePath
  renameSync(filePath, destPath)
  return destPath
}

// Deletes a folder, moving its contents back up to the root (Uncategorized)
// first — the files themselves are never deleted. Returns every file that
// moved, same reason as renameFolderIn.
export function deleteFolderIn(baseDirs: string[], name: string): FileMove[] {
  const moves: FileMove[] = []
  for (const dir of baseDirs) {
    const folderDir = join(dir, name)
    if (!existsSync(folderDir)) continue
    for (const f of readdirSync(folderDir)) {
      const oldPath = join(folderDir, f)
      const newPath = join(dir, f)
      renameSync(oldPath, newPath)
      moves.push({ oldPath, newPath })
    }
    rmdirSync(folderDir)
  }
  return moves
}
```

- [ ] **Step 4: Run it and confirm it passes**

```bash
npx vitest run src/main/backgroundFolders.test.ts
```

Expected: `Tests 11 passed (11)`.

- [ ] **Step 5: Run the full gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: 346 tests passing (335 + 11 new), 0 lint errors.

- [ ] **Step 6: Commit and push**

```bash
git add src/main/backgroundFolders.ts src/main/backgroundFolders.test.ts
git commit -m "feat: pure folder CRUD for the background media bin"
git push
```

---

## Task 2: Wire folders into backgroundLib.ts

**Files:**
- Modify: `src/main/backgroundLib.ts`

- [ ] **Step 1: Update imports and BgEntry**

Find:

```ts
// src/main/backgroundLib.ts
// Manages the local background library: uploads + generated images.
import { app, shell } from 'electron'
import { join, extname } from 'path'
import { mkdirSync, copyFileSync, readdirSync, unlinkSync, existsSync, createWriteStream } from 'fs'
import { createHash } from 'crypto'
import https from 'https'
```

Replace with:

```ts
// src/main/backgroundLib.ts
// Manages the local background library: uploads + generated images.
import { app, shell } from 'electron'
import { join, extname } from 'path'
import { mkdirSync, copyFileSync, readdirSync, unlinkSync, existsSync, createWriteStream } from 'fs'
import { createHash } from 'crypto'
import https from 'https'
import {
  listFoldersIn, createFolderIn, renameFolderIn, moveFileToFolder, deleteFolderIn
} from './backgroundFolders'
import type { FileMove } from './backgroundFolders'
```

- [ ] **Step 2: Make BgEntry folder-aware and listBackgrounds recursive**

Find:

```ts
export type BgEntry = {
  filename: string
  path: string
  kind: 'upload' | 'generated'
  isVideo: boolean
}

export function listBackgrounds(): BgEntry[] {
  const results: BgEntry[] = []
  const IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif)$/i
  const VIDEO_EXT = /\.(mp4|webm|mov|avi)$/i

  for (const dir of [uploadsDir(), generatedDir()]) {
    const kind = dir.includes('generated') ? 'generated' : 'upload'
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir)) {
      if (!IMAGE_EXT.test(f) && !VIDEO_EXT.test(f)) continue
      results.push({ filename: f, path: join(dir, f), kind, isVideo: VIDEO_EXT.test(f) })
    }
  }
  return results
}
```

Replace with:

```ts
export type BgEntry = {
  filename: string
  path: string
  kind: 'upload' | 'generated'
  isVideo: boolean
  folder: string | null
}

const IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif)$/i
const VIDEO_EXT = /\.(mp4|webm|mov|avi)$/i

export function listBackgrounds(): BgEntry[] {
  const results: BgEntry[] = []

  for (const dir of [uploadsDir(), generatedDir()]) {
    const kind = dir.includes('generated') ? 'generated' : 'upload'
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        // One level deep only — flat folders, no nested subfolders.
        const subDir = join(dir, entry.name)
        for (const f of readdirSync(subDir)) {
          if (!IMAGE_EXT.test(f) && !VIDEO_EXT.test(f)) continue
          results.push({ filename: f, path: join(subDir, f), kind, isVideo: VIDEO_EXT.test(f), folder: entry.name })
        }
        continue
      }
      const f = entry.name
      if (!IMAGE_EXT.test(f) && !VIDEO_EXT.test(f)) continue
      results.push({ filename: f, path: join(dir, f), kind, isVideo: VIDEO_EXT.test(f), folder: null })
    }
  }
  return results
}

export function listBackgroundFolders(): string[] {
  return listFoldersIn([uploadsDir(), generatedDir()])
}

export function createBackgroundFolder(name: string): void {
  createFolderIn(uploadsDir(), [uploadsDir(), generatedDir()], name)
}

export function renameBackgroundFolder(oldName: string, newName: string): FileMove[] {
  return renameFolderIn([uploadsDir(), generatedDir()], oldName, newName)
}

export function moveBackground(filePath: string, folderName: string | null): string {
  return moveFileToFolder([uploadsDir(), generatedDir()], filePath, folderName)
}

export function deleteBackgroundFolder(name: string): FileMove[] {
  return deleteFolderIn([uploadsDir(), generatedDir()], name)
}
```

- [ ] **Step 3: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 346 tests (no new tests this task — this is thin Electron-path wiring around Task 1's already-tested logic, matching the existing untested posture of `uploadsDir()`/`generatedDir()`), 0 lint errors. Typecheck is the meaningful check — `BgEntry` gaining a required `folder` field will immediately flag any other file constructing a `BgEntry` literal that's now missing it (there shouldn't be any outside this file, but this is exactly what would catch it).

- [ ] **Step 4: Commit and push**

```bash
git add src/main/backgroundLib.ts
git commit -m "feat: make the background library folder-aware"
git push
```

---

## Task 3: db.ts — keep tags correct across moves, and find in-use backgrounds

**Files:**
- Modify: `src/main/db.ts`

- [ ] **Step 1: Add renameBackgroundTagPath**

Find:

```ts
export function setBackgroundTags(filePath: string, tags: string[]): void {
  try {
    const now = Date.now()
    db.run(
      `INSERT OR REPLACE INTO background_tags (file_path, tags_json, created_at)
       VALUES (?, ?, ?)`,
      [filePath, JSON.stringify(tags), now]
    )
    persist()
    console.log(`[db] Set tags for background: ${tags.join(', ')}`)
  } catch (err) {
    console.error('[db] Failed to set background tags:', err)
    throw err
  }
}
```

Add immediately after it:

```ts
// Keeps a background's tags attached to it when it moves — background_tags
// is keyed by absolute file path, so a move/rename that doesn't update this
// row silently orphans the tags. Only called when the app itself moves a
// file (folder rename, move to folder); a manual move outside the app is
// still not tracked, same limitation this table already had.
export function renameBackgroundTagPath(oldPath: string, newPath: string): void {
  try {
    db.run('UPDATE background_tags SET file_path = ? WHERE file_path = ?', [newPath, oldPath])
    persist()
  } catch (err) {
    console.error('[db] Failed to rename background tag path:', err)
  }
}
```

- [ ] **Step 2: Add findBackgroundUsage**

Find:

```ts
export function searchBackgroundsByTags(searchTags: string[]): string[] {
```

Add immediately before it:

```ts
export interface BackgroundUsage {
  songs: string[]
  announcements: string[]
  items: string[]
}

// Best-effort check for whether a background is currently referenced
// anywhere, so moving/deleting it can warn instead of silently breaking a
// song, announcement, or item. This is advisory, not a guarantee — per the
// design, moving/deleting proceeds either way, so a missed edge case here
// isn't a correctness bug, just a warning that didn't fire.
export function findBackgroundUsage(filePath: string): BackgroundUsage {
  const songs: string[] = []
  const announcements: string[] = []
  const items: string[] = []
  try {
    const songStmt = db.prepare('SELECT title FROM song WHERE background = ?')
    songStmt.bind([filePath])
    while (songStmt.step()) songs.push((songStmt.getAsObject() as any).title)
    songStmt.free()

    const annStmt = db.prepare('SELECT title FROM announcement WHERE background = ?')
    annStmt.bind([filePath])
    while (annStmt.step()) announcements.push((annStmt.getAsObject() as any).title)
    annStmt.free()

    // Non-song item types store their background inside payload_json. A
    // LIKE match narrows candidates cheaply; the JSON.parse + exact-field
    // check after that confirms it's a real match, not just a coincidental
    // substring.
    const itemStmt = db.prepare('SELECT type, payload_json FROM service_item WHERE payload_json LIKE ?')
    itemStmt.bind([`%${filePath}%`])
    while (itemStmt.step()) {
      const r = itemStmt.getAsObject() as any
      try {
        const payload = JSON.parse(r.payload_json)
        if (payload?.background === filePath) items.push(r.type as string)
      } catch {
        /* skip malformed payload */
      }
    }
    itemStmt.free()
  } catch (err) {
    console.error('[db] Failed to check background usage:', err)
  }
  return { songs, announcements, items }
}

export function searchBackgroundsByTags(searchTags: string[]): string[] {
```

- [ ] **Step 3: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 346 tests. No new tests — matches this file's established precedent that DB CRUD functions aren't unit tested (only `normalizeTitleText`, a pure non-DB helper, has tests in `db.test.ts`).

- [ ] **Step 4: Commit and push**

```bash
git add src/main/db.ts
git commit -m "feat: keep background tags correct across moves, detect in-use backgrounds"
git push
```

---

## Task 4: IPC handlers, preload bindings, browser mock

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/browserWfMock.ts`

- [ ] **Step 1: Add the IPC handlers**

In `src/main/index.ts`, find:

```ts
// Background library
ipcMain.handle('wf:bg:list', () => listBackgrounds())
```

Replace with:

```ts
// Background library
ipcMain.handle('wf:bg:list', () => listBackgrounds())

ipcMain.handle('wf:bg:listFolders', () => listBackgroundFolders())

ipcMain.handle('wf:bg:createFolder', (_e: unknown, name: string) => {
  createBackgroundFolder(name)
})

ipcMain.handle('wf:bg:renameFolder', (_e: unknown, oldName: string, newName: string) => {
  const moves = renameBackgroundFolder(oldName, newName)
  for (const m of moves) renameBackgroundTagPath(m.oldPath, m.newPath)
})

ipcMain.handle('wf:bg:deleteFolder', (_e: unknown, name: string) => {
  const moves = deleteBackgroundFolder(name)
  for (const m of moves) renameBackgroundTagPath(m.oldPath, m.newPath)
})

ipcMain.handle('wf:bg:move', (_e: unknown, filePath: string, folderName: string | null) => {
  const newPath = moveBackground(filePath, folderName)
  if (newPath !== filePath) renameBackgroundTagPath(filePath, newPath)
  return newPath
})

ipcMain.handle('wf:bg:usage', (_e: unknown, filePath: string) => {
  return findBackgroundUsage(filePath)
})
```

Find the existing background-library import line (near the top of the file, wherever `listBackgrounds`/`copyBackground`/`deleteBackground` are imported from `./backgroundLib`) and add the new functions to it:

```ts
import {
  listBackgrounds, copyBackground, deleteBackground, openBackgroundsFolder, downloadToGenerated,
  listBackgroundFolders, createBackgroundFolder, renameBackgroundFolder, moveBackground, deleteBackgroundFolder
} from './backgroundLib'
```

(Adjust to match whatever the existing import line's exact function list is — add the five new names to it rather than replacing the whole line blindly; the exact original list of names must be preserved.)

Similarly, find the existing `./db` import line and add `renameBackgroundTagPath` and `findBackgroundUsage` to it.

- [ ] **Step 2: Add the preload bindings**

In `src/preload/index.ts`, find:

```ts
  bgList: (): Promise<{ filename: string; path: string; kind: 'upload' | 'generated'; isVideo: boolean }[]> =>
```

This line's return type needs the new `folder` field — replace the whole `bgList` line (check the exact closing of this line, likely ending in `ipcRenderer.invoke('wf:bg:list')` on the next line) so the type reads:

```ts
  bgList: (): Promise<{ filename: string; path: string; kind: 'upload' | 'generated'; isVideo: boolean; folder: string | null }[]> =>
    ipcRenderer.invoke('wf:bg:list'),
```

Then find:

```ts
  bgOpenFolder: (): Promise<void> => ipcRenderer.invoke('wf:bg:openFolder'),
```

Add immediately after it:

```ts
  bgListFolders: (): Promise<string[]> => ipcRenderer.invoke('wf:bg:listFolders'),
  bgCreateFolder: (name: string): Promise<void> => ipcRenderer.invoke('wf:bg:createFolder', name),
  bgRenameFolder: (oldName: string, newName: string): Promise<void> =>
    ipcRenderer.invoke('wf:bg:renameFolder', oldName, newName),
  bgDeleteFolder: (name: string): Promise<void> => ipcRenderer.invoke('wf:bg:deleteFolder', name),
  bgMove: (filePath: string, folderName: string | null): Promise<string> =>
    ipcRenderer.invoke('wf:bg:move', filePath, folderName),
  bgUsage: (filePath: string): Promise<{ songs: string[]; announcements: string[]; items: string[] }> =>
    ipcRenderer.invoke('wf:bg:usage', filePath),
```

- [ ] **Step 3: Add the browser-preview mocks**

In `src/renderer/src/browserWfMock.ts`, find the mock's `bgList` entry and widen its return type the same way (add `folder: null` to whatever mock data it returns, and `folder: string | null` to its declared type if one is written out). Immediately after the mock's `bgOpenFolder` entry, add:

```ts
    bgListFolders: async (): Promise<string[]> => [],
    bgCreateFolder: async (_name: string): Promise<void> => {},
    bgRenameFolder: async (_oldName: string, _newName: string): Promise<void> => {},
    bgDeleteFolder: async (_name: string): Promise<void> => {},
    bgMove: async (filePath: string, _folderName: string | null): Promise<string> => filePath,
    bgUsage: async (_filePath: string): Promise<{ songs: string[]; announcements: string[]; items: string[] }> =>
      ({ songs: [], announcements: [], items: [] }),
```

- [ ] **Step 4: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 346 tests, 0 lint errors. Typecheck will catch any mismatch between the real bindings and the mock, and any place still constructing a `BgEntry`-shaped object without the new `folder` field.

- [ ] **Step 5: Commit and push**

```bash
git add src/main/index.ts src/preload/index.ts src/renderer/src/browserWfMock.ts
git commit -m "feat: expose folder CRUD and in-use checks on window.wf"
git push
```

---

## Task 5: BackgroundLibraryGrid — the folder rail

**Files:**
- Modify: `src/renderer/src/BackgroundLibraryGrid.tsx`

- [ ] **Step 1: Update the local BgEntry type and add folder state**

Find:

```tsx
interface BgEntry {
  filename: string
  path: string
  kind: 'upload' | 'generated'
  isVideo: boolean
}
```

Replace with:

```tsx
interface BgEntry {
  filename: string
  path: string
  kind: 'upload' | 'generated'
  isVideo: boolean
  folder: string | null
}
```

Find:

```tsx
  const [uploads, setUploads] = useState<BackgroundWithTags[]>([])
  const [dragging, setDragging] = useState(false)
  const [searchTags, setSearchTags] = useState<string[]>([])
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [editingTags, setEditingTags] = useState<string>('')
  const dropRef = useRef<HTMLButtonElement>(null)
```

Replace with:

```tsx
  const [uploads, setUploads] = useState<BackgroundWithTags[]>([])
  const [dragging, setDragging] = useState(false)
  const [searchTags, setSearchTags] = useState<string[]>([])
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [editingTags, setEditingTags] = useState<string>('')
  const dropRef = useRef<HTMLButtonElement>(null)
  const [folders, setFolders] = useState<string[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null | 'ALL'>('ALL')
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [draggedPath, setDraggedPath] = useState<string | null>(null)
```

`selectedFolder` is `'ALL'` (the default, everything), `null` (Uncategorized — no folder), or a real folder name — three distinct states, not two, so it can't just be `string | null`.

- [ ] **Step 2: Load folders alongside backgrounds**

Find:

```tsx
  useEffect(() => {
    void loadUploads()
    // "Open folder" sends the operator to the file manager to bulk-copy images
    // in — its own tooltip says "drop in as many as you want, then come back
    // here" — but nothing re-scanned the folder on return, so a batch of newly
    // added backgrounds stayed invisible until this component happened to
    // remount. Re-reading on window focus makes coming back actually work.
    const onFocus = (): void => { void loadUploads() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])
```

Replace with:

```tsx
  useEffect(() => {
    void loadUploads()
    void loadFolders()
    // "Open folder" sends the operator to the file manager to bulk-copy images
    // in — its own tooltip says "drop in as many as you want, then come back
    // here" — but nothing re-scanned the folder on return, so a batch of newly
    // added backgrounds stayed invisible until this component happened to
    // remount. Re-reading on window focus makes coming back actually work.
    const onFocus = (): void => { void loadUploads(); void loadFolders() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  async function loadFolders(): Promise<void> {
    try {
      setFolders(await window.wf.bgListFolders())
    } catch {
      setFolders([])
    }
  }
```

- [ ] **Step 3: Scope the filtered list by folder, and add folder-scoped filtering**

Find:

```tsx
  const filteredUploads = searchTags.length === 0
    ? uploads
    : uploads.filter((bg) => bg.tags?.some((t) => searchTags.includes(t)))
```

Replace with:

```tsx
  const folderScoped = selectedFolder === 'ALL'
    ? uploads
    : uploads.filter((bg) => bg.folder === selectedFolder)

  const filteredUploads = searchTags.length === 0
    ? folderScoped
    : folderScoped.filter((bg) => bg.tags?.some((t) => searchTags.includes(t)))
```

- [ ] **Step 4: Add folder CRUD handlers, the in-use warning, and drag-to-move**

Find:

```tsx
  async function handleDelete(filePath: string): Promise<void> {
    await window.wf.bgDelete(filePath)
    await loadUploads()
    if (activePath === filePath) onApply('')
  }
```

Replace with:

```tsx
  async function warnIfInUse(filePath: string, action: 'move' | 'delete'): Promise<boolean> {
    const usage = await window.wf.bgUsage(filePath)
    const names = [...usage.songs, ...usage.announcements, ...usage.items.map((t) => `a ${t} item`)]
    if (names.length === 0) return true
    return confirm(
      `This background is currently used by: ${names.join(', ')}. ${action === 'delete' ? 'Delete' : 'Move'} it anyway?`
    )
  }

  async function handleDelete(filePath: string): Promise<void> {
    if (!(await warnIfInUse(filePath, 'delete'))) return
    await window.wf.bgDelete(filePath)
    await loadUploads()
    if (activePath === filePath) onApply('')
  }

  async function handleMoveToFolder(filePath: string, folderName: string | null): Promise<void> {
    if (!(await warnIfInUse(filePath, 'move'))) return
    const newPath = await window.wf.bgMove(filePath, folderName)
    if (activePath === filePath) onApply(newPath)
    await loadUploads()
  }

  async function handleCreateFolder(): Promise<void> {
    const name = newFolderName.trim()
    if (!name) return
    try {
      await window.wf.bgCreateFolder(name)
      setNewFolderName('')
      setCreatingFolder(false)
      await loadFolders()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not create that folder.')
    }
  }

  async function handleDeleteFolder(name: string): Promise<void> {
    if (!confirm(`Delete the "${name}" folder? Its backgrounds move to Uncategorized — nothing is deleted.`)) return
    await window.wf.bgDeleteFolder(name)
    if (selectedFolder === name) setSelectedFolder('ALL')
    await loadFolders()
    await loadUploads()
  }

  function onFolderDrop(folderName: string | null): (e: React.DragEvent) => void {
    return (e: React.DragEvent) => {
      e.preventDefault()
      if (draggedPath) void handleMoveToFolder(draggedPath, folderName)
      setDraggedPath(null)
    }
  }
```

- [ ] **Step 5: Render the folder rail**

Find:

```tsx
      {/* Drag-drop zone + Open folder */}
      <div className="flex gap-2">
```

Add immediately before it:

```tsx
      {/* Folder rail */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setSelectedFolder('ALL')}
          className={[
            'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all',
            selectedFolder === 'ALL' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
          ].join(' ')}
        >
          All
        </button>
        <button
          onClick={() => setSelectedFolder(null)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onFolderDrop(null)}
          className={[
            'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all',
            selectedFolder === null ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
          ].join(' ')}
        >
          Uncategorized
        </button>
        {folders.map((f) => (
          <div key={f} className="group relative">
            <button
              onClick={() => setSelectedFolder(f)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onFolderDrop(f)}
              className={[
                'rounded-full px-2.5 py-1 pr-5 text-[11px] font-semibold transition-all',
                selectedFolder === f ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {f}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f) }}
              title={`Delete "${f}" folder`}
              className="absolute right-1 top-1/2 hidden -translate-y-1/2 text-[10px] opacity-70 hover:opacity-100 group-hover:block"
            >
              <X size={10} />
            </button>
          </div>
        ))}
        {creatingFolder ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateFolder(); if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName('') } }}
              placeholder="Folder name"
              className="w-28 rounded-full border border-slate-300 px-2.5 py-1 text-[11px] outline-none focus:border-blue-500"
            />
            <button onClick={handleCreateFolder} className="text-[11px] font-semibold text-blue-700">Add</button>
          </div>
        ) : (
          <button
            onClick={() => setCreatingFolder(true)}
            className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-700"
          >
            + New folder
          </button>
        )}
      </div>

```

- [ ] **Step 6: Wire drag-start and the "Move to folder" action onto each tile**

Find:

```tsx
              <div
                key={u.path}
                role="button"
                tabIndex={0}
                onClick={() => onApply(u.path)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onApply(u.path) } }}
                aria-label={`Use background: ${u.path.split(/[/\\]/).pop()}`}
                aria-pressed={active}
                className={[
                  'group relative cursor-pointer overflow-hidden rounded-lg transition-all duration-150',
                  active
                    ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-[#f4f6f9]'
                    : 'ring-1 ring-slate-200 hover:ring-slate-300 hover:scale-[1.02]',
                ].join(' ')}
                style={{ aspectRatio: '16/9' }}
              >
```

Replace with:

```tsx
              <div
                key={u.path}
                role="button"
                tabIndex={0}
                draggable
                onDragStart={() => setDraggedPath(u.path)}
                onDragEnd={() => setDraggedPath(null)}
                onClick={() => onApply(u.path)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onApply(u.path) } }}
                aria-label={`Use background: ${u.path.split(/[/\\]/).pop()}`}
                aria-pressed={active}
                className={[
                  'group relative cursor-pointer overflow-hidden rounded-lg transition-all duration-150',
                  active
                    ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-[#f4f6f9]'
                    : 'ring-1 ring-slate-200 hover:ring-slate-300 hover:scale-[1.02]',
                ].join(' ')}
                style={{ aspectRatio: '16/9' }}
              >
```

Find the per-tile hover-action buttons:

```tsx
                <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAutoTag(u.path) }}
                    className="h-5 w-5 flex items-center justify-center rounded-full bg-black/60 text-white shadow hover:bg-black/80"
                    title="Auto-tag by filename"
                  >
                    <Tag size={11} />
                  </button>
```

Add a "move to folder" select immediately before that `<div>`, so the block reads:

```tsx
                {folders.length > 0 && (
                  <select
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => { const v = e.target.value; handleMoveToFolder(u.path, v === '' ? null : v); e.target.value = '' }}
                    value=""
                    title="Move to folder"
                    className="absolute left-1 top-1 hidden w-6 rounded bg-black/60 text-[9px] text-transparent group-hover:block"
                  >
                    <option value="" disabled>Move to…</option>
                    <option value="">Uncategorized</option>
                    {folders.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                )}
                <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAutoTag(u.path) }}
                    className="h-5 w-5 flex items-center justify-center rounded-full bg-black/60 text-white shadow hover:bg-black/80"
                    title="Auto-tag by filename"
                  >
                    <Tag size={11} />
                  </button>
```

- [ ] **Step 7: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 346 tests (no new tests — UI, matches this file's existing untested baseline), 0 lint errors. `eslint-plugin-jsx-a11y` is enabled — if the "Move to folder" `<select>` is flagged for lacking a visible label, fix the markup rather than suppressing the rule (an `aria-label="Move to folder"` alongside its `title` is the likely fix — the plan intentionally kept the option text off-screen since it's a hover-only quick action, but it still needs an accessible name).

- [ ] **Step 8: Commit and push**

```bash
git add src/renderer/src/BackgroundLibraryGrid.tsx
git commit -m "feat: folder rail for the background library grid"
git push
```

---

## Task 6: BackgroundsDrawerTab — the same folder rail, compact

**Files:**
- Modify: `src/renderer/src/drawer/BackgroundsDrawerTab.tsx`

- [ ] **Step 1: Update the local BgEntry type and add folder state**

Find:

```tsx
interface BgEntry {
  filename: string
  path: string
  kind: 'upload' | 'generated'
  isVideo: boolean
}
```

Replace with:

```tsx
interface BgEntry {
  filename: string
  path: string
  kind: 'upload' | 'generated'
  isVideo: boolean
  folder: string | null
}
```

Find:

```tsx
  const { activeService, reloadActiveService, selectedItemId } = useService()
  const [backgrounds, setBackgrounds] = useState<BgEntry[]>([])
  const [live, setLive] = useState<LiveState | null>(null)
  const [busy, setBusy] = useState(false)
```

Replace with:

```tsx
  const { activeService, reloadActiveService, selectedItemId } = useService()
  const [backgrounds, setBackgrounds] = useState<BgEntry[]>([])
  const [live, setLive] = useState<LiveState | null>(null)
  const [busy, setBusy] = useState(false)
  const [folders, setFolders] = useState<string[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null | 'ALL'>('ALL')
```

- [ ] **Step 2: Load folders alongside backgrounds**

Find:

```tsx
  useEffect(() => {
    window.wf.bgList().then(setBackgrounds)
    // onState only pushes future broadcasts — seed the current state too, or this
    // tab thinks nothing is live until the next unrelated state change (matches
    // the same getState()+onState() pattern ServiceRail.tsx already uses).
    window.wf.getState('main').then(setLive)
    const off = window.wf.onState((s) => setLive(s.main))
    return off
  }, [])
```

Replace with:

```tsx
  useEffect(() => {
    window.wf.bgList().then(setBackgrounds)
    window.wf.bgListFolders().then(setFolders)
    // onState only pushes future broadcasts — seed the current state too, or this
    // tab thinks nothing is live until the next unrelated state change (matches
    // the same getState()+onState() pattern ServiceRail.tsx already uses).
    window.wf.getState('main').then(setLive)
    const off = window.wf.onState((s) => setLive(s.main))
    return off
  }, [])

  const folderScoped = selectedFolder === 'ALL'
    ? backgrounds
    : backgrounds.filter((bg) => bg.folder === selectedFolder)
```

- [ ] **Step 3: Render the folder rail above the grid, and scope the grid to it**

Find:

```tsx
  return (
    <div className="grid grid-cols-6 gap-2">
      {backgrounds.length === 0 && (
        <p className="col-span-6 text-xs text-slate-400">No backgrounds yet — add some in Build Service.</p>
      )}
      {backgrounds.map((bg) => (
```

Replace with:

```tsx
  return (
    <div className="flex flex-col gap-2">
      {folders.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSelectedFolder('ALL')}
            className={[
              'rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all',
              selectedFolder === 'ALL' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            ].join(' ')}
          >
            All
          </button>
          <button
            onClick={() => setSelectedFolder(null)}
            className={[
              'rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all',
              selectedFolder === null ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            ].join(' ')}
          >
            Uncategorized
          </button>
          {folders.map((f) => (
            <button
              key={f}
              onClick={() => setSelectedFolder(f)}
              className={[
                'rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all',
                selectedFolder === f ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {f}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-6 gap-2">
      {folderScoped.length === 0 && (
        <p className="col-span-6 text-xs text-slate-400">No backgrounds yet — add some in Build Service.</p>
      )}
      {folderScoped.map((bg) => (
```

Find the closing of the grid (the end of the `.map()` and the component's return):

```tsx
        </button>
      ))}
    </div>
  )
}
```

Replace with:

```tsx
        </button>
      ))}
      </div>
    </div>
  )
}
```

This keeps the folder rail (a real UI closing exists on it already, unchanged) outside the scrollable/scoped grid, and closes the new outer wrapping `<div>` added in this step.

- [ ] **Step 4: Run the gate**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Expected: all pass, 346 tests, 0 lint errors.

- [ ] **Step 5: Commit and push**

```bash
git add src/renderer/src/drawer/BackgroundsDrawerTab.tsx
git commit -m "feat: folder rail in the live Backgrounds drawer"
git push
```

---

## Task 7: Manual verification

No more code changes. This task is entirely **[manual]** — this sandbox cannot launch Electron. Ask the user to run through this before trusting the feature.

- [ ] **Step 1: Create, rename, delete a folder**

Open the Backgrounds library. Create a folder, confirm it appears immediately (even empty). Rename it, confirm existing backgrounds inside it (if any) keep their tags. Delete it with backgrounds inside, confirm those backgrounds land in Uncategorized rather than being deleted.

- [ ] **Step 2: Move a background — drag and the dropdown**

Drag a background tile onto a folder pill, confirm it moves and its tags survive. Use the per-tile "Move to…" dropdown on another background, confirm the same.

- [ ] **Step 3: In-use warning**

Apply a background to a song. Try to delete or move that exact background from the library. Confirm the warning names the song, and that confirming still lets the move/delete proceed.

- [ ] **Step 4: All four surfaces**

Confirm the folder rail and folder-scoped grid work identically in: the Backgrounds library screen, the song editor's background picker, the item editor's background picker, and the live Backgrounds drawer.

- [ ] **Step 5: Performance, informally**

With a large number of backgrounds (real test needs ~100+), compare how long the grid takes to show content when "All" is selected versus a single folder — confirm folder-scoping is noticeably faster, since that's the actual performance fix this feature delivers.

---

## Self-review notes

**Spec coverage.** Architecture (§1) → Task 1 builds exactly the pure, parameterized folder-CRUD logic described; Task 2 wires it to the real directories. Data model & operations (§2) → every operation listed (create, rename, move, delete-with-contents-preserved, duplicate-name rejection) has a corresponding function and test in Task 1, plus the tags-path-rewrite in Task 3. Component structure (§3) → Task 5 covers `BackgroundLibraryGrid` (all three of its consumers get folders for free, since none of them re-implement the grid), Task 6 covers the drawer. Error handling (§4) → duplicate names (Task 1's tests), in-use warning (Task 5 Step 4), folder-scan cost (inherent to Task 1's cheap directory-name enumeration, no extra work needed). Testing (§5) → Task 1 is exactly the "extract the one testable layer" the spec calls for; Task 7 covers the spec's manual-verification intent.

**Non-goals respected.** No nested folders anywhere in any task. No new backgrounds database table — `listBackgrounds()` still scans the filesystem live. No broader fix to `background_tags`' path-keyed design beyond the specific new fragility (in-app moves) this feature introduces. No virtualization work — folder-scoping is the only performance mechanism, exactly as scoped.

**Type consistency check.** `BgEntry`'s new `folder: string | null` field is added identically in `backgroundLib.ts` (Task 2), and in both local `BgEntry` copies in `BackgroundLibraryGrid.tsx` (Task 5) and `BackgroundsDrawerTab.tsx` (Task 6) — matching the existing pattern where each of these files already keeps its own copy of this interface rather than importing a shared one (not something this plan changes). `FileMove` (`{ oldPath: string; newPath: string }`, Task 1) is the exact shape returned by `renameFolderIn`/`deleteFolderIn` and consumed by both `backgroundLib.ts`'s wrapper functions (Task 2) and `index.ts`'s IPC handlers, which iterate it to call `renameBackgroundTagPath` (Task 3/4) — same field names throughout, no renaming between layers. `selectedFolder`'s three-state type (`string | null | 'ALL'`) is used identically in both Task 5 and Task 6.
