// Types shared across main, preload, and renderer.

import type { ThemeColors } from './themes'
export type { ThemeColors } from './themes'

export type Mode = 'lyrics' | 'black' | 'logo' | 'countdown'
export type Intent = 'next' | 'prev' | 'black' | 'logo' | 'lyrics'
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
  startupMs: number
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
export type ServiceItemType = 'song' | 'scripture' | 'text' | 'countdown' | 'image' | 'welcome' | 'ticker'

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
}

// --- Multi-zone display system ---
export type ZoneId = 1 | 2 | 3 | 4
export type ZoneMode = 'lyrics' | 'stage' | 'black' | 'logo' | 'countdown' | 'text' | 'image' | 'off'

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
  // countdown
  secondsLeft: number
  // stage extras
  stageMessage: string | null
  // image
  imagePath: string | null
  // text slide custom style
  bgColor: string | null        // solid hex bg color (when no background file)
  bgOverlay: number | null      // 0-1 opacity of readability overlay
  textAlign: string | null      // 'left' | 'center' | 'right'
  textPosition: string | null   // 'top' | 'center' | 'bottom'
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
}

export const ZONE_NAMES: Record<ZoneId, string> = {
  1: 'Back Left',
  2: 'Back Right',
  3: 'Lyrics TVs',
  4: 'Stage Monitors',
}

// --- Scripture / KJV ---
export interface ScriptureVerse {
  n: number
  text: string
}

export interface ScriptureResult {
  ok: boolean
  reference?: string
  verses?: ScriptureVerse[]
  error?: string
}
