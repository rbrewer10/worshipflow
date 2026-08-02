import type { ZoneState } from '../../../shared/types'

export function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// What this screen is showing RIGHT NOW, in the operator's words. Showing only
// a mode chip would mean a screen holding the wrong sermon and a screen
// following the service look identical.
export function readout(zs: ZoneState | undefined): { primary: string; secondary: string | null } {
  if (!zs) return { primary: '…', secondary: null }
  switch (zs.mode) {
    case 'off': return { primary: 'Off', secondary: null }
    case 'black': return { primary: 'Black', secondary: null }
    case 'logo': return { primary: 'Logo', secondary: null }
    case 'image': return { primary: zs.title || 'Image', secondary: null }
    case 'countdown': return { primary: mmss(zs.secondsLeft), secondary: zs.title || null }
    case 'stage': return { primary: zs.stageMessage || zs.line || 'Stage', secondary: zs.title || null }
    case 'sermon': return {
      primary: zs.title || 'Sermon',
      secondary: [zs.speaker, zs.passage].filter(Boolean).join(' · ') || null
    }
    case 'livecall': return { primary: 'Live Call', secondary: zs.title || null }
    case 'lyrics':
    case 'text': return { primary: zs.line || zs.title || '—', secondary: zs.line ? zs.title || null : null }
  }
}
