# WYSIWYG Slide Editor + Background System — Design Spec
**Date:** 2026-06-27  
**Status:** Approved

---

## Overview

Rework the WorshipFlow Songs tab so that building and editing slides feels like PowerPoint: you click directly on the slide to type, see exactly what the projector will show, and pick or generate motion backgrounds without leaving the editor. No new app — this replaces the current song form inside the existing Songs tab.

---

## 1. WYSIWYG Slide Canvas

### What it does
The Songs tab main area becomes a full-width slide canvas. The slide is rendered at its actual aspect ratio (16:9) with the real background and real lyric text positioned exactly as it will appear on the projector.

### Editing
- Click any lyric line on the slide → an editable text cursor appears in-place (contenteditable or an absolutely-positioned `<textarea>` overlay matching the text's position/size)
- A floating toolbar appears above the selection: font size, bold, color picker, text alignment (left / center / right)
- Click off the text → toolbar dismisses, slide returns to preview mode
- Arrow keys / clicking the slide thumbnail strip (left side) advances between slides/verses

### Slide strip
A vertical thumbnail strip on the left shows all slides for the current song. The active slide is highlighted. Click any thumbnail to jump to it. Slides are generated from the song's sections (verse 1, chorus, verse 2, etc.) exactly as today.

### Live sync
Any edit immediately updates:
- The canvas preview
- The thumbnail strip
- The live output (if this song is currently live on the projector)

### Text defaults
A "Slide Defaults" section in the right panel sets font family, base size, and color for all slides in the song. Individual slide overrides are stored per-slide.

---

## 2. Background System

The right panel has three tabs: **My Uploads**, **Presets**, **AI Generate**. Selecting any background applies it to the current song immediately and saves it to the song record in SQLite.

### My Uploads
- Drag-and-drop or click-to-browse for image files (JPG, PNG, WebP) and video files (MP4, MOV, WebM)
- Files are copied into `%APPDATA%\worshipflow\backgrounds\uploads\`
- Displayed as a scrollable thumbnail grid
- Click any thumbnail → applies to current song
- Hover → trash icon to remove

### Presets
- ~20 bundled motion background video loops (~50 MB total, shipped with the app)
- Categories: Worship Light, Nature, Abstract, Cross/Symbol, Seasonal
- Example loops: light rays, starfield, flowing fire, bokeh cross, golden shimmer, soft clouds, purple haze, water ripple
- Displayed as a thumbnail grid with loop preview on hover
- **Randomize** button picks a random preset and applies it instantly

### AI Generate
- A text prompt input: `"soft blue waves"`, `"golden heavenly light"`, `"dark starfield with cross"`
- **Generate** button → calls Replicate API (Flux or SDXL model) to produce a high-res still (1920×1080)
- Generated image is saved to `%APPDATA%\worshipflow\backgrounds\generated\`
- In-app motion layer applied on top (Ken Burns slow pan/zoom + optional particle shimmer), making it feel like a looping video — no video generation API required, renders instantly
- Motion style picker: **Pan**, **Zoom**, **Shimmer**, **None**
- Generated backgrounds appear in My Uploads automatically for reuse
- API key: Replicate key stored in app settings (Settings tab → Integrations)
- Cost: ~$0.003 per image on Replicate free tier

---

## 3. Integration with Existing WorshipFlow

### What changes
| Area | Change |
|------|--------|
| Songs tab | Main area replaced with WYSIWYG canvas + slide strip + right panel |
| Song data model | Add per-slide font overrides; background field already exists |
| Output renderer | Add Ken Burns / particle motion layer to background rendering |
| Settings tab | Add Replicate API key field under Integrations |

### What stays the same
- Service builder, service rail, live output engine, IPC layer
- Slide grid in Live tab (reads same song data)
- KJV scripture lookup
- All existing song CRUD and IPC handlers (`wf:songs:*`)
- SQLite schema — only additive column for per-slide font overrides

### Data model additions
```ts
// song_section table — add columns:
font_size_override: integer | null   // null = use song default
font_color_override: text | null     // null = use song default
text_align_override: text | null     // 'left' | 'center' | 'right' | null

// song table — existing background_path already present
// No schema changes needed for background system
```

### New files
```
src/renderer/components/editor/
  SlideCanvas.tsx        — WYSIWYG canvas, contenteditable overlay
  SlideStrip.tsx         — left thumbnail strip
  FloatingToolbar.tsx    — font/color/align controls
  BackgroundPanel.tsx    — right panel with 3 tabs
  UploadTab.tsx
  PresetsTab.tsx
  AIGenerateTab.tsx
src/renderer/hooks/
  useMotionBackground.ts — Ken Burns / particle animation logic
src/main/
  backgroundAssets.ts    — preset manifest + file serving
  replicateApi.ts        — Replicate HTTP client
```

---

## 4. Motion Background Animation (Ken Burns Layer)

Implemented as a CSS animation on a `<div>` containing the background image/video, layered behind the text:

- **Pan:** translate X or Y slowly across the image (120s loop)
- **Zoom:** scale from 1.0 → 1.15 → 1.0 (90s loop)
- **Shimmer:** overlay a semi-transparent white radial gradient that moves slowly
- **None:** static image, no animation

Applied in both the editor canvas and the output renderer so what you see is what the projector shows.

---

## 5. Out of Scope (This Phase)
- Text boxes outside the lyric area (no free-form text placement)
- Shape tools, image inserts onto slides
- Slide transitions / build animations
- Multi-song theme templates (can be added later)
- Video generation APIs (Runway, Kling) — static + Ken Burns covers 95% of use
