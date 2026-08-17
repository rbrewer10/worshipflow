# Visual Redesign — Setup Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin every screen reachable from the Setup section of the app (Screens & Zones, Tablet Remote, Room Feed, Diagnostics & Backups, OBS Connect, Sound Check) to the confirmed dark "Control Room" palette — stage 6 of 7 in the ongoing visual redesign.

**Architecture:** No new components or behavior. Every task is a mechanical class-name migration from the old light palette (`slate-*`/`gray-*`/`white`) to the confirmed dark tokens (`bg-app`/`bg-panel`/`bg-panel-raised`, `text-content-primary/secondary/tertiary`, `border-border`/`border-strong`), following the exact conversion table established in the Foundation/TopBar+Home/Live/Build Service/Libraries stages. Shared classes (`.btn*`, `.card*`, `.badge*`, `.section-header`) and bare `<input>`/`<textarea>`/`<select>` already inherit dark styling from Foundation's `main.css` — leave them alone. Where a file's specific case doesn't fit the generic table (documented per-task below), follow the literal instruction instead of the general rule.

**Tech Stack:** Electron + React + TypeScript + Tailwind CSS v3.

**Out of scope — do not touch:** `src/renderer/src/sound-check/preview/*` (SoundCheckPreviewTab.tsx, VariantA-D.tsx, preview/Waveform.tsx) — these are explicitly-commented "throwaway preview" design-exploration scaffolding, not imported or reachable from the running app (verified: nothing outside that folder imports `SoundCheckPreviewTab`). `src/renderer/src/sound-check/Waveform.tsx` (the real, reachable one used by `VolunteerCheck.tsx`) also needs **zero changes** — every color it draws comes from an `accent` prop passed by its caller, not a baked-in class.

---

## Conversion rules table (reused verbatim from every prior stage)

| Old (light theme) | New (dark theme) |
|---|---|
| `bg-white`, `bg-[#f4f6f9]`, `bg-slate-50`, `bg-slate-100`, `bg-gray-50` | `bg-panel` (top-level card) or `bg-panel-raised` (elevated/nested/hover surface) |
| `border-slate-200`, `border-slate-300`, `border-gray-200` | `border-border` (or `border-strong` for an already-`bg-panel-raised` element that needs to read as more prominent) |
| `text-slate-900`, `text-gray-900` | `text-content-primary` |
| `text-slate-500`, `text-slate-600`, `text-slate-700`, `text-gray-400`, `text-gray-500` | `text-content-secondary` |
| `text-slate-400` | `text-content-tertiary` |
| `hover:bg-slate-100`, `hover:bg-slate-200` | `hover:bg-panel-raised` |
| A resting state already at `bg-panel-raised` that needs a third, visually distinct hover tier | `hover:bg-border-strong` |
| Status-badge text at `-700`/`-800` on a translucent tint or solid pastel background | lighten to `-400` (e.g. `text-blue-700` → `text-blue-400` on `bg-blue-500/15`) |
| Bare **text-only** blue (a link or label, not a solid-fill button) | `text-blue-400` |
| Red text/icon hover states | go lighter, not darker (`text-red-400 hover:text-red-300`) |
| Any `ring-offset-N` without an explicit color | add `ring-offset-panel` (Tailwind defaults an unspecified ring-offset to white, which shows as a stray bright sliver on dark surfaces) |
| `<input>`, `<textarea>`, `<select>` with no explicit background/text classes | leave alone — Foundation's global rule in `main.css` already themes them |
| `.btn`, `.btn-primary`, `.card`, `.card-lg`, `.badge*`, `.section-header` | leave alone — already dark from Foundation |

`gray-*` and `slate-*` are used interchangeably across this codebase (different files, same intent) — apply the table to both.

---

### Task 1: Screens & Zones tab + Backgrounds tab

**Files:**
- Modify: `src/renderer/src/setup/ScreensZonesTab.tsx`
- Modify: `src/renderer/src/ZonePanel.tsx`
- Modify: `src/renderer/src/BackgroundsTab.tsx`

- [ ] **Step 1: Reskin `ScreensZonesTab.tsx`**

Two light-theme classes on the heading/subhead (lines 9-10): `text-slate-900` → `text-content-primary`, `text-slate-500` → `text-content-secondary`. `ZoneLiveGrid` (rendered inside `ZonePanel`) was already reskinned in the Live tab stage — do not touch it.

- [ ] **Step 2: Reskin `ZonePanel.tsx`**

Apply the conversion table throughout. Specific spots:
- Line 48 & 80: `rounded-lg border border-slate-200 bg-slate-100/70 p-2.5` → `rounded-lg border border-border bg-panel-raised p-2.5`
- Line 63: `border border-slate-300` → `border border-border`, keep `focus:border-blue-500`
- Line 65: `text-blue-700` → `text-blue-400`
- Line 72: `border-dashed border-slate-300 ... text-slate-600 hover:border-slate-400 hover:text-slate-800` → `border-dashed border-border text-content-secondary hover:border-border-strong hover:text-content-primary`
- Line 81: `text-slate-500` → `text-content-secondary`
- Line 85: `text-slate-400` → `text-content-tertiary`
- Line 86: `text-blue-700` → `text-blue-400`

- [ ] **Step 3: Reskin `BackgroundsTab.tsx`**

Same two-line heading fix as Task 1 Step 1 (lines 11-12): `text-slate-900` → `text-content-primary`, `text-slate-500` → `text-content-secondary`. `BackgroundLibraryGrid` was already fully reskinned in the Libraries stage — do not touch it.

- [ ] **Step 4: Typecheck and test**

Run: `npm run typecheck` (NOT `npx tsc --noEmit -p .` — that command is a documented no-op in this repo, it silently checks nothing because the root tsconfig has `"files": []`).
Run: `npm test`
Expected: both clean, 0 new failures.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/setup/ScreensZonesTab.tsx src/renderer/src/ZonePanel.tsx src/renderer/src/BackgroundsTab.tsx
git commit -m "feat(theme): dark-palette Screens & Zones and Backgrounds tabs"
```

---

### Task 2: Tablet Remote tab + OBS Connect tab + ObsPanel

**Files:**
- Modify: `src/renderer/src/setup/TabletRemoteTab.tsx`
- Modify: `src/renderer/src/ObsConnectTab.tsx`
- Modify: `src/renderer/src/ObsPanel.tsx`

- [ ] **Step 1: Reskin `TabletRemoteTab.tsx`**

Apply the conversion table. One deliberate departure: the PIN readout chip (line 37) is currently `rounded-lg bg-slate-900 px-3 py-1.5 font-mono text-lg tracking-[0.3em] text-emerald-400`. On the new dark background `bg-slate-900` no longer pops (it's nearly the same navy as the app background), and emerald is reserved for live/on-air status elsewhere in this redesign — this PIN chip isn't a status indicator, it's a decorative "secret code" readout. Change it to use the champagne gold accent instead: `rounded-lg bg-panel-raised ring-1 ring-border-strong px-3 py-1.5 font-mono text-lg tracking-[0.3em] text-[#d9bd85]`. Everything else in the file follows the table directly: line 9 `text-slate-900`→`text-content-primary`, `text-slate-500`→`text-content-secondary` (×3 occurrences), line 29 `border-slate-200 bg-white`→`border-border bg-panel`, line 30 `text-slate-500`→`text-content-secondary`, line 31 `bg-slate-100 ... text-blue-700`→`bg-panel-raised ... text-blue-400`.

- [ ] **Step 2: Reskin `ObsConnectTab.tsx`**

This file uses `gray-*` not `slate-*` — apply the table (they mean the same thing here). Line 25: `bg-gray-50` → remove (the page background comes from the parent `bg-app` now — just drop the class, leaving `h-full overflow-auto p-6`). Line 27: `text-gray-900`→`text-content-primary`. Line 28: `text-gray-400`→`text-content-secondary`. Lines 36-51 (`Pi Display URLs` panel): `border-gray-200 bg-white shadow-sm`→`border-border bg-panel`, `text-gray-900`→`text-content-primary`, `bg-gray-50 border-gray-200`→`bg-panel-raised border-border`, `text-gray-500`→`text-content-secondary`, `text-blue-700`→`text-blue-400`, `text-gray-400`→`text-content-tertiary`. Lines 53-61 (`Tablet Remote` panel): this reuses the exact translucent-blue "info box" idiom already present in `ObsPanel.tsx`'s Lyrics overlay section (line 335 there) — match it: `rounded-xl border border-blue-500/25 bg-blue-500/5 p-5`. Inside it: `text-gray-900`→`text-content-primary`, `bg-white border-gray-200 text-blue-700`→`bg-panel border-border text-blue-400`, `text-gray-400`→`text-content-secondary`.

- [ ] **Step 3: Reskin `ObsPanel.tsx`**

Apply the conversion table throughout — this is the largest file in this task (362 lines) with the most repetition. Specific notes:
- Line 140: `rounded-xl border border-slate-200 bg-[#f4f6f9] p-3` → `rounded-xl border border-border bg-panel p-3` (top-level card here, not nested — unlike some other files where this exact hex mapped to `bg-panel-raised`)
- Line 141: `text-slate-600` → `text-content-secondary`
- Lines 134-137 (`statusPill`): `text-blue-700`→`text-blue-400`, `text-amber-700`→ leave (amber is unchanged semantic color), `text-slate-500`→`text-content-secondary`, `bg-slate-400`→`bg-content-tertiary` is not a real token — instead use `bg-slate-500` (a neutral dot color is fine to leave numeric since it's not a text/bg surface, just a small status dot; do NOT invent a new token for it)
- Lines 149-200 (connection panel): apply table directly — `border-slate-200 bg-white`→`border-border bg-panel`, `text-slate-700`→`text-content-primary`, `text-slate-500`→`text-content-secondary`, `bg-slate-100`→`bg-panel-raised`, input `bg-white`→`bg-panel-raised` (these inputs have explicit background classes so the "leave bare inputs alone" rule does not apply — they must be converted), `text-slate-700`→`text-content-primary`
- Line 187: `bg-blue-600/80 ... hover:bg-blue-600` is a solid-fill primary action button — leave as-is (already on-brand blue, no light-theme assumption baked in)
- Lines 242-276 (auto-record + video assembly): `border-slate-200 bg-white`→`border-border bg-panel`, `text-slate-700`→`text-content-primary`, `text-slate-500`→`text-content-secondary`, `border-slate-200`(divider)→`border-border`, `text-slate-400`(the `<em>`)→`text-content-tertiary`, `text-blue-700`→`text-blue-400`, `border-slate-300`(the Claude-key input)→`border-border`, `text-slate-700`→`text-content-primary`
- Lines 280-298 (Scenes panel): `border-slate-200 bg-white`→`border-border bg-panel`, `text-slate-700`→`text-content-primary`, `text-slate-400`→`text-content-tertiary`, unselected scene pill `bg-slate-100 text-slate-700 hover:bg-slate-200`→`bg-panel-raised text-content-secondary hover:bg-border-strong`; selected pill `bg-blue-600 text-white` stays as-is
- Lines 302-332 (Auto-switch panel): same pattern — `border-slate-200 bg-white`→`border-border bg-panel`, `text-slate-700`→`text-content-primary`, `text-slate-600`→`text-content-secondary`, `border-slate-200 bg-white`(select)→`border-border bg-panel-raised` (explicit bg class, must convert), `text-slate-700`→`text-content-primary`, `text-slate-500`→`text-content-secondary`
- Lines 335-356 (overlay URL box): already uses the target translucent-blue idiom (`border-blue-500/25 bg-blue-500/5`) — leave that wrapper as-is. Inside: `text-slate-700`→`text-content-primary`, `bg-white`(the URL readout)→`bg-panel-raised`, `text-blue-700`→`text-blue-400`, `text-slate-500`→`text-content-secondary`

Do not touch the stream/record buttons' red/amber solid fills (lines 206-222) or the LIVE/REC pulse indicators (lines 224-239) — those carry real semantic meaning (danger/warning) and are unchanged from before the redesign, same as every other stage.

- [ ] **Step 4: Typecheck and test**

Run: `npm run typecheck`
Run: `npm test`
Expected: both clean, 0 new failures.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/setup/TabletRemoteTab.tsx src/renderer/src/ObsConnectTab.tsx src/renderer/src/ObsPanel.tsx
git commit -m "feat(theme): dark-palette Tablet Remote and OBS Connect tabs"
```

---

### Task 3: Diagnostics & Backups tab + Room Feed tab

**Files:**
- Modify: `src/renderer/src/setup/DiagnosticsTab.tsx`
- Modify: `src/renderer/src/setup/RoomFeedTab.tsx`

- [ ] **Step 1: Reskin `DiagnosticsTab.tsx`**

Apply the conversion table throughout, both `BackupsPanel` and `DiagnosticsTab` itself. Specific notes:
- Lines 36-59 (`BackupsPanel`): `border-slate-200 bg-white`→`border-border bg-panel`, `text-slate-900`→`text-content-primary`, `text-slate-500`→`text-content-secondary` (×2), `hover:bg-slate-50`→`hover:bg-panel-raised`, `text-slate-700`→`text-content-primary`, `border-slate-200 bg-slate-50 ... text-slate-600 hover:bg-slate-100`→`border-border bg-panel-raised ... text-content-secondary hover:bg-border-strong`
- Lines 75-97 (heading + Displays panel): `text-slate-900`→`text-content-primary`, `text-slate-500`→`text-content-secondary`, `border-slate-200 bg-white`→`border-border bg-panel`, `text-slate-900`→`text-content-primary` (×2), `text-slate-600`→`text-content-secondary` (×2), `text-blue-700`→`text-blue-400` (×2), `text-amber-700`→ leave (unchanged semantic warning color)
- Lines 99-118 (Service log panel): `border-slate-200 bg-white`→`border-border bg-panel`, `text-slate-900`→`text-content-primary`, `bg-slate-50`→`bg-panel-raised`, `text-slate-600`→`text-content-secondary`, `text-slate-400`→`text-content-tertiary`

- [ ] **Step 2: Reskin `RoomFeedTab.tsx`**

Apply the conversion table throughout. Specific notes:
- Line 8: the `idle` entry of `STATE_LABEL` — `bg-slate-100 text-slate-500 ring-slate-200` → `bg-panel-raised text-content-secondary ring-border`. Leave `starting`/`live`/`error` entries untouched (amber/emerald/red carry real status meaning — `live` here means the feed is genuinely streaming, so emerald is correct per the narrow-role rule).
- Lines 54-61 (heading): `text-slate-900`→`text-content-primary`, `text-slate-500`→`text-content-secondary` (×2)
- Lines 65-73 (permission-request panel): `border-slate-200 bg-white`→`border-border bg-panel`, `text-slate-600`→`text-content-secondary`
- Lines 76-152 (main control panel): `border-slate-200 bg-white`→`border-border bg-panel`, `text-slate-500`(×3)→`text-content-secondary`, `border-slate-200`(×2, the select elements — these have explicit `border` classes but no explicit bg, so the bare-select rule applies to background but the border still needs conversion)→`border-border`, `text-slate-400`(the "Not started" overlay)→`text-content-tertiary`
- Lines 154-178 (Set up the tablet panel): `border-slate-200 bg-white`→`border-border bg-panel`, `bg-slate-50`(QR code background)→`bg-panel-raised`, `text-slate-500`→`text-content-secondary`, `text-slate-400`→`text-content-tertiary`. Leave the two status boxes (`bg-emerald-50 ... ring-emerald-200` for Tailscale-detected, `bg-amber-50 ... ring-amber-200` for not-detected) untouched — same reasoning as elsewhere, these are real status colors, and Tailscale-detected genuinely means "this will work," so emerald is correct here too.

- [ ] **Step 3: Typecheck and test**

Run: `npm run typecheck`
Run: `npm test`
Expected: both clean, 0 new failures.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/setup/DiagnosticsTab.tsx src/renderer/src/setup/RoomFeedTab.tsx
git commit -m "feat(theme): dark-palette Diagnostics and Room Feed tabs"
```

---

### Task 4: Logo & Background settings

**Files:**
- Modify: `src/renderer/src/LogoSettings.tsx`

- [ ] **Step 1: Reskin `LogoSettings.tsx`**

Apply the conversion table throughout. One deliberate exception: the logo preview box (line 109) and the motion-background preview box (line 160) are both `bg-slate-900` with white/translucent-white icon and text overlays (`text-white/20`, `text-white/25`, `text-white/40`, `text-white/60`, `text-white/30`) — like `ZoneStatusBox`'s zone preview from the Live tab stage, these are deliberately theme-independent: they simulate what the physical zone screen actually shows (a near-black background is correct regardless of app theme). Leave both preview boxes and their white/translucent-white text exactly as they are. Only their outer border needs the table applied: `border-slate-200`→`border-border` on both (lines 109, 160).

Everywhere else, apply the table directly:
- Line 76: `bg-slate-50`→ remove (page background now comes from `bg-app` on the parent) — leave `h-full overflow-auto p-6`
- Line 78: `text-slate-900`→`text-content-primary`
- Line 79: `text-slate-400`→`text-content-secondary`
- Lines 86-96 (Church Name card): `border-slate-200 bg-white shadow-sm`→`border-border bg-panel`, `text-slate-900`→`text-content-primary`, `text-slate-400`→`text-content-secondary`, input `border-slate-200 ... text-slate-900`→`border-border ... text-content-primary` (explicit classes, must convert; keep `focus:border-blue-400`)
- Lines 99-148 (Church Logo card, excluding the preview box per above): `border-slate-200 bg-white shadow-sm`→`border-border bg-panel`, `text-slate-900`→`text-content-primary` (×1 here), `text-slate-400`→`text-content-secondary` (×1), `bg-slate-50 border-slate-200`(filename chip)→`bg-panel-raised border-border`, `text-slate-500`→`text-content-secondary`, `text-slate-600`→`text-content-secondary`, buttons: the blue "Change/Choose" button (`border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100`) → `border-blue-500/25 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20` (matches the translucent-blue idiom used throughout this stage), the neutral "Remove" button (`border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100`) → `border-border bg-panel-raised text-content-secondary hover:bg-border-strong`
- Lines 151-207 (Motion Background card, excluding the preview box): identical pattern to the Church Logo card above — apply the same specific mappings
- Lines 210-245 (Screen Scale card): `border-slate-200 bg-white shadow-sm`→`border-border bg-panel`, `text-slate-900`→`text-content-primary`, `text-slate-400`→`text-content-secondary`, `text-slate-600`(zone label)→`text-content-secondary`, `text-slate-500`(percent readout)→`text-content-secondary`, `text-slate-400 hover:text-slate-600`(Reset button)→`text-content-tertiary hover:text-content-secondary`. Leave `accent-blue-600` on the range input untouched.
- Lines 247-253 (footer note card): `border-slate-100 bg-slate-50`→`border-border bg-panel-raised`, `text-slate-400`→`text-content-tertiary`, `text-slate-600`(the `<strong>`)→`text-content-secondary`

- [ ] **Step 2: Typecheck and test**

Run: `npm run typecheck`
Run: `npm test`
Expected: both clean, 0 new failures.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/LogoSettings.tsx
git commit -m "feat(theme): dark-palette Logo & Background settings"
```

---

### Task 5: Sound Check shell + Engineer PIN gate

**Files:**
- Modify: `src/renderer/src/sound-check/SoundCheckTab.tsx`
- Modify: `src/renderer/src/sound-check/EngineerGate.tsx`

- [ ] **Step 1: Reskin `SoundCheckTab.tsx`**

Apply the conversion table throughout. One required fix beyond the mechanical table: the active-role pill (line 195-199) and the mode-toggle pill both currently combine `bg-blue-500/15 text-blue-700` with `shadow-[inset_0_0_0_1px_rgba(16,185,129,.4)]` — that inset shadow is emerald (`rgb(16,185,129)` = Tailwind emerald-500). This is a plain UI-selection indicator (which role/mode is currently active), not a live/on-air status, so per the redesign's hard rule (emerald reserved for ready/on-air/live only) it must not use emerald. Drop the emerald inset shadow entirely — a filled `bg-blue-500/15` background is already a clear enough "selected" indicator on its own, matching how selected-state pills look in every other reskinned file this redesign (e.g. `ObsPanel.tsx`'s selected scene pill, which is a solid `bg-blue-600` with no extra shadow). Change line 197 from `'bg-blue-500/15 font-semibold text-blue-700 shadow-[inset_0_0_0_1px_rgba(16,185,129,.4)]'` to `'bg-blue-500/15 font-semibold text-blue-400'`.

Then apply the table to everything else:
- Line 177: `bg-[#e9ecf1]` → remove (page background now comes from `bg-app` on the parent)
- Line 179: `border-slate-200 bg-[#f4f6f9]`→`border-border bg-panel`, `text-slate-500`→`text-content-secondary`
- Line 183: `border-slate-200 bg-white`→`border-border bg-panel`
- Line 198: `text-slate-600 hover:bg-slate-100 hover:text-slate-900`→`text-content-secondary hover:bg-panel-raised hover:text-content-primary`
- Lines 210-217 (passcode toggle button): `bg-slate-200 text-slate-900`→`bg-panel-raised text-content-primary`, `text-slate-600 hover:bg-slate-100 hover:text-slate-900`→`text-content-secondary hover:bg-panel-raised hover:text-content-primary`
- Line 219: `border-slate-200 bg-white`→`border-border bg-panel`
- Lines 226-229 (setup/live toggle, unselected): `text-slate-600 hover:bg-slate-100 hover:text-slate-900`→`text-content-secondary hover:bg-panel-raised hover:text-content-primary`; selected (`bg-slate-200 font-semibold text-slate-900`)→`bg-panel-raised font-semibold text-content-primary`
- Line 239: `bg-[#e9ecf1]`→`bg-app`
- Line 283: `text-slate-600`(ConnectingState message)→`text-content-secondary`
- Lines 303-313 (ConnectionErrorState): `border-red-300 bg-red-50`(leave — real error color), `text-red-700`(leave), `text-slate-700`→`text-content-secondary`, `text-slate-500 hover:text-slate-700`(details summary)→`text-content-tertiary hover:text-content-secondary`, `text-slate-500`(details body)→`text-content-tertiary`
- Lines 324-341: input `border-slate-200 bg-white text-slate-900 placeholder:text-slate-400`→`border-border bg-panel-raised text-content-primary placeholder:text-content-tertiary` (keep `focus:border-blue-500`), submit button stays solid `bg-blue-600` (unchanged), `text-slate-500`(bottom hint)→`text-content-secondary`

- [ ] **Step 2: Reskin `EngineerGate.tsx`**

Apply the conversion table throughout both exported components:
- `EngineerPinPrompt` (lines 37-77): `border-slate-200 bg-[#f4f6f9]`→`border-border bg-panel`, `text-slate-900`→`text-content-primary`, `text-slate-500`→`text-content-secondary`, input `border-slate-200 bg-white text-slate-900 placeholder:text-slate-400`→`border-border bg-panel-raised text-content-primary placeholder:text-content-tertiary` (keep `focus:border-blue-500`), submit button stays solid `bg-blue-600` (unchanged)
- `ManagePasscodePanel` (lines 132-186): `border-slate-200 bg-white`→`border-border bg-panel`, `text-slate-500`(label)→`text-content-secondary`, close button `text-slate-500 hover:text-slate-900`→`text-content-secondary hover:text-content-primary`, input same conversion as above, submit button stays solid `bg-blue-600` (unchanged), remove-passcode text button `text-red-600 hover:text-red-700`→`text-red-400 hover:text-red-300` (red hover goes lighter on dark backgrounds, per the table)

- [ ] **Step 3: Typecheck and test**

Run: `npm run typecheck`
Run: `npm test`
Expected: both clean, 0 new failures.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/sound-check/SoundCheckTab.tsx src/renderer/src/sound-check/EngineerGate.tsx
git commit -m "feat(theme): dark-palette Sound Check shell and Engineer PIN gate"
```

---

### Task 6: Volunteer sound check view

**Files:**
- Modify: `src/renderer/src/sound-check/VolunteerCheck.tsx`

- [ ] **Step 1: Reskin `VolunteerCheck.tsx`**

Apply the conversion table throughout. Two things that need judgment rather than a mechanical table lookup:

1. **`TopLine`'s "TF-Rack · Connected" badge (line 37)**: currently `bg-green-500` dot with `shadow-[0_0_8px_rgba(34,197,94,.5)]` inside a `border-slate-200 bg-white` pill. This genuinely is a live connection/ready status (the mixer is connected and providing real channel data) — per the narrow-role rule this is a legitimate emerald use. Convert the pill wrapper (`border-slate-200 bg-white text-slate-600`→`border-border bg-panel text-content-secondary`) but keep the green dot and glow, changing `bg-green-500`/`rgba(34,197,94,...)` to the standard `bg-emerald-500`/`rgba(16,185,129,.5)` so it matches the emerald used for status elsewhere in the app instead of a slightly different ad-hoc green.

2. **`Modes`' active-tab indicator (line 50)**: `border-blue-500 bg-blue-500/10 text-blue-700 shadow-[0_0_0_1px_rgba(16,185,129,.35)]` — same issue as SoundCheckTab's role pill: an emerald ring on a plain selection state (which setup step you're viewing), not a status. Drop the emerald shadow: change to `border-blue-500 bg-blue-500/10 text-blue-400` (no shadow). Its `text-blue-600` sub-label (line 55) → `text-blue-400`.

Then apply the table to everything else:
- Line 18: `border-slate-200 bg-white shadow-sm`→`border-border bg-panel`
- Line 19: `border-slate-100`→`border-border`
- Line 21: `text-slate-500`→`text-content-secondary`
- Line 35: `text-slate-900`→`text-content-primary`
- Line 51/52 (Modes, `off` state): `border-slate-200 bg-white text-slate-500`→`border-border bg-panel text-content-secondary`
- Lines 78-95 (`SetupRow`): `done`/`cur` badges carry real progress-state meaning (done=green checkmark, cur=blue current-step) — leave `border-green-500/40 bg-green-500/15 text-green-700` and `bg-blue-600 text-white` as-is (green here also legitimately means "this step is complete," a status, not a plain selection). `todo` badge: `border-slate-200 bg-slate-100 text-slate-500`→`border-border bg-panel-raised text-content-secondary`. Row wrapper: `border-slate-200 bg-white`→`border-border bg-panel`, `text-slate-900`→`text-content-primary`
- Lines 116-163 (`ChannelChip`): `border-slate-200 bg-white text-slate-700`→`border-border bg-panel text-content-secondary`. `mic`/`track` pills carry real classification meaning — leave the blue/purple tint colors as-is, but lighten text: `text-blue-700`→`text-blue-400`, `text-purple-700`→`text-purple-400`. `unassigned` pill: `border-dashed border-slate-300 bg-slate-100 text-slate-500`→`border-dashed border-border bg-panel-raised text-content-secondary`. Mic/Track toggle buttons: `bg-slate-100 text-slate-600 hover:text-blue-700`→`bg-panel-raised text-content-secondary hover:text-blue-400`, `bg-slate-100 text-slate-600 hover:text-purple-700`→`bg-panel-raised text-content-secondary hover:text-purple-400` (selected states `bg-blue-600 text-white` / `bg-purple-600 text-white` stay solid, unchanged)
- Lines 224-283 (`SetupView` body text): `text-slate-600`(×3)→`text-content-secondary`, `text-blue-700`(the `<b>` in the classify instructions)→`text-blue-400`, `text-purple-700`→`text-purple-400`. The "Coming soon" amber badge and disabled Record button stay unchanged (amber = real caveat, not a themeable neutral). Leave `text-green-700` on the "Reference mix saved" confirmation — real success status.
- Lines 298-313 (`LiveView` intro card): `border-slate-200 bg-white`→`border-border bg-panel`, `text-blue-700`→`text-blue-400`, `text-slate-900`→`text-content-primary`, `text-slate-600`→`text-content-secondary`. The `bg-[#0e141d]` waveform container (line 308) is intentionally dark regardless of theme (same reasoning as the zone preview boxes elsewhere) — leave it and its `border-slate-200`→ convert only the border to `border-border`. `text-slate-400`(the "Decorative only" caption) → `text-content-tertiary`.
- Lines 291-295 (Manual sound check divider): `text-slate-500`→`text-content-secondary`, `bg-slate-200`→`bg-border`
- Lines 316-329 (channel pill list): non-muted `border-slate-200 bg-white text-slate-600`→`border-border bg-panel text-content-secondary`. Muted pill (`border-red-300 bg-red-50 text-red-600`) stays unchanged — real danger-state color.
- Line 344: `bg-[#e9ecf1] ... text-slate-700`→`bg-app text-content-secondary`

- [ ] **Step 2: Typecheck and test**

Run: `npm run typecheck`
Run: `npm test`
Expected: both clean, 0 new failures.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/sound-check/VolunteerCheck.tsx
git commit -m "feat(theme): dark-palette Volunteer sound check view"
```

---

### Task 7: Engineer sound check dashboard

**Files:**
- Modify: `src/renderer/src/sound-check/EngineerDashboard.tsx`

This is the largest file in this stage (939 lines) — take it carefully, in the order the components appear.

- [ ] **Step 1: Fix the `EDGE` status-stripe colors (lines 38-43)**

The file's own comment says these "carry real meaning (ok/err/acc/warn)... darkened slightly from the original dark-theme hues so they still read clearly as a left-edge accent stripe against the light panel background." That comment is now backwards — the panel background is about to become dark again. Restore the original, brighter dark-theme-appropriate hex values (matching the semantic colors used everywhere else in this redesign — green/emerald for ok, red for err, blue for acc, amber for warn):
```ts
const EDGE: Record<Edge, string> = {
  ok: 'shadow-[inset_3px_0_0_#22c55e]',
  err: 'shadow-[inset_3px_0_0_#ef4444]',
  acc: 'shadow-[inset_3px_0_0_#3b82f6]',
  warn: 'shadow-[inset_3px_0_0_#f59e0b]'
}
```

- [ ] **Step 2: Reskin `Tile`, `Unit`, `Panel`, `Kv`, `Pill` (lines 45-105)**

- `Tile` (line 47): `border-slate-200 bg-white`→`border-border bg-panel`, `text-slate-500`(line 48)→`text-content-tertiary`, `text-slate-900`(line 49)→`text-content-primary`, `text-slate-500`(line 50)→`text-content-secondary`
- `Unit` (line 56): `text-slate-500`→`text-content-secondary`
- `Panel` (line 71): `border-slate-200 bg-white`→`border-border bg-panel`, `text-slate-500`(line 73)→`text-content-tertiary`, `text-slate-400`(line 74)→`text-content-tertiary`
- `Kv` (line 83): `border-slate-100`→`border-border`, `text-slate-600`→`text-content-secondary`, `text-slate-900`(line 85)→`text-content-primary`
- `Pill` (lines 92-104): mic/track pills carry real classification meaning, matching `VolunteerCheck.tsx`'s chip colors — lighten text only: `text-blue-700`→`text-blue-400`, `text-purple-700`→`text-purple-400`. `none` kind's `text-amber-600` stays unchanged (real "needs attention" color).

- [ ] **Step 3: Reskin `Head` (lines 107-134)**

Same emerald-on-a-selection-state issue as `SoundCheckTab.tsx` and `VolunteerCheck.tsx`'s `Modes` — line 112's `shadow-[inset_0_0_0_1px_rgba(16,185,129,.35)]` on the active Setup/Sound Check toggle is a plain selection indicator, not a status. Drop it: change line 112 from `` `rounded-[5px] px-3 py-1 text-[10.5px] font-bold uppercase tracking-widest ${on ? 'bg-blue-500/15 text-blue-700 shadow-[inset_0_0_0_1px_rgba(16,185,129,.35)]' : 'text-slate-500'}` `` to `` `rounded-[5px] px-3 py-1 text-[10.5px] font-bold uppercase tracking-widest ${on ? 'bg-blue-500/15 text-blue-400' : 'text-content-tertiary'}` ``. Then: line 120 `text-slate-900`→`text-content-primary`, line 121 `border-slate-200 bg-[#f4f6f9]`→`border-border bg-panel`, line 128 `border-slate-200 bg-[#f4f6f9] text-blue-700 hover:bg-blue-500/10`→`border-border bg-panel text-blue-400 hover:bg-blue-500/10`

- [ ] **Step 4: Reskin `ClassificationPanel` (lines 142-161) and the `FIELD_CLASS` constant (lines 224-225)**

`ClassificationPanel`: line 146 `text-slate-500`→`text-content-tertiary`. `FIELD_CLASS`: `border-slate-200 bg-white text-slate-900`→`border-border bg-panel-raised text-content-primary` (keep `focus:border-blue-500`) — these are explicit-override inputs inside dark form panels, so the "leave bare inputs alone" rule doesn't apply here; they need the same treatment as every other explicit-class input converted elsewhere this stage.

- [ ] **Step 5: Reskin `RuleForm` (lines 227-407)**

- Line 267: `border-slate-200 bg-[#f4f6f9]`→`border-border bg-panel-raised`
- Lines 269, 299, 314: `text-slate-500`→`text-content-tertiary`
- Line 288: `text-slate-700`→`text-content-secondary`
- Line 328: `border-slate-200 bg-white text-blue-700 hover:bg-blue-500/10`→`border-border bg-panel text-blue-400 hover:bg-blue-500/10`
- Lines 334, 338: `text-slate-500`→`text-content-secondary`
- Line 375: `bg-slate-100 text-slate-500 hover:text-red-600`→`bg-panel-raised text-content-secondary hover:text-red-400`
- Line 392: same emerald-on-selection issue — `shadow-[inset_0_0_0_1px_rgba(16,185,129,.35)]` on the Save button is decorative, not a status; drop it. Change `'rounded-[5px] bg-blue-500/15 px-3 py-1 text-[10.5px] font-bold uppercase tracking-widest text-blue-700 shadow-[inset_0_0_0_1px_rgba(16,185,129,.35)] hover:bg-blue-500/25 disabled:opacity-40'` to `'rounded-[5px] bg-blue-500/15 px-3 py-1 text-[10.5px] font-bold uppercase tracking-widest text-blue-400 hover:bg-blue-500/25 disabled:opacity-40'`
- Line 400: `border-slate-200 bg-white text-slate-600 hover:text-slate-900`→`border-border bg-panel text-content-secondary hover:text-content-primary`

- [ ] **Step 6: Reskin `AutomationRulesPanel` (lines 409-590)**

- Lines 508, 511, 513: `text-red-600`→`text-red-400`, `text-slate-500`(×2)→`text-content-tertiary`
- Line 518: `border-slate-100`→`border-border`
- Line 521: `text-slate-900`→`text-content-primary`
- Line 522: `text-slate-600`/`text-slate-400`→`text-content-secondary`/`text-content-tertiary`
- Line 537: `bg-slate-100 ... text-blue-700 hover:text-blue-800`→`bg-panel-raised ... text-blue-400 hover:text-blue-300`
- Line 546: red-confirm delete button's `shadow-[inset_0_0_0_1px_rgba(220,38,38,.35)]` is red-on-red (danger emphasis), unrelated to the emerald issue — leave it, this one is correct as-is
- Line 555: `bg-slate-100 ... text-slate-500 hover:text-red-600`→`bg-panel-raised ... text-content-secondary hover:text-red-400`
- Line 583: `border-slate-200 bg-white text-blue-700 hover:bg-blue-500/10`→`border-border bg-panel text-blue-400 hover:bg-blue-500/10`

- [ ] **Step 7: Reskin `SetupView` (lines 592-616)**

No direct light-theme classes of its own — it composes `Tile`/`ClassificationPanel`/`AutomationRulesPanel`, all already covered above. No changes needed here beyond what those sub-components already receive.

- [ ] **Step 8: Reskin `MeterRow` (lines 621-701)**

- Line 646: `text-slate-900`(unmuted name)→`text-content-primary`, `text-slate-400 decoration-slate-300`(muted)→`text-content-tertiary decoration-border-strong`
- Line 651: `text-slate-400`→`text-content-tertiary`
- Line 660: unmuted Mute button `bg-slate-100 text-slate-500 hover:text-slate-800`→`bg-panel-raised text-content-secondary hover:text-content-primary` (the muted/red state at line 659 is real danger-state, leave unchanged)
- Line 671: `border-[#161c2b] bg-[#0a0e16]` — this is the fader's level-meter track, explicitly commented as "kept dark intentionally: the fill is a real green→amber→red level meter, like a hardware fader scale, and reads best against a dark meter-style track." This was ALREADY dark before the redesign (it's not a light-theme leftover) — leave it completely unchanged, along with its gradient fill (line 676) and thumb styling (line 693).
- Line 696: `text-slate-700`→`text-content-secondary`

- [ ] **Step 9: Reskin `RecommendationsPanel` (lines 703-761)**

- Lines 719-723 (`severityColor`): these are real severity-meaning colors (info/warning/error) — lighten only for legibility on dark: `text-blue-700`→`text-blue-400`, `text-amber-600`→ leave, `text-red-600`→`text-red-400`
- Line 732: `border-dashed border-slate-200 bg-[#f4f6f9] text-slate-500`→`border-dashed border-border bg-panel-raised text-content-secondary`
- Line 736: same as above
- Line 744: `border-slate-200 bg-[#f4f6f9]`→`border-border bg-panel-raised`
- Line 749: `text-slate-500`→`text-content-secondary`
- Line 751: `text-slate-400`→`text-content-tertiary`

- [ ] **Step 10: Reskin `LiveView` (lines 763-920) and `EngineerDashboard` (lines 922-939)**

- Lines 890, 904: `text-slate-500`→`text-content-secondary`
- Line 909: `border-slate-200 bg-white text-blue-700 hover:bg-blue-500/10`→`border-border bg-panel text-blue-400 hover:bg-blue-500/10`
- Line 932: `bg-[#e9ecf1] ... text-slate-700`→`bg-app text-content-secondary`

- [ ] **Step 11: Typecheck and test**

Run: `npm run typecheck`
Run: `npm test`
Expected: both clean, 0 new failures.

- [ ] **Step 12: Commit**

```bash
git add src/renderer/src/sound-check/EngineerDashboard.tsx
git commit -m "feat(theme): dark-palette Engineer sound check dashboard"
```

---

### Task 8: Verification pass + visual check

**Files:** None modified — verification only.

- [ ] **Step 1: Full typecheck and test suite**

Run: `npm run typecheck`
Run: `npm test`
Expected: both clean, same pass count as the Libraries stage baseline (410/410) plus any tests added/changed in this stage — 0 failures either way.

- [ ] **Step 2: Build the renderer bundle**

Run: `npm run build`
Expected: succeeds, produces `out/renderer`.

- [ ] **Step 3: Visual verification**

Serve `out/renderer` locally (e.g. `npx --yes serve -l 4173 out/renderer` via a temporary `.claude/launch.json`, the pattern used in every prior stage) and check each of the 6 in-scope screens (Screens & Zones, Tablet Remote, Room Feed, Diagnostics & Backups, OBS Connect, Sound Check — both Volunteer and Engineer roles, both Setup and Live sub-modes) via `computer{action:"screenshot"}` if the Browser pane cooperates, or `getComputedStyle` checks on representative elements (background-color, color, border-color) compared against the confirmed palette hex values if it doesn't. Confirm no `bg-white`/`text-slate-900`-class light patches remain visible anywhere in the 6 screens. Clean up: stop the preview server, delete the temporary `launch.json`.

- [ ] **Step 4: Self-review diff**

Run: `git diff feat/zone-decks --stat` (or the equivalent against this stage's base commit) and skim every changed file once more for: any `ring-offset-N` without an explicit color (the recurring bug found in three prior stages), any leftover `slate-`/`gray-`/`white` class this plan's tasks may have missed, and confirm every emerald usage in the 6 screens is a genuine live/ready/connected status (not a plain selection indicator) per this stage's three documented fixes (SoundCheckTab's role pill, VolunteerCheck's Modes tab, EngineerDashboard's Head toggle and RuleForm Save button).
