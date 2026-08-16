import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { normalizeTitleText, rotateBackupGenerations } from './db'

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
