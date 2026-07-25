# Sermon Live Text + Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sermon items get a real live-loader (`doLoadSermon`) that populates title/speaker/passage as track content and supports a background + blur toggle — while the main projector keeps showing only the logo, unchanged. This fixes Sermon's Next/Prev dead-end, gives zone screens routed to Text/Lyrics mode real content instead of stale leftovers, and fills in the blank Build Service preview / slide-grid thumbnail for sermons.

**Architecture:** `doLoadSermon()` follows the exact shape of `doLoadText()` — same track-state resets, same `blurBehindText`/`background` threading — but sets `t.mode = 'logo'` instead of `'lyrics'`. Because zone routing (`computeZoneStates()`) already resolves each zone's content from `t.song`/`t.blurBehindText` independently of `t.mode`, this is the only change needed for zones to pick up real sermon content — no changes to `computeZoneStates()`, `zoneHtml.ts`, or `Output.tsx`.

**Tech Stack:** Electron main process (TypeScript), React 18 renderer.

**Design doc:** [`docs/superpowers/specs/2026-07-25-sermon-live-text-design.md`](../specs/2026-07-25-sermon-live-text-design.md)

---

## Testing convention

Matches this codebase's established pattern: UI/rendering/data-wiring over an already-proven pattern (mirrors the `doLoadText` threading from earlier tonight), not new pure logic — no unit tests to add. Verified manually (Task 5) plus `npm run typecheck` / `npm test` (regression-only) after each task.

## File Structure

- **Modify** `src/main/index.ts` — new `doLoadSermon()`; `handleTabletLoadItem()` gains a `sermon` branch; `computeItemSlides()` gains a `sermon` case; new `wf:live:loadSermon` IPC handler.
- **Modify** `src/preload/index.ts` — new `liveLoadSermon` method.
- **Modify** `src/renderer/src/browserWfMock.ts` — new `liveLoadSermon` mock.
- **Modify** `src/renderer/src/liveActions.ts`, `src/renderer/src/VolunteerView.tsx` — replace the `sendIntent(track, 'logo')` sermon branch with a call to `liveLoadSermon`.
- **Modify** `src/renderer/src/ItemBackgroundPanel.tsx` — add `'sermon'` to `FILE_BACKGROUND_TYPES`.
- **Modify** `src/renderer/src/ServiceSlidePreview.tsx` — add a `'sermon'` render case + include it in the `bgFile`/`blurBehindText` resolution.

---

### Task 1: `doLoadSermon` backend loader + IPC + preload + mock

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/browserWfMock.ts`

- [ ] **Step 1: Add `doLoadSermon()`**

In `src/main/index.ts`, add a new function right after `doLoadText()` (which ends with its closing `}` around line 832):

```ts
function doLoadSermon(track: TrackId, title: string, speaker: string, passage: string, background?: string | null, blurBehindText?: boolean): void {
  const t = tracks[track]
  t.loadGeneration++
  clearCountdown(track)
  clearAutoAdvance(track)
  t.songId = null
  t.scriptureRef = null
  clearSongMeta(track)
  t.bgFit = 'cover'
  const line = [speaker, passage].filter(Boolean).join('\n')
  t.song = { title, lines: [line], background: background ?? null }
  t.songTextColor = null; t.songFont = null
  t.blurBehindText = blurBehindText ?? false
  // Unlike every other loader, mode stays 'logo' — the main projector's
  // sermon behavior (show the church logo) is intentional and unchanged.
  // Zone routing reads t.song/t.blurBehindText independently of t.mode, so a
  // zone manually routed to Text/Lyrics mode still picks up this content —
  // only the main projector's own mode-driven rendering is unaffected.
  t.mode = 'logo'
  t.index = 0
}
```

- [ ] **Step 2: New IPC handler**

Find `ipcMain.handle('wf:live:loadText', ...)`. Add a new handler right after it:

```ts
ipcMain.handle('wf:live:loadSermon', (_e, track: TrackId, title: string, speaker: string, passage: string, background?: string | null, blurBehindText?: boolean) => {
  doLoadSermon(track, title, speaker, passage, background ?? null, blurBehindText); broadcast()
})
```

- [ ] **Step 3: Preload**

In `src/preload/index.ts`, find `liveLoadText`. Add a new method right after it:

```ts
  liveLoadSermon: (track: TrackId, title: string, speaker: string, passage: string, background?: string | null, blurBehindText?: boolean): Promise<void> =>
    ipcRenderer.invoke('wf:live:loadSermon', track, title, speaker, passage, background ?? null, blurBehindText),
```

- [ ] **Step 4: `browserWfMock.ts`**

Find the existing `liveLoadText` mock (an `async (...) => publish({...})` style function). Add a new mock right after it:

```ts
    liveLoadSermon: async (_track: TrackId, title: string): Promise<void> => publish({ songTitle: title || 'Sermon', line: '', next: '', total: 1, index: 0 }),
```

(Match the exact `publish(...)` call shape and surrounding style of the existing `liveLoadText` mock in this file — read it first to confirm the exact `LiveState`-partial shape `publish` expects.)

- [ ] **Step 5: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/renderer/src/browserWfMock.ts
git commit -m "feat: add doLoadSermon — sermon items get real track content while the main projector stays on the logo"
```

---

### Task 2: Wire Sermon into `handleTabletLoadItem` and `computeItemSlides`

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: `handleTabletLoadItem()` gains a `sermon` branch**

Find the `else { return }` at the end of `handleTabletLoadItem`'s if/else-if chain (right after the `announcement` branch: `} else if (item.type === 'announcement' && item.ref_id != null) { await doLoadAnnouncement(track, item.ref_id) } else { return }`). Insert a new branch BEFORE the final `else`:

```ts
  } else if (item.type === 'announcement' && item.ref_id != null) {
    await doLoadAnnouncement(track, item.ref_id)
  } else if (item.type === 'sermon') {
    doLoadSermon(
      track,
      (item.payload.title as string) ?? '',
      (item.payload.speaker as string) ?? '',
      (item.payload.passage as string) ?? '',
      item.payload.background as string | null | undefined,
      item.payload.blurBehindText as boolean | undefined
    )
  } else {
    return
  }
```

This makes `handleTabletLoadItem` reach its existing tail (`t.serviceItemId = item.id`, `applyItemTheme`, `broadcast()`, and the main-track recording-marker call) for sermon items too — fixing the Next/Prev/tablet-remote/slide-click dead end as a direct consequence, with no separate fix needed.

- [ ] **Step 2: `computeItemSlides()` gains a `sermon` case**

Find `computeItemSlides()`. Add a new case, matching the same joined-line logic as `doLoadSermon`, right after the existing `announcement` case (before the function's final `return []`):

```ts
  if (item.type === 'sermon') {
    const speaker = (item.payload.speaker as string) ?? ''
    const passage = (item.payload.passage as string) ?? ''
    const line = [speaker, passage].filter(Boolean).join('\n')
    return line ? [line] : []
  }
```

- [ ] **Step 3: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: sermon items go live properly via Next/Prev/tablet/slide-click, and show a real slide-grid thumbnail"
```

---

### Task 3: Renderer go-live paths use the new loader

**Files:**
- Modify: `src/renderer/src/liveActions.ts`
- Modify: `src/renderer/src/VolunteerView.tsx`

- [ ] **Step 1: `liveActions.ts`**

Find the `sermon` branch inside `sendItemLive`:

```ts
  } else if (item.type === 'sermon') {
    window.wf.sendIntent(track, 'logo')
```

Replace it:

```ts
  } else if (item.type === 'sermon') {
    await window.wf.liveLoadSermon(
      track,
      (item.payload.title as string) ?? '',
      (item.payload.speaker as string) ?? '',
      (item.payload.passage as string) ?? '',
      item.payload.background as string | null | undefined,
      item.payload.blurBehindText as boolean | undefined
    )
```

- [ ] **Step 2: `VolunteerView.tsx`**

Find the equivalent `sermon` branch inside `loadItem`:

```ts
  } else if (item.type === 'sermon') {
    window.wf.sendIntent('main', 'logo')
```

Replace it:

```ts
  } else if (item.type === 'sermon') {
    await window.wf.liveLoadSermon(
      'main',
      (item.payload.title as string) ?? '',
      (item.payload.speaker as string) ?? '',
      (item.payload.passage as string) ?? '',
      item.payload.background as string | null | undefined,
      item.payload.blurBehindText as boolean | undefined
    )
```

- [ ] **Step 3: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/liveActions.ts src/renderer/src/VolunteerView.tsx
git commit -m "feat: explicit Go Live and Volunteer mode load real sermon content, not just the logo intent"
```

---

### Task 4: UI — background picker + Build Service preview

**Files:**
- Modify: `src/renderer/src/ItemBackgroundPanel.tsx`
- Modify: `src/renderer/src/ServiceSlidePreview.tsx`

- [ ] **Step 1: `ItemBackgroundPanel.tsx` — add Sermon to the supported types**

Find `FILE_BACKGROUND_TYPES`:

```ts
const FILE_BACKGROUND_TYPES: ServiceItemType[] = ['text', 'scripture', 'countdown', 'welcome']
```

Replace it:

```ts
const FILE_BACKGROUND_TYPES: ServiceItemType[] = ['text', 'scripture', 'countdown', 'welcome', 'sermon']
```

Update the comment right above it (currently explains why Song/Image/Sermon/Ticker/Announcement are excluded) to drop Sermon from the exclusion list:

```ts
// Item types whose live rendering actually shows a custom file background —
// Song has its own separate background system, Image's payload.path already
// IS the background, and Ticker/Announcement don't support one yet.
```

- [ ] **Step 2: `ServiceSlidePreview.tsx` — resolve background/blur for Sermon, add a render case**

Find the `bgFile` resolution block's first condition:

```ts
  if (item.type === 'text' || item.type === 'scripture' || item.type === 'countdown' || item.type === 'welcome') {
```

Replace it:

```ts
  if (item.type === 'text' || item.type === 'scripture' || item.type === 'countdown' || item.type === 'welcome' || item.type === 'sermon') {
```

Find the `blurBehindText` resolution's matching condition (same four types listed in a ternary):

```ts
  const blurBehindText =
    item.type === 'text' || item.type === 'scripture' || item.type === 'countdown' || item.type === 'welcome'
      ? !!(payload.blurBehindText as boolean | undefined)
```

Replace it:

```ts
  const blurBehindText =
    item.type === 'text' || item.type === 'scripture' || item.type === 'countdown' || item.type === 'welcome' || item.type === 'sermon'
      ? !!(payload.blurBehindText as boolean | undefined)
```

Find the `renderContent()` switch's `'announcement'` case (added earlier tonight — a title + small caption block). Add a `'sermon'` case right after it:

```ts
      case 'sermon': {
        const title = (payload.title as string | undefined) || 'Sermon'
        const speaker = payload.speaker as string | undefined
        const passage = payload.passage as string | undefined
        const sub = [speaker, passage].filter(Boolean).join('  ·  ')
        return (
          <div className="flex flex-col items-center gap-2 px-6 text-center">
            <div className="text-2xl font-bold leading-tight" style={baseTextStyle}>
              {title}
            </div>
            {sub && (
              <div className="text-xs" style={{ ...baseTextStyle, opacity: 0.7 }}>
                {sub}
              </div>
            )}
          </div>
        )
      }
```

- [ ] **Step 3: Typecheck**

Run: `cd C:\Dev\worshipflow && npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/ItemBackgroundPanel.tsx src/renderer/src/ServiceSlidePreview.tsx
git commit -m "feat: Sermon items get the My Backgrounds/Blur toggle and a real Build Service preview"
```

---

### Task 5: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm typecheck and the full test suite are clean**

Run: `cd C:\Dev\worshipflow && npm run typecheck && npm test`
Expected: both clean/passing — no regression from this UI/data-wiring-only change.

- [ ] **Step 2: Confirm the main projector is genuinely unchanged**

Run `npm run dev`. Go live on a sermon item. Confirm the main projector shows only the logo — exactly as before this feature, no text/background visible there.

- [ ] **Step 3: Confirm Next/Prev/tablet/slide-click all work on sermons now**

In a service with a sermon item, advance onto it via Next — confirm it goes live cleanly (previously did nothing). Try the same via a slide-thumbnail click in the Live tab, and via the tablet remote if available.

- [ ] **Step 4: Confirm a zone shows real sermon content**

Route a Pi zone (or the Multiview preview) to Text or Lyrics mode via Scene Chips/Advanced, go live on a sermon with title/speaker/passage filled in — confirm the zone shows that content, not stale leftover content from a previous item.

- [ ] **Step 5: Confirm background + blur work for sermons**

In a sermon item's editor, confirm the "Blur behind text" toggle and "My Backgrounds"/"Presets" tabs now appear (previously absent). Pick a custom background and enable blur, go live, confirm the Text/Lyrics-routed zone from Step 4 shows the image + blurred band. Confirm the Build Service preview shows the picked background too.

- [ ] **Step 6: Confirm recording markers and Volunteer mode**

If feasible, start a test recording, go live on a sermon via Next (not the explicit Go Live button) — confirm a marker stamps (previously only the very first live item of a recording ever got one, per an earlier fix tonight — sermons reaching the same code path should now participate correctly). Separately, confirm Volunteer mode's sermon button now shows real content instead of just the logo intent.

- [ ] **Step 7: Final commit**

If Steps 2-6 required any fixes, stage and commit them now with a message describing what was fixed. If no fixes were needed, run `git log --oneline -5` to confirm the full commit sequence for this feature is present, and report completion.
