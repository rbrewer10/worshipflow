# Announcements Visual Redesign — Design

Date: 2026-08-19
Status: Approved (design), pending implementation plan

Supersedes the plainness (not the scheduling/data model) of the announcements feature shipped in [`2026-07-11-announcements-and-zone-backgrounds-design.md`](2026-07-11-announcements-and-zone-backgrounds-design.md), Feature B.

## Problem

Announcements currently look indistinguishable from a plain text slide or a song lyric on the audience screen. `doLoadAnnouncement` (`src/main/index.ts:1666`) routes slide-display announcements straight through `doLoadText`, the same path used for ad-hoc text items — title and body are concatenated into one line array and rendered by `LyricLayer` (`src/renderer/src/Output.tsx`) as a single centered, uniformly-weighted text block over a full-bleed background. No visual distinction, no imagery, nothing that reads as "this is an announcement" at a glance.

Brainstormed with the app's owner 2026-08-19. Confirmed scope: both the live on-screen look AND the creation/editing UI need work. Ticker-display announcements are confirmed out of scope — rarely used, no changes.

## Chosen direction: Image/Icon Split layout

Of three mocked-up directions (title banner, image/icon split, floating card), the owner picked **image/icon split**: a dedicated visual panel on one side (roughly 38% width), title + body text on the other. Title bold and larger; body smaller, regular weight — the two are no longer visually identical.

Icon source, decided: **built-in icon by default, with an optional custom-image override per announcement** — not upload-only (too much per-announcement effort) and not built-in-only (no way to make a specific announcement stand out with a real photo).

## Data model

One new field on the announcement record, following the exact convention `SongFull.background` already uses for motion themes vs. real files (a `theme:<id>`-style prefix distinguishing a built-in choice from a real path):

```ts
// src/shared/types.ts — Announcement / AnnouncementInput
icon: string | null
// null            -> no icon chosen yet; render falls back to a generic default (see below)
// 'icon:<key>'     -> one of the built-in set (see below)
// anything else    -> a real file path, a custom image (from the same background library
//                      ItemBackgroundPanel/BackgroundLibraryGrid already provide for songs)
```

No new table. No separate `category` field — the icon *is* the categorization; adding a parallel category concept the icon must stay in sync with is unnecessary duplication for a single-select field like this.

Schema: one self-applying `ALTER TABLE announcement ADD COLUMN icon TEXT` in `db.ts`'s existing migration list (same pattern every other schema change in this codebase uses — no manual step).

## Built-in icon set

Eight, covering what the owner confirmed matches actual church announcements — general/default, choir/worship events, dated events, fellowship/small groups, meals, kids/VBS/nursery, outreach/missions/giving, Bible study/classes. Rendered with the app's existing `lucide-react` icon library (not emoji — emoji were only used as brainstorming-mockup shorthand), matching how every other icon in the app is sourced:

| Key | lucide icon | Use |
|---|---|---|
| `megaphone` (default) | `Megaphone` | General/uncategorized |
| `music` | `Music` | Choir/worship events |
| `calendar` | `CalendarDays` | Dated events |
| `people` | `Users` | Fellowship/small groups |
| `meal` | `Utensils` | Potlucks/meals |
| `kids` | `Baby` | Kids/VBS/nursery |
| `outreach` | `Heart` | Outreach/missions/giving |
| `study` | `BookOpen` | Bible study/classes |

An announcement with `icon: null` (nothing chosen) renders with `megaphone`, so nothing looks broken for existing/unset announcements after this ships.

## Editor UX (`AnnouncementEditor.tsx`)

Two changes to the existing single-column editor (title input, body textarea, display/schedule/active controls all stay exactly as they are today — no complaints about those, this is scoped to the visual side):

1. **Icon picker row** — the 8 built-in icons as a row of small square buttons (same interaction idiom `ZoneRolePalette` already uses elsewhere in this app: click to select, one active at a time), plus a final "+" button that opens the *same* `BackgroundLibraryGrid` modal picker built earlier this session for songs — picking an image there sets `icon` to that file path instead of a `icon:<key>`.
2. **Live preview panel** — alongside the form, a real-time render of the actual split-layout component (not an approximation) that updates as title/body/icon change. Confirmed in mockup review: this is the same "what you edit is what ships" principle already used for song backgrounds elsewhere in Build Service.

## Live render implementation

- Add `'announcement'` to the `Mode` union (`src/shared/types.ts:6`, currently `'lyrics' | 'black' | 'logo' | 'countdown' | 'livecall'`) — same pattern `'countdown'` already established for a mode that needs its own distinct layer rather than reusing `LyricLayer`.
- `LiveState` gains the fields an announcement layer needs: icon (built-in key or path), title, body — parallel to how the existing lyric fields are carried.
- `doLoadAnnouncement` (`src/main/index.ts`) stops calling `doLoadText` for `display: 'slide'` announcements; sets the new mode + fields directly instead. The `display: 'ticker'` branch is untouched (out of scope, confirmed above).
- New `AnnouncementLayer` component in `Output.tsx`, alongside the existing `LyricLayer`/`CountdownLayer`-style layers: two panels. The **icon panel** (~38% width) shows the built-in icon on a solid brand-colored tile, or — when `icon` resolves to a custom image path instead of a built-in key — that image, filling the panel. The **text panel** (title + body) sits over the announcement's existing `background`/`blurBehindText` fields exactly as today (full-bleed image/video/theme, unchanged mechanism) — `background` and `icon` are two independent, optional images an announcement can have at once: one behind the whole card, one specific to the icon panel.

## Non-goals (unchanged from the 2026-07-11 spec, reconfirmed)

- No rich text in the body (still plain text, no bold/bullets/links).
- No multi-slide announcements.
- No day-of-week recurrence beyond the existing once/date-range model.
- No changes to ticker-display announcements.
