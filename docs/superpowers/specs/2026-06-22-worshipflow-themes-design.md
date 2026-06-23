# WorshipFlow — Slide Themes, Fonts & Motion Backgrounds (Stage 1)

**Date:** 2026-06-22
**Status:** Approved design, ready for implementation plan
**Stage:** 1 of 3 (see "Roadmap" at the end)

## Goal

Make WorshipFlow services look polished and varied without manual per-slide design.
A church operator picks one **theme** for a service and every slide on the projector
renders in that cohesive look — including code-generated **motion backgrounds** that
run live (no video files). This replaces today's single uniform projector style.

This is the foundation for the larger "PowerPoint-like, AI-assisted" builder. Stage 1
delivers the biggest visual payoff for the least work: themes + fonts + motion, applied
per service.

## What a theme is

A theme is a named, curated bundle of styling applied to projector slides:

```ts
interface SlideTheme {
  id: string                 // 'sanctuary', 'aurora', …
  name: string               // 'Sanctuary'
  kind: 'static' | 'motion'
  background: ThemeBackground
  font: FontKey              // 'modern' | 'classic' | 'bold' | 'elegant'
  textColor: string          // hex, e.g. '#ffffff' or '#1a1a1a' for light themes
  position: 'top' | 'middle' | 'bottom'
}

type ThemeBackground =
  | { type: 'solid'; color: string }
  | { type: 'gradient'; css: string }                  // a CSS gradient string
  | { type: 'motion'; effect: 'aurora' | 'bokeh' | 'rays' | 'drift'; colors: string[] }
```

Themes are defined in code as a constant list (`src/shared/themes.ts` or similar), shared
by main and renderer. Curated, not user-created (user-created themes are out of scope for
Stage 1).

## Starter theme set

Static:
- **Sanctuary** — deep navy gradient, Classic serif, white text, middle
- **Midnight** — near-black solid with subtle accent, Bold font, white text, middle
- **Minimal** — charcoal solid, Modern sans, white text, middle
- **Warm** — amber/brown gradient, Classic serif, cream text, middle
- **Garden** — deep green gradient, Modern sans, white text, middle
- **Pure** — clean light background, Modern sans, dark text, middle

Motion (code-generated, CSS/animation, no files):
- **Aurora** — drifting multi-color gradient
- **Bokeh lights** — soft floating blurred circles over a dark base
- **Light rays** — slow diagonal light sweeps over a dark base
- **Soft drift** — slowly shifting radial gradient

Exact colors/timing finalized during implementation; all motion effects mirror the
approved mockup styles.

## Fonts

Bundle ~4 open-license (SIL OFL) fonts locally so everything works offline. Candidates:
- **Modern** — clean sans (e.g. Inter or Poppins)
- **Classic** — elegant serif (e.g. Playfair Display or Lora)
- **Bold** — strong display (e.g. Oswald or Montserrat)
- **Elegant** — refined accent face

Fonts ship as files in `resources/fonts/` and are registered via `@font-face` in the
renderer CSS. No network fetch. A `FontKey → font-family` map lives alongside the themes.

## Data model

- Add a `theme` column (TEXT, theme id, nullable) to the `service` table (migration in
  `db.ts`, same pattern as existing incremental migrations).
- Add a `theme_colors` column (TEXT JSON, nullable) to the `service` table for the
  operator's color overrides: `{ primary?, secondary?, text? }` (all hex, all optional).
- `getService`/`listServices` return both; a `setServiceTheme(serviceId, themeId, colors)`
  DB function persists them.
- Default when null: a sensible built-in default theme (e.g. `'sanctuary'`) with the
  theme's own default colors.

## Theme color customization

Themes are recolorable presets, not fixed pictures. Each `SlideTheme` ships **default
colors**, but the operator can override them per service:

- **`primary`** — the main background color. For static themes it drives the solid/gradient;
  for motion themes it's the dominant color in the effect's palette.
- **`secondary`** — the second color (gradient end / secondary motion accent). Optional;
  themes that are single-color ignore it.
- **`text`** — lyric text color.

Rendering derives the actual background from `theme defaults` merged with any overrides:
gradients are regenerated from `primary`/`secondary`; motion `colors[]` are built from
`primary`/`secondary`. So the *style* (gradient shape, motion behavior) stays constant
while the *colors* follow the operator's choice.

UI: after the operator picks a theme, the picker shows up to three color swatches
(primary, secondary, text) they can change with a color picker. Changes preview live and
persist on the service. A "reset to theme default" affordance restores the curated colors.

## Theme selection (UI)

- A **theme picker** in the service builder (Service tab): a row/grid of theme swatches
  (each showing its background + name), the active one highlighted. Clicking sets the
  service's theme via IPC and persists it.
- Motion swatches animate in the picker so the operator sees the motion before choosing.

## Live rendering

The projector (`Output.tsx`) becomes theme-aware:

- **Main process** tracks the active service's theme and color overrides. When
  `setActiveService` runs, load that service's theme id and `theme_colors` into
  `liveSlideTheme` / `liveSlideThemeColors` vars. `renderState()` sends the theme **id**
  plus the color overrides; the renderer resolves the id against the shared theme list and
  merges the overrides over the theme defaults (keeps the payload small, no duplicated
  theme definitions across the IPC boundary).
- `LiveState` gains `slideTheme?: string` (theme id) and
  `slideThemeColors?: { primary?: string; secondary?: string; text?: string }`. The field
  is named `slideTheme` specifically to avoid collision with the existing unrelated
  `LiveState.theme` field (the operator-UI color theme, not the projector slide theme).
- **Output** resolves `slideTheme` to a `SlideTheme` and renders:
  - **Background layer**: motion effects as animated CSS layers (keyframes in `main.css`),
    static as solid/gradient. The existing animated gradient fallback is replaced by the
    theme background.
  - **Lyric text**: applies the theme's `font` (font-family), `textColor`, and `position`
    (flex alignment top/middle/bottom). The existing `fontScale` size control still applies.
- **Precedence**: if the live song/item has its own `background` (video/image) set, that
  wins and shows instead of the theme background. The theme still controls font/color/
  position. This preserves all existing per-song backgrounds.

## Scope

In scope (Stage 1):
- Theme model + starter themes + bundled fonts
- Per-service theme selection + persistence
- Theme-aware rendering on the **main projector (Output)** only
- Motion backgrounds (code-generated)

Out of scope (later stages):
- Per-slide theme overrides and the slide-deck builder UI → **Stage 2**
- "Design it for me" auto-pick → **Stage 3**
- Theming the stage/confidence monitor and OBS overlay → later
- User-created/custom themes → later
- Motion *video* background sourcing (already supported via existing image/video bg)

## Testing / verification

- Typecheck clean (`npm run typecheck`).
- App boots; DB migration adds `service.theme` without breaking existing data.
- Manual: pick each theme on a service, load a song live, confirm the projector shows the
  correct font/color/position and the motion backgrounds animate smoothly.
- Confirm precedence: a song with its own video background still shows that video.

## Roadmap (context)

1. **Stage 1 (this spec)** — themes + fonts + motion, per service.
2. **Stage 2** — slide-deck builder UI (PowerPoint-style: thumbnails, add buttons,
   reorder, click-to-edit) + per-slide theme/style overrides.
3. **Stage 3** — "Design it for me" smart auto-pick that assigns tasteful themes/variations
   to slides and whole services.
