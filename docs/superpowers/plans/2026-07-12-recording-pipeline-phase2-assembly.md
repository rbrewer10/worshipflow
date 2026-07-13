# Recording Pipeline Phase 2 — Assembly Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual, per-recording "Produce video" action that trims a Phase-1 service recording to skip the pre-service countdown, concatenates optional intro/outro bumpers, and encodes one YouTube-ready MP4 via a bundled ffmpeg — with the clean board audio already in the recording (no muxing).

**Architecture:** A bundled `ffmpeg-static` binary is spawned by the main process. The testable core is two pure functions — `computeTrim` (sidecar → start/end) and `buildFfmpegArgs` (config → argv) — plus a pure `parseFfmpegProgress`. A thin `render.ts` runner spawns ffmpeg, streams progress to the renderer, and updates the `recording` row's `output_path`/`render_state`. The Recordings panel gains Produce / progress / Cancel / Reveal.

**Tech Stack:** Electron (main/preload/renderer), TypeScript, React 18, sql.js, `ffmpeg-static`, `node:child_process`, Vitest, Tailwind v3, electron-builder.

---

## File Structure

**Create:**
- `src/main/ffmpegAssembly.ts` — pure helpers: `computeTrim`, `buildFfmpegArgs`, `parseFfmpegProgress`. No side effects; fully unit-tested.
- `src/main/ffmpegAssembly.test.ts` — Vitest tests for the three pure helpers.
- `src/main/render.ts` — the runner: `createRenderer(deps)` → `{ produce, cancel, isRendering }`. Spawns ffmpeg, parses progress, updates state.

**Modify:**
- `package.json` — add `ffmpeg-static` dependency.
- `electron-builder.yml` — `asarUnpack` the ffmpeg binary; do NOT exclude it from `files`.
- `src/shared/types.ts` — add `RenderState` type; extend `RecordingRow` with `outputPath` + `renderState`.
- `src/main/db.ts` — ALTER-migrate `output_path` + `render_state` onto `recording`; update `listRecordings` SELECT + mapping; add `getRecording(id)` and `setRecordingRender(id, state, outputPath?)`.
- `src/main/index.ts` — resolve the unpacked ffmpeg path; instantiate the renderer; add IPC (`wf:recordings:produce`, `wf:recordings:cancelRender`, `wf:recordings:revealOutput`, assembly-settings get/set + file pickers); relay progress to the operator window.
- `src/preload/index.ts` — bridges: `produceRecording`, `cancelRender`, `onRenderProgress`, `revealOutput`, `getAssemblySettings`, `pickAssemblyFile`.
- `src/renderer/src/RecordingsPanel.tsx` — Produce button + inline start/end confirm, progress bar, Cancel, Reveal, Re-produce; subscribe to `onRenderProgress`.
- `src/renderer/src/ObsPanel.tsx` — an "Assembly" settings sub-section (intro / outro / output-folder pickers).
- `src/renderer/src/browserWfMock.ts` — stubs for the new `window.wf` methods (keeps `typecheck:web` green).

**Conventions to follow (verified in the codebase):**
- Renderer event subscriptions mirror `onNotify` (`src/preload/index.ts:103`): `ipcRenderer.on(channel, handler)` returning an unsubscribe. Main sends via `operatorWin.webContents.send(channel, payload)` (see `notifyOperator`, `index.ts:546`).
- File/folder pickers use `dialog.showOpenDialog(operatorWin, {...})` (see `index.ts:1776`).
- Reveal-in-folder: `shell.openPath` is used for `wf:logs:openFolder` (`index.ts:1471`); use `shell.showItemInFolder(filePath)` to highlight a file.
- asarUnpack already lists `'**/node_modules/sql.js/dist/sql-wasm.wasm'`; the packaged path is de-asar'd by replacing `app.asar` → `app.asar.unpacked`.
- DB migrations use `try { db.run('ALTER TABLE … ADD COLUMN …') } catch {}` after `db.run(SCHEMA)` in `initDb` (`db.ts:133+`). Row-id/read patterns as in Phase 1.
- Settings via `getSetting(key)` / `setSetting(key, value)`.
- Operator toast: `notifyOperator(message, level)`.

---

## Task 1: Types + DB columns for render output/state

**Files:**
- Modify: `src/shared/types.ts` (near the Phase 1 recording types), `src/main/db.ts`.

- [ ] **Step 1: Add `RenderState` and extend `RecordingRow`**

In `src/shared/types.ts`, add near the recording types:

```ts
export type RenderState = 'idle' | 'rendering' | 'done' | 'failed'
```

And add two fields to the existing `RecordingRow` interface:

```ts
  outputPath: string | null    // finished MP4 (null until produced)
  renderState: RenderState     // assembly status; 'idle' when never produced
```

- [ ] **Step 2: Migrate the columns**

In `src/main/db.ts` `initDb`, alongside the other `try { db.run('ALTER TABLE …') } catch {}` lines, add:

```ts
  try { db.run("ALTER TABLE recording ADD COLUMN output_path TEXT") } catch { /* already exists */ }
  try { db.run("ALTER TABLE recording ADD COLUMN render_state TEXT") } catch { /* already exists */ }
```

- [ ] **Step 3: Return the new fields from `listRecordings` and add `getRecording` + `setRecordingRender`**

In `src/main/db.ts`, update `listRecordings`'s SELECT to include the columns and map them (treat null `render_state` as `'idle'`):

```ts
export function listRecordings(): RecordingRow[] {
  const res = db.exec(
    `SELECT r.id, r.service_id, r.started_at, r.ended_at, r.file_path, r.obs_record_started_ms,
            r.output_path, r.render_state,
            (SELECT COUNT(*) FROM recording_marker m WHERE m.recording_id = r.id) AS marker_count
       FROM recording r ORDER BY r.started_at DESC`
  )
  if (!res[0]) return []
  return res[0].values.map((r) => ({
    id: r[0] as number,
    serviceId: r[1] as number | null,
    startedAt: r[2] as number,
    endedAt: r[3] as number | null,
    filePath: r[4] as string | null,
    obsRecordStartedMs: r[5] as number,
    outputPath: r[6] as string | null,
    renderState: ((r[7] as string | null) ?? 'idle') as RecordingRow['renderState'],
    markerCount: r[8] as number
  }))
}

export function getRecording(id: number): RecordingRow | null {
  const res = db.exec(
    `SELECT id, service_id, started_at, ended_at, file_path, obs_record_started_ms, output_path, render_state
       FROM recording WHERE id = ?`,
    [id]
  )
  if (!res[0] || res[0].values.length === 0) return null
  const r = res[0].values[0]
  return {
    id: r[0] as number,
    serviceId: r[1] as number | null,
    startedAt: r[2] as number,
    endedAt: r[3] as number | null,
    filePath: r[4] as string | null,
    obsRecordStartedMs: r[5] as number,
    outputPath: r[6] as string | null,
    renderState: ((r[7] as string | null) ?? 'idle') as RecordingRow['renderState']
  }
}

export function setRecordingRender(id: number, state: RecordingRow['renderState'], outputPath?: string | null): void {
  if (outputPath === undefined) {
    db.run('UPDATE recording SET render_state = ? WHERE id = ?', [state, id])
  } else {
    db.run('UPDATE recording SET render_state = ?, output_path = ? WHERE id = ?', [state, outputPath, id])
  }
  persist()
}
```

Add `RenderState` to the `import type { … } from '../shared/types'` in db.ts if you reference it (the cast via `RecordingRow['renderState']` avoids needing a separate import).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:node`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/main/db.ts
git commit -m "feat(db): recording output_path + render_state columns"
```

---

## Task 2: Bundle ffmpeg-static

**Files:**
- Modify: `package.json`, `electron-builder.yml`.

- [ ] **Step 1: Install ffmpeg-static**

Run: `npm install ffmpeg-static@^5.2.0 --save`
Expected: adds `"ffmpeg-static"` to `dependencies` in `package.json` and installs a platform ffmpeg binary under `node_modules/ffmpeg-static/`.

- [ ] **Step 2: Unpack the binary in the packaged app**

In `electron-builder.yml`, extend the `asarUnpack` list (the ffmpeg binary must be a real on-disk executable, not inside app.asar):

```yaml
asarUnpack:
  - '**/node_modules/sql.js/dist/sql-wasm.wasm'
  - '**/node_modules/ffmpeg-static/**'
```

Do NOT add an `ffmpeg-static` exclusion to `files:` — it must ship.

- [ ] **Step 3: Verify the binary resolves**

Run: `node -e "console.log(require('ffmpeg-static'))"`
Expected: prints an absolute path ending in `ffmpeg.exe` (Windows) that exists on disk.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json electron-builder.yml
git commit -m "build: bundle ffmpeg-static (asarUnpack) for video assembly"
```

---

## Task 3: `computeTrim` (pure, TDD)

**Files:**
- Create: `src/main/ffmpegAssembly.ts`, `src/main/ffmpegAssembly.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/main/ffmpegAssembly.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeTrim } from './ffmpegAssembly'
import type { RecordingSidecar } from '../shared/types'

function sidecar(markers: RecordingSidecar['markers'], durationMs: number): RecordingSidecar {
  return {
    worshipflowVersion: '0.9.0',
    service: { id: 1, name: 'Sunday', date: '2026-07-19' },
    recording: { startedAt: 0, durationMs, file: 'x.mkv' },
    markers
  }
}

describe('computeTrim', () => {
  it('starts at the first song/sermon marker, skipping a leading countdown', () => {
    const sc = sidecar([
      { kind: 'item', label: 'Countdown', offsetMs: 0 },
      { kind: 'song', label: 'Opener', offsetMs: 300000 },
      { kind: 'sermon', label: 'Msg', offsetMs: 1800000 }
    ], 3600000)
    expect(computeTrim(sc)).toEqual({ startMs: 300000, endMs: 3600000 })
  })

  it('starts at 0 when there is no song or sermon marker', () => {
    const sc = sidecar([{ kind: 'item', label: 'Announcements', offsetMs: 0 }], 600000)
    expect(computeTrim(sc)).toEqual({ startMs: 0, endMs: 600000 })
  })

  it('lets an operator override win over the default', () => {
    const sc = sidecar([{ kind: 'song', label: 'Opener', offsetMs: 300000 }], 3600000)
    expect(computeTrim(sc, { startMs: 120000, endMs: 3000000 })).toEqual({ startMs: 120000, endMs: 3000000 })
  })

  it('clamps overrides into [0, duration]', () => {
    const sc = sidecar([{ kind: 'song', label: 'Opener', offsetMs: 300000 }], 3600000)
    expect(computeTrim(sc, { startMs: -50, endMs: 9999999 })).toEqual({ startMs: 0, endMs: 3600000 })
  })

  it('falls back to the full recording when the range is inverted', () => {
    const sc = sidecar([{ kind: 'song', label: 'Opener', offsetMs: 300000 }], 3600000)
    expect(computeTrim(sc, { startMs: 3000000, endMs: 1000000 })).toEqual({ startMs: 0, endMs: 3600000 })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/ffmpegAssembly.test.ts`
Expected: FAIL — `Cannot find module './ffmpegAssembly'`.

- [ ] **Step 3: Implement `computeTrim`**

Create `src/main/ffmpegAssembly.ts`:

```ts
import type { RecordingSidecar } from '../shared/types'

export interface TrimResult {
  startMs: number
  endMs: number
}

// Default trim: skip a leading pre-service countdown by starting at the first
// worship song or the sermon; keep everything through the recording's end.
// An operator override (either bound) wins; both bounds are clamped to the
// recording, and an inverted range falls back to the full recording.
export function computeTrim(
  sidecar: RecordingSidecar,
  override?: { startMs?: number; endMs?: number }
): TrimResult {
  const dur = sidecar.recording.durationMs
  const firstContent = sidecar.markers.find((m) => m.kind === 'song' || m.kind === 'sermon')
  let startMs = firstContent ? firstContent.offsetMs : 0
  let endMs = dur
  if (override?.startMs != null) startMs = override.startMs
  if (override?.endMs != null) endMs = override.endMs
  startMs = Math.max(0, Math.min(startMs, dur))
  endMs = Math.max(0, Math.min(endMs, dur))
  if (endMs <= startMs) return { startMs: 0, endMs: dur }
  return { startMs, endMs }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/main/ffmpegAssembly.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/ffmpegAssembly.ts src/main/ffmpegAssembly.test.ts
git commit -m "feat(assembly): computeTrim pure helper (TDD)"
```

---

## Task 4: `buildFfmpegArgs` (pure, TDD)

**Files:**
- Modify: `src/main/ffmpegAssembly.ts`, `src/main/ffmpegAssembly.test.ts`.

- [ ] **Step 1: Add failing tests**

Append to `src/main/ffmpegAssembly.test.ts`:

```ts
import { buildFfmpegArgs } from './ffmpegAssembly'

describe('buildFfmpegArgs', () => {
  const base = { servicePath: '/nas/svc.mkv', startMs: 300000, endMs: 3600000, outputPath: '/nas/svc-final.mp4' }

  it('trims the service and concats a single segment when no bumpers', () => {
    const a = buildFfmpegArgs(base)
    expect(a.filter((x) => x === '-i')).toHaveLength(1)
    expect(a).toContain('-ss'); expect(a).toContain('300.000')
    expect(a).toContain('-to'); expect(a).toContain('3600.000')
    expect(a.join(' ')).toContain('concat=n=1:v=1:a=1')
    expect(a[a.length - 1]).toBe('/nas/svc-final.mp4')
    expect(a.join(' ')).toContain('-map [v] -map [a]')
  })

  it('puts the intro first and the service second', () => {
    const a = buildFfmpegArgs({ ...base, introPath: '/nas/intro.mp4' })
    expect(a.filter((x) => x === '-i')).toHaveLength(2)
    const introIdx = a.indexOf('/nas/intro.mp4')
    const svcIdx = a.indexOf('/nas/svc.mkv')
    expect(introIdx).toBeGreaterThan(-1)
    expect(introIdx).toBeLessThan(svcIdx)
    expect(a.join(' ')).toContain('concat=n=2:v=1:a=1')
  })

  it('appends the outro last and builds a 3-segment concat', () => {
    const a = buildFfmpegArgs({ ...base, introPath: '/nas/intro.mp4', outroPath: '/nas/outro.mp4' })
    expect(a.filter((x) => x === '-i')).toHaveLength(3)
    expect(a.indexOf('/nas/outro.mp4')).toBeGreaterThan(a.indexOf('/nas/svc.mkv'))
    expect(a.join(' ')).toContain('concat=n=3:v=1:a=1')
  })

  it('includes libx264/aac output flags and -y', () => {
    const a = buildFfmpegArgs(base)
    expect(a).toContain('-c:v'); expect(a).toContain('libx264')
    expect(a).toContain('-c:a'); expect(a).toContain('aac')
    expect(a[0]).toBe('-y')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/main/ffmpegAssembly.test.ts`
Expected: FAIL — `buildFfmpegArgs` not exported.

- [ ] **Step 3: Implement `buildFfmpegArgs`**

Append to `src/main/ffmpegAssembly.ts`:

```ts
export interface FfmpegBuildInput {
  servicePath: string
  introPath?: string | null
  outroPath?: string | null
  startMs: number
  endMs: number
  outputPath: string
  width?: number
  height?: number
  fps?: number
  crf?: number
}

// Builds the ffmpeg argv for: [intro?] + trimmed service + [outro?], each segment
// normalized to the same WxH/fps/format so concat works across differing sources,
// re-encoded to H.264/AAC MP4. Trimming uses input seeking on the service input.
export function buildFfmpegArgs(input: FfmpegBuildInput): string[] {
  const width = input.width ?? 1920
  const height = input.height ?? 1080
  const fps = input.fps ?? 30
  const crf = input.crf ?? 20
  const startSec = (input.startMs / 1000).toFixed(3)
  const endSec = (input.endMs / 1000).toFixed(3)

  const args: string[] = ['-y']
  const inputIndices: number[] = [] // ffmpeg input indices in play order
  let idx = 0
  if (input.introPath) { args.push('-i', input.introPath); inputIndices.push(idx++) }
  args.push('-ss', startSec, '-to', endSec, '-i', input.servicePath); inputIndices.push(idx++)
  if (input.outroPath) { args.push('-i', input.outroPath); inputIndices.push(idx++) }

  const vf =
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p`
  const af = 'aformat=sample_rates=48000:channel_layouts=stereo'

  const filters: string[] = []
  let concatInputs = ''
  inputIndices.forEach((inIdx, i) => {
    filters.push(`[${inIdx}:v]${vf}[v${i}]`)
    filters.push(`[${inIdx}:a]${af}[a${i}]`)
    concatInputs += `[v${i}][a${i}]`
  })
  filters.push(`${concatInputs}concat=n=${inputIndices.length}:v=1:a=1[v][a]`)

  args.push('-filter_complex', filters.join(';'))
  args.push('-map', '[v]', '-map', '[a]')
  args.push('-c:v', 'libx264', '-crf', String(crf), '-preset', 'veryfast')
  args.push('-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart')
  args.push(input.outputPath)
  return args
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/main/ffmpegAssembly.test.ts`
Expected: PASS (9 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/main/ffmpegAssembly.ts src/main/ffmpegAssembly.test.ts
git commit -m "feat(assembly): buildFfmpegArgs pure helper (TDD)"
```

---

## Task 5: `parseFfmpegProgress` + the runner `render.ts`

**Files:**
- Modify: `src/main/ffmpegAssembly.ts`, `src/main/ffmpegAssembly.test.ts`.
- Create: `src/main/render.ts`.

- [ ] **Step 1: Add a failing test for `parseFfmpegProgress`**

Append to `src/main/ffmpegAssembly.test.ts`:

```ts
import { parseFfmpegProgress } from './ffmpegAssembly'

describe('parseFfmpegProgress', () => {
  it('parses a time= line into a 0..1 fraction of the total', () => {
    // 30 min into a 60 min output → 0.5
    expect(parseFfmpegProgress('frame=1 fps=30 time=00:30:00.00 bitrate=…', 3600)).toBeCloseTo(0.5, 5)
  })
  it('returns null for a line with no time=', () => {
    expect(parseFfmpegProgress('Press [q] to stop', 3600)).toBeNull()
  })
  it('clamps to 1 when time exceeds the total', () => {
    expect(parseFfmpegProgress('time=01:10:00.00', 3600)).toBe(1)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/main/ffmpegAssembly.test.ts`
Expected: FAIL — `parseFfmpegProgress` not exported.

- [ ] **Step 3: Implement `parseFfmpegProgress`**

Append to `src/main/ffmpegAssembly.ts`:

```ts
// Extracts a 0..1 progress fraction from an ffmpeg stderr line's `time=HH:MM:SS.ss`
// against the expected output duration in seconds. Returns null if no time is present.
export function parseFfmpegProgress(line: string, totalSec: number): number | null {
  const m = line.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!m) return null
  const sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + parseFloat(m[3])
  if (totalSec <= 0) return 0
  return Math.max(0, Math.min(1, sec / totalSec))
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/main/ffmpegAssembly.test.ts`
Expected: PASS (12 tests total).

- [ ] **Step 5: Implement the runner `render.ts`**

Create `src/main/render.ts`:

```ts
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import type { RecordingRow, RecordingMarker, RecordingSidecar } from '../shared/types'
import { buildFfmpegArgs, computeTrim, parseFfmpegProgress } from './ffmpegAssembly'

export interface RenderDeps {
  ffmpegPath: string
  getRecording: (id: number) => RecordingRow | null
  listMarkers: (id: number) => RecordingMarker[]
  setRenderState: (id: number, state: RecordingRow['renderState'], outputPath?: string | null) => void
  getSetting: (key: string) => string | null
  onProgress: (id: number, fraction: number) => void
  toast: (message: string, level?: 'info' | 'warn' | 'error') => void
}

export interface Renderer {
  produce: (recordingId: number, override?: { startMs?: number; endMs?: number }) => Promise<void>
  cancel: (recordingId: number) => void
  isRendering: () => boolean
}

// Load the sidecar written by Phase 1 next to the video; if it's missing, rebuild
// an equivalent from the DB markers + the recording row.
function loadSidecar(rec: RecordingRow, markers: RecordingMarker[]): RecordingSidecar | null {
  if (!rec.filePath) return null
  const sidecarPath = rec.filePath.replace(/\.[^.\\/]+$/, '') + '.worshipflow.json'
  if (existsSync(sidecarPath)) {
    try { return JSON.parse(readFileSync(sidecarPath, 'utf-8')) as RecordingSidecar } catch { /* fall through */ }
  }
  const durationMs = rec.endedAt != null ? rec.endedAt - rec.startedAt : 0
  return {
    worshipflowVersion: 'rebuilt',
    service: { id: rec.serviceId, name: '', date: null },
    recording: { startedAt: rec.obsRecordStartedMs, durationMs, file: basename(rec.filePath) },
    markers: markers.map((m) => ({ kind: m.kind, label: m.label, offsetMs: m.offsetMs }))
  }
}

export function createRenderer(deps: RenderDeps): Renderer {
  let child: ChildProcessWithoutNullStreams | null = null
  let activeId: number | null = null
  let canceledId: number | null = null

  function outputPathFor(servicePath: string): string {
    const folder = deps.getSetting('assemblyOutputFolder') || dirname(servicePath)
    const stem = basename(servicePath, extname(servicePath))
    return join(folder, `${stem}-final.mp4`)
  }

  return {
    isRendering: () => child != null,

    cancel(recordingId: number) {
      if (activeId === recordingId && child) {
        canceledId = recordingId
        child.kill()
      }
    },

    async produce(recordingId, override) {
      if (child) { deps.toast('A video is already being produced — wait for it to finish.', 'warn'); return }
      const rec = deps.getRecording(recordingId)
      if (!rec || !rec.filePath || !existsSync(rec.filePath)) {
        deps.toast('Recording file not found — cannot produce.', 'error'); return
      }
      const sidecar = loadSidecar(rec, deps.listMarkers(recordingId))
      if (!sidecar) { deps.toast('Recording metadata missing — cannot produce.', 'error'); return }

      const { startMs, endMs } = computeTrim(sidecar, override)
      const outputPath = outputPathFor(rec.filePath)
      const args = buildFfmpegArgs({
        servicePath: rec.filePath,
        introPath: deps.getSetting('assemblyIntroPath'),
        outroPath: deps.getSetting('assemblyOutroPath'),
        startMs, endMs, outputPath
      })
      const totalSec = (endMs - startMs) / 1000

      deps.setRenderState(recordingId, 'rendering')
      activeId = recordingId
      canceledId = null

      await new Promise<void>((resolve) => {
        child = spawn(deps.ffmpegPath, args)
        child.stderr.on('data', (buf: Buffer) => {
          const frac = parseFfmpegProgress(buf.toString(), totalSec)
          if (frac != null) deps.onProgress(recordingId, frac)
        })
        child.on('error', (err) => {
          child = null; activeId = null
          deps.setRenderState(recordingId, 'failed')
          deps.toast(`Video production failed: ${err.message}`, 'error')
          resolve()
        })
        child.on('close', (code) => {
          const wasCanceled = canceledId === recordingId
          child = null; activeId = null
          if (wasCanceled) {
            try { if (existsSync(outputPath)) rmSync(outputPath) } catch { /* ignore */ }
            deps.setRenderState(recordingId, 'idle')
            deps.toast('Video production canceled.', 'info')
          } else if (code === 0) {
            deps.setRenderState(recordingId, 'done', outputPath)
            deps.toast('Video produced successfully.', 'info')
          } else {
            try { if (existsSync(outputPath)) rmSync(outputPath) } catch { /* ignore */ }
            deps.setRenderState(recordingId, 'failed')
            deps.toast(`Video production failed (ffmpeg exit ${code}).`, 'error')
          }
          resolve()
        })
      })
    }
  }
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck:node`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/ffmpegAssembly.ts src/main/ffmpegAssembly.test.ts src/main/render.ts
git commit -m "feat(assembly): ffmpeg progress parser + render runner"
```

---

## Task 6: Wire the renderer into main

**Files:**
- Modify: `src/main/index.ts`.

- [ ] **Step 1: Resolve the unpacked ffmpeg path + instantiate the renderer**

Near the top-of-file imports in `index.ts`, add:

```ts
import ffmpegStatic from 'ffmpeg-static'
import { createRenderer } from './render'
import { getRecording, setRecordingRender } from './db'
import { shell } from 'electron' // merge into the existing electron import if present
```

(Merge `shell` into the existing `import { … } from 'electron'` rather than duplicating. `listRecordingMarkers`, `getSetting`, `setSetting`, `notifyOperator` are already imported/defined.)

Add a resolver + the renderer instance at module scope (after `notifyOperator` and `operatorWin` exist — `operatorWin` is referenced lazily inside `onProgress`):

```ts
// ffmpeg-static points inside app.asar when packaged; the binary is asarUnpack'd,
// so swap to the unpacked path (mirrors the sql.js wasm handling).
function resolveFfmpegPath(): string {
  const p = (ffmpegStatic as unknown as string) || 'ffmpeg'
  return p.replace('app.asar', 'app.asar.unpacked')
}

const renderer = createRenderer({
  ffmpegPath: resolveFfmpegPath(),
  getRecording,
  listMarkers: listRecordingMarkers,
  setRenderState: setRecordingRender,
  getSetting,
  onProgress: (id, fraction) => {
    if (operatorWin && !operatorWin.isDestroyed()) {
      operatorWin.webContents.send('wf:recordings:renderProgress', { recordingId: id, fraction })
    }
  },
  toast: (message, level) => notifyOperator(message, level ?? 'info')
})
```

- [ ] **Step 2: Add the produce/cancel/reveal IPC handlers**

Add near the other `wf:recordings:*` handlers:

```ts
ipcMain.handle('wf:recordings:produce', (_e, recordingId: number, override?: { startMs?: number; endMs?: number }) =>
  renderer.produce(recordingId, override)
)
ipcMain.handle('wf:recordings:cancelRender', (_e, recordingId: number) => { renderer.cancel(recordingId) })
ipcMain.handle('wf:recordings:revealOutput', async (_e, outputPath: string) => {
  if (outputPath) shell.showItemInFolder(outputPath)
})
```

- [ ] **Step 3: Add assembly-settings get/set + file pickers**

```ts
ipcMain.handle('wf:recordings:getAssemblySettings', () => ({
  introPath: getSetting('assemblyIntroPath'),
  outroPath: getSetting('assemblyOutroPath'),
  outputFolder: getSetting('assemblyOutputFolder')
}))
ipcMain.handle('wf:recordings:setAssemblySetting', (_e, key: 'introPath' | 'outroPath' | 'outputFolder', value: string | null) => {
  const map = { introPath: 'assemblyIntroPath', outroPath: 'assemblyOutroPath', outputFolder: 'assemblyOutputFolder' } as const
  setSetting(map[key], value)
})
ipcMain.handle('wf:recordings:pickAssemblyFile', async (_e, kind: 'video' | 'folder'): Promise<string | null> => {
  const res = await dialog.showOpenDialog(operatorWin!, kind === 'folder'
    ? { properties: ['openDirectory'] }
    : { properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm'] }] })
  if (res.canceled || res.filePaths.length === 0) return null
  return res.filePaths[0]
})
```

(Confirm `dialog` and `operatorWin` are already in scope — they are used elsewhere in index.ts.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:node`
Expected: PASS. Fix any import/scope mismatches against the real file.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(main): wire ffmpeg renderer + assembly settings IPC"
```

---

## Task 7: Preload bridges + browser mock

**Files:**
- Modify: `src/preload/index.ts`, `src/renderer/src/browserWfMock.ts`.

- [ ] **Step 1: Add the bridges**

Add to the `wf` object in `src/preload/index.ts` (place the event subscriber next to `onNotify`):

```ts
  produceRecording: (recordingId: number, override?: { startMs?: number; endMs?: number }): Promise<void> =>
    ipcRenderer.invoke('wf:recordings:produce', recordingId, override),
  cancelRender: (recordingId: number): Promise<void> =>
    ipcRenderer.invoke('wf:recordings:cancelRender', recordingId),
  revealOutput: (outputPath: string): Promise<void> =>
    ipcRenderer.invoke('wf:recordings:revealOutput', outputPath),
  getAssemblySettings: (): Promise<{ introPath: string | null; outroPath: string | null; outputFolder: string | null }> =>
    ipcRenderer.invoke('wf:recordings:getAssemblySettings'),
  setAssemblySetting: (key: 'introPath' | 'outroPath' | 'outputFolder', value: string | null): Promise<void> =>
    ipcRenderer.invoke('wf:recordings:setAssemblySetting', key, value),
  pickAssemblyFile: (kind: 'video' | 'folder'): Promise<string | null> =>
    ipcRenderer.invoke('wf:recordings:pickAssemblyFile', kind),
  onRenderProgress: (cb: (p: { recordingId: number; fraction: number }) => void): (() => void) => {
    const handler = (_e: unknown, p: { recordingId: number; fraction: number }): void => cb(p)
    ipcRenderer.on('wf:recordings:renderProgress', handler)
    return () => ipcRenderer.removeListener('wf:recordings:renderProgress', handler)
  },
```

- [ ] **Step 2: Add matching stubs to the browser mock**

In `src/renderer/src/browserWfMock.ts`, add stub implementations so the mock still satisfies `Window['wf']` (mirror the style of the existing Phase-1 recording stubs):

```ts
  produceRecording: async () => {},
  cancelRender: async () => {},
  revealOutput: async () => {},
  getAssemblySettings: async () => ({ introPath: null, outroPath: null, outputFolder: null }),
  setAssemblySetting: async () => {},
  pickAssemblyFile: async () => null,
  onRenderProgress: () => () => {},
```

- [ ] **Step 3: Typecheck (full)**

Run: `npm run typecheck`
Expected: PASS (node + web). If the web side errors that `browserWfMock` is missing a member, you missed a stub — add it.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/renderer/src/browserWfMock.ts
git commit -m "feat(preload): produce/cancel/progress + assembly settings bridges"
```

---

## Task 8: Recordings panel — Produce / progress / cancel / reveal

**Files:**
- Modify: `src/renderer/src/RecordingsPanel.tsx`.

- [ ] **Step 1: Rework the row to be render-state aware**

Read the current `RecordingsPanel.tsx` (from Phase 1) first. Replace its body so each row reacts to `renderState`, subscribes to progress, and offers the controls. Use this implementation (adapt class names to match the file's existing idiom if needed):

```tsx
import { JSX, useEffect, useState } from 'react'
import type { RecordingRow } from '../../shared/types'

function fmtClock(ms: number): string {
  const s = Math.floor(ms / 1000)
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${mm}:${String(ss).padStart(2, '0')}`
}

function fmtDuration(startedAt: number, endedAt: number | null): string {
  if (endedAt == null) return '—'
  const mins = Math.round((endedAt - startedAt) / 60000)
  return mins > 0 ? `${mins} min` : '—'
}

export function RecordingsPanel(): JSX.Element {
  const [rows, setRows] = useState<RecordingRow[]>([])
  const [progress, setProgress] = useState<Record<number, number>>({})

  const refresh = (): void => { void window.wf.recordingsList().then(setRows) }
  useEffect(() => {
    refresh()
    const off = window.wf.onRenderProgress(({ recordingId, fraction }) => {
      setProgress((p) => ({ ...p, [recordingId]: fraction }))
      if (fraction >= 1) setTimeout(refresh, 800)
    })
    return off
  }, [])

  if (rows.length === 0) {
    return <p className="text-xs text-slate-400">No recordings yet. Recordings start automatically when you go live.</p>
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.id} className="rounded border border-slate-200 p-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-700">{new Date(r.startedAt).toLocaleString()}</span>
            <span className="text-slate-500">{fmtDuration(r.startedAt, r.endedAt)}</span>
          </div>
          <div className="mt-0.5 text-slate-500">{r.markerCount ?? 0} chapters</div>

          {r.renderState === 'rendering' ? (
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded bg-slate-200">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round((progress[r.id] ?? 0) * 100)}%` }} />
              </div>
              <button onClick={() => void window.wf.cancelRender(r.id)} className="mt-1 text-rose-600 hover:underline">Cancel</button>
            </div>
          ) : r.renderState === 'done' && r.outputPath ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-emerald-600">Produced</span>
              <button onClick={() => void window.wf.revealOutput(r.outputPath!)} className="text-slate-600 hover:underline">Reveal file</button>
              <ProduceButton row={r} onDone={refresh} label="Re-produce" />
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              {r.renderState === 'failed' && <span className="text-rose-600">Failed</span>}
              {r.filePath ? <ProduceButton row={r} onDone={refresh} label="Produce video" />
                          : <span className="text-slate-400">No file</span>}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function ProduceButton({ row, onDone, label }: { row: RecordingRow; onDone: () => void; label: string }): JSX.Element {
  const [open, setOpen] = useState(false)
  const durMs = row.endedAt != null ? row.endedAt - row.startedAt : 0
  // Empty fields mean "auto" — produce with no override so computeTrim's default
  // (start at first song/sermon, skip the countdown) applies. A filled field
  // becomes an explicit operator override.
  const [startSec, setStartSec] = useState('')
  const [endSec, setEndSec] = useState('')

  const start = async (): Promise<void> => {
    setOpen(false)
    const hasOverride = startSec.trim() !== '' || endSec.trim() !== ''
    await window.wf.produceRecording(row.id, hasOverride ? {
      startMs: Math.max(0, Math.round(parseFloat(startSec || '0') * 1000)),
      endMs: Math.round(parseFloat(endSec || String(Math.floor(durMs / 1000))) * 1000)
    } : undefined)
    onDone()
  }

  if (!open) return <button onClick={() => setOpen(true)} className="text-emerald-700 hover:underline">{label}</button>
  return (
    <span className="flex items-center gap-1">
      <span className="text-slate-500">start</span>
      <input value={startSec} placeholder="auto" onChange={(e) => setStartSec(e.target.value)} className="w-14 rounded border border-slate-300 px-1" />
      <span className="text-slate-500">end (s)</span>
      <input value={endSec} placeholder="auto" onChange={(e) => setEndSec(e.target.value)} className="w-16 rounded border border-slate-300 px-1" />
      <button onClick={() => void start()} className="text-emerald-700 hover:underline">Go</button>
      <button onClick={() => setOpen(false)} className="text-slate-400 hover:underline">✕</button>
    </span>
  )
}
```

Behavior: both fields start empty (placeholder `auto`) → producing with them blank runs the default auto-trim (skip the leading countdown). Typing a start and/or end sends an explicit override that `computeTrim` clamps. Predictable: blank = auto, filled = exactly what you typed.

- [ ] **Step 2: Typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS (node + web); tests still 100 (88 + 12 assembly/recording). 

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/RecordingsPanel.tsx
git commit -m "feat(ui): produce/progress/cancel/reveal in recordings panel"
```

---

## Task 9: Assembly settings in ObsPanel

**Files:**
- Modify: `src/renderer/src/ObsPanel.tsx`.

- [ ] **Step 1: Add an Assembly settings sub-section**

In `ObsPanel.tsx`, near the "Auto-record services" toggle added in Phase 1, add state + a small settings block. Follow ObsPanel's existing card idiom:

```tsx
  const [asm, setAsm] = useState<{ introPath: string | null; outroPath: string | null; outputFolder: string | null }>({ introPath: null, outroPath: null, outputFolder: null })
  useEffect(() => { void window.wf.getAssemblySettings().then(setAsm) }, [])
  const pick = async (key: 'introPath' | 'outroPath' | 'outputFolder'): Promise<void> => {
    const path = await window.wf.pickAssemblyFile(key === 'outputFolder' ? 'folder' : 'video')
    if (path == null) return
    await window.wf.setAssemblySetting(key, path)
    setAsm((a) => ({ ...a, [key]: path }))
  }
  const clear = async (key: 'introPath' | 'outroPath' | 'outputFolder'): Promise<void> => {
    await window.wf.setAssemblySetting(key, null)
    setAsm((a) => ({ ...a, [key]: null }))
  }
```

And the JSX (place under the auto-record toggle / above the recordings list, matching the surrounding style):

```tsx
      <div className="mt-3 border-t border-slate-200 pt-2">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Video assembly</h3>
        {(['introPath', 'outroPath', 'outputFolder'] as const).map((key) => (
          <div key={key} className="mb-1 flex items-center gap-2 text-xs">
            <span className="w-16 shrink-0 text-slate-500">
              {key === 'introPath' ? 'Intro' : key === 'outroPath' ? 'Outro' : 'Output'}
            </span>
            <span className="min-w-0 flex-1 truncate text-slate-600" title={asm[key] ?? ''}>{asm[key] ?? <em className="text-slate-400">none</em>}</span>
            <button onClick={() => void pick(key)} className="text-emerald-700 hover:underline">Choose</button>
            {asm[key] && <button onClick={() => void clear(key)} className="text-slate-400 hover:underline">Clear</button>}
          </div>
        ))}
        <p className="text-[11px] text-slate-400">Intro/outro are optional bumper videos. Output defaults to each recording&rsquo;s own folder.</p>
      </div>
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/ObsPanel.tsx
git commit -m "feat(ui): intro/outro/output settings for video assembly"
```

---

## Task 10: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: PASS (node + web).

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: PASS — Phase 1's 95 tests plus the 12 new `ffmpegAssembly.test.ts` assertions grouped into their describes (the suite count rises accordingly; no prior test regresses).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: PASS (electron-vite builds main/preload/renderer; `ffmpeg-static` import resolves in the main bundle).

- [ ] **Step 4: Manual smoke test (documented, run by the operator at the booth)**

Document in the commit body / PR:
1. In the OBS panel → Video assembly, leave intro/outro/output empty (or set a short MP4 intro).
2. On a Phase-1 recording with a Sermon + songs, click **Produce video**; leave start/end blank (auto) → confirm.
3. Watch the progress bar advance; on completion the row shows **Produced** + **Reveal file**.
4. Click **Reveal file** → the `-final.mp4` is highlighted in Explorer; play it: it starts at the first song (countdown trimmed), audio is the clean board feed, intro (if set) plays first.
5. Set an override (start `30`, end blank) and re-produce → the output starts 30s in.
6. Start a produce, click **Cancel** → row returns to idle, no `-final.mp4` left behind.
7. Point OBS's record folder + the Output setting at the NAS and confirm the finished file lands there.

- [ ] **Step 5: Commit (if fixes were needed)**

```bash
git add -A
git commit -m "test: verify Phase 2 assembly end-to-end"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** ffmpeg bundling (Task 2); `computeTrim` default + override + clamp (Task 3); `buildFfmpegArgs` intro/service/outro concat + trim + codecs (Task 4); progress parse + runner with one-at-a-time guard, cancel, failure cleanup, sidecar-with-DB-fallback (Task 5); main wiring incl. asar-unpacked ffmpeg path + IPC + settings/pickers (Task 6); preload + mock (Task 7); Produce/progress/cancel/reveal/re-produce UI + operator start/end nudge (Task 8); intro/outro/output settings UI (Task 9); output columns/state (Task 1). Success criteria exercised in Task 10 Step 4.
- **Placeholder scan:** none — pure-function tasks carry complete code; wiring/UI tasks carry complete code plus "match the sibling idiom" reconciliation notes (real prop/scope names to confirm: the `electron` import merge for `shell`, `operatorWin`/`dialog` scope in index.ts, ObsPanel's card classes).
- **Type consistency:** `RecordingRow.outputPath`/`renderState` (Task 1) are consumed identically in Tasks 5/8; `RenderState` union matches the `setRecordingRender`/`setRenderState` states used in `render.ts`; `computeTrim`/`buildFfmpegArgs`/`parseFfmpegProgress` signatures match between Tasks 3–5 and their `render.ts` call sites; IPC channel names match across Tasks 6 (handle) and 7 (invoke): `wf:recordings:produce|cancelRender|revealOutput|getAssemblySettings|setAssemblySetting|pickAssemblyFile|renderProgress`.
