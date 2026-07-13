# Sermon Recording Pipeline — Phase 3: AI Content

**Date:** 2026-07-12
**App:** WorshipFlow Pro (Electron + React + sql.js; Phase 1 records + markers, Phase 2 produces the final MP4)
**Status:** Design approved, ready for implementation plan

## Context

Phase 2 produces a finished, trimmed MP4 per recording. Phase 3 generates the
YouTube metadata for it: a title, description, timestamped chapters, an `.srt`
caption sidecar, and a thumbnail. It runs on the **produced final MP4** (not the
raw recording) so every timestamp matches what gets uploaded in Phase 4.

Decisions locked with the user:
- **Transcription:** Replicate Whisper (reuses the existing `replicate_api_key`).
- **Text (title/description):** Claude API (new `anthropic_api_key` setting).
- **Chapters:** built from Phase 1 markers (shifted by the Phase 2 trim start),
  not re-derived by AI.
- **Captions:** `.srt` sidecar from Whisper segments.
- **Thumbnail:** an AI-generated Flux background (reuses `generateBackgroundImage`)
  with the sermon title + speaker overlaid as text.
- **Manual, per-recording** ("Generate content"), background job with progress.

## Architecture

Reuse the bundled ffmpeg (extract audio), the existing Replicate client
(`replicateApi.ts` — Whisper + Flux), a new thin `anthropicApi.ts` (Claude
Messages), and an offscreen `BrowserWindow` + `capturePage()` to render the
thumbnail (no native image dep). A `content.ts` runner orchestrates the steps and
updates the recording row. Pure helpers are the testable core.

```
Recordings panel ──generateContent(recId)──▶ main: content.ts
  1. ffmpeg -i final.mp4 -vn -> audio.mp3
  2. Replicate: upload mp3 -> Whisper -> segments[]
  3. buildSrt(segments) -> <final>.srt
  4. buildChapters(markers, trimStartMs) -> chapter lines
  5. anthropicApi(buildContentPrompt(transcript, sermonMeta, chapters)) -> {title, description}
  6. Flux(bg prompt) -> offscreen render title/speaker overlay -> capturePage -> <final>-thumb.jpg
  -> recording.{ai_title, ai_description, chapters, srt_path, thumbnail_path, transcript, ai_state='done'}
```

## Design

### 1. Pure helpers — `src/main/aiContent.ts` (unit-tested)

- `buildSrt(segments: { start: number; end: number; text: string }[]): string` —
  standard SRT: 1-based index, `HH:MM:SS,mmm --> HH:MM:SS,mmm`, blank-line
  separated. Tested: timestamp formatting, ordering, multi-segment.
- `buildChapters(markers: RecordingMarker[], trimStartMs: number): string` —
  each marker becomes `M:SS Label` with `offsetMs - trimStartMs` (drop markers
  before the trim; clamp negatives to 0). Guarantee a `0:00` first line (YouTube
  requires it) — if the first kept marker isn't at 0, prepend `0:00 Intro`.
  Tested: shift, drop-before-trim, forced 0:00, `H:MM:SS` past an hour.
- `buildContentPrompt(input: { transcript: string; title?: string; speaker?: string;
  passage?: string; chapters: string }): string` — the Claude prompt asking for a
  JSON `{ "title": string, "description": string }` (description includes the
  chapter list + passage). Tested: includes transcript + sermon meta + a strict
  "return only JSON" instruction.

### 2. Anthropic client — `src/main/anthropicApi.ts`

- `generateSermonContent(prompt: string, apiKey: string): Promise<{ title: string; description: string }>`
  — POST `https://api.anthropic.com/v1/messages` (model `claude-sonnet-5`,
  `max_tokens` ~1500, `anthropic-version: 2023-06-01`, `x-api-key`), parse the
  first text block as JSON `{title, description}`. Mirror the `https` request
  style already used in `replicateApi.ts`. Throws on non-200 / unparseable.

### 3. Transcription (in `content.ts`, via `replicateApi.ts`)

- Extract audio: spawn the bundled ffmpeg `-i <finalMp4> -vn -ac 1 -ar 16000
  -b:a 64k <tmp>.mp3` (mono 16k keeps the upload small).
- Add `transcribeAudio(mp3Path, apiKey)` to `replicateApi.ts`: upload the file to
  Replicate's files endpoint, run a Whisper model
  (`openai/whisper` large-v3) with the returned URL, poll to completion, return
  `segments[]` (`{ start, end, text }`) + full `text`. Mirror the existing
  `generateBackgroundImage` create/poll pattern.

### 4. Thumbnail (in `content.ts`)

- Generate a background via `generateBackgroundImage(bgPrompt, replicateKey)`
  where `bgPrompt` is derived from the sermon title/passage; download the image
  to a temp file.
- Render `<final>-thumb.jpg` (1280×720) by loading a small inline HTML template
  (background image + sermon title + speaker, styled) into an **offscreen**
  `BrowserWindow` ({ width:1280, height:720, show:false }), then
  `webContents.capturePage()` → `toJPEG(90)` → write file. No native image lib.
- If Flux fails, fall back to a solid-color background so a thumbnail still
  renders (title/speaker text only).

### 5. Orchestration — `content.ts` runner

- `generate(recordingId)`: require Phase 2 output (`output_path`, `render_state
  === 'done'`); read keys (`replicate_api_key`, `anthropic_api_key`) — if either
  missing, `ai_state='failed'` + toast naming the missing key. Steps 1–6 above,
  emitting `wf:recordings:aiProgress { recordingId, step, label }` per step.
  One-at-a-time guard. On success set the columns + `ai_state='done'`; on any
  step error set `ai_state='failed'` + toast; always clean up the temp mp3.
- Chapters come from `listRecordingMarkers(recordingId)` + the trim start. The
  trim start is recomputed with `computeTrim(sidecar)` (same default as Phase 2)
  — Phase 3 does not read a stored override, so if the operator produced with a
  custom trim, chapters use the default trim (documented limitation).

### 6. Storage

Add columns to `recording` (via the `try { ALTER } catch {}` pattern):
`transcript TEXT`, `ai_title TEXT`, `ai_description TEXT`, `chapters TEXT`,
`srt_path TEXT`, `thumbnail_path TEXT`, `ai_state TEXT` (`'idle' | 'generating' |
'done' | 'failed'`, null→idle). Extend `RecordingRow` accordingly; add
`setRecordingAi(id, fields)` and include the new fields in `listRecordings` /
`getRecording`.

### 7. Settings

- New `anthropic_api_key` setting + an input in ObsPanel's assembly settings area
  (password-style). The `replicate_api_key` input already exists elsewhere; note
  it is required for Phase 3 too.

### 8. UI (Recordings panel)

- On a `done`-produced recording, add **Generate content** (disabled unless
  produced). While `ai_state==='generating'`, show the current step label. When
  `done`: editable `ai_title` (input) + `ai_description` (textarea) that persist
  via `setRecordingAi`, plus **Reveal .srt** / **Reveal thumbnail** and
  **Regenerate**. Editing is important — the operator tweaks AI output before the
  Phase 4 upload.

## Non-goals for Phase 3 (deferred)

- YouTube upload (Phase 4) — Phase 3 only produces the assets/metadata.
- Sermon sub-point chapters from transcript analysis (chapters come from markers).
- Burned-in captions (only an `.srt` sidecar).
- Local/offline transcription (Replicate cloud only).
- Honoring a custom Phase-2 trim override for chapter offsets (uses default trim).
- Multi-language / translation.

## Success criteria

On a produced recording with both API keys set, **Generate content** yields:
a `.srt` next to the final MP4, a `<final>-thumb.jpg` with the sermon title over
an AI background, an editable AI title + description (description containing the
chapter list with `0:00` first and timestamps matching the final video), all
persisted on the recording row and visible/editable in the panel. Missing keys or
a step failure flips `ai_state='failed'` with a toast naming the cause, leaving no
partial state claimed as done. `buildSrt`, `buildChapters`, and
`buildContentPrompt` are unit-tested.
