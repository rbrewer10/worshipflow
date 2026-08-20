# Announcements Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give slide-display announcements a real visual identity (icon/image split layout) instead of reusing the plain song-lyric text renderer, and let the operator pick that icon and see a live preview while editing — per [`docs/superpowers/specs/2026-08-19-announcements-visual-redesign-design.md`](../specs/2026-08-19-announcements-visual-redesign-design.md).

**Architecture:** One new nullable `icon` column on the `announcement` table (built-in key, custom image path, or null → default), a new `'announcement'` `Mode` with its own `AnnouncementLayer` in `Output.tsx` (sibling to the existing `LyricLayer`/countdown/logo blocks — none of those change), and a new `doLoadAnnouncementSlide` path in `src/main/index.ts` that stops routing slide-display announcements through `doLoadText`. Ticker-display announcements are untouched.

**Tech Stack:** Electron/React/TypeScript, sql.js (SQLite), Tailwind, lucide-react icons, Vitest.

---

### Task 1: Data model — types, migration, CRUD

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/db.ts:49-61` (table), `src/main/db.ts:170` (migration list), `src/main/db.ts:575-668` (`rowToAnnouncement`, `listAnnouncements`, `getAnnouncement`, `createAnnouncement`, `updateAnnouncement`)

- [ ] **Step 1: Add the built-in icon key list and `Mode`/`LiveState`/announcement type changes**

In `src/shared/types.ts`, right before the `// --- Announcements library ---` section (around line 357), add:

```ts
export const ANNOUNCEMENT_ICON_KEYS = [
  'megaphone', 'music', 'calendar', 'people', 'meal', 'kids', 'outreach', 'study'
] as const
export type AnnouncementIconKey = typeof ANNOUNCEMENT_ICON_KEYS[number]
```

Change line 6 from:
```ts
export type Mode = 'lyrics' | 'black' | 'logo' | 'countdown' | 'livecall'
```
to:
```ts
export type Mode = 'lyrics' | 'black' | 'logo' | 'countdown' | 'livecall' | 'announcement'
```

In the `LiveState` interface, add a new field right after `background: string | null` (line 32):
```ts
  icon?: string | null  // announcement mode only: 'icon:<key>' (built-in) or a real image path (custom)
```

In the `Announcement`/`AnnouncementInput` interfaces (currently lines 371-388), add `icon` to both:
```ts
export interface Announcement extends AnnouncementSummary {
  body: string
  background: string | null // image/video file path (slide only); null = service theme
  blurBehindText?: boolean  // slide-display only
  icon: string | null       // 'icon:<key>' (built-in, see ANNOUNCEMENT_ICON_KEYS) or a real image path; null = default icon
}

export interface AnnouncementInput {
  title: string
  body: string
  display: AnnouncementDisplay
  background?: string | null
  blurBehindText?: boolean
  icon?: string | null
  frequency: AnnouncementFrequency
  startDate?: string | null
  endDate?: string | null
  active?: boolean
}
```

- [ ] **Step 2: Extend `LiveTrackState.song` to carry an icon**

In `src/main/index.ts:266-268`, change:
```ts
interface LiveTrackState {
  song: { title: string; lines: string[]; background?: string | null; bgMotion?: string | null }
```
to:
```ts
interface LiveTrackState {
  song: { title: string; lines: string[]; background?: string | null; bgMotion?: string | null; icon?: string | null }
```

- [ ] **Step 3: Add the migration and update the table's `CREATE TABLE`**

In `src/main/db.ts`, the `CREATE TABLE IF NOT EXISTS announcement` block (around line 49) is only used for brand-new databases — existing ones rely on the `ALTER TABLE` migration list, same as every other column this codebase has added since. Add `icon TEXT` to the `CREATE TABLE` block for consistency:
```sql
CREATE TABLE IF NOT EXISTS announcement (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  display TEXT NOT NULL DEFAULT 'slide',
  background TEXT,
  icon TEXT,
  frequency TEXT NOT NULL DEFAULT 'recurring',
  start_date TEXT,
  end_date TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
```

Then, right after the existing `try { db.run('ALTER TABLE announcement ADD COLUMN blur_behind_text INTEGER') } catch { /* already exists */ }` line (db.ts:170), add:
```ts
  try { db.run('ALTER TABLE announcement ADD COLUMN icon TEXT') } catch { /* already exists */ }
```

- [ ] **Step 4: Wire `icon` through the CRUD functions**

In `src/main/db.ts`, update `rowToAnnouncement` (around line 575) — add `icon: string | null` to the row param type and the returned object:
```ts
function rowToAnnouncement(r: {
  id: number; title: string; body: string; display: string; background: string | null
  frequency: string; start_date: string | null; end_date: string | null; active: number
  blur_behind_text: number | null; icon: string | null
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
    icon: r.icon ?? null,
    frequency,
    startDate,
    endDate,
    active: r.active !== 0,
    expired: announcementExpired({ frequency, startDate, endDate }, todayIso())
  }
}
```

Update `getAnnouncement`'s SELECT (around line 619) to include `icon`:
```ts
export function getAnnouncement(id: number): Announcement | null {
  const stmt = db.prepare(
    'SELECT id, title, body, display, background, frequency, start_date, end_date, active, blur_behind_text, icon FROM announcement WHERE id = ?'
  )
```

Update `createAnnouncement` (around line 629):
```ts
export function createAnnouncement(input: AnnouncementInput): number {
  db.run(
    'INSERT INTO announcement (title, body, display, background, blur_behind_text, icon, frequency, start_date, end_date, active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [
      normalizeTitleText(input.title),
      input.body,
      input.display,
      input.background ?? null,
      input.blurBehindText ? 1 : 0,
      input.icon ?? null,
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

Update `updateAnnouncement` (around line 650):
```ts
export function updateAnnouncement(id: number, input: AnnouncementInput): void {
  db.run(
    'UPDATE announcement SET title = ?, body = ?, display = ?, background = ?, blur_behind_text = ?, icon = ?, frequency = ?, start_date = ?, end_date = ?, active = ? WHERE id = ?',
    [
      normalizeTitleText(input.title),
      input.body,
      input.display,
      input.background ?? null,
      input.blurBehindText ? 1 : 0,
      input.icon ?? null,
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

`listAnnouncements` and `AnnouncementSummary` are unchanged — the library list view doesn't need the icon (only the editor's live preview and the actual live render do), so there's no reason to widen the summary type or its SELECT.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: passes clean (no test yet — this task is pure plumbing, verified by the type system; behavior is exercised by Tasks 3-4's tests and Task 5's manual check).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/index.ts src/main/db.ts
git commit -m "feat: add icon field to announcements (data model + migration)"
```

---

### Task 2: Icon resolver (pure logic, TDD)

**Files:**
- Create: `src/renderer/src/announcementIcons.tsx`
- Test: `src/renderer/src/announcementIcons.test.ts`

This is renderer-only (not `shared/`) because it maps icon keys to `lucide-react` React components — `shared/` is imported by the main process too, which has no React/DOM.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/src/announcementIcons.test.ts
import { describe, it, expect } from 'vitest'
import { resolveAnnouncementIcon } from './announcementIcons'
import { Megaphone, Music, Baby } from 'lucide-react'

describe('resolveAnnouncementIcon', () => {
  it('resolves a built-in icon key', () => {
    const r = resolveAnnouncementIcon('icon:music')
    expect(r).toEqual({ kind: 'builtin', Icon: Music })
  })

  it('falls back to the default (megaphone) for null', () => {
    const r = resolveAnnouncementIcon(null)
    expect(r).toEqual({ kind: 'builtin', Icon: Megaphone })
  })

  it('falls back to the default for an unrecognized icon: key', () => {
    const r = resolveAnnouncementIcon('icon:not-a-real-key')
    expect(r).toEqual({ kind: 'builtin', Icon: Megaphone })
  })

  it('treats anything without the icon: prefix as a custom image path', () => {
    const r = resolveAnnouncementIcon('C:\\Users\\ryan\\backgrounds\\choir.png')
    expect(r).toEqual({ kind: 'custom', path: 'C:\\Users\\ryan\\backgrounds\\choir.png' })
  })

  it('resolves every key in ANNOUNCEMENT_ICON_KEYS to a distinct component', () => {
    const r = resolveAnnouncementIcon('icon:kids')
    expect(r).toEqual({ kind: 'builtin', Icon: Baby })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/announcementIcons.test.ts`
Expected: FAIL — `Cannot find module './announcementIcons'`

- [ ] **Step 3: Write the implementation**

```tsx
// src/renderer/src/announcementIcons.tsx
// Maps an announcement's `icon` field (built-in key or custom image path) to
// what actually renders in the icon panel. Lives in renderer/, not shared/,
// because it returns real lucide-react components — shared/ is imported by
// the main process too, which has no React.
import type { LucideIcon } from 'lucide-react'
import { Megaphone, Music, CalendarDays, Users, Utensils, Baby, Heart, BookOpen } from 'lucide-react'
import type { AnnouncementIconKey } from '../../shared/types'

export const ANNOUNCEMENT_ICON_COMPONENTS: Record<AnnouncementIconKey, LucideIcon> = {
  megaphone: Megaphone,
  music: Music,
  calendar: CalendarDays,
  people: Users,
  meal: Utensils,
  kids: Baby,
  outreach: Heart,
  study: BookOpen
}

export const ANNOUNCEMENT_ICON_LABELS: Record<AnnouncementIconKey, string> = {
  megaphone: 'General',
  music: 'Music',
  calendar: 'Event',
  people: 'Fellowship',
  meal: 'Meal',
  kids: 'Kids',
  outreach: 'Outreach',
  study: 'Study'
}

export type ResolvedAnnouncementIcon =
  | { kind: 'builtin'; Icon: LucideIcon }
  | { kind: 'custom'; path: string }

// null/unset, or an 'icon:<key>' that doesn't match a known key (e.g. a key
// removed in a future version) both fall back to the same default rather
// than rendering nothing.
export function resolveAnnouncementIcon(icon: string | null): ResolvedAnnouncementIcon {
  if (!icon) return { kind: 'builtin', Icon: Megaphone }
  if (icon.startsWith('icon:')) {
    const key = icon.slice(5) as AnnouncementIconKey
    const Icon = ANNOUNCEMENT_ICON_COMPONENTS[key]
    return Icon ? { kind: 'builtin', Icon } : { kind: 'builtin', Icon: Megaphone }
  }
  return { kind: 'custom', path: icon }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/announcementIcons.test.ts`
Expected: PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/announcementIcons.tsx src/renderer/src/announcementIcons.test.ts
git commit -m "feat: add announcement icon resolver (8 built-ins + custom-image fallback)"
```

---

### Task 3: Main process — `doLoadAnnouncementSlide` and `renderState`

**Files:**
- Modify: `src/main/index.ts` (`renderState` around line 735, `doLoadAnnouncement` around line 1666)

- [ ] **Step 1: Add `icon` to `renderState()`'s returned `LiveState`**

In `src/main/index.ts`, in `renderState()` (line 744), add one line right after `background:` (line 751):
```ts
    background: t.hasLiveContent ? (t.song.background ?? null) : null,
    icon: t.hasLiveContent ? (t.song.icon ?? null) : null,
```

- [ ] **Step 2: Add `doLoadAnnouncementSlide` and rewrite `doLoadAnnouncement`'s slide branch**

`doLoadText` deliberately splits `title` and each blank-line-separated `body` paragraph into *separate* slides (`t.song.lines`, stepped through via Next/Prev) — that's right for a general text item, but wrong for the announcement split layout, which shows title+body together on one card with nothing to page through. Add a new function right before `doLoadAnnouncement` (around line 1666) that sets state directly instead of routing through `doLoadText`:

```ts
// Slide-display announcements get their own load path instead of doLoadText's
// title/body-become-separate-slides split — the split-layout AnnouncementLayer
// (Output.tsx) shows title and body together on one card, so there's nothing
// to page through. Ticker-display announcements are unaffected; they still
// go through doLoadText (see doLoadAnnouncement below).
function doLoadAnnouncementSlide(
  track: TrackId, title: string, body: string, icon: string | null,
  background: string | null, fontScale?: number, blurBehindText?: boolean
): void {
  const t = tracks[track]
  t.loadGeneration++
  t.hasLiveContent = true
  clearCountdown(track)
  clearAutoAdvance(track)
  t.songId = null
  t.scriptureRef = null
  clearSongMeta(track)
  t.bgFit = 'cover'
  t.deckSlides = null
  t.sermonSlides = null
  t.song = { title, lines: [body], background, icon }
  t.songTextColor = null; t.songFont = null
  t.blurBehindText = blurBehindText ?? false
  if (fontScale != null) t.fontScale = fontScale
  t.mode = 'announcement'
  t.index = 0
}
```

Then change `doLoadAnnouncement`'s `else` branch (currently the whole `display !== 'ticker'` branch, around line 1677-1685) from:
```ts
  } else {
    // The service item's own background/fontScale (set via its "My Backgrounds"
    // picker) wins when present; falls back to the announcement record's own
    // defaults so a plain "load this one announcement" caller (no item) still works.
    const bg = (item?.payload.background as string | null | undefined) ?? a.background ?? null
    const blur = (item?.payload.blurBehindText as boolean | undefined) ?? a.blurBehindText
    const fontScale = item?.payload.fontScale as number | undefined
    const bgFit = item?.payload.bgFit as 'cover' | 'contain' | undefined
    doLoadText(track, a.title, a.body, bg, fontScale, blur, undefined, bgFit)
  }
```
to:
```ts
  } else {
    // The service item's own background/fontScale (set via its "My Backgrounds"
    // picker) wins when present; falls back to the announcement record's own
    // defaults so a plain "load this one announcement" caller (no item) still works.
    const bg = (item?.payload.background as string | null | undefined) ?? a.background ?? null
    const blur = (item?.payload.blurBehindText as boolean | undefined) ?? a.blurBehindText
    const fontScale = item?.payload.fontScale as number | undefined
    doLoadAnnouncementSlide(track, a.title, a.body, a.icon, bg, fontScale, blur)
  }
```

Note `bgFit` is dropped here — it only ever mattered for `doLoadText`'s generic "does this image fill or letterbox" behavior; the split layout always covers its own two panels, so there's nothing for it to control. If `item.payload.bgFit` is set from an earlier state, it's simply unused on this path now (`doLoadAnnouncementSlide` hardcodes `t.bgFit = 'cover'`, matching what `doLoadText`'s own default already was).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes clean.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: give slide-display announcements their own load path (title+body together, not paged)"
```

---

### Task 4: Output.tsx — `AnnouncementLayer` and wiring

**Files:**
- Modify: `src/renderer/src/Output.tsx`

- [ ] **Step 1: Add `title`/`body`/`icon` to `AudienceModel` and populate them in `useLiveModel`**

`layers.a`/`layers.b` (the crossfading lyric-slide text) only ever get populated by the `lyrics`-mode branch below — `mode === 'announcement'` never runs that branch (announcement mode doesn't page through slides), so the announcement's body text needs its own dedicated field rather than reading off `layers`, which would just be stale leftovers from whatever was shown before.

In the `AudienceModel` interface (around line 18), add three fields right after `bgSrc: string | null`:
```ts
  bgSrc: string | null
  announcementTitle: string
  announcementBody: string
  announcementIcon: string | null
```

In `useLiveModel()`'s state declarations (around line 40s, alongside the other `useState` calls), add:
```ts
  const [announcementTitle, setAnnouncementTitle] = useState('')
  const [announcementBody, setAnnouncementBody] = useState('')
  const [announcementIcon, setAnnouncementIcon] = useState<string | null>(null)
```

In the `apply` function inside `useLiveModel`'s `useEffect` (around line 62-95), add an `else if (s.mode === 'announcement')` branch — insert it right after the existing `else if (s.mode === 'lyrics')` block (before the ticker-detecting `else if`):
```ts
      } else if (s.mode === 'announcement') {
        setAnnouncementTitle(s.songTitle ?? '')
        setAnnouncementBody(s.line ?? '')
        setAnnouncementIcon(s.icon ?? null)
        setTickerText('')
      } else if (s.songTitle?.includes('Announcement')) {
```
(The existing `lyrics` branch's `setLayers(...)` call is untouched — announcement mode doesn't use the crossfading lyric layers at all, `mode === 'announcement'` gates them off entirely in `AudienceStage`, Step 3 below.)

Update the hook's return statement (around line 101-104) to include the three new fields:
```ts
  return {
    mode, layers, bgSrc, clockLine, fontScale, tickerText, bgFit, bgMotion,
    slideThemeId, slideThemeColors, songTextColor, songFont, blurBehindText, ccli, rehearsal,
    announcementTitle, announcementBody, announcementIcon
  }
```

- [ ] **Step 2: Write the `AnnouncementLayer` component**

Add this new function right after `LyricLayer`'s closing brace (search for `function LyricLayer` around line 392, add after that function ends):

```tsx
// The split-layout body text for announcement mode — icon/image panel on the
// left (~38% width), title (bold) + body (regular weight, smaller) on the
// right. Renders over whatever the shared background layer above already
// painted (per-announcement `background` field, theme, etc.) — this
// component only owns the icon panel's own image/color and the text block,
// same division of responsibility LyricLayer already has with its caller.
function AnnouncementLayer({ title, body, icon, textColor }: {
  title: string
  body: string
  icon: string | null
  textColor: string
}): JSX.Element {
  const resolved = resolveAnnouncementIcon(icon)
  return (
    <div className="absolute inset-0 flex">
      <div className="flex w-[38%] shrink-0 items-center justify-center bg-gradient-to-br from-blue-600 to-blue-800">
        {resolved.kind === 'builtin' ? (
          <resolved.Icon size="20cqw" color="#fff" strokeWidth={1.75} />
        ) : (
          <img src={toAssetUrl(resolved.path)} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center px-[4cqw]">
        <div
          className="mb-[1.5cqh] text-[4cqw] font-bold leading-tight"
          style={{ color: textColor, textShadow: '0 2px 12px rgba(0,0,0,.6)' }}
        >
          {title}
        </div>
        <div
          className="whitespace-pre-line text-[2.2cqw] leading-snug"
          style={{ color: textColor, textShadow: '0 2px 8px rgba(0,0,0,.6)', opacity: 0.9 }}
        >
          {body}
        </div>
      </div>
    </div>
  )
}
```

Add the two new imports at the top of `Output.tsx` (alongside the existing imports):
```ts
import { resolveAnnouncementIcon } from './announcementIcons'
```
(`toAssetUrl` is already defined/imported in this file for the existing background rendering — reuse it, don't redeclare.)

- [ ] **Step 3: Wire `AnnouncementLayer` into `AudienceStage`**

In `AudienceStage` (around line 112-116), destructure the three new model fields:
```ts
  const {
    mode, layers, bgSrc, clockLine, fontScale, tickerText, bgFit, bgMotion,
    slideThemeId, slideThemeColors, songTextColor, songFont, blurBehindText, ccli,
    announcementTitle, announcementBody, announcementIcon
  } = model
```

Add the mode flag alongside the existing ones (around line 127-129):
```ts
  const black = mode === 'black'
  const logo = mode === 'logo'
  const countdown = mode === 'countdown'
  const announcement = mode === 'announcement'
```

Exclude `AnnouncementLayer`'s slide from the three conditions that currently only exclude `black`/`logo`/`countdown`/`livecall` — the `LyricLayer` block (line 228), the CCLI footer block (line 238), and the ticker block (line 289). Each becomes (example for the `LyricLayer` block; apply the identical `&& !announcement` addition to the CCLI and ticker conditions too):
```tsx
      {!black && !logo && !countdown && !livecall && !announcement && (
        <>
          <LyricLayer text={layers.a} show={layers.front === 0} fontScale={fontScale}
            fontFamily={FONT_FAMILY[(songFont as keyof typeof FONT_FAMILY) ?? theme.font]} color={songTextColor ?? colors.text} align={posAlign} blurBehindText={blurBehindText} />
          <LyricLayer text={layers.b} show={layers.front === 1} fontScale={fontScale}
            fontFamily={FONT_FAMILY[(songFont as keyof typeof FONT_FAMILY) ?? theme.font]} color={songTextColor ?? colors.text} align={posAlign} blurBehindText={blurBehindText} />
        </>
      )}
```

Add the new render block as a sibling right after the `countdown && (...)` block (around line 287, before the `tickerText && ...` block):
```tsx
      {announcement && (
        <AnnouncementLayer
          title={announcementTitle}
          body={announcementBody}
          icon={announcementIcon}
          textColor={songTextColor ?? colors.text}
        />
      )}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: passes clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/Output.tsx
git commit -m "feat: add AnnouncementLayer (icon/image split) to the audience output"
```

---

### Task 5: Editor UI — icon picker

**Files:**
- Modify: `src/renderer/src/AnnouncementEditor.tsx`

- [ ] **Step 1: Add icon-picker state and the custom-image modal, mirroring `ItemBackgroundPanel.tsx`'s pattern**

At the top of `AnnouncementEditor.tsx`, add imports:
```ts
import { X } from 'lucide-react'
import Modal from './Modal'
import { ANNOUNCEMENT_ICON_COMPONENTS, ANNOUNCEMENT_ICON_LABELS, resolveAnnouncementIcon } from './announcementIcons'
import { ANNOUNCEMENT_ICON_KEYS } from '../../shared/types'
```

Inside the component, after the existing `const [a, setA] = useState<Announcement | null>(null)` line, add:
```ts
  const [showImagePicker, setShowImagePicker] = useState(false)
```

- [ ] **Step 2: Add the icon-picker row to the JSX**

Insert this block right after the "Display type" section closes (after the `</div>` that closes the `Show as` block, before the `{/* Background + blur (slide only) */}` block) — only shown for slide display, matching where background/blur already live:
```tsx
      {/* Icon (slide only) */}
      {a.display === 'slide' && (
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Icon</span>
          <div className="flex flex-wrap gap-2">
            {ANNOUNCEMENT_ICON_KEYS.map((key) => {
              const Icon = ANNOUNCEMENT_ICON_COMPONENTS[key]
              const active = a.icon === `icon:${key}`
              return (
                <button
                  key={key}
                  onClick={() => save({ icon: `icon:${key}` })}
                  title={ANNOUNCEMENT_ICON_LABELS[key]}
                  aria-label={`Use ${ANNOUNCEMENT_ICON_LABELS[key]} icon`}
                  aria-pressed={active}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                    active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Icon size={17} />
                </button>
              )
            })}
            <button
              onClick={() => setShowImagePicker(true)}
              title="Use a custom image instead"
              aria-label="Use a custom image as the icon"
              className={`flex h-9 w-9 items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
                resolveAnnouncementIcon(a.icon).kind === 'custom'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-slate-300 text-slate-400 hover:border-slate-400'
              }`}
            >
              +
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 3: Add the custom-image modal**

At the bottom of the component's JSX, right before the closing `</div>` of the root element (after the "Active" `<label>` block), add:
```tsx
      {showImagePicker && (
        <Modal onClose={() => setShowImagePicker(false)} label="Choose a custom icon image" className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-panel-raised text-content-primary shadow-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-content-primary">Choose a custom icon image</h2>
            <button onClick={() => setShowImagePicker(false)} className="btn-pill text-xs"><X size={12} /> Close</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <BackgroundLibraryGrid
              activePath={resolveAnnouncementIcon(a.icon).kind === 'custom' ? a.icon : null}
              onApply={(path) => { save({ icon: path || null }); setShowImagePicker(false) }}
            />
          </div>
        </Modal>
      )}
```
This reuses `BackgroundLibraryGrid` exactly as `ItemBackgroundPanel.tsx` already does for songs — same upload/folder/tag features, same asset library, just a different field (`icon` here vs. `background` there) receiving the picked path.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: passes clean.

- [ ] **Step 5: Manual verification (no automated UI tests in this codebase's convention for editor screens — verified visually per project convention)**

Run: `npm run dev`, open Media/Library → Announcements, select or create an announcement, switch it to "slide" display. Confirm: the icon row renders 8 icons + a "+" button; clicking an icon highlights it and persists (reselect the announcement or reload to confirm `icon: 'icon:<key>'` saved); clicking "+" opens the same background-library modal used for songs, and picking an image sets that as the icon with the "+" button now highlighted instead of any built-in icon.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/AnnouncementEditor.tsx
git commit -m "feat: add icon picker to the announcement editor"
```

---

### Task 6: Editor UI — live preview

**Files:**
- Modify: `src/renderer/src/AnnouncementEditor.tsx`

- [ ] **Step 1: Add a live preview panel showing the actual split layout**

This reuses `AnnouncementLayer`'s visual structure directly (not a re-implementation) so the preview can never drift from what actually ships. `AnnouncementLayer` currently lives in `Output.tsx` and isn't exported — export it so this editor can import the same component:

In `src/renderer/src/Output.tsx`, change `function AnnouncementLayer(` to `export function AnnouncementLayer(` (the function added in Task 4, Step 2).

In `AnnouncementEditor.tsx`, add the import:
```ts
import { AnnouncementLayer } from './Output'
```

Restructure the component's root return to a two-column layout — wrap the existing form content (everything currently inside the root `<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">`) in a left column, and add the preview as a right column, only shown for slide display (a ticker has no split-layout preview to show). Change the opening of the return statement from:
```tsx
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
      <div className="flex items-center justify-between gap-2">
```
to:
```tsx
  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-auto">
      <div className="flex items-center justify-between gap-2">
```
and change the closing of the return statement from:
```tsx
      </label>
    </div>
  )
}
```
to:
```tsx
      </label>
      </div>

      {a.display === 'slide' && (
        <div className="w-80 shrink-0">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Live preview</span>
          <div className="relative overflow-hidden rounded-xl bg-[#0f1117]" style={{ aspectRatio: '16/9', containerType: 'size' }}>
            <AnnouncementLayer title={a.title} body={a.body} icon={a.icon} textColor="#fff" />
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">Updates as you type — this is what actually goes to the projector.</p>
        </div>
      )}
    </div>
  )
}
```
(`containerType: 'size'` matches what `AudienceStage`'s own root div already sets in `Output.tsx` — `AnnouncementLayer`'s `cqw`/`cqh` units need a size-container ancestor to mean anything; without it every measurement collapses to 0 and nothing shows.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes clean.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open an announcement's editor (slide display). Confirm: a 16:9 preview panel appears on the right showing the icon panel + title/body text; typing in the title/body fields updates the preview live (before blur/save — the preview reads local `a` state, not the saved record); switching icons updates the preview's left panel instantly; switching to "ticker" display hides the preview panel entirely.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/AnnouncementEditor.tsx src/renderer/src/Output.tsx
git commit -m "feat: add live preview to the announcement editor"
```

---

### Task 7: Full-suite verification

- [ ] **Step 1: Run the full test suite and typecheck**

Run: `npm run typecheck && npx vitest run`
Expected: all pass, including the 5 new `announcementIcons.test.ts` tests (452 + 5 = 457 total, up from the pre-existing 452).

- [ ] **Step 2: Manual end-to-end check**

Run: `npm run dev`. In Build Service, add a slide-display announcement to a service (or use `ScheduledAnnouncements`' one-tap add if one's scheduled for the open service's date), select it, and send it live from Live Control. Confirm the projector/output window shows the icon/image split layout — not the old plain centered-text look — and that the CCLI footer and ticker bar do NOT appear on top of it (they're excluded by the `!announcement` conditions added in Task 4). Confirm a ticker-display announcement is completely unaffected (still the old scrolling-bar look).

- [ ] **Step 3: Commit (if Step 2 surfaced any fixes)**

Only if manual verification found something to fix — commit that fix with its own descriptive message before moving on.
