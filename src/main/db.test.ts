import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { normalizeTitleText, rotateBackupGenerations, dbFileChangedExternally } from './db'
import type { DbFileStamp } from './db'

describe('normalizeTitleText', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeTitleText('  Amazing Grace  ')).toBe('Amazing Grace')
  })

  it('collapses doubled internal whitespace', () => {
    expect(normalizeTitleText('Amazing   Grace')).toBe('Amazing Grace')
  })

  it('leaves an already-clean title untouched', () => {
    expect(normalizeTitleText('Amazing Grace')).toBe('Amazing Grace')
  })

  it('never changes wording or capitalization — whitespace only', () => {
    expect(normalizeTitleText('  AMAZING grace  ')).toBe('AMAZING grace')
  })
})

describe('rotateBackupGenerations', () => {
  let dir: string
  let bakPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wf-backup-rotation-'))
    bakPath = join(dir, 'worshipflow.db.bak')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  // Mirrors exactly what persist() does on every save: rotate, then write the
  // fresh copy into bakPath. Simulates several successive saves and confirms
  // the last three generations all survive with their correct content,
  // rather than every save clobbering the same single .bak file.
  function simulateSave(content: string): void {
    rotateBackupGenerations(bakPath)
    writeFileSync(bakPath, content)
  }

  it('does nothing when no prior backup exists', () => {
    expect(() => rotateBackupGenerations(bakPath)).not.toThrow()
    expect(existsSync(`${bakPath}.1`)).toBe(false)
  })

  it('shifts a single backup into the .1 slot', () => {
    writeFileSync(bakPath, 'gen0')
    rotateBackupGenerations(bakPath)
    expect(existsSync(bakPath)).toBe(false)
    expect(readFileSync(`${bakPath}.1`, 'utf8')).toBe('gen0')
  })

  it('keeps the last three generations across several successive saves, oldest dropping off', () => {
    simulateSave('save1')
    simulateSave('save2')
    simulateSave('save3')
    simulateSave('save4')
    simulateSave('save5')

    // Newest lands in .bak, then .1, then .2 — anything older than that is gone.
    expect(readFileSync(bakPath, 'utf8')).toBe('save5')
    expect(readFileSync(`${bakPath}.1`, 'utf8')).toBe('save4')
    expect(readFileSync(`${bakPath}.2`, 'utf8')).toBe('save3')
    expect(existsSync(`${bakPath}.3`)).toBe(false)
  })

  it('respects a custom retention count', () => {
    const keep = 2
    rotateBackupGenerations(bakPath, keep)
    writeFileSync(bakPath, 'save1')
    rotateBackupGenerations(bakPath, keep)
    writeFileSync(bakPath, 'save2')
    rotateBackupGenerations(bakPath, keep)
    writeFileSync(bakPath, 'save3')

    expect(readFileSync(bakPath, 'utf8')).toBe('save3')
    expect(readFileSync(`${bakPath}.1`, 'utf8')).toBe('save2')
    expect(existsSync(`${bakPath}.2`)).toBe(false)
  })
})

// Guards the whole-file overwrite in persist(). Two divergent database
// lineages were once found alternating at the same path, and because persist()
// rewrites the entire file from an in-memory snapshot, whichever instance saved
// last erased the other outright — silently, with no error anywhere.
describe('dbFileChangedExternally', () => {
  const stamp = (size: number, mtimeMs: number): DbFileStamp => ({ size, mtimeMs })

  it('allows the write when the file is byte-for-byte the one we last saw', () => {
    expect(dbFileChangedExternally(stamp(274432, 1000), stamp(274432, 1000))).toBe(false)
  })

  it('blocks the write when another writer replaced the file with a different size', () => {
    // The real incident: a 249,856-byte lineage swapped in over a 274,432-byte one.
    expect(dbFileChangedExternally(stamp(249856, 1000), stamp(274432, 1000))).toBe(true)
  })

  it('blocks the write when the size matches but the file was rewritten', () => {
    // Same-size overwrite is the case a naive length check would wave through.
    expect(dbFileChangedExternally(stamp(274432, 2000), stamp(274432, 1000))).toBe(true)
  })

  it('allows the write when nothing is on disk yet — there is nothing to destroy', () => {
    expect(dbFileChangedExternally(null, stamp(274432, 1000))).toBe(false)
  })

  it('allows the write before any baseline exists, rather than deadlocking saves', () => {
    expect(dbFileChangedExternally(stamp(274432, 1000), null)).toBe(false)
  })

  it('treats a restored older backup as an external change', () => {
    // Restoring a backup copies over the file behind our back; an in-memory
    // snapshot from before the restore must not be allowed to undo it.
    expect(dbFileChangedExternally(stamp(262144, 500), stamp(274432, 1500))).toBe(true)
  })
})
