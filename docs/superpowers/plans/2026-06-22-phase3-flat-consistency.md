# Phase 3 Flat Consistency Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Services, Songs, and Scripture tabs to match the flat Phase 1/2 shell — solid dark panels, no glassmorphism, consistent borders and sidebar tones.

**Architecture:** Pure styling sweep across 8 files. The flat conventions (`#1a1a1d` panels, `#15151a` sidebars, `white/[0.07]` borders) are already established in SlideGrid, LiveTools, and the AppShell; this plan propagates them into the remaining operator tabs. No logic, IPC, or behavior changes.

**Tech Stack:** React 18 + TypeScript + Tailwind v3 + Electron. App lives at `C:\Dev\worshipflow`. Run with `npm run dev` from that directory. Typecheck with `npm run typecheck`.

---

## File map

| File | Change |
|------|--------|
| `src/renderer/src/assets/main.css` | Remove `backdrop-filter: blur(10px)`, `border-2`, and glass `background` from global input rule; update focus state |
| `src/renderer/src/ServiceBuilder.tsx` | Services sidebar → `#15151a`; open-service panel → `#1a1a1d` |
| `src/renderer/src/ThemePicker.tsx` | Strip glass (`bg-black/20`) → `bg-[#1a1a1d]` |
| `src/renderer/src/CcliPanel.tsx` | Strip glass; modal → `bg-[#1a1a1d]` |
| `src/renderer/src/PptxImport.tsx` | Modal background → `bg-[#1a1a1d]` |
| `src/renderer/src/CardEditPanel.tsx` | Side panel → `bg-[#15151a]` |
| `src/renderer/src/SongLibrary.tsx` | Sidebar → `#15151a`; editor panel → `#1a1a1d` |
| `src/renderer/src/ScriptureLookup.tsx` | Result area → `bg-[#1a1a1d]` |

---

## Task 1: Fix global input/textarea/select styles in main.css

**Files:**
- Modify: `src/renderer/src/assets/main.css:257-302`

The `@layer components` block applies `backdrop-filter: blur(10px)`, a thick `border-2`, and `background: var(--wf-glass-bg)` (semi-transparent blue-dark) to every input/textarea/select in the app. These three properties are the source of the glass look. Replace them with a flat neutral dark background and a thin border.

Also fix the focus rule: remove the purple glow box-shadow and the `--wf-bg-secondary` background swap (both reinforce the old theme-variable era). The focus state should only change the border color.

- [ ] **Step 1: Replace the input/textarea/select @layer block**

In `src/renderer/src/assets/main.css`, find the `@layer components { input, textarea, select { ... } }` block (lines 257–302) and replace the entire block with:

```css
@layer components {
  input, textarea, select {
    @apply rounded-lg border px-4 py-2.5 text-sm font-medium;
    background: rgba(0, 0, 0, 0.3);
    border-color: var(--wf-border);
    color: var(--wf-text-primary);
    transition: all 200ms;
  }

  /* Native dropdown options: always dark + readable so popups never render
     invisible (white-on-light) in any theme. */
  option {
    background-color: #1e293b;
    color: #ffffff;
  }

  input::placeholder, textarea::placeholder {
    color: var(--wf-text-secondary);
    opacity: 0.6;
  }

  input:focus, textarea:focus, select:focus {
    outline: none;
    border-color: var(--wf-primary);
  }

  /* Input with validation */
  input.valid {
    border-color: var(--wf-success);
  }

  input.error {
    border-color: var(--wf-error);
  }
}
```

- [ ] **Step 2: Run typecheck**

```
cd C:\Dev\worshipflow
npm run typecheck
```

Expected: exits with no errors (CSS changes don't affect TS types).

- [ ] **Step 3: Commit**

```
git add src/renderer/src/assets/main.css
git commit -m "style: remove glass blur/border-2 from global input rule"
```

---

## Task 2: Restyle ServiceBuilder.tsx panels

**Files:**
- Modify: `src/renderer/src/ServiceBuilder.tsx:157-242`

Two panels need to change:
- The **services list** (left narrow column, line 159): `bg-white/[0.03]` → `bg-[#15151a]` and `border-white/10` → `border-white/[0.07]`
- The **open-service panel** (right main area, line 199): `bg-white/[0.03]` → `bg-[#1a1a1d]` and `border-white/10` → `border-white/[0.07]`

- [ ] **Step 1: Update the services list div class**

Find line 159 in `src/renderer/src/ServiceBuilder.tsx`:
```tsx
        <div className="flex w-72 flex-col rounded-xl border border-white/10 bg-white/[0.03] p-3">
```
Replace with:
```tsx
        <div className="flex w-72 flex-col rounded-xl border border-white/[0.07] bg-[#15151a] p-3">
```

- [ ] **Step 2: Update the open-service panel div class**

Find line 199:
```tsx
        <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-white/10 bg-white/[0.03] p-4">
```
Replace with:
```tsx
        <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-white/[0.07] bg-[#1a1a1d] p-4">
```

- [ ] **Step 3: Run typecheck**

```
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```
git add src/renderer/src/ServiceBuilder.tsx
git commit -m "style: flat panels in ServiceBuilder"
```

---

## Task 3: Restyle ThemePicker.tsx

**Files:**
- Modify: `src/renderer/src/ThemePicker.tsx:31`

The collapsible theme panel uses `bg-black/20` (glass-ish input well). Change it to a flat panel.

- [ ] **Step 1: Update the outer div class**

Find line 31 in `src/renderer/src/ThemePicker.tsx`:
```tsx
    <div className="mb-3 rounded-lg border border-white/10 bg-black/20 p-2">
```
Replace with:
```tsx
    <div className="mb-3 rounded-lg border border-white/[0.07] bg-[#1a1a1d] p-2">
```

- [ ] **Step 2: Run typecheck and commit**

```
npm run typecheck
git add src/renderer/src/ThemePicker.tsx
git commit -m "style: flat panel in ThemePicker"
```

---

## Task 4: Restyle CcliPanel.tsx

**Files:**
- Modify: `src/renderer/src/CcliPanel.tsx:58,84`

Two surfaces need updating:
- The inline panel (line 58): `bg-black/20` → `bg-[#1a1a1d]`
- The usage-report modal backdrop panel (line 84): `bg-[var(--wf-bg-secondary)]` → `bg-[#1a1a1d]` (the CSS variable points to `#1e293b`, a blue-tinted dark from the old theme era)
- The modal's sticky `thead` also references `bg-[var(--wf-bg-secondary)]` (line 113) — update it to match

- [ ] **Step 1: Update the inline CCLI panel**

Find line 58:
```tsx
    <div className="mb-3 rounded-lg border border-white/10 bg-black/20 p-2">
```
Replace with:
```tsx
    <div className="mb-3 rounded-lg border border-white/[0.07] bg-[#1a1a1d] p-2">
```

- [ ] **Step 2: Update the modal panel background**

Find line 84 (the inner modal div, not the backdrop overlay):
```tsx
            className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-[var(--wf-bg-secondary)] p-4 shadow-2xl"
```
Replace with:
```tsx
            className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-white/[0.07] bg-[#1a1a1d] p-4 shadow-2xl"
```

- [ ] **Step 3: Update the sticky thead background to match**

Find line 113:
```tsx
                  <thead className="sticky top-0 bg-[var(--wf-bg-secondary)] text-slate-500">
```
Replace with:
```tsx
                  <thead className="sticky top-0 bg-[#1a1a1d] text-slate-500">
```

- [ ] **Step 4: Run typecheck and commit**

```
npm run typecheck
git add src/renderer/src/CcliPanel.tsx
git commit -m "style: flat panels in CcliPanel"
```

---

## Task 5: Restyle PptxImport.tsx

**Files:**
- Modify: `src/renderer/src/PptxImport.tsx:56,69`

The import preview modal uses `bg-[var(--wf-bg-secondary)]` (blue-dark from old theme). Update the modal panel and the per-song row wells.

- [ ] **Step 1: Update the modal panel background**

Find line 56 (the inner modal div):
```tsx
            className="flex max-h-[82vh] w-full max-w-3xl flex-col rounded-xl border border-white/10 bg-[var(--wf-bg-secondary)] p-4 shadow-2xl"
```
Replace with:
```tsx
            className="flex max-h-[82vh] w-full max-w-3xl flex-col rounded-xl border border-white/[0.07] bg-[#1a1a1d] p-4 shadow-2xl"
```

- [ ] **Step 2: Update the per-song row wells**

Find line 69:
```tsx
                <div key={i} className="rounded-lg border border-white/10 bg-black/20 p-2">
```
Replace with:
```tsx
                <div key={i} className="rounded-lg border border-white/[0.07] bg-black/30 p-2">
```

- [ ] **Step 3: Run typecheck and commit**

```
npm run typecheck
git add src/renderer/src/PptxImport.tsx
git commit -m "style: flat modal in PptxImport"
```

---

## Task 6: Restyle CardEditPanel.tsx

**Files:**
- Modify: `src/renderer/src/CardEditPanel.tsx:66`

This is the right-side edit panel that appears when a card is selected. It uses `bg-white/[0.03]` (glass overlay). As a sidebar/panel, it should be `bg-[#15151a]`.

- [ ] **Step 1: Update the outer panel class**

Find line 66:
```tsx
    <div className="flex w-80 shrink-0 flex-col gap-3 overflow-auto rounded-xl border border-white/10 bg-white/[0.03] p-3">
```
Replace with:
```tsx
    <div className="flex w-80 shrink-0 flex-col gap-3 overflow-auto rounded-xl border border-white/[0.07] bg-[#15151a] p-3">
```

- [ ] **Step 2: Run typecheck and commit**

```
npm run typecheck
git add src/renderer/src/CardEditPanel.tsx
git commit -m "style: flat side panel in CardEditPanel"
```

---

## Task 7: Restyle SongLibrary.tsx

**Files:**
- Modify: `src/renderer/src/SongLibrary.tsx:155,223`

Two panels:
- **Library list** (left, line 155): `bg-white/[0.03]` → `bg-[#15151a]` (sidebar tone)
- **Editor form** (right, line 223): `bg-white/[0.03]` → `bg-[#1a1a1d]` (panel tone)

The arrangement editor wells (lines 287, 346, 366) use `bg-black/20` — change these to `bg-black/30` (consistent with the darker input-well convention, and the readability layer will boost them appropriately).

- [ ] **Step 1: Update the library list panel**

Find line 155:
```tsx
      <div className="flex w-96 flex-col rounded-xl border border-white/10 bg-white/[0.03] p-3">
```
Replace with:
```tsx
      <div className="flex w-96 flex-col rounded-xl border border-white/[0.07] bg-[#15151a] p-3">
```

- [ ] **Step 2: Update the editor form panel**

Find line 223:
```tsx
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-white/10 bg-white/[0.03] p-4">
```
Replace with:
```tsx
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-white/[0.07] bg-[#1a1a1d] p-4">
```

- [ ] **Step 3: Update the arrangement editor wells**

Find line 287:
```tsx
          <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
```
Replace with:
```tsx
          <div className="mt-3 rounded-lg border border-white/[0.07] bg-black/30 p-3">
```

Find line 346:
```tsx
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
```
Replace with:
```tsx
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-white/[0.07] bg-black/30 px-3 py-2">
```

Find line 366:
```tsx
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
```
Replace with:
```tsx
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-white/[0.07] bg-black/30 px-3 py-2">
```

- [ ] **Step 4: Run typecheck and commit**

```
npm run typecheck
git add src/renderer/src/SongLibrary.tsx
git commit -m "style: flat panels in SongLibrary"
```

---

## Task 8: Restyle ScriptureLookup.tsx

**Files:**
- Modify: `src/renderer/src/ScriptureLookup.tsx:56`

The passage result area uses `bg-white/[0.03]` with `border-white/10`. Update to flat panel.

- [ ] **Step 1: Update the result area**

Find line 56:
```tsx
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-white/10 bg-white/[0.03] p-5">
```
Replace with:
```tsx
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-white/[0.07] bg-[#1a1a1d] p-5">
```

- [ ] **Step 2: Run typecheck and commit**

```
npm run typecheck
git add src/renderer/src/ScriptureLookup.tsx
git commit -m "style: flat result panel in ScriptureLookup"
```

---

## Task 9: Boot and visual verify

- [ ] **Step 1: Start the app**

```
cd C:\Dev\worshipflow
npm run dev
```

- [ ] **Step 2: Check Services tab**

Open the app → click **Services** tab. Confirm:
- Left services list: solid `#15151a` dark sidebar (not glassy or glass-overlay)
- Right open-service area: solid `#1a1a1d` panel
- ThemePicker collapsible section: solid `#1a1a1d`
- CardEditPanel (click a card): solid `#15151a` right side panel
- Inputs and textareas: no blur effect, thin border, dark well

- [ ] **Step 3: Check Songs tab**

Click **Songs** tab. Confirm:
- Left library list: solid `#15151a` sidebar
- Right editor form: solid `#1a1a1d` panel
- CCLI section at top of library list: solid `#1a1a1d` panel (not glassy)
- "Import from PowerPoint" button triggers modal → modal background is `#1a1a1d`
- "📊 Usage Report" triggers CCLI modal → modal background is `#1a1a1d`
- Arrangement editor wells (visible when editing a song with 2+ sections): flat dark wells

- [ ] **Step 4: Check Scripture tab**

Click **Scripture** tab. Confirm:
- Passage result area: solid `#1a1a1d` panel
- Search input: flat dark well, thin border, no blur

- [ ] **Step 5: Check Live tab regression**

Click **Live** tab. Confirm:
- SlideGrid panels still show correct `#1a1a1d` styling
- LiveTools right panel still correct
- No visual regressions

- [ ] **Step 6: Final commit**

```
git add .
git commit -m "phase 3 complete: flat consistency pass across Services, Songs, Scripture"
```

---

## Self-review

**Spec coverage:**
- ✓ App background `#2b2b30` — already in CSS, no change needed
- ✓ Panels `#1a1a1d` with `white/[0.07]` borders — Tasks 2, 3, 4, 5, 6, 7, 8
- ✓ Sidebars `#15151a` — Tasks 2 (services list), 6 (CardEditPanel), 7 (library list)
- ✓ No glassmorphism — Task 1 removes `backdrop-filter: blur` globally; individual `bg-white/[0.03]` glass overlays replaced in Tasks 2–8
- ✓ Dark dropdowns — `option { background-color: #1e293b }` preserved in Task 1's new block
- ✓ CcliPanel (inline + modal) — Task 4
- ✓ PptxImport modal — Task 5
- ✓ main.css glass input rule — Task 1
- ✓ Out of scope (Output.tsx, Stage.tsx, tablet HTML) — not touched

**Placeholder scan:** No TBDs, todos, or vague steps.

**Type consistency:** No types changed; all edits are className strings.
