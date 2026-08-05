# Background media bin with folders — design

**Date:** 2026-08-03
**App:** WorshipFlow Pro (Electron + React)
**Status:** Design approved, ready for implementation plan

## Context

The Backgrounds library has no folder concept today. Backgrounds are files
scanned live off disk (`listBackgrounds()`, `src/main/backgroundLib.ts`) —
there is no database table for backgrounds at all, only a `background_tags`
table keyed by the file's absolute path, already a known fragility point
(renaming/moving a file outside the app orphans its tags). The same flat
grid component (`BackgroundLibraryGrid.tsx`) is reused across three
consumers (the Backgrounds library screen, the song editor's background
picker, the item editor's background picker), plus a fourth, independent
implementation in the live Backgrounds drawer (`BackgroundsDrawerTab.tsx`).

There's also a real, already-documented performance problem: at ~200
backgrounds, tag-fetching does one IPC round-trip per file on every load,
and a single failed lookup used to blank the entire grid (patched per-item,
not at the batch level — see `BackgroundLibraryGrid.tsx:58-62`).

Confirmed via a competitor UI review the same night this was designed
(FreeShow, WorshipTools Presenter): both tag-based and folder-based media
organization are established, legitimate patterns in this product category
— this design keeps both rather than replacing one with the other.

## Decisions locked with the user

- **Folders are real directories on disk**, not a database-only label.
  Matches the existing "Open folder" button's mental model, and lets a user
  drag files in from Explorer directly into the right folder.
- **Flat folders only** — no nested subfolders. Covers the theme-
  organization use case without a full folder-tree UI.
- **Folders reach every surface**: the Backgrounds library screen, the
  song/item background pickers (both already share `BackgroundLibraryGrid`),
  and the live Backgrounds drawer (a separate implementation that gets a
  matching folder rail).
- **Deleting a folder with contents moves those backgrounds to
  Uncategorized** rather than requiring the folder to be empty first — one
  click, and the actual image/video files are never touched.
- **Moving or deleting an in-use background warns but doesn't block** —
  names what's using it, but doesn't stop the operation. This matches how
  the rest of the app already treats background changes (e.g. changing a
  song's background doesn't warn about anything today either) — consistency
  over new friction.

## Design

### 1. Architecture

Folders are real subdirectories under the existing backgrounds directories
(`backgrounds/uploads/<folder-name>/`, and the same under
`backgrounds/generated/`). No new database table for folders — a folder
"exists" because the directory exists, and a background's folder is simply
its parent directory name, read directly off the real path every time the
library scans. Folder membership can never drift out of sync with reality
the way the existing tags table already can, because it *is* the
filesystem, not a second source of truth trying to track it.

### 2. Data model & operations

- **Create folder** = `mkdir` a new subdirectory. Shows up immediately, even
  empty (folder existence is enumerated directly, not inferred from files
  present — an empty folder must still be visible and selectable).
- **Rename folder** = rename the directory, then update every affected
  background's row in `background_tags` (keyed by file path) to the new
  path, so tags survive the rename.
- **Move a background to a different folder** = move the file on disk, then
  update its `background_tags` row's path the same way. This is the one
  place this design deliberately fixes the existing path-keyed fragility —
  moving a file was previously something that could only happen outside the
  app (silently breaking tags); folders make it a routine in-app action, so
  it has to be handled correctly.
- **Delete folder with contents**: move every background inside back to
  Uncategorized (i.e. move the files up to the parent `uploads`/`generated`
  directory, updating tags paths the same way), then remove the now-empty
  directory.
- **Duplicate folder name**: blocked with an inline message — folder names
  are real directory names, so this is also an OS-level constraint, not
  just a UI rule.

### 3. Component structure

`BackgroundLibraryGrid` (shared by the library screen, the song editor's
background picker, and the item editor's background picker) gains a folder
rail — "All," "Uncategorized," then each real folder, plus "+ New folder."
Selecting a folder scopes the grid to just that folder's contents, which is
also the performance fix: instead of rendering and tag-fetching 200+
backgrounds at once, only the selected folder's contents load — a direct
answer to the problem already flagged in the code, without needing full
virtualization. Moving a background between folders happens via drag-and-
drop onto a folder tab, plus a "Move to folder…" option in the existing
per-tile hover menu as a non-drag fallback.

`BackgroundsDrawerTab` (the live drawer's independent, simpler grid) gets
the same folder rail, adapted to its more compact layout, so folder
navigation works identically whether organizing the library or picking a
background live.

### 4. Error handling

- **Duplicate folder name** — blocked inline, per above.
- **In-use background moved/deleted** — warns (names the song/item using
  it, or notes it's currently live) but proceeds if confirmed. Does not
  block.
- **Folder scan cost** — folder existence and contents are both read live
  from disk with no cached index; enumerating directory names (not file
  contents) is cheap even with many folders, so this doesn't reintroduce a
  performance problem of its own.

### 5. Testing

The real filesystem operations — create/rename/delete folder, move a
background between folders, and the tags-table path rewrite that
accompanies a move or rename — are genuinely testable as pure-ish functions
operating against a real temp directory, following this session's
established pattern of extracting the one truly-testable layer out of
otherwise Electron/UI-heavy code. The folder-rail UI itself, and the drag-
and-drop interaction, are not unit tested, matching the rest of the
Backgrounds UI today.

## Non-goals

- Nested/subfolder support.
- A cached backgrounds index or database table — the filesystem stays the
  single source of truth.
- Fixing the `background_tags` table's path-keyed design more broadly
  (e.g. moving to a stable-id-based schema) — only the specific new
  fragility this feature introduces (in-app moves) is being handled.
- Full virtualization/lazy-loading of the "All" view — folder-scoping is
  the performance fix for this feature; a true "All" view with 200+ items
  still loads everything at once, same as today.

## Success criteria

Backgrounds can be organized into real, flat folders from any of the four
places backgrounds are browsed or picked, including live. Moving/renaming
never silently loses tags. Selecting a folder noticeably reduces load time
for a large library, directly addressing the performance problem already
present in the code before this feature existed.
