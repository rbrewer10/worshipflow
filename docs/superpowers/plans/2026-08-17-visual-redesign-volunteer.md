# Visual Redesign — Volunteer Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the Volunteer mode touch-operator screen to the confirmed dark "Control Room" palette — stage 7 of 7, the final stage of the visual redesign.

**Architecture:** No new components or behavior. `src/renderer/src/VolunteerView.tsx` (339 lines) is the only in-scope file — a single self-contained screen with one small local helper component (`TopBtn`) defined in the same file. No other files import light-theme classes reachable only from this view. The migration follows the exact conversion table and depth convention established across all 6 prior stages of this redesign.

**Tech Stack:** Electron + React + TypeScript + Tailwind CSS v3.

---

## Conversion rules table (reused verbatim from every prior stage)

| Old (light theme) | New (dark theme) |
|---|---|
| `bg-white`, `bg-[#f4f6f9]`, `bg-slate-50`, `bg-slate-100` | `bg-panel` (top-level chrome) or `bg-panel-raised` (elevated/nested surface) |
| `border-slate-200` | `border-border` |
| `text-slate-900` | `text-content-primary` |
| `text-slate-500/600/700` | `text-content-secondary` |
| `text-slate-400` | `text-content-tertiary` |
| `hover:bg-slate-100/200` | `hover:bg-panel-raised` or `hover:bg-border-strong` (whichever is a step up from that element's own resting shade) |
| Bare text-only blue (translucent tint or no tint) | `text-blue-400` |
| Red/blue hover states | should get LIGHTER not darker on a dark background |
| `<input>`/`<textarea>`/`<select>` with an EXPLICIT bg/text class | must be converted — the "leave bare inputs alone" rule only applies when no explicit class is set |

**Depth convention established across every prior stage**: the page root is `bg-app`. A chrome bar/strip directly inside the page root (top bar, side rails, bottom strip) is `bg-panel`. A button/pill/chip nested one level inside a `bg-panel` bar raises to `bg-panel-raised` (with its own hover state going one tier further, to `border-strong`, so hover never matches the resting shade of a sibling state). Never let an element share its DIRECT parent's exact background shade — this same-shade collision has been the single most common bug found in code review across every stage of this redesign (found and fixed 6+ times in the Setup stage alone).

**Established idiom for translucent status pills** (confirmed in the Build Service stage's `LiveCallEditor.tsx`, reconfirmed as the correct pattern during the Setup stage's final holistic review): `bg-{color}-500/10 text-{color}-400 ring-{color}-500/30` — NOT a solid light pastel (`bg-emerald-50 text-emerald-700`), which only belongs on small self-contained badges, never on a translucent tint over the dark page.

---

### Task 1: Reskin `VolunteerView.tsx`

**Files:**
- Modify: `src/renderer/src/VolunteerView.tsx`

- [ ] **Step 1: Page root and top bar**

Root wrapper (line 192): `bg-[#e9ecf1]` → `bg-app`.

Top bar (line 198): `border-slate-200 bg-[#f4f6f9]` → `border-border bg-panel`.

- [ ] **Step 2: `TopBtn` component and the Black/Logo/Lyrics buttons**

`TopBtn`'s own inactive-state classes (line 331): `bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900` → `bg-panel-raised text-content-secondary hover:bg-border-strong hover:text-content-primary` (nested one level inside the `bg-panel` top bar — raises correctly, and its hover goes a further tier up so it never matches its own resting shade).

The "Black" button's active-state override (line 199): `bg-slate-700 text-white ring-1 ring-slate-900/10` — this was always meant to render as a distinct near-black fill representing the "screen is black" state, not a generic neutral button. On the new dark palette a mid-gray `slate-700` blends into the surrounding chrome instead of reading as "black." Change to `bg-black text-white ring-1 ring-white/10` — a genuinely black fill, consistent with how this redesign has treated other "this literally represents a black screen" elements (e.g. the always-dark zone-preview boxes from the Live tab stage).

The "Logo" button's active-state override (line 202, `bg-blue-600 text-white`) needs no change — already a correct solid-fill selected state.

- [ ] **Step 3: Service picker `<select>` and the divider**

Divider (line 208): `bg-slate-200` → `bg-border`.

Select (line 209-213): this has explicit background/text classes, so it must be converted (the "leave bare inputs alone" rule only applies when no explicit classes are set). `border-slate-200 bg-white text-slate-900` → `border-border bg-panel-raised text-content-primary` (nested one level inside the `bg-panel` top bar, same reasoning as `TopBtn`). Keep `focus:border-blue-500`.

- [ ] **Step 4: Keyboard hint and Exit button**

Keyboard hint (line 220): `text-slate-500` → `text-content-secondary`.

Exit button (line 222): `border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900` → `border-border bg-panel-raised text-content-secondary hover:bg-border-strong hover:text-content-primary` (same nested-in-top-bar reasoning as `TopBtn`/the select).

- [ ] **Step 5: PREV button**

Line 232-238: this sits directly inside the page root (`bg-app`), as a chrome rail alongside the main content — treat it like the top bar (a top-level chrome surface, `bg-panel`), not like something nested inside the top bar. `border-r border-slate-200 bg-[#f4f6f9] text-slate-500 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200` → `border-r border-border bg-panel text-content-secondary hover:bg-panel-raised hover:text-content-primary active:bg-border-strong`. The "Prev" label span (line 237) shares the same `text-slate-500` → `text-content-secondary`.

- [ ] **Step 6: Slide content — countdown, black, logo, and lyrics states**

Countdown state (lines 244-249): eyebrow label `text-blue-700` → `text-blue-400`; big countdown number `text-slate-900` → `text-content-primary`.

Black state (line 252): `text-slate-500` → `text-content-secondary`.

Logo state (line 254): `text-blue-700` → `text-blue-400`.

Lyrics state (lines 257-270): main line `text-slate-900` → `text-content-primary`; "Nothing loaded" placeholder `text-slate-400` → `text-content-tertiary`; slide counter `text-slate-500` → `text-content-secondary`; song title `text-slate-600` → `text-content-secondary`; "Next: …" pill `border-slate-200 bg-white text-slate-600` → `border-border bg-panel text-content-secondary` (same page-root-level chrome reasoning as the PREV button — this pill sits directly in the main content area, not nested inside another card).

- [ ] **Step 7: NEXT button**

Line 276-282: same page-root-level chrome treatment as PREV, but this one keeps its blue accent identity (it's the primary "advance" action) rather than becoming neutral. `border-l border-slate-200 bg-blue-500/10 text-blue-700 hover:bg-blue-500/15 hover:text-blue-800 active:bg-blue-500/20` → `border-l border-border bg-blue-500/10 text-blue-400 hover:bg-blue-500/15 hover:text-blue-300 active:bg-blue-500/20` (note: `hover:text-blue-800` → `hover:text-blue-300`, NOT `hover:text-blue-900` or similar — hover states get LIGHTER not darker on a dark background, the same rule already applied to red hover states throughout this redesign). The "Next" label span (line 281) shares `text-blue-700` → `text-blue-400`.

- [ ] **Step 8: Bottom jump strip**

Strip wrapper (line 287): `border-t border-slate-200 bg-[#f4f6f9]` → `border-t border-border bg-panel` (top-level chrome, same as the top bar).

"Jump:" label (line 288): `text-slate-500` → `text-content-secondary`.

Item buttons (lines 294-300): live/selected state `border-blue-500/40 bg-blue-500/15 text-blue-700` → `border-blue-500/40 bg-blue-500/15 text-blue-400` (translucent tint — the bare `-700` text needs the same lightening applied everywhere else this tint pattern appears in the redesign). Can-go-live unselected state `border-slate-200 bg-white text-slate-700 hover:bg-slate-100` → `border-border bg-panel-raised text-content-secondary hover:bg-border-strong` (nested one level inside the `bg-panel` strip). Disabled state `text-slate-400` → `text-content-tertiary` (its `border-transparent bg-transparent` stay as-is).

Item index number (line 302): `text-slate-500` → `text-content-secondary`. "LIVE" badge (line 306): `text-blue-700` → `text-blue-400`.

- [ ] **Step 9: Typecheck and test**

Run: `npm run typecheck` (NOT `npx tsc --noEmit -p .` — that command is a documented no-op in this repo, it silently checks nothing because the root tsconfig has `"files": []`).
Run: `npm test`
Expected: both clean, 0 new failures (baseline is 410/410 as of the Setup stage).

- [ ] **Step 10: Self-review and commit**

Grep the file for leftover `slate-`/`bg-white`/`bg-[#e9ecf1]`/`bg-[#f4f6f9]` classes and confirm zero remain. Double-check the depth convention: nothing should share its direct parent's exact background shade — pay particular attention to the "Black" button's new near-black fill (should read as visually distinct from the rest of the top bar), and the two different treatments used for chrome elements at page-root depth (`bg-panel`, e.g. PREV/NEXT/top bar/bottom strip) versus elements nested one level inside those bars (`bg-panel-raised`, e.g. TopBtn, the select, Exit, the jump-strip's item buttons).

```bash
git add src/renderer/src/VolunteerView.tsx
git commit -m "feat(theme): dark-palette Volunteer mode"
```

---

### Task 2: Verification pass + visual check

**Files:** None modified — verification only.

- [ ] **Step 1: Full typecheck and test suite**

Run: `npm run typecheck`
Run: `npm test`
Expected: both clean, same pass count as the Setup stage baseline (410/410) plus any tests added/changed — 0 failures either way.

- [ ] **Step 2: Build the renderer bundle**

Run: `npm run build`
Expected: succeeds, produces `out/renderer`.

- [ ] **Step 3: Visual verification**

Serve `out/renderer` locally (the pattern used in every prior stage — a temporary `.claude/launch.json` pointing `npx --yes serve -l 4173 <out/renderer path>`) and check the Volunteer mode screen (reachable from Home's "Volunteer mode" button, or the "Take me to Volunteer Mode" link in the Quick Start help panel) via `computer{action:"screenshot"}` if the Browser pane cooperates, or `getComputedStyle` checks on representative elements compared against the confirmed palette hex values if it doesn't. Confirm no light-theme patches remain. Clean up: stop the preview server, delete the temporary `launch.json`.

- [ ] **Step 4: Self-review diff and final holistic check**

Run `git diff feat/zone-decks --stat` (or the equivalent against this stage's base commit) and skim the changed file once more. Since this is the LAST stage of the entire 7-stage redesign, also do one final sanity pass across the whole `feat/zone-decks` branch: grep for any remaining `bg-\[#e9ecf1\]`, `bg-\[#f4f6f9\]`, or bare `text-slate-900` across all of `src/renderer/src/` to confirm no stage was left half-finished, and confirm the two known, deliberately out-of-scope gaps recorded in memory (`SongEditor.tsx`/`AnnouncementEditor.tsx`/`BackgroundPanel.tsx`/`ReflowEditor.tsx`/`ChordDisplay.tsx`) are the ONLY remaining light-themed files, not a symptom of something missed in this or an earlier stage.
