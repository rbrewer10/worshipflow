# Blur Behind Text + Announcement Background Library — Design

Date: 2026-07-25
Status: Approved (design), pending implementation plan

## Problem

Live text — song lyrics, scripture verses, a countdown clock, a text/welcome slide, an announcement — is drawn directly over a background image with only a text-shadow for readability. Busy photos can make that text hard to read, and there's no way to darken/soften just the area behind the words without blurring the whole photo.

Separately, Announcements have their own bare-bones background picker (`src/renderer/src/AnnouncementEditor.tsx`) — a single "Choose image or video…" file-dialog button — while Text/Scripture/Countdown/Welcome/Song already share a proper library grid (search by mood, thumbnails, an Open Folder shortcut) via `BackgroundLibraryGrid`. Announcements were left out of that upgrade.

## Solution overview (approved)

1. **Give every item type that shows live text a "Blur behind text" toggle** (off by default): Text, Scripture, Countdown, Welcome, Song, and Announcement (slide-display only). When on, a translucent blurred band stretches full-width behind wherever the text/lyrics/countdown digits currently render — the photo stays sharp everywhere else. One fixed blur strength/tint; no adjustable slider, no service-wide default.
2. **Give Announcements the shared background library too**: replace `AnnouncementEditor.tsx`'s single file-picker with `BackgroundLibraryGrid` (My Backgrounds only — announcements have no theme/gradient concept, so no "Presets" tab).

Explicitly excluded (see Non-goals): Sermon, Image, and Ticker items, and ticker-display Announcements.

## Why Sermon / Image / Ticker are excluded

Checked what each actually renders live before scoping:

- **Sermon**: shows only the church logo when live (`sendIntent(track, 'logo')`) — no text is drawn on the main output at all today. The "sermon name on a Pi zone" idea discussed earlier in this project was never actually wired up (zone `'text'` mode reads from `t.song`, which a live sermon never populates) — that gap is real but is its own separate feature, not part of this one.
- **Image**: the picture *is* the entire slide — `doLoadMedia` sets an empty lyric line, so no text is ever drawn over it.
- **Ticker** (and ticker-display Announcements): renders in its own opaque amber banner pinned to the bottom (`border-t-4 border-amber-500 bg-gradient-to-r from-amber-900/85 ...` in `Output.tsx`), structurally separate from the lyrics/background overlay. A blur band styled like the lyrics treatment wouldn't integrate with it.

Slide-display Announcements, by contrast, already render through the exact same path as Text items (`doLoadAnnouncement` calls `doLoadText` when `display === 'slide'`), so they're a clean, free fit.

## Visual spec

- **Shape**: a full-width band (edge-to-edge), height auto-fitting the text content plus vertical padding — like a broadcast lower-third, not a tight pill around each word.
- **Position**: sits wherever the text is already positioned (the same top/center/bottom alignment the theme/text layer already uses) — the band follows the text, not a fixed screen location.
- **Effect**: `backdrop-filter: blur(10px)` (`-webkit-backdrop-filter` too, for the Pi's Chromium renderer) over a semi-opaque dark tint (~`rgba(20,20,30,.3)`), fixed — not adjustable per item.
- **Default**: off for every item unless explicitly turned on.

## Data model — three storage locations, mirroring how `background` already works for each

- **Text, Scripture, Countdown, Welcome**: new `blurBehindText?: boolean` field on the item's `payload` (same JSON blob `background`/`fontScale` already live on).
- **Song**: new `blurBehindText` column on the `song` table, alongside the existing `textColor`/`font`/`bgMotion`/`background` fields — a song-level setting, not a per-service-instance one (matches how the rest of a song's live appearance already works).
- **Announcement**: new `blurBehindText` column on the `announcement` table, alongside `background` — read only when `display === 'slide'`.

## Backend changes (`src/main/index.ts`)

- **`LiveTrackState`** gains a `blurBehindText: boolean` field (default `false`), parallel to the existing `slideTheme`/`slideThemeColors`/`songTextColor`/`songFont` fields.
- **`doLoadText`, `doLoadScripture`, `doLoadCountdown`** each gain an optional `blurBehindText?: boolean` parameter (same pattern as the `background` parameter added in the prior Custom Backgrounds work), setting `t.blurBehindText = blurBehindText ?? false`.
- **`doLoadSong`** sets `t.blurBehindText = full.blurBehindText ?? false`, alongside where it already sets `t.songTextColor`/`t.songFont` from the song record.
- **`doLoadAnnouncement`** passes the announcement's `blurBehindText` through to `doLoadText` for the `slide` branch; the `ticker` branch is unaffected (doesn't support it).
- **`doLoadMedia`** (Image) and the ticker-display announcement path explicitly set `t.blurBehindText = false` — matching the existing defensive-reset convention already used for `songTextColor`/`songFont` on every non-song loader, so a blurred item doesn't leave a stale `true` behind when the track advances to an unsupported type.
- **`handleTabletLoadItem`** passes each item's `payload.blurBehindText` through to the relevant `doLoad*` call, same as it already does for `payload.background`/`payload.fontScale`.
- **IPC handlers** (`wf:live:loadText`, `wf:live:loadScripture`, `wf:live:loadCountdown`) gain the same optional parameter and pass it through, mirroring the existing `background` parameter.
- **`renderState()`** copies `t.blurBehindText` onto the broadcast `LiveState.blurBehindText`, alongside where it already copies `slideTheme`/`songTextColor`/etc.
- **`computeZoneStates()`**: the `lyrics`/`text` branch and the `countdown` branch each also resolve `base.blurBehindText = live.blurBehindText` onto `ZoneState`, the same place they already resolve `base.background`/`base.themeColors`.

## Rendering changes — the same band on three surfaces

- **`src/renderer/src/Output.tsx`**: `AudienceModel` gains `blurBehindText: boolean`, threaded through `useLiveModel()` from `LiveState.blurBehindText`. `LyricLayer` gains a `blurBehindText` prop: when true, the `<span>` is wrapped in a full-width `<div>` (blurred/tinted band) instead of being a bare child of the flex container — the outer container's existing `alignItems`/`justify-content` positioning is unchanged, so the band naturally lands wherever the text already sits. The countdown clock block (lines ~213–225) gets the same band treatment, gated on the same `blurBehindText` model field, when a Countdown/Welcome item has it enabled.
- **`src/main/zoneHtml.ts`**: the Congregation Lyrics template (`#line`) and the Flexible Display template (`#content`) each gain a new absolutely-positioned band element, toggled via a new `state.blurBehindText` field (populated from `ZoneState.blurBehindText`, same plumbing as the existing `state.bgOverlay`). Stage Monitor (Zone 4) is unaffected — it has no image/background layer to blur against.
- **`src/renderer/src/ServiceSlidePreview.tsx`**: reads `payload.blurBehindText` (Text/Scripture/Countdown/Welcome) or `songFull?.blurBehindText` (Song) the same way it already resolves `bgFile`, and renders the same band around the preview's text content so what you see while building matches what goes live. (Announcement items currently have no preview card in Build Service at all — that's a pre-existing gap, unaffected by this change.)

## UI changes

- **`src/renderer/src/ItemBackgroundPanel.tsx`**: a toggle switch ("Blur behind text") above the My Backgrounds/Presets tab strip, for the same four types already gated by `FILE_BACKGROUND_TYPES` (Text/Scripture/Countdown/Welcome). Saves via `savePayload({ ...payload, blurBehindText: next })`.
- **`src/renderer/src/editor/BackgroundPanel.tsx`** (Song editor): an equivalent toggle switch near the top of the panel, saved via whatever existing per-song setting mechanism already persists `textColor`/`font`/`bgMotion`.
- **`src/renderer/src/AnnouncementEditor.tsx`**: two changes together —
  - The existing "Background (optional)" section's single `pickBg()`/`dialogOpenFile()` button is replaced with `<BackgroundLibraryGrid activePath={a.background} onApply={(path) => save({ background: path || null })} />`, shown only when `display === 'slide'` (unchanged gating).
  - A "Blur behind text" toggle is added next to it, same visibility gating, saved via the existing `save()` helper (`save({ blurBehindText: next })`).

## Error handling

- No new failure modes beyond what the prior Custom Backgrounds work already handles (missing file on disk → layer stays hidden/transparent, no crash). `backdrop-filter` is a pure CSS effect with no data dependency — if a browser/engine doesn't support it, the band simply shows its flat tint color with no blur (graceful degradation, not a crash).
- The defensive `blurBehindText = false` resets on unsupported loaders (Image, ticker-display) prevent stale state exactly like the existing `songTextColor`/`songFont` resets do.

## Non-goals

- Sermon, Image, and Ticker items, and ticker-display Announcements — none of them draw text over a background in a way this band could meaningfully attach to (see "Why excluded" above). Building a real "sermon name on a Pi zone" text path is a separate, future feature.
- No adjustable blur strength/opacity — one fixed look.
- No service-wide default toggle — per-item/per-song/per-announcement only.
- No "Presets" (gradient) tab for Announcements — they have no theme/color-override concept today, and adding one is out of scope here; only the My Backgrounds library is added.
- No change to how backgrounds themselves are picked for Text/Scripture/Countdown/Welcome/Song (that shipped in the prior Custom Backgrounds work) — this only adds the blur toggle alongside it.

## Testing

Manual, matching this codebase's established convention (no existing test coverage for `Output.tsx`/`zoneHtml.ts`/the editor panels to extend):

- For each of Text, Scripture, Countdown, Welcome, Song, and a slide-display Announcement: turn on "Blur behind text," confirm the Build Service preview shows the band, go live and confirm the main projector shows it, confirm a Pi zone assigned to that track/zone shows it too.
- Confirm the band's position tracks the text (e.g. a theme with `position: 'top'` puts the band at the top, not the center).
- Confirm a multi-line lyric/scripture passage grows the band to fit all visible lines, not just one.
- Confirm turning the toggle off removes the band on all three surfaces.
- Confirm switching from a blurred item to an Image or ticker-display item/Ticker/Sermon does not leave a stale band behind.
- Confirm the new Announcement background library (My Backgrounds grid) round-trips the same way the existing Text/Scripture/Countdown/Welcome one does — pick an image, confirm it saves and shows on the live slide.

## Success criteria

- Turning on "Blur behind text" on any of the six supported types shows a blurred, tinted band directly behind the live text — on the projector, on assigned Pi zones, and in the Build Service preview — without blurring the rest of the photo.
- Announcements pick backgrounds from the same shared library (with search/tags/Open Folder) as every other type, instead of a bare file-browser dialog.
