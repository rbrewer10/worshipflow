# Visual Redesign — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the foundation for WorshipFlow's dark-theme visual redesign — reskin the existing shared CSS component-class system to the new navy/graphite-and-blue palette (instant win across the files that already use it), add Tailwind config tokens for later per-screen migration, and set up the motion/utility infrastructure (Framer Motion, a `cn()` classnames helper) the rest of the redesign will build on. This stage changes no screen's structure or behavior — only the shared styling layer underneath it.

**Palette update (2026-08-17):** this plan originally specified a single achromatic near-black background and a single emerald accent shared by every primary/selection/focus interaction (matching the design spec's original, pre-amendment decision). The spec's 2026-08-16 amendment changed that: navy-tinted backgrounds (not achromatic), warm ivory text (not cool gray), **Snow Hill blue** for selection/focus/general primary actions, **champagne gold** as a rare premium accent, and **emerald narrowed to ready/on-air/live state only** — a real status color on par with amber (Rehearsal)/violet (Stage Rehearsal)/red (danger), not the app-wide accent anymore. The amendment left exact hex values for implementation to pick; those were chosen below, previewed to Ryan as a small mockup (navy panel + ivory text + blue "Go live" button + emerald "Live" badge + a gold accent detail), and confirmed before writing this plan's task bodies. Every hex value in Tasks 2/4/5/6/7/8/9 reflects that confirmed palette, not the original spec draft's values.

**Architecture:** WorshipFlow already has a centralized `@layer components` block in `src/renderer/src/assets/main.css` (`.btn`, `.btn-primary`, `.card`, `.surface`, `.badge`, etc., all using hardcoded light-theme hex values) that files across the renderer already reference via plain `className="btn-primary"` strings. Reskinning that one file's color values is the single highest-leverage change in the whole redesign — every consuming file gets the new look with zero changes to its own code. Separately, `tailwind.config.js` gets semantic color tokens (`bg-app`, `bg-panel`, `text-content-primary`, etc.) for use directly in JSX className strings during later per-screen migration stages (raw `bg-white`/`bg-slate-100` usage that doesn't go through the shared classes). A new `cn()` helper (clsx + tailwind-merge) and a `motion.ts` preset module (Framer Motion) round out the infrastructure later stages will need.

**Tech Stack:** React, Tailwind CSS v3, Framer Motion (new), clsx + tailwind-merge (new), Vitest.

---

## Confirmed palette

| Role | Value(s) | Used for |
|---|---|---|
| `bg-app` | `#0b0f1a` | Window/app background |
| `bg-panel` | `#131a29` | Cards, panels, sidebars |
| `bg-panel-raised` | `#1c2536` | Hover states, nested panels, modals |
| `border` | `#212a3d` | Default dividers/outlines |
| `border-strong` | `#2f3b52` | Emphasized borders, hover borders |
| `text-primary` | `#efe7d8` | Main content/labels (warm ivory) |
| `text-secondary` | `#a89e8c` | Secondary labels, metadata |
| `text-tertiary` | `#6f6858` | Disabled/placeholder |
| **Snow Hill blue** (selection, focus, general primary actions) | `#93c5fd` / `#60a5fa` / `#3b82f6` / `#2563eb` (Tailwind `blue-300/400/500/600`) | Primary buttons, focus rings, selected/active state |
| **Champagne gold** (premium accents only, sparingly) | `#d9bd85` / `#c9a466` / `#a8823f` | Rare highlight details — not a general UI color |
| **Emerald** (ready/on-air/live state only) | `#34d399` / `#10b981` / `#059669` (Tailwind `emerald-400/500/600`) | Live/on-air/ready indicators — a status color, not the app accent |
| Rehearsal Mode | `#f59e0b` / `#fbbf24` (amber) | Unchanged from original spec |
| Stage Rehearsal | `#8b5cf6` (violet) | Unchanged — matches existing `text-violet-700` convention |
| Danger/destructive | `#dc2626` / `#ef4444` / `#fca5a5` (red) | Unchanged from original spec |

---

## File structure

- Modify: `package.json` — add `framer-motion`, `clsx`, `tailwind-merge` to `dependencies`.
- Modify: `tailwind.config.js` — add semantic color tokens.
- Create: `src/renderer/src/ui/cn.ts` — classnames merge helper.
- Create: `src/renderer/src/ui/cn.test.ts` — its tests.
- Create: `src/renderer/src/ui/motion.ts` — shared Framer Motion presets for later stages.
- Modify: `src/renderer/src/assets/main.css` — full color reskin of `:root`, `body`, `.btn*`, `.card*`/`.surface`, inputs, `.section-*`/`.badge*`, scrollbar; removes 3 dead/unused alternate-theme blocks (`data-theme="minimalist"` etc. — confirmed unused, `data-theme` is never set anywhere in the app).

No other files are touched in this stage — screens still render with their current structure, just picking up the new shared colors automatically wherever they already use `.btn`/`.card`/`.badge`/etc.

---

### Task 1: Add dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the three new dependencies**

In `package.json`, in the `"dependencies"` block (currently starts at line 23), add three entries so the block reads:

```json
  "dependencies": {
    "clsx": "^2.1.1",
    "electron-store": "^8.1.0",
    "electron-updater": "^6.8.9",
    "ffmpeg-static": "^5.3.0",
    "fft.js": "^4.0.4",
    "framer-motion": "^11.15.0",
    "jszip": "^3.10.1",
    "lucide-react": "^1.24.0",
    "mic": "^2.1.2",
    "obs-websocket-js": "^5.0.8",
    "osc": "^2.4.5",
    "qrcode": "^1.5.4",
    "sql.js": "^1.14.1",
    "tailwind-merge": "^2.6.0",
    "ws": "^8.21.0"
  },
```

(Keep the list alphabetically sorted, matching the existing convention. If any of these three exact version ranges no longer resolve, use the closest current major-compatible version instead — the versions here are a good-faith pin, not load-bearing.)

- [ ] **Step 2: Install**

Run: `npm install`
Expected: no errors; `node_modules/framer-motion`, `node_modules/clsx`, and `node_modules/tailwind-merge` now exist.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add framer-motion, clsx, tailwind-merge for the visual redesign"
```

---

### Task 2: Tailwind config semantic color tokens

**Files:**
- Modify: `tailwind.config.js`

- [ ] **Step 1: Replace the file**

Replace the entire contents of `tailwind.config.js` with:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        app: '#0b0f1a',
        panel: '#131a29',
        'panel-raised': '#1c2536',
        border: {
          DEFAULT: '#212a3d',
          strong: '#2f3b52',
        },
        content: {
          primary: '#efe7d8',
          secondary: '#a89e8c',
          tertiary: '#6f6858',
        },
        gold: {
          DEFAULT: '#c9a466',
          light: '#d9bd85',
          dark: '#a8823f',
        },
        status: {
          rehearsal: '#f59e0b',
          'stage-rehearsal': '#8b5cf6',
        },
      },
    },
  },
  plugins: [],
}
```

This generates utilities used in later per-screen migration stages: `bg-app`, `bg-panel`, `bg-panel-raised`, `border-border`/`border-border-strong` (Tailwind's standard naming when a color is itself named `border` — the same convention shadcn/ui uses), `text-content-primary`/`-secondary`/`-tertiary`, `bg-gold`/`text-gold`/`bg-gold-light`/`bg-gold-dark`, `bg-status-rehearsal`/`text-status-rehearsal`, `bg-status-stage-rehearsal`/`text-status-stage-rehearsal`. Snow Hill blue (primary/selection/focus), the live/ready/on-air emerald, and danger red intentionally use Tailwind's built-in `blue-*`/`emerald-*`/`red-*` scales directly rather than new custom tokens — no need to reinvent shades that already exist, and it keeps hover/active/disabled variants free.

- [ ] **Step 2: Verify Tailwind still builds**

Run: `npm run typecheck:web`
Expected: no errors (this doesn't directly test Tailwind, but confirms nothing else broke from the file edit).

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.js
git commit -m "feat: add semantic color tokens to the Tailwind theme"
```

---

### Task 3: `cn()` classnames helper

**Files:**
- Create: `src/renderer/src/ui/cn.ts`
- Create: `src/renderer/src/ui/cn.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/ui/cn.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('joins plain strings', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('drops falsy values', () => {
    expect(cn('a', false && 'b', undefined, null, 'c')).toBe('a c')
  })

  it('merges conflicting Tailwind classes, keeping the last one', () => {
    expect(cn('bg-panel', 'bg-red-500')).toBe('bg-red-500')
  })

  it('supports conditional object syntax', () => {
    expect(cn('base', { active: true, hidden: false })).toBe('base active')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/src/ui/cn.test.ts`
Expected: FAIL — `Cannot find module './cn'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/renderer/src/ui/cn.ts`:

```ts
import { clsx } from 'clsx'
import type { ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Merges conditional classNames (clsx) and resolves conflicting Tailwind
// utilities so the last one wins (twMerge) — used everywhere a component
// accepts a caller-supplied className override on top of its own defaults.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/src/ui/cn.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/ui/cn.ts src/renderer/src/ui/cn.test.ts
git commit -m "feat: add cn() classnames helper"
```

---

### Task 4: Reskin CSS root variables, remove dead theme blocks

**Files:**
- Modify: `src/renderer/src/assets/main.css:21-98`

- [ ] **Step 1: Replace the `:root` block and delete the 3 dead alternate-theme blocks**

Confirmed via `grep -rn "data-theme" src/renderer/src` (zero matches outside `main.css` itself) that `data-theme="minimalist"`/`"vibrant"`/`"dark-premium"` are never set anywhere in the app — these three blocks (current lines 40-98) are dead code left over from an earlier, never-wired-up theme switcher. Removing them alongside the `:root` update since they'd otherwise sit next to the new dark palette looking like live, switchable options.

Replace lines 21-98 (the `:root` block through the end of the `dark-premium` block) with just:

```css
:root {
  --wf-primary: #3b82f6;
  --wf-primary-dark: #2563eb;
  --wf-bg-app: #0b0f1a;
  --wf-bg-panel: #131a29;
  --wf-bg-panel-raised: #1c2536;
  --wf-text-primary: #efe7d8;
  --wf-text-secondary: #a89e8c;
  --wf-border: #212a3d;
  --wf-border-strong: #2f3b52;
  --wf-live: #10b981;
  --wf-gold: #c9a466;
  --wf-warning: #f59e0b;
  --wf-error: #ef4444;
  --wf-stage-rehearsal: #8b5cf6;
}
```

(`--wf-primary` is now Snow Hill blue, not emerald — it's consumed by general "primary interactive element" usages like the scrollbar thumb hover in Task 9. `--wf-success` is renamed `--wf-live` since emerald's role narrowed specifically to live/on-air/ready state, not generic "success.")

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/assets/main.css
git commit -m "feat(theme): dark-palette CSS variables, remove unused alternate themes"
```

---

### Task 5: Reskin body/base styles, add reduced-motion rule

**Files:**
- Modify: `src/renderer/src/assets/main.css` (the "BASE STYLING & ANIMATIONS" section — `body` and `.wf-fallback` rules, originally lines 104-113)

- [ ] **Step 1: Replace the `body` and `.wf-fallback` rules**

Find:

```css
body {
  background-color: #e9ecf1;
  color: #16202e;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* Flat fallback surface (operator chrome should not animate). */
.wf-fallback {
  background: #e9ecf1;
}
```

Replace with:

```css
body {
  background-color: #0b0f1a;
  color: #efe7d8;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* Flat fallback surface (operator chrome should not animate). */
.wf-fallback {
  background: #0b0f1a;
}

/* Respect the OS-level reduced-motion preference everywhere at once,
   rather than needing every future animation to remember to check it. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/assets/main.css
git commit -m "feat(theme): dark body background, add reduced-motion rule"
```

---

### Task 6: Reskin button component classes

**Files:**
- Modify: `src/renderer/src/assets/main.css` (the "UNIFIED BUTTON STYLES" `@layer components` block, originally lines 129-225)

- [ ] **Step 1: Replace the whole button `@layer components` block**

Find the block starting `/* Base button: white surface, dark text (light theme) */` through the closing `}` of `.btn-pill:hover` (originally lines 130-225), and replace the entire `@layer components { ... }` block with:

```css
@layer components {
  /* Base button: dark panel surface */
  .btn {
    @apply inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold cursor-pointer transition-all;
    border: 1px solid #2f3b52;
    background-color: #131a29;
    color: #efe7d8;
  }

  .btn:hover {
    background-color: #1c2536;
    border-color: #3a4a68;
  }

  .btn:active {
    background-color: #0b0f1a;
  }

  /* Primary: Snow Hill blue (general primary actions, not live state) */
  .btn-primary {
    @apply inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold cursor-pointer transition-all;
    background-color: #3b82f6;
    border: 1px solid #60a5fa;
    color: #0b0f1a;
  }

  .btn-primary:hover {
    background-color: #60a5fa;
    border-color: #93c5fd;
  }

  .btn-primary:active {
    background-color: #2563eb;
  }

  /* Secondary: elevated neutral (supporting actions) */
  .btn-secondary {
    @apply inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold cursor-pointer transition-all;
    background-color: #1c2536;
    border: 1px solid #2f3b52;
    color: #efe7d8;
  }

  .btn-secondary:hover {
    background-color: #232e42;
    border-color: #3a4a68;
  }

  /* Danger: Red (Delete/Destructive) */
  .btn-danger {
    @apply inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold cursor-pointer transition-all text-white;
    background-color: #dc2626;
    border: 1px solid #ef4444;
  }

  .btn-danger:hover {
    background-color: #ef4444;
    border-color: #fca5a5;
  }

  /* Warning: Amber (Stage messages, timers, Rehearsal Mode) */
  .btn-warning {
    @apply inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold cursor-pointer transition-all text-black;
    background-color: #f59e0b;
    border: 1px solid #fbbf24;
  }

  .btn-warning:hover {
    background-color: #fbbf24;
    border-color: #fcd34d;
  }

  /* Icon button: compact, minimal */
  .btn-icon {
    @apply w-10 h-10 rounded-lg flex items-center justify-center font-semibold cursor-pointer transition-all;
    background-color: #131a29;
    border: 1px solid #212a3d;
    color: #a89e8c;
  }

  .btn-icon:hover {
    background-color: #1c2536;
    border-color: #2f3b52;
    color: #efe7d8;
  }

  /* Pill: compact, rounded full */
  .btn-pill {
    @apply inline-flex items-center justify-center gap-1 rounded-full px-3 py-1 text-xs font-medium cursor-pointer transition-all;
    background-color: #1c2536;
    border: 1px solid #2f3b52;
    color: #a89e8c;
  }

  .btn-pill:hover {
    background-color: #232e42;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/assets/main.css
git commit -m "feat(theme): dark-palette button component classes"
```

---

### Task 7: Reskin card/surface component classes

**Files:**
- Modify: `src/renderer/src/assets/main.css` (the "UNIFIED CARD/PANEL STYLES" `@layer components` block, originally lines 231-279)

- [ ] **Step 1: Replace the whole card `@layer components` block**

Replace the block (from `/* Base card: white panel on light page */` through the closing `}` after `.surface`) with:

```css
@layer components {
  /* Base card: dark panel */
  .card {
    @apply rounded-lg border p-3 transition-all;
    background-color: #131a29;
    border-color: #212a3d;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }

  .card:hover {
    background-color: #1c2536;
    border-color: #2f3b52;
  }

  /* Card with more padding */
  .card-lg {
    @apply rounded-lg border p-4 transition-all;
    background-color: #131a29;
    border-color: #212a3d;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }

  /* Interactive card (clickable) — hover border uses Snow Hill blue,
     a selection affordance, not the live-state emerald */
  .card-interactive {
    @apply rounded-lg border p-3 cursor-pointer transition-all;
    background-color: #131a29;
    border-color: #212a3d;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }

  .card-interactive:hover {
    background-color: #1c2536;
    border-color: #3b82f6;
  }

  /* Active/selected card — selection state, Snow Hill blue */
  .card-active {
    @apply rounded-lg border p-3 transition-all;
    background-color: rgba(59, 130, 246, 0.12);
    border-color: #3b82f6;
  }

  /* Surface: panel background for sections */
  .surface {
    @apply rounded-lg border p-3;
    background-color: #131a29;
    border-color: #212a3d;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/assets/main.css
git commit -m "feat(theme): dark-palette card/surface component classes"
```

---

### Task 8: Reskin input/select/textarea component classes

**Files:**
- Modify: `src/renderer/src/assets/main.css` (the "UNIFIED INPUT STYLES" `@layer components` block, originally lines 285-317)

- [ ] **Step 1: Replace the whole inputs `@layer components` block**

Replace the block with:

```css
@layer components {
  input, textarea, select {
    @apply rounded-lg border px-3 py-2 text-sm font-medium transition-all;
    background-color: #131a29;
    border-color: #2f3b52;
    color: #efe7d8;
  }

  input::placeholder, textarea::placeholder {
    color: #6f6858;
  }

  /* Focus ring: Snow Hill blue — the spec explicitly names focus rings as
     blue's role, not emerald's */
  input:focus, textarea:focus, select:focus {
    outline: none;
    background-color: #131a29;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
  }

  option {
    background-color: #131a29;
    color: #efe7d8;
  }

  /* Input with validation — .valid stays blue (matches the focus-ring
     treatment rather than mixing in the now live-only emerald); .error
     stays red, unchanged. Neither class is applied anywhere in the app
     today (confirmed via grep) — this is infrastructure for whenever a
     later stage adds real field-level validation UI. */
  input.valid {
    border-color: #3b82f6;
  }

  input.error {
    border-color: #ef4444;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/assets/main.css
git commit -m "feat(theme): dark-palette input/select/textarea component classes"
```

---

### Task 9: Reskin section-header/badge classes and scrollbar

**Files:**
- Modify: `src/renderer/src/assets/main.css` (the "UNIFIED SECTION HEADERS & TYPOGRAPHY" block, originally lines 323-371, and the scrollbar rules, originally lines 507-523)

- [ ] **Step 1: Replace the section-header/badge `@layer components` block**

Replace the block with:

```css
@layer components {
  /* Section header: small, caps, neutral by default */
  .section-header {
    @apply text-xs font-semibold uppercase tracking-widest mb-2;
    color: #a89e8c;
    letter-spacing: 0.1em;
  }

  /* Active/selected section header — Snow Hill blue (selection state) */
  .section-header.active {
    color: #60a5fa;
  }

  /* Title: large, prominent */
  .section-title {
    @apply text-lg font-bold mb-2;
    color: #efe7d8;
  }

  /* Subtitle: secondary text */
  .section-subtitle {
    @apply text-sm font-medium;
    color: #a89e8c;
  }

  /* Badge: small status indicator — emerald reads as "good/ready", the
     same family as the live-state color, not a generic UI accent */
  .badge {
    @apply inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold;
    background-color: rgba(16, 185, 129, 0.15);
    color: #34d399;
  }

  .badge-success {
    @apply inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold;
    background-color: rgba(16, 185, 129, 0.15);
    color: #34d399;
  }

  .badge-warning {
    @apply inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold;
    background-color: rgba(245, 158, 11, 0.18);
    color: #fbbf24;
  }

  .badge-danger {
    @apply inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold;
    background-color: rgba(239, 68, 68, 0.15);
    color: #f87171;
  }
}
```

- [ ] **Step 2: Replace the scrollbar rules**

Find:

```css
::-webkit-scrollbar-track {
  background: var(--wf-bg-secondary);
}

::-webkit-scrollbar-thumb {
  background: var(--wf-primary);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--wf-secondary);
}
```

Replace with (the old `--wf-bg-secondary`/`--wf-secondary` variables no longer exist after Task 4's `:root` rewrite):

```css
::-webkit-scrollbar-track {
  background: var(--wf-bg-panel);
}

::-webkit-scrollbar-thumb {
  background: var(--wf-border-strong);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--wf-primary);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/assets/main.css
git commit -m "feat(theme): dark-palette section-header/badge classes and scrollbar"
```

---

### Task 10: Motion presets module

**Files:**
- Create: `src/renderer/src/ui/motion.ts`

- [ ] **Step 1: Create the presets file**

Create `src/renderer/src/ui/motion.ts`:

```ts
import type { Transition, Variants } from 'framer-motion'

// Used for the "going live" confirmation and other state-flip moments —
// confident but not bouncy. Consumed by later stages (e.g. the Live tab's
// zone-armed indicator).
export const liveConfirmTransition: Transition = { type: 'spring', stiffness: 400, damping: 30 }

// Crossfade + slight rise, used for slide-advance and panel/tab switches.
export const fadeSlideVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.18, ease: 'easeOut' } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.12, ease: 'easeIn' } },
}
```

This file has no consumers yet — later rollout stages (Live tab, Build Service, etc.) import from it as they add slide-advance and panel-switch motion. Nothing to test here beyond the typecheck below; it's pure declarative data, not logic.

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck:web`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/ui/motion.ts
git commit -m "feat: add shared Framer Motion presets for later redesign stages"
```

---

### Task 11: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: no errors (both `typecheck:node` and `typecheck:web` pass).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all existing tests still pass (406 as of this writing, plus the 4 new `cn()` tests from Task 3 = 410), 0 failures. This is a pure CSS/config change — no test should have been broken by it.

- [ ] **Step 4: Build and launch the app**

Run: `npm run dist` (or `npm run pack:dir` for a faster unpacked build), then launch it.

Confirm in the running app:
- The app background is dark navy, not light, on every screen (this alone proves the `body` rule from Task 5 took effect app-wide).
- Any button, card, or badge on screen (e.g. the Home screen's action cards, the Live tab's Black/Logo/Live buttons, any "Rehearsing"/status badge) renders with the new dark colors and is still clearly readable — not just "dark" but legible, with visible contrast between text and background.
- A primary button (e.g. anywhere `.btn-primary` renders) is Snow Hill blue, not emerald — this is the one behavior change from the original (pre-amendment) draft of this plan that's easy to miss if skimming the diff.
- Hover a few buttons/cards — the hover-state color changes (e.g. `.btn:hover`, `.card:hover`) are visible and not jarring.
- Nothing is broken or unreadable (this stage should look like "the same app, recolored," not have any layout shifts — this stage doesn't touch structure, only color).

- [ ] **Step 5: Report status**

If everything in Step 4 looks right, this stage is done — subsequent stages (TopBar + Home, Live tab, Build Service, Libraries, Setup pages, Volunteer mode, per the design spec's rollout order) each get their own implementation plan, written when that stage starts, since a single plan covering all seven stages in full bite-sized TDD detail would be unmanageably large and the later stages depend on seeing how this foundation actually looks/feels in the running app first.
