# Sermon Recording Pipeline — Phase 2: Assembly

**Date:** 2026-07-12
**App:** WorshipFlow Pro (Electron + React + sql.js; drives OBS; Phase 1 records services + writes marker sidecars)
**Status:** Design approved, ready for implementation plan

## Context

Phase 1 (merged to master) records each service via OBS and writes, next to the
video, a `<video>.worshipflow.json` sidecar containing the service name/date,
recording duration, and an ordered marker list (song / sermon / item boundaries
with `offsetMs` relative to the video start). Phase 2 turns that raw recording
into a **finished, ready-to-watch MP4**: optional intro + the trimmed service +
optional outro, encoded once.

Decisions locked with the user:
- **Audio is already clean.** The OBS recording's audio input is the soundboard
  feed (the same feed streamed to Facebook Live), so the recording already
  contains clean board audio. Phase 2 does **no audio muxing.**
- **Output = full service, dead air trimmed.** Keep worship + sermon; drop the
  leading pre-service countdown. (A sermon-only clip is a later add-on.)
- **Intro/outro are optional video files**, skipped when unset, normalized to the
  service resolution/framerate when present.
- **Assembly is manual, per-recording** (a "Produce video" button) — encoding a
  90-minute service is CPU-heavy and long, so the operator triggers it.

## Architecture

A bundled **ffmpeg** binary (`ffmpeg-static`, `asarUnpack`'d like the sql.js
wasm) is spawned by the main process. The testable core is a **pure argv
builder** (`buildFfmpegArgs`) plus a **pure trim calculator** (`computeTrim`); a
thin **runner** spawns ffmpeg, parses progress from its stderr, and updates the
recording row. The renderer gets a Produce button + progress on each recording.

```
Recordings panel ──produce(recId, override?)──▶ main: render.ts
                                                   │
                    computeTrim(sidecar) ──────────┤ (default start/end, operator can override)
                    buildFfmpegArgs(...) ──────────┤ (pure → argv[])
                    spawn(ffmpegStatic, argv) ─────┤ parse "time=" → progress IPC
                    on exit 0 ────────────────────▶ recording.output_path, render_state='done'
```

## Design

### 1. ffmpeg bundling

- Add `ffmpeg-static` (dependency). It resolves to a platform ffmpeg binary path.
- In `electron-builder.yml`, add the binary to `asarUnpack` (same mechanism as
  the sql.js wasm) so it is executable from the packaged app. At runtime, resolve
  the unpacked path (replace `app.asar` → `app.asar.unpacked` in the
  `ffmpeg-static` path when packaged, mirroring the existing sql.js unpack
  handling).
- `npmRebuild: false` already set (per prior packaging notes) — `ffmpeg-static`
  is a prebuilt binary, no native rebuild needed.

### 2. Trim calculator — pure `computeTrim(sidecar, override?)`

Signature: `computeTrim(sidecar: RecordingSidecar, override?: { startMs?: number; endMs?: number }): { startMs: number; endMs: number }`.

Default policy:
- `startMs` = the `offsetMs` of the **first marker whose kind is `song` or
  `sermon`** (skips a leading countdown/welcome/announcement `item`). If no such
  marker exists, `startMs = 0`.
- `endMs` = `sidecar.recording.durationMs`.
- Any `override.startMs` / `override.endMs` provided by the operator wins over the
  default. Clamp: `0 <= startMs < endMs <= durationMs`.

This is unit-tested (leading countdown skipped; no song/sermon → 0; override
wins; clamping).

### 3. Argv builder — pure `buildFfmpegArgs(input)`

Signature:
```ts
buildFfmpegArgs(input: {
  servicePath: string
  introPath?: string | null
  outroPath?: string | null
  startMs: number
  endMs: number
  outputPath: string
  width: number      // target, default 1920
  height: number     // target, default 1080
  fps: number        // target, default 30
  crf: number        // default 20
}): string[]
```

Behavior:
- Inputs, in order: `introPath` (if set), then the service with input-seek
  `-ss <startSec> -to <endSec>` applied to it, then `outroPath` (if set).
- A `-filter_complex` that, for each segment, normalizes video
  (`scale=w:h:force_original_aspect_ratio=decrease,pad=w:h:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=<fps>,format=yuv420p`)
  and audio (`aformat=sample_rates=48000:channel_layouts=stereo`), then
  `concat=n=<segmentCount>:v=1:a=1[v][a]`.
- `-map "[v]" -map "[a]" -c:v libx264 -crf <crf> -preset veryfast -c:a aac
  -b:a 192k -movflags +faststart <outputPath>` and `-y`.
- `startSec`/`endSec` are `ms / 1000` formatted with millisecond precision.

Unit-tested: correct input count + order for {none, intro-only, outro-only, both}
intro/outro; `-ss`/`-to` present with correct seconds; `concat=n=` matches the
segment count; `-map`/codec flags present; output path last.

Note on encoding: segments are re-encoded (not stream-copied) because trimming to
arbitrary points and normalizing differing intro/outro codecs both require it.
This makes Produce a minutes-long job — hence the background runner + progress.

### 4. Runner — `render.ts` (main process)

- `produce(recordingId, override?)`: load the recording row + read its sidecar
  from `file_path`'s sibling `.worshipflow.json`; if the sidecar is missing, fall
  back to DB markers (`listRecordingMarkers`) + the row's duration. Compute trim,
  build argv, set `render_state='rendering'`, spawn ffmpeg (the resolved
  `ffmpeg-static` path).
- Parse stderr for `time=HH:MM:SS.ss` (ffmpeg's position in the **output**
  timeline). Progress fraction = `currentSec / (endMs - startMs) / 1000`, i.e.
  measured against the trimmed service duration only. Any intro/outro makes the
  output slightly longer than that denominator, so the bar may reach ~100% a beat
  before completion — progress is **advisory**, not exact (avoids an ffprobe
  dependency). Emit `wf:recordings:renderProgress { recordingId, fraction }`
  (clamped to ≤ 1) to the renderer.
- On exit 0: set `output_path`, `render_state='done'`, toast success. On nonzero
  exit or spawn error: `render_state='failed'`, toast with a short reason, log
  full stderr tail.
- **One render at a time** (guard; reject/queue a second Produce with a toast).
- **Cancel:** `cancelRender(recordingId)` kills the child; set
  `render_state='idle'`, delete any partial output file.

### 5. Storage

Add two columns to the `recording` table (via the existing `try { ALTER TABLE …
} catch {}` migration pattern in `db.ts`):
- `output_path TEXT` — the finished MP4 path (null until produced).
- `render_state TEXT` — `'idle' | 'rendering' | 'done' | 'failed'` (default
  `'idle'`; treat null as `'idle'`).

`listRecordings()` returns both so the panel reflects status. Add
`setRecordingRender(recordingId, state, outputPath?)`.

### 6. Settings

Three optional settings (in the `setting` table via `getSetting`/`setSetting`):
- `assemblyIntroPath` — intro video file (optional).
- `assemblyOutroPath` — outro video file (optional).
- `assemblyOutputFolder` — output directory (optional; default = the recording's
  own folder).
- (Target resolution/fps/crf default to 1920×1080 / 30 / 20; a
  `assemblyTargetResolution` setting is out of scope for Phase 2 — hardcode the
  defaults, revisit if a service isn't 1080p.)

### 7. UI (Recordings panel, extend Phase 1's)

Per recording row, driven by `render_state`:
- `idle`/`failed` → **Produce video** button. Clicking opens a tiny inline
  confirm showing the computed start/end (mm:ss) with editable start/end fields
  (the operator nudge), then Produce.
- `rendering` → a progress bar (from `renderProgress`) + **Cancel**.
- `done` → the output path (click-to-reveal in the OS file manager via an
  existing "open folder"-style helper) + a **Re-produce** option.
- A Settings sub-section (near the auto-record toggle) with file pickers for the
  intro, outro, and output folder.

## Non-goals for Phase 2 (deferred)

- Sermon-only clip output (Phase 2.5).
- Transcription, AI title/description/chapters/captions, generated thumbnail /
  title-card intro (Phase 3).
- YouTube upload (Phase 4).
- Audio muxing/replacement (not needed — board audio is already in the
  recording).
- ffprobe-based auto-detection of the service resolution (hardcoded 1080p30
  target; revisit only if a real service differs).
- Queueing multiple simultaneous renders (one-at-a-time is sufficient).

## Success criteria

With a Phase 1 recording present: clicking **Produce video** computes a trim that
skips the leading countdown (starting at the first song/sermon), lets the
operator confirm/nudge start/end, then encodes an MP4 next to the recording
containing (optional intro +) the trimmed service (+ optional outro) with the
clean board audio intact. Progress shows during the render; the row flips to
`done` with the output path. With no intro/outro set, the output is just the
trimmed service. A failed encode flips the row to `failed` with a toast and
leaves no half-written output claimed as `done`. `buildFfmpegArgs` and
`computeTrim` are covered by unit tests.
