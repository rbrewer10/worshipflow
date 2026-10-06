// Parse, validate and plan a .wfservice import (QA B11, B12, B24).
//
// Before: a UTF-8 BOM (Windows Notepad's default) failed with a raw JSON
// error; a missing `name` threw an unhandled "tried to bind a value of an
// unknown type (undefined)" that the user never saw; unknown item types and
// `song: null` were imported silently; a song whose title already existed was
// silently replaced by the booth copy even when the USB copy had updated
// lyrics; `track` and zone routing were dropped; missing media went unnoticed.
import type { ItemStyle, ServiceItemType, SongFull, SongInput, SongSection, ThemeColors, TrackId, ZoneRouting } from './types'

export const SERVICE_ITEM_TYPES: readonly ServiceItemType[] = ['song', 'scripture', 'text', 'countdown', 'image', 'welcome', 'ticker', 'announcement', 'sermon', 'header', 'placeholder', 'livecall']

export interface BundleSong {
  title: string
  author: string | null
  ccli: string | null
  copyright: string | null
  publisher: string | null
  background: string | null
  sections: SongSection[]
  arrangement: number[] | null
  fontScale: number | null
  linesPerSlide: number | null
}

export interface BundleItem {
  type: ServiceItemType
  payload: Record<string, unknown>
  title: string
  notes: string | null
  style: ItemStyle | null
  zoneRouting: ZoneRouting | null
  track: TrackId
  song: BundleSong | null
}

export interface ServiceBundle {
  version: number
  name: string
  service_date: string | null
  published_at: number | null
  team: unknown
  theme: string | null
  themeColors: ThemeColors | null
  items: BundleItem[]
}

export type ParseResult =
  | { ok: true; bundle: ServiceBundle; skipped: string[] }
  | { ok: false; error: string }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function parseSong(v: unknown): BundleSong | null {
  if (!isObj(v)) return null
  const title = str(v.title)?.trim()
  if (!title || !Array.isArray(v.sections)) return null
  const sections = v.sections
    .filter(isObj)
    .filter((s) => typeof s.lyrics === 'string')
    .map((s, i) => ({ kind: (str(s.kind) ?? 'verse') as SongSection['kind'], label: str(s.label), ordinal: num(s.ordinal) ?? i, lyrics: s.lyrics as string }))
  if (sections.length === 0) return null
  return {
    title,
    author: str(v.author),
    ccli: str(v.ccli),
    copyright: str(v.copyright),
    publisher: str(v.publisher),
    background: str(v.background),
    sections,
    arrangement: Array.isArray(v.arrangement) && v.arrangement.every((n) => typeof n === 'number') ? (v.arrangement as number[]) : null,
    fontScale: num(v.fontScale),
    linesPerSlide: num(v.linesPerSlide)
  }
}

/** Turn the raw file text into a validated bundle, or a message a volunteer can act on. */
export function parseServiceBundle(text: string): ParseResult {
  const clean = text.replace(/^\uFEFF/, '').trim()
  if (!clean) return { ok: false, error: 'The file is empty.' }
  let raw: unknown
  try {
    raw = JSON.parse(clean)
  } catch {
    return { ok: false, error: 'This file isn’t a WorshipFlow service (it couldn’t be read). If it was edited by hand, re-export it from WorshipFlow.' }
  }
  if (!isObj(raw) || !Array.isArray(raw.items) || !num(raw.version)) {
    return { ok: false, error: 'This file isn’t a WorshipFlow service (missing its version or item list).' }
  }
  const skipped: string[] = []
  const items: BundleItem[] = []
  raw.items.forEach((it, i) => {
    const label = isObj(it) && str(it.title) ? `“${str(it.title)}”` : `item ${i + 1}`
    if (!isObj(it)) { skipped.push(`${label}: not a service item`); return }
    const type = str(it.type) as ServiceItemType | null
    if (!type || !SERVICE_ITEM_TYPES.includes(type)) { skipped.push(`${label}: unknown item type “${String(it.type)}”`); return }
    let song: BundleSong | null = null
    if (type === 'song') {
      song = parseSong(it.song)
      if (!song) { skipped.push(`${label}: the song’s words are missing from the file`); return }
    }
    items.push({
      type,
      payload: isObj(it.payload) ? it.payload : {},
      title: str(it.title) ?? song?.title ?? '',
      notes: str(it.notes),
      style: isObj(it.style) ? (it.style as unknown as ItemStyle) : null,
      zoneRouting: isObj(it.zoneRouting) ? (it.zoneRouting as unknown as ZoneRouting) : null,
      track: it.track === 'second' ? 'second' : 'main',
      song
    })
  })
  const name = str(raw.name)?.trim() || 'Imported service'
  return {
    ok: true,
    skipped,
    bundle: {
      version: num(raw.version)!,
      name,
      service_date: str(raw.service_date),
      published_at: num(raw.published_at),
      team: raw.team ?? null,
      theme: str(raw.theme),
      themeColors: isObj(raw.themeColors) ? (raw.themeColors as unknown as ThemeColors) : null,
      items
    }
  }
}

const norm = (s: string | null | undefined): string => (s ?? '').replace(/\r\n?/g, '\n').replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').trim()
export const titleKey = (t: string): string => t.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
const ccliKey = (c: string | null | undefined): string => (c ?? '').replace(/\D/g, '')

/** Same song (by CCLI number when both have one, else by title)? */
export function sameSong(local: Pick<SongFull, 'title' | 'ccli'>, incoming: Pick<BundleSong, 'title' | 'ccli'>): boolean {
  const a = ccliKey(local.ccli)
  const b = ccliKey(incoming.ccli)
  if (a && b) return a === b
  return titleKey(local.title) === titleKey(incoming.title)
}

/** Do the words (or the arrangement/credits) on the USB copy differ from the booth copy? */
export function songContentDiffers(local: Pick<SongFull, 'author' | 'ccli' | 'copyright' | 'sections' | 'arrangement'>, incoming: BundleSong): boolean {
  const words = (secs: SongSection[]): string => [...secs].sort((x, y) => x.ordinal - y.ordinal).map((s) => `${s.kind}|${norm(s.label)}|${norm(s.lyrics)}`).join('\n§\n')
  if (words(local.sections) !== words(incoming.sections)) return true
  if (JSON.stringify(local.arrangement ?? null) !== JSON.stringify(incoming.arrangement ?? null)) return true
  if (norm(local.author) !== norm(incoming.author)) return true
  if (norm(local.copyright) !== norm(incoming.copyright)) return true
  return ccliKey(local.ccli) !== ccliKey(incoming.ccli)
}

export function songInputFrom(s: BundleSong, title = s.title): SongInput {
  return {
    title,
    author: s.author ?? undefined,
    ccli: s.ccli ?? undefined,
    copyright: s.copyright ?? undefined,
    publisher: s.publisher ?? undefined,
    background: s.background,
    sections: s.sections,
    arrangement: s.arrangement ?? undefined,
    fontScale: s.fontScale ?? undefined,
    linesPerSlide: s.linesPerSlide ?? undefined
  }
}

/** Absolute media paths referenced by the bundle (backgrounds, images) — to report the ones missing on this PC. */
export function referencedMediaPaths(bundle: ServiceBundle): string[] {
  const out = new Set<string>()
  const isPath = (v: unknown): v is string => typeof v === 'string' && /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/.test(v)
  for (const it of bundle.items) {
    for (const key of ['background', 'path', 'video', 'image']) if (isPath(it.payload[key])) out.add(it.payload[key] as string)
    if (it.song && isPath(it.song.background)) out.add(it.song.background)
  }
  if (bundle.theme && isPath(bundle.theme)) out.add(bundle.theme)
  return [...out]
}

/** A name that doesn't collide with an existing service ("Sunday" → "Sunday (2)"). */
export function uniqueServiceName(name: string, existing: readonly string[]): string {
  const taken = new Set(existing.map(titleKey))
  if (!taken.has(titleKey(name))) return name
  for (let n = 2; ; n++) {
    const candidate = `${name} (${n})`
    if (!taken.has(titleKey(candidate))) return candidate
  }
}

export interface ImportSummary {
  serviceName: string
  renamedFrom: string | null
  items: number
  skipped: string[]
  songsAdded: number
  songsMatched: number
  songsUpdated: string[]
  songsKept: string[]
  songsCopied: string[]
  missingMedia: string[]
}

/** One short paragraph for the operator. */
export function describeImport(s: ImportSummary): string {
  const parts = [`Imported “${s.serviceName}” — ${s.items} item${s.items === 1 ? '' : 's'}.`]
  if (s.renamedFrom) parts.push(`A service called “${s.renamedFrom}” already exists, so this copy is named “${s.serviceName}”.`)
  if (s.songsAdded) parts.push(`${s.songsAdded} new song${s.songsAdded === 1 ? '' : 's'} added to the library.`)
  if (s.songsUpdated.length) parts.push(`Updated from the file: ${s.songsUpdated.join(', ')}.`)
  if (s.songsCopied.length) parts.push(`Added as separate copies: ${s.songsCopied.join(', ')}.`)
  if (s.songsKept.length) parts.push(`Kept this computer’s version of: ${s.songsKept.join(', ')}.`)
  if (s.skipped.length) parts.push(`Skipped ${s.skipped.length}: ${s.skipped.join('; ')}.`)
  if (s.missingMedia.length) parts.push(`${s.missingMedia.length} background/image file${s.missingMedia.length === 1 ? ' isn’t' : 's aren’t'} on this computer: ${s.missingMedia.map((p) => p.split(/[\\/]/).pop()).join(', ')}.`)
  return parts.join(' ')
}
