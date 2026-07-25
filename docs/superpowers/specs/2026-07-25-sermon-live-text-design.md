# Sermon Live Text + Background Support — Design

Date: 2026-07-25
Status: Approved (design), pending implementation plan

## Problem

Sermon items are a dead end today. Going live on a Sermon just does `sendIntent(track, 'logo')` — the main projector shows the church logo, which is correct and intentional (the editor's own UI says so: "When live, the screen shows the logo. This marks where the sermon starts for recording chapters."). But nothing else about going live on a sermon actually works:

- `handleTabletLoadItem()` (the function that runs on every Next/Prev advance, tablet-remote tap, and slide-thumbnail click) has no branch for `'sermon'` — it falls through to `else { return }`, so pressing Next when a sermon is up next does **nothing at all**. No error, no screen change, stuck.
- A Pi zone screen manually routed to "Text"/"Lyrics" mode (via Scene Chips, e.g. the original "back-left shows the sermon name" idea) shows **stale leftover content from whatever was live before** — sermon go-live never touches `t.song`, which is what zone routing reads from.
- The Build Service preview and the Live tab's slide grid both show a blank box for sermon items — no title, no clickable thumbnail.
- Sermons have no background picker or blur toggle, unlike every other item type.

## Solution overview

Give Sermon a real `doLoadSermon()` live-loader, following the exact same shape as `doLoadText()`/`doLoadScripture()` — but keep `t.mode = 'logo'` so the main projector's behavior is **completely unchanged**.

The key realization: `computeZoneStates()` already resolves each zone's content independently of the track's own `mode` — a zone's rendered mode comes from that zone's own routing config (`Scene Chips`/Advanced picker), not from `t.mode`. Its `lyrics`/`text` branch already reads `t.song.title`/`.lines`/`.background` and `t.blurBehindText` regardless of what `t.mode` currently is. So once `doLoadSermon()` populates those fields, a zone routed to "Text" mode picks up real sermon content automatically — **no changes needed to `computeZoneStates()`, `zoneHtml.ts`, or `Output.tsx`.**

## Content

`t.song.title` = the sermon's title (shown as the zone template's caption, matching how Text-item titles render).
`t.song.lines` = one line: `"${speaker}\n${passage}"` (matching the existing `whiteSpace: pre-line` handling already used for multi-line lyric text) — shown as the main line. Blank speaker/passage fields are simply omitted from the joined string rather than showing an empty line.

## Backend changes (`src/main/index.ts`)

- **`doLoadSermon(track, title, speaker, passage, background?, blurBehindText?)`** (new function, mirrors `doLoadText`): resets the usual track-state fields (`clearCountdown`, `clearAutoAdvance`, `songId = null`, `clearSongMeta`), sets `t.song = { title, lines: [joinedLine], background: background ?? null }`, `t.blurBehindText = blurBehindText ?? false`, **`t.mode = 'logo'`** (not `'lyrics'` — this is what keeps the main projector unchanged), `t.index = 0`.
- **`handleTabletLoadItem()`** gains a `sermon` branch, passing `item.payload.title`/`.speaker`/`.passage`/`.background`/`.blurBehindText` to `doLoadSermon`, then falling through to the function's existing tail (`t.serviceItemId = item.id`, `applyItemTheme`, `broadcast()`) exactly like every other branch.
- **`computeItemSlides()`** gains a `sermon` case returning the same joined line, so the Live tab's slide grid shows a real, clickable thumbnail instead of nothing.
- **New `wf:live:loadSermon` IPC handler** + preload method + `browserWfMock` entry, mirroring `wf:live:loadText`.
- **`liveActions.ts`'s `sendItemLive`** and **`VolunteerView.tsx`'s `loadItem`**: replace their current `sendIntent(track, 'logo')`/equivalent sermon branch with a call to the new `liveLoadSermon`, so the explicit "Go Live" button and Volunteer mode also populate real data (today they only set the logo intent — this fixes the same underlying gap for those entry points too, not just Next/Prev).

## UI changes

- **`ItemBackgroundPanel.tsx`**: add `'sermon'` to `FILE_BACKGROUND_TYPES`, giving Sermon items the same "My Backgrounds"/"Presets" tabs and "Blur behind text" toggle everything else has.
- **`ServiceSlidePreview.tsx`**: add a `'sermon'` case to `renderContent()` (title + speaker/passage, matching the Announcement case's style) and include `'sermon'` in the `bgFile`/`blurBehindText` resolution alongside the other four payload-driven types.

## Non-goals

- **No change to the main projector.** It keeps showing the logo for a live sermon — this was explicit, working, intended behavior and stays exactly as-is.
- **No new `ZoneMode`.** Reuses existing `text`/`lyrics` zone modes — a zone must still be manually routed to one of those (via Scene Chips/Advanced) to show sermon content; the default routing (`logo`/`stage`) is unchanged.
- **No long-form sermon notes field.** The data model stays title/speaker/passage — no new rich-text notes editor. "Scrolling notes via Next" (an idea from much earlier in this project) isn't built here; there's currently nothing substantial enough to page through.
- **No recording-marker changes** — sermons already correctly trigger a marker via the existing `onItemLive` call once `handleTabletLoadItem` actually reaches its broadcast tail for sermon items (a side effect of fixing the dead-end, not new work).

## Testing

Manual (matches this codebase's established convention):
- Advance Next/Prev onto a sermon item — confirm it now works (previously did nothing).
- With a zone routed to Text/Lyrics mode, go live on a sermon — confirm the zone shows the sermon's title/speaker/passage instead of stale content, and the main projector still shows only the logo.
- Confirm Build Service preview and Live tab slide grid now show real sermon content.
- Pick a custom background + toggle blur for a sermon item — confirm it shows on a Text/Lyrics-routed zone.
- Confirm the explicit "Go Live" button and Volunteer mode also populate real data, not just Next/Prev.

## Success criteria

- Sermon items are no longer a Next/Prev/tablet dead end.
- A zone routed to show sermon text shows the actual sermon, not stale content.
- Sermon items get the same background/blur support as Text/Scripture/Countdown/Welcome/Song/Announcement.
- The main projector's sermon behavior (logo-only) is unchanged.
