// Types shared across main, preload, and renderer.

import type { ThemeColors, FontKey } from './themes'
export type { ThemeColors } from './themes'

export type Mode = 'lyrics' | 'black' | 'logo' | 'countdown' | 'livecall'
export type Intent = 'next' | 'prev' | 'black' | 'logo' | 'lyrics'
export type TrackId = 'main' | 'second'
export type Theme = 'modern-church' | 'minimalist' | 'vibrant' | 'dark-premium'
export type BibleTranslation = 'kjv' | 'web' | 'bbe'

export type SceneContext = 'worship' | 'word' | 'countdown'
export interface ObsStatus {
  connected: boolean
  streaming: boolean
  recording: boolean
  currentScene: string | null
  scenes: string[]
  error: string | null
  streamStartedAt: number | null
  recordStartedAt: number | null
  reconnecting: boolean
}

export interface LiveState {
  mode: Mode
  index: number
  line: string
  next: string
  total: number
  songTitle: string
  background: string | null
  bgFit?: 'cover' | 'contain'  // 'contain' fits whole-slide images; 'cover' fills behind lyrics
  bgMotion?: 'pan' | 'zoom' | 'shimmer' | null
  liveServiceItemId: number | null
  fontScale: number   // vw units for lyric text size, default 6
  stageMessage: string | null
  ts: number
  hmsLoadedAt?: number | null  // timestamp when song was loaded (for hymn timer)
  autoAdvanceMs?: number | null  // remaining ms for auto-advance countdown
  theme?: Theme
  verseNumber?: number | null  // current verse being displayed
  // CCLI copyright info for the live song (shown as an on-screen footer).
  songAuthor?: string | null
  songCopyright?: string | null
  songCcli?: string | null
  ccliLicense?: string | null  // church's CCLI license number (global setting)
  slideTheme?: string                 // projector slide-theme id (distinct from operator-UI `theme`)
  slideThemeColors?: ThemeColors | null
  songTextColor?: string | null
  songFont?: string | null
  blurBehindText?: boolean       // draw a blurred/tinted band behind the live text
  // True while Rehearsal mode is armed — a global flag (not per-track), carried
  // on LiveState so it reaches every consumer for free. Real physical outputs
  // (Output.tsx windows, Stage.tsx, zone screens) must treat this as "show
  // nothing," while operator-facing previews (LiveMirror, SlideGrid, the
  // ServiceRail preview) ignore it and keep showing the real content, since the
  // whole point of rehearsing is to see what WOULD go out.
  rehearsal?: boolean
  // The current sermon slide's scripture reference and the pastor's own notes
  // for it — null on the intro slide (index 0) and for every non-sermon item.
  // Populated by renderState() from the live track's sermonSlides array.
  sermonReference?: string | null
  sermonNotes?: string | null
}

export interface DisplayInfo {
  id: number
  bounds: { x: number; y: number; width: number; height: number }
  primary: boolean
  internal: boolean
}

export interface Song {
  title: string
  lines: string[]
  background?: string | null
}

export interface AppInfo {
  song: Song
  state: LiveState
  displays: DisplayInfo[]
  outputs: number
  zonesConnected: ZoneId[]
  startupMs: number
  appVersion: string   // package.json version of the running build
  isPackaged: boolean  // false when running via `npm run dev`
}

// --- Song library ---
export type SectionKind = 'verse' | 'chorus' | 'bridge' | 'tag' | 'intro' | 'ending' | 'section'

export interface SongSection {
  id?: number
  kind: SectionKind
  label?: string | null
  ordinal: number
  lyrics: string
}

export interface SongSummary {
  id: number
  title: string
  author: string | null
  background: string | null
}

export interface SongFull extends SongSummary {
  ccli: string | null
  copyright: string | null
  publisher: string | null
  sections: SongSection[]
  arrangement: number[] | null
  fontScale: number | null
  linesPerSlide: number | null
  bgMotion: 'pan' | 'zoom' | 'shimmer' | null
  textColor: string | null
  font: FontKey | null
  blurBehindText?: boolean
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
  bgMotion?: 'pan' | 'zoom' | 'shimmer' | null
  textColor?: string | null
  font?: FontKey | null
  blurBehindText?: boolean
}

// A song parsed from a PowerPoint (.pptx) file, pending import.
export interface ParsedPptxSong {
  fileName: string
  title: string
  slides: string[] // each entry is one slide's lyrics (becomes a section)
}

// A logged occurrence of a song going live (for CCLI usage reporting).
export interface SongUsage {
  id: number
  songId: number | null
  title: string
  author: string | null
  ccli: string | null
  copyright: string | null
  usedAt: number
}

// --- Service builder ---
// 'header' and 'placeholder' are organizational-only: they never go live and
// carry no zone routing. 'header' is a colored section divider (Welcome /
// Worship / Sermon / Response); 'placeholder' reserves a labeled TBD slot in
// the running order before its real content exists. 'livecall' brings a
// traveling preacher's phone onto the sanctuary screens — see LivecallConfig.
export type ServiceItemType = 'song' | 'scripture' | 'text' | 'countdown' | 'image' | 'welcome' | 'ticker' | 'announcement' | 'sermon' | 'header' | 'placeholder' | 'livecall'

// Item types that never go live — no zone routing, no "Go Live" action, no
// zone-screen preview. Purely organizational rows in the service list.
export const NON_LIVE_TYPES: ServiceItemType[] = ['header', 'placeholder']

// Item types whose live rendering supports a custom file background stored
// directly on the item's own payload (payload.background) — Song has its own
// separate background system (SongFull.background), Image's payload.path
// already IS the background, and Ticker doesn't support one.
// SINGLE SOURCE OF TRUTH: every place that needs to know "does this item type
// support a background" must import this instead of hardcoding its own copy
// of the list — three separate copies have already drifted out of sync once
// each as new types gained support (Scripture/Countdown/Welcome, then Sermon).
export const PAYLOAD_BACKGROUND_TYPES: ServiceItemType[] = ['text', 'scripture', 'countdown', 'welcome', 'sermon', 'announcement']

export interface ServiceSummary {
  id: number
  name: string
  service_date: string | null
}

// Per-item theme override; null/absent = use the service theme.
export interface ItemStyle {
  theme?: string
  colors?: ThemeColors
}

export interface ServiceItem {
  id: number
  ordinal: number
  type: ServiceItemType
  ref_id: number | null
  payload: Record<string, unknown>
  title: string
  notes: string | null
  style: ItemStyle | null
  zoneRouting: ZoneRouting | null
  track: TrackId
}

export interface ServiceFull extends ServiceSummary {
  theme: string | null
  themeColors: ThemeColors | null
  items: ServiceItem[]
}

export interface NewServiceItem {
  type: ServiceItemType
  ref_id?: number | null
  payload?: Record<string, unknown>
  track?: TrackId
}

// Everything a renderer needs to reach Live Call signaling. `url` is loopback
// because the relay and the output windows run on this machine; `phoneUrl` is
// the LAN address for the QR code (swap for a Tailscale name off-site).
export interface LivecallConfig {
  url: string
  phoneUrl: string
  /** False when we fell back to the LAN address, which can never use a camera. */
  phoneUrlIsSecure: boolean
  tabletPort: number
  token: string
  room: string
}

// --- Multi-zone display system ---
export type ZoneId = 1 | 2 | 3 | 4
// 'sermon' is the designed sermon backdrop (title card behind the pastor) —
// distinct from 'text', which renders the same content as a plain live line.
export type ZoneMode = 'lyrics' | 'stage' | 'black' | 'logo' | 'countdown' | 'text' | 'image' | 'sermon' | 'livecall' | 'off'

export interface ZoneState {
  mode: ZoneMode
  // lyrics / text content
  line: string
  next: string
  title: string
  index: number
  total: number
  background: string | null
  themeColors: { primary: string; secondary: string; text: string } | null
  fontScale: number
  // True when fontScale is an operator-set override on the deck slot itself,
  // rather than the automatic default. The zone page's shrink-to-fit is a
  // binary search DOWN from fontScale to whatever fits the box — raising
  // fontScale on text that already needs shrinking converges to the same
  // final size regardless, so it silently did nothing. This tells the zone
  // page to skip that search and render at exactly the chosen size instead,
  // which is the only way "set a size" actually behaves like a manual control.
  fixedFontScale: boolean
  // countdown
  secondsLeft: number
  // stage extras
  stageMessage: string | null
  // image
  imagePath: string | null
  // sermon backdrop extras (mode 'sermon'): the designed title card's subtext
  speaker: string | null
  passage: string | null
  // text slide custom style
  bgColor: string | null        // solid hex bg color (when no background file)
  bgOverlay: number | null      // 0-1 opacity of readability overlay
  textAlign: string | null      // 'left' | 'center' | 'right'
  textPosition: string | null   // 'top' | 'center' | 'bottom'
  blurBehindText?: boolean      // blurred/tinted band behind the main line/content
  // Per-screen output scale (percent, default 100). Compensates for a physical
  // screen that crops edges or leaves them empty — set once per screen, not per
  // item. computeZoneStates stamps this onto every ZoneState right before
  // broadcast, so it's always populated regardless of which branch built the rest.
  scale?: number
}

// Per-service-item zone routing: what each zone shows when this item is live.
export type ZoneRouting = Record<ZoneId, ZoneMode>

export const ZONE_ROUTING_DEFAULTS: Record<ServiceItemType, ZoneRouting> = {
  song:      { 1: 'logo',      2: 'logo',      3: 'lyrics',    4: 'stage' },
  scripture: { 1: 'text',      2: 'text',      3: 'text',      4: 'stage' },
  text:      { 1: 'text',      2: 'text',      3: 'text',      4: 'stage' },
  countdown: { 1: 'countdown', 2: 'countdown', 3: 'countdown', 4: 'stage' },
  image:     { 1: 'image',     2: 'image',     3: 'image',     4: 'stage' },
  welcome:   { 1: 'countdown', 2: 'countdown', 3: 'countdown', 4: 'stage' },
  ticker:    { 1: 'text',      2: 'text',      3: 'text',      4: 'stage' },
  announcement: { 1: 'text',   2: 'text',      3: 'text',      4: 'stage' },
  // Back screens get the designed sermon backdrop (title/speaker/passage) —
  // the Lyrics TVs stay on the logo so the room isn't reading the same card twice.
  sermon:    { 1: 'sermon',    2: 'sermon',    3: 'logo',      4: 'stage' },
  // The call is the content — every audience screen shows him. Stage monitors
  // keep their normal view so the platform team still sees what they need.
  livecall:  { 1: 'livecall',  2: 'livecall',  3: 'livecall',  4: 'stage' },
  // Never go live — see NON_LIVE_TYPES.
  header:      { 1: 'off', 2: 'off', 3: 'off', 4: 'off' },
  placeholder: { 1: 'off', 2: 'off', 3: 'off', 4: 'off' },
}

export const ZONE_NAMES: Record<ZoneId, string> = {
  1: 'Back Left',
  2: 'Back Right',
  3: 'Lyrics TVs',
  4: 'Stage Monitors',
}

export const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

// Which track a zone follows when a service has no explicit zone_track_assignment.
// All zones default to Main so an existing (pre-dual-track) service's screens are
// byte-for-byte unchanged after upgrading — Second is opt-in per zone, per service.
export const DEFAULT_ZONE_TRACK: Record<ZoneId, TrackId> = { 1: 'main', 2: 'main', 3: 'main', 4: 'main' }

// --- Scripture / KJV ---
export interface ScriptureVerse {
  n: number
  text: string
}

// One entry per reference in a scripture item's field, for validating the whole
// reading as it is typed. 'resolved' is the canonical form the lookup settled
// on, which is what the operator should see confirmed back to them.
export interface ScriptureRefCheck {
  reference: string
  ok: boolean
  resolved: string | null
  verseCount: number
}

export interface ScriptureResult {
  ok: boolean
  reference?: string
  verses?: ScriptureVerse[]
  error?: string
  // True when an online translation lookup failed and this is the bundled KJV
  // fallback — so the operator can be warned the wrong translation is showing.
  usedFallback?: boolean
}

// --- Announcements library ---
export type AnnouncementDisplay = 'slide' | 'ticker'
export type AnnouncementFrequency = 'once' | 'recurring'

export interface AnnouncementSummary {
  id: number
  title: string
  display: AnnouncementDisplay
  frequency: AnnouncementFrequency
  startDate: string | null
  endDate: string | null
  active: boolean
  expired: boolean // derived (main process) from the schedule vs today
}

export interface Announcement extends AnnouncementSummary {
  body: string
  background: string | null // image/video file path (slide only); null = service theme
  blurBehindText?: boolean  // slide-display only
}

export interface AnnouncementInput {
  title: string
  body: string
  display: AnnouncementDisplay
  background?: string | null
  blurBehindText?: boolean
  frequency: AnnouncementFrequency
  startDate?: string | null
  endDate?: string | null
  active?: boolean
}

// --- Service recording (Phase 1: capture & markers) ---
export type RecordingMarkerKind = 'sermon' | 'song' | 'item'

export type RenderState = 'idle' | 'rendering' | 'done' | 'failed'

export type AiState = 'idle' | 'generating' | 'done' | 'failed'

export interface RecordingRow {
  id: number
  serviceId: number | null
  startedAt: number            // epoch ms (app wall clock)
  endedAt: number | null       // epoch ms; null while open
  filePath: string | null      // from OBS StopRecord.outputPath
  obsRecordStartedMs: number   // epoch ms; OBS's actual record start
  markerCount?: number         // populated by listRecordings for the UI
  outputPath: string | null    // finished MP4 (null until produced)
  renderState: RenderState     // assembly status; 'idle' when never produced
  transcript: string | null
  aiTitle: string | null
  aiDescription: string | null
  chapters: string | null
  srtPath: string | null
  thumbnailPath: string | null
  aiState: AiState
}

export interface RecordingMarkerInput {
  itemId: number | null
  kind: RecordingMarkerKind
  label: string
  offsetMs: number             // ms from recording start
}

export interface RecordingMarker extends RecordingMarkerInput {
  id: number
  recordingId: number
}

export interface RecordingSidecar {
  worshipflowVersion: string
  service: { id: number | null; name: string; date: string | null }
  recording: { startedAt: number; durationMs: number; file: string }
  markers: Array<{ kind: RecordingMarkerKind; label: string; offsetMs: number }>
}
