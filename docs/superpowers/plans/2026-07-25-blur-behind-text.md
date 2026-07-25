# Blur Behind Text + Announcement Background Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Text, Scripture, Countdown, Welcome, Song, and slide-display Announcement items show a fixed-strength blurred/tinted band directly behind their live text — on the projector, on Pi zone screens, and in the Build Service preview — via a per-item/per-song/per-announcement toggle, off by default. Also give Announcements the same shared "My Backgrounds" library that other types already have, replacing their bare file-picker.

**Architecture:** A single boolean (`blurBehindText`) flows through the exact same three storage/threading patterns already proven in this codebase: payload fields for Text/Scripture/Countdown/Welcome (mirroring `background`/`fontScale`), a dedicated song column + single-field IPC setter (mirroring `textColor`/`font`), and an announcement column (mirroring `background`). All of them converge on one runtime field, `LiveTrackState.blurBehindText`, which is what `Output.tsx` and `computeZoneStates()` actually read — so the three render surfaces only need to know about ONE flag, not three separate sources.

**Tech Stack:** Electron main process (TypeScript, sql.js), React 18 renderer, plain HTML/CSS/JS zone-screen templates (`zoneHtml.ts`).

**Design doc:** [`docs/superpowers/specs/2026-07-25-blur-behind-text-design.md`](../specs/2026-07-25-blur-behind-text-design.md)

---

## Testing convention

Matches this codebase's established pattern: this is UI/rendering wiring over an existing app (DB columns, IPC, template strings), not new pure logic — no unit tests to add. Verified manually (Task 12) plus `npm run typecheck` / `npm test` (regression-only) after each task.

## File Structure

- **Modify** `src/shared/types.ts` — add `blurBehindText?: boolean` to `LiveState`, `ZoneState`, `SongFull`, `SongInput`, `Announcement`, `AnnouncementInput`.
- **Modify** `src/main/db.ts` — two new `ALTER TABLE` migration lines; song `getSong()`/`setSongBlurBehindText()`; announcement `rowToAnnouncement()`/`getAnnouncement()`/`createAnnouncement()`/`updateAnnouncement()`.
- **Modify** `src/main/index.ts` — `LiveTrackState`/`createTrackState()`; `doLoadText`/`doLoadScripture`/`doLoadCountdown`/`doLoadSong`/`doLoadAnnouncement`/`doLoadMedia`; `handleTabletLoadItem`; the three `wf:live:load*` IPC handlers; a new `wf:songs:setBlurBehindText` handler; `renderState()`; `computeZoneStates()`.
- **Modify** `src/preload/index.ts` — `liveLoadText`/`liveLoadScripture`/`liveLoadCountdown` signatures; new `songSetBlurBehindText`.
- **Modify** `src/renderer/src/liveActions.ts`, `src/renderer/src/VolunteerView.tsx` — pass `payload.blurBehindText` through on go-live.
- **Modify** `src/renderer/src/browserWfMock.ts` — add `songSetBlurBehindText` mock.
- **Modify** `src/main/zoneHtml.ts` — client `state` literal; `LYRICS_SCRIPT`/`FLEX_SCRIPT` band rendering.
- **Modify** `src/renderer/src/Output.tsx` — `AudienceModel`/`useLiveModel`; `LyricLayer` band; countdown clock band.
- **Modify** `src/renderer/src/ServiceSlidePreview.tsx` — band around the preview's text content.
- **Modify** `src/renderer/src/ItemBackgroundPanel.tsx` — "Blur behind text" toggle.
- **Modify** `src/renderer/src/editor/BackgroundPanel.tsx`, `src/renderer/src/editor/SongEditor.tsx` — song's toggle + wiring.
- **Modify** `src/renderer/src/AnnouncementEditor.tsx` — swap in `BackgroundLibraryGrid`, add the toggle.

---

### Task 1: Shared types

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add `blurBehindText` to `LiveState`**

Find `LiveState` (starts at line 25). Add one line after `songFont?: string | null`:

```ts
  songTextColor?: string | null
  songFont?: string | null
  blurBehindText?: boolean       // draw a blurred/tinted band behind the live text
}
```

- [ ] **Step 2: Add `blurBehindText` to `ZoneState`**

Find `ZoneState` (starts at line 187). Add one line at the end, before the closing `}`:

```ts
  textAlign: string | null      // 'left' | 'center' | 'right'
  textPosition: string | null   // 'top' | 'center' | 'bottom'
  blurBehindText?: boolean      // blurred/tinted band behind the main line/content
}
```

(Optional, unlike its sibling fields, so this task doesn't force every `ZoneState` object literal elsewhere in the codebase to be touched in the same commit — later tasks populate it where it matters.)

- [ ] **Step 3: Add `blurBehindText` to `SongFull` and `SongInput`**

Find `SongFull` (starts at line 95). Add after `font: FontKey | null`:

```ts
  textColor: string | null
  font: FontKey | null
  blurBehindText?: boolean
}
```

Find `SongInput` (starts at line 108). Add after `font?: FontKey | null`:

```ts
  textColor?: string | null
  font?: FontKey | null
  blurBehindText?: boolean
}
```

- [ ] **Step 4: Add `blurBehindText` to `Announcement` and `AnnouncementInput`**

Find `Announcement` (starts at line 269). Add after `background: string | null // image/video file path (slide only); null = service theme`:

```ts
export interface Announcement extends AnnouncementSummary {
  body: string
  background: string | null // image/video file path (slide only); null = service theme
  blurBehindText?: boolean  // slide-display only
}
```

Find `AnnouncementInput` (starts at line 274). Add after `background?: string | null`:

```ts
export interface AnnouncementInput {
  title: string
  body: string
  display: AnnouncementDisplay
  background?: string | null
  blurBehindText?: boolean
  frequency: AnnouncementFrequency
  startDate?: string | null
  endDate?: string | null
  active?: boolean
}
```

- [ ] **Step 5: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean (every new field is optional, so no existing object literal needs to change yet).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add blurBehindText field to LiveState/ZoneState/SongFull/SongInput/Announcement types"
```

---

### Task 2: Thread `blurBehindText` through Text/Scripture/Countdown/Welcome

Mirrors exactly how `background` was threaded through the same call chain in the prior Custom Backgrounds work.

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/liveActions.ts`
- Modify: `src/renderer/src/VolunteerView.tsx`

- [ ] **Step 1: `LiveTrackState` gains `blurBehindText`**

In `src/main/index.ts`, find the `LiveTrackState` interface (line 207) and `createTrackState()` (line 232). Add one field to each:

```ts
interface LiveTrackState {
  song: { title: string; lines: string[]; background?: string | null; bgMotion?: string | null }
  songId: number | null
  mode: Mode
  index: number
  serviceItemId: number | null
  fontScale: number
  songTextColor: string | null
  songFont: string | null
  blurBehindText: boolean
  bgFit: 'cover' | 'contain'
  ...
```

```ts
function createTrackState(song: LiveTrackState['song']): LiveTrackState {
  return {
    song,
    songId: null,
    mode: 'lyrics',
    index: 0,
    serviceItemId: null,
    fontScale: 6,
    songTextColor: null,
    songFont: null,
    blurBehindText: false,
    bgFit: 'cover',
    ...
```

- [ ] **Step 2: `doLoadText`/`doLoadScripture`/`doLoadCountdown` accept and set it**

Replace `doLoadText` (line 792):

```ts
function doLoadText(track: TrackId, title: string, body: string, background: string | null = null, fontScale?: number, blurBehindText?: boolean): void {
  const t = tracks[track]
  clearCountdown(track)
  t.songId = null
  t.scriptureRef = null
  clearSongMeta(track)
  t.bgFit = 'cover'
  const lines: string[] = []
  if (title) lines.push(title)
  body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).forEach((b) => lines.push(b))
  t.song = { title: title || 'Announcement', lines: lines.length ? lines : [title], background }
  t.songTextColor = null; t.songFont = null
  t.blurBehindText = blurBehindText ?? false
  // Only a text item's own saved font size overrides the live size — tickers/
  // announcements (which pass no fontScale) leave whatever's currently set
  // untouched, same as before this per-item override existed.
  if (fontScale != null) t.fontScale = fontScale
  t.mode = 'lyrics'
  t.index = 0
}
```

Replace `doLoadCountdown` (line 812):

```ts
function doLoadCountdown(track: TrackId, seconds: number, background?: string | null, blurBehindText?: boolean): void {
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
  t.blurBehindText = blurBehindText ?? false
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

(`t.blurBehindText` is captured on `t` itself, not inside the `setInterval` closure — unlike `bg`, it never changes mid-countdown, so there's nothing to preserve across ticks the way the background-wipe bug required.)

Replace `doLoadScripture` (line 868):

```ts
async function doLoadScripture(track: TrackId, reference: string, background?: string | null, blurBehindText?: boolean): Promise<boolean> {
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
  t.blurBehindText = blurBehindText ?? false
  t.mode = 'lyrics'
  t.index = 0
  return true
}
```

- [ ] **Step 3: `doLoadMedia` (Image) explicitly resets it**

Find `doLoadMedia` (line 1003). Right after the existing `t.songTextColor = null; t.songFont = null` line, add:

```ts
  t.songTextColor = null; t.songFont = null
  t.blurBehindText = false
```

(Image items never show text over their background, so this is a defensive reset — same convention already used for `songTextColor`/`songFont` on every non-song loader — preventing a stale `true` from a previously-blurred item leaking onto an Image slide.)

- [ ] **Step 4: `handleTabletLoadItem` passes the item's saved value through**

In `handleTabletLoadItem` (line 1017), update the `scripture`, `text`, `countdown`, and `welcome` branches:

```ts
  } else if (item.type === 'scripture') {
    const ref = item.payload.reference as string
    if (!ref) return
    if (!(await doLoadScripture(track, ref, item.payload.background as string | null | undefined, item.payload.blurBehindText as boolean | undefined))) return  // lookup failed → don't mark it live
  } else if (item.type === 'text') {
    doLoadText(
      track,
      (item.payload.title as string) ?? '',
      (item.payload.body as string) ?? '',
      (item.payload.background as string) ?? null,
      item.payload.fontScale as number | undefined,
      item.payload.blurBehindText as boolean | undefined
    )
  } else if (item.type === 'countdown') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return
    doLoadCountdown(track, secs, item.payload.background as string | null | undefined, item.payload.blurBehindText as boolean | undefined)
  } else if (item.type === 'image') {
    const p = item.payload.path as string
    if (!p) return
    doLoadMedia(track, p, item.title)
  } else if (item.type === 'welcome') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return
    doLoadCountdown(track, secs, item.payload.background as string | null | undefined, item.payload.blurBehindText as boolean | undefined)
```

(The `ticker` branch below this — `doLoadText(track, 'Announcement', txt)` — is deliberately left untouched: it doesn't pass a `blurBehindText` argument, so `doLoadText` defaults it to `false` internally. Ticker items never get this feature, per the design's non-goals.)

- [ ] **Step 5: IPC handlers accept and pass it through**

Replace the three handlers (lines 1434-1446):

```ts
ipcMain.handle('wf:live:loadText', (_e, track: TrackId, title: string, body: string, background?: string | null, fontScale?: number, blurBehindText?: boolean) => {
  doLoadText(track, title, body, background ?? null, fontScale, blurBehindText); broadcast()
})

ipcMain.handle('wf:live:loadCountdown', (_e, track: TrackId, seconds: number, background?: string | null, blurBehindText?: boolean) => {
  doLoadCountdown(track, seconds, background, blurBehindText); broadcast()
})

ipcMain.handle('wf:live:loadScripture', async (_e, track: TrackId, reference: string, background?: string | null, blurBehindText?: boolean): Promise<boolean> => {
  const ok = await doLoadScripture(track, reference, background, blurBehindText)
  if (ok) broadcast()
  return ok
})
```

- [ ] **Step 6: Preload mirrors the new signatures**

In `src/preload/index.ts`, replace:

```ts
  liveLoadScripture: (track: TrackId, reference: string, background?: string | null, blurBehindText?: boolean): Promise<boolean> =>
    ipcRenderer.invoke('wf:live:loadScripture', track, reference, background, blurBehindText),
  liveLoadText: (track: TrackId, title: string, body: string, background?: string | null, fontScale?: number, blurBehindText?: boolean): Promise<void> =>
    ipcRenderer.invoke('wf:live:loadText', track, title, body, background ?? null, fontScale, blurBehindText),
  liveLoadCountdown: (track: TrackId, seconds: number, background?: string | null, blurBehindText?: boolean): Promise<void> =>
    ipcRenderer.invoke('wf:live:loadCountdown', track, seconds, background, blurBehindText),
```

- [ ] **Step 7: `liveActions.ts` passes the item's saved value on go-live**

In `src/renderer/src/liveActions.ts`, replace the `scripture`, `text`, and `countdown`/`welcome` branches inside `sendItemLive`:

```ts
  } else if (item.type === 'scripture') {
    const ref = item.payload.reference as string
    if (!ref) return false
    // A failed lookup must NOT mark the item live — that would leave the previous
    // content on screen re-themed as scripture while the deck says scripture is live.
    const ok = await window.wf.liveLoadScripture(track, ref, item.payload.background as string | null | undefined, item.payload.blurBehindText as boolean | undefined)
    if (!ok) return false
  } else if (item.type === 'text') {
    await window.wf.liveLoadText(
      track,
      (item.payload.title as string) ?? '',
      (item.payload.body as string) ?? '',
      (item.payload.background as string) ?? null,
      item.payload.fontScale as number | undefined,
      item.payload.blurBehindText as boolean | undefined
    )
  } else if (item.type === 'countdown') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return false
    await window.wf.liveLoadCountdown(track, secs, item.payload.background as string | null | undefined, item.payload.blurBehindText as boolean | undefined)
  } else if (item.type === 'image') {
    const p = item.payload.path as string
    if (!p) return false
    await window.wf.liveLoadMedia(track, p, item.title)
  } else if (item.type === 'welcome') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return false
    await window.wf.liveLoadCountdown(track, secs, item.payload.background as string | null | undefined, item.payload.blurBehindText as boolean | undefined)
```

- [ ] **Step 8: `VolunteerView.tsx` — same fix, Main-only**

In `src/renderer/src/VolunteerView.tsx`, replace the equivalent branches inside `loadItem`:

```ts
  } else if (item.type === 'scripture') {
    const ref = item.payload.reference as string
    if (!ref) return
    const ok = await window.wf.liveLoadScripture('main', ref, item.payload.background as string | null | undefined, item.payload.blurBehindText as boolean | undefined)
    if (!ok) return
  } else if (item.type === 'text') {
    await window.wf.liveLoadText(
      'main',
      (item.payload.title as string) ?? '',
      (item.payload.body as string) ?? '',
      (item.payload.background as string) ?? null,
      item.payload.fontScale as number | undefined,
      item.payload.blurBehindText as boolean | undefined
    )
  } else if (item.type === 'countdown') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return
    await window.wf.liveLoadCountdown('main', secs, item.payload.background as string | null | undefined, item.payload.blurBehindText as boolean | undefined)
  } else if (item.type === 'image') {
    const p = item.payload.path as string
    if (!p) return
```

and:

```ts
  } else if (item.type === 'welcome') {
    await window.wf.liveLoadCountdown('main', (item.payload.seconds as number) ?? 300, item.payload.background as string | null | undefined, item.payload.blurBehindText as boolean | undefined)
```

- [ ] **Step 9: `renderState()` copies it onto the broadcast `LiveState`**

In `src/main/index.ts`, find `renderState()` (line 489). Add one line at the end of the returned object, after `songFont: t.songFont`:

```ts
    slideTheme: t.slideTheme,
    slideThemeColors: t.slideThemeColors,
    songTextColor: t.songTextColor,
    songFont: t.songFont,
    blurBehindText: t.blurBehindText
  }
}
```

- [ ] **Step 10: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean. **Note on `browserWfMock.ts`:** its `liveLoadText`/`liveLoadScripture`/`liveLoadCountdown` mocks declare fewer parameters than the real API now has — this is fine and requires no change, same reasoning as the prior Custom Backgrounds work: the mock object is force-cast (`as Window['wf']`), and JS ignores extra arguments a caller passes.

- [ ] **Step 11: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/renderer/src/liveActions.ts src/renderer/src/VolunteerView.tsx
git commit -m "feat: thread blurBehindText through Text/Scripture/Countdown/Welcome live-load"
```

---

### Task 3: Song backend — DB column, live threading, IPC

**Files:**
- Modify: `src/main/db.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/browserWfMock.ts`

- [ ] **Step 1: `db.ts` — migration column**

In `src/main/db.ts`, find the migration block inside `initDb()` (the run of `try { db.run('ALTER TABLE song ADD COLUMN ...') } catch {}` lines, ending around `try { db.run('ALTER TABLE song ADD COLUMN font TEXT') } catch { /* already exists */ }`). Add one line right after it:

```ts
  try { db.run('ALTER TABLE song ADD COLUMN font TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE song ADD COLUMN blur_behind_text INTEGER') } catch { /* already exists */ }
```

- [ ] **Step 2: `db.ts` — `getSong()` reads it**

Find `getSong()`. Add `blur_behind_text` to the SELECT column list:

```ts
  const head = db.prepare(
    'SELECT id, title, author, ccli, copyright, publisher, background, arrangement, font_scale, lines_per_slide, bg_motion, text_color, font, blur_behind_text FROM song WHERE id = ?'
  )
```

Add `blurBehindText` to the returned object, right after `font: (row.font as SongFull['font']) ?? null,`:

```ts
    bgMotion: (row.bg_motion as SongFull['bgMotion']) ?? null,
    textColor: row.text_color ?? null,
    font: (row.font as SongFull['font']) ?? null,
    blurBehindText: row.blur_behind_text === 1,
    sections
  }
}
```

- [ ] **Step 3: `db.ts` — new dedicated setter**

Right after `setSongFont()`, add:

```ts
export function setSongBlurBehindText(id: number, value: boolean): void {
  db.run('UPDATE song SET blur_behind_text = ? WHERE id = ?', [value ? 1 : 0, id]); persist()
}
```

- [ ] **Step 4: `main/index.ts` — `doLoadSong` sets the live flag**

Find `doLoadSong()` (line 914). Add one line after `t.songFont = full.font ?? null`:

```ts
  t.songTextColor = full.textColor ?? null
  t.songFont = full.font ?? null
  t.blurBehindText = full.blurBehindText ?? false
```

- [ ] **Step 5: `main/index.ts` — new IPC handler with live-push**

Find the existing `wf:songs:setTextColor`/`wf:songs:setFont` handlers (same pattern as CB's earlier work — search for `ipcMain.handle('wf:songs:setFont'`). Add a new handler right after them:

```ts
ipcMain.handle('wf:songs:setBlurBehindText', (_e: unknown, id: number, value: boolean) => {
  setSongBlurBehindText(id, value)
  let changed = false
  for (const track of ['main', 'second'] as TrackId[]) {
    const t = tracks[track]
    if (t.songId === id) { t.blurBehindText = value; changed = true }
  }
  if (changed) broadcast()
})
```

(Pushes live immediately if that song is currently on-air on either track — same pattern as `wf:songs:setTextColor`/`wf:songs:setFont`, so toggling the switch while a song is live updates the projector without requiring the operator to re-trigger it.)

Also import `setSongBlurBehindText` alongside the existing `db.ts` imports used by the sibling handlers (`setSongTextColor`, `setSongFont`, etc. — add `setSongBlurBehindText` to that same `import { ... } from './db'` line).

- [ ] **Step 6: Preload**

In `src/preload/index.ts`, add right after `songSetFont`:

```ts
  songSetFont: (id: number, font: string | null): Promise<void> =>
    ipcRenderer.invoke('wf:songs:setFont', id, font),
  songSetBlurBehindText: (id: number, value: boolean): Promise<void> =>
    ipcRenderer.invoke('wf:songs:setBlurBehindText', id, value),
```

- [ ] **Step 7: `browserWfMock.ts`**

Add right after the existing `songSetFont: noop,` line:

```ts
    songSetFont: noop,
    songSetBlurBehindText: noop,
```

- [ ] **Step 8: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src/main/db.ts src/main/index.ts src/preload/index.ts src/renderer/src/browserWfMock.ts
git commit -m "feat: add Song blurBehindText backend (DB column, live threading, IPC)"
```

---

### Task 4: Song editor — "Blur behind text" toggle

**Files:**
- Modify: `src/renderer/src/editor/BackgroundPanel.tsx`
- Modify: `src/renderer/src/editor/SongEditor.tsx`
- Modify: `src/main/db.ts`

- [ ] **Step 1: `BackgroundPanel.tsx` gains the toggle**

In `src/renderer/src/editor/BackgroundPanel.tsx`, add a new prop to the component signature:

```tsx
export default function BackgroundPanel({ song, onApply, onBgMotionChange, onBlurBehindTextChange }: {
  song: SongFull
  onApply: (bgPath: string) => void
  onBgMotionChange: (motion: SongFull['bgMotion']) => void
  onBlurBehindTextChange: (value: boolean) => void
}): JSX.Element {
```

Add the toggle UI right after the "── Segmented tab strip ──" block's closing `</div>` (i.e. right before the "── Scrollable body ──" comment), inside the same `shrink-0 px-3` region:

```tsx
      {/* ── Segmented tab strip ── */}
      <div className="shrink-0 px-3 pt-3 pb-0">
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {(['uploads', 'presets', 'ai'] as const).map((t) => (
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
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Blur behind text ── */}
      <div className="shrink-0 px-3 pt-2">
        <button
          onClick={() => onBlurBehindTextChange(!song.blurBehindText)}
          className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors ${
            song.blurBehindText ? 'border-blue-400 bg-blue-500/10' : 'border-slate-200 bg-white'
          }`}
        >
          <span className="text-[11px] font-semibold text-slate-700">Blur behind text</span>
          <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${song.blurBehindText ? 'bg-blue-600' : 'bg-slate-300'}`}>
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${song.blurBehindText ? 'translate-x-4' : 'translate-x-1'}`} />
          </span>
        </button>
      </div>
```

- [ ] **Step 2: `SongEditor.tsx` — wire the new prop**

Add a new handler right after `handleBgMotionChange` (line 121-126):

```ts
  const handleBgMotionChange = async (motion: SongFull['bgMotion']): Promise<void> => {
    if (!song) return
    const updated = { ...song, bgMotion: motion }
    setSong(updated)
    await window.wf.songSetBgMotion(songId, motion)
  }

  const handleBlurBehindTextChange = async (value: boolean): Promise<void> => {
    if (!song) return
    const updated = { ...song, blurBehindText: value }
    setSong(updated)
    await window.wf.songSetBlurBehindText(songId, value)
  }
```

Wire it into the `BackgroundPanel` call (line 278-282):

```tsx
        <BackgroundPanel
          song={song}
          onApply={handleApplyBackground}
          onBgMotionChange={handleBgMotionChange}
          onBlurBehindTextChange={handleBlurBehindTextChange}
        />
```

Add `blurBehindText` to `saveSong()`'s `SongInput` object (line 42-56), so a full-form save (title rename, slide edit, etc.) doesn't clobber it:

```ts
    const input: SongInput = {
      title: updated.title,
      author: updated.author ?? undefined,
      ccli: updated.ccli ?? undefined,
      copyright: updated.copyright ?? undefined,
      publisher: updated.publisher ?? undefined,
      background: updated.background ?? null,
      sections: updated.sections,
      arrangement: updated.arrangement ?? null,
      fontScale: updated.fontScale,
      linesPerSlide: updated.linesPerSlide,
      bgMotion: updated.bgMotion,
      textColor: updated.textColor,
      font: updated.font,
      blurBehindText: updated.blurBehindText
    }
```

- [ ] **Step 3: `db.ts` — `updateSong()`'s bulk UPDATE also writes it**

`updateSong()`'s bulk `UPDATE` does **not** currently write `blur_behind_text` (Task 3 only added the dedicated single-field setter, matching how `background` itself is dedicated-setter-only). Since `saveSong()`'s `SongInput` now carries `blurBehindText` (Step 2 above), but `updateSong()` ignores that field, this would be harmless-but-dead (the value just wouldn't round-trip through full-form saves) — instead, also add it to `updateSong()`'s bulk UPDATE so a full-form save (title rename, slide edit, etc.) doesn't silently drop it:

In `src/main/db.ts`, find `updateSong()`. Replace its UPDATE statement:

```ts
    db.run(
      'UPDATE song SET title = ?, author = ?, ccli = ?, copyright = ?, publisher = ?, arrangement = ?, font_scale = ?, lines_per_slide = ?, bg_motion = ?, text_color = ?, font = ?, blur_behind_text = ? WHERE id = ?',
      [
        input.title,
        input.author ?? null,
        input.ccli ?? null,
        input.copyright ?? null,
        input.publisher ?? null,
        input.arrangement && input.arrangement.length > 0 ? JSON.stringify(input.arrangement) : null,
        input.fontScale ?? null,
        input.linesPerSlide ?? null,
        input.bgMotion ?? null,
        input.textColor ?? null,
        input.font ?? null,
        input.blurBehindText ? 1 : 0,
        id
      ]
    )
```

- [ ] **Step 4: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/editor/BackgroundPanel.tsx src/renderer/src/editor/SongEditor.tsx src/main/db.ts
git commit -m "feat: Song editor gets a Blur behind text toggle"
```

---

### Task 5: Announcement backend — DB column + `doLoadAnnouncement` threading

**Files:**
- Modify: `src/main/db.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: `db.ts` — migration column**

Add one more line to the same migration block from Task 3, Step 1:

```ts
  try { db.run('ALTER TABLE song ADD COLUMN blur_behind_text INTEGER') } catch { /* already exists */ }
  try { db.run('ALTER TABLE announcement ADD COLUMN blur_behind_text INTEGER') } catch { /* already exists */ }
```

- [ ] **Step 2: `db.ts` — `rowToAnnouncement()`, `getAnnouncement()`, `createAnnouncement()`, `updateAnnouncement()`**

Replace `rowToAnnouncement()`:

```ts
function rowToAnnouncement(r: {
  id: number; title: string; body: string; display: string; background: string | null
  frequency: string; start_date: string | null; end_date: string | null; active: number
  blur_behind_text: number | null
}): Announcement {
  const startDate = r.start_date ?? null
  const endDate = r.end_date ?? null
  const frequency = (r.frequency === 'once' ? 'once' : 'recurring') as Announcement['frequency']
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    display: (r.display === 'ticker' ? 'ticker' : 'slide') as Announcement['display'],
    background: r.background ?? null,
    blurBehindText: r.blur_behind_text === 1,
    frequency,
    startDate,
    endDate,
    active: r.active !== 0,
    expired: announcementExpired({ frequency, startDate, endDate }, todayIso())
  }
}
```

Replace `getAnnouncement()`'s SELECT:

```ts
export function getAnnouncement(id: number): Announcement | null {
  const stmt = db.prepare(
    'SELECT id, title, body, display, background, frequency, start_date, end_date, active, blur_behind_text FROM announcement WHERE id = ?'
  )
```

(`listAnnouncements()`'s SELECT is unchanged — `AnnouncementSummary` doesn't carry `background` or `blurBehindText` either, same existing convention.)

Replace `createAnnouncement()`:

```ts
export function createAnnouncement(input: AnnouncementInput): number {
  db.run(
    'INSERT INTO announcement (title, body, display, background, blur_behind_text, frequency, start_date, end_date, active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [
      input.title,
      input.body,
      input.display,
      input.background ?? null,
      input.blurBehindText ? 1 : 0,
      input.frequency,
      input.startDate ?? null,
      input.endDate ?? null,
      input.active === false ? 0 : 1,
      Date.now()
    ]
  )
  const id = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0] as number
  persist()
  return id
}
```

Replace `updateAnnouncement()`:

```ts
export function updateAnnouncement(id: number, input: AnnouncementInput): void {
  db.run(
    'UPDATE announcement SET title = ?, body = ?, display = ?, background = ?, blur_behind_text = ?, frequency = ?, start_date = ?, end_date = ?, active = ? WHERE id = ?',
    [
      input.title,
      input.body,
      input.display,
      input.background ?? null,
      input.blurBehindText ? 1 : 0,
      input.frequency,
      input.startDate ?? null,
      input.endDate ?? null,
      input.active === false ? 0 : 1,
      id
    ]
  )
  persist()
}
```

- [ ] **Step 3: `main/index.ts` — `doLoadAnnouncement` passes it to `doLoadText`**

Replace `doLoadAnnouncement()` (line 942):

```ts
async function doLoadAnnouncement(track: TrackId, id: number): Promise<void> {
  const a = getAnnouncement(id)
  if (!a) return
  if (a.display === 'ticker') {
    // Title literally 'Announcement' triggers the ticker renderer (existing mechanism).
    doLoadText(track, 'Announcement', a.body)
  } else {
    doLoadText(track, a.title, a.body, a.background ?? null, undefined, a.blurBehindText)
  }
}
```

(The `ticker` branch's call is unchanged — it passes neither `fontScale` nor `blurBehindText`, so both default inside `doLoadText`, matching the design's non-goal of leaving ticker-display announcements out of this feature. The `slide` branch's call passes `undefined` for the `fontScale` param — same as before this task, unchanged — and the new `a.blurBehindText` for the final param.)

- [ ] **Step 4: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/main/db.ts src/main/index.ts
git commit -m "feat: add Announcement blurBehindText backend (DB column, doLoadAnnouncement threading)"
```

---

### Task 6: Announcement editor — shared background library + blur toggle

**Files:**
- Modify: `src/renderer/src/AnnouncementEditor.tsx`

- [ ] **Step 1: Replace the background section and add the toggle**

In `src/renderer/src/AnnouncementEditor.tsx`, change the import line:

```tsx
import { useEffect, useState } from 'react'
import type { Announcement, AnnouncementInput } from '../../shared/types'
import { announcementExpired } from '../../shared/announcementSchedule'
import BackgroundLibraryGrid from './BackgroundLibraryGrid'
```

Update `save()`'s `AnnouncementInput` construction to include the new field:

```ts
  const save = (patch: Partial<Announcement>): void => {
    const next = { ...a, ...patch }
    setA(next)
    const input: AnnouncementInput = {
      title: next.title,
      body: next.body,
      display: next.display,
      background: next.background,
      blurBehindText: next.blurBehindText,
      frequency: next.frequency,
      startDate: next.startDate,
      endDate: next.endDate,
      active: next.active
    }
    window.wf.announcementUpdate(id, input).then(onSaved)
  }
```

Remove the `pickBg()` function entirely (it's replaced by `BackgroundLibraryGrid`'s own upload/browse/Open-folder flow) — delete these lines:

```ts
  const pickBg = async (): Promise<void> => {
    const result = await window.wf.dialogOpenFile()
    if (result.canceled || !result.filePaths[0]) return
    // Copy into the managed backgrounds directory (like song backgrounds do) —
    // zone pages fetch media through /file, which only serves files under
    // userData (plus the configured logo). An arbitrary picked path (e.g. from
    // Downloads) would 403 there and silently fail to render on the zones.
    const dest = await window.wf.bgUpload(result.filePaths[0])
    save({ background: dest })
  }
```

`isVid` is also no longer needed (it was only used by the removed background-section JSX below) — remove:

```ts
  const isVid = a.background ? /\.(mp4|webm|mov|m4v)$/i.test(a.background) : false
```

Replace the entire "Background (slide only)" block:

```tsx
      {/* Background (slide only) */}
      {a.display === 'slide' && (
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Background (optional)</label>
          {a.background ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                {isVid ? <Film size={13} /> : <ImageIcon size={13} />}{isVid ? 'video' : 'image'}
              </span>
              <button onClick={() => save({ background: null })} className="rounded px-1 text-slate-500 hover:text-red-600" title="Remove background"><X size={13} /></button>
            </div>
          ) : (
            <button onClick={pickBg} className="rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700">
              Choose image or video…
            </button>
          )}
        </div>
      )}
```

with:

```tsx
      {/* Background + blur (slide only) */}
      {a.display === 'slide' && (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-slate-600">Background (optional)</label>
          <button
            onClick={() => save({ blurBehindText: !a.blurBehindText })}
            className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors ${
              a.blurBehindText ? 'border-blue-400 bg-blue-500/10' : 'border-slate-200 bg-white'
            }`}
          >
            <span className="text-[11px] font-semibold text-slate-700">Blur behind text</span>
            <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${a.blurBehindText ? 'bg-blue-600' : 'bg-slate-300'}`}>
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${a.blurBehindText ? 'translate-x-4' : 'translate-x-1'}`} />
            </span>
          </button>
          <BackgroundLibraryGrid
            activePath={a.background ?? null}
            onApply={(path) => save({ background: path || null })}
          />
        </div>
      )}
```

Also remove the now-unused `Film`/`ImageIcon`/`X` imports from `lucide-react` if nothing else in the file uses them — check the rest of the file first; if `X` is still used elsewhere (it isn't, based on the current file), drop all three:

```tsx
import { useEffect, useState } from 'react'
```

(No lucide-react import needed at all once `Film`/`ImageIcon`/`X` are gone — confirm by searching the rest of the file for any other use of those three names before deleting the import line.)

- [ ] **Step 2: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean.

- [ ] **Step 3: Manual sanity check**

Run `npm run dev`. Open the Announcements library, edit one with display set to "Slide" — confirm you see the blur toggle and the full My Backgrounds grid (search/upload/Open folder/thumbnails) in place of the old "Choose image or video…" button. Switch display to "Ticker" — confirm both disappear (unchanged gating).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/AnnouncementEditor.tsx
git commit -m "feat: Announcement editor gets the shared background library + Blur behind text toggle"
```

---

### Task 7: `computeZoneStates()` reads the unified live flag

Because Task 2-5 all converge on `LiveTrackState.blurBehindText` → `LiveState.blurBehindText` (via `renderState()`), this task only needs to read `live.blurBehindText` — no per-item-type branching required, unlike `bgOverlay`/`textAlign` (which are payload-only, per-`text`-item overrides that never flow through track state).

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Populate `base.blurBehindText` in the initial object and the two relevant branches**

In `computeZoneStates()`, add one field to the `base: ZoneState` initializer:

```ts
    const base: ZoneState = {
      mode,
      line: '',
      next: '',
      title: '',
      index: live.index,
      total: live.total,
      background: null,
      themeColors: null,
      fontScale: live.fontScale,
      secondsLeft: 0,
      stageMessage: live.stageMessage,
      imagePath: null,
      bgColor: null,
      bgOverlay: null,
      textAlign: null,
      textPosition: null,
      blurBehindText: live.blurBehindText ?? false,
    }
```

(Set once here for every mode — `lyrics`/`text`/`countdown` are the only modes that ever render the `#line`/`#content` element this flag controls; `stage`/`image`/`logo` simply never read it, so there's no need to also touch those branches individually.)

- [ ] **Step 2: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: computeZoneStates resolves blurBehindText for zone screens"
```

---

### Task 8: Zone screens render the blurred band

**Files:**
- Modify: `src/main/zoneHtml.ts`

- [ ] **Step 1: Client `state` literal gains the field**

In `zoneBase()`, add `blurBehindText:false` to the `state` object literal:

```js
  var state={mode:'off',line:'',next:'',title:'',index:0,total:0,background:null,themeColors:null,fontScale:6,secondsLeft:0,stageMessage:null,imagePath:null,bgColor:null,bgOverlay:null,textAlign:null,textPosition:null,blurBehindText:false};
```

- [ ] **Step 2: `LYRICS_SCRIPT` — blur/tint `#line` in lyrics and countdown modes**

In `LYRICS_SCRIPT`'s `render()`, right after `var m=state.mode;`, add a reset that runs on every render (before any mode branch/early-return):

```js
  function render(){
    var m=state.mode;
    lineEl.style.backdropFilter='none';lineEl.style.webkitBackdropFilter='none';lineEl.style.background='transparent';lineEl.style.padding='0 8vw';
    if(m==='black'||m==='off'){
```

In the `countdown` branch, right after `blob1.style.opacity='0';blob2.style.opacity='0';`, add the conditional blur:

```js
    if(m==='countdown'){
      document.body.style.background='#050a14';
      bgvid.style.opacity='0';bgimg.style.opacity='0';gradient.style.opacity='1';
      blob1.style.opacity='0';blob2.style.opacity='0';
      if(state.blurBehindText){lineEl.style.backdropFilter='blur(10px)';lineEl.style.webkitBackdropFilter='blur(10px)';lineEl.style.background='rgba(20,20,30,.3)';lineEl.style.padding='2vh 8vw';}
      var mins=Math.floor(state.secondsLeft/60),secs=state.secondsLeft%60;
```

In the lyrics/text branch, right after the existing `applyBg(state.background);` line, add:

```js
    // lyrics / text
    document.body.style.background='#000';
    applyBg(state.background);
    if(state.blurBehindText){lineEl.style.backdropFilter='blur(10px)';lineEl.style.webkitBackdropFilter='blur(10px)';lineEl.style.background='rgba(20,20,30,.3)';lineEl.style.padding='2vh 8vw';}
    // Solid bg color when no file background
    if(!state.background && state.bgColor){
```

- [ ] **Step 3: `FLEX_SCRIPT` — blur/tint `#content` in lyrics and countdown modes**

In `FLEX_SCRIPT`'s `render()`, right after `var m=state.mode;`, add the equivalent reset (note `#content` isn't full-width by default — `max-width:90vw` — so the reset also clears any inline `width`/`maxWidth` override from a previous blurred render):

```js
  function render(){
    var m=state.mode;
    content.style.backdropFilter='none';content.style.webkitBackdropFilter='none';content.style.background='transparent';content.style.width='';content.style.maxWidth='';content.style.padding='';
    if(m==='black'||m==='off'){
```

In the `lyrics`/`text` branch, right after `applyBg(state.background,true);`, add:

```js
    if(m==='lyrics'||m==='text'){
      applyBg(state.background,true);
      if(state.blurBehindText){content.style.backdropFilter='blur(10px)';content.style.webkitBackdropFilter='blur(10px)';content.style.background='rgba(20,20,30,.3)';content.style.width='100%';content.style.maxWidth='100%';content.style.padding='24px 48px';}
      var tc=state.themeColors;
```

In the `countdown` branch, right after `root.style.background='#050a14';bgvid.style.opacity='0';bgimg.style.opacity='0';overlay.style.opacity='0';`, add:

```js
    if(m==='countdown'){
      root.style.background='#050a14';bgvid.style.opacity='0';bgimg.style.opacity='0';overlay.style.opacity='0';
      if(state.blurBehindText){content.style.backdropFilter='blur(10px)';content.style.webkitBackdropFilter='blur(10px)';content.style.background='rgba(20,20,30,.3)';content.style.width='100%';content.style.maxWidth='100%';content.style.padding='24px 48px';}
      var mins=Math.floor(state.secondsLeft/60),secs=state.secondsLeft%60;
```

(Zone 4 "Stage Monitor" — `STAGE_CSS`/`STAGE_SCRIPT` — is untouched: it has no background/image layer at all, so there's nothing for a blur to sit against, matching the design's non-goal.)

- [ ] **Step 4: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean (this file is plain template-literal strings, so typecheck only validates the surrounding TypeScript, not the embedded JS — read the diff carefully for typos since there's no compiler safety net inside the template).

- [ ] **Step 5: Commit**

```bash
git add src/main/zoneHtml.ts
git commit -m "feat: Pi zone screens render the blurred band behind lyrics/countdown text"
```

---

### Task 9: Main projector renders the blurred band

**Files:**
- Modify: `src/renderer/src/Output.tsx`

- [ ] **Step 1: `AudienceModel`/`useLiveModel` gain `blurBehindText`**

Add to the `AudienceModel` interface:

```ts
export interface AudienceModel {
  mode: Mode
  layers: { front: 0 | 1; a: string; b: string }
  bgSrc: string | null
  clockLine: string
  fontScale: number
  tickerText: string
  bgFit: 'cover' | 'contain'
  bgMotion: 'pan' | 'zoom' | 'shimmer' | null
  slideThemeId: string
  slideThemeColors: ThemeColors | null
  songTextColor: string | null
  songFont: string | null
  blurBehindText: boolean
  ccli: { author: string | null; copyright: string | null; ccli: string | null; license: string | null }
}
```

In `useLiveModel()`, add the state hook near `songFont`:

```ts
  const [songFont, setSongFont] = useState<string | null>(null)
  const [blurBehindText, setBlurBehindText] = useState(false)
```

In the `apply()` callback, add:

```ts
      setSongFont(s.songFont ?? null)
      setBlurBehindText(s.blurBehindText ?? false)
```

In the returned object at the bottom of `useLiveModel()`:

```ts
  return {
    mode, layers, bgSrc, clockLine, fontScale, tickerText, bgFit, bgMotion,
    slideThemeId, slideThemeColors, songTextColor, songFont, blurBehindText, ccli
  }
```

- [ ] **Step 2: `AudienceStage` destructures and threads it to `LyricLayer` + the countdown block**

In `AudienceStage()`, add `blurBehindText` to the destructured `model`:

```ts
  const {
    mode, layers, bgSrc, clockLine, fontScale, tickerText, bgFit, bgMotion,
    slideThemeId, slideThemeColors, songTextColor, songFont, blurBehindText, ccli
  } = model
```

Pass it to both `LyricLayer` instances:

```tsx
          <LyricLayer text={layers.a} show={layers.front === 0} fontScale={fontScale}
            fontFamily={FONT_FAMILY[(songFont as keyof typeof FONT_FAMILY) ?? theme.font]} color={songTextColor ?? colors.text} align={posAlign} blurBehindText={blurBehindText} />
          <LyricLayer text={layers.b} show={layers.front === 1} fontScale={fontScale}
            fontFamily={FONT_FAMILY[(songFont as keyof typeof FONT_FAMILY) ?? theme.font]} color={songTextColor ?? colors.text} align={posAlign} blurBehindText={blurBehindText} />
```

Extract the countdown block's inner content into a variable, right before the component's `return (` statement:

```tsx
  const countdownContent = (
    <>
      <div className="mb-[1.5cqh] text-[2.5cqw] font-semibold uppercase tracking-[0.35em] text-blue-200">
        Service begins in
      </div>
      <div
        className="font-mono text-[20cqw] font-black leading-none tabular-nums text-white"
        style={{ textShadow: '0 4px 40px rgba(0,0,0,.9)' }}
      >
        {clockLine}
      </div>
    </>
  )

  return (
```

Replace the countdown JSX block:

```tsx
      {countdown && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="mb-[1.5cqh] text-[2.5cqw] font-semibold uppercase tracking-[0.35em] text-blue-200">
            Service begins in
          </div>
          <div
            className="font-mono text-[20cqw] font-black leading-none tabular-nums text-white"
            style={{ textShadow: '0 4px 40px rgba(0,0,0,.9)' }}
          >
            {clockLine}
          </div>
        </div>
      )}
```

with:

```tsx
      {countdown && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {blurBehindText ? (
            <div
              className="flex w-full flex-col items-center"
              style={{
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                background: 'rgba(20,20,30,.3)',
                padding: '2cqh 0'
              }}
            >
              {countdownContent}
            </div>
          ) : (
            countdownContent
          )}
        </div>
      )}
```

- [ ] **Step 3: `LyricLayer` renders the band**

Replace `LyricLayer` in full:

```tsx
function LyricLayer({ text, show, fontScale, fontFamily, color, align, blurBehindText }: {
  text: string; show: boolean; fontScale: number; fontFamily: string; color: string; align: string; blurBehindText: boolean
}): JSX.Element {
  const textSpan = (
    <span
      className="font-bold leading-tight"
      style={{
        fontSize: `${fontScale}cqw`,
        fontFamily,
        color,
        textShadow: '0 3px 24px rgba(0,0,0,.85), 0 1px 3px rgba(0,0,0,.9)',
        whiteSpace: 'pre-line'
      }}
    >
      {text}
    </span>
  )
  return (
    <div
      className={`absolute inset-0 flex justify-center py-[6cqh] text-center transition-opacity duration-500 ${blurBehindText ? '' : 'px-[8cqw]'}`}
      style={{ opacity: show ? 1 : 0, alignItems: align }}
    >
      {blurBehindText ? (
        <div
          className="w-full px-[8cqw]"
          style={{
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            background: 'rgba(20,20,30,.3)',
            paddingTop: '2cqh',
            paddingBottom: '2cqh'
          }}
        >
          {textSpan}
        </div>
      ) : (
        textSpan
      )}
    </div>
  )
}
```

(When `blurBehindText` is false, this renders byte-for-byte the same DOM as before this task — the horizontal `px-[8cqw]` padding moves from a static class onto the outer container's className exactly as it always was, and the `<span>` is the outer flex container's only, unwrapped child.)

- [ ] **Step 4: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/Output.tsx
git commit -m "feat: main projector renders the blurred band behind lyrics and the countdown clock"
```

---

### Task 10: Build Service preview shows the band

**Files:**
- Modify: `src/renderer/src/ServiceSlidePreview.tsx`

- [ ] **Step 1: Resolve `blurBehindText` alongside `bgFile`**

In `ServiceSlidePreview.tsx`, right after the `bgFile` resolution block, add:

```ts
  const seconds = (payload.seconds as number | undefined) ?? 300
```

becomes (insert the new block just before this line):

```ts
  // Resolve whether this item's live rendering would show the blurred band —
  // same dual-source split as `bgFile` above: payload for the four style-driven
  // types, the referenced song's own field for Song.
  const blurBehindText =
    item.type === 'text' || item.type === 'scripture' || item.type === 'countdown' || item.type === 'welcome'
      ? !!(payload.blurBehindText as boolean | undefined)
      : item.type === 'song'
        ? !!songFull?.blurBehindText
        : false

  const seconds = (payload.seconds as number | undefined) ?? 300
```

- [ ] **Step 2: Wrap the content layer**

Replace:

```tsx
        {/* Content layer */}
        <div className="absolute inset-0 flex items-center justify-center">{renderContent()}</div>
```

with:

```tsx
        {/* Content layer */}
        <div className="absolute inset-0 flex items-center justify-center">
          {blurBehindText ? (
            <div
              className="w-full text-center"
              style={{
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                background: 'rgba(20,20,30,.3)',
                padding: '16px 0'
              }}
            >
              {renderContent()}
            </div>
          ) : (
            renderContent()
          )}
        </div>
```

- [ ] **Step 3: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/ServiceSlidePreview.tsx
git commit -m "feat: Build Service preview shows the blurred band"
```

---

### Task 11: Item editor toggle (Text/Scripture/Countdown/Welcome)

**Files:**
- Modify: `src/renderer/src/ItemBackgroundPanel.tsx`

- [ ] **Step 1: Add the toggle above the tab strip**

In `ItemBackgroundPanel.tsx`, add a computed value right after `const supportsFileBackground = FILE_BACKGROUND_TYPES.includes(item.type)`:

```ts
  const supportsFileBackground = FILE_BACKGROUND_TYPES.includes(item.type)
  const blurBehindText = !!(payload.blurBehindText as boolean | undefined)
```

Insert the toggle in the `supportsFileBackground` return branch, right after the `<label>` and before the `{/* ── Tab strip ── */}` comment:

```tsx
  return (
    <div className="flex flex-col gap-3 bg-[#f4f6f9] text-slate-900">
      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
        Background &amp; Color
      </label>

      {/* ── Blur behind text ── */}
      <button
        onClick={() => savePayload({ ...payload, blurBehindText: !blurBehindText })}
        className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors ${
          blurBehindText ? 'border-blue-400 bg-blue-500/10' : 'border-slate-200 bg-white'
        }`}
      >
        <span className="text-[11px] font-semibold text-slate-700">Blur behind text</span>
        <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${blurBehindText ? 'bg-blue-600' : 'bg-slate-300'}`}>
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${blurBehindText ? 'translate-x-4' : 'translate-x-1'}`} />
        </span>
      </button>

      {/* ── Tab strip ── */}
      <div className="flex rounded-lg bg-slate-100 p-0.5">
```

(This sits above `{/* ── Tab strip ── */}`, so it's visible regardless of which tab — My Backgrounds or Presets — is active, matching the earlier-approved placement.)

- [ ] **Step 2: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/ItemBackgroundPanel.tsx
git commit -m "feat: Text/Scripture/Countdown/Welcome item editor gets a Blur behind text toggle"
```

---

### Task 12: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm typecheck and the full test suite are clean**

Run: `cd C:\Dev\worshipflow && npm run typecheck && npm test`
Expected: both clean/passing — no regression to any existing test from this UI/rendering-only change.

- [ ] **Step 2: Confirm the toggle appears in the right places, and only there**

Run `npm run dev`. Open a Text, Scripture, Countdown, and Welcome item's editor — confirm the "Blur behind text" switch appears above the My Backgrounds/Presets tabs. Open a Song in the Song editor — confirm the switch appears above its tab strip. Open a slide-display Announcement — confirm the switch appears next to the (now upgraded) My Backgrounds grid. Open a ticker-display Announcement, a Ticker item, an Image item, and a Sermon item — confirm none of them show the switch.

- [ ] **Step 3: Confirm the band shows up on all three surfaces, for each supported type**

For each of Text, Scripture, Countdown, Welcome, Song, and a slide-display Announcement: turn the toggle on, confirm the Build Service preview immediately shows the blurred band. Go live with the item and confirm the main projector shows the same band behind the text. If a Pi zone is available/assigned to that track, confirm it shows the band too.

- [ ] **Step 4: Confirm the band tracks text position and multi-line content**

Pick a theme/service with `position: 'top'` (or set one via the theme picker) and confirm the band sits at the top, not the center. Load a multi-verse scripture passage or a multi-line lyric slide with the toggle on — confirm the band grows to cover all visible lines, not just the first.

- [ ] **Step 5: Confirm a countdown's band survives ticking**

Turn on blur for a Countdown item, go live, and watch it count down for several seconds — confirm the band stays in place the whole time (no flicker or reset, matching how Task 2's `doLoadCountdown` captures `blurBehindText` once on `t`, not inside the per-tick closure).

- [ ] **Step 6: Confirm turning the toggle off removes the band everywhere, and switching items doesn't leak it**

Turn a blurred item's toggle back off — confirm the band disappears on all three surfaces. With a blurred Text item live, advance Next to an Image item (or a Sermon, or a ticker-display Announcement) — confirm no stale blurred band is left behind on the projector or any Pi zone.

- [ ] **Step 7: Confirm the Announcement background library round-trips**

In a slide-display Announcement's editor, click "Open folder," drop an image in directly, reopen the panel, confirm it appears in the grid, pick it, confirm it saves (`background` updates) the same way Text/Scripture/Countdown/Welcome already do.

- [ ] **Step 8: Confirm the Song editor's full-form save doesn't clobber the toggle**

With a song's blur toggle on, edit a lyric slide's text (triggering `saveSong()`'s full-object save) — confirm the toggle is still on afterward (verifies Task 4's `updateSong()`/`SongInput` wiring actually persists it end-to-end, not just the dedicated setter).

- [ ] **Step 9: Final commit**

If Steps 2-8 required any fixes, stage and commit them now with a message describing what was fixed. If no fixes were needed, run `git log --oneline -14` to confirm the full commit sequence for this feature is present, and report completion.
