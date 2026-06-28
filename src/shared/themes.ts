// Curated slide themes shared by main + renderer. Themes are recolorable presets:
// each ships default colors, overridable per service.

export type FontKey = 'modern' | 'classic' | 'bold' | 'elegant'

export const FONT_FAMILY: Record<FontKey, string> = {
  modern: "'Poppins', system-ui, sans-serif",
  classic: "'PT Serif', Georgia, serif",
  bold: "'Anton', Impact, sans-serif",
  elegant: "'Cormorant Garamond', Georgia, serif"
}

export type MotionEffect =
  | 'aurora' | 'bokeh' | 'rays' | 'drift'
  | 'fire' | 'starfield' | 'waterfall' | 'embers'
  | 'shimmer' | 'cosmic' | 'cross-glow' | 'mist'
  | 'neon' | 'sunrise'
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
  gradient?: boolean // static only: true = primary→secondary gradient, false = solid primary
  effect?: MotionEffect // motion only
}

export const THEMES: SlideTheme[] = [
  { id: 'sanctuary', name: 'Sanctuary', kind: 'static', font: 'classic', position: 'middle', gradient: true,
    defaults: { primary: '#3b2f8f', secondary: '#7c3aed', text: '#ffffff' } },
  { id: 'midnight', name: 'Midnight', kind: 'static', font: 'bold', position: 'middle', gradient: true,
    defaults: { primary: '#1e293b', secondary: '#334155', text: '#ffffff' } },
  { id: 'minimal', name: 'Minimal', kind: 'static', font: 'modern', position: 'middle', gradient: true,
    defaults: { primary: '#334155', secondary: '#475569', text: '#ffffff' } },
  { id: 'warm', name: 'Warm', kind: 'static', font: 'classic', position: 'middle', gradient: true,
    defaults: { primary: '#9a3412', secondary: '#ea8c1c', text: '#fff7ed' } },
  { id: 'garden', name: 'Garden', kind: 'static', font: 'modern', position: 'middle', gradient: true,
    defaults: { primary: '#065f46', secondary: '#10b981', text: '#ffffff' } },
  { id: 'pure', name: 'Pure', kind: 'static', font: 'modern', position: 'middle', gradient: false,
    defaults: { primary: '#f5f5f0', secondary: '#e8e8e0', text: '#1a1a1a' } },
  { id: 'aurora', name: 'Aurora', kind: 'motion', effect: 'aurora', font: 'elegant', position: 'middle',
    defaults: { primary: '#0d4f4a', secondary: '#7c3aed', text: '#ffffff' } },
  { id: 'bokeh', name: 'Bokeh lights', kind: 'motion', effect: 'bokeh', font: 'modern', position: 'middle',
    defaults: { primary: '#0f2a4a', secondary: '#2f86d6', text: '#ffffff' } },
  { id: 'rays', name: 'Light rays', kind: 'motion', effect: 'rays', font: 'bold', position: 'middle',
    defaults: { primary: '#1e3a5f', secondary: '#bfe3ff', text: '#ffffff' } },
  { id: 'drift', name: 'Soft drift', kind: 'motion', effect: 'drift', font: 'classic', position: 'middle',
    defaults: { primary: '#3a2f7a', secondary: '#0f6e56', text: '#ffffff' } },
  { id: 'fire', name: 'Holy Fire', kind: 'motion', effect: 'fire', font: 'bold', position: 'middle',
    defaults: { primary: '#7a1505', secondary: '#ff6b1a', text: '#fff8f0' } },
  { id: 'starfield', name: 'Starfield', kind: 'motion', effect: 'starfield', font: 'elegant', position: 'middle',
    defaults: { primary: '#0a1633', secondary: '#5b8dff', text: '#ffffff' } },
  { id: 'waterfall', name: 'Living Water', kind: 'motion', effect: 'waterfall', font: 'classic', position: 'middle',
    defaults: { primary: '#024d72', secondary: '#1ca7c4', text: '#e8f7ff' } },
  { id: 'embers', name: 'Embers', kind: 'motion', effect: 'embers', font: 'bold', position: 'bottom',
    defaults: { primary: '#5c1605', secondary: '#f15a1c', text: '#fff5e6' } },
  { id: 'shimmer', name: 'Golden Shimmer', kind: 'motion', effect: 'shimmer', font: 'elegant', position: 'middle',
    defaults: { primary: '#6b4e0f', secondary: '#f0c64b', text: '#fffaf0' } },
  { id: 'cosmic', name: 'Cosmic', kind: 'motion', effect: 'cosmic', font: 'modern', position: 'middle',
    defaults: { primary: '#2e0d5c', secondary: '#9333ea', text: '#ffffff' } },
  { id: 'cross-glow', name: 'Cross Glow', kind: 'motion', effect: 'cross-glow', font: 'classic', position: 'bottom',
    defaults: { primary: '#13294f', secondary: '#5aa6f0', text: '#ffffff' } },
  { id: 'mist', name: 'Morning Mist', kind: 'motion', effect: 'mist', font: 'elegant', position: 'middle',
    defaults: { primary: '#3a4a66', secondary: '#9ec5e8', text: '#ffffff' } },
  { id: 'neon', name: 'Neon Praise', kind: 'motion', effect: 'neon', font: 'bold', position: 'middle',
    defaults: { primary: '#3a0a5c', secondary: '#ff2bd6', text: '#ffffff' } },
  { id: 'sunrise', name: 'Sunrise', kind: 'motion', effect: 'sunrise', font: 'classic', position: 'middle',
    defaults: { primary: '#b3471a', secondary: '#ffb24d', text: '#fff7ed' } }
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
    ? `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`
    : colors.primary
}
