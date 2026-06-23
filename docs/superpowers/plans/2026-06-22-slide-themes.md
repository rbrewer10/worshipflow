# Slide Themes, Fonts & Motion Backgrounds (Stage 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator pick one recolorable theme (static or code-generated motion) per service so the projector renders every slide in that polished, cohesive look.

**Architecture:** A shared theme module (`src/shared/themes.ts`) defines the curated themes, fonts, and color-resolution helpers used by both main and renderer. The active service's theme id + color overrides are stored in the DB, tracked in the main process, broadcast in `LiveState`, and rendered by `Output.tsx` (static gradients/solids or CSS-animated motion layers). Per-song backgrounds still win over theme backgrounds.

**Tech Stack:** Electron + React 18 + TypeScript, sql.js (SQLite), Tailwind v3, Vite. Fonts bundled as static TTFs in `src/renderer/src/assets/fonts/` via `@font-face`.

**Verification note:** No unit-test framework exists. Pure logic is verified with throwaway Node scripts (run, observe, delete). UI/rendering is verified with `npm run typecheck` + booting the app (`npm run dev`) + manual visual check. Commits go to the current branch (the project's established workflow).

---

### Task 1: Shared theme module

**Files:**
- Create: `src/shared/themes.ts`

- [ ] **Step 1: Create the theme module**

```ts
// src/shared/themes.ts
// Curated slide themes shared by main + renderer. Themes are recolorable presets:
// each ships default colors, overridable per service.

export type FontKey = 'modern' | 'classic' | 'bold' | 'elegant'

export const FONT_FAMILY: Record<FontKey, string> = {
  modern: "'Poppins', system-ui, sans-serif",
  classic: "'PT Serif', Georgia, serif",
  bold: "'Anton', Impact, sans-serif",
  elegant: "'Cormorant Garamond', Georgia, serif"
}

export type MotionEffect = 'aurora' | 'bokeh' | 'rays' | 'drift'
export type TextPosition = 'top' | 'middle' | 'bottom'

export interface ThemeColors {
  primary?: string
  secondary?: string
  text?: string
}

export interface SlideTheme {
  id: string
  name: string
  kind: 'static' | 'motion'
  font: FontKey
  position: TextPosition
  defaults: { primary: string; secondary: string; text: string }
  gradient?: boolean       // static only: true = primary→secondary gradient, false = solid primary
  effect?: MotionEffect    // motion only
}

export const THEMES: SlideTheme[] = [
  { id: 'sanctuary', name: 'Sanctuary', kind: 'static', font: 'classic', position: 'middle', gradient: true,
    defaults: { primary: '#0f1f3d', secondary: '#1d2a4a', text: '#ffffff' } },
  { id: 'midnight', name: 'Midnight', kind: 'static', font: 'bold', position: 'middle', gradient: false,
    defaults: { primary: '#0a0a0a', secondary: '#1a1a1a', text: '#ffffff' } },
  { id: 'minimal', name: 'Minimal', kind: 'static', font: 'modern', position: 'middle', gradient: false,
    defaults: { primary: '#2c2c2a', secondary: '#2c2c2a', text: '#ffffff' } },
  { id: 'warm', name: 'Warm', kind: 'static', font: 'classic', position: 'middle', gradient: true,
    defaults: { primary: '#4a1b0c', secondary: '#854f0b', text: '#fff5e6' } },
  { id: 'garden', name: 'Garden', kind: 'static', font: 'modern', position: 'middle', gradient: true,
    defaults: { primary: '#04342c', secondary: '#0f6e56', text: '#ffffff' } },
  { id: 'pure', name: 'Pure', kind: 'static', font: 'modern', position: 'middle', gradient: false,
    defaults: { primary: '#f5f5f0', secondary: '#e8e8e0', text: '#1a1a1a' } },
  { id: 'aurora', name: 'Aurora', kind: 'motion', effect: 'aurora', font: 'elegant', position: 'middle',
    defaults: { primary: '#1d2a4a', secondary: '#3b1d5a', text: '#ffffff' } },
  { id: 'bokeh', name: 'Bokeh lights', kind: 'motion', effect: 'bokeh', font: 'modern', position: 'middle',
    defaults: { primary: '#0d1b2a', secondary: '#185fa5', text: '#ffffff' } },
  { id: 'rays', name: 'Light rays', kind: 'motion', effect: 'rays', font: 'bold', position: 'middle',
    defaults: { primary: '#101820', secondary: '#ffffff', text: '#ffffff' } },
  { id: 'drift', name: 'Soft drift', kind: 'motion', effect: 'drift', font: 'classic', position: 'middle',
    defaults: { primary: '#26215c', secondary: '#04342c', text: '#ffffff' } }
]

export const DEFAULT_THEME_ID = 'sanctuary'

export function getTheme(id: string | null | undefined): SlideTheme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

export function resolveColors(
  theme: SlideTheme,
  overrides?: ThemeColors | null
): { primary: string; secondary: string; text: string } {
  return {
    primary: overrides?.primary || theme.defaults.primary,
    secondary: overrides?.secondary || theme.defaults.secondary,
    text: overrides?.text || theme.defaults.text
  }
}

// CSS `background` value for a static theme.
export function staticBackgroundCss(
  theme: SlideTheme,
  colors: { primary: string; secondary: string }
): string {
  return theme.gradient
    ? `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`
    : colors.primary
}
```

- [ ] **Step 2: Verify it compiles and the helpers behave**

Create `C:\Dev\worshipflow\check-themes.mjs`:

```js
import { THEMES, getTheme, resolveColors, staticBackgroundCss, FONT_FAMILY } from './out/main/index.js'
```

That import won't resolve (themes isn't bundled standalone), so instead verify by transpiling logic inline:

Create `check-themes.mjs`:

```js
const THEMES = [{ id:'sanctuary', gradient:true, defaults:{primary:'#0f1f3d',secondary:'#1d2a4a',text:'#fff'} }]
function getTheme(id){ return THEMES.find(t=>t.id===id) ?? THEMES[0] }
function resolveColors(t,o){ return { primary:o?.primary||t.defaults.primary, secondary:o?.secondary||t.defaults.secondary, text:o?.text||t.defaults.text } }
function staticBg(t,c){ return t.gradient ? `linear-gradient(135deg, ${c.primary}, ${c.secondary})` : c.primary }
const t = getTheme('sanctuary')
console.log('DEFAULT=', resolveColors(t, null))
console.log('OVERRIDE=', resolveColors(t, { primary:'#800020' }))
console.log('BG=', staticBg(t, resolveColors(t, { primary:'#800020' })))
```

Run: `cd C:\Dev\worshipflow; node check-themes.mjs`
Expected output:
```
DEFAULT= { primary: '#0f1f3d', secondary: '#1d2a4a', text: '#fff' }
OVERRIDE= { primary: '#800020', secondary: '#1d2a4a', text: '#fff' }
BG= linear-gradient(135deg, #800020, #1d2a4a)
```
Then delete the file: `Remove-Item C:\Dev\worshipflow\check-themes.mjs`

- [ ] **Step 3: Typecheck**

Run: `cd C:\Dev\worshipflow; npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/shared/themes.ts
git commit -m "feat(themes): add shared slide-theme module"
```

---

### Task 2: Bundle fonts + @font-face

**Files:**
- Create: `src/renderer/src/assets/fonts/` (4 TTF files)
- Modify: `src/renderer/src/assets/main.css` (add @font-face block at top)

- [ ] **Step 1: Download the four open-license (OFL) fonts**

Run (PowerShell):
```powershell
cd C:\Dev\worshipflow
New-Item -ItemType Directory -Force src\renderer\src\assets\fonts | Out-Null
$base = 'https://github.com/google/fonts/raw/main/ofl'
curl.exe -L "$base/poppins/Poppins-SemiBold.ttf" -o src\renderer\src\assets\fonts\Poppins-SemiBold.ttf
curl.exe -L "$base/ptserif/PTSerif-Bold.ttf" -o src\renderer\src\assets\fonts\PTSerif-Bold.ttf
curl.exe -L "$base/anton/Anton-Regular.ttf" -o src\renderer\src\assets\fonts\Anton-Regular.ttf
curl.exe -L "$base/cormorantgaramond/CormorantGaramond-SemiBold.ttf" -o src\renderer\src\assets\fonts\CormorantGaramond-SemiBold.ttf
```
Verify all four files exist and are > 30 KB each:
`Get-ChildItem src\renderer\src\assets\fonts | Select-Object Name, Length`
Expected: 4 .ttf files, each tens to hundreds of KB. If any is < 5 KB it's an error page — re-fetch (the path may have moved; find it under https://github.com/google/fonts/tree/main/ofl).

- [ ] **Step 2: Add @font-face at the very top of `main.css`** (before `@tailwind base;`)

```css
@font-face { font-family: 'Poppins'; src: url('./fonts/Poppins-SemiBold.ttf') format('truetype'); font-weight: 600; font-display: swap; }
@font-face { font-family: 'PT Serif'; src: url('./fonts/PTSerif-Bold.ttf') format('truetype'); font-weight: 700; font-display: swap; }
@font-face { font-family: 'Anton'; src: url('./fonts/Anton-Regular.ttf') format('truetype'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'Cormorant Garamond'; src: url('./fonts/CormorantGaramond-SemiBold.ttf') format('truetype'); font-weight: 600; font-display: swap; }
```

- [ ] **Step 3: Boot and confirm fonts load**

Run: `cd C:\Dev\worshipflow; npm run dev` (background)
After ~10s, the app boots with no console errors. (Visual font confirmation happens in Task 6.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/assets/fonts src/renderer/src/assets/main.css
git commit -m "feat(themes): bundle Poppins, PT Serif, Anton, Cormorant Garamond fonts"
```

---

### Task 3: Database — service theme columns + persistence

**Files:**
- Modify: `src/main/db.ts`

- [ ] **Step 1: Add columns to the `service` CREATE TABLE** (in the `SCHEMA` constant)

In `src/main/db.ts`, change the `service` table definition to include the two new columns:

```sql
CREATE TABLE IF NOT EXISTS service (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  service_date TEXT,
  theme TEXT,
  theme_colors TEXT,
  created_at INTEGER NOT NULL
);
```

- [ ] **Step 2: Add incremental migrations** (next to the other `ALTER TABLE` lines in `initDb`)

```ts
try { db.run('ALTER TABLE service ADD COLUMN theme TEXT') } catch { /* already exists */ }
try { db.run('ALTER TABLE service ADD COLUMN theme_colors TEXT') } catch { /* already exists */ }
```

- [ ] **Step 3: Return theme + colors from `getService`**

In `getService`, change the head query and the returned object:

```ts
const head = db.prepare('SELECT id, name, service_date, theme, theme_colors FROM service WHERE id = ?')
```
and after reading the row, build the summary including:
```ts
const svc = head.getAsObject() as unknown as {
  id: number; name: string; service_date: string | null; theme: string | null; theme_colors: string | null
}
// …
return {
  id: svc.id,
  name: svc.name,
  service_date: svc.service_date ?? null,
  theme: svc.theme ?? null,
  themeColors: svc.theme_colors ? JSON.parse(svc.theme_colors) : null,
  items
}
```
(Adjust the existing spread so the returned `ServiceFull` carries `theme` and `themeColors`.)

- [ ] **Step 4: Add a setter function** (append near `updateServiceItemNotes`)

```ts
export function setServiceTheme(serviceId: number, themeId: string | null, colors: ThemeColors | null): void {
  db.run('UPDATE service SET theme = ?, theme_colors = ? WHERE id = ?', [
    themeId,
    colors ? JSON.stringify(colors) : null,
    serviceId
  ])
  persist()
}
```
Add `ThemeColors` to the import from `../shared/types` (it will be re-exported there in Task 4).

- [ ] **Step 5: Typecheck** (will fail until Task 4 adds the types — expected)

Run: `cd C:\Dev\worshipflow; npm run typecheck`
Expected: errors only about `theme`/`themeColors`/`ThemeColors` not existing on the types. Proceed to Task 4; do not commit yet.

---

### Task 4: Types — ServiceFull, LiveState, re-export ThemeColors

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Re-export `ThemeColors` and add it where services are typed**

At the top of `src/shared/types.ts` add:

```ts
import type { ThemeColors } from './themes'
export type { ThemeColors } from './themes'
```

- [ ] **Step 2: Add theme fields to `ServiceFull`** (find the `ServiceFull` interface)

```ts
export interface ServiceFull extends ServiceSummary {
  theme: string | null
  themeColors: ThemeColors | null
  items: ServiceItem[]
}
```
(If `ServiceFull` currently inlines its own item list, keep that; just add the two fields.)

- [ ] **Step 3: Add slide-theme fields to `LiveState`** (after the existing `theme?: Theme` line)

```ts
  slideTheme?: string                 // projector slide-theme id (distinct from the operator-UI `theme`)
  slideThemeColors?: ThemeColors | null
```

- [ ] **Step 4: Typecheck**

Run: `cd C:\Dev\worshipflow; npm run typecheck`
Expected: no errors (Task 3's code now resolves).

- [ ] **Step 5: Commit (Tasks 3 + 4 together)**

```bash
git add src/main/db.ts src/shared/types.ts
git commit -m "feat(themes): persist per-service theme + color overrides"
```

---

### Task 5: Main process — track active theme, broadcast it, IPC + preload

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add main-process state** (next to the other live vars near the top)

```ts
let liveSlideTheme: string = DEFAULT_THEME_ID
let liveSlideThemeColors: ThemeColors | null = null
```
Add imports at the top of `index.ts`:
```ts
import { DEFAULT_THEME_ID } from '../shared/themes'
import type { ThemeColors } from '../shared/types'
```

- [ ] **Step 2: Include theme in `renderState()`** (add to the returned object)

```ts
    slideTheme: liveSlideTheme,
    slideThemeColors: liveSlideThemeColors
```

- [ ] **Step 3: Load the theme when the active service is set**

In the `wf:setActiveService` handler, after `activeServiceItems` is populated from `getService(serviceId)`, also set:
```ts
liveSlideTheme = (svc as { theme?: string | null } | null)?.theme || DEFAULT_THEME_ID
liveSlideThemeColors = (svc as { themeColors?: ThemeColors | null } | null)?.themeColors ?? null
```
(`svc` is the value already fetched via `getService(serviceId)` in that handler — reuse it; don't fetch twice.)
Then call `broadcast()` at the end of that handler (it currently calls `tabletBroadcast()` — change to `broadcast()` so the projector gets the new theme too).

- [ ] **Step 4: Add the set-theme IPC** (near the other service IPCs)

```ts
ipcMain.handle('wf:service:setTheme', (_e, serviceId: number, themeId: string | null, colors: ThemeColors | null) => {
  setServiceTheme(serviceId, themeId, colors)
  // Apply to the live projector immediately (the operator themes the service they're running).
  liveSlideTheme = themeId || DEFAULT_THEME_ID
  liveSlideThemeColors = colors
  broadcast()
})
```
Add `setServiceTheme` to the existing `from './db'` import list.

- [ ] **Step 5: Add the preload API** (next to `serviceUpdateItemNotes`)

```ts
  serviceSetTheme: (serviceId: number, themeId: string | null, colors: import('../shared/types').ThemeColors | null): Promise<void> =>
    ipcRenderer.invoke('wf:service:setTheme', serviceId, themeId, colors),
```

- [ ] **Step 6: Typecheck**

Run: `cd C:\Dev\worshipflow; npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/main/index.ts src/preload/index.ts
git commit -m "feat(themes): track + broadcast active service theme"
```

---

### Task 6: Output — static theme backgrounds + themed text

**Files:**
- Modify: `src/renderer/src/Output.tsx`

- [ ] **Step 1: Capture the theme from live state**

In `Output.tsx`, add state and import:
```ts
import { getTheme, resolveColors, staticBackgroundCss, FONT_FAMILY } from '../../shared/themes'
import type { ThemeColors } from '../../shared/types'
```
```ts
const [slideThemeId, setSlideThemeId] = useState<string>('sanctuary')
const [slideThemeColors, setSlideThemeColors] = useState<ThemeColors | null>(null)
```
In `apply(s)`:
```ts
setSlideThemeId(s.slideTheme ?? 'sanctuary')
setSlideThemeColors(s.slideThemeColors ?? null)
```

- [ ] **Step 2: Resolve theme + colors in the render body** (before `return`)

```ts
const theme = getTheme(slideThemeId)
const colors = resolveColors(theme, slideThemeColors)
const posAlign = theme.position === 'top' ? 'flex-start' : theme.position === 'bottom' ? 'flex-end' : 'center'
```

- [ ] **Step 3: Replace the animated-gradient fallback with the theme background**

Replace the existing `.wf-fallback` div with a theme background that shows only when no per-item background is active and the screen isn't black:
```tsx
{!black && !showVideo && (
  theme.kind === 'static'
    ? <div className="absolute inset-0 transition-opacity duration-700"
        style={{ background: staticBackgroundCss(theme, colors) }} />
    : <MotionBackground effect={theme.effect!} colors={colors} />
)}
```
(`MotionBackground` is added in Task 7. For this task, temporarily render the static branch for motion too:
`: <div className="absolute inset-0" style={{ background: staticBackgroundCss(theme, colors) }} />`
— Task 7 swaps in the real motion component.)

- [ ] **Step 4: Apply theme font/color/position to lyrics**

Change the `LyricLayer` usages to pass theme styling, and update `LyricLayer` to accept and apply them:
```tsx
<LyricLayer text={layers.a} show={layers.front === 0} fontScale={fontScale}
  fontFamily={FONT_FAMILY[theme.font]} color={colors.text} align={posAlign} />
<LyricLayer text={layers.b} show={layers.front === 1} fontScale={fontScale}
  fontFamily={FONT_FAMILY[theme.font]} color={colors.text} align={posAlign} />
```
Update `LyricLayer`:
```tsx
function LyricLayer({ text, show, fontScale, fontFamily, color, align }: {
  text: string; show: boolean; fontScale: number; fontFamily: string; color: string; align: string
}): JSX.Element {
  return (
    <div className="absolute inset-0 flex justify-center px-[8vw] py-[6vh] text-center transition-opacity duration-500"
      style={{ opacity: show ? 1 : 0, alignItems: align }}>
      <span className="font-bold leading-tight"
        style={{ fontSize: `${fontScale}vw`, fontFamily, color,
          textShadow: '0 3px 24px rgba(0,0,0,.85), 0 1px 3px rgba(0,0,0,.9)', whiteSpace: 'pre-line' }}>
        {text}
      </span>
    </div>
  )
}
```

- [ ] **Step 5: Typecheck + boot + visual check**

Run: `cd C:\Dev\worshipflow; npm run typecheck` → no errors.
Run: `npm run dev`. In the app, with no theme picker yet the default `sanctuary` applies — load a song live and confirm the projector shows a navy gradient with serif (PT Serif) white centered text. (Per-song video backgrounds still override — confirm a song with a video bg still shows the video.)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/Output.tsx
git commit -m "feat(themes): render static theme backgrounds + themed lyric text"
```

---

### Task 7: Output — motion backgrounds

**Files:**
- Modify: `src/renderer/src/assets/main.css` (add keyframes)
- Modify: `src/renderer/src/Output.tsx` (add `MotionBackground`)

- [ ] **Step 1: Add motion keyframes to `main.css`** (near the other @keyframes)

```css
@keyframes themeAurora { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
@keyframes themeFloatA { 0%{transform:translate(0,0)} 50%{transform:translate(2vw,-3vh)} 100%{transform:translate(0,0)} }
@keyframes themeFloatB { 0%{transform:translate(0,0)} 50%{transform:translate(-2.4vw,2.2vh)} 100%{transform:translate(0,0)} }
@keyframes themeRay { 0%{transform:translateX(-80%) skewX(-18deg)} 100%{transform:translateX(220%) skewX(-18deg)} }
@keyframes themeDrift { 0%{background-position:0% 0%} 50%{background-position:100% 100%} 100%{background-position:0% 0%} }
.tb-blob{position:absolute;border-radius:50%;filter:blur(40px);opacity:.65}
```

- [ ] **Step 2: Add the `MotionBackground` component to `Output.tsx`** (above `LyricLayer`)

```tsx
function MotionBackground({ effect, colors }: {
  effect: 'aurora' | 'bokeh' | 'rays' | 'drift'
  colors: { primary: string; secondary: string }
}): JSX.Element {
  if (effect === 'aurora') {
    return <div className="absolute inset-0" style={{
      background: `linear-gradient(120deg, ${colors.primary}, ${colors.secondary}, ${colors.primary})`,
      backgroundSize: '320% 320%', animation: 'themeAurora 9s ease infinite' }} />
  }
  if (effect === 'drift') {
    return <div className="absolute inset-0" style={{
      background: `radial-gradient(circle at 30% 30%, ${colors.primary}, ${colors.secondary})`,
      backgroundSize: '200% 200%', animation: 'themeDrift 12s ease-in-out infinite' }} />
  }
  if (effect === 'rays') {
    return (
      <div className="absolute inset-0 overflow-hidden" style={{ background: colors.primary }}>
        <div className="absolute inset-y-0" style={{ width: '6vw', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent)', animation: 'themeRay 6s linear infinite' }} />
        <div className="absolute inset-y-0" style={{ width: '3.5vw', left: '20vw', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.14), transparent)', animation: 'themeRay 8s linear infinite' }} />
      </div>
    )
  }
  // bokeh
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: colors.primary }}>
      <div className="tb-blob" style={{ width: '16vw', height: '16vw', background: colors.secondary, top: '12%', left: '14%', animation: 'themeFloatA 7s ease-in-out infinite' }} />
      <div className="tb-blob" style={{ width: '12vw', height: '12vw', background: colors.secondary, bottom: '14%', right: '18%', animation: 'themeFloatB 8s ease-in-out infinite' }} />
      <div className="tb-blob" style={{ width: '9vw', height: '9vw', background: colors.secondary, top: '40%', right: '40%', animation: 'themeFloatA 6s ease-in-out infinite' }} />
    </div>
  )
}
```

- [ ] **Step 3: Use the real `MotionBackground`**

In the theme-background block from Task 6 Step 3, replace the temporary motion fallback with:
```tsx
: <MotionBackground effect={theme.effect!} colors={colors} />
```

- [ ] **Step 4: Typecheck + boot + visual check**

Run: `npm run typecheck` → no errors.
Run: `npm run dev`. Temporarily set a motion theme to test: in `index.ts` the default is `sanctuary` (static). To verify motion now, either wait for Task 8's picker, OR temporarily change `DEFAULT_THEME_ID` in `src/shared/themes.ts` to `'aurora'`, boot, confirm the projector shows a smoothly drifting gradient, then revert to `'sanctuary'`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/assets/main.css src/renderer/src/Output.tsx
git commit -m "feat(themes): code-generated motion backgrounds (aurora/bokeh/rays/drift)"
```

---

### Task 8: Service builder — theme picker + color customization

**Files:**
- Create: `src/renderer/src/ThemePicker.tsx`
- Modify: `src/renderer/src/ServiceBuilder.tsx`

- [ ] **Step 1: Create `ThemePicker.tsx`**

```tsx
import { useState } from 'react'
import { THEMES, getTheme, resolveColors, staticBackgroundCss } from '../../shared/themes'
import type { ThemeColors } from '../../shared/types'

function ThemePicker({ serviceId, themeId, colors, onChange }: {
  serviceId: number
  themeId: string | null
  colors: ThemeColors | null
  onChange: () => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const active = getTheme(themeId)
  const c = resolveColors(active, colors)

  const setTheme = (id: string): void => {
    window.wf.serviceSetTheme(serviceId, id, colors)
    onChange()
  }
  const setColor = (key: keyof ThemeColors, val: string): void => {
    const next: ThemeColors = { ...(colors ?? {}), [key]: val }
    window.wf.serviceSetTheme(serviceId, active.id, next)
    onChange()
  }
  const resetColors = (): void => {
    window.wf.serviceSetTheme(serviceId, active.id, null)
    onChange()
  }

  return (
    <div className="mb-3 rounded-lg border border-white/10 bg-black/20 p-2">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-xs font-semibold text-slate-300">
        <span>🎨 Theme — {active.name}</span>
        <span className="text-slate-500">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            {THEMES.map((t) => {
              const tc = resolveColors(t, t.id === active.id ? colors : null)
              return (
                <button key={t.id} onClick={() => setTheme(t.id)}
                  className={`rounded-md p-1 text-left ${t.id === active.id ? 'ring-2 ring-blue-500' : 'ring-1 ring-white/10'}`}>
                  <div className="h-7 w-full rounded" style={{ background: t.kind === 'static' ? staticBackgroundCss(t, tc) : `linear-gradient(120deg, ${tc.primary}, ${tc.secondary})` }} />
                  <span className="mt-0.5 block text-[10px] text-slate-400">{t.name}</span>
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-3 border-t border-white/10 pt-2">
            <label className="flex items-center gap-1 text-[11px] text-slate-400">Primary
              <input type="color" value={c.primary} onChange={(e) => setColor('primary', e.target.value)} className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0" /></label>
            <label className="flex items-center gap-1 text-[11px] text-slate-400">Second
              <input type="color" value={c.secondary} onChange={(e) => setColor('secondary', e.target.value)} className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0" /></label>
            <label className="flex items-center gap-1 text-[11px] text-slate-400">Text
              <input type="color" value={c.text} onChange={(e) => setColor('text', e.target.value)} className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0" /></label>
            <button onClick={resetColors} className="ml-auto text-[11px] text-slate-500 hover:text-slate-300">Reset</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ThemePicker
```

- [ ] **Step 2: Mount it in `ServiceBuilder.tsx`**

Import at top: `import ThemePicker from './ThemePicker'`.
Inside the open-service panel (where `service` is loaded), render it above the item list:
```tsx
{service && openId != null && (
  <ThemePicker serviceId={openId} themeId={service.theme} colors={service.themeColors}
    onChange={() => window.wf.serviceGet(openId).then(setService)} />
)}
```
(Use the existing `service` state and `setService` setter; `service.theme` / `service.themeColors` now exist on `ServiceFull` from Task 4.)

- [ ] **Step 3: Typecheck + boot + end-to-end visual check**

Run: `npm run typecheck` → no errors.
Run: `npm run dev`. Open a service → the Theme panel appears. Click a static theme (e.g. Warm) → load a song live → projector shows the warm look. Click a motion theme (Aurora) → projector animates. Change the Primary color → projector + swatch update. Click Reset → returns to the theme's default colors. Switch services → each remembers its own theme.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/ThemePicker.tsx src/renderer/src/ServiceBuilder.tsx
git commit -m "feat(themes): service theme picker with live color customization"
```

---

### Task 9: Final verification pass

- [ ] **Step 1: Full typecheck**

Run: `cd C:\Dev\worshipflow; npm run typecheck`
Expected: no errors.

- [ ] **Step 2: Cold-boot migration check**

Run: `npm run dev`. App boots with no errors against the existing `worshipflow.db` (migrations add `theme`/`theme_colors` without data loss; existing services still open).

- [ ] **Step 3: Manual acceptance (per the spec's "Testing / verification")**

Confirm each, on the projector output:
- Each of the 10 themes renders (6 static look correct; 4 motion animate smoothly).
- Font, text color, and position match the chosen theme.
- Color overrides (primary/secondary/text) recolor static gradients/solids AND motion palettes; Reset restores defaults.
- A song with its own video/image background still shows that background (theme only controls font/color/position there).
- Each service remembers its own theme + colors across a switch and across an app restart.

- [ ] **Step 4: Commit any final touch-ups**

```bash
git add -A
git commit -m "chore(themes): stage 1 verification touch-ups"
```

---

## Self-Review Notes (addressed)

- **Spec coverage:** theme model (Task 1), starter set incl. motion (Tasks 1/7), fonts (Task 2), per-service persistence (Tasks 3–4), selection UI (Task 8), live rendering + precedence (Tasks 6–7), color customization (Tasks 1/8), scope limited to Output. All covered.
- **Naming:** `slideTheme`/`slideThemeColors` used consistently for the projector theme (distinct from the existing operator-UI `LiveState.theme`). DB columns `theme`/`theme_colors`; `ServiceFull.theme`/`themeColors`. `setServiceTheme` / `serviceSetTheme` / `wf:service:setTheme` consistent across db/preload/ipc.
- **Precedence:** Output renders the theme background only when `!showVideo` (a per-item background present), preserving existing song backgrounds.
