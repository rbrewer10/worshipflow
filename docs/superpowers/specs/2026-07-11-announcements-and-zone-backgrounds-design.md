# Announcements Library + Zone Back-Screen Backgrounds — Design

Date: 2026-07-11
Status: Approved (design), pending implementation plan

This spec covers two independent features brainstormed together:

- **Feature A** — Zone back-screens (Zones 1 & 2) render the logo over the live background.
- **Feature B** — A reusable, scheduled Announcements library with one-tap add into a service.

They share no code and can be implemented/shipped independently.

---

## Feature A — Zone back-screens: logo over live background

### Problem
The zone multiview shows Zones 1 & 2 ("Back Left" / "Back Right") as a flat dark screen with the logo during a song. This is not a bug — those zones default to `'logo'` mode for songs (`ZONE_ROUTING_DEFAULTS`), and `'logo'` mode intentionally never paints the song/theme background. Zone 3 ("Lyrics TVs") already renders the full live background (video / image / animated theme gradient).

The user wants the back screens to keep the branded logo but display it **over the same live background the congregation sees**, so they feel alive instead of dark.

### Approach
The zone rendering path is separate from the React audience output: standalone HTML pages ([`src/main/zoneHtml.ts`](../../../src/main/zoneHtml.ts)) fed `ZoneState` over WebSocket, computed by `computeZoneStates()` in [`src/main/index.ts`](../../../src/main/index.ts). We extend the existing path — we do NOT reuse the React `AudienceStage`.

Two contained edits:

1. **`computeZoneStates()` (`src/main/index.ts`)** — in the `'logo'` branch, additionally populate the live background fields (`background` path + theme colors) from the current song/theme, exactly as the `'lyrics'`/`'text'` branches already do. Today the `'logo'` branch only sets `imagePath = logoPath` / a logo background.

2. **`FLEX_SCRIPT` (`src/main/zoneHtml.ts`, the Zone 1 & 2 renderer)** — draw the background layer (video / image / animated theme gradient) behind the logo when present. This mirrors the background-drawing logic already proven in `LYRICS_SCRIPT` (Zone 3).

### Scope / non-goals
- No change to `ZONE_ROUTING_DEFAULTS` — zones stay in `'logo'` mode; the mode simply gains a background.
- No new data model, no new IPC.
- When there is no live background (e.g. no song active), behavior is unchanged (logo on its existing backdrop).

### Success criteria
- With a song live that has a video/image background, Zones 1 & 2 in the multiview (and on the physical screens) show the logo composited over that moving background.
- With a song live that uses only a theme (no file background), Zones 1 & 2 show the logo over the animated theme gradient.
- Black mode still fully blacks out.

---

## Feature B — Announcements library + scheduling

### Purpose
Some announcements run weekly ("Nursery is open") or for a bounded stretch ("VBS registration open — next 3 weeks"). Today an operator retypes them each week as `text` or `ticker` items. This feature gives announcements their own reusable **library** with **real scheduling**, so they are built once, auto-surface for the right service date, and auto-expire when their window passes — mirroring how the Songs library already works.

### B1. Data model — new `announcement` table
Mirrors the `song` library table pattern in [`src/main/db.ts`](../../../src/main/db.ts) (SQL.js, inline `CREATE TABLE IF NOT EXISTS` migration).

| Field | Type | Purpose |
|---|---|---|
| `id` | INTEGER PK | — |
| `title` | TEXT NOT NULL | Short label ("Nursery Open") — library list + slide heading |
| `body` | TEXT NOT NULL | The message text |
| `display` | TEXT NOT NULL | `'slide'` or `'ticker'` — picked per announcement |
| `background` | TEXT NULL | Optional (slide only); same value shape songs use (`wf-asset://` path or `theme:<id>`). Null = use service theme |
| `frequency` | TEXT NOT NULL | `'once'` or `'recurring'` |
| `start_date` | TEXT NULL | ISO `YYYY-MM-DD`. For `once`, the single date. For `recurring`, window start (null = no lower bound) |
| `end_date` | TEXT NULL | ISO `YYYY-MM-DD`. `recurring` window end; null = open-ended. Past this date → auto-expired |
| `active` | INTEGER NOT NULL (0/1) | Manual on/off to pause without deleting |
| `created_at` | INTEGER NOT NULL | Timestamp |

Notes:
- A rotating pre-service loop is achieved by adding several `slide` announcements — not a separate stored type (YAGNI).
- `display: 'ticker'` ignores `background`.

### B2. Scheduling / matching logic
For a service with `service_date = D`, an announcement is **"scheduled for D"** when `active = 1` AND:
- `frequency = 'once'`: `start_date == D`.
- `frequency = 'recurring'`: `(start_date is null OR start_date <= D)` AND `(end_date is null OR D <= end_date)`.

An announcement is **"expired"** (shown greyed in the library) when `frequency` has a defined `end_date` in the past, or a `once` date in the past. Expired announcements never appear in suggestions.

Matching is by service date only (services are already per-date); no day-of-week logic is needed.

### B3. Shared types ([`src/shared/types.ts`](../../../src/shared/types.ts))
```ts
export type AnnouncementDisplay = 'slide' | 'ticker'
export type AnnouncementFrequency = 'once' | 'recurring'

export interface AnnouncementSummary {
  id: number
  title: string
  display: AnnouncementDisplay
  frequency: AnnouncementFrequency
  startDate: string | null
  endDate: string | null
  active: boolean
  expired: boolean          // derived server-side for list rendering
}

export interface Announcement extends AnnouncementSummary {
  body: string
  background: string | null
}

export interface AnnouncementInput {
  title: string
  body: string
  display: AnnouncementDisplay
  background?: string | null
  frequency: AnnouncementFrequency
  startDate?: string | null
  endDate?: string | null
  active?: boolean
}
```

### B4. Main-process DB functions & IPC
Mirror the songs handlers in `src/main/index.ts` / `src/main/db.ts`:
- `listAnnouncements(search?)` → `AnnouncementSummary[]` (computes `expired`)
- `getAnnouncement(id)` → `Announcement | null`
- `createAnnouncement(input)` → `number`
- `updateAnnouncement(id, input)` → `void`
- `deleteAnnouncement(id)` → `void`
- `listScheduledAnnouncements(serviceDate)` → `AnnouncementSummary[]` (applies B2 matching)

IPC channels: `wf:announcements:list|get|create|update|delete|scheduled`, exposed on `window.wf` in [`src/preload/index.ts`](../../../src/preload/index.ts) as `announcementsList/Get/Create/Update/Delete/Scheduled`.

### B5. Announcements tab (new Prepare view)
- New `View` value `'announcements'` in [`src/renderer/src/AppShell.tsx`](../../../src/renderer/src/AppShell.tsx) + a Sidebar entry.
- New `AnnouncementsLibrary.tsx` — twin of `SongLibrary.tsx`: left = searchable list (active vs **expired** clearly marked); right = editor.
- New `AnnouncementEditor.tsx` — fields: title, body, display (slide/ticker toggle), background picker (reuse the existing item background picker component; slide only), frequency (once/recurring), start/end date pickers, active toggle. Shows a plain-language summary line ("Every service from Jul 13 — no end date").

### B6. Adding announcements to a service (reference model)
**Architecture decision (approved): reference, like songs.** A new `ServiceItemType` `'announcement'` whose `ref_id` points at the library `announcement`. Live rendering resolves the ref and delegates to the existing slide/ticker renderers based on the announcement's `display`. Benefits: exact "already added / no duplicate" tracking, and library edits propagate to built services.

Touch points (all parallel to how `'song'` items already resolve `ref_id`):
- `ServiceItemType` union gains `'announcement'` ([`src/shared/types.ts`](../../../src/shared/types.ts)).
- Zone routing: because `announcement` has two possible displays, resolve routing **at add time** — `addAnnouncement` writes the new item's `zoneRouting` explicitly from the referenced announcement's `display` (`slide` → `{1:'text',2:'text',3:'text',4:'stage'}`, `ticker` → the ticker defaults). `ZONE_ROUTING_DEFAULTS['announcement']` is set to the `text` defaults purely as a fallback for items lacking an explicit routing.
- Add-to-service resolution in `renderState()` and `computeZoneStates()` (`src/main/index.ts`): when the live item is `announcement`, load the referenced announcement and produce the same live payload a `text` slide or `ticker` produces today (title/body/background, or scrolling text).
- `ServiceDeck` / add menu: an `addAnnouncement(announcementId)` path (like `addSong`).
- `ItemEditor` dispatch: an `announcement` item shows a light read-only summary + an "Edit in library" link (the content is owned by the library, not per-item), plus the existing per-item style/zone overrides.

**Suggestions panel ("Scheduled for this Sunday"):** In `ServiceBuilder` / `ServiceEditor`, read the open service's `service_date`, call `announcementsScheduled(date)`, and render a panel listing matches. Each row: **Add** (→ `addAnnouncement`), turning to **Added ✓** when an `announcement` item with that `ref_id` already exists in the service; plus **Add all**. Also allow manually adding any library announcement (not just scheduled) via the normal add flow.

### B7. Live rendering
No new renderer. An `announcement` service item resolves to:
- `display:'slide'` → the existing text-slide live payload (reuses `AudienceStage` text/background rendering and the zone `text` path).
- `display:'ticker'` → the existing ticker payload/rendering.

### Scope / non-goals (Feature B)
- No auto-insertion into services (suggestions are one-tap; approved).
- No recurrence beyond `once` / `recurring`-window (no "every 2nd Sunday", etc.).
- No rich text / images inside the body beyond what `text` slides already support.
- No per-service snapshotting/divergence — announcement content is owned by the library (reference model).

### Success criteria (Feature B)
- Can create, edit, delete announcements in a dedicated Prepare tab; expired ones are visibly marked and excluded from suggestions.
- Opening/building a service surfaces the announcements scheduled for its date; one-tap add inserts them; duplicates are prevented.
- An added `slide` announcement shows as a full slide (with its background) on the audience output and zones; a `ticker` announcement scrolls as today.
- Editing an announcement in the library updates it wherever it's referenced in built services.

---

## Testing
- **Feature A**: manual verification in the multiview with (a) a song with a video background, (b) a song with an image background, (c) a theme-only song, (d) black mode. (Zone rendering is imperative DOM in an HTML string — not unit-tested today; follow the existing manual pattern.)
- **Feature B**: unit tests (vitest) for the pure scheduling/matching logic (`listScheduledAnnouncements` date matching + `expired` derivation) and for any date-summary formatting helper. DB CRUD + IPC follow existing untested patterns; verify manually.

## Rollout
Independent features. Feature A is a small patch; Feature B is a larger addition. Either can ship first. Version bump + installer per existing `npm run dist` flow after verification.
