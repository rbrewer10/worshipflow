import { app } from 'electron'
import { join, dirname } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
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
  ItemStyle
} from '../shared/types'

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
  try { db.run('ALTER TABLE service_item ADD COLUMN notes TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE service ADD COLUMN theme TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE service ADD COLUMN theme_colors TEXT') } catch { /* already exists */ }
  try { db.run('ALTER TABLE service_item ADD COLUMN style TEXT') } catch { /* already exists */ }
  persist()
}

function persist(): void {
  if (!dbPath) return
  writeFileSync(dbPath, Buffer.from(db.export()))
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
    'SELECT id, title, author, ccli, copyright, publisher, background, arrangement, font_scale, lines_per_slide FROM song WHERE id = ?'
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
  }
  head.free()

  const secStmt = db.prepare(
    'SELECT id, kind, label, ordinal, lyrics FROM song_section WHERE song_id = ? ORDER BY ordinal'
  )
  secStmt.bind([id])
  const sections: SongSection[] = []
  while (secStmt.step()) sections.push(secStmt.getAsObject() as unknown as SongSection)
  secStmt.free()

  const arrangement = row.arrangement ? (JSON.parse(row.arrangement) as number[]) : null
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
        sec.lyrics
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
      'UPDATE song SET title = ?, author = ?, ccli = ?, copyright = ?, publisher = ?, arrangement = ?, font_scale = ?, lines_per_slide = ? WHERE id = ?',
      [
        input.title,
        input.author ?? null,
        input.ccli ?? null,
        input.copyright ?? null,
        input.publisher ?? null,
        input.arrangement && input.arrangement.length > 0 ? JSON.stringify(input.arrangement) : null,
        input.fontScale ?? null,
        input.linesPerSlide ?? null,
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
        sec.lyrics
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

function itemTitle(type: string, refId: number | null, payload: Record<string, unknown>): string {
  if (type === 'song' && refId) return songTitle(refId) ?? 'Song (missing)'
  if (type === 'text') return (payload.title as string) || 'Text slide'
  if (type === 'scripture') return (payload.reference as string) || 'Scripture'
  if (type === 'countdown') return `Countdown ${fmtSeconds((payload.seconds as number) || 0)}`
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
  const svc: ServiceSummary & { theme: string | null; themeColors: ThemeColors | null } = {
    id: row.id,
    name: row.name,
    service_date: row.service_date ?? null,
    theme: row.theme ?? null,
    themeColors: row.theme_colors ? (JSON.parse(row.theme_colors) as ThemeColors) : null
  }

  const stmt = db.prepare(
    'SELECT id, ordinal, type, ref_id, payload_json, notes, style FROM service_item WHERE service_id = ? ORDER BY ordinal'
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
    }
    const payload = r.payload_json ? JSON.parse(r.payload_json) : {}
    items.push({
      id: r.id,
      ordinal: r.ordinal,
      type: r.type as ServiceItem['type'],
      ref_id: r.ref_id,
      payload,
      title: itemTitle(r.type, r.ref_id, payload),
      notes: r.notes ?? null,
      style: r.style ? (JSON.parse(r.style) as ItemStyle) : null
    })
  }
  stmt.free()
  return { ...svc, items }
}

export function addServiceItem(serviceId: number, item: NewServiceItem): number {
  const next = db.exec('SELECT COALESCE(MAX(ordinal), -1) + 1 AS n FROM service_item WHERE service_id = ?', [
    serviceId
  ])
  const ordinal = (next.length ? (next[0].values[0][0] as number) : 0) || 0
  db.run('INSERT INTO service_item (service_id, ordinal, type, ref_id, payload_json) VALUES (?,?,?,?,?)', [
    serviceId,
    ordinal,
    item.type,
    item.ref_id ?? null,
    JSON.stringify(item.payload ?? {})
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
  const cur = db.prepare('SELECT ordinal, service_id FROM service_item WHERE id = ?')
  cur.bind([itemId])
  if (!cur.step()) {
    cur.free()
    return
  }
  const { ordinal, service_id } = cur.getAsObject() as { ordinal: number; service_id: number }
  cur.free()

  const nb = db.prepare(
    dir === 'up'
      ? 'SELECT id, ordinal FROM service_item WHERE service_id = ? AND ordinal < ? ORDER BY ordinal DESC LIMIT 1'
      : 'SELECT id, ordinal FROM service_item WHERE service_id = ? AND ordinal > ? ORDER BY ordinal ASC LIMIT 1'
  )
  nb.bind([service_id, ordinal])
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

export function reorderServiceItems(serviceId: number, orderedIds: number[]): void {
  db.run('BEGIN')
  try {
    orderedIds.forEach((id, i) => {
      db.run('UPDATE service_item SET ordinal = ? WHERE id = ? AND service_id = ?', [i, id, serviceId])
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
