// Parse, validate and plan a .wfservice import (QA B11, B12, B24).
//
// Before: a UTF-8 BOM (Windows Notepad's default) failed with a raw JSON
// error; a missing `name` threw an unhandled "tried to bind a value of an
// unknown type (undefined)" that the user never saw; unknown item types and
// `song: null` were imported silently; a song whose title already existed was
// silently replaced by the booth copy even when the USB copy had updated
// lyrics; `track` and zone routing were dropped; missing media went unnoticed.
import type { Announcement, AnnouncementInput, ItemStyle, ServiceItemType, SongFull, SongInput, SongSection, ThemeColors, TrackId, ZoneRouting } from './types'

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

// QA B2-N2: announcement items reference a library record (ref_id, or a
// block's payload.refIds) — the file used to carry only that id, so on the
// booth PC the item arrived empty and the summary said nothing. Exports now
// embed every referenced announcement under `announcements`, keyed by the id
// on the exporting PC; import matches or creates them and remaps the ids.
export interface BundleAnnouncement {
  title: string
  body: string
  display: 'slide' | 'ticker'
  background: string | null
  blurBehindText: boolean
  icon: string | null
  frequency: 'once' | 'recurring'
  startDate: string | null
  endDate: string | null
  active: boolean
}

/** Newest .wfservice layout this build writes and fully understands. */
export const BUNDLE_VERSION = 2

export interface BundleItem {
  type: ServiceItemType
  /** The library id on the exporting PC (announcements; songs are embedded in `song`). */
  ref_id: number | null
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
  /** Exporting PC's announcement id (as a string key) → the record (B2-N2). */
  announcements: Record<string, BundleAnnouncement>
}

export type ParseResult =
  | { ok: true; bundle: ServiceBundle; skipped: string[]; newerVersion: boolean }
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

function parseAnnouncement(v: unknown): BundleAnnouncement | null {
  if (!isObj(v)) return null
  const title = str(v.title)
  const body = str(v.body)
  if (title == null && body == null) return null
  return {
    title: title ?? '',
    body: body ?? '',
    display: v.display === 'ticker' ? 'ticker' : 'slide',
    background: str(v.background),
    blurBehindText: v.blurBehindText === true,
    icon: str(v.icon),
    frequency: v.frequency === 'recurring' ? 'recurring' : 'once',
    startDate: str(v.startDate),
    endDate: str(v.endDate),
    active: v.active !== false
  }
}

/** The announcement ids an item points at: a block's refIds, else its ref_id. */
export function announcementRefs(item: { type: string; ref_id: number | null; payload: Record<string, unknown> }): number[] {
  if (item.type !== 'announcement') return []
  const ids = Array.isArray(item.payload.refIds) ? (item.payload.refIds as unknown[]).filter((n): n is number => typeof n === 'number') : []
  const out = new Set(ids)
  if (item.ref_id != null) out.add(item.ref_id)
  return [...out]
}

/** Export side: the record to embed for one library announcement. */
export function bundleAnnouncementFrom(a: Announcement): BundleAnnouncement {
  return {
    title: a.title, body: a.body, display: a.display, background: a.background ?? null,
    blurBehindText: !!a.blurBehindText, icon: a.icon ?? null, frequency: a.frequency,
    startDate: a.startDate ?? null, endDate: a.endDate ?? null, active: a.active !== false
  }
}

export function announcementInputFrom(a: BundleAnnouncement): AnnouncementInput {
  return {
    title: a.title, body: a.body, display: a.display, background: a.background, blurBehindText: a.blurBehindText,
    icon: a.icon, frequency: a.frequency, startDate: a.startDate, endDate: a.endDate, active: a.active
  }
}

/** Same announcement already in the booth library? (title + words + display) */
export function sameAnnouncement(local: Pick<Announcement, 'title' | 'body' | 'display'>, incoming: BundleAnnouncement): boolean {
  return titleKey(local.title) === titleKey(incoming.title) && norm(local.body) === norm(incoming.body) && local.display === incoming.display
}

/**
 * Remap an announcement item's ids from the exporting PC onto this one.
 * Returns the new ref_id/payload, plus whether any referenced record was not
 * in the file (an older export) so the summary can say so.
 */
export function remapAnnouncementItem(
  item: Pick<BundleItem, 'type' | 'ref_id' | 'payload'>,
  idMap: ReadonlyMap<number, number>
): { ref_id: number | null; payload: Record<string, unknown>; missing: boolean } {
  const refs = announcementRefs(item)
  const missing = refs.some((id) => !idMap.has(id))
  const ref_id = item.ref_id != null ? (idMap.get(item.ref_id) ?? null) : null
  let payload = item.payload
  if (Array.isArray(item.payload.refIds)) {
    const mapped = (item.payload.refIds as unknown[])
      .filter((n): n is number => typeof n === 'number')
      .map((id) => idMap.get(id))
      .filter((n): n is number => n != null)
    payload = { ...item.payload, refIds: mapped }
  }
  return { ref_id, payload, missing }
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
      ref_id: type === 'announcement' ? num(it.ref_id) : null,
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
  const announcements: Record<string, BundleAnnouncement> = {}
  if (isObj(raw.announcements)) {
    for (const [key, v] of Object.entries(raw.announcements)) {
      const a = parseAnnouncement(v)
      if (a && /^\d+$/.test(key)) announcements[key] = a
    }
  }
  return {
    ok: true,
    skipped,
    // Info (QA B2-N9): a file from a newer WorshipFlow used to import silently.
    newerVersion: num(raw.version)! > BUNDLE_VERSION,
    bundle: {
      version: num(raw.version)!,
      name,
      service_date: str(raw.service_date),
      published_at: num(raw.published_at),
      team: raw.team ?? null,
      theme: str(raw.theme),
      themeColors: isObj(raw.themeColors) ? (raw.themeColors as unknown as ThemeColors) : null,
      items,
      announcements
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
  for (const a of Object.values(bundle.announcements ?? {})) {
    if (isPath(a.background)) out.add(a.background)
    if (isPath(a.icon)) out.add(a.icon)
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
  /** B2-N2: announcement records created in / matched to the booth library. */
  announcementsAdded?: number
  announcementsMatched?: number
  /** Announcement items whose text wasn't in the file (exported by an older version). */
  announcementsMissing?: string[]
  /** The file's version is newer than this build writes (B2-N9). */
  newerVersion?: boolean
}

/** One short paragraph for the operator. */
export function describeImport(s: ImportSummary): string {
  const parts = [`Imported “${s.serviceName}” — ${s.items} item${s.items === 1 ? '' : 's'}.`]
  if (s.newerVersion) parts.push('This file was made by a newer version of WorshipFlow — update this computer if anything looks missing.')
  if (s.renamedFrom) parts.push(`A service called “${s.renamedFrom}” already exists, so this copy is named “${s.serviceName}”.`)
  if (s.songsAdded) parts.push(`${s.songsAdded} new song${s.songsAdded === 1 ? '' : 's'} added to the library.`)
  if (s.songsUpdated.length) parts.push(`Updated from the file: ${s.songsUpdated.join(', ')}.`)
  if (s.songsCopied.length) parts.push(`Added as separate copies: ${s.songsCopied.join(', ')}.`)
  if (s.songsKept.length) parts.push(`Kept this computer’s version of: ${s.songsKept.join(', ')}.`)
  if (s.announcementsAdded) parts.push(`${s.announcementsAdded} announcement${s.announcementsAdded === 1 ? '' : 's'} added.`)
  if (s.announcementsMissing?.length) parts.push(`No announcement text in the file for ${s.announcementsMissing.map((t) => `“${t}”`).join(', ')} (saved by an older WorshipFlow) — pick the announcement again in Build service.`)
  if (s.skipped.length) parts.push(`Skipped ${s.skipped.length}: ${s.skipped.join('; ')}.`)
  if (s.missingMedia.length) parts.push(`${s.missingMedia.length} background/image file${s.missingMedia.length === 1 ? ' isn’t' : 's aren’t'} on this computer: ${s.missingMedia.map((p) => p.split(/[\\/]/).pop()).join(', ')}.`)
  return parts.join(' ')
}
