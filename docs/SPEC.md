# WorshipFlow — Specification

> Build Sunday once. Route it everywhere.
> Church worship presentation software for Snow Hill Church.

## Mission

The easiest, most reliable church presentation app a volunteer can run — capable of
building, saving, and running an entire Sunday service live, driving multiple displays,
and (later) integrating with OBS for streaming. Built from the perspective of the person
who actually runs the service every week.

## Hard-won lessons (why this rebuild exists)

The first attempt (`C:\Dev\church-presentation-OLD`) failed because it **silently abandoned
its own architecture**: it was designed as an Electron desktop app that owns the monitors,
but the implementation drifted into a localhost web server with browser tabs as "outputs."
A browser **cannot** enumerate physical monitors or place fullscreen windows on them — so the
single most important capability never existed, while "Phase 3/4 ✅" UI was built on top of nothing.

**Discipline rules (non-negotiable):**
1. **True desktop app.** The Electron main process owns the monitors and output windows.
   Never a "website in a shell."
2. **Foundation first.** Prove the engine before features. Don't mark a phase done until the
   underlying capability is real and demonstrated.
3. **One phase at a time, reviewed.** Small, verifiable steps.
4. **The module that streams/assists must never crash the live presentation engine.**

## Decisions (locked)

- **Shell: Electron** + React + TypeScript + Tailwind v3. (Chosen 2026-06-21 after building
  head-to-head Electron vs Tauri spikes: both engines worked; Electron was steadier on
  multi-output 1080p video, and one language beats JS+Rust for a small/solo-maintained project.
  The original "Electron is slow" worry was a misdiagnosis — the old app was never Electron.)
- **Local-first**, offline, Windows-first. SQLite for storage. No cloud in v1.
- **"Zones, not screens"** + **"one brain, many dumb screens."** The main process maps logical
  output zones to physical monitors and drives borderless fullscreen output windows.

## Architecture

```
WorshipFlow (Electron)
├── main/      The brain. Owns app lifecycle, enumerates displays, creates & positions
│              operator + output windows, holds canonical live state, broadcasts via IPC,
│              autosaves for crash recovery, talks to SQLite. (Later: OBS WebSocket, NDI.)
├── preload/   Safe contextBridge API (window.wf) — state send/subscribe, display info,
│              output control. No nodeIntegration in renderers.
└── renderer/  React. Two roles by route:
               • Operator  — the control surface (Director + Volunteer modes)
               • Output    — a "dumb" fullscreen renderer for a zone (lyrics/scripture/bg/logo/black)
```

**State model:** the main process is the single source of truth. Operator actions → IPC to main →
main updates canonical state + autosaves → main broadcasts to all output windows in lockstep.
Output windows never hold authority; they render what they're told. This is what makes
crash-recovery and multi-output sync possible.

## Phase plan

### Phase 0 — The engine (NEXT)
Port the proven spike into the real app:
- Enumerate displays; map zones → monitors (with sensible defaults + manual override later).
- Operator window on primary; borderless fullscreen output window per assigned monitor.
- Single-monitor dev fallback + `WF_SIM=N` tiled-outputs mode for testing without hardware.
- Canonical live state in main; IPC broadcast to outputs in lockstep.
- Black / Logo / Next / Back. Autosave current position → restore after crash.
- Output renderer: background layer (still/loop video) + text layer with crossfade.

**Done when:** one operator drives multiple synchronized fullscreen outputs with smooth
video + lyric transitions, and recovers its position after a forced quit.

### Phase 1 — Run one Sunday (v1)
Smallest thing that runs a real Snow Hill service end-to-end:
- **Song library** — manual lyric entry, sections (verse/chorus/bridge/tag/custom), search by
  title; each song remembers its background + font/theme.
- **Service builder** — ordered items, drag-reorder; save & reopen weekly services.
- **Item types** — Song · Scripture (KJV lookup by reference) · Text/Announcement slide · Countdown.
- **Backgrounds** — still images + looping motion video.
- **Volunteer mode** — big Next / Back / Black / Logo; can't damage the service.
- **Multi-screen mirror** — operator + main + song screens, coordinated (same content).

### Phase 2 — Differentiators
Screen **routing + scenes** (each output shows *different* content, one-button presets) ·
**pastor/stage display** (now/next/clock/timer/notes) · **private booth→pastor messaging** · panic polish.

### Phase 3 — Streaming
OBS WebSocket (scene switching, lyric lower-thirds, record/stream control) · NDI output
(NDI runtime already installed on the church PC).

### Phase 4 — Everything else
Sound Check Assistant (separate module, Yamaha TF-Rack) · announcement scheduler · QR bulletin ·
worship-leader view · nursery alerts · multi-church · cloud sync/backup · mobile remote ·
networked display players.

## Data model (Phase 1 sketch, SQLite)

- **song**(id, title, author, ccli, default_background_id, theme_json, created_at)
- **song_section**(id, song_id, kind, label, ordinal, lyrics)
- **service**(id, name, service_date, created_at)
- **service_item**(id, service_id, ordinal, type, ref_id, payload_json)  — type ∈ song|scripture|text|countdown
- **media**(id, kind, path, label)  — kind ∈ image|video|logo
- **scripture** — bundled KJV (book/chapter/verse), queried by reference
- **setting**(key, value)  — zone→monitor mapping, themes, recovery state

## Tech stack

Electron · electron-vite · React 18 · TypeScript · Tailwind v3 · SQLite (better-sqlite3, added in
Phase 1) · OBS WebSocket / NDI (Phase 3). Windows-first. Backup via private git remote (NOT Google Drive).

## Explicitly deferred (so v1 ships)

Routing scenes, pastor display, booth messaging, OBS, NDI, sound check, scheduler, QR, multi-church,
cloud, mobile remote. All planned — none in v1.
