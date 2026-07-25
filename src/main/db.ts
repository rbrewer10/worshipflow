import { app } from 'electron'
import { join, dirname } from 'path'
import { readFileSync, writeFileSync, existsSync, copyFileSync, renameSync, unlinkSync } from 'fs'
import initSqlJs, { type Database } from 'sql.js'
import type {
  SongSummary,
  SongFull,
  SongSection,
  SongInput,
  ServiceSummary,
  ServiceItem,
  ServiceFull,
  NewServiceItem,
  SongUsage,
  ThemeColors,
  ItemStyle,
  ZoneRouting,
  TrackId,
  AnnouncementSummary,
  Announcement,
  AnnouncementInput,
  RecordingRow,
  RecordingMarker,
  RecordingMarkerInput
} from '../shared/types'
import { announcementMatchesDate, announcementExpired } from '../shared/announcementSchedule'
import { splitLyricLines } from '../shared/lyrics'

let db: Database
let dbPath = ''

const SCHEMA = `
CREATE TABLE IF NOT EXISTS song (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT,
  ccli TEXT,
  copyright TEXT,
  publisher TEXT,
  background TEXT,
  arrangement TEXT,
  font_scale REAL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS announcement (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  display TEXT NOT NULL DEFAULT 'slide',
  background TEXT,
  frequency TEXT NOT NULL DEFAULT 'recurring',
  start_date TEXT,
  end_date TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS setting (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS song_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id INTEGER,
  title TEXT NOT NULL,
  author TEXT,
  ccli TEXT,
  copyright TEXT,
  used_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS song_section (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id INTEGER NOT NULL REFERENCES song(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  label TEXT,
  ordinal INTEGER NOT NULL,
  lyrics TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS service (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  service_date TEXT,
  theme TEXT,
  theme_colors TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS service_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER NOT NULL REFERENCES service(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  type TEXT NOT NULL,
  ref_id INTEGER,
  payload_json TEXT
);
CREATE TABLE IF NOT EXISTS sound_check_automation_rule (
  id TEXT PRIMARY KEY,
  service_item_type TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT 1,
  scene_name_to_recall TEXT,
  fader_adjustments_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sound_check_reference_mix (
  id TEXT PRIMARY KEY,
  spectral_profile_json TEXT NOT NULL,
  recorded_at INTEGER NOT NULL,
  duration_seconds REAL NOT NULL,
  notes TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS service_template (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  items_json TEXT NOT NULL,
  theme TEXT,
  theme_colors_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS background_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL UNIQUE,
  tags_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS recording (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id            INTEGER,
  started_at            INTEGER NOT NULL,
  ended_at              INTEGER,
  file_path             TEXT,
  obs_record_started_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS recording_marker (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  recording_id INTEGER NOT NULL,
  item_id      INTEGER,
  kind         TEXT NOT NULL,
  label        TEXT NOT NULL,
  offset_ms    INTEGER NOT NULL
);
`

export async function initDb(): Promise<void> {
  const sqlDistDir = dirname(require.resolve('sql.js'))
  const SQL = await initSqlJs({ locateFile: (f) => join(sqlDistDir, f) })

  dbPath = join(app.getPath('userData'), 'worshipflow.db')
  db = existsSync(dbPath) ? new SQL.Database(readFileSync(dbPath)) : new SQL.Database()
  db.run('PRAGMA foreign_keys = ON;')
  db.run(SCHEMA)
  // Incremental migrations — safe to run on existing DBs.
  try { db.run('ALTER TABLE song ADD COLUMN background TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE song ADD COLUMN arrangement TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE song ADD COLUMN font_scale REAL') } catch { /* already exists */ }
  try { db.run('ALTER TABLE song ADD COLUMN lines_per_slide INTEGER') } catch { /* already exists */ }
  try { db.run('ALTER TABLE song ADD COLUMN copyright TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE song ADD COLUMN publisher TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE song ADD COLUMN bg_motion TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE song ADD COLUMN text_color TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE song ADD COLUMN font TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE song ADD COLUMN blur_behind_text INTEGER') } catch { /* already exists */ }
  try { db.run('ALTER TABLE announcement ADD COLUMN blur_behind_text INTEGER') } catch { /* already exists */ }
  try { db.run('ALTER TABLE service_item ADD COLUMN notes TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE service ADD COLUMN theme TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE service ADD COLUMN theme_colors TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE service_item ADD COLUMN style TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE service_item ADD COLUMN zone_routing TEXT') } catch { /* already exists */ }
  try { db.run("ALTER TABLE service_item ADD COLUMN track TEXT NOT NULL DEFAULT 'main'") } catch { /* already exists */ }
  try { db.run('ALTER TABLE service ADD COLUMN zone_track_assignment TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE recording ADD COLUMN output_path TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE recording ADD COLUMN render_state TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE recording ADD COLUMN transcript TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE recording ADD COLUMN ai_title TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE recording ADD COLUMN ai_description TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE recording ADD COLUMN chapters TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE recording ADD COLUMN srt_path TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE recording ADD COLUMN thumbnail_path TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE recording ADD COLUMN ai_state TEXT') } catch { /* already exists */ }
  normalizeSectionLyrics()
  persist()
}

// One-time (idempotent) pass that re-splits over-long single-line verses into
// phrase lines so existing songs display as several readable slides instead of one
// oversized block. Only rows whose text actually changes are rewritten.
function normalizeSectionLyrics(): void {
  const rows: { id: number; lyrics: string }[] = []
  const stmt = db.prepare('SELECT id, lyrics FROM song_section')
  while (stmt.step()) rows.push(stmt.getAsObject() as unknown as { id: number; lyrics: string })
  stmt.free()
  for (const row of rows) {
    const next = splitLyricLines(row.lyrics ?? '')
    if (next !== row.lyrics) {
      db.run('UPDATE song_section SET lyrics = ? WHERE id = ?', [next, row.id])
    }
  }
}

// Registered by the main process so a failed save (disk full, file locked by
// Google Drive/antivirus, permission denied) can be surfaced to the operator
// instead of only logging to the invisible console.
let persistErrorHandler: ((err: unknown) => void) | null = null
export function onPersistError(cb: (err: unknown) => void): void {
  persistErrorHandler = cb
}

function persist(): void {
  if (!dbPath) return
  const tmpPath = `${dbPath}.tmp`
  const bakPath = `${dbPath}.bak`

  try {
    writeFileSync(tmpPath, Buffer.from(db.export()))
    if (existsSync(dbPath)) {
      copyFileSync(dbPath, bakPath)
    }
    renameSync(tmpPath, dbPath)
  } catch (err) {
    console.error('Persist failed:', err)
    if (existsSync(tmpPath)) unlinkSync(tmpPath)
    try { persistErrorHandler?.(err) } catch { /* never let notification break persist */ }
    throw err
  }
}

export function listSongs(search = ''): SongSummary[] {
  const sql = search
    ? `SELECT DISTINCT s.id, s.title, s.author, s.background FROM song s
       LEFT JOIN song_section sec ON sec.song_id = s.id
       WHERE s.title LIKE $q OR s.author LIKE $q OR sec.lyrics LIKE $q
       ORDER BY s.title COLLATE NOCASE`
    : `SELECT id, title, author, background FROM song ORDER BY title COLLATE NOCASE`

  const stmt = db.prepare(sql)
  if (search) stmt.bind({ $q: `%${search}%` })
  const rows: SongSummary[] = []
  while (stmt.step()) rows.push(stmt.getAsObject() as unknown as SongSummary)
  stmt.free()
  return rows
}

export function getSong(id: number): SongFull | null {
  const head = db.prepare(
    'SELECT id, title, author, ccli, copyright, publisher, background, arrangement, font_scale, lines_per_slide, bg_motion, text_color, font, blur_behind_text FROM song WHERE id = ?'
  )
  head.bind([id])
  if (!head.step()) {
    head.free()
    return null
  }
  const row = head.getAsObject() as {
    id: number
    title: string
    author: string | null
    ccli: string | null
    copyright: string | null
    publisher: string | null
    background: string | null
    arrangement: string | null
    font_scale: number | null
    lines_per_slide: number | null
    bg_motion: string | null
    text_color: string | null
    font: string | null
    blur_behind_text: number | null
  }
  head.free()

  const secStmt = db.prepare(
    'SELECT id, kind, label, ordinal, lyrics FROM song_section WHERE song_id = ? ORDER BY ordinal'
  )
  secStmt.bind([id])
  const sections: SongSection[] = []
  while (secStmt.step()) sections.push(secStmt.getAsObject() as unknown as SongSection)
  secStmt.free()

  let arrangement: number[] | null = null
  try {
    arrangement = row.arrangement ? (JSON.parse(row.arrangement) as number[]) : null
  } catch (err) {
    console.error(`Failed to parse song arrangement for id=${id}:`, err)
    arrangement = null
  }
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    ccli: row.ccli,
    copyright: row.copyright,
    publisher: row.publisher,
    background: row.background,
    arrangement,
    fontScale: row.font_scale ?? null,
    linesPerSlide: row.lines_per_slide ?? null,
    bgMotion: (row.bg_motion as SongFull['bgMotion']) ?? null,
    textColor: row.text_color ?? null,
    font: (row.font as SongFull['font']) ?? null,
    blurBehindText: row.blur_behind_text === 1,
    sections
  }
}

export function createSong(input: SongInput): number {
  db.run('BEGIN')
  try {
    db.run(
      'INSERT INTO song (title, author, ccli, copyright, publisher, background, arrangement, font_scale, lines_per_slide, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [
        input.title,
        input.author ?? null,
        input.ccli ?? null,
        input.copyright ?? null,
        input.publisher ?? null,
        input.background ?? null,
        input.arrangement && input.arrangement.length > 0 ? JSON.stringify(input.arrangement) : null,
        input.fontScale ?? null,
        input.linesPerSlide ?? null,
        Date.now()
      ]
    )
    const id = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0] as number
    input.sections.forEach((sec, i) => {
      db.run('INSERT INTO song_section (song_id, kind, label, ordinal, lyrics) VALUES (?,?,?,?,?)', [
        id,
        sec.kind,
        sec.label ?? null,
        sec.ordinal ?? i,
        splitLyricLines(sec.lyrics)
      ])
    })
    db.run('COMMIT')
    persist()
    return id
  } catch (e) {
    db.run('ROLLBACK')
    throw e
  }
}

export function deleteSong(id: number): void {
  db.run('DELETE FROM song WHERE id = ?', [id])
  persist()
}

export function updateSong(id: number, input: SongInput): void {
  db.run('BEGIN')
  try {
    db.run(
      'UPDATE song SET title = ?, author = ?, ccli = ?, copyright = ?, publisher = ?, arrangement = ?, font_scale = ?, lines_per_slide = ?, bg_motion = ?, text_color = ?, font = ?, blur_behind_text = ? WHERE id = ?',
      [
        input.title,
        input.author ?? null,
        input.ccli ?? null,
        input.copyright ?? null,
        input.publisher ?? null,
        input.arrangement && input.arrangement.length > 0 ? JSON.stringify(input.arrangement) : null,
        input.fontScale ?? null,
        input.linesPerSlide ?? null,
        input.bgMotion ?? null,
        input.textColor ?? null,
        input.font ?? null,
        input.blurBehindText ? 1 : 0,
        id
      ]
    )
    db.run('DELETE FROM song_section WHERE song_id = ?', [id])
    input.sections.forEach((sec, i) => {
      db.run('INSERT INTO song_section (song_id, kind, label, ordinal, lyrics) VALUES (?,?,?,?,?)', [
        id,
        sec.kind,
        sec.label ?? null,
        sec.ordinal ?? i,
        splitLyricLines(sec.lyrics)
      ])
    })
    db.run('COMMIT')
    persist()
  } catch (e) {
    db.run('ROLLBACK')
    throw e
  }
}

export function setSongBackground(id: number, path: string | null): void {
  db.run('UPDATE song SET background = ? WHERE id = ?', [path, id])
  persist()
}

export function setSongFontScale(id: number, scale: number): void {
  db.run('UPDATE song SET font_scale = ? WHERE id = ?', [scale, id])
  persist()
}

export function setSongBgMotion(id: number, motion: string | null): void {
  db.run('UPDATE song SET bg_motion = ? WHERE id = ?', [motion, id])
  persist()
}

export function setSongTextColor(id: number, color: string | null): void {
  db.run('UPDATE song SET text_color = ? WHERE id = ?', [color, id]); persist()
}

export function setSongFont(id: number, font: string | null): void {
  db.run('UPDATE song SET font = ? WHERE id = ?', [font, id]); persist()
}

export function setSongBlurBehindText(id: number, value: boolean): void {
  db.run('UPDATE song SET blur_behind_text = ? WHERE id = ?', [value ? 1 : 0, id]); persist()
}

// --- Services ---

function songTitle(id: number): string | null {
  const stmt = db.prepare('SELECT title FROM song WHERE id = ?')
  stmt.bind([id])
  const t = stmt.step() ? (stmt.getAsObject().title as string) : null
  stmt.free()
  return t
}

function fmtSeconds(s: number): string {
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function rowToAnnouncement(r: {
  id: number; title: string; body: string; display: string; background: string | null
  frequency: string; start_date: string | null; end_date: string | null; active: number
  blur_behind_text: number | null
}): Announcement {
  const startDate = r.start_date ?? null
  const endDate = r.end_date ?? null
  const frequency = (r.frequency === 'once' ? 'once' : 'recurring') as Announcement['frequency']
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    display: (r.display === 'ticker' ? 'ticker' : 'slide') as Announcement['display'],
    background: r.background ?? null,
    blurBehindText: r.blur_behind_text === 1,
    frequency,
    startDate,
    endDate,
    active: r.active !== 0,
    expired: announcementExpired({ frequency, startDate, endDate }, todayIso())
  }
}

export function listAnnouncements(search = ''): AnnouncementSummary[] {
  const sql = search
    ? `SELECT id, title, body, display, background, frequency, start_date, end_date, active
       FROM announcement WHERE title LIKE $q OR body LIKE $q ORDER BY title COLLATE NOCASE`
    : `SELECT id, title, body, display, background, frequency, start_date, end_date, active
       FROM announcement ORDER BY title COLLATE NOCASE`
  const stmt = db.prepare(sql)
  if (search) stmt.bind({ $q: `%${search}%` })
  const rows: AnnouncementSummary[] = []
  while (stmt.step()) {
    const a = rowToAnnouncement(stmt.getAsObject() as never)
    rows.push({
      id: a.id, title: a.title, display: a.display, frequency: a.frequency,
      startDate: a.startDate, endDate: a.endDate, active: a.active, expired: a.expired
    })
  }
  stmt.free()
  return rows
}

export function getAnnouncement(id: number): Announcement | null {
  const stmt = db.prepare(
    'SELECT id, title, body, display, background, frequency, start_date, end_date, active, blur_behind_text FROM announcement WHERE id = ?'
  )
  stmt.bind([id])
  if (!stmt.step()) { stmt.free(); return null }
  const a = rowToAnnouncement(stmt.getAsObject() as never)
  stmt.free()
  return a
}

export function createAnnouncement(input: AnnouncementInput): number {
  db.run(
    'INSERT INTO announcement (title, body, display, background, blur_behind_text, frequency, start_date, end_date, active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [
      input.title,
      input.body,
      input.display,
      input.background ?? null,
      input.blurBehindText ? 1 : 0,
      input.frequency,
      input.startDate ?? null,
      input.endDate ?? null,
      input.active === false ? 0 : 1,
      Date.now()
    ]
  )
  const id = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0] as number
  persist()
  return id
}

export function updateAnnouncement(id: number, input: AnnouncementInput): void {
  db.run(
    'UPDATE announcement SET title = ?, body = ?, display = ?, background = ?, blur_behind_text = ?, frequency = ?, start_date = ?, end_date = ?, active = ? WHERE id = ?',
    [
      input.title,
      input.body,
      input.display,
      input.background ?? null,
      input.blurBehindText ? 1 : 0,
      input.frequency,
      input.startDate ?? null,
      input.endDate ?? null,
      input.active === false ? 0 : 1,
      id
    ]
  )
  persist()
}

export function deleteAnnouncement(id: number): void {
  db.run('DELETE FROM announcement WHERE id = ?', [id])
  persist()
}

// Active announcements whose schedule covers `serviceDate` (ISO YYYY-MM-DD).
export function listScheduledAnnouncements(serviceDate: string): AnnouncementSummary[] {
  return listAnnouncements().filter((a) =>
    announcementMatchesDate(
      { active: a.active, frequency: a.frequency, startDate: a.startDate, endDate: a.endDate },
      serviceDate
    )
  )
}

export function announcementTitle(id: number): string | null {
  const stmt = db.prepare('SELECT title FROM announcement WHERE id = ?')
  stmt.bind([id])
  const title = stmt.step() ? (stmt.getAsObject().title as string) : null
  stmt.free()
  return title
}

function itemTitle(type: string, refId: number | null, payload: Record<string, unknown>): string {
  if (type === 'song' && refId) return songTitle(refId) ?? 'Song (missing)'
  if (type === 'announcement' && refId) return announcementTitle(refId) ?? 'Announcement (missing)'
  if (type === 'text') return (payload.title as string) || 'Text slide'
  if (type === 'scripture') return (payload.reference as string) || 'Scripture'
  if (type === 'countdown') return `Countdown ${fmtSeconds((payload.seconds as number) || 0)}`
  if (type === 'welcome') return `Countdown ${fmtSeconds((payload.seconds as number) || 0)}`
  if (type === 'sermon') return (payload.title as string) || 'Sermon'
  if (type === 'image') {
    const p = (payload.path as string) || ''
    return p.split(/[/\\]/).pop() || 'Image'
  }
  return type
}

export function listServices(): ServiceSummary[] {
  const stmt = db.prepare('SELECT id, name, service_date FROM service ORDER BY created_at DESC')
  const rows: ServiceSummary[] = []
  while (stmt.step()) rows.push(stmt.getAsObject() as unknown as ServiceSummary)
  stmt.free()
  return rows
}

export function createService(name: string, serviceDate?: string): number {
  db.run('INSERT INTO service (name, service_date, created_at) VALUES (?,?,?)', [
    name,
    serviceDate ?? null,
    Date.now()
  ])
  const id = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0] as number
  persist()
  return id
}

export function deleteService(id: number): void {
  db.run('DELETE FROM service WHERE id = ?', [id])
  persist()
}

export function getService(id: number): ServiceFull | null {
  const head = db.prepare('SELECT id, name, service_date, theme, theme_colors FROM service WHERE id = ?')
  head.bind([id])
  if (!head.step()) {
    head.free()
    return null
  }
  const row = head.getAsObject() as unknown as {
    id: number; name: string; service_date: string | null; theme: string | null; theme_colors: string | null
  }
  head.free()
  let themeColors: ThemeColors | null = null
  try {
    themeColors = row.theme_colors ? (JSON.parse(row.theme_colors) as ThemeColors) : null
  } catch (err) {
    console.error(`Failed to parse service theme colors for id=${id}:`, err)
    themeColors = null
  }

  const svc: ServiceSummary & { theme: string | null; themeColors: ThemeColors | null } = {
    id: row.id,
    name: row.name,
    service_date: row.service_date ?? null,
    theme: row.theme ?? null,
    themeColors
  }

  const stmt = db.prepare(
    'SELECT id, ordinal, type, ref_id, payload_json, notes, style, zone_routing, track FROM service_item WHERE service_id = ? ORDER BY ordinal'
  )
  stmt.bind([id])
  const items: ServiceItem[] = []
  while (stmt.step()) {
    const r = stmt.getAsObject() as {
      id: number
      ordinal: number
      type: string
      ref_id: number | null
      payload_json: string | null
      notes: string | null
      style: string | null
      zone_routing: string | null
      track: string
    }

    let payload: Record<string, unknown> = {}
    try {
      payload = r.payload_json ? JSON.parse(r.payload_json) : {}
    } catch (err) {
      console.error(`Failed to parse service item payload for id=${r.id}:`, err)
      payload = {}
    }

    let style: ItemStyle | null = null
    try {
      style = r.style ? (JSON.parse(r.style) as ItemStyle) : null
    } catch (err) {
      console.error(`Failed to parse service item style for id=${r.id}:`, err)
      style = null
    }

    let zoneRouting: ZoneRouting | null = null
    try {
      zoneRouting = r.zone_routing ? (JSON.parse(r.zone_routing) as ZoneRouting) : null
    } catch (err) {
      console.error(`Failed to parse zone routing for id=${r.id}:`, err)
      zoneRouting = null
    }

    items.push({
      id: r.id,
      ordinal: r.ordinal,
      type: r.type as ServiceItem['type'],
      ref_id: r.ref_id,
      payload,
      title: itemTitle(r.type, r.ref_id, payload),
      notes: r.notes ?? null,
      style,
      zoneRouting,
      track: (r.track === 'second' ? 'second' : 'main') as TrackId
    })
  }
  stmt.free()
  return { ...svc, items }
}

export function addServiceItem(serviceId: number, item: NewServiceItem): number {
  const track: TrackId = item.track ?? 'main'
  const next = db.exec('SELECT COALESCE(MAX(ordinal), -1) + 1 AS n FROM service_item WHERE service_id = ? AND track = ?', [
    serviceId,
    track
  ])
  const ordinal = (next.length ? (next[0].values[0][0] as number) : 0) || 0
  db.run('INSERT INTO service_item (service_id, ordinal, type, ref_id, payload_json, track) VALUES (?,?,?,?,?,?)', [
    serviceId,
    ordinal,
    item.type,
    item.ref_id ?? null,
    JSON.stringify(item.payload ?? {}),
    track
  ])
  const id = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0] as number
  persist()
  return id
}

export function removeServiceItem(itemId: number): void {
  db.run('DELETE FROM service_item WHERE id = ?', [itemId])
  persist()
}

export function moveServiceItem(itemId: number, dir: 'up' | 'down'): void {
  const cur = db.prepare('SELECT ordinal, service_id, track FROM service_item WHERE id = ?')
  cur.bind([itemId])
  if (!cur.step()) {
    cur.free()
    return
  }
  const { ordinal, service_id, track } = cur.getAsObject() as { ordinal: number; service_id: number; track: string }
  cur.free()

  const nb = db.prepare(
    dir === 'up'
      ? 'SELECT id, ordinal FROM service_item WHERE service_id = ? AND track = ? AND ordinal < ? ORDER BY ordinal DESC LIMIT 1'
      : 'SELECT id, ordinal FROM service_item WHERE service_id = ? AND track = ? AND ordinal > ? ORDER BY ordinal ASC LIMIT 1'
  )
  nb.bind([service_id, track, ordinal])
  if (!nb.step()) {
    nb.free()
    return
  }
  const neighbor = nb.getAsObject() as { id: number; ordinal: number }
  nb.free()

  db.run('UPDATE service_item SET ordinal = ? WHERE id = ?', [neighbor.ordinal, itemId])
  db.run('UPDATE service_item SET ordinal = ? WHERE id = ?', [ordinal, neighbor.id])
  persist()
}

export function updateServiceItemNotes(itemId: number, notes: string | null): void {
  db.run('UPDATE service_item SET notes = ? WHERE id = ?', [notes, itemId])
  persist()
}

export function setServiceTheme(serviceId: number, themeId: string | null, colors: ThemeColors | null): void {
  db.run('UPDATE service SET theme = ?, theme_colors = ? WHERE id = ?', [
    themeId,
    colors ? JSON.stringify(colors) : null,
    serviceId
  ])
  persist()
}

export function setServiceItemStyle(itemId: number, style: ItemStyle | null): void {
  db.run('UPDATE service_item SET style = ? WHERE id = ?', [style ? JSON.stringify(style) : null, itemId])
  persist()
}

export function setServiceItemPayload(itemId: number, payload: Record<string, unknown>): void {
  db.run('UPDATE service_item SET payload_json = ? WHERE id = ?', [JSON.stringify(payload ?? {}), itemId])
  persist()
}

export function getItemZoneRouting(itemId: number): string | null {
  const rows = db.exec('SELECT zone_routing FROM service_item WHERE id = ?', [itemId])
  if (!rows.length || !rows[0].values.length) return null
  return (rows[0].values[0][0] as string | null) ?? null
}

export function setItemZoneRouting(itemId: number, routing: string | null): void {
  db.run('UPDATE service_item SET zone_routing = ? WHERE id = ?', [routing, itemId])
  persist()
}

// Raw JSON string, same convention as getItemZoneRouting/setItemZoneRouting —
// parsing/defaulting happens in main/index.ts via the shared parseZoneTrackAssignment.
export function getZoneTrackAssignment(serviceId: number): string | null {
  const rows = db.exec('SELECT zone_track_assignment FROM service WHERE id = ?', [serviceId])
  if (!rows.length || !rows[0].values.length) return null
  return (rows[0].values[0][0] as string | null) ?? null
}

export function setZoneTrackAssignment(serviceId: number, json: string | null): void {
  db.run('UPDATE service SET zone_track_assignment = ? WHERE id = ?', [json, serviceId])
  persist()
}

export function reorderServiceItems(serviceId: number, track: string, orderedIds: number[]): void {
  db.run('BEGIN')
  try {
    orderedIds.forEach((id, i) => {
      db.run('UPDATE service_item SET ordinal = ? WHERE id = ? AND service_id = ? AND track = ?', [i, id, serviceId, track])
    })
    db.run('COMMIT')
    persist()
  } catch (e) {
    db.run('ROLLBACK')
    throw e
  }
}

// --- Settings (key/value, e.g. church CCLI license number) ---

export function getSetting(key: string): string | null {
  const stmt = db.prepare('SELECT value FROM setting WHERE key = ?')
  stmt.bind([key])
  const v = stmt.step() ? (stmt.getAsObject().value as string) : null
  stmt.free()
  return v
}

export function setSetting(key: string, value: string | null): void {
  if (value == null) db.run('DELETE FROM setting WHERE key = ?', [key])
  else db.run('INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?', [key, value, value])
  persist()
}

// --- CCLI song usage log ---

export function recordSongUsage(u: {
  songId: number | null
  title: string
  author: string | null
  ccli: string | null
  copyright: string | null
}): void {
  db.run(
    'INSERT INTO song_usage (song_id, title, author, ccli, copyright, used_at) VALUES (?,?,?,?,?,?)',
    [u.songId, u.title, u.author, u.ccli, u.copyright, Date.now()]
  )
  persist()
}

export function listSongUsage(): SongUsage[] {
  const stmt = db.prepare(
    'SELECT id, song_id, title, author, ccli, copyright, used_at FROM song_usage ORDER BY used_at DESC'
  )
  const rows: SongUsage[] = []
  while (stmt.step()) {
    const r = stmt.getAsObject() as {
      id: number
      song_id: number | null
      title: string
      author: string | null
      ccli: string | null
      copyright: string | null
      used_at: number
    }
    rows.push({
      id: r.id,
      songId: r.song_id,
      title: r.title,
      author: r.author,
      ccli: r.ccli,
      copyright: r.copyright,
      usedAt: r.used_at
    })
  }
  stmt.free()
  return rows
}

export function clearSongUsage(): void {
  db.run('DELETE FROM song_usage')
  persist()
}

// Sound Check: Automation Rules (SQLite persistence)
export interface StoredAutomationRule {
  id: string
  service_item_type: string
  enabled: boolean
  scene_name_to_recall?: string
  fader_adjustments?: Array<{ channelId: number; deltaDb: number }>
  created_at: number
}

export function loadAutomationRules(): StoredAutomationRule[] {
  const stmt = db.prepare('SELECT * FROM sound_check_automation_rule ORDER BY created_at DESC')
  const rows: StoredAutomationRule[] = []
  while (stmt.step()) {
    try {
      const r = stmt.getAsObject() as any
      rows.push({
        id: r.id,
        service_item_type: r.service_item_type,
        enabled: !!r.enabled,
        ...(r.scene_name_to_recall && { scene_name_to_recall: r.scene_name_to_recall }),
        ...(r.fader_adjustments_json && { fader_adjustments: JSON.parse(r.fader_adjustments_json) }),
        created_at: r.created_at
      })
    } catch (err) {
      console.error('[db] Failed to parse automation rule:', err)
    }
  }
  stmt.free()
  return rows
}

export function saveAutomationRule(rule: {
  id: string
  serviceItemType: string
  enabled: boolean
  sceneNameToRecall?: string
  faderAdjustments?: Array<{ channelId: number; deltaDb: number }>
}): void {
  try {
    const now = Date.now()
    db.run(
      `INSERT OR REPLACE INTO sound_check_automation_rule
       (id, service_item_type, enabled, scene_name_to_recall, fader_adjustments_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        rule.id,
        rule.serviceItemType,
        rule.enabled ? 1 : 0,
        rule.sceneNameToRecall || null,
        rule.faderAdjustments ? JSON.stringify(rule.faderAdjustments) : null,
        now
      ]
    )
    persist()
  } catch (err) {
    console.error('[db] Failed to save automation rule:', err)
    throw err
  }
}

export function deleteAutomationRule(id: string): void {
  try {
    db.run('DELETE FROM sound_check_automation_rule WHERE id = ?', [id])
    persist()
  } catch (err) {
    console.error('[db] Failed to delete automation rule:', err)
    throw err
  }
}

// Sound Check: Reference Mixes (SQLite persistence)
export interface StoredReferenceMix {
  id: string
  spectral_profile: { low: number; mid: number; high: number; presence: number; dynamicRange: number }
  recorded_at: number
  duration_seconds: number
  notes?: string
  created_at: number
}

export function loadReferenceMixes(): StoredReferenceMix[] {
  const stmt = db.prepare('SELECT * FROM sound_check_reference_mix ORDER BY recorded_at DESC')
  const rows: StoredReferenceMix[] = []
  while (stmt.step()) {
    try {
      const r = stmt.getAsObject() as any
      rows.push({
        id: r.id,
        spectral_profile: JSON.parse(r.spectral_profile_json),
        recorded_at: r.recorded_at,
        duration_seconds: r.duration_seconds,
        ...(r.notes && { notes: r.notes }),
        created_at: r.created_at
      })
    } catch (err) {
      console.error('[db] Failed to parse reference mix:', err)
    }
  }
  stmt.free()
  return rows
}

export function saveReferenceMix(mix: {
  id: string
  spectralProfile: { low: number; mid: number; high: number; presence: number; dynamicRange: number }
  recordedAt: Date
  durationSeconds: number
  notes?: string
}): void {
  try {
    const now = Date.now()
    db.run(
      `INSERT OR REPLACE INTO sound_check_reference_mix
       (id, spectral_profile_json, recorded_at, duration_seconds, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        mix.id,
        JSON.stringify(mix.spectralProfile),
        mix.recordedAt.getTime(),
        mix.durationSeconds,
        mix.notes || null,
        now
      ]
    )
    persist()
  } catch (err) {
    console.error('[db] Failed to save reference mix:', err)
    throw err
  }
}

// --- Service Templates ---
export interface ServiceTemplate {
  id: string
  name: string
  description?: string
  items: ServiceItem[]
  theme: string | null
  themeColors: ThemeColors | null
  createdAt: number
}

export function listServiceTemplates(): ServiceTemplate[] {
  const stmt = db.prepare('SELECT * FROM service_template ORDER BY created_at DESC')
  const templates: ServiceTemplate[] = []
  while (stmt.step()) {
    try {
      const r = stmt.getAsObject() as any
      templates.push({
        id: r.id,
        name: r.name,
        description: r.description,
        items: JSON.parse(r.items_json),
        theme: r.theme,
        themeColors: r.theme_colors_json ? JSON.parse(r.theme_colors_json) : null,
        createdAt: r.created_at
      })
    } catch (err) {
      console.error('[db] Failed to parse service template:', err)
    }
  }
  stmt.free()
  return templates
}

export function saveServiceTemplate(template: {
  id: string
  name: string
  description?: string
  items: ServiceItem[]
  theme: string | null
  themeColors: ThemeColors | null
}): void {
  try {
    const now = Date.now()
    db.run(
      `INSERT OR REPLACE INTO service_template
       (id, name, description, items_json, theme, theme_colors_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        template.id,
        template.name,
        template.description || null,
        JSON.stringify(template.items),
        template.theme,
        template.themeColors ? JSON.stringify(template.themeColors) : null,
        now
      ]
    )
    persist()
    console.log(`[db] Saved service template: ${template.name}`)
  } catch (err) {
    console.error('[db] Failed to save service template:', err)
    throw err
  }
}

export function deleteServiceTemplate(id: string): void {
  try {
    db.run('DELETE FROM service_template WHERE id = ?', [id])
    persist()
    console.log(`[db] Deleted service template: ${id}`)
  } catch (err) {
    console.error('[db] Failed to delete service template:', err)
    throw err
  }
}

// --- Background Tags ---
export function getBackgroundTags(filePath: string): string[] {
  try {
    const stmt = db.prepare('SELECT tags_json FROM background_tags WHERE file_path = ?')
    stmt.bind([filePath])
    if (stmt.step()) {
      const r = stmt.getAsObject() as any
      const tags = JSON.parse(r.tags_json) as string[]
      stmt.free()
      return tags
    }
    stmt.free()
    return []
  } catch (err) {
    console.error('[db] Failed to get background tags:', err)
    return []
  }
}

export function setBackgroundTags(filePath: string, tags: string[]): void {
  try {
    const now = Date.now()
    db.run(
      `INSERT OR REPLACE INTO background_tags (file_path, tags_json, created_at)
       VALUES (?, ?, ?)`,
      [filePath, JSON.stringify(tags), now]
    )
    persist()
    console.log(`[db] Set tags for background: ${tags.join(', ')}`)
  } catch (err) {
    console.error('[db] Failed to set background tags:', err)
    throw err
  }
}

export function searchBackgroundsByTags(searchTags: string[]): string[] {
  try {
    const stmt = db.prepare('SELECT file_path, tags_json FROM background_tags')
    const results: string[] = []
    while (stmt.step()) {
      const r = stmt.getAsObject() as any
      try {
        const tags = JSON.parse(r.tags_json) as string[]
        // Match if any search tag is in the background's tags (case-insensitive)
        const normalizedTags = tags.map((t) => t.toLowerCase())
        const matches = searchTags.some((st) =>
          normalizedTags.includes(st.toLowerCase())
        )
        if (matches) results.push(r.file_path)
      } catch {
        /* skip malformed tags */
      }
    }
    stmt.free()
    return results
  } catch (err) {
    console.error('[db] Failed to search backgrounds:', err)
    return []
  }
}

// --- Recordings (Phase 1) ---
export function createRecording(
  serviceId: number | null,
  startedAt: number,
  obsRecordStartedMs: number
): number {
  db.run(
    'INSERT INTO recording (service_id, started_at, obs_record_started_ms) VALUES (?, ?, ?)',
    [serviceId, startedAt, obsRecordStartedMs]
  )
  const id = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0] as number
  persist()
  return id
}

export function addRecordingMarker(recordingId: number, m: RecordingMarkerInput): void {
  db.run(
    'INSERT INTO recording_marker (recording_id, item_id, kind, label, offset_ms) VALUES (?, ?, ?, ?, ?)',
    [recordingId, m.itemId, m.kind, m.label, m.offsetMs]
  )
  persist()
}

export function finalizeRecording(recordingId: number, endedAt: number, filePath: string | null): void {
  db.run('UPDATE recording SET ended_at = ?, file_path = ? WHERE id = ?', [endedAt, filePath, recordingId])
  persist()
}

export function listRecordingMarkers(recordingId: number): RecordingMarker[] {
  const res = db.exec(
    'SELECT id, recording_id, item_id, kind, label, offset_ms FROM recording_marker WHERE recording_id = ? ORDER BY offset_ms ASC',
    [recordingId]
  )
  if (!res[0]) return []
  return res[0].values.map((r) => ({
    id: r[0] as number,
    recordingId: r[1] as number,
    itemId: r[2] as number | null,
    kind: r[3] as RecordingMarker['kind'],
    label: r[4] as string,
    offsetMs: r[5] as number
  }))
}

export function listRecordings(): RecordingRow[] {
  const res = db.exec(
    `SELECT r.id, r.service_id, r.started_at, r.ended_at, r.file_path, r.obs_record_started_ms,
            r.output_path, r.render_state,
            r.transcript, r.ai_title, r.ai_description, r.chapters, r.srt_path, r.thumbnail_path, r.ai_state,
            (SELECT COUNT(*) FROM recording_marker m WHERE m.recording_id = r.id) AS marker_count
       FROM recording r ORDER BY r.started_at DESC`
  )
  if (!res[0]) return []
  return res[0].values.map((r) => ({
    id: r[0] as number,
    serviceId: r[1] as number | null,
    startedAt: r[2] as number,
    endedAt: r[3] as number | null,
    filePath: r[4] as string | null,
    obsRecordStartedMs: r[5] as number,
    outputPath: r[6] as string | null,
    renderState: ((r[7] as string | null) ?? 'idle') as RecordingRow['renderState'],
    transcript: r[8] as string | null,
    aiTitle: r[9] as string | null,
    aiDescription: r[10] as string | null,
    chapters: r[11] as string | null,
    srtPath: r[12] as string | null,
    thumbnailPath: r[13] as string | null,
    aiState: ((r[14] as string | null) ?? 'idle') as RecordingRow['aiState'],
    markerCount: r[15] as number
  }))
}

export function getRecording(id: number): RecordingRow | null {
  const res = db.exec(
    `SELECT id, service_id, started_at, ended_at, file_path, obs_record_started_ms, output_path, render_state,
            transcript, ai_title, ai_description, chapters, srt_path, thumbnail_path, ai_state
       FROM recording WHERE id = ?`,
    [id]
  )
  if (!res[0] || res[0].values.length === 0) return null
  const r = res[0].values[0]
  return {
    id: r[0] as number,
    serviceId: r[1] as number | null,
    startedAt: r[2] as number,
    endedAt: r[3] as number | null,
    filePath: r[4] as string | null,
    obsRecordStartedMs: r[5] as number,
    outputPath: r[6] as string | null,
    renderState: ((r[7] as string | null) ?? 'idle') as RecordingRow['renderState'],
    transcript: r[8] as string | null,
    aiTitle: r[9] as string | null,
    aiDescription: r[10] as string | null,
    chapters: r[11] as string | null,
    srtPath: r[12] as string | null,
    thumbnailPath: r[13] as string | null,
    aiState: ((r[14] as string | null) ?? 'idle') as RecordingRow['aiState']
  }
}

export function setRecordingRender(id: number, state: RecordingRow['renderState'], outputPath?: string | null): void {
  if (outputPath === undefined) {
    db.run('UPDATE recording SET render_state = ? WHERE id = ?', [state, id])
  } else {
    db.run('UPDATE recording SET render_state = ?, output_path = ? WHERE id = ?', [state, outputPath, id])
  }
  persist()
}

export function setRecordingAi(id: number, fields: Partial<Pick<RecordingRow,
  'transcript' | 'aiTitle' | 'aiDescription' | 'chapters' | 'srtPath' | 'thumbnailPath' | 'aiState'>>): void {
  const map: Record<string, string> = {
    transcript: 'transcript', aiTitle: 'ai_title', aiDescription: 'ai_description',
    chapters: 'chapters', srtPath: 'srt_path', thumbnailPath: 'thumbnail_path', aiState: 'ai_state'
  }
  const cols = Object.keys(fields) as (keyof typeof map)[]
  if (cols.length === 0) return
  const sets = cols.map((k) => `${map[k]} = ?`).join(', ')
  const vals = cols.map((k) => (fields as Record<string, unknown>)[k] as string | null)
  db.run(`UPDATE recording SET ${sets} WHERE id = ?`, [...vals, id])
  persist()
}

// Reconcile any recording left open by a crash: mark it ended at `endedAt`.
export function closeDanglingRecordings(endedAt: number): void {
  db.run('UPDATE recording SET ended_at = ? WHERE ended_at IS NULL', [endedAt])
  persist()
}
