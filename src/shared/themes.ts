// Curated slide themes shared by main + renderer. Themes are recolorable presets:
// each ships default colors, overridable per service.

export type FontKey = 'modern' | 'classic' | 'bold' | 'elegant'

export const FONT_FAMILY: Record<FontKey, string> = {
  modern: "'Poppins', system-ui, sans-serif",
  classic: "'PT Serif', Georgia, serif",
  bold: "'Anton', Impact, sans-serif",
  elegant: "'Cormorant Garamond', Georgia, serif"
}

export type MotionEffect = 'aurora' | 'bokeh' | 'rays' | 'drift'
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
    defaults: { primary: '#0f1f3d', secondary: '#1d2a4a', text: '#ffffff' } },
  { id: 'midnight', name: 'Midnight', kind: 'static', font: 'bold', position: 'middle', gradient: false,
    defaults: { primary: '#0a0a0a', secondary: '#1a1a1a', text: '#ffffff' } },
  { id: 'minimal', name: 'Minimal', kind: 'static', font: 'modern', position: 'middle', gradient: false,
    defaults: { primary: '#2c2c2a', secondary: '#2c2c2a', text: '#ffffff' } },
  { id: 'warm', name: 'Warm', kind: 'static', font: 'classic', position: 'middle', gradient: true,
    defaults: { primary: '#4a1b0c', secondary: '#854f0b', text: '#fff5e6' } },
  { id: 'garden', name: 'Garden', kind: 'static', font: 'modern', position: 'middle', gradient: true,
    defaults: { primary: '#04342c', secondary: '#0f6e56', text: '#ffffff' } },
  { id: 'pure', name: 'Pure', kind: 'static', font: 'modern', position: 'middle', gradient: false,
    defaults: { primary: '#f5f5f0', secondary: '#e8e8e0', text: '#1a1a1a' } },
  { id: 'aurora', name: 'Aurora', kind: 'motion', effect: 'aurora', font: 'elegant', position: 'middle',
    defaults: { primary: '#1d2a4a', secondary: '#3b1d5a', text: '#ffffff' } },
  { id: 'bokeh', name: 'Bokeh lights', kind: 'motion', effect: 'bokeh', font: 'modern', position: 'middle',
    defaults: { primary: '#0d1b2a', secondary: '#185fa5', text: '#ffffff' } },
  { id: 'rays', name: 'Light rays', kind: 'motion', effect: 'rays', font: 'bold', position: 'middle',
    defaults: { primary: '#101820', secondary: '#ffffff', text: '#ffffff' } },
  { id: 'drift', name: 'Soft drift', kind: 'motion', effect: 'drift', font: 'classic', position: 'middle',
    defaults: { primary: '#26215c', secondary: '#04342c', text: '#ffffff' } }
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
    ? `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`
    : colors.primary
}
