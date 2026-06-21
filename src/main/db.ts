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
  NewServiceItem
} from '../shared/types'

// WorshipFlow data layer — SQLite via sql.js (WASM). Real SQLite, no native
// build/rebuild. The DB lives in memory and is persisted to a file on every
// mutation (church-scale data; simple and reliable). Phase 1 = the song library.

let db: Database
let dbPath = ''

const SCHEMA = `
CREATE TABLE IF NOT EXISTS song (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT,
  ccli TEXT,
  created_at INTEGER NOT NULL
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
  // sql.js ships its wasm next to its JS entry in node_modules.
  const sqlDistDir = dirname(require.resolve('sql.js'))
  const SQL = await initSqlJs({ locateFile: (f) => join(sqlDistDir, f) })

  dbPath = join(app.getPath('userData'), 'worshipflow.db')
  db = existsSync(dbPath) ? new SQL.Database(readFileSync(dbPath)) : new SQL.Database()
  db.run('PRAGMA foreign_keys = ON;')
  db.run(SCHEMA)
  persist()
}

function persist(): void {
  if (!dbPath) return
  writeFileSync(dbPath, Buffer.from(db.export()))
}

export function listSongs(search = ''): SongSummary[] {
  const sql = search
    ? `SELECT DISTINCT s.id, s.title, s.author FROM song s
       LEFT JOIN song_section sec ON sec.song_id = s.id
       WHERE s.title LIKE $q OR s.author LIKE $q OR sec.lyrics LIKE $q
       ORDER BY s.title COLLATE NOCASE`
    : `SELECT id, title, author FROM song ORDER BY title COLLATE NOCASE`

  const stmt = db.prepare(sql)
  if (search) stmt.bind({ $q: `%${search}%` })
  const rows: SongSummary[] = []
  while (stmt.step()) rows.push(stmt.getAsObject() as unknown as SongSummary)
  stmt.free()
  return rows
}

export function getSong(id: number): SongFull | null {
  const head = db.prepare('SELECT id, title, author, ccli FROM song WHERE id = ?')
  head.bind([id])
  if (!head.step()) {
    head.free()
    return null
  }
  const row = head.getAsObject() as { id: number; title: string; author: string | null; ccli: string | null }
  head.free()

  const secStmt = db.prepare(
    'SELECT id, kind, label, ordinal, lyrics FROM song_section WHERE song_id = ? ORDER BY ordinal'
  )
  secStmt.bind([id])
  const sections: SongSection[] = []
  while (secStmt.step()) sections.push(secStmt.getAsObject() as unknown as SongSection)
  secStmt.free()

  return { id: row.id, title: row.title, author: row.author, ccli: row.ccli, sections }
}

export function createSong(input: SongInput): number {
  db.run('BEGIN')
  try {
    db.run('INSERT INTO song (title, author, ccli, created_at) VALUES (?,?,?,?)', [
      input.title,
      input.author ?? null,
      input.ccli ?? null,
      Date.now()
    ])
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

// --- Services (Phase 1 ②) ---

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
  const head = db.prepare('SELECT id, name, service_date FROM service WHERE id = ?')
  head.bind([id])
  if (!head.step()) {
    head.free()
    return null
  }
  const svc = head.getAsObject() as unknown as ServiceSummary
  head.free()

  const stmt = db.prepare(
    'SELECT id, ordinal, type, ref_id, payload_json FROM service_item WHERE service_id = ? ORDER BY ordinal'
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
    }
    const payload = r.payload_json ? JSON.parse(r.payload_json) : {}
    items.push({
      id: r.id,
      ordinal: r.ordinal,
      type: r.type as ServiceItem['type'],
      ref_id: r.ref_id,
      payload,
      title: itemTitle(r.type, r.ref_id, payload)
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
