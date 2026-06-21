import { app } from 'electron'
import { join, dirname } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import initSqlJs, { type Database } from 'sql.js'
import type { SongSummary, SongFull, SongSection, SongInput } from '../shared/types'

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
