# WYSIWYG Slide Editor + Background System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the WorshipFlow Songs tab's text-form editor with a WYSIWYG slide canvas where you click directly on the slide to edit lyrics, plus a full background system with uploads, CSS motion presets, and AI generation (Replicate → Ken Burns).

**Architecture:** A new `src/renderer/src/editor/` folder holds all editor components. `SongEditor.tsx` assembles `SlideStrip` + `SlideCanvas` + `FloatingToolbar` + `BackgroundPanel` and replaces the right-side form panel in `SongLibrary.tsx`. Main-process additions handle background file management and Replicate API calls. `Output.tsx` gains a Ken Burns CSS layer for image backgrounds.

**Tech Stack:** React 18, TypeScript, Tailwind v3, Electron IPC (existing), sql.js (existing), Replicate REST API (via Node.js `https` module), CSS keyframe animations.

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `src/shared/themes.ts` | Add 10 more `MotionEffect` values + new `THEMES` entries |
| Modify | `src/shared/types.ts` | Add `bgMotion` field to `SongFull` + `SongInput` |
| Modify | `src/renderer/src/assets/main.css` | New keyframes for new motion effects + Ken Burns |
| Modify | `src/renderer/src/Output.tsx` | Extend `MotionBackground` + add Ken Burns image layer |
| Modify | `src/main/db.ts` | Add `bg_motion` migration, `setSongBgMotion()` |
| Create | `src/main/backgroundLib.ts` | File copy/list/delete for background uploads + generated |
| Create | `src/main/replicateApi.ts` | Replicate REST client (prompt → image file) |
| Modify | `src/main/index.ts` | IPC handlers for bg library + Replicate + bgMotion |
| Modify | `src/preload/index.ts` | New `wf.*` methods for bg library |
| Modify | `src/preload/index.d.ts` | Type declarations for new methods |
| Create | `src/renderer/src/editor/slideCompute.ts` | Compute `EditorSlide[]` from `SongFull` |
| Create | `src/renderer/src/editor/SlideCanvas.tsx` | WYSIWYG canvas — click to edit |
| Create | `src/renderer/src/editor/SlideStrip.tsx` | Left thumbnail strip |
| Create | `src/renderer/src/editor/FloatingToolbar.tsx` | Font/color/align toolbar |
| Create | `src/renderer/src/editor/BackgroundPanel.tsx` | Right panel with 3 tabs |
| Create | `src/renderer/src/editor/SongEditor.tsx` | Assembles all editor pieces |
| Modify | `src/renderer/src/SongLibrary.tsx` | Replace form panel with `<SongEditor>` |

---

## Task 1: Extend motion effects in themes.ts

Add 10 new `MotionEffect` values and their corresponding `THEMES` entries.

**Files:**
- Modify: `src/shared/themes.ts`

- [ ] **Step 1: Replace the MotionEffect type and add new themes**

Open `src/shared/themes.ts`. Replace the existing `MotionEffect` type and append to the `THEMES` array:

```ts
// Replace line 13:
export type MotionEffect =
  | 'aurora' | 'bokeh' | 'rays' | 'drift'
  | 'fire' | 'starfield' | 'waterfall' | 'embers'
  | 'shimmer' | 'cosmic' | 'cross-glow' | 'mist'
  | 'neon' | 'sunrise'
```

Then append to the `THEMES` array (after the existing 10 entries):

```ts
  { id: 'fire', name: 'Holy Fire', kind: 'motion', effect: 'fire', font: 'bold', position: 'middle',
    defaults: { primary: '#1a0500', secondary: '#ff4500', text: '#fff8f0' } },
  { id: 'starfield', name: 'Starfield', kind: 'motion', effect: 'starfield', font: 'elegant', position: 'middle',
    defaults: { primary: '#000814', secondary: '#ffffff', text: '#ffffff' } },
  { id: 'waterfall', name: 'Living Water', kind: 'motion', effect: 'waterfall', font: 'classic', position: 'middle',
    defaults: { primary: '#001a33', secondary: '#0077b6', text: '#e8f4fd' } },
  { id: 'embers', name: 'Embers', kind: 'motion', effect: 'embers', font: 'bold', position: 'bottom',
    defaults: { primary: '#0d0500', secondary: '#cc3700', text: '#fff5e6' } },
  { id: 'shimmer', name: 'Golden Shimmer', kind: 'motion', effect: 'shimmer', font: 'elegant', position: 'middle',
    defaults: { primary: '#1a1200', secondary: '#d4af37', text: '#fffacd' } },
  { id: 'cosmic', name: 'Cosmic', kind: 'motion', effect: 'cosmic', font: 'modern', position: 'middle',
    defaults: { primary: '#0a0020', secondary: '#6a0dad', text: '#ffffff' } },
  { id: 'cross-glow', name: 'Cross Glow', kind: 'motion', effect: 'cross-glow', font: 'classic', position: 'bottom',
    defaults: { primary: '#060a14', secondary: '#4a90e2', text: '#ffffff' } },
  { id: 'mist', name: 'Morning Mist', kind: 'motion', effect: 'mist', font: 'elegant', position: 'middle',
    defaults: { primary: '#1a2030', secondary: '#a8c8e8', text: '#ffffff' } },
  { id: 'neon', name: 'Neon Praise', kind: 'motion', effect: 'neon', font: 'bold', position: 'middle',
    defaults: { primary: '#05001a', secondary: '#ff00ff', text: '#ffffff' } },
  { id: 'sunrise', name: 'Sunrise', kind: 'motion', effect: 'sunrise', font: 'classic', position: 'middle',
    defaults: { primary: '#1a0a00', secondary: '#ff8c00', text: '#fff5e6' } },
```

- [ ] **Step 2: Run typecheck**

```bash
cd C:/Dev/worshipflow && npx tsc --noEmit 2>&1 | head -20
```
Expected: No errors (new string literals in the union are valid).

- [ ] **Step 3: Commit**

```bash
cd C:/Dev/worshipflow && git add src/shared/themes.ts && git commit -m "feat: add 10 new motion preset themes"
```

---

## Task 2: New CSS keyframes for new effects + Ken Burns

**Files:**
- Modify: `src/renderer/src/assets/main.css`

- [ ] **Step 1: Append keyframes after the existing theme animation block**

In `main.css`, find the line `@keyframes themeDrift { ... }` (around line 373). After the `.tb-blob` rule (line 374), append:

```css
/* Extended motion theme keyframes */
@keyframes themeFire {
  0%,100% { background-position: 50% 100%; background-size: 150% 200%; }
  50% { background-position: 50% 0%; background-size: 170% 220%; }
}
@keyframes themeStarfield {
  0% { transform: translateY(0); }
  100% { transform: translateY(-33.33%); }
}
@keyframes themeWaterfall {
  0% { background-position: 50% 0%; }
  100% { background-position: 50% 100%; }
}
@keyframes themeEmber {
  0% { transform: translateY(0) translateX(0) scale(1); opacity: 0.8; }
  100% { transform: translateY(-110vh) translateX(var(--dx,0)) scale(0.3); opacity: 0; }
}
@keyframes themeShimmer {
  0% { transform: translateX(-100%) skewX(-20deg); }
  100% { transform: translateX(300%) skewX(-20deg); }
}
@keyframes themeCosmic {
  0%,100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
@keyframes themeCrossGlow {
  0%,100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 0.9; transform: scale(1.06); }
}
@keyframes themeMist {
  0% { transform: translateX(0) scaleY(1); opacity: 0.5; }
  50% { transform: translateX(3vw) scaleY(1.1); opacity: 0.7; }
  100% { transform: translateX(0) scaleY(1); opacity: 0.5; }
}
@keyframes themeNeon {
  0%,100% { opacity: 0.6; filter: blur(8px); }
  50% { opacity: 1; filter: blur(4px); }
}
@keyframes themeSunrise {
  0% { background-position: 50% 100%; }
  50% { background-position: 50% 30%; }
  100% { background-position: 50% 100%; }
}

/* Ken Burns effect for AI-generated / uploaded image backgrounds */
@keyframes kenBurnsPan { 0% { transform: scale(1.15) translateX(0); } 100% { transform: scale(1.15) translateX(-5%); } }
@keyframes kenBurnsZoom { 0% { transform: scale(1); } 100% { transform: scale(1.18); } }
@keyframes kenBurnsShimmer {
  0%,100% { opacity: 0; transform: translateX(-100%) rotate(30deg); }
  40%,60% { opacity: 0.18; }
  50% { transform: translateX(200%) rotate(30deg); opacity: 0.18; }
}
.wf-kb-pan { animation: kenBurnsPan 20s linear infinite alternate; }
.wf-kb-zoom { animation: kenBurnsZoom 16s ease-in-out infinite alternate; }
.wf-kb-shimmer-overlay::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(60deg, transparent 30%, rgba(255,255,255,0.15) 50%, transparent 70%);
  width: 200%;
  animation: kenBurnsShimmer 6s ease-in-out infinite;
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/Dev/worshipflow && git add src/renderer/src/assets/main.css && git commit -m "feat: add CSS keyframes for new motion effects and Ken Burns"
```

---

## Task 3: Extend MotionBackground component in Output.tsx

**Files:**
- Modify: `src/renderer/src/Output.tsx` lines 244-273

- [ ] **Step 1: Replace the MotionBackground function**

Replace the entire `function MotionBackground(...)` block (lines 244–273) with:

```tsx
function MotionBackground({ effect, colors }: {
  effect: MotionEffect
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
  if (effect === 'fire') {
    return <div className="absolute inset-0" style={{
      background: `radial-gradient(ellipse at 50% 120%, ${colors.secondary} 0%, ${colors.primary} 60%)`,
      backgroundSize: '150% 200%', animation: 'themeFire 4s ease-in-out infinite' }} />
  }
  if (effect === 'starfield') {
    // Three layers of pseudo-stars using repeating-radial-gradient, scrolling at different speeds.
    return (
      <div className="absolute inset-0 overflow-hidden" style={{ background: colors.primary }}>
        <div className="absolute" style={{ inset: '-33% 0 0', height: '166%',
          backgroundImage: `radial-gradient(circle, ${colors.secondary} 1px, transparent 1px)`,
          backgroundSize: '80px 80px', animation: 'themeStarfield 8s linear infinite' }} />
        <div className="absolute" style={{ inset: '-33% 0 0', height: '166%',
          backgroundImage: `radial-gradient(circle, ${colors.secondary}99 1px, transparent 1px)`,
          backgroundSize: '40px 40px', animation: 'themeStarfield 14s linear infinite' }} />
      </div>
    )
  }
  if (effect === 'waterfall') {
    return <div className="absolute inset-0" style={{
      background: `repeating-linear-gradient(180deg, ${colors.primary} 0px, ${colors.secondary}55 40px, ${colors.primary} 80px)`,
      backgroundSize: '100% 200px', animation: 'themeWaterfall 3s linear infinite' }} />
  }
  if (effect === 'embers') {
    return (
      <div className="absolute inset-0 overflow-hidden" style={{ background: colors.primary }}>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="absolute rounded-full" style={{
            width: `${4 + (i % 5)}px`, height: `${4 + (i % 5)}px`,
            background: colors.secondary, bottom: `${(i * 7) % 50}%`, left: `${(i * 17 + 5) % 90}%`,
            '--dx': `${((i % 5) - 2) * 20}px`,
            opacity: 0.8, filter: 'blur(1px)',
            animation: `themeEmber ${3 + (i % 4)}s ${i * 0.4}s ease-out infinite`
          } as React.CSSProperties} />
        ))}
      </div>
    )
  }
  if (effect === 'shimmer') {
    return (
      <div className="absolute inset-0 overflow-hidden" style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary}44, ${colors.primary})` }}>
        <div className="absolute inset-y-0" style={{ width: '30%', background: `linear-gradient(90deg, transparent, ${colors.secondary}55, transparent)`, animation: 'themeShimmer 4s linear infinite' }} />
      </div>
    )
  }
  if (effect === 'cosmic') {
    return <div className="absolute inset-0" style={{
      background: `radial-gradient(ellipse at 50% 50%, ${colors.secondary}88 0%, ${colors.primary} 60%)`,
      backgroundSize: '200% 200%', animation: 'themeCosmic 8s ease-in-out infinite' }} />
  }
  if (effect === 'cross-glow') {
    return (
      <div className="absolute inset-0" style={{ background: colors.primary }}>
        {/* Horizontal bar */}
        <div className="absolute" style={{ top: '45%', left: '30%', right: '30%', height: '8%',
          background: `radial-gradient(ellipse, ${colors.secondary}cc, transparent)`,
          animation: 'themeCrossGlow 3s ease-in-out infinite' }} />
        {/* Vertical bar */}
        <div className="absolute" style={{ left: '47%', top: '25%', bottom: '25%', width: '4%',
          background: `radial-gradient(ellipse, ${colors.secondary}cc, transparent)`,
          animation: 'themeCrossGlow 3s ease-in-out infinite' }} />
      </div>
    )
  }
  if (effect === 'mist') {
    return (
      <div className="absolute inset-0 overflow-hidden" style={{ background: colors.primary }}>
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 40%, ${colors.secondary}33 100%)`, animation: 'themeMist 8s ease-in-out infinite' }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${colors.secondary}22, transparent 60%)`, animation: 'themeMist 12s ease-in-out infinite reverse' }} />
      </div>
    )
  }
  if (effect === 'neon') {
    return (
      <div className="absolute inset-0 overflow-hidden" style={{ background: colors.primary }}>
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 50%, ${colors.secondary}33 0%, transparent 70%)`, animation: 'themeNeon 2s ease-in-out infinite' }} />
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 20% 80%, ${colors.secondary}22 0%, transparent 50%)`, animation: 'themeNeon 3s ease-in-out infinite 1s' }} />
      </div>
    )
  }
  if (effect === 'sunrise') {
    return <div className="absolute inset-0" style={{
      background: `radial-gradient(ellipse at 50% 130%, ${colors.secondary} 0%, ${colors.primary} 55%)`,
      backgroundSize: '100% 200%', animation: 'themeSunrise 10s ease-in-out infinite' }} />
  }
  // bokeh (default fallback)
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: colors.primary }}>
      <div className="tb-blob" style={{ width: '16vw', height: '16vw', background: colors.secondary, top: '12%', left: '14%', animation: 'themeFloatA 7s ease-in-out infinite' }} />
      <div className="tb-blob" style={{ width: '12vw', height: '12vw', background: colors.secondary, bottom: '14%', right: '18%', animation: 'themeFloatB 8s ease-in-out infinite' }} />
      <div className="tb-blob" style={{ width: '9vw', height: '9vw', background: colors.secondary, top: '40%', right: '40%', animation: 'themeFloatA 6s ease-in-out infinite' }} />
    </div>
  )
}
```

Also update the import at the top of Output.tsx — add `MotionEffect` to the themes import:
```tsx
import { getTheme, resolveColors, staticBackgroundCss, FONT_FAMILY } from '../../shared/themes'
import type { MotionEffect } from '../../shared/themes'
```

- [ ] **Step 2: Typecheck**

```bash
cd C:/Dev/worshipflow && npx tsc --noEmit 2>&1 | head -30
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd C:/Dev/worshipflow && git add src/renderer/src/Output.tsx && git commit -m "feat: extend MotionBackground with 10 new CSS effects"
```

---

## Task 4: DB migration + types for bgMotion

**Files:**
- Modify: `src/main/db.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add bgMotion to SongFull and SongInput in types.ts**

In `src/shared/types.ts`, update `SongFull` (after `linesPerSlide`) and `SongInput`:

```ts
export interface SongFull extends SongSummary {
  ccli: string | null
  copyright: string | null
  publisher: string | null
  sections: SongSection[]
  arrangement: number[] | null
  fontScale: number | null
  linesPerSlide: number | null
  bgMotion: 'pan' | 'zoom' | 'shimmer' | null   // ADD THIS LINE
}

export interface SongInput {
  title: string
  author?: string
  ccli?: string
  copyright?: string
  publisher?: string
  background?: string | null
  sections: SongSection[]
  arrangement?: number[] | null
  fontScale?: number | null
  linesPerSlide?: number | null
  bgMotion?: 'pan' | 'zoom' | 'shimmer' | null  // ADD THIS LINE
}
```

- [ ] **Step 2: Add migration + accessor in db.ts**

In `db.ts`, add to the incremental migrations block (after the last `try { db.run(...) }` before `persist()`):

```ts
  try { db.run('ALTER TABLE song ADD COLUMN bg_motion TEXT') } catch { /* already exists */ }
```

In the `getSong` function, update the SELECT to include `bg_motion`:

```ts
  const head = db.prepare(
    'SELECT id, title, author, ccli, copyright, publisher, background, arrangement, font_scale, lines_per_slide, bg_motion FROM song WHERE id = ?'
  )
```

And in the row type inside `getSong`:
```ts
  const row = head.getAsObject() as {
    id: number
    title: string
    author: string | null
    ccli: string | null
    copyright: string | null
    publisher: string | null
    background: string | null
    arrangement: string | null
    font_scale: number | null
    lines_per_slide: number | null
    bg_motion: string | null   // ADD
  }
```

And in the return object:
```ts
  return {
    ...
    fontScale: row.font_scale ?? null,
    linesPerSlide: row.lines_per_slide ?? null,
    bgMotion: (row.bg_motion as SongFull['bgMotion']) ?? null,  // ADD
    sections
  }
```

Add a new export function at the bottom of `db.ts`:

```ts
export function setSongBgMotion(id: number, motion: string | null): void {
  db.run('UPDATE song SET bg_motion = ? WHERE id = ?', [motion, id])
  persist()
}
```

- [ ] **Step 3: Typecheck**

```bash
cd C:/Dev/worshipflow && npx tsc --noEmit 2>&1 | head -30
```
Expected: No errors (or only errors in files not yet updated — fix those if present).

- [ ] **Step 4: Commit**

```bash
cd C:/Dev/worshipflow && git add src/shared/types.ts src/main/db.ts && git commit -m "feat: add bgMotion field to song (db + types)"
```

---

## Task 5: Background library — main process

**Files:**
- Create: `src/main/backgroundLib.ts`
- Create: `src/main/replicateApi.ts`

- [ ] **Step 1: Create backgroundLib.ts**

```ts
// src/main/backgroundLib.ts
// Manages the local background library: uploads + generated images.
import { app } from 'electron'
import { join, extname, basename } from 'path'
import { mkdirSync, copyFileSync, readdirSync, unlinkSync, existsSync, createWriteStream } from 'fs'
import { createHash } from 'crypto'
import https from 'https'

function uploadsDir(): string {
  const d = join(app.getPath('userData'), 'backgrounds', 'uploads')
  mkdirSync(d, { recursive: true })
  return d
}

function generatedDir(): string {
  const d = join(app.getPath('userData'), 'backgrounds', 'generated')
  mkdirSync(d, { recursive: true })
  return d
}

export type BgEntry = {
  filename: string
  path: string
  kind: 'upload' | 'generated'
  isVideo: boolean
}

export function listBackgrounds(): BgEntry[] {
  const results: BgEntry[] = []
  const IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif)$/i
  const VIDEO_EXT = /\.(mp4|webm|mov|avi)$/i

  for (const dir of [uploadsDir(), generatedDir()]) {
    const kind = dir.includes('generated') ? 'generated' : 'upload'
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir)) {
      if (!IMAGE_EXT.test(f) && !VIDEO_EXT.test(f)) continue
      results.push({ filename: f, path: join(dir, f), kind, isVideo: VIDEO_EXT.test(f) })
    }
  }
  return results
}

export function copyBackground(srcPath: string): string {
  const hash = createHash('md5').update(srcPath + Date.now()).digest('hex').slice(0, 8)
  const ext = extname(srcPath) || '.mp4'
  const filename = `${hash}${ext}`
  const dest = join(uploadsDir(), filename)
  copyFileSync(srcPath, dest)
  return dest
}

export function deleteBackground(filePath: string): void {
  // Safety: only allow deleting files inside the backgrounds dirs.
  const allowed = [uploadsDir(), generatedDir()]
  if (!allowed.some((d) => filePath.startsWith(d))) return
  if (existsSync(filePath)) unlinkSync(filePath)
}

export function downloadToGenerated(url: string, filename: string): Promise<string> {
  const dest = join(generatedDir(), filename)
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest)
    https.get(url, (res) => {
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve(dest) })
    }).on('error', (err) => { file.close(); reject(err) })
  })
}
```

- [ ] **Step 2: Create replicateApi.ts**

```ts
// src/main/replicateApi.ts
// Calls Replicate to generate a background image from a text prompt.
import https from 'https'
import { createHash } from 'crypto'
import { downloadToGenerated } from './backgroundLib'

function httpsPost(url: string, body: object, token: string): Promise<object> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const u = new URL(url)
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let raw = ''
      res.on('data', (c) => { raw += c })
      res.on('end', () => { try { resolve(JSON.parse(raw)) } catch (e) { reject(e) } })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function httpsGet(url: string, token: string): Promise<object> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    https.get({ hostname: u.hostname, path: u.pathname + u.search,
      headers: { 'Authorization': `Bearer ${token}` }
    }, (res) => {
      let raw = ''
      res.on('data', (c) => { raw += c })
      res.on('end', () => { try { resolve(JSON.parse(raw)) } catch (e) { reject(e) } })
    }).on('error', reject)
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function generateBackgroundImage(prompt: string, apiKey: string): Promise<string> {
  // Create prediction using Flux Schnell (fast, high quality, free tier available)
  const created = await httpsPost(
    'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
    { input: { prompt: `${prompt}, wide cinematic 16:9, photorealistic, church worship background`, aspect_ratio: '16:9', output_format: 'webp' } },
    apiKey
  ) as { id: string; urls: { get: string } }

  if (!created.id) throw new Error('Replicate: no prediction id returned')

  // Poll until done (max 60s)
  for (let i = 0; i < 30; i++) {
    await sleep(2000)
    const poll = await httpsGet(created.urls.get, apiKey) as {
      status: string
      output: string[] | null
      error: string | null
    }
    if (poll.error) throw new Error(`Replicate error: ${poll.error}`)
    if (poll.status === 'succeeded' && poll.output && poll.output[0]) {
      const hash = createHash('md5').update(prompt + Date.now()).digest('hex').slice(0, 8)
      const filename = `gen_${hash}.webp`
      const dest = await downloadToGenerated(poll.output[0], filename)
      return dest
    }
  }
  throw new Error('Replicate: timed out after 60s')
}
```

- [ ] **Step 3: Typecheck**

```bash
cd C:/Dev/worshipflow && npx tsc --noEmit 2>&1 | head -30
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd C:/Dev/worshipflow && git add src/main/backgroundLib.ts src/main/replicateApi.ts && git commit -m "feat: background library + Replicate API client (main process)"
```

---

## Task 6: IPC handlers + preload for background library

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

- [ ] **Step 1: Add imports + IPC handlers in main/index.ts**

At the top of `src/main/index.ts`, after the existing imports, add:

```ts
import { listBackgrounds, copyBackground, deleteBackground } from './backgroundLib'
import { generateBackgroundImage } from './replicateApi'
import { setSongBgMotion } from './db'
```

(Also add `setSongBgMotion` to the existing `from './db'` import block, or keep it separate.)

Then, find a good place after the existing IPC handler block (e.g., near the `wf:songs:setBackground` handler) and add:

```ts
// Background library
ipcMain.handle('wf:bg:list', () => listBackgrounds())

ipcMain.handle('wf:bg:upload', async (_e, srcPath: string) => {
  return copyBackground(srcPath)
})

ipcMain.handle('wf:bg:delete', (_e, filePath: string) => {
  deleteBackground(filePath)
})

ipcMain.handle('wf:bg:generate', async (_e, prompt: string) => {
  const apiKey = getSetting('replicate_api_key')
  if (!apiKey) throw new Error('Replicate API key not set. Add it in Settings → Integrations.')
  return generateBackgroundImage(prompt, apiKey)
})

ipcMain.handle('wf:bg:openDialog', async () => {
  if (!operatorWin) return { canceled: true, filePaths: [] }
  return dialog.showOpenDialog(operatorWin, {
    title: 'Select background image or video',
    filters: [
      { name: 'Media', extensions: ['mp4', 'webm', 'mov', 'jpg', 'jpeg', 'png', 'webp', 'gif'] }
    ],
    properties: ['openFile']
  })
})

ipcMain.handle('wf:songs:setBgMotion', (_e, id: number, motion: string | null) => {
  setSongBgMotion(id, motion)
})

// Settings
ipcMain.handle('wf:setting:get', (_e, key: string) => getSetting(key))
ipcMain.handle('wf:setting:set', (_e, key: string, value: string | null) => setSetting(key, value))
```

- [ ] **Step 2: Add preload methods in preload/index.ts**

In `src/preload/index.ts`, inside the `const wf = { ... }` object, add after the existing `songSetFontScale` line:

```ts
  // Background library
  bgList: (): Promise<import('../main/backgroundLib').BgEntry[]> => ipcRenderer.invoke('wf:bg:list'),
  bgUpload: (srcPath: string): Promise<string> => ipcRenderer.invoke('wf:bg:upload', srcPath),
  bgDelete: (filePath: string): Promise<void> => ipcRenderer.invoke('wf:bg:delete', filePath),
  bgGenerate: (prompt: string): Promise<string> => ipcRenderer.invoke('wf:bg:generate', prompt),
  bgOpenDialog: (): Promise<{ canceled: boolean; filePaths: string[] }> => ipcRenderer.invoke('wf:bg:openDialog'),
  songSetBgMotion: (id: number, motion: string | null): Promise<void> =>
    ipcRenderer.invoke('wf:songs:setBgMotion', id, motion),
  settingGet: (key: string): Promise<string | null> => ipcRenderer.invoke('wf:setting:get', key),
  settingSet: (key: string, value: string | null): Promise<void> => ipcRenderer.invoke('wf:setting:set', key, value),
```

- [ ] **Step 3: Add type declarations in preload/index.d.ts**

Open `src/preload/index.d.ts` and add the new method signatures. The file likely re-exports `WorshipFlowApi`. Since `index.ts` already exports `WorshipFlowApi = typeof wf`, the types propagate automatically. Verify the file just does:

```ts
// If the file contains something like:
export type { WorshipFlowApi } from './index'
```

If it manually declares the interface, add these method signatures:
```ts
  bgList(): Promise<{ filename: string; path: string; kind: 'upload' | 'generated'; isVideo: boolean }[]>
  bgUpload(srcPath: string): Promise<string>
  bgDelete(filePath: string): Promise<void>
  bgGenerate(prompt: string): Promise<string>
  bgOpenDialog(): Promise<{ canceled: boolean; filePaths: string[] }>
  songSetBgMotion(id: number, motion: string | null): Promise<void>
  settingGet(key: string): Promise<string | null>
  settingSet(key: string, value: string | null): Promise<void>
```

- [ ] **Step 4: Typecheck**

```bash
cd C:/Dev/worshipflow && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5: Commit**

```bash
cd C:/Dev/worshipflow && git add src/main/index.ts src/preload/index.ts src/preload/index.d.ts && git commit -m "feat: IPC handlers + preload methods for background library"
```

---

## Task 7: Slide computation utility

**Files:**
- Create: `src/renderer/src/editor/slideCompute.ts`

- [ ] **Step 1: Create the utility**

```ts
// src/renderer/src/editor/slideCompute.ts
// Derives the list of slides the editor displays from a SongFull.
// Mirrors the main-process slide logic so the editor preview matches the projector.

import type { SongFull, SongSection } from '../../../shared/types'

export interface EditorSlide {
  key: string             // stable React key
  sectionOrdinal: number  // which section this slide belongs to
  sectionLabel: string    // "Verse 1", "Chorus", etc.
  text: string            // the lines shown on this slide
  lineStart: number       // 0-based line index within the section (for splicing edits back)
  lineCount: number       // how many lines this slide contains
}

function sectionLabel(sec: SongSection, ordinal: number): string {
  if (sec.label) return sec.label
  const kind = sec.kind.charAt(0).toUpperCase() + sec.kind.slice(1)
  return ordinal > 0 ? `${kind} ${ordinal + 1}` : kind
}

export function computeEditorSlides(song: SongFull): EditorSlide[] {
  const linesPerSlide = song.linesPerSlide ?? 2
  const sections = [...song.sections].sort((a, b) => a.ordinal - b.ordinal)

  // Apply arrangement if present.
  const ordered: SongSection[] = song.arrangement && song.arrangement.length > 0
    ? song.arrangement.map((i) => sections[i]).filter(Boolean)
    : sections

  const slides: EditorSlide[] = []
  let keyIdx = 0

  for (const sec of ordered) {
    const lines = sec.lyrics.split('\n')
    for (let start = 0; start < lines.length; start += linesPerSlide) {
      const chunk = lines.slice(start, start + linesPerSlide)
      slides.push({
        key: `${sec.ordinal}-${start}-${keyIdx++}`,
        sectionOrdinal: sec.ordinal,
        sectionLabel: sectionLabel(sec, sec.ordinal),
        text: chunk.join('\n'),
        lineStart: start,
        lineCount: chunk.length
      })
    }
  }
  return slides
}

// Applies an edited slide text back into its section, returning updated sections array.
export function applySlideEdit(
  song: SongFull,
  slide: EditorSlide,
  newText: string
): SongSection[] {
  return song.sections.map((sec) => {
    if (sec.ordinal !== slide.sectionOrdinal) return sec
    const lines = sec.lyrics.split('\n')
    const edited = newText.split('\n')
    lines.splice(slide.lineStart, slide.lineCount, ...edited)
    return { ...sec, lyrics: lines.join('\n') }
  })
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/Dev/worshipflow && git add src/renderer/src/editor/slideCompute.ts && git commit -m "feat: slide computation utility for WYSIWYG editor"
```

---

## Task 8: SlideCanvas — WYSIWYG canvas

**Files:**
- Create: `src/renderer/src/editor/SlideCanvas.tsx`

- [ ] **Step 1: Create SlideCanvas.tsx**

```tsx
// src/renderer/src/editor/SlideCanvas.tsx
// 16:9 WYSIWYG slide canvas. Shows real background + lyrics; click to edit.

import { useRef, useState, useEffect } from 'react'
import { getTheme, resolveColors, staticBackgroundCss, FONT_FAMILY } from '../../../shared/themes'
import type { SongFull } from '../../../shared/types'
import type { EditorSlide } from './slideCompute'
import FloatingToolbar from './FloatingToolbar'

function toAssetUrl(p: string): string {
  return 'wf-asset://?path=' + encodeURIComponent(p)
}

function isVideo(p: string): boolean {
  return /\.(mp4|webm|mov|avi)$/i.test(p)
}

export interface SlideCanvasProps {
  song: SongFull
  slide: EditorSlide | null
  onTextChange: (sectionOrdinal: number, lineStart: number, lineCount: number, newText: string) => void
}

export default function SlideCanvas({ song, slide, onTextChange }: SlideCanvasProps): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number } | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // When the active slide changes, stop editing.
  useEffect(() => { setEditing(false) }, [slide?.key])

  const theme = getTheme(null) // slides use default; themes panel controls this
  const colors = resolveColors(theme)
  const fontFamily = FONT_FAMILY[theme.font]
  const bg = song.background

  const handleTextClick = (e: React.MouseEvent): void => {
    if (editing) return
    setEditText(slide?.text ?? '')
    setEditing(true)
    // Position toolbar above the text click point within the container.
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setToolbarPos({ top: e.clientY - rect.top - 44, left: e.clientX - rect.left - 80 })
    }
    setTimeout(() => textRef.current?.focus(), 0)
  }

  const handleBlur = (): void => {
    if (!slide) return
    setEditing(false)
    setToolbarPos(null)
    if (editText !== slide.text) {
      onTextChange(slide.sectionOrdinal, slide.lineStart, slide.lineCount, editText)
    }
  }

  const isEmpty = !slide

  return (
    <div ref={containerRef} className="relative w-full select-none overflow-hidden rounded-lg" style={{ aspectRatio: '16/9', background: '#000' }}>

      {/* Background layer */}
      {bg ? (
        isVideo(bg)
          ? <video key={bg} className="absolute inset-0 h-full w-full object-cover" src={toAssetUrl(bg)} autoPlay loop muted playsInline />
          : <div className={`absolute inset-0 ${song.bgMotion === 'pan' ? 'wf-kb-pan' : song.bgMotion === 'zoom' ? 'wf-kb-zoom' : ''} ${song.bgMotion === 'shimmer' ? 'wf-kb-shimmer-overlay' : ''}`}
              style={{ backgroundImage: `url(${toAssetUrl(bg)})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
      ) : (
        <div className="absolute inset-0" style={{ background: staticBackgroundCss(theme, colors) }} />
      )}

      {/* Overlay for readability */}
      <div className="absolute inset-0 bg-black/20" />

      {/* Floating toolbar (shown while editing) */}
      {editing && toolbarPos && (
        <FloatingToolbar
          style={{ position: 'absolute', top: Math.max(0, toolbarPos.top), left: Math.max(0, toolbarPos.left), zIndex: 20 }}
          song={song}
          onFontScaleChange={(s) => window.wf.songSetFontScale(song.id, s)}
        />
      )}

      {/* Slide text — click to edit */}
      {!isEmpty && !editing && (
        <div
          className="absolute inset-0 flex cursor-text items-center justify-center px-[8%] py-[6%] text-center"
          onClick={handleTextClick}
        >
          <span
            className="font-bold leading-tight"
            style={{
              fontSize: `${song.fontScale ?? 6}vw`,
              fontFamily,
              color: '#ffffff',
              textShadow: '0 3px 24px rgba(0,0,0,.85), 0 1px 3px rgba(0,0,0,.9)',
              whiteSpace: 'pre-line',
              maxWidth: '100%'
            }}
          >
            {slide.text || <span className="opacity-40 italic">Click to type lyrics…</span>}
          </span>
        </div>
      )}

      {/* Inline textarea (editing mode) */}
      {editing && (
        <div className="absolute inset-0 flex items-center justify-center px-[8%] py-[6%]">
          <textarea
            ref={textRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setEditing(false); setToolbarPos(null) }
            }}
            className="w-full resize-none bg-transparent text-center font-bold leading-tight outline-none ring-2 ring-blue-400/60 rounded"
            style={{
              fontSize: `${song.fontScale ?? 6}vw`,
              fontFamily,
              color: '#ffffff',
              textShadow: '0 3px 24px rgba(0,0,0,.85)',
              whiteSpace: 'pre-line',
              minHeight: '2em',
              caretColor: '#fff'
            }}
            rows={song.linesPerSlide ?? 2}
          />
        </div>
      )}

      {/* Label chip */}
      {slide && (
        <div className="absolute top-2 left-2 rounded bg-black/50 px-2 py-0.5 text-xs font-semibold text-white/70">
          {slide.sectionLabel}
        </div>
      )}

      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm">
          No slides — add lyrics first
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/Dev/worshipflow && git add src/renderer/src/editor/SlideCanvas.tsx && git commit -m "feat: WYSIWYG SlideCanvas component"
```

---

## Task 9: SlideStrip + FloatingToolbar

**Files:**
- Create: `src/renderer/src/editor/SlideStrip.tsx`
- Create: `src/renderer/src/editor/FloatingToolbar.tsx`

- [ ] **Step 1: Create SlideStrip.tsx**

```tsx
// src/renderer/src/editor/SlideStrip.tsx
import { getTheme, resolveColors, staticBackgroundCss, FONT_FAMILY } from '../../../shared/themes'
import type { SongFull } from '../../../shared/types'
import type { EditorSlide } from './slideCompute'

export default function SlideStrip({ song, slides, activeIndex, onSelect }: {
  song: SongFull
  slides: EditorSlide[]
  activeIndex: number
  onSelect: (index: number) => void
}): JSX.Element {
  const theme = getTheme(null)
  const colors = resolveColors(theme)

  function toAssetUrl(p: string): string {
    return 'wf-asset://?path=' + encodeURIComponent(p)
  }

  if (slides.length === 0) {
    return (
      <div className="flex w-28 shrink-0 flex-col gap-1 overflow-y-auto py-1 pr-1">
        <div className="rounded border border-dashed border-white/10 p-2 text-center text-xs text-white/30">
          No slides
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-28 shrink-0 flex-col gap-1.5 overflow-y-auto py-1 pr-1">
      {slides.map((slide, i) => {
        const active = i === activeIndex
        const bg = song.background
          ? `url(${toAssetUrl(song.background)}) center/cover`
          : staticBackgroundCss(theme, colors)
        return (
          <button
            key={slide.key}
            onClick={() => onSelect(i)}
            className={`group relative w-full overflow-hidden rounded text-left transition-all ${
              active ? 'ring-2 ring-blue-400 ring-offset-1 ring-offset-[#1a1a1d]' : 'opacity-60 hover:opacity-90'
            }`}
            style={{ aspectRatio: '16/9', background: bg }}
          >
            {/* dark overlay */}
            <div className="absolute inset-0 bg-black/30" />
            {/* lyric text preview */}
            <div className="absolute inset-0 flex items-center justify-center px-1 text-center">
              <span
                className="line-clamp-2 text-[7px] font-bold leading-tight"
                style={{
                  fontFamily: FONT_FAMILY[theme.font],
                  color: '#fff',
                  textShadow: '0 1px 4px rgba(0,0,0,.9)'
                }}
              >
                {slide.text}
              </span>
            </div>
            {/* slide number */}
            <div className="absolute bottom-0.5 right-1 text-[7px] font-semibold text-white/50">{i + 1}</div>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Create FloatingToolbar.tsx**

```tsx
// src/renderer/src/editor/FloatingToolbar.tsx
import type { SongFull } from '../../../shared/types'

const FONT_SIZES = [3, 4, 5, 6, 7, 8, 9, 10]

export default function FloatingToolbar({ style, song, onFontScaleChange }: {
  style?: React.CSSProperties
  song: SongFull
  onFontScaleChange: (size: number) => void
}): JSX.Element {
  const current = song.fontScale ?? 6
  return (
    <div
      className="flex items-center gap-1 rounded-lg border border-white/20 bg-black/80 px-2 py-1 shadow-xl backdrop-blur"
      style={style}
    >
      <span className="mr-1 text-[10px] text-white/50">Size</span>
      {FONT_SIZES.map((s) => (
        <button
          key={s}
          onMouseDown={(e) => {
            e.preventDefault() // don't steal focus from textarea
            onFontScaleChange(s)
          }}
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
            current === s ? 'bg-blue-600 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd C:/Dev/worshipflow && git add src/renderer/src/editor/SlideStrip.tsx src/renderer/src/editor/FloatingToolbar.tsx && git commit -m "feat: SlideStrip and FloatingToolbar components"
```

---

## Task 10: BackgroundPanel

**Files:**
- Create: `src/renderer/src/editor/BackgroundPanel.tsx`

- [ ] **Step 1: Create BackgroundPanel.tsx**

```tsx
// src/renderer/src/editor/BackgroundPanel.tsx
// Right panel: 3-tab background picker (My Uploads | Presets | AI Generate)

import { useState, useEffect, useRef } from 'react'
import { THEMES } from '../../../shared/themes'
import type { SongFull } from '../../../shared/types'

type Tab = 'uploads' | 'presets' | 'ai'

type BgEntry = { filename: string; path: string; kind: 'upload' | 'generated'; isVideo: boolean }

const MOTION_STYLES: { value: 'pan' | 'zoom' | 'shimmer' | null; label: string }[] = [
  { value: null, label: 'Static' },
  { value: 'pan', label: 'Pan' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'shimmer', label: 'Shimmer' },
]

export default function BackgroundPanel({ song, onBackgroundChange }: {
  song: SongFull
  onBackgroundChange: (path: string | null, motion: SongFull['bgMotion']) => void
}): JSX.Element {
  const [tab, setTab] = useState<Tab>('presets')
  const [uploads, setUploads] = useState<BgEntry[]>([])
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const motionPresets = THEMES.filter((t) => t.kind === 'motion')
  const staticPresets = THEMES.filter((t) => t.kind === 'static')

  const refreshUploads = (): void => {
    window.wf.bgList().then((all) => setUploads(all))
  }

  useEffect(() => { refreshUploads() }, [])

  const handleUpload = async (): Promise<void> => {
    const result = await window.wf.bgOpenDialog()
    if (result.canceled || !result.filePaths[0]) return
    const dest = await window.wf.bgUpload(result.filePaths[0])
    refreshUploads()
    onBackgroundChange(dest, song.bgMotion ?? null)
  }

  const handleDelete = async (path: string): Promise<void> => {
    await window.wf.bgDelete(path)
    refreshUploads()
    if (song.background === path) onBackgroundChange(null, null)
    setDeleteConfirm(null)
  }

  const handleGenerate = async (): Promise<void> => {
    if (!prompt.trim() || generating) return
    setGenerating(true)
    setGenError(null)
    try {
      const dest = await window.wf.bgGenerate(prompt.trim())
      refreshUploads()
      onBackgroundChange(dest, 'pan') // default Ken Burns pan on AI-generated
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  const handleRandomize = (): void => {
    const idx = Math.floor(Math.random() * motionPresets.length)
    const t = motionPresets[idx]
    // Presets use theme id stored as the background path prefix "theme:"
    onBackgroundChange(`theme:${t.id}`, null)
  }

  function toAssetUrl(p: string): string {
    return 'wf-asset://?path=' + encodeURIComponent(p)
  }

  return (
    <div className="flex w-56 shrink-0 flex-col gap-2 rounded-xl border border-white/[0.07] bg-[#15151a] p-3">
      {/* Tabs */}
      <div className="flex rounded-lg border border-white/10 p-0.5">
        {(['uploads', 'presets', 'ai'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md py-1 text-[10px] font-semibold transition-colors ${
              tab === t ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t === 'uploads' ? 'Uploads' : t === 'presets' ? 'Presets' : 'AI'}
          </button>
        ))}
      </div>

      {/* === MY UPLOADS === */}
      {tab === 'uploads' && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <button
            onClick={handleUpload}
            className="w-full rounded-lg border border-dashed border-blue-500/40 py-2 text-xs font-semibold text-blue-400 hover:border-blue-400 hover:bg-blue-500/10"
          >
            + Upload image or video
          </button>
          {/* Motion style for uploaded images */}
          {song.background && !song.background.startsWith('theme:') && (
            <div className="flex items-center gap-1 rounded border border-white/[0.07] bg-black/20 p-1.5">
              <span className="mr-1 text-[9px] text-slate-500">Motion</span>
              {MOTION_STYLES.map((m) => (
                <button
                  key={String(m.value)}
                  onClick={() => onBackgroundChange(song.background ?? null, m.value)}
                  className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                    song.bgMotion === m.value ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-white/10'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 gap-1.5">
              {uploads.length === 0 && (
                <p className="col-span-2 py-4 text-center text-xs text-slate-600">No uploads yet</p>
              )}
              {uploads.map((u) => (
                <div
                  key={u.path}
                  className={`group relative cursor-pointer overflow-hidden rounded border-2 transition-all ${
                    song.background === u.path ? 'border-blue-500' : 'border-transparent hover:border-white/20'
                  }`}
                  style={{ aspectRatio: '16/9' }}
                  onClick={() => onBackgroundChange(u.path, u.isVideo ? null : song.bgMotion ?? null)}
                >
                  {u.isVideo ? (
                    <video src={toAssetUrl(u.path)} className="h-full w-full object-cover" muted />
                  ) : (
                    <img src={toAssetUrl(u.path)} className="h-full w-full object-cover" alt="" />
                  )}
                  {deleteConfirm === u.path ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70">
                      <span className="text-[9px] text-white">Delete?</span>
                      <div className="flex gap-1">
                        <button onClick={() => handleDelete(u.path)} className="rounded bg-red-600 px-2 py-0.5 text-[9px] text-white">Yes</button>
                        <button onClick={() => setDeleteConfirm(null)} className="rounded bg-white/20 px-2 py-0.5 text-[9px] text-white">No</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm(u.path) }}
                      className="absolute right-0.5 top-0.5 hidden rounded bg-black/60 px-1 py-0.5 text-[9px] text-red-400 group-hover:block"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* === PRESETS === */}
      {tab === 'presets' && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <button
            onClick={handleRandomize}
            className="w-full rounded-lg border border-violet-500/40 py-1.5 text-xs font-semibold text-violet-400 hover:border-violet-400 hover:bg-violet-500/10"
          >
            🎲 Randomize
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Motion</p>
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {motionPresets.map((t) => {
                const active = song.background === `theme:${t.id}`
                return (
                  <button
                    key={t.id}
                    onClick={() => onBackgroundChange(`theme:${t.id}`, null)}
                    className={`rounded border-2 py-2 px-1 text-[9px] font-semibold transition-all ${
                      active ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
                    }`}
                    style={{ background: active ? undefined : `linear-gradient(135deg, ${t.defaults.primary}, ${t.defaults.secondary})` }}
                  >
                    <span className="block text-center" style={{ color: t.defaults.text }}>
                      {t.name}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Static</p>
            <div className="grid grid-cols-2 gap-1.5">
              {staticPresets.map((t) => {
                const active = song.background === `theme:${t.id}`
                return (
                  <button
                    key={t.id}
                    onClick={() => onBackgroundChange(`theme:${t.id}`, null)}
                    className={`rounded border-2 py-2 px-1 text-[9px] font-semibold transition-all ${
                      active ? 'border-blue-500 text-blue-300' : 'border-white/10 text-slate-400 hover:border-white/20'
                    }`}
                    style={{ background: t.gradient
                      ? `linear-gradient(135deg, ${t.defaults.primary}, ${t.defaults.secondary})`
                      : t.defaults.primary }}
                  >
                    <span style={{ color: t.defaults.text }}>{t.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* === AI GENERATE === */}
      {tab === 'ai' && (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] text-slate-500">Describe a background. AI generates it (Replicate). Set API key in Settings.</p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="soft blue waves, golden heavenly light, dark starfield with cross…"
            rows={3}
            className="resize-none rounded border border-white/10 bg-black/30 p-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
          />
          {genError && <p className="text-[10px] text-red-400">{genError}</p>}
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || generating}
            className="rounded-lg bg-violet-600 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {generating ? 'Generating…' : '✨ Generate'}
          </button>
          {/* Motion style for generated */}
          <div className="mt-1">
            <p className="mb-1 text-[9px] text-slate-600">Motion effect after generation</p>
            <div className="flex gap-1">
              {MOTION_STYLES.map((m) => (
                <button
                  key={String(m.value)}
                  onClick={() => onBackgroundChange(song.background ?? null, m.value)}
                  className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                    song.bgMotion === m.value ? 'bg-violet-600 text-white' : 'text-slate-400 hover:bg-white/10'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd C:/Dev/worshipflow && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
cd C:/Dev/worshipflow && git add src/renderer/src/editor/BackgroundPanel.tsx && git commit -m "feat: BackgroundPanel with Uploads/Presets/AI tabs"
```

---

## Task 11: SongEditor — assemble all editor pieces

**Files:**
- Create: `src/renderer/src/editor/SongEditor.tsx`

- [ ] **Step 1: Create SongEditor.tsx**

```tsx
// src/renderer/src/editor/SongEditor.tsx
// Top-level editor: SlideStrip + SlideCanvas + BackgroundPanel
// Replaces the right-side form panel in SongLibrary.

import { useState, useEffect, useCallback } from 'react'
import type { SongFull, SongInput } from '../../../shared/types'
import { computeEditorSlides, applySlideEdit } from './slideCompute'
import SlideStrip from './SlideStrip'
import SlideCanvas from './SlideCanvas'
import BackgroundPanel from './BackgroundPanel'

export default function SongEditor({ songId, onSaved }: {
  songId: number
  onSaved?: () => void
}): JSX.Element {
  const [song, setSong] = useState<SongFull | null>(null)
  const [activeSlideIndex, setActiveSlideIndex] = useState(0)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const s = await window.wf.songGet(songId)
    setSong(s)
    setActiveSlideIndex(0)
  }, [songId])

  useEffect(() => { load() }, [load])

  if (!song) {
    return <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading…</div>
  }

  const slides = computeEditorSlides(song)
  const activeSlide = slides[activeSlideIndex] ?? null

  const saveSong = async (updated: SongFull): Promise<void> => {
    if (saving) return
    setSaving(true)
    const input: SongInput = {
      title: updated.title,
      author: updated.author ?? undefined,
      ccli: updated.ccli ?? undefined,
      copyright: updated.copyright ?? undefined,
      publisher: updated.publisher ?? undefined,
      background: updated.background ?? null,
      sections: updated.sections,
      arrangement: updated.arrangement ?? null,
      fontScale: updated.fontScale,
      linesPerSlide: updated.linesPerSlide,
      bgMotion: updated.bgMotion
    }
    await window.wf.songUpdate(songId, input)
    setSaving(false)
    onSaved?.()
  }

  const handleTextChange = async (sectionOrdinal: number, lineStart: number, lineCount: number, newText: string): Promise<void> => {
    if (!song || !activeSlide) return
    const updatedSections = applySlideEdit(song, { ...activeSlide, sectionOrdinal, lineStart, lineCount }, newText)
    const updated = { ...song, sections: updatedSections }
    setSong(updated)
    await saveSong(updated)
  }

  const handleBackgroundChange = async (path: string | null, motion: SongFull['bgMotion']): Promise<void> => {
    if (!song) return
    const updated = { ...song, background: path, bgMotion: motion }
    setSong(updated)
    await window.wf.songSetBackground(songId, path)
    await window.wf.songSetBgMotion(songId, motion)
  }

  const handleFontScaleChange = async (scale: number): Promise<void> => {
    if (!song) return
    const updated = { ...song, fontScale: scale }
    setSong(updated)
    await window.wf.songSetFontScale(songId, scale)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Compact metadata bar */}
      <div className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-[#1a1a1d] px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{song.title}</p>
          {song.author && <p className="truncate text-xs text-slate-500">{song.author}</p>}
        </div>
        {saving && <span className="text-xs text-slate-500 animate-pulse">Saving…</span>}
        <button
          onClick={() => onSaved?.()}
          className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-white/10 hover:text-slate-300"
        >
          ← Back
        </button>
      </div>

      {/* Editor body: strip + canvas + background panel */}
      <div className="flex min-h-0 flex-1 gap-3">
        {/* Left: slide strip */}
        <SlideStrip
          song={song}
          slides={slides}
          activeIndex={activeSlideIndex}
          onSelect={setActiveSlideIndex}
        />

        {/* Center: WYSIWYG canvas */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <SlideCanvas
            song={song}
            slide={activeSlide}
            onTextChange={handleTextChange}
          />
          <p className="text-center text-[10px] text-slate-600">
            Click lyrics to edit • {slides.length} slide{slides.length !== 1 ? 's' : ''} total
          </p>
        </div>

        {/* Right: background panel */}
        <BackgroundPanel
          song={song}
          onBackgroundChange={handleBackgroundChange}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd C:/Dev/worshipflow && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
cd C:/Dev/worshipflow && git add src/renderer/src/editor/SongEditor.tsx && git commit -m "feat: SongEditor assembly component"
```

---

## Task 12: Wire SongEditor into SongLibrary

Replace the current right-side form panel in `SongLibrary.tsx` with the WYSIWYG `SongEditor`.

**Files:**
- Modify: `src/renderer/src/SongLibrary.tsx`

- [ ] **Step 1: Add SongEditor import and state**

At the top of `SongLibrary.tsx`, add:
```tsx
import SongEditor from './editor/SongEditor'
```

Add state for tracking which song is open in the WYSIWYG editor:
```tsx
const [editorId, setEditorId] = useState<number | null>(null)
```

- [ ] **Step 2: Replace the form panel JSX**

Find the `{/* Add / Edit form */}` block starting with:
```tsx
<div className="flex min-w-0 flex-1 flex-col rounded-xl border border-white/[0.07] bg-[#1a1a1d] p-4">
```

Replace that entire block (from its opening `<div>` to its closing `</div>`) with:

```tsx
{/* WYSIWYG editor or welcome state */}
<div className="flex min-w-0 flex-1 flex-col rounded-xl border border-white/[0.07] bg-[#1a1a1d] p-4">
  {editorId != null ? (
    <SongEditor
      key={editorId}
      songId={editorId}
      onSaved={() => { refresh(); }}
    />
  ) : (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <div className="text-4xl opacity-20">🎵</div>
      <p className="text-sm text-slate-500">Select a song from the list to open the slide editor</p>
    </div>
  )}
</div>
```

- [ ] **Step 3: Open editor on song click**

In the song list, update the Edit button's `onClick` to open the WYSIWYG editor:

```tsx
<button
  onClick={() => setEditorId(s.id)}
  className="shrink-0 rounded px-2 py-1 text-xs text-slate-500 opacity-0 hover:bg-white/10 hover:text-slate-200 group-hover:opacity-100"
>
  Edit
</button>
```

Also make clicking the song title open the editor:
```tsx
<div
  className="min-w-0 flex-1 cursor-pointer"
  onClick={() => setEditorId(s.id)}
>
```

- [ ] **Step 4: Remove the old form state that's no longer needed**

The following state variables are no longer needed (the WYSIWYG editor handles them internally). Remove these `useState` declarations:
- `editId`, `title`, `author`, `ccli`, `copyright`, `publisher`, `lyrics`, `arrangement`, `fontScale`, `linesPerSlide`, `saving`

Also remove: `startEdit`, `save`, `resetForm`, `addToArrangement`, `removeFromArrangement`, `parsedSections` — they're all owned by `SongEditor` now.

Keep: `songs`, `search`, `confirmDelete`, `refresh`, `remove`, `confirmRemove`, `pickBg`, `clearBg`.

- [ ] **Step 5: Typecheck**

```bash
cd C:/Dev/worshipflow && npx tsc --noEmit 2>&1 | head -30
```
Expected: No errors.

- [ ] **Step 6: Boot and test**

```bash
cd C:/Dev/worshipflow && npm run dev
```

Navigate to Songs tab. Select a song → editor opens with the slide canvas. Click lyrics text → it becomes editable. Change text → tab away → verify the slide updates.

- [ ] **Step 7: Commit**

```bash
cd C:/Dev/worshipflow && git add src/renderer/src/SongLibrary.tsx && git commit -m "feat: wire SongEditor into SongLibrary (WYSIWYG replaces form panel)"
```

---

## Task 13: Ken Burns image layer in Output.tsx + handle theme: backgrounds

The output renderer needs to:
1. Apply Ken Burns CSS animation when `bgMotion` is set and background is an image.
2. Handle `theme:` prefixed backgrounds (from the presets tab) as named slide themes rather than file paths.

**Files:**
- Modify: `src/renderer/src/Output.tsx`
- Modify: `src/main/index.ts` (broadcast bgMotion in LiveState)
- Modify: `src/shared/types.ts` (add bgMotion to LiveState)

- [ ] **Step 1: Add bgMotion to LiveState in types.ts**

In `src/shared/types.ts`, in the `LiveState` interface, add after `bgFit`:

```ts
  bgMotion?: 'pan' | 'zoom' | 'shimmer' | null
```

- [ ] **Step 2: Update main/index.ts to broadcast bgMotion**

Find where `liveSong` is built into the broadcast state. In `src/main/index.ts`, the `broadcast()` function builds a `LiveState` object. Find the line that sets `background: liveSong.background` and add next to it:

```ts
bgMotion: (liveSong as any).bgMotion ?? null,
```

Also when loading a song into live (`wf:live:loadSong` handler), pass `bgMotion` from the fetched song:

```ts
liveSong = {
  title: song.title,
  lines: songLines(song),
  background: song.background ?? null,
  bgMotion: song.bgMotion ?? null,   // ADD
}
```

You may need to extend the local `liveSong` type to include `bgMotion`. Find the `liveSong` declaration (around line 73):
```ts
let liveSong: { title: string; lines: string[]; background?: string | null; bgMotion?: string | null } = DEMO_SONG
```

- [ ] **Step 3: Update Output.tsx to apply Ken Burns + handle theme: paths**

In `Output.tsx`, add state for `bgMotion`:
```tsx
const [bgMotion, setBgMotion] = useState<'pan' | 'zoom' | 'shimmer' | null>(null)
```

In the `apply` function inside `useEffect`, add:
```tsx
setBgMotion((s.bgMotion as 'pan' | 'zoom' | 'shimmer' | null) ?? null)
```

Replace the per-song image `<img>` block with:
```tsx
) : (
  <div
    key={bgSrc}
    className={`absolute inset-0 transition-opacity duration-700 ${showVideo ? '' : 'opacity-0'}
      ${bgMotion === 'pan' ? 'wf-kb-pan' : bgMotion === 'zoom' ? 'wf-kb-zoom' : ''}
      ${bgMotion === 'shimmer' ? 'wf-kb-shimmer-overlay' : ''}`}
    style={{
      backgroundImage: `url(${toAssetUrl(bgSrc)})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    }}
    onLoad={() => setBgReady(true)}
  />
)
```

Note: since we switched from `<img>` to a `<div>` with background-image for Ken Burns, the `onLoad` fires differently. Use an `Image` object to preload:
```tsx
useEffect(() => {
  if (!bgSrc || isVideo(bgSrc)) return
  setBgReady(false)
  const img = new window.Image()
  img.onload = () => setBgReady(true)
  img.onerror = () => setBgReady(false)
  img.src = toAssetUrl(bgSrc)
}, [bgSrc])
```

Also handle `theme:` prefixed `bgSrc` — when `bgSrc.startsWith('theme:')`, treat it as a named slide theme rather than a file. In the background rendering logic:

```tsx
const isThemeBg = bgSrc?.startsWith('theme:') ?? false
const resolvedThemeId = isThemeBg ? bgSrc!.slice(6) : slideThemeId
const theme = getTheme(resolvedThemeId)
```

And only show the file-based video/image block when `bgSrc && !isThemeBg`.

- [ ] **Step 4: Typecheck**

```bash
cd C:/Dev/worshipflow && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5: Boot and verify**

```bash
cd C:/Dev/worshipflow && npm run dev
```

- Go to Songs tab, select a song.
- In the Presets tab, click a motion preset — verify the canvas shows it.
- Set an AI-generated image with Pan motion — verify Ken Burns pan animation appears on the canvas and in the output.

- [ ] **Step 6: Commit**

```bash
cd C:/Dev/worshipflow && git add src/shared/types.ts src/main/index.ts src/renderer/src/Output.tsx && git commit -m "feat: Ken Burns + theme: background support in Output.tsx and live broadcast"
```

---

## Self-Review

**Spec coverage check:**
- ✅ WYSIWYG click-to-edit: `SlideCanvas.tsx` — contenteditable textarea overlay on click
- ✅ Floating toolbar: `FloatingToolbar.tsx` — font size, attached to canvas during edit
- ✅ Slide strip: `SlideStrip.tsx` — left thumbnail list, click to navigate
- ✅ My Uploads tab: `BackgroundPanel.tsx` UploadTab section — file dialog, copy to userData
- ✅ Presets tab: 14 CSS motion themes + 6 static = 20 total presets, random button
- ✅ AI Generate tab: `BackgroundPanel.tsx` AI section → `replicateApi.ts` → Flux Schnell
- ✅ Ken Burns / motion overlay: `main.css` keyframes + `SlideCanvas.tsx` + `Output.tsx`
- ✅ Saved per-song: `song.background` + `song.bgMotion` in SQLite via existing `setSongBackground` + new `setSongBgMotion`
- ✅ Replicate API key in Settings: `settingGet`/`settingSet` IPC via existing db `setting` table
- ✅ Generated backgrounds auto-appear in My Uploads: `refreshUploads()` called after generate

**Placeholder scan:** None found.

**Type consistency:** `SongFull.bgMotion` typed as `'pan' | 'zoom' | 'shimmer' | null` throughout. `LiveState.bgMotion` same. `applySlideEdit` takes `EditorSlide` fields correctly. `BackgroundPanel.onBackgroundChange` signature matches `SongEditor.handleBackgroundChange`.
