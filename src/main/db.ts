import { app, safeStorage } from 'electron'
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
  ServiceItemType,
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
  RecordingMarkerInput,
  ServiceTeam,
  ServicePerson
} from '../shared/types'
import { announcementMatchesDate, announcementExpired } from '../shared/announcementSchedule'
import { splitLyricLines } from '../shared/lyrics'
import type { ZoneSlide } from '../shared/zoneSlides'

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
  published_at INTEGER,
  team_json TEXT,
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
  try { db.run('ALTER TABLE service ADD COLUMN published_at INTEGER') } catch { /* already exists */ }
  try { db.run('ALTER TABLE service ADD COLUMN team_json TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE service_item ADD COLUMN style TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE service_item ADD COLUMN zone_routing TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE service_item ADD COLUMN zone_slides TEXT') } catch { /* already exists */ }
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
  // Unlike the other one-time passes here, this one genuinely needs a real
  // "have I already run" flag rather than re-inspecting content: its
  // "no blank line yet" heuristic only means "not yet migrated" for the
  // very first run. After Reflow ships, an ordinary freshly-typed section
  // with no blank line is simply a normal single slide — re-running the
  // heuristic on every startup would silently re-fragment it. See the
  // 2026-08-05 design spec.
  if (getSetting('reflow_migration_done') !== '1') {
    migrateReflowBreaks()
    setSetting('reflow_migration_done', '1')
  }
  normalizeTitles()
  clearSecondTrackAssignments()
  persist()
}

// Pure so it's unit-testable without a DB — trims and collapses internal
// whitespace, never touches actual wording/spelling (which needs a human
// read-through the audit itself couldn't safely automate either).
export function normalizeTitleText(title: string): string {
  return title.trim().replace(/\s+/g, ' ')
}

// One-time (idempotent) pass fixing whitespace cruft (leading/trailing,
// doubled internal spaces) in existing song/author/announcement titles — the
// audit found several already in the library from before createSong/
// createAnnouncement defensively trimmed on write. Only rows that actually
// change are rewritten, same idiom as normalizeSectionLyrics below.
// Repairs services left pointing a screen at the retired second track.
//
// The second track let a zone follow an independent second set of items. It was
// removed because no service in production ever had a single second-track item,
// while one service was left with Back Right assigned to it — and a zone
// following a track with no content renders the idle logo, so that screen just
// looked broken with nothing on screen to explain why. With the assignment UI
// gone there would be no way to undo it, so clear it here instead of stranding
// it. Idempotent: services already on all-main are left untouched.
function clearSecondTrackAssignments(): void {
  const rows: { id: number; value: string | null }[] = []
  const stmt = db.prepare('SELECT id, zone_track_assignment AS value FROM service WHERE zone_track_assignment IS NOT NULL')
  while (stmt.step()) rows.push(stmt.getAsObject() as unknown as { id: number; value: string | null })
  stmt.free()
  for (const row of rows) {
    if (row.value == null || !row.value.includes('second')) continue
    db.run('UPDATE service SET zone_track_assignment = NULL WHERE id = ?', [row.id])
  }
}

function normalizeTitles(): void {
  const targets: [string, string][] = [['song', 'title'], ['song', 'author'], ['announcement', 'title']]
  for (const [table, column] of targets) {
    const rows: { id: number; value: string | null }[] = []
    const stmt = db.prepare(`SELECT id, ${column} AS value FROM ${table}`)
    while (stmt.step()) rows.push(stmt.getAsObject() as unknown as { id: number; value: string | null })
    stmt.free()
    for (const row of rows) {
      if (row.value == null) continue
      const next = normalizeTitleText(row.value)
      if (next !== row.value) db.run(`UPDATE ${table} SET ${column} = ? WHERE id = ?`, [next, row.id])
    }
  }
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

// Old mechanical "every N lines is a slide" split, reproduced here ONLY for
// the one-time migration below — this is deliberately NOT part of the shared
// reflowText.ts module, since it represents retired behavior, not the new
// forward-looking rule. Mirrors exactly what songLines()/computeEditorSlides()
// used to do: trim and drop blank lines, then group every N.
function insertLegacySlideBreaks(lyrics: string, perSlide: number): string {
  if (perSlide <= 1) return lyrics
  const lines = lyrics.split('\n').map((l) => l.trim()).filter(Boolean)
  const groups: string[] = []
  for (let i = 0; i < lines.length; i += perSlide) groups.push(lines.slice(i, i + perSlide).join('\n'))
  return groups.join('\n\n')
}

// One-time pass converting existing songs from the old mechanical "every
// linesPerSlide lines" splitting to explicit blank-line slide breaks, so
// nothing changes visually after upgrading to Reflow-style editing. The
// caller (initDb()) gates this behind a real 'reflow_migration_done' setting
// flag rather than the content-inspection idiom this file's other one-time
// passes use — "does this section already have a blank line" is only a
// reliable proxy for "not yet migrated" on the very first run. Once Reflow
// ships, an ordinary freshly-typed section with no blank line is simply a
// normal single slide, not evidence of stale data; re-running this
// unconditionally would silently re-fragment it on every subsequent
// startup. The per-row "already has a break" check below is kept anyway as
// a cheap secondary guard, not the actual idempotency mechanism. Must run
// after normalizeSectionLyrics(): that function can re-wrap one long crammed
// line into several physical lines, and the mechanical split this
// reproduces has always operated on lyrics AFTER that normalization
// (songLines() ran after it too), so migrating before it would compute
// different break points than the old live behavior actually had.
function migrateReflowBreaks(): void {
  const rows: { id: number; lyrics: string; lines_per_slide: number | null }[] = []
  const stmt = db.prepare(
    'SELECT ss.id AS id, ss.lyrics AS lyrics, s.lines_per_slide AS lines_per_slide FROM song_section ss JOIN song s ON s.id = ss.song_id'
  )
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as unknown as { id: number; lyrics: string; lines_per_slide: number | null })
  }
  stmt.free()
  for (const row of rows) {
    const lyrics = row.lyrics ?? ''
    if (lyrics.trim() === '') continue
    const alreadyHasBreak = lyrics.split('\n').some((l) => l.trim() === '')
    if (alreadyHasBreak) continue
    const perSlide = row.lines_per_slide ?? 2
    const next = insertLegacySlideBreaks(lyrics, perSlide)
    if (next !== lyrics) {
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

// Shifts existing backup generations one slot older (bakPath -> .1, .1 -> .2,
// ...) before persist() overwrites bakPath with a fresh copy, so a single bad
// write can't destroy the only "last known good" copy on the very next save.
// renameSync overwrites an existing destination on both POSIX and Windows, so
// the oldest generation (index `keep - 1`) is dropped automatically once it's
// overwritten rather than needing an explicit delete. Processed from the
// oldest slot inward so an in-progress shift never clobbers a file it still
// needs to read from. Exported (like normalizeTitleText) purely so it's
// unit-testable without spinning up a full sql.js database.
export function rotateBackupGenerations(bakPath: string, keep = 3): void {
  for (let gen = keep - 1; gen >= 1; gen--) {
    const src = gen === 1 ? bakPath : `${bakPath}.${gen - 1}`
    const dst = `${bakPath}.${gen}`
    if (existsSync(src)) {
      renameSync(src, dst)
    }
  }
}

function persist(): void {
  if (!dbPath) return
  const tmpPath = `${dbPath}.tmp`
  const bakPath = `${dbPath}.bak`

  try {
    writeFileSync(tmpPath, Buffer.from(db.export()))
    if (existsSync(dbPath)) {
      rotateBackupGenerations(bakPath)
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
        normalizeTitleText(input.title),
        input.author ? normalizeTitleText(input.author) : null,
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
      'UPDATE song SET title = ?, author = ?, ccli = ?, copyright = ?, publisher = ?, background = ?, arrangement = ?, font_scale = ?, lines_per_slide = ?, bg_motion = ?, text_color = ?, font = ?, blur_behind_text = ? WHERE id = ?',
      [
        normalizeTitleText(input.title),
        input.author ? normalizeTitleText(input.author) : null,
        input.ccli ?? null,
        input.copyright ?? null,
        input.publisher ?? null,
        input.background ?? null,
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
      normalizeTitleText(input.title),
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
      normalizeTitleText(input.title),
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
  if (type === 'header') return (payload.label as string) || 'Section'
  if (type === 'placeholder') return (payload.label as string) || 'Placeholder — TBD'
  return type
}

export function listServices(): ServiceSummary[] {
  const stmt = db.prepare('SELECT id, name, service_date, published_at FROM service ORDER BY created_at DESC')
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

export function setServicePublished(id: number, publishedAt: number | null): void {
  db.run('UPDATE service SET published_at = ? WHERE id = ?', [publishedAt, id])
  persist()
}

// Publishing is a handoff point, not a permanent label. Any later change to
// the order, content, styling, date, or team returns the plan to draft so the
// home screen and review step cannot imply that the published handoff is still
// current.
function markServiceDraft(serviceId: number): void {
  db.run('UPDATE service SET published_at = NULL WHERE id = ?', [serviceId])
}

export function getServiceTeam(id: number): ServiceTeam {
  const rows = db.exec('SELECT team_json FROM service WHERE id = ?', [id])
  if (!rows[0] || rows[0].values.length === 0) return { people: [], assignments: {} }
  try {
    const value = JSON.parse((rows[0].values[0][0] as string | null) ?? '{}') as Partial<ServiceTeam>
    return {
      people: Array.isArray(value.people) ? value.people as ServicePerson[] : [],
      assignments: value.assignments && typeof value.assignments === 'object' ? value.assignments as Record<string, string[]> : {}
    }
  } catch {
    return { people: [], assignments: {} }
  }
}

export function setServiceTeam(id: number, team: ServiceTeam): void {
  db.run('UPDATE service SET team_json = ? WHERE id = ?', [JSON.stringify(team), id])
  markServiceDraft(id)
  persist()
}

export function getService(id: number): ServiceFull | null {
  const head = db.prepare('SELECT id, name, service_date, theme, theme_colors, published_at, team_json FROM service WHERE id = ?')
  head.bind([id])
  if (!head.step()) {
    head.free()
    return null
  }
  const row = head.getAsObject() as unknown as {
    id: number; name: string; service_date: string | null; theme: string | null; theme_colors: string | null; published_at: number | null; team_json: string | null
  }
  head.free()
  let themeColors: ThemeColors | null = null
  try {
    themeColors = row.theme_colors ? (JSON.parse(row.theme_colors) as ThemeColors) : null
  } catch (err) {
    console.error(`Failed to parse service theme colors for id=${id}:`, err)
    themeColors = null
  }

  const svc: ServiceSummary & { theme: string | null; themeColors: ThemeColors | null; team: ServiceTeam } = {
    id: row.id,
    name: row.name,
    service_date: row.service_date ?? null,
    theme: row.theme ?? null,
    themeColors,
    published_at: row.published_at ?? null,
    team: getServiceTeam(id)
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
  markServiceDraft(serviceId)
  persist()
  return id
}

// Replaces the content of an existing running-order row without changing its
// ordinal, notes, styling, or zone routing. Review uses this to turn imported
// placeholders into real content without making the operator rebuild the order.
export function replaceServiceItem(itemId: number, type: ServiceItemType, refId: number | null, payload: Record<string, unknown>): void {
  db.run('UPDATE service_item SET type = ?, ref_id = ?, payload_json = ? WHERE id = ?', [type, refId, JSON.stringify(payload), itemId])
  db.run('UPDATE service SET published_at = NULL WHERE id = (SELECT service_id FROM service_item WHERE id = ?)', [itemId])
  persist()
}

// Clones an item — payload, style, zone routing, and any authored zone deck —
// into a new row directly after the original, shifting everything after it
// down by one ordinal. Songs/announcements keep the same ref_id (they point
// at the shared library record, not a copy of it).
export function duplicateServiceItem(itemId: number): number | null {
  const cur = db.prepare(
    'SELECT service_id, ordinal, type, ref_id, payload_json, notes, style, zone_routing, zone_slides, track FROM service_item WHERE id = ?'
  )
  cur.bind([itemId])
  if (!cur.step()) {
    cur.free()
    return null
  }
  const r = cur.getAsObject() as {
    service_id: number
    ordinal: number
    type: string
    ref_id: number | null
    payload_json: string | null
    notes: string | null
    style: string | null
    zone_routing: string | null
    zone_slides: string | null
    track: string
  }
  cur.free()

  db.run('BEGIN')
  try {
    db.run(
      'UPDATE service_item SET ordinal = ordinal + 1 WHERE service_id = ? AND track = ? AND ordinal > ?',
      [r.service_id, r.track, r.ordinal]
    )
    db.run(
      'INSERT INTO service_item (service_id, ordinal, type, ref_id, payload_json, notes, style, zone_routing, zone_slides, track) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [r.service_id, r.ordinal + 1, r.type, r.ref_id, r.payload_json, r.notes, r.style, r.zone_routing, r.zone_slides, r.track]
    )
    db.run('COMMIT')
  } catch (e) {
    db.run('ROLLBACK')
    throw e
  }
  const id = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0] as number
  markServiceDraft(r.service_id)
  persist()
  return id
}

export function removeServiceItem(itemId: number): void {
  db.run('UPDATE service SET published_at = NULL WHERE id = (SELECT service_id FROM service_item WHERE id = ?)', [itemId])
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
  markServiceDraft(service_id)
  persist()
}

export function updateServiceItemNotes(itemId: number, notes: string | null): void {
  db.run('UPDATE service_item SET notes = ? WHERE id = ?', [notes, itemId])
  db.run('UPDATE service SET published_at = NULL WHERE id = (SELECT service_id FROM service_item WHERE id = ?)', [itemId])
  persist()
}

// Stored as a bare YYYY-MM-DD string, never a timestamp — it means "the Sunday
// this service is for", which is a calendar day, not an instant. Announcement
// scheduling compares it as a string for the same reason.
export function setServiceDate(serviceId: number, serviceDate: string | null): void {
  db.run('UPDATE service SET service_date = ? WHERE id = ?', [serviceDate, serviceId])
  markServiceDraft(serviceId)
  persist()
}

export function setServiceTheme(serviceId: number, themeId: string | null, colors: ThemeColors | null): void {
  db.run('UPDATE service SET theme = ?, theme_colors = ? WHERE id = ?', [
    themeId,
    colors ? JSON.stringify(colors) : null,
    serviceId
  ])
  markServiceDraft(serviceId)
  persist()
}

export function setServiceItemStyle(itemId: number, style: ItemStyle | null): void {
  db.run('UPDATE service_item SET style = ? WHERE id = ?', [style ? JSON.stringify(style) : null, itemId])
  db.run('UPDATE service SET published_at = NULL WHERE id = (SELECT service_id FROM service_item WHERE id = ?)', [itemId])
  persist()
}

export function setServiceItemPayload(itemId: number, payload: Record<string, unknown>): void {
  db.run('UPDATE service_item SET payload_json = ? WHERE id = ?', [JSON.stringify(payload ?? {}), itemId])
  db.run('UPDATE service SET published_at = NULL WHERE id = (SELECT service_id FROM service_item WHERE id = ?)', [itemId])
  persist()
}

export function getItemZoneRouting(itemId: number): string | null {
  const rows = db.exec('SELECT zone_routing FROM service_item WHERE id = ?', [itemId])
  if (!rows.length || !rows[0].values.length) return null
  return (rows[0].values[0][0] as string | null) ?? null
}

export function setItemZoneRouting(itemId: number, routing: string | null): void {
  db.run('UPDATE service_item SET zone_routing = ? WHERE id = ?', [routing, itemId])
  db.run('UPDATE service SET published_at = NULL WHERE id = (SELECT service_id FROM service_item WHERE id = ?)', [itemId])
  persist()
}

export function getItemZoneSlides(itemId: number): string | null {
  const rows = db.exec('SELECT zone_slides FROM service_item WHERE id = ?', [itemId])
  if (!rows.length || !rows[0].values.length) return null
  return (rows[0].values[0][0] as string | null) ?? null
}

export function setItemZoneSlides(itemId: number, slides: string | null): void {
  db.run('UPDATE service_item SET zone_slides = ? WHERE id = ?', [slides, itemId])
  db.run('UPDATE service SET published_at = NULL WHERE id = (SELECT service_id FROM service_item WHERE id = ?)', [itemId])
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
  markServiceDraft(serviceId)
  persist()
}

export function reorderServiceItems(serviceId: number, track: string, orderedIds: number[]): void {
  db.run('BEGIN')
  try {
    orderedIds.forEach((id, i) => {
      db.run('UPDATE service_item SET ordinal = ? WHERE id = ? AND service_id = ? AND track = ?', [i, id, serviceId, track])
    })
    db.run('COMMIT')
    markServiceDraft(serviceId)
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

// --- Secrets (OBS password, AI API keys) — same `setting` table, encrypted at
// rest via Electron's OS-backed safeStorage (DPAPI on Windows) instead of
// sitting in the DB file as plaintext. The 'wfenc1:' prefix marks an encrypted
// value so a legacy plaintext row (written before this existed) is still read
// correctly — and self-heals: the next setSecretSetting call re-encrypts it.

const SECRET_PREFIX = 'wfenc1:'

export function setSecretSetting(key: string, value: string | null): void {
  if (value == null || value === '') { setSetting(key, null); return }
  if (safeStorage.isEncryptionAvailable()) {
    setSetting(key, SECRET_PREFIX + safeStorage.encryptString(value).toString('base64'))
  } else {
    setSetting(key, value) // no OS keychain available — best effort, unchanged from before
  }
}

export function getSecretSetting(key: string): string | null {
  const raw = getSetting(key)
  if (raw == null) return null
  if (!raw.startsWith(SECRET_PREFIX)) return raw // legacy plaintext row
  try {
    return safeStorage.decryptString(Buffer.from(raw.slice(SECRET_PREFIX.length), 'base64'))
  } catch {
    return null // e.g. DB copied to a different machine/user — can't decrypt, treat as unset
  }
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

// Keeps a background's tags attached to it when it moves — background_tags
// is keyed by absolute file path, so a move/rename that doesn't update this
// row silently orphans the tags. Only called when the app itself moves a
// file (folder rename, move to folder); a manual move outside the app is
// still not tracked, same limitation this table already had.
export function renameBackgroundTagPath(oldPath: string, newPath: string): void {
  try {
    db.run('UPDATE background_tags SET file_path = ? WHERE file_path = ?', [newPath, oldPath])
    persist()
  } catch (err) {
    console.error('[db] Failed to rename background tag path:', err)
  }
}

export interface BackgroundUsage {
  songs: string[]
  announcements: string[]
  items: string[]
}

// Best-effort check for whether a background is currently referenced
// anywhere, so moving/deleting it can warn instead of silently breaking a
// song, announcement, or item. This is advisory, not a guarantee — per the
// design, moving/deleting proceeds either way, so a missed edge case here
// isn't a correctness bug, just a warning that didn't fire.
export function findBackgroundUsage(filePath: string): BackgroundUsage {
  const songs: string[] = []
  const announcements: string[] = []
  const items: string[] = []
  try {
    const songStmt = db.prepare('SELECT title FROM song WHERE background = ?')
    songStmt.bind([filePath])
    while (songStmt.step()) songs.push((songStmt.getAsObject() as any).title)
    songStmt.free()

    const annStmt = db.prepare('SELECT title FROM announcement WHERE background = ?')
    annStmt.bind([filePath])
    while (annStmt.step()) announcements.push((annStmt.getAsObject() as any).title)
    annStmt.free()

    // Non-song item types store their background inside payload_json. A
    // LIKE match narrows candidates cheaply; the JSON.parse + exact-field
    // check after that confirms it's a real match, not just a coincidental
    // substring.
    const itemStmt = db.prepare('SELECT type, payload_json FROM service_item WHERE payload_json LIKE ?')
    itemStmt.bind([`%${filePath}%`])
    while (itemStmt.step()) {
      const r = itemStmt.getAsObject() as any
      try {
        const payload = JSON.parse(r.payload_json)
        if (payload?.background === filePath) items.push(r.type as string)
      } catch {
        /* skip malformed payload */
      }
    }
    itemStmt.free()

    // A background can also live inside a zone deck's per-slide, per-zone
    // slots (service_item.zone_slides), a separate TEXT column from
    // payload_json. Same LIKE-prefilter + JSON.parse + exact-match pattern.
    const zoneStmt = db.prepare('SELECT type, zone_slides FROM service_item WHERE zone_slides LIKE ?')
    zoneStmt.bind([`%${filePath}%`])
    while (zoneStmt.step()) {
      const r = zoneStmt.getAsObject() as any
      try {
        const slides = JSON.parse(r.zone_slides) as ZoneSlide[]
        const hit = slides.some((slide) =>
          Object.values(slide.zones ?? {}).some((slot) => slot?.path === filePath)
        )
        if (hit) items.push(r.type as string)
      } catch {
        /* skip malformed zone_slides */
      }
    }
    zoneStmt.free()
  } catch (err) {
    console.error('[db] Failed to check background usage:', err)
  }
  return { songs, announcements, items }
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
