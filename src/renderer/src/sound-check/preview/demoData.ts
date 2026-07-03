// Throwaway design-preview demo data — hardcoded, no IPC, no window.wf.
// Mirrors the "Sound Check UI Options" HTML mockup.

export type ViewMode = 'setup' | 'live'

export interface DemoChannel {
  ch: string
  name: string
  /** Short name used on Option B scribble strips */
  shortName: string
  kind: 'mic' | 'track' | 'line' | 'unassigned'
  /** Reference level shown in Option A setup table */
  refLevel: string
  /** Live dB readout used by Option B console strips */
  dbConsole: string
  /** Live dB readout used by Option D meter grid */
  dbMission: string
  /** 0..1 live level for meters */
  lvl: number
  hot?: boolean
  muted?: boolean
  /** Reference delta label for Option D */
  delta: string
  deltaTone: 'ok' | 'hi' | 'err' | 'mut'
}

export const CHANNELS: DemoChannel[] = [
  { ch: '01', name: 'Pastor Mic', shortName: 'Pastor Mic', kind: 'mic', refLevel: '−18.0 dB', dbConsole: '-18.4', dbMission: '−18.4', lvl: 0.52, delta: '−8%', deltaTone: 'hi' },
  { ch: '02', name: 'Worship Leader Vox', shortName: 'Worship Ldr Vox', kind: 'mic', refLevel: '−14.5 dB', dbConsole: '-12.1', dbMission: '−12.1', lvl: 0.86, hot: true, delta: 'FDBK', deltaTone: 'err' },
  { ch: '03', name: 'BGV 1', shortName: 'BGV 1', kind: 'mic', refLevel: '−20.0 dB', dbConsole: '-20.6', dbMission: '−20.6', lvl: 0.38, delta: '+2%', deltaTone: 'ok' },
  { ch: '04', name: 'Acoustic Gtr', shortName: 'Acoustic Gtr', kind: 'line', refLevel: '−17.0 dB', dbConsole: '-16.9', dbMission: '−16.9', lvl: 0.56, delta: '+4%', deltaTone: 'ok' },
  { ch: '05', name: 'Keys', shortName: 'Keys', kind: 'unassigned', refLevel: '−19.0 dB', dbConsole: '-19.2', dbMission: '−19.2', lvl: 0.46, delta: '−3%', deltaTone: 'ok' },
  { ch: '06', name: 'Bass DI', shortName: 'Bass DI', kind: 'unassigned', refLevel: '−13.0 dB', dbConsole: '-10.8', dbMission: '−10.8', lvl: 0.79, delta: '+28%', deltaTone: 'hi' },
  { ch: '07', name: 'Drum OH L', shortName: 'Drum OH L', kind: 'line', refLevel: '−16.0 dB', dbConsole: '-16.0', dbMission: '−16.0', lvl: 0.6, delta: '+1%', deltaTone: 'ok' },
  { ch: '08', name: 'Drum OH R', shortName: 'Drum OH R', kind: 'line', refLevel: '−16.0 dB', dbConsole: '-16.3', dbMission: '−16.3', lvl: 0.58, delta: '−2%', deltaTone: 'ok' },
  { ch: '09', name: 'Tracks L', shortName: 'Tracks L', kind: 'track', refLevel: '−12.0 dB', dbConsole: '-6.2', dbMission: '−0.1', lvl: 0.97, hot: true, delta: 'CLIP', deltaTone: 'err' },
  { ch: '10', name: 'Tracks R', shortName: 'Tracks R', kind: 'track', refLevel: '−12.0 dB', dbConsole: '-11.9', dbMission: '−11.9', lvl: 0.7, delta: '+6%', deltaTone: 'ok' },
  { ch: '11', name: 'Speaker Podium', shortName: 'Speaker Podium', kind: 'mic', refLevel: '−18.5 dB', dbConsole: 'MUTE', dbMission: '—', lvl: 0, muted: true, delta: 'MUTED', deltaTone: 'mut' }
]

// Option A — setup table shows explicit Mic / Track checkboxes.
export const A_MIC_CHECKED = new Set(['01', '02', '03', '11'])
export const A_TRACK_CHECKED = new Set(['09', '10'])

// Option C — chip classification (matches the mockup's step-2 chips).
export const C_KINDS: Record<string, 'mic' | 'track' | 'unassigned'> = {
  '01': 'mic', '02': 'mic', '03': 'mic', '04': 'mic',
  '05': 'unassigned', '06': 'unassigned',
  '07': 'mic', '08': 'mic',
  '09': 'track', '10': 'track', '11': 'mic'
}
