# WorshipFlow — Phase 3: Flat Consistency Pass

**Date:** 2026-06-22
**Status:** Approved design, ready for implementation plan
**Stage:** Phase 3 of 3 (completes the UI overhaul started in Phases 1-2)

## Goal

Make the Services, Songs, and Scripture tabs look cohesive with the flat Phase 1/2 shell. No functional changes — purely a styling sweep so the whole app feels like one piece.

## Flat conventions to apply

These conventions are already used by the shell, SlideGrid, LiveTools, and ServiceRail. Apply them uniformly to the remaining tabs:

- **App background:** matte grey `#2b2b30` (already set on `body` in main.css)
- **Panels / card surfaces:** `bg-[#1a1a1d]` with `border border-white/[0.07]`
- **Sidebars / secondary surfaces:** `bg-[#15151a]` (matches the rail and LiveTools)
- **Input wells / textareas:** `bg-black/30 border border-white/10` with `focus:border-blue-500` — already fine in most places, just needs to be consistent
- **Section headings:** `text-[11px] font-semibold uppercase tracking-wider text-slate-400`
- **Accent colors:** keep existing blue/emerald/amber/red accents; drop any purple gradient/glass overlays
- **Buttons:** `border border-white/10 bg-white/[0.06] hover:bg-white/[0.12]` for neutral; accent variants unchanged
- **Dark dropdowns:** `option { background-color: #1e293b; color: #fff }` already in main.css — verify all selects get `colorScheme: dark` or inherit correctly
- **No glassmorphism:** remove `backdrop-filter: blur(...)`, `bg-white/[0.03]` glass overlays, gradient shimmer effects from operator chrome (Output.tsx/Stage.tsx projector views are unaffected)

## Files in scope

### ServiceBuilder.tsx + children

The Services tab is the deck builder. It already uses some flat conventions but has leftover glass panels (`bg-white/[0.03]`) and inconsistent borders.

- **`ServiceBuilder.tsx`** — the services sidebar left column and the open-service panel
- **`ThemePicker.tsx`** — the collapsible theme selector (glass panel → flat)
- **`CardEditPanel.tsx`** — the right edit panel (glass-ish surfaces → flat)
- **`ServiceDeck.tsx`** — the card grid (already mostly flat; verify add-button row)
- **`CcliPanel.tsx`** — the CCLI license + usage panel (glass → flat)
- **`PptxImport.tsx`** — the import preview modal (glass → flat)

### SongLibrary.tsx

The Songs tab: song list on the left, editor form on the right. Needs the sidebar restyled `#15151a`, the editor sections restyled as flat panels, and the `CcliPanel` + `PptxImport` already covered above.

### ScriptureLookup.tsx

The Scripture tab: a passage form with translation picker, result display. Straightforward flat restyle — form fields already correct, surrounding panels need the flat treatment.

### main.css

- Remove the `@layer components { input, textarea, select { ... backdrop-filter: blur(10px) ... } }` glass rule that adds blur to all inputs
- Keep the `option { background-color: #1e293b }` dark-dropdown rule
- Keep all `@keyframes` for projector themes and motion backgrounds
- Keep the `!important` readability overrides for the operator UI themes (still referenced by the theme system even though the switcher is gone)

## Out of scope

- Output.tsx, Stage.tsx — projector/stage windows; never touched by the operator chrome restyle
- Tablet HTML — server-side; unaffected
- Any functional or behavioral change
- The Songs tab Song slide-thumbnail editor (the deeper redesign deferred from Phase 3 scoping)

## Testing / verification

- `npm run typecheck` clean; app boots; no console errors
- Manual: open each tab (Services, Songs, Scripture) and confirm flat look matches the shell — no glass blur, no gradient shimmer, matte panels, correct sidebar tone
- Regression: all existing features work — deck build, card edit, CCLI, PowerPoint import, song create/edit/delete, scripture lookup

## Roadmap (context)

1. **Phase 1 (done)** — flat shell: AppShell, TopBar, ServiceRail, OutputPreview, ServiceContext
2. **Phase 2 (done)** — Live slide-grid + LiveTools
3. **Phase 3 (this spec)** — flat consistency pass on Services, Songs, Scripture tabs
