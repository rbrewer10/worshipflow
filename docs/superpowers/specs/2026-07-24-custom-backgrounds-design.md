# Custom Background Images for More Slide Types — Design

Date: 2026-07-24
Status: Approved (design), pending implementation plan

## Problem

Two related gaps in how backgrounds work today:

1. **The item/song editor's picker doesn't show your own images.** There are actually two separate background-picker UIs in this app: `src/renderer/src/editor/BackgroundPanel.tsx` (used by the Song editor) has a full "My Uploads" library with drag-and-drop, tagging, and search — but `src/renderer/src/ItemBackgroundPanel.tsx` (used by every other item's editor — Scripture, Countdown, Text, etc.) only shows the 20 built-in gradient theme swatches (Aurora, Bokeh lights, Holy Fire, ...). A user looking at that second panel sees only gradients and has no way to reach their own images, which is what reads as "AI images, all the same just different colors."
2. **The storage folder is buried and can't be batch-loaded.** Uploaded/generated backgrounds live under Electron's `userData/backgrounds/{uploads,generated}` — deep in AppData, invisible to a normal user, and the only way in is the app's one-file-at-a-time upload dialog or drag-and-drop onto the panel itself.
3. **Even where a file-background field exists, most item types can't use it.** `ItemBackgroundPanel.tsx`'s "File Background" section is hard-gated to `item.type === 'text'`. Scripture, Countdown, and Welcome items have no way to set a custom image at all today — the live projector and Pi zone screens always fall back to the gradient theme for those types, because `doLoadScripture`/`doLoadCountdown` in `src/main/index.ts` hardcode the live background to `null` regardless of what's saved on the item.

## Solution overview (approved)

- Extract the Song editor's "My Uploads" grid (search, drag-drop, thumbnails, delete/tag) into a new shared, generic component so both the Song editor and every item editor can show the exact same library.
- Add an **"Open folder"** button to that grid so images can be dropped in via File Explorer in bulk, instead of one at a time through the app.
- Give `ItemBackgroundPanel.tsx` two tabs — **My Backgrounds** (default) and **Presets** (today's gradients) — using the shared grid.
- Extend custom file-background support from Text-only to **Text, Scripture, Countdown, Welcome**. Song keeps its own separate background system (unchanged). Image, Sermon, Ticker, and Announcement are out of scope for this change (see Non-goals).
- Fix the actual root cause for Countdown/Scripture: `doLoadScripture`/`doLoadCountdown` in the main process never read the item's saved background — they hardcode `null`. That's why nothing shows even where the data model already supports it.

## Backend changes (`src/main/index.ts`)

- **`doLoadScripture(track, reference, background?: string | null)`** — currently always sets `t.song = { title: result.reference!, lines, background: null }`. Gains an optional `background` param, used in place of the hardcoded `null`.
- **`doLoadCountdown(track, seconds, background?: string | null)`** — currently always sets `background: null`, both on initial load AND on every one-second timer tick (the tick rebuilds `t.song` from scratch each time). Gains an optional `background` param; the value must be captured in the timer's closure so each tick preserves it instead of reverting to `null`.
- **`handleTabletLoadItem`** — the `scripture` and `countdown`/`welcome` branches pass `item.payload.background as string | null | undefined` through to the two functions above (mirroring how the `text` branch already passes `item.payload.fontScale`).
- **`wf:live:loadScripture`/`wf:live:loadCountdown` IPC handlers** — gain the same optional `background` parameter, passed through.
- **`computeZoneStates()`** — the `countdown` mode branch currently only computes `secondsLeft` and `title`; it never resolves a background (unlike the `lyrics`/`text` branch, which already resolves theme-vs-file backgrounds). Add the same background resolution to the `countdown` branch so Pi zone screens shows the custom image too, not just the main projector window. (Scripture needs no zone-branch change — it already routes through the `lyrics`/`text` zone mode via `ZONE_ROUTING_DEFAULTS.scripture`, which already resolves background from `live.background`; fixing `doLoadScripture` is sufficient there.)

No change needed to `AudienceStage`/`Output.tsx` (the main projector) — its background layer already renders unconditionally by mode (only visibility is gated on `black`), so it will pick up a real background path as soon as one is actually passed through instead of `null`.

## New shared component — `src/renderer/src/BackgroundLibraryGrid.tsx`

Extracted from `BackgroundPanel.tsx`'s existing `tab === 'uploads'` block: the mood-filter chips, the drag-drop/browse zone, the thumbnail grid (delete, auto-tag, edit-tags), and the tag-editing modal. Generalized props:

```ts
{ activePath: string | null; onApply: (path: string) => void }
```

(replacing the song-specific `song.background === u.path` check with the generic `activePath` comparison). Internally unchanged: still calls `window.wf.bgList()`/`bgGetTags()`/`bgUpload()`/`bgOpenDialog()`/`bgDelete()`/`bgSetTags()`/`bgAutoTag()` exactly as today.

Gains one new element: an **"Open folder"** button next to the drag-drop zone, calling a new `window.wf.bgOpenFolder()` method — a new `wf:bg:openFolder` IPC handler in `src/main/index.ts` that calls `shell.openPath()` on the uploads directory (the same directory `listBackgrounds()` already scans), so the folder just needs opening, not creating.

`BackgroundPanel.tsx` (Song editor) is refactored to render `<BackgroundLibraryGrid activePath={song.background} onApply={onApply}/>` in its `uploads` tab in place of the inline block — a pure extraction, no behavior change there beyond gaining the new "Open folder" button for free.

## `ItemBackgroundPanel.tsx` changes

- Add a `tab: 'library' | 'presets'` state, defaulting to `'library'`.
- Tab strip UI matching the segmented-control style already used in `BackgroundPanel.tsx`'s tab strip.
- `'library'` tab: `<BackgroundLibraryGrid activePath={fileBg ?? null} onApply={(path) => savePayload({ ...payload, background: path })}/>`, shown when `item.type` is one of `text`, `scripture`, `countdown`, `welcome` (replacing today's `item.type === 'text'` gate on the whole "File Background" section, and replacing the single "Pick image/video…" button with the shared grid).
- `'presets'` tab: today's existing gradient swatch grid + custom-color section, unchanged content, just moved under this tab.

## `ServiceSlidePreview.tsx` changes

The `bgFile` resolution at the top of the component currently only branches on `item.type === 'text' | 'image' | 'song'`. Add `'scripture'`, `'countdown'`, and `'welcome'` to that resolution (reading `payload.background` the same way `'text'` does), so the preview shown while building matches what actually goes live.

## Error handling

- `bgOpenFolder()` — if the directory doesn't exist yet (fresh install, no uploads ever made), create it first (`mkdirSync(..., { recursive: true })`) before calling `shell.openPath`, so the button never silently fails on a brand-new install.
- Existing error handling in the extracted grid (upload failures, generation failures, delete failures) is unchanged — this is a pure relocation of already-working code.
- If an item's saved `payload.background` file has since been deleted from disk, behavior matches today's existing Text-item behavior (the projector's background `<img>`/`<video>` fails to load and the layer stays hidden/transparent over the gradient — no crash). Not changed by this work.

## Non-goals

- No changes to Song's own background system (`SongFull.background`, edited only via `BackgroundPanel.tsx` inside `SongEditor.tsx`) — already fully supported, untouched.
- No custom background support added to Image, Sermon, Ticker, or Announcement item types.
- No folder-watching (`fs.watch`/chokidar) — the existing scan-on-panel-open behavior (`listBackgrounds()` does a fresh `readdirSync` each time `bgList()` is called) is sufficient once there's an easy way to get files into the folder; a manual "Open folder" is enough, matching what was asked for.
- No relocation of the storage folder itself out of `userData` — stays where `backgroundLib.ts` already puts it; only how you get files into it changes.
- No changes to the AI-generation tab or motion-effect picker in the Song editor's `BackgroundPanel.tsx` beyond the pure extraction of the uploads grid.

## Testing

Manual, matching this codebase's established convention for UI/rendering work (no existing test coverage for `BackgroundPanel.tsx`/`ItemBackgroundPanel.tsx`/`ServiceSlidePreview.tsx` to extend):
- Drop several images directly into the uploads folder via the new "Open folder" button, reopen the panel, confirm they appear in the grid.
- For each of Text, Scripture, Countdown, Welcome: pick a custom background from "My Backgrounds," confirm the Build Service preview shows it, go live, confirm the main projector shows it, confirm a Pi zone assigned to that track/zone shows it too.
- Confirm a Countdown's background survives multiple timer ticks (doesn't revert to the gradient mid-countdown).
- Confirm Song editor's background picker (`BackgroundPanel.tsx`) behaves identically to before the extraction — same uploads, same tags, same delete/generate/preset behavior.
- Confirm Image/Sermon/Ticker/Announcement/Song item editors are unaffected (no "My Backgrounds" tab where it wasn't asked for).

## Success criteria

- Opening the background picker on a Text, Scripture, Countdown, or Welcome item defaults to a "My Backgrounds" tab showing your own images, not the gradient presets.
- An "Open folder" button lets you drop in a batch of images from File Explorer, and they show up next time the panel opens.
- Picking a custom background for a Countdown or Scripture item actually shows it — on the Build Service preview, the main projector, and Pi zone screens.
