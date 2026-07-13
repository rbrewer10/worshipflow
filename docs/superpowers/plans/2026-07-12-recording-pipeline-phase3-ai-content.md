# Recording Pipeline Phase 3 — AI Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual, per-recording "Generate content" action that (on the Phase-2 final MP4) transcribes via Replicate Whisper, writes an `.srt`, builds chapters from Phase-1 markers, generates a YouTube title + description via Claude, and renders a thumbnail (Flux background + title overlay) — all editable in the Recordings panel.

**Architecture:** Reuse the bundled ffmpeg (audio extract), the existing `replicateApi.ts` (Whisper + Flux), a new thin `anthropicApi.ts` (Claude Messages), and an offscreen `BrowserWindow.capturePage()` for the thumbnail. Pure helpers (`buildSrt`, `buildChapters`, `buildContentPrompt`) are the tested core; a `content.ts` runner orchestrates and updates the recording row.

**Tech Stack:** Electron (main/preload/renderer), TypeScript, React 18, sql.js, `ffmpeg-static`, Replicate + Anthropic HTTPS APIs, Vitest, Tailwind v3.

---

## File Structure

**Create:**
- `src/main/aiContent.ts` — pure helpers `buildSrt`, `buildChapters`, `buildContentPrompt` + `TranscriptSegment` type. No side effects.
- `src/main/aiContent.test.ts` — Vitest tests for the pure helpers.
- `src/main/anthropicApi.ts` — `generateSermonContent(prompt, apiKey)` (Claude Messages).
- `src/main/content.ts` — `createContentRunner(deps)` → `{ generate, isBusy }`.

**Modify:**
- `src/main/replicateApi.ts` — add `uploadFileToReplicate` + `transcribeAudio`.
- `src/shared/types.ts` — extend `RecordingRow` with AI fields; add `AiState` type + `TranscriptSegment` re-export if needed.
- `src/main/db.ts` — ALTER-migrate AI columns; extend `listRecordings`/`getRecording`; add `setRecordingAi`.
- `src/main/index.ts` — extract-audio helper; instantiate the content runner; IPC (`wf:recordings:generateContent`, `wf:recordings:saveAi`, `wf:recordings:revealPath`, anthropic-key get/set); relay `wf:recordings:aiProgress`.
- `src/preload/index.ts` — bridges: `generateContent`, `saveAi`, `revealPath`, `getAnthropicKey`, `setAnthropicKey`, `onAiProgress`.
- `src/renderer/src/browserWfMock.ts` — stubs for the new bridges.
- `src/renderer/src/RecordingsPanel.tsx` — Generate content, step label, editable title/description, reveal srt/thumbnail, regenerate.
- `src/renderer/src/ObsPanel.tsx` — Anthropic API-key input in the assembly settings block.

**Conventions (verified):** Replicate HTTPS helpers + create/poll pattern in `replicateApi.ts`; settings via `getSetting`/`setSetting` (`replicate_api_key` exists); ffmpeg path via `resolveFfmpegPath()` (Phase 2, `index.ts`); toast via `notifyOperator`; renderer events mirror `onRenderProgress`/`onRenderState`; reveal via `shell.showItemInFolder`; DB migrations via `try { ALTER } catch {}`.

---

## Task 1: Storage — AI columns on `recording`

**Files:** Modify `src/shared/types.ts`, `src/main/db.ts`.

- [ ] **Step 1: Types**

In `src/shared/types.ts`, add:

```ts
export type AiState = 'idle' | 'generating' | 'done' | 'failed'
```

And extend `RecordingRow` with:

```ts
  transcript: string | null
  aiTitle: string | null
  aiDescription: string | null
  chapters: string | null
  srtPath: string | null
  thumbnailPath: string | null
  aiState: AiState
```

- [ ] **Step 2: Migrate columns**

In `src/main/db.ts` `initDb`, add alongside the other ALTERs:

```ts
  try { db.run("ALTER TABLE recording ADD COLUMN transcript TEXT") } catch { /* exists */ }
  try { db.run("ALTER TABLE recording ADD COLUMN ai_title TEXT") } catch { /* exists */ }
  try { db.run("ALTER TABLE recording ADD COLUMN ai_description TEXT") } catch { /* exists */ }
  try { db.run("ALTER TABLE recording ADD COLUMN chapters TEXT") } catch { /* exists */ }
  try { db.run("ALTER TABLE recording ADD COLUMN srt_path TEXT") } catch { /* exists */ }
  try { db.run("ALTER TABLE recording ADD COLUMN thumbnail_path TEXT") } catch { /* exists */ }
  try { db.run("ALTER TABLE recording ADD COLUMN ai_state TEXT") } catch { /* exists */ }
```

- [ ] **Step 3: Read/write helpers**

Update `listRecordings` and `getRecording` SELECTs to include the 7 columns and map them (append after the Phase-2 fields; `ai_state` null→`'idle'`). For example the mapping additions are:

```ts
    transcript: r[N] as string | null,
    aiTitle: r[N+1] as string | null,
    aiDescription: r[N+2] as string | null,
    chapters: r[N+3] as string | null,
    srtPath: r[N+4] as string | null,
    thumbnailPath: r[N+5] as string | null,
    aiState: ((r[N+6] as string | null) ?? 'idle') as RecordingRow['aiState'],
```

(Use the real column order; add the 7 columns to each SELECT after `render_state`, before the `marker_count` subquery in `listRecordings`, and adjust indices.)

Add:

```ts
export function setRecordingAi(id: number, fields: Partial<Pick<RecordingRow,
  'transcript' | 'aiTitle' | 'aiDescription' | 'chapters' | 'srtPath' | 'thumbnailPath' | 'aiState'>>): void {
  const map: Record<string, string> = {
    transcript: 'transcript', aiTitle: 'ai_title', aiDescription: 'ai_description',
    chapters: 'chapters', srtPath: 'srt_path', thumbnailPath: 'thumbnail_path', aiState: 'ai_state'
  }
  const cols = Object.keys(fields) as (keyof typeof map)[]
  if (cols.length === 0) return
  const sets = cols.map((k) => `${map[k]} = ?`).join(', ')
  const vals = cols.map((k) => (fields as Record<string, unknown>)[k] as string | null)
  db.run(`UPDATE recording SET ${sets} WHERE id = ?`, [...vals, id])
  persist()
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:node`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/main/db.ts
git commit -m "feat(db): AI content columns on recording"
```

---

## Task 2: `buildSrt` (pure, TDD)

**Files:** Create `src/main/aiContent.ts`, `src/main/aiContent.test.ts`.

- [ ] **Step 1: Failing test**

Create `src/main/aiContent.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildSrt, type TranscriptSegment } from './aiContent'

describe('buildSrt', () => {
  it('formats segments as standard SRT with comma-millisecond timestamps', () => {
    const segs: TranscriptSegment[] = [
      { start: 0, end: 2.5, text: 'Good morning.' },
      { start: 2.5, end: 5, text: 'Let us pray.' }
    ]
    expect(buildSrt(segs)).toBe(
      '1\n00:00:00,000 --> 00:00:02,500\nGood morning.\n\n' +
      '2\n00:00:02,500 --> 00:00:05,000\nLet us pray.\n'
    )
  })
  it('handles hours and trims text', () => {
    const out = buildSrt([{ start: 3661.2, end: 3662, text: '  hi  ' }])
    expect(out).toContain('01:01:01,200 --> 01:01:02,000')
    expect(out).toContain('\nhi\n')
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `npx vitest run src/main/aiContent.test.ts`
Expected: FAIL — `Cannot find module './aiContent'`.

- [ ] **Step 3: Implement**

Create `src/main/aiContent.ts`:

```ts
export interface TranscriptSegment {
  start: number // seconds
  end: number   // seconds
  text: string
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

function srtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000))
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`
}

export function buildSrt(segments: TranscriptSegment[]): string {
  return segments
    .map((seg, i) => `${i + 1}\n${srtTime(seg.start)} --> ${srtTime(seg.end)}\n${seg.text.trim()}\n`)
    .join('\n')
}
```

- [ ] **Step 4: Run → pass**

Run: `npx vitest run src/main/aiContent.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/aiContent.ts src/main/aiContent.test.ts
git commit -m "feat(ai): buildSrt pure helper (TDD)"
```

---

## Task 3: `buildChapters` (pure, TDD)

**Files:** Modify `src/main/aiContent.ts`, `src/main/aiContent.test.ts`.

- [ ] **Step 1: Failing tests**

Append to `src/main/aiContent.test.ts`:

```ts
import { buildChapters } from './aiContent'
import type { RecordingMarker } from '../shared/types'

function mk(kind: RecordingMarker['kind'], label: string, offsetMs: number): RecordingMarker {
  return { id: offsetMs, recordingId: 1, itemId: null, kind, label, offsetMs }
}

describe('buildChapters', () => {
  it('shifts marker offsets by the trim start and forces a 0:00 first line', () => {
    const markers = [
      mk('item', 'Countdown', 0),
      mk('song', 'Opener', 300000),   // 5:00 raw
      mk('sermon', 'The Prodigal Son', 1800000) // 30:00 raw
    ]
    // trim started at 5:00 (300000ms): Opener→0:00, sermon→25:00
    expect(buildChapters(markers, 300000)).toBe('0:00 Opener\n25:00 The Prodigal Son')
  })

  it('prepends "0:00 Intro" when the first kept marker is not at zero', () => {
    const markers = [mk('song', 'Opener', 60000)]
    expect(buildChapters(markers, 0)).toBe('0:00 Intro\n1:00 Opener')
  })

  it('drops markers before the trim start and formats past an hour', () => {
    const markers = [mk('item', 'pre', 0), mk('sermon', 'Msg', 3700000)]
    expect(buildChapters(markers, 100000)).toBe('0:00 Intro\n1:00:00 Msg')
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `npx vitest run src/main/aiContent.test.ts`
Expected: FAIL — `buildChapters` not exported.

- [ ] **Step 3: Implement**

Append to `src/main/aiContent.ts`:

```ts
import type { RecordingMarker } from '../shared/types'

function chapterTime(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

// Chapters from Phase-1 markers, rebased to the trimmed (produced) video by
// subtracting the trim start. Markers before the trim are dropped. YouTube requires
// the first chapter at 0:00, so prepend "0:00 Intro" when nothing lands exactly there.
export function buildChapters(markers: RecordingMarker[], trimStartMs: number): string {
  const kept = markers
    .map((m) => ({ label: m.label, ms: m.offsetMs - trimStartMs }))
    .filter((m) => m.ms >= 0)
    .sort((a, b) => a.ms - b.ms)
  const lines: string[] = []
  if (kept.length === 0 || kept[0].ms > 0) lines.push('0:00 Intro')
  for (const k of kept) lines.push(`${chapterTime(k.ms)} ${k.label}`)
  return lines.join('\n')
}
```

- [ ] **Step 4: Run → pass**

Run: `npx vitest run src/main/aiContent.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/aiContent.ts src/main/aiContent.test.ts
git commit -m "feat(ai): buildChapters pure helper (TDD)"
```

---

## Task 4: `buildContentPrompt` (pure, TDD)

**Files:** Modify `src/main/aiContent.ts`, `src/main/aiContent.test.ts`.

- [ ] **Step 1: Failing tests**

Append to `src/main/aiContent.test.ts`:

```ts
import { buildContentPrompt } from './aiContent'

describe('buildContentPrompt', () => {
  const base = { transcript: 'Today we talk about grace.', title: 'Grace', speaker: 'Pastor Ryan', passage: 'Eph 2', chapters: '0:00 Opener\n25:00 Grace' }
  it('includes transcript, sermon meta, chapters, and a JSON-only instruction', () => {
    const p = buildContentPrompt(base)
    expect(p).toContain('Today we talk about grace.')
    expect(p).toContain('Pastor Ryan')
    expect(p).toContain('Eph 2')
    expect(p).toContain('0:00 Opener')
    expect(p.toLowerCase()).toContain('json')
  })
  it('truncates a very long transcript', () => {
    const p = buildContentPrompt({ ...base, transcript: 'x'.repeat(20000) })
    expect(p.length).toBeLessThan(20000)
  })
  it('omits optional meta lines when absent', () => {
    const p = buildContentPrompt({ transcript: 'hi', chapters: '0:00 Intro' })
    expect(p).not.toContain('Speaker:')
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `npx vitest run src/main/aiContent.test.ts`
Expected: FAIL — `buildContentPrompt` not exported.

- [ ] **Step 3: Implement**

Append to `src/main/aiContent.ts`:

```ts
export function buildContentPrompt(input: {
  transcript: string
  title?: string
  speaker?: string
  passage?: string
  chapters: string
}): string {
  return [
    'You are writing YouTube metadata for a church sermon video.',
    input.title ? `Sermon title (hint): ${input.title}` : '',
    input.speaker ? `Speaker: ${input.speaker}` : '',
    input.passage ? `Passage: ${input.passage}` : '',
    `Chapters:\n${input.chapters}`,
    `Transcript:\n${input.transcript.slice(0, 12000)}`,
    'Return ONLY minified JSON of the form {"title": string, "description": string}. ' +
      'Title <= 100 characters. Description: 2-3 short paragraphs summarizing the message, ' +
      'then a blank line, then the chapter list verbatim, then the passage reference.'
  ].filter(Boolean).join('\n\n')
}
```

- [ ] **Step 4: Run → pass**

Run: `npx vitest run src/main/aiContent.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/aiContent.ts src/main/aiContent.test.ts
git commit -m "feat(ai): buildContentPrompt pure helper (TDD)"
```

---

## Task 5: Anthropic client `anthropicApi.ts`

**Files:** Create `src/main/anthropicApi.ts`.

- [ ] **Step 1: Implement (mirrors replicateApi's https style)**

Create `src/main/anthropicApi.ts`:

```ts
// Calls the Anthropic Messages API to generate sermon YouTube title + description.
import https from 'https'

function post(body: object, apiKey: string): Promise<{ content?: { type: string; text?: string }[] }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(data)
      }
    }, (res) => {
      let raw = ''
      res.on('data', (c) => { raw += c })
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) { reject(new Error(`Anthropic ${res.statusCode}: ${raw.slice(0, 300)}`)); return }
        try { resolve(JSON.parse(raw)) } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

export async function generateSermonContent(prompt: string, apiKey: string): Promise<{ title: string; description: string }> {
  const res = await post({
    model: 'claude-sonnet-5',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }]
  }, apiKey)
  const text = res.content?.find((b) => b.type === 'text')?.text ?? ''
  const jsonStart = text.indexOf('{')
  const jsonEnd = text.lastIndexOf('}')
  if (jsonStart < 0 || jsonEnd < 0) throw new Error('Anthropic: no JSON in response')
  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as { title?: string; description?: string }
  if (!parsed.title || !parsed.description) throw new Error('Anthropic: missing title/description')
  return { title: parsed.title, description: parsed.description }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:node`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/anthropicApi.ts
git commit -m "feat(ai): Anthropic Messages client for sermon content"
```

---

## Task 6: Replicate transcription

**Files:** Modify `src/main/replicateApi.ts`.

- [ ] **Step 1: Add file upload + transcribe (mirror the create/poll pattern)**

Append to `src/main/replicateApi.ts` (reuse the existing `httpsPost`/`httpsGet`/`sleep`; add `readFileSync` import at top: `import { readFileSync } from 'fs'` and `import { basename } from 'path'`):

```ts
// Uploads a local file to Replicate's files API and returns a servable URL.
function uploadFileToReplicate(filePath: string, token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const fileBuf = readFileSync(filePath)
    const boundary = '----wfform' + Date.now()
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="content"; filename="${basename(filePath)}"\r\n` +
      `Content-Type: audio/mpeg\r\n\r\n`
    )
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
    const body = Buffer.concat([head, fileBuf, tail])
    const req = https.request({
      hostname: 'api.replicate.com', path: '/v1/files', method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    }, (res) => {
      let raw = ''
      res.on('data', (c) => { raw += c })
      res.on('end', () => {
        try {
          const j = JSON.parse(raw) as { urls?: { get?: string } }
          if (j.urls?.get) resolve(j.urls.get)
          else reject(new Error(`Replicate upload failed: ${raw.slice(0, 200)}`))
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

export interface WhisperResult {
  text: string
  segments: { start: number; end: number; text: string }[]
}

// Transcribes an audio file via Replicate's Whisper model, returning full text + timed segments.
export async function transcribeAudio(mp3Path: string, apiKey: string): Promise<WhisperResult> {
  const audioUrl = await uploadFileToReplicate(mp3Path, apiKey)
  const created = await httpsPost(
    'https://api.replicate.com/v1/models/openai/whisper/predictions',
    { input: { audio: audioUrl, model: 'large-v3' } },
    apiKey
  ) as { id: string; urls: { get: string } }
  if (!created.id) throw new Error('Replicate: no prediction id (whisper)')

  for (let i = 0; i < 150; i++) { // up to ~5 min
    await sleep(2000)
    const poll = await httpsGet(created.urls.get, apiKey) as {
      status: string
      output: { transcription?: string; segments?: { start: number; end: number; text: string }[] } | null
      error: string | null
    }
    if (poll.error) throw new Error(`Replicate whisper error: ${poll.error}`)
    if (poll.status === 'succeeded' && poll.output) {
      const segs = (poll.output.segments ?? []).map((s) => ({ start: s.start, end: s.end, text: s.text }))
      return { text: poll.output.transcription ?? segs.map((s) => s.text).join(' '), segments: segs }
    }
    if (poll.status === 'failed' || poll.status === 'canceled') throw new Error('Replicate whisper: ' + poll.status)
  }
  throw new Error('Replicate whisper: timed out')
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:node`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/replicateApi.ts
git commit -m "feat(ai): Replicate Whisper transcription + file upload"
```

---

## Task 7: Content runner `content.ts`

**Files:** Create `src/main/content.ts`.

- [ ] **Step 1: Implement the orchestrator**

Create `src/main/content.ts`:

```ts
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import type { RecordingRow, RecordingMarker, RecordingSidecar } from '../shared/types'
import { buildSrt, buildChapters, buildContentPrompt } from './aiContent'
import { transcribeAudio, generateBackgroundImage } from './replicateApi'
import { generateSermonContent } from './anthropicApi'
import { computeTrim } from './ffmpegAssembly'

export interface ContentDeps {
  ffmpegPath: string
  getRecording: (id: number) => RecordingRow | null
  listMarkers: (id: number) => RecordingMarker[]
  getSetting: (key: string) => string | null
  saveAi: (id: number, fields: Partial<Pick<RecordingRow,
    'transcript' | 'aiTitle' | 'aiDescription' | 'chapters' | 'srtPath' | 'thumbnailPath' | 'aiState'>>) => void
  renderThumbnail: (bgImagePath: string | null, title: string, speaker: string, outPath: string) => Promise<void>
  onProgress: (id: number, label: string) => void
  toast: (message: string, level?: 'info' | 'warn' | 'error') => void
}

export interface ContentRunner {
  generate: (recordingId: number) => Promise<void>
  isBusy: () => boolean
}

function extractAudio(ffmpegPath: string, videoPath: string, outMp3: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ['-y', '-i', videoPath, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', outMp3])
    p.on('error', reject)
    p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg audio extract failed (${code})`)))
  })
}

function loadSidecar(rec: RecordingRow, markers: RecordingMarker[]): RecordingSidecar {
  if (rec.filePath) {
    const sc = rec.filePath.replace(/\.[^.\\/]+$/, '') + '.worshipflow.json'
    if (existsSync(sc)) { try { return JSON.parse(readFileSync(sc, 'utf-8')) as RecordingSidecar } catch { /* fall */ } }
  }
  const durationMs = rec.endedAt != null ? rec.endedAt - rec.startedAt : 0
  return {
    worshipflowVersion: 'rebuilt',
    service: { id: rec.serviceId, name: '', date: null },
    recording: { startedAt: rec.obsRecordStartedMs, durationMs, file: rec.filePath ? basename(rec.filePath) : '' },
    markers: markers.map((m) => ({ kind: m.kind, label: m.label, offsetMs: m.offsetMs }))
  }
}

// Pull sermon title/speaker/passage from the sermon marker's label (title) — the
// richer payload isn't on the marker, so title comes from the marker label.
function sermonMeta(markers: RecordingMarker[]): { title?: string; speaker?: string; passage?: string } {
  const sermon = markers.find((m) => m.kind === 'sermon')
  return sermon ? { title: sermon.label } : {}
}

export function createContentRunner(deps: ContentDeps): ContentRunner {
  let busy = false
  return {
    isBusy: () => busy,
    async generate(recordingId) {
      if (busy) { deps.toast('Already generating content — wait for it to finish.', 'warn'); return }
      const rec = deps.getRecording(recordingId)
      if (!rec || rec.renderState !== 'done' || !rec.outputPath || !existsSync(rec.outputPath)) {
        deps.toast('Produce the video first — AI content runs on the finished MP4.', 'warn'); return
      }
      const replicateKey = deps.getSetting('replicate_api_key')
      const anthropicKey = deps.getSetting('anthropic_api_key')
      if (!replicateKey) { deps.saveAi(recordingId, { aiState: 'failed' }); deps.toast('Set your Replicate API key first.', 'error'); return }
      if (!anthropicKey) { deps.saveAi(recordingId, { aiState: 'failed' }); deps.toast('Set your Anthropic API key first.', 'error'); return }

      busy = true
      const finalPath = rec.outputPath
      const stem = join(dirname(finalPath), basename(finalPath, extname(finalPath)))
      const mp3Path = stem + '.tmp.mp3'
      const srtPath = stem + '.srt'
      const thumbPath = stem + '-thumb.jpg'
      const markers = deps.listMarkers(recordingId)
      try {
        deps.saveAi(recordingId, { aiState: 'generating' })

        deps.onProgress(recordingId, 'Extracting audio…')
        await extractAudio(deps.ffmpegPath, finalPath, mp3Path)

        deps.onProgress(recordingId, 'Transcribing…')
        const whisper = await transcribeAudio(mp3Path, replicateKey)

        deps.onProgress(recordingId, 'Writing captions…')
        writeFileSync(srtPath, buildSrt(whisper.segments), 'utf-8')

        const sidecar = loadSidecar(rec, markers)
        const { startMs } = computeTrim(sidecar)
        const chapters = buildChapters(markers, startMs)
        const meta = sermonMeta(markers)

        deps.onProgress(recordingId, 'Writing title & description…')
        const content = await generateSermonContent(
          buildContentPrompt({ transcript: whisper.text, ...meta, chapters }), anthropicKey
        )

        deps.onProgress(recordingId, 'Making thumbnail…')
        let bgImage: string | null = null
        try { bgImage = await generateBackgroundImage(meta.title ?? 'sermon', replicateKey) } catch { bgImage = null }
        await deps.renderThumbnail(bgImage, content.title, meta.speaker ?? '', thumbPath)

        deps.saveAi(recordingId, {
          transcript: whisper.text, aiTitle: content.title, aiDescription: content.description,
          chapters, srtPath, thumbnailPath: thumbPath, aiState: 'done'
        })
        deps.toast('AI content generated.', 'info')
      } catch (err) {
        deps.saveAi(recordingId, { aiState: 'failed' })
        deps.toast(`Content generation failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
      } finally {
        try { if (existsSync(mp3Path)) rmSync(mp3Path) } catch { /* ignore */ }
        busy = false
      }
    }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:node`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/content.ts
git commit -m "feat(ai): content generation runner (transcribe → srt/chapters/text/thumb)"
```

---

## Task 8: Wire the runner + thumbnail render into main

**Files:** Modify `src/main/index.ts`.

- [ ] **Step 1: Imports + thumbnail renderer + runner instance**

Add imports (merge into existing blocks):

```ts
import { createContentRunner } from './content'
import { setRecordingAi } from './db'
```

Add an offscreen thumbnail renderer function and the runner at module scope (after `renderer`/`operatorWin`/`notifyOperator` exist):

```ts
// Renders a 1280x720 thumbnail (background image + sermon title/speaker) via an
// offscreen window + capturePage — no native image dependency.
async function renderThumbnail(bgImagePath: string | null, title: string, speaker: string, outPath: string): Promise<void> {
  const win = new BrowserWindow({ width: 1280, height: 720, show: false, webPreferences: { offscreen: true } })
  try {
    const bg = bgImagePath ? `url("file://${bgImagePath.replace(/\\/g, '/')}")` : 'linear-gradient(135deg,#0f172a,#334155)'
    const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;width:1280px;height:720px;overflow:hidden;font-family:Arial,Helvetica,sans-serif}
      .bg{width:1280px;height:720px;background:${bg};background-size:cover;background-position:center;position:relative}
      .scrim{position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.75),rgba(0,0,0,.15) 55%)}
      .txt{position:absolute;left:64px;right:64px;bottom:70px;color:#fff}
      .title{font-size:84px;font-weight:800;line-height:1.05;text-shadow:0 3px 18px rgba(0,0,0,.6)}
      .spk{font-size:38px;font-weight:600;margin-top:18px;opacity:.92;text-shadow:0 2px 10px rgba(0,0,0,.6)}
      </style></head><body><div class="bg"><div class="scrim"></div>
      <div class="txt"><div class="title">${esc(title)}</div>${speaker ? `<div class="spk">${esc(speaker)}</div>` : ''}</div>
      </div></body></html>`
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    await new Promise((r) => setTimeout(r, 350)) // let the background image paint
    const img = await win.webContents.capturePage()
    writeFileSync(outPath, img.toJPEG(90))
  } finally {
    win.destroy()
  }
}

const contentRunner = createContentRunner({
  ffmpegPath: resolveFfmpegPath(),
  getRecording,
  listMarkers: listRecordingMarkers,
  getSetting,
  saveAi: (id, fields) => setRecordingAi(id, fields),
  renderThumbnail,
  onProgress: (id, label) => {
    if (operatorWin && !operatorWin.isDestroyed()) operatorWin.webContents.send('wf:recordings:aiProgress', { recordingId: id, label })
  },
  toast: (message, level) => notifyOperator(message, level ?? 'info')
})
```

(`writeFileSync` is already imported in Phase 2; `BrowserWindow`, `getRecording`, `listRecordingMarkers`, `getSetting`, `resolveFfmpegPath` are in scope. Merge `setRecordingAi` into the `./db` import.)

- [ ] **Step 2: IPC handlers**

```ts
ipcMain.handle('wf:recordings:generateContent', (_e, recordingId: number) => contentRunner.generate(recordingId))
ipcMain.handle('wf:recordings:saveAi', (_e, recordingId: number, fields: { aiTitle?: string; aiDescription?: string }) => {
  setRecordingAi(recordingId, fields)
})
ipcMain.handle('wf:recordings:revealPath', async (_e, p: string) => { if (p) shell.showItemInFolder(p) })
ipcMain.handle('wf:recordings:getAnthropicKey', () => getSetting('anthropic_api_key') ?? '')
ipcMain.handle('wf:recordings:setAnthropicKey', (_e, key: string) => { setSetting('anthropic_api_key', key || null) })
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:node`
Expected: PASS. Reconcile any scope/import mismatch against the real file.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(main): wire AI content runner + offscreen thumbnail render"
```

---

## Task 9: Preload bridges + mock

**Files:** Modify `src/preload/index.ts`, `src/renderer/src/browserWfMock.ts`.

- [ ] **Step 1: Bridges**

Add to the `wf` object (put `onAiProgress` next to `onRenderProgress`):

```ts
  generateContent: (recordingId: number): Promise<void> => ipcRenderer.invoke('wf:recordings:generateContent', recordingId),
  saveAi: (recordingId: number, fields: { aiTitle?: string; aiDescription?: string }): Promise<void> =>
    ipcRenderer.invoke('wf:recordings:saveAi', recordingId, fields),
  revealPath: (p: string): Promise<void> => ipcRenderer.invoke('wf:recordings:revealPath', p),
  getAnthropicKey: (): Promise<string> => ipcRenderer.invoke('wf:recordings:getAnthropicKey'),
  setAnthropicKey: (key: string): Promise<void> => ipcRenderer.invoke('wf:recordings:setAnthropicKey', key),
  onAiProgress: (cb: (p: { recordingId: number; label: string }) => void): (() => void) => {
    const handler = (_e: unknown, p: { recordingId: number; label: string }): void => cb(p)
    ipcRenderer.on('wf:recordings:aiProgress', handler)
    return () => ipcRenderer.removeListener('wf:recordings:aiProgress', handler)
  },
```

- [ ] **Step 2: Mock stubs**

Add to `src/renderer/src/browserWfMock.ts`:

```ts
  generateContent: async () => {},
  saveAi: async () => {},
  revealPath: async () => {},
  getAnthropicKey: async () => '',
  setAnthropicKey: async () => {},
  onAiProgress: () => () => {},
```

- [ ] **Step 3: Full typecheck**

Run: `npm run typecheck`
Expected: PASS (node + web). Add any missing mock stub the web typecheck flags.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/renderer/src/browserWfMock.ts
git commit -m "feat(preload): AI content bridges (generate/save/reveal/progress/key)"
```

---

## Task 10: Recordings panel — AI content UI

**Files:** Modify `src/renderer/src/RecordingsPanel.tsx`.

- [ ] **Step 1: Add AI section to a produced row**

Read the file, then inside the `done`-produced branch (where "Produced" + Reveal show), add an AI sub-block. Subscribe to `onAiProgress` alongside the existing subscriptions, keep a `Record<number,string>` of step labels, and refresh on completion via the existing `onRenderState`… but AI completion isn't a render-state event, so also refresh when a label arrives that equals a terminal string is fragile — instead, refresh shortly after `generateContent` resolves. Implement:

Add state near the other panel state:

```tsx
  const [aiStep, setAiStep] = useState<Record<number, string>>({})
```

In the mount `useEffect`, add:

```tsx
    const offAi = window.wf.onAiProgress(({ recordingId, label }) => {
      setAiStep((s) => ({ ...s, [recordingId]: label }))
    })
```

and include `offAi()` in the returned cleanup.

Add a helper component and render it in the produced branch:

```tsx
function AiBlock({ row, step, onChanged }: { row: RecordingRow; step?: string; onChanged: () => void }): JSX.Element {
  const [title, setTitle] = useState(row.aiTitle ?? '')
  const [desc, setDesc] = useState(row.aiDescription ?? '')
  useEffect(() => { setTitle(row.aiTitle ?? ''); setDesc(row.aiDescription ?? '') }, [row.aiTitle, row.aiDescription])

  const generate = async (): Promise<void> => { await window.wf.generateContent(row.id); onChanged() }
  const save = (): void => { void window.wf.saveAi(row.id, { aiTitle: title, aiDescription: desc }) }

  if (row.aiState === 'generating') {
    return <div className="mt-1 text-emerald-600">{step ?? 'Generating…'}</div>
  }
  if (row.aiState === 'done') {
    return (
      <div className="mt-2 flex flex-col gap-1">
        <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={save}
          className="w-full rounded border border-slate-300 px-1 py-0.5 font-medium" />
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={save} rows={4}
          className="w-full rounded border border-slate-300 px-1 py-0.5" />
        <div className="flex items-center gap-2">
          {row.srtPath && <button onClick={() => void window.wf.revealPath(row.srtPath!)} className="text-slate-600 hover:underline">Reveal .srt</button>}
          {row.thumbnailPath && <button onClick={() => void window.wf.revealPath(row.thumbnailPath!)} className="text-slate-600 hover:underline">Reveal thumbnail</button>}
          <button onClick={() => void generate()} className="text-emerald-700 hover:underline">Regenerate</button>
        </div>
      </div>
    )
  }
  return (
    <div className="mt-1 flex items-center gap-2">
      {row.aiState === 'failed' && <span className="text-rose-600">AI failed</span>}
      <button onClick={() => void generate()} className="text-emerald-700 hover:underline">Generate content</button>
    </div>
  )
}
```

Render `<AiBlock row={r} step={aiStep[r.id]} onChanged={refresh} />` inside the `done`-produced branch, under the Reveal/Re-produce row. Because AI state changes aren't pushed as events, also call `refresh()` a moment after `generate()` resolves — the `onChanged` prop already does this; additionally, after a generation the operator can click anywhere/reopen; acceptable for Phase 3. (Optional: poll `recordingsList` every 4s while any row is `generating`.)

- [ ] **Step 2: Add a lightweight poll while generating**

To reflect completion without a dedicated event, add to the mount `useEffect`:

```tsx
    const iv = setInterval(() => {
      setRows((cur) => { if (cur.some((r) => r.aiState === 'generating')) refresh(); return cur })
    }, 4000)
```

and `clearInterval(iv)` in cleanup. This refreshes only while something is generating.

- [ ] **Step 3: Typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS; tests unchanged in count (no tests added here; the 8 aiContent tests already exist).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/RecordingsPanel.tsx
git commit -m "feat(ui): AI content generate/edit/reveal in recordings panel"
```

---

## Task 11: Anthropic key setting in ObsPanel

**Files:** Modify `src/renderer/src/ObsPanel.tsx`.

- [ ] **Step 1: Add a key input to the assembly settings block**

In the "Video assembly" settings section, add an Anthropic key field (loaded on mount, saved on blur). Follow the file's idiom:

```tsx
  const [anthropicKey, setAnthropicKey] = useState('')
  useEffect(() => { void window.wf.getAnthropicKey().then(setAnthropicKey) }, [])
```

JSX (place under the intro/outro/output rows):

```tsx
        <div className="mb-1 flex items-center gap-2 text-xs">
          <span className="w-16 shrink-0 text-slate-500">Claude key</span>
          <input type="password" value={anthropicKey} placeholder="sk-ant-…"
            onChange={(e) => setAnthropicKey(e.target.value)}
            onBlur={() => void window.wf.setAnthropicKey(anthropicKey)}
            className="min-w-0 flex-1 rounded border border-slate-300 px-1 text-slate-700" />
        </div>
        <p className="text-[11px] text-slate-400">AI content also needs your Replicate key (set elsewhere).</p>
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/ObsPanel.tsx
git commit -m "feat(ui): Anthropic API key setting for AI content"
```

---

## Task 12: Full verification

**Files:** none.

- [ ] **Step 1:** `npm run typecheck` → PASS (node + web).
- [ ] **Step 2:** `npm test` → PASS (Phase 1+2 tests plus the 8 new `aiContent.test.ts` assertions; no regressions).
- [ ] **Step 3:** `npm run build` → PASS.
- [ ] **Step 4: Manual smoke test (documented, operator at booth, keys set):**
  1. Set Replicate + Claude keys in the OBS panel.
  2. On a produced recording, click **Generate content**; watch the step labels (Extracting → Transcribing → Captions → Title → Thumbnail).
  3. On completion: an editable title + description appear; the description's chapters start at `0:00` and match the final video; a `.srt` and `-thumb.jpg` sit next to the final MP4 (Reveal buttons open them); the thumbnail shows the sermon title over an image.
  4. Edit the title, click away → persists (reopen confirms).
  5. Remove a key → Generate content flips to **AI failed** with a toast naming the missing key.
- [ ] **Step 5: Commit** (if fixes needed): `git commit -am "test: verify Phase 3 AI content end-to-end"`.

---

## Self-Review (completed during authoring)

- **Spec coverage:** transcription via Replicate Whisper + audio extract (Tasks 6, 7); `.srt` (Tasks 2, 7); chapters from markers shifted by trim (Tasks 3, 7); Claude title/description (Tasks 4, 5, 7); thumbnail Flux + overlay via offscreen capturePage (Task 8) with solid-color fallback (Task 7 `try/catch` around `generateBackgroundImage`); storage columns (Task 1); settings key (Task 11) + missing-key guards (Task 7); editable UI + reveal + regenerate + progress (Tasks 9, 10). Runs on the produced MP4 with `render_state==='done'` guard (Task 7). Success criteria exercised in Task 12.
- **Placeholder scan:** none; pure tasks carry full code, integration tasks carry full code + real-scope reconciliation notes (the `./db` import merge, `BrowserWindow`/`shell`/`resolveFfmpegPath` scope in index.ts, ObsPanel idiom).
- **Type consistency:** `RecordingRow` AI fields (Task 1) consumed identically in `content.ts` (Task 7) and UI (Task 10); `AiState` values match `saveAi`/`setRecordingAi` writes; `TranscriptSegment`/`WhisperResult` shapes match between `aiContent.ts` (Task 2), `replicateApi.transcribeAudio` (Task 6), and `content.ts` (Task 7); `buildSrt`/`buildChapters`/`buildContentPrompt`/`generateSermonContent`/`transcribeAudio`/`generateBackgroundImage`/`computeTrim` signatures match their call sites; IPC channels match across Task 8 (handle) and Task 9 (invoke): `generateContent|saveAi|revealPath|getAnthropicKey|setAnthropicKey|aiProgress`.
- **Known limitation (documented in spec):** chapters use the default `computeTrim` start, not a custom Phase-2 override; sermon title comes from the sermon marker's label (the richer payload isn't on markers).
