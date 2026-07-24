# Corner Clock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small always-on clock (time only, no seconds) to the right edge of the bottom drawer's tab strip — the final phase of the FreeShow-inspired shell redesign.

**Architecture:** A new, tiny `Clock.tsx` component owns its own `setInterval`-driven refresh and renders a locale-formatted time string. `LiveDrawer.tsx`'s tab-strip row gets a flex-spacer and `<Clock />` appended after its four tab buttons, plus a small padding adjustment so the clock isn't flush against the window edge.

**Tech Stack:** Electron (renderer), TypeScript, React 18, Tailwind v3.

---

## File Structure

**Create:**
- `src/renderer/src/Clock.tsx` — the clock component.

**Modify:**
- `src/renderer/src/LiveDrawer.tsx` — import `Clock`, add it to the tab-strip row.

**Not touched:** everything else — the drawer's four tab components, `AppShell.tsx`, `TopBar.tsx`.

---

## Task 1: Create `Clock.tsx` and wire it into `LiveDrawer`

**Files:**
- Create: `src/renderer/src/Clock.tsx`
- Modify: `src/renderer/src/LiveDrawer.tsx`

- [ ] **Step 1: Create `Clock.tsx`**

Create `src/renderer/src/Clock.tsx`:

```tsx
import { useEffect, useState } from 'react'

function formatNow(): string {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// A small always-on clock for the bottom drawer's tab strip, matching
// FreeShow's corner clock. Refreshes every 15s — frequent enough that the
// displayed minute is never meaningfully stale, infrequent enough to avoid
// a once-a-second re-render for information nobody needs at that granularity.
function Clock(): JSX.Element {
  const [now, setNow] = useState(formatNow)
  useEffect(() => {
    const t = setInterval(() => setNow(formatNow()), 15000)
    return () => clearInterval(t)
  }, [])
  return <span className="text-xs font-medium tabular-nums text-slate-500">{now}</span>
}

export default Clock
```

- [ ] **Step 2: Wire it into `LiveDrawer.tsx`'s tab strip**

In `src/renderer/src/LiveDrawer.tsx`, add the import alongside the existing ones:

```tsx
import Clock from './Clock'
```

Then change the tab-strip row (currently `<div className="flex items-center border-b border-slate-200">` wrapping `{TABS.map(...)}`) to add `pr-3` to its className and append a flex-spacer + `<Clock />` after the `{TABS.map(...)}` block:

```tsx
      <div className="flex items-center border-b border-slate-200 pr-3">
        {TABS.map(({ id, label, Icon }) => {
          const active = open === id
          return (
            <button
              key={id}
              onClick={() => setOpen(active ? null : id)}
              className={`flex items-center gap-1.5 border-r border-slate-200 px-4 py-2 text-xs font-medium transition-colors ${
                active ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          )
        })}
        <div className="flex-1" />
        <Clock />
      </div>
```

Only this one `<div>` block changes (the row's className gains `pr-3`, and two new children are appended after the `{TABS.map(...)}` call). Everything else in the file — the `open`/`setOpen` state, the Escape-key effect, the animated content panel below the tab strip, and the four conditional tab renders — is untouched.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/Clock.tsx src/renderer/src/LiveDrawer.tsx
git commit -m "feat(drawer): add a corner clock to the bottom drawer's tab strip"
```

---

## Task 2: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: PASS (node + web).

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: PASS — same count as before (no new logic to test; matches the spec's testing section — `formatNow()` is a single native `Date.toLocaleTimeString` call with no branching, nothing of this project's own to unit test).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual smoke test (documented, run in `npm run dev`)**

Document these steps for the check-through:
1. Launch the app. Confirm a clock (e.g. "12:48 PM") is visible at the right edge of the bottom drawer's tab strip, and that it matches the system clock.
2. Confirm the clock is visible on every screen the drawer reaches (Home, Live, Build Service, Songs, Announcements, Scripture, Sound Check, Logo & Background) — it's part of the always-visible tab strip, so it should never disappear except in Volunteer mode.
3. Wait roughly a minute and confirm the displayed time advances (no need to time it precisely — just confirm it isn't frozen).
4. Open a drawer tab (e.g. Songs) — confirm the clock stays visible and correctly positioned in the tab-strip row while the panel below it opens.
5. Confirm the clock doesn't overlap or crowd the four tab buttons at the app's default window width (1600px, per Phase 1's window-size fix).

- [ ] **Step 5: Commit** (only if fixes were needed during the smoke test)

```bash
git add -A
git commit -m "test: verify the corner clock end-to-end"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** placement (right-aligned in the drawer tab strip, Task 1 Step 2) ✓; format (time only, no seconds, `formatNow()` in Task 1 Step 1) ✓; 15s refresh interval ✓; no other file/logic changes (explicitly scoped to 2 files) ✓. Success criteria mapped into Task 2's manual smoke test.
- **Placeholder scan:** none — every step has complete code.
- **Type consistency:** `Clock` takes no props, matching its usage `<Clock />` with no attributes in `LiveDrawer.tsx`. No new types introduced beyond the component's own internal `string` state.
