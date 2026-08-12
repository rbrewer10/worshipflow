# Visual Redesign — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the foundation for WorshipFlow's dark-theme visual redesign — reskin the existing shared CSS component-class system to the new near-black/emerald palette (instant win across the 28 files that already use it), add Tailwind config tokens for later per-screen migration, and set up the motion/utility infrastructure (Framer Motion, a `cn()` classnames helper) the rest of the redesign will build on. This stage changes no screen's structure or behavior — only the shared styling layer underneath it.

**Architecture:** WorshipFlow already has a centralized `@layer components` block in `src/renderer/src/assets/main.css` (`.btn`, `.btn-primary`, `.card`, `.surface`, `.badge`, etc., all using hardcoded light-theme hex values) that 28 `.tsx` files already reference via plain `className="btn-primary"` strings. Reskinning that one file's color values is the single highest-leverage change in the whole redesign — every consuming file gets the new look with zero changes to its own code. Separately, `tailwind.config.js` gets semantic color tokens (`bg-app`, `bg-panel`, `text-content-primary`, etc.) for use directly in JSX className strings during later per-screen migration stages (raw `bg-white`/`bg-slate-100` usage that doesn't go through the shared classes). A new `cn()` helper (clsx + tailwind-merge) and a `motion.ts` preset module (Framer Motion) round out the infrastructure later stages will need.

**Tech Stack:** React, Tailwind CSS v3, Framer Motion (new), clsx + tailwind-merge (new), Vitest.

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

(Keep the list alphabetically sorted, matching the existing convention.)

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
        app: '#0a0d10',
        panel: '#12171b',
        'panel-raised': '#1a2126',
        border: {
          DEFAULT: '#1c2226',
          strong: '#2a3238',
        },
        content: {
          primary: '#e8ebed',
          secondary: '#8a939c',
          tertiary: '#5a6570',
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

This generates utilities used in later per-screen migration stages: `bg-app`, `bg-panel`, `bg-panel-raised`, `border-border`/`border-border-strong` (Tailwind's standard naming when a color is itself named `border` — the same convention shadcn/ui uses), `text-content-primary`/`-secondary`/`-tertiary`, `bg-status-rehearsal`/`text-status-rehearsal`, `bg-status-stage-rehearsal`/`text-status-stage-rehearsal`. The primary accent and danger colors intentionally use Tailwind's built-in `emerald-*` and `red-*` scales directly rather than new custom tokens — no need to reinvent shades that already exist.

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
  --wf-primary: #10b981;
  --wf-primary-dark: #059669;
  --wf-bg-app: #0a0d10;
  --wf-bg-panel: #12171b;
  --wf-bg-panel-raised: #1a2126;
  --wf-text-primary: #e8ebed;
  --wf-text-secondary: #8a939c;
  --wf-border: #1c2226;
  --wf-border-strong: #2a3238;
  --wf-success: #10b981;
  --wf-warning: #f59e0b;
  --wf-error: #ef4444;
  --wf-stage-rehearsal: #8b5cf6;
}
```

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
  background-color: #0a0d10;
  color: #e8ebed;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* Flat fallback surface (operator chrome should not animate). */
.wf-fallback {
  background: #0a0d10;
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
    border: 1px solid #2a3238;
    background-color: #12171b;
    color: #e8ebed;
  }

  .btn:hover {
    background-color: #1a2126;
    border-color: #3a444d;
  }

  .btn:active {
    background-color: #0a0d10;
  }

  /* Primary: Emerald (Live/Active/Go) */
  .btn-primary {
    @apply inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold cursor-pointer transition-all;
    background-color: #10b981;
    border: 1px solid #34d399;
    color: #0a0d10;
  }

  .btn-primary:hover {
    background-color: #34d399;
    border-color: #6ee7b7;
  }

  .btn-primary:active {
    background-color: #059669;
  }

  /* Secondary: elevated neutral (supporting actions — one accent rule: emerald only) */
  .btn-secondary {
    @apply inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold cursor-pointer transition-all;
    background-color: #1a2126;
    border: 1px solid #2a3238;
    color: #e8ebed;
  }

  .btn-secondary:hover {
    background-color: #232b31;
    border-color: #3a444d;
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

  /* Warning: Amber (Stage messages, timers) */
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
    background-color: #12171b;
    border: 1px solid #2a3238;
    color: #8a939c;
  }

  .btn-icon:hover {
    background-color: #1a2126;
    border-color: #3a444d;
    color: #e8ebed;
  }

  /* Pill: compact, rounded full */
  .btn-pill {
    @apply inline-flex items-center justify-center gap-1 rounded-full px-3 py-1 text-xs font-medium cursor-pointer transition-all;
    background-color: #1a2126;
    border: 1px solid #2a3238;
    color: #8a939c;
  }

  .btn-pill:hover {
    background-color: #232b31;
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
    background-color: #12171b;
    border-color: #1c2226;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }

  .card:hover {
    background-color: #1a2126;
    border-color: #2a3238;
  }

  /* Card with more padding */
  .card-lg {
    @apply rounded-lg border p-4 transition-all;
    background-color: #12171b;
    border-color: #1c2226;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }

  /* Interactive card (clickable) */
  .card-interactive {
    @apply rounded-lg border p-3 cursor-pointer transition-all;
    background-color: #12171b;
    border-color: #1c2226;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }

  .card-interactive:hover {
    background-color: #1a2126;
    border-color: #10b981;
  }

  /* Active/selected card */
  .card-active {
    @apply rounded-lg border p-3 transition-all;
    background-color: rgba(16, 185, 129, 0.12);
    border-color: #10b981;
  }

  /* Surface: panel background for sections */
  .surface {
    @apply rounded-lg border p-3;
    background-color: #12171b;
    border-color: #1c2226;
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
    background-color: #12171b;
    border-color: #2a3238;
    color: #e8ebed;
  }

  input::placeholder, textarea::placeholder {
    color: #5a6570;
  }

  input:focus, textarea:focus, select:focus {
    outline: none;
    background-color: #12171b;
    border-color: #10b981;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.25);
  }

  option {
    background-color: #12171b;
    color: #e8ebed;
  }

  /* Input with validation */
  input.valid {
    border-color: #10b981;
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
  /* Section header: small, caps, emerald accent */
  .section-header {
    @apply text-xs font-semibold uppercase tracking-widest mb-2;
    color: #8a939c;
    letter-spacing: 0.1em;
  }

  .section-header.active {
    color: #34d399;
  }

  /* Title: large, prominent */
  .section-title {
    @apply text-lg font-bold mb-2;
    color: #e8ebed;
  }

  /* Subtitle: secondary text */
  .section-subtitle {
    @apply text-sm font-medium;
    color: #8a939c;
  }

  /* Badge: small status indicator */
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

Run: `npm run test -- --run`
Expected: all existing tests still pass (391 as of this writing, plus the 4 new `cn()` tests from Task 3 = 395), 0 failures. This is a pure CSS/config change — no test should have been broken by it.

- [ ] **Step 4: Build and launch the app**

Run: `npm run dist` (or `npm run pack:dir` for a faster unpacked build), then launch it.

Confirm in the running app:
- The app background is near-black, not light, on every screen (this alone proves the `body` rule from Task 5 took effect app-wide).
- Any button, card, or badge on screen (e.g. the Home screen's action cards, the Live tab's Black/Logo/Live buttons, any "Rehearsing"/status badge) renders with the new dark colors and is still clearly readable — not just "dark" but legible, with visible contrast between text and background.
- Hover a few buttons/cards — the hover-state color changes (e.g. `.btn:hover`, `.card:hover`) are visible and not jarring.
- Nothing is broken or unreadable (this stage should look like "the same app, recolored," not have any layout shifts — this stage doesn't touch structure, only color).

- [ ] **Step 5: Report status**

If everything in Step 4 looks right, this stage is done — subsequent stages (TopBar + Home, Live tab, Build Service, Libraries, Setup pages, Volunteer mode, per the design spec's rollout order) each get their own implementation plan, written when that stage starts, since a single plan covering all seven stages in full bite-sized TDD detail would be unmanageably large and the later stages depend on seeing how this foundation actually looks/feels in the running app first.
