# Visual Redesign — Libraries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Libraries screens — `SongLibrary.tsx`, `AnnouncementsLibrary.tsx`, `ScriptureLookup.tsx`, `BackgroundLibraryGrid.tsx`, and their drawer-tab variants (`SongsDrawerTab.tsx`, `AnnouncementsDrawerTab.tsx`, `ScriptureDrawerTab.tsx`, `BackgroundsDrawerTab.tsx`) — from raw light-theme Tailwind utility classes to the confirmed dark navy/blue/emerald palette already shipped in the Foundation, TopBar+Home, Live-tab, and Build-Service stages. This is stage 5 of the design spec's rollout order.

**Architecture:** Same conversion as every prior stage. One scope correction found while reading the files: `ScriptureDrawerTab.tsx` is a pure logic wrapper — 100% of its visible UI is delegated to a separate shared component, `ScripturePanel.tsx` (also used elsewhere), which the design spec doesn't name explicitly. Migrating `ScriptureDrawerTab.tsx` alone would touch zero visible pixels; `ScripturePanel.tsx` is added to this plan's scope for that reason (it needs only one tiny change — see Task 3).

**Tech Stack:** React, Tailwind CSS v3, the shared component classes from `main.css` (Foundation stage), `color-scheme: dark` (Build Service stage).

---

## Conversion rules (same as every prior stage — apply consistently)

| Old (light theme) | New (dark theme) |
|---|---|
| `bg-white`, `bg-[#f4f6f9]`, `bg-slate-50`, `bg-slate-100` (panels/inputs/dropdowns) | `bg-panel` (or `bg-panel-raised` for nested/hover/elevated surfaces) |
| `border-slate-200`, `border-slate-300` | `border-border` (or `border-border-strong` for emphasis) |
| `text-slate-900` | `text-content-primary` |
| `text-slate-500`, `text-slate-600`, `text-slate-700` | `text-content-secondary` |
| `text-slate-400` | `text-content-tertiary` |
| `hover:bg-slate-100`, `hover:bg-slate-200` | `hover:bg-panel-raised` |
| A resting state that's ALREADY `bg-panel-raised` needing a hover step lighter/darker still | `hover:bg-border-strong` (established in the TopBar stage — `panel-raised` is the lightest defined neutral tier, so this is the deliberate way to get a third, visibly-different step) |
| Status text at `-700`/`-800` on a translucent tint or solid light pastel | lighten to `-400` |
| Bare **text-only** blue (not a solid-fill button) | `text-blue-400` |
| Red text/icon-hover on a neutral (not danger-badge) context — was `-600`/`-700` | `-400` at rest; if the ORIGINAL also had a separate, more-intense hover shade (e.g. `hover:text-red-700`, meant to read "even stronger" against a light bg), the dark-theme hover should go **lighter**, not darker (darker reduces contrast against a dark background) — e.g. `text-red-400 hover:text-red-300` |

Do not touch: shared classes (`.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-pill`, `.btn-icon`, `.card`, `.card-lg`, `.card-interactive`, `.surface`, `.section-header`, `.section-title`) — already dark. Bare `<input>`/`<textarea>`/`<select>` with no explicit color classes already pick up dark styling from Foundation's global rule — only touch one that has its own explicit `bg-`/`border-`/`text-` classes. Translucent status tints (`bg-blue-500/10`, `bg-amber-500/[0.06]`, etc.) already work on any background — leave them. Solid-fill buttons with white/black text on a saturated color need no change. Do not touch any `useState`/`useEffect`/handler/prop — this is styling-only.

**One file needs zero changes:** `src/renderer/src/drawer/ScriptureDrawerTab.tsx` — confirmed by reading it: it has no `className` with a color of its own; every pixel it renders comes from `<ScripturePanel>` (Task 3). Do not create a task for it; Task 7's verification step confirms this explicitly.

---

## File structure

- Modify: `src/renderer/src/SongLibrary.tsx`
- Modify: `src/renderer/src/AnnouncementsLibrary.tsx`
- Modify: `src/renderer/src/ScriptureLookup.tsx`, `src/renderer/src/ScripturePanel.tsx`
- Modify: `src/renderer/src/BackgroundLibraryGrid.tsx`
- Modify: `src/renderer/src/drawer/SongsDrawerTab.tsx`, `src/renderer/src/drawer/AnnouncementsDrawerTab.tsx`
- Modify: `src/renderer/src/drawer/BackgroundsDrawerTab.tsx`
- **No changes:** `src/renderer/src/drawer/ScriptureDrawerTab.tsx` (see above)

**Explicitly out of scope, flagged as a known gap for whoever plans the next stage** (not named in the design spec's rollout order, discovered while reading these files): `src/renderer/src/editor/SongEditor.tsx`, `src/renderer/src/AnnouncementEditor.tsx`, `src/renderer/src/editor/BackgroundPanel.tsx` — the full per-item detail editors reached by clicking a row in `SongLibrary`/`AnnouncementsLibrary`. These remain light-themed after this stage, same category of gap as `ReflowEditor.tsx`/`ChordDisplay.tsx` flagged after the Build Service stage.

---

### Task 1: `SongLibrary.tsx`

**Files:**
- Modify: `src/renderer/src/SongLibrary.tsx`

Read the current file yourself first (340 lines) to confirm line numbers match. Apply exactly these changes — everything else (`useState`/`useEffect`/handlers) stays untouched:

**`DuplicateSongsPanel` (top of file):**
- Line 33 (trigger text): `text-amber-800` → `text-amber-400`
- Line 45 (song title in expanded list): `text-slate-700` → `text-content-secondary`
- Line 46 (Edit link): `text-slate-500 hover:text-slate-900` → `text-content-secondary hover:text-content-primary`
- Line 47 (Delete link): `text-red-600 hover:text-red-700` → `text-red-400 hover:text-red-300`
- (Line 30 container `border-amber-500/30 bg-amber-500/[0.06]` and line 40 divider `border-amber-500/20` are already-translucent tints — unchanged.)

**Delete-confirmation Modal:**
- Line 161: `className="rounded-xl border border-slate-200 bg-[#f4f6f9] p-5 shadow-lg max-w-sm"` → `className="rounded-xl border border-border bg-panel p-5 shadow-lg max-w-sm"`
- Line 162 (heading): `text-slate-900` → `text-content-primary`
- Line 163 (body text): `text-slate-600` → `text-content-secondary`
- Line 164 (song title emphasis): `text-slate-900` → `text-content-primary`
- Lines 168-169 (Cancel button): `className="flex-1 rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold hover:bg-slate-200"` → `className="flex-1 rounded-lg border border-border bg-panel-raised px-4 py-2 text-sm font-semibold hover:bg-border-strong"`
- Lines 173-175 (Delete button): unchanged — solid red fill, already correct.

**Main layout:**
- Line 182 (root wrapper): `text-slate-900` → `text-content-primary`
- Line 185 (list panel): `border-slate-200 bg-[#f4f6f9]` → `border-border bg-panel`
- Line 198 (Export button): `border-slate-300 bg-white ... text-slate-700 hover:bg-slate-100` → `border-border bg-panel text-content-secondary hover:bg-panel-raised`

**New-song naming form:**
- Line 206: `border-blue-500/30 bg-blue-500/[0.06]` — unchanged, already a translucent tint.
- Line 218 (title input, explicit override not bare): `border-slate-200 bg-white` → `border-border bg-panel`
- Line 221 (duplicate-title warning): `text-amber-700` → `text-amber-400`
- Line 229 (inline Cancel): `border-slate-200 bg-white ... text-slate-600 hover:bg-slate-100` → `border-border bg-panel text-content-secondary hover:bg-panel-raised`
- Line 236 (Create button): unchanged — solid blue fill.
- Line 245 ("New Song" button): unchanged — solid blue fill.

**Search + list:**
- Line 254 (search input, explicit override): `border-slate-200 bg-slate-100` → `border-border bg-panel-raised`
- Line 258 (empty-state text): `text-slate-500` → `text-content-secondary`
- Line 266 (item row): the `hover:bg-slate-100` branch → `hover:bg-panel-raised` (the selected branch `bg-blue-500/10 ring-1 ring-blue-500/30` is unchanged)
- Line 271 (author subtitle): `text-slate-600` → `text-content-secondary`
- Line 277 (background badge button): `bg-slate-100 ... text-slate-700 hover:bg-slate-200` → `bg-panel-raised text-content-secondary hover:bg-border-strong`
- Line 285 (remove-background icon button): `text-slate-500 hover:text-red-600` → `text-content-secondary hover:text-red-400`
- Line 294 (add-background dashed button): `border-slate-300 ... text-slate-500 hover:border-slate-400 hover:text-slate-700` → `border-border ... text-content-secondary hover:border-border-strong hover:text-content-primary`
- Line 302 (Edit button): `text-slate-500 opacity-0 hover:bg-slate-200 hover:text-slate-900` → `text-content-secondary opacity-0 hover:bg-panel-raised hover:text-content-primary`
- Line 308 (Del button): `text-slate-500 opacity-0 hover:bg-red-500/20 hover:text-red-600` → `text-content-secondary opacity-0 hover:bg-red-500/20 hover:text-red-400`
- Line 315 (footer count): `border-slate-200 ... text-slate-500` → `border-border ... text-content-secondary`

**Editor panel:**
- Line 321 (panel container): `border-slate-200 bg-[#f4f6f9]` → `border-border bg-panel`
- Line 331 (empty-state hint): `text-slate-500` → `text-content-secondary`

- [ ] **Step 1: Apply the changes above.**

- [ ] **Step 2: Verify**

Run `npm run typecheck` (NOT `npx tsc --noEmit -p .` — near no-op in this repo, root tsconfig has `files: []`) and `npm test`. Expected: clean, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/SongLibrary.tsx
git commit -m "feat(theme): dark-palette SongLibrary"
```

---

### Task 2: `AnnouncementsLibrary.tsx`

**Files:**
- Modify: `src/renderer/src/AnnouncementsLibrary.tsx`

Read the current file yourself first (183 lines) — structurally near-identical to `SongLibrary.tsx` (same list+editor layout, same naming-form pattern), so the same rules apply. Apply exactly these changes:

**Delete-confirmation Modal:**
- Line 75: `className="max-w-sm rounded-xl border border-slate-200 bg-[#f4f6f9] p-5 shadow-lg"` → `className="max-w-sm rounded-xl border border-border bg-panel p-5 shadow-lg"`
- Line 76 (heading): `text-slate-900` → `text-content-primary`
- Line 77 (body text): `text-slate-600` → `text-content-secondary`
- Line 78 (title emphasis): `text-slate-900` → `text-content-primary`
- Line 81 (Cancel button): `border-slate-200 bg-slate-100 ... hover:bg-slate-200` → `border-border bg-panel-raised ... hover:bg-border-strong`
- Line 82 (Delete button): unchanged — solid red fill.

**Main layout:**
- Line 86 (root wrapper): `text-slate-900` → `text-content-primary`
- Line 88 (list panel): `border-slate-200 bg-[#f4f6f9]` → `border-border bg-panel`

**New-announcement naming form:**
- Line 92: `border-blue-500/30 bg-blue-500/[0.06]` — unchanged, translucent tint.
- Line 105 (title input, explicit override): `border-slate-200 bg-white` → `border-border bg-panel`
- Line 108 (duplicate-title warning): `text-amber-700` → `text-amber-400`
- Line 116 (inline Cancel): `border-slate-200 bg-white ... text-slate-600 hover:bg-slate-100` → `border-border bg-panel text-content-secondary hover:bg-panel-raised`
- Line 123, 132 (Create / "New Announcement" buttons): unchanged — solid blue fill.

**Search + list:**
- Line 141 (search input, explicit override): `border-slate-200 bg-slate-100` → `border-border bg-panel-raised`
- Line 145 (empty-state text): `text-slate-500` → `text-content-secondary`
- Line 150 (item row): the `hover:bg-slate-100` branch → `hover:bg-panel-raised` (selected branch `bg-blue-500/10 ring-1 ring-blue-500/30` unchanged; `it.expired ? 'opacity-50' : ''` unchanged, theme-agnostic)
- Line 152 (type-icon circle): `bg-slate-100 text-slate-600` → `bg-panel-raised text-content-secondary`
- Line 157 (subtitle): `text-slate-500` → `text-content-secondary`
- Line 161 (Del button): `text-slate-500 opacity-0 hover:bg-red-500/20 hover:text-red-600` → `text-content-secondary opacity-0 hover:bg-red-500/20 hover:text-red-400`
- Line 165 (footer count): `border-slate-200 ... text-slate-500` → `border-border ... text-content-secondary`

**Editor panel:**
- Line 168 (panel container): `border-slate-200 bg-[#f4f6f9]` → `border-border bg-panel`
- Line 174 (empty-state hint): `text-slate-500` → `text-content-secondary`

- [ ] **Step 1: Apply the changes above.**

- [ ] **Step 2: Verify**

Run `npm run typecheck` and `npm test`. Expected: clean, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/AnnouncementsLibrary.tsx
git commit -m "feat(theme): dark-palette AnnouncementsLibrary"
```

---

### Task 3: `ScriptureLookup.tsx` and `ScripturePanel.tsx`

**Files:**
- Modify: `src/renderer/src/ScriptureLookup.tsx`
- Modify: `src/renderer/src/ScripturePanel.tsx`

Read both current files first (143 and 36 lines). `ScripturePanel.tsx` is the shared component `ScriptureDrawerTab.tsx` renders — see this plan's intro for why it's in scope even though the design spec doesn't name it.

**`ScripturePanel.tsx`** — only one change needed (it already uses `.surface`/`.section-header`/bare `<input>`/`.btn-primary`/`.btn`, all already dark):
- Line 32 (translation-note hint): `text-[10px] text-slate-500` → `text-[10px] text-content-secondary`

**`ScriptureLookup.tsx`**:
- Line 66 (root wrapper): `text-slate-900` → `text-content-primary`
- Line 74 (reference input, explicit override): `border-slate-200 bg-slate-100 ... text-slate-900 placeholder:text-slate-500` → `border-border bg-panel-raised ... text-content-primary placeholder:text-content-secondary`
- Line 79 (Look up button): unchanged — solid blue fill.
- Line 90 (quick-reference pill buttons): `border-slate-200 bg-white ... text-slate-700 hover:bg-slate-100` → `border-border bg-panel text-content-secondary hover:bg-panel-raised`
- Line 97 (results panel container): `border-slate-200 bg-[#f4f6f9]` → `border-border bg-panel`
- Line 99 (empty-state hint): `text-slate-500` → `text-content-secondary`
- Line 104 (lookup-error text): `text-amber-700` → `text-amber-400`
- Line 109 (reference heading): `text-slate-900` → `text-content-primary`
- The "Add to service" (`.btn`) / "Send live" (`.btn-primary`) buttons at lines 115/119 are unchanged — shared classes already dark.
- Line 127 (verse text): `text-slate-900` → `text-content-primary`
- Line 128 (verse-number superscript): `text-blue-700` → `text-blue-400`
- Line 133 (verse-count footer): `text-slate-500` → `text-content-secondary`

- [ ] **Step 1: Apply the changes above to both files.**

- [ ] **Step 2: Verify**

Run `npm run typecheck` and `npm test`. Expected: clean, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/ScriptureLookup.tsx src/renderer/src/ScripturePanel.tsx
git commit -m "feat(theme): dark-palette ScriptureLookup and ScripturePanel"
```

---

### Task 4: `BackgroundLibraryGrid.tsx`

**Files:**
- Modify: `src/renderer/src/BackgroundLibraryGrid.tsx`

Read the current file yourself first (600 lines — the largest file in this stage). Apply exactly these changes — go through them methodically, one at a time:

**Mood-filter section:**
- Line 242 (container): `border-slate-200 bg-white` → `border-border bg-panel`
- Line 243 (label): `text-slate-600` → `text-content-secondary`
- Line 257 (unselected mood-tag button, within the `[...]join(' ')` array): `'bg-slate-100 text-slate-600 hover:bg-slate-200'` → `'bg-panel-raised text-content-secondary hover:bg-border-strong'` (the selected branch `bg-blue-600 text-white` is unchanged)
- Line 267 ("Clear filters"): `text-slate-500 hover:text-slate-700` → `text-content-secondary hover:text-content-primary`

**Folder rail (this pattern repeats 3 times for the "All"/"Uncategorized"/named-folder pills — apply identically to all three):**
- Lines 280, 292, 327 (unselected-pill branch in each pill's class array): `'bg-slate-100 text-slate-600 hover:bg-slate-200'` → `'bg-panel-raised text-content-secondary hover:bg-border-strong'` (the selected branch `bg-blue-600 text-white` and the `ring-2 ring-blue-400 ring-offset-1` drag-over state are unchanged in all three)
- Line 314 (rename input, explicit override): `border-slate-300` → `border-border`
- Line 316 ("Save" rename link): `text-blue-700` → `text-blue-400`
- Line 336, 343 (pencil/delete icon buttons on a folder pill — both hidden-until-hover): no explicit color class beyond opacity/positioning, leave as-is (they inherit icon color from context, confirm by reading — if you find an explicit `text-slate-*` here the plan missed, apply the standard secondary/tertiary mapping and note it in your report)
- Line 362 (create-folder input, explicit override): `border-slate-300` → `border-border`
- Line 364 ("Add" link): `text-blue-700` → `text-blue-400`
- Line 369 ("+ New folder" dashed button): `border-slate-300 ... text-slate-500 hover:border-slate-400 hover:text-slate-700` → `border-border ... text-content-secondary hover:border-border-strong hover:text-content-primary`

**Drag-drop zone + Open folder:**
- Lines 389-390 (drop-zone button, both branches): dragging branch `'border-blue-400 bg-blue-500/10 text-blue-700'` → `'border-blue-400 bg-blue-500/10 text-blue-400'`; resting branch `'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700'` → `'border-border text-content-secondary hover:border-border-strong hover:bg-panel-raised hover:text-content-primary'`
- Line 395 ("or click to browse" hint): `text-slate-500` → `text-content-secondary`
- Line 400 ("Open folder" button): `border-slate-200 text-slate-600 ... hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700` → `border-border text-content-secondary ... hover:border-border-strong hover:bg-panel-raised hover:text-content-primary`

**Count/refresh row:**
- Line 410 (count text): `text-slate-500` → `text-content-secondary`
- Line 418 ("Refresh" link): `text-blue-700` → `text-blue-400`

**Thumbnail grid:**
- Lines 426, 428 (empty-state texts): `text-slate-400` → `text-content-tertiary` (both)
- Lines 447-449 (thumbnail card ring state): active branch `'ring-2 ring-blue-500 ring-offset-1 ring-offset-[#f4f6f9]'` → `'ring-2 ring-blue-500 ring-offset-1 ring-offset-panel'` (the literal light-theme hex offset color needs to become the dark `panel` token, same fix pattern as `HeaderEditor.tsx`'s swatch ring in the Build Service stage); resting branch `'ring-1 ring-slate-200 hover:ring-slate-300 hover:scale-[1.02]'` → `'ring-1 ring-border hover:ring-border-strong hover:scale-[1.02]'`
- Lines 524, 530 (tag pill background on thumbnails): `bg-slate-700/80 text-slate-200` — **leave unchanged**. These tag pills already sit directly on top of a photo/video thumbnail (not the app chrome), and a semi-opaque dark chip with light text is exactly the right treatment regardless of the surrounding app theme — this was already correct before the redesign and stays correct now.

**Tag-editing Modal:**
- Line 544: `className="w-full max-w-sm rounded-xl border border-slate-200 bg-[#f4f6f9] p-4 shadow-2xl"` → `className="w-full max-w-sm rounded-xl border border-border bg-panel p-4 shadow-2xl"`
- Line 545 (heading): `text-slate-900` → `text-content-primary`
- Line 562 (unselected tag-chip branch, within the class array): `'bg-slate-100 text-slate-700 hover:bg-slate-200'` → `'bg-panel-raised text-content-secondary hover:bg-border-strong'` (selected branch `bg-blue-600 text-white` unchanged)
- Line 573 (tags textarea, explicit override): `border-slate-200 bg-slate-100 ... text-slate-900 ... placeholder:text-slate-400` → `border-border bg-panel-raised ... text-content-primary ... placeholder:text-content-tertiary`
- Line 582 (Save button): unchanged — solid blue fill.
- Line 591 (Cancel button): `border-slate-200 bg-white ... text-slate-700 hover:bg-slate-100` → `border-border bg-panel text-content-secondary hover:bg-panel-raised`

- [ ] **Step 1: Apply the changes above.**

- [ ] **Step 2: Verify**

Run `npm run typecheck` and `npm test`. Expected: clean, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/BackgroundLibraryGrid.tsx
git commit -m "feat(theme): dark-palette BackgroundLibraryGrid"
```

---

### Task 5: `SongsDrawerTab.tsx` and `AnnouncementsDrawerTab.tsx`

**Files:**
- Modify: `src/renderer/src/drawer/SongsDrawerTab.tsx`
- Modify: `src/renderer/src/drawer/AnnouncementsDrawerTab.tsx`

Read both current files first (60 and 57 lines — nearly identical structure). Apply the same mapping to both:

**`SongsDrawerTab.tsx`**:
- Line 39 (search input, explicit override): `rounded border border-slate-300 px-2 py-1 text-sm` → `rounded border border-border px-2 py-1 text-sm`
- Line 42 (empty-state text): `text-xs text-slate-400` → `text-xs text-content-tertiary`
- Line 48 (song-row button): `border-slate-200 ... hover:border-blue-400 hover:bg-blue-50` → `border-border ... hover:border-blue-400 hover:bg-blue-500/10`
- Line 52 (author text): `text-slate-400` → `text-content-tertiary`
- Line 54 (Play icon): `text-blue-600` — leave unchanged, this is a small icon-only accent on an otherwise-unstyled row and blue-600 still reads fine as an icon color; if you want extra polish you may change it to `text-blue-400` for consistency with the rest of this stage's bare-text-blue convention, but it is not required.

**`AnnouncementsDrawerTab.tsx`** (identical pattern):
- Line 39 (search input, explicit override): `rounded border border-slate-300 px-2 py-1 text-sm` → `rounded border border-border px-2 py-1 text-sm`
- Line 42 (empty-state text): `text-xs text-slate-400` → `text-xs text-content-tertiary`
- Line 48 (item-row button): `border-slate-200 ... hover:border-blue-400 hover:bg-blue-50` → `border-border ... hover:border-blue-400 hover:bg-blue-500/10`
- Line 51 (Play icon): same note as above — optional `text-blue-400` polish, not required.

- [ ] **Step 1: Apply the changes above to both files.**

- [ ] **Step 2: Verify**

Run `npm run typecheck` and `npm test`. Expected: clean, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/drawer/SongsDrawerTab.tsx src/renderer/src/drawer/AnnouncementsDrawerTab.tsx
git commit -m "feat(theme): dark-palette SongsDrawerTab and AnnouncementsDrawerTab"
```

---

### Task 6: `BackgroundsDrawerTab.tsx`

**Files:**
- Modify: `src/renderer/src/drawer/BackgroundsDrawerTab.tsx`

Read the current file first (163 lines). Apply exactly these changes:

**Folder rail (repeats 3 times — "All"/"Uncategorized"/named-folder pills, apply identically):**
- Lines 109, 118, 129 (unselected-pill branch in each pill's class array): `'bg-slate-100 text-slate-600 hover:bg-slate-200'` → `'bg-panel-raised text-content-secondary hover:bg-border-strong'` (selected branch `bg-blue-600 text-white` unchanged in all three)

**Thumbnail grid:**
- Lines 139, 141 (empty-state texts): `text-xs text-slate-400` → `text-xs text-content-tertiary` (both)
- Line 148 (thumbnail button): `border-slate-200 hover:border-blue-400` → `border-border hover:border-blue-400`

- [ ] **Step 1: Apply the changes above.**

- [ ] **Step 2: Verify**

Run `npm run typecheck` and `npm test`. Expected: clean, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/drawer/BackgroundsDrawerTab.tsx
git commit -m "feat(theme): dark-palette BackgroundsDrawerTab"
```

---

### Task 7: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Typecheck, lint, test**

Run `npm run typecheck`, `npm run lint`, `npm test`.
Expected: typecheck clean, lint 0 errors (pre-existing warnings in unrelated files are fine), all tests pass.

- [ ] **Step 2: Confirm `ScriptureDrawerTab.tsx` is genuinely untouched**

```bash
git diff --stat <base-commit>..HEAD -- src/renderer/src/drawer/ScriptureDrawerTab.tsx
```
Expected: no output (zero diff) — confirms the "no changes needed" call in this plan's intro was correct.

- [ ] **Step 3: Build and visually verify**

Build the renderer (`npm run build`) and view it (the established pattern from prior stages — serve `out/renderer` and either take a screenshot or, if the Browser pane can't composite frames, verify via computed-style checks in the browser's JS console, which every prior stage has used successfully). Navigate to each of the four library screens and confirm:

- **Songs**: list panel and editor panel are dark, item rows read clearly (selected vs. hover vs. resting), the background-badge/add-background controls on each row are legible, the "New Song" naming form and its duplicate-title warning are legible, the delete-confirmation modal is dark and legible.
- **Announcements**: same checks as Songs (list/editor panels, item rows, naming form, delete modal).
- **Scripture**: look up a passage (e.g. "John 3:16"), confirm the results panel, verse text, and verse-number superscripts are legible; confirm the quick-reference pill buttons and the "Add to service"/"Send live" buttons read correctly.
- **Backgrounds**: confirm the mood-filter tags, folder-rail pills (including creating/renaming a folder), drag-drop zone, thumbnail grid (including the selected-thumbnail ring — this is the one place with the same `ring-offset` fix pattern from the Build Service stage, worth a specific look), and the tag-editing modal are all legible.
- Open the app-wide bottom drawer (Songs/Scripture/Announcements/Backgrounds tabs) and confirm each drawer-tab variant reads correctly, including Scripture (via `ScripturePanel`).

- [ ] **Step 4: Report status**

If everything in Step 3 looks right, this stage is done. Also explicitly report the two known gaps discovered during this stage's planning, for whoever scopes the next one:
- `src/renderer/src/editor/SongEditor.tsx`, `src/renderer/src/AnnouncementEditor.tsx`, `src/renderer/src/editor/BackgroundPanel.tsx` — the full per-item detail editors, still light-themed, not named in the design spec's rollout order.
- (Carried over from the Build Service stage, still open) `src/renderer/src/ReflowEditor.tsx`, `src/renderer/src/ChordDisplay.tsx`.

The next stage per the design spec's rollout order is Setup pages (`ScreensZonesTab.tsx`, `ObsConnectTab.tsx`, `TabletRemoteTab.tsx`, `RoomFeedTab.tsx`, `DiagnosticsTab.tsx`, `LogoSettings.tsx`, sound-check screens) — write that as its own plan when it starts.

---

## Self-Review

**Spec coverage:** All four files the design spec's rollout order names for this stage, plus all four of their drawer-tab variants (a more complete scope than the spec's own shorthand implies without enumeration, same pattern as every prior stage). The one drawer tab needing zero changes is stated explicitly, not silently skipped. The one undocumented dependency this scope required (`ScripturePanel.tsx`) is explained, not silently pulled in.

**Placeholder scan:** Every task gives exact line numbers, the exact current className string, and the exact replacement. The two spots where a line-number reference might drift slightly (the pencil/delete icon buttons in `BackgroundLibraryGrid.tsx`'s folder rail, and the optional Play-icon polish in the drawer tabs) are called out explicitly as "verify and use your judgment," not silently glossed over as certain.

**Type consistency:** No component props, exported types, or function signatures change anywhere in this plan — every task is `className`-string-only.
