# Visual redesign — dark theme, design tokens, motion — Design

**Date:** 2026-08-11
**App:** WorshipFlow Pro (Electron + React + Tailwind v3)
**Status:** Design approved, ready for implementation plan

## Context

WorshipFlow is functionally solid but visually reads as a utility, not a
premium product — a light `slate-100`/white palette, ad-hoc Tailwind
utility classes typed per-component (no shared design tokens, `tailwind.config.js`
has zero theme customization), and no motion/transition system beyond
whatever Tailwind's default CSS transitions give for free.

Five competing church-presentation apps were researched specifically for
visual design and interaction flow (not features): **ProPresenter**,
**EasyWorship**, **MediaShout**, **FreeShow**, **Proclaim** (Faithlife). The
premium-feeling ones (ProPresenter, FreeShow, Proclaim) share three traits:
dark-first theming, exactly one disciplined accent color used consistently
for state (ProPresenter: green = live, everywhere, full stop), and a real
motion/transition layer. The apps that get called dated/cheap (EasyWorship,
MediaShout) share the opposite: light/generic theming, no color-coded state
(everything relies on reading a text label), dead whitespace on widescreen
layouts, undocumented generic icon sets, and zero motion polish.

WorshipFlow already has a sparse, unfinished attempt at an emerald accent
(one `text-emerald-800` usage in `HomeView.tsx`) — not a real system, but a
signal the brand color is already emerald. This design builds on that
rather than introducing a new brand color.

## Decisions locked with the user

- **Visual direction: "Broadcast Console"** — near-black background +
  emerald accent, chosen over two alternatives (a charcoal-navy/mint "modern
  SaaS" direction, and a violet-black/magenta "single-accent bold" direction
  modeled on FreeShow). Chosen specifically because it keeps the existing
  brand color and matches the strongest convention found across the
  research (a single accent = live state).
- **Scope: whole app, one pass.** Every screen gets the new system in this
  effort, not a piecemeal per-screen rollout over multiple separate cycles.
- **Theme: dark-only.** No light-mode toggle. Simpler to build well (one
  palette to design and test, not two), and matches every "premium"
  competitor — none of them treat light/dark as equally first-class.
- **Motion: full treatment.** Not just color-transition polish — includes a
  slide-advance transition, an animated "going live" confirmation, and
  panel/tab-switch motion. Explicitly accepted as more build time and more
  surface area for bugs in a tool depended on for live services, in
  exchange for actually matching what made ProPresenter's transition system
  stand out in the research.
- **No deadline.** Take the time to build and test this properly before it
  becomes what the operator runs a real service on — no rushed rollout
  before a specific Sunday.

## Design

### 1. Design tokens

New `tailwind.config.js` theme extension (CSS-variable-backed, so runtime
theming stays possible even though only one theme ships now):

| Token | Value | Used for |
|---|---|---|
| `bg-app` | `#0a0d10` | Window/app background |
| `bg-panel` | `#12171b` | Cards, panels, sidebars |
| `bg-panel-raised` | `#1a2126` | Hover states, nested panels, modals |
| `border` | `#1c2226` | Default dividers/outlines |
| `border-strong` | `#2a3238` | Emphasized borders (active/selected item) |
| `text-primary` | `#e8ebed` | Main content/labels |
| `text-secondary` | `#8a939c` | Secondary labels, metadata |
| `text-tertiary` | `#5a6570` | Disabled/placeholder |
| `accent` | Tailwind `emerald-400`/`500` | Primary buttons, focus rings, **live state** |

Tailwind's built-in `emerald` scale is used directly for the accent (rather
than a fully custom hex) so hover/active/disabled shades come for free
instead of needing a hand-built custom scale.

Existing meaningful status colors are kept as their own tokens — collapsing
everything into one accent would lose real information the operator relies
on (Rehearsal Mode vs. live vs. Stage Rehearsal are genuinely different
states). They're standardized to one shade each and used consistently,
replacing the current mix of ad-hoc blues/greens/ambers sprinkled
per-component:

- **Rehearsal Mode** → amber (`amber-400`/`500`)
- **Stage Rehearsal** → violet (`violet-400`/`500`) — matches the existing
  `text-violet-700` convention already used in `StageRehearsalTools.tsx`
- **Danger/destructive** → red (`red-500`/`600`)

Radius and shadow are also standardized: `rounded-lg` (8px) as the default
panel/button radius app-wide, and a single subtle elevation shadow style
for raised panels/modals (the "subtle shadow" detail the research flagged
as a premium signal competitors' marketing materials lean on).

### 2. Shared component primitives

New `src/renderer/src/ui/` directory holding the primitives every screen
will be migrated to use, so the reskin lives in a handful of files instead
of being hand-typed into 60+ component files:

- `Button.tsx` — variants: primary (accent-filled), secondary (outline),
  danger, ghost. Replaces the repeated `btn`/`btn-primary` className string
  patterns already informally used across the app.
- `Panel.tsx` / `Card.tsx` — the standard `bg-panel` + `border` + `rounded-lg`
  container, replacing one-off `rounded-lg border border-slate-200 bg-white`
  strings.
- `Badge.tsx` — status pill (live/rehearsal/armed/etc.), replacing ad-hoc
  colored `<div>`s like the current amber "Rehearsing" badge.
- `IconButton.tsx` — icon-only button with consistent hover/press feedback.
- `Input.tsx` / `Select.tsx` — form controls with consistent focus-ring
  styling using the accent token.
- `Modal.tsx` — the app already has a `Modal.tsx`; it gets restyled to the
  new dark/panel tokens rather than replaced.

Every screen in the rollout (below) gets its raw utility-class strings
replaced with these primitives as it's migrated, not just re-colored in
place — this is what actually prevents the "half the app drifts back to
inconsistency in six months" failure mode.

### 3. Motion (Framer Motion)

No animation library exists in the project today (`package.json` has plain
`tailwindcss` only). **Framer Motion** is added as a new dependency — it's
the standard choice for this in React and makes the "full treatment" scope
tractable; hand-rolled CSS transitions for four different animation types
across dozens of components would be far more error-prone and inconsistent.

Motion patterns, implemented once in the shared primitives/a few
call-sites rather than per-screen:

- **Going live**: the target zone badge/border does a confident color-fill
  transition (spring, ~200-300ms) rather than an instant snap — mirrors
  ProPresenter's instant-but-smooth green flip described in the research.
- **Slide advance**: brief crossfade/slide transition on the active-slide
  indicator in `SlideGrid.tsx`, not an instant highlight jump.
- **Panel/tab switches**: subtle fade + slight-slide on `AppShell.tsx` view
  changes (Live ↔ Build ↔ Library ↔ Setup).
- **Hover/press feedback**: consistent micro-scale/opacity response baked
  into `Button`/`IconButton` primitives, so every button in the app gets it
  automatically instead of needing per-component work.

Motion respects `prefers-reduced-motion` — Framer Motion supports this via
`useReducedMotion()`; applied at the primitive level so it's automatic
everywhere rather than needing to be remembered per animation.

### 4. Rollout order

Still "one pass" as decided — sequenced so nothing user-visible breaks
mid-effort and each stage can be sanity-checked in the running app before
the next starts:

1. **Foundation** — Tailwind token config, shared primitives, Framer Motion
   wired in. Nothing user-visible changes yet.
2. **TopBar + Home** — small, high-visibility surface; good early gut-check
   that the direction reads right before touching the rest of the app.
3. **Live tab** — `LiveView.tsx`, `LiveTools.tsx`, `SlideGrid.tsx`,
   `StageRehearsalTools.tsx`, `ZonePanel.tsx`/`ZoneLiveGrid.tsx` — the
   screen the operator actually runs services from, so it gets the most
   scrutiny and is proven out before the lower-traffic screens.
4. **Build Service** — `ServiceEditor.tsx`, `ServiceDeck.tsx`, `ItemEditor.tsx`
   and its type-specific editors.
5. **Libraries** — `SongLibrary.tsx`, `AnnouncementsLibrary.tsx`,
   `ScriptureLookup.tsx`, `BackgroundLibraryGrid.tsx` and the drawer-tab
   variants.
6. **Setup pages** — `ScreensZonesTab.tsx`, `ObsConnectTab.tsx`,
   `TabletRemoteTab.tsx`, `RoomFeedTab.tsx`, `DiagnosticsTab.tsx`,
   `LogoSettings.tsx`, sound-check screens.
7. **Volunteer mode** — `VolunteerView.tsx` — deliberately last since it's
   the simplest surface and least likely to surface issues that should
   have been caught earlier.

Zone output pages themselves (`zoneHtml.ts`, `Output.tsx`, `Stage.tsx` — what
actually renders on the sanctuary screens/Pi zone displays) are explicitly
**out of scope** — those are the congregation-facing projection surfaces
with their own theming (background images, slide themes) and aren't part
of "the app feels premium to the operator."

### 5. Testing

Given this touches the screens real services are run from: after each
rollout stage, the app is launched and walked through the actual operator
flows relevant to that stage (going live, advancing slides, arming
Rehearsal Mode and Stage Rehearsal, building a service, picking a
background) to catch contrast/readability/layout regressions in the
running app — not just a visual read of the diff. No dedicated automated
visual-regression tests are planned (this is a look-and-feel change, not
logic); the existing Vitest suite (391 tests as of this writing) continues
to guard the underlying behavior and must stay green throughout.

## Non-goals

- Light mode / theme toggle.
- Restyling the zone output pages / Pi kiosk displays (`zoneHtml.ts`,
  `Output.tsx`, `Stage.tsx`) — congregation-facing, out of scope.
- A full icon-set replacement — Lucide icons are already flat/monoline and
  match the research's "premium" pattern; only their *usage* (consistency,
  sizing) gets standardized via the new primitives, not the icon set
  itself.
- Automated visual-regression testing infrastructure.
- Changing any underlying behavior/logic — this is styling and motion only;
  no feature changes ride along with the reskin.

## Success criteria

Every screen in the app uses the shared design tokens and primitives
instead of ad-hoc utility classes; the app is dark-only with a single
disciplined emerald accent for primary/live state and a small consistent
set of status colors (amber/violet/red) for the other real states;
core interactions (going live, slide advance, view switching) have smooth
motion instead of instant snaps; the 391-test Vitest suite stays green
throughout; and each rollout stage is manually verified in the running app
before the next stage starts.
