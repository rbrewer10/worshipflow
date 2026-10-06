import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { quarantineCorruptJson, recoveredLayers } from './recoveryPlan'

describe('recoveredLayers (QA A3-N2: a crash on Black/Logo/C relaunched showing lyrics)', () => {
  it('Black stays black', () => {
    expect(recoveredLayers({ mode: 'black' }, 'lyrics').screen).toBe('black')
  })
  it('Logo stays on the logo', () => {
    expect(recoveredLayers({ mode: 'logo' }, 'lyrics').screen).toBe('logo')
  })
  it('C (lyrics hidden) and background-off come back', () => {
    expect(recoveredLayers({ mode: 'lyrics', textHidden: true }, 'lyrics')).toEqual({ screen: null, textHidden: true, bgHidden: false })
    expect(recoveredLayers({ mode: 'lyrics', bgHidden: true }, 'lyrics').bgHidden).toBe(true)
  })
  it('a sermon card naturally runs at mode logo — that is the content, not the Logo button', () => {
    expect(recoveredLayers({ mode: 'logo' }, 'logo').screen).toBeNull()
  })
  it('content modes and old snapshots (no flags) restore the item as it was', () => {
    expect(recoveredLayers({ mode: 'lyrics' }, 'lyrics')).toEqual({ screen: null, textHidden: false, bgHidden: false })
    expect(recoveredLayers({ mode: 'countdown' }, 'countdown').screen).toBeNull()
    expect(recoveredLayers(null, 'lyrics')).toEqual({ screen: null, textHidden: false, bgHidden: false })
  })
})

describe('quarantineCorruptJson (QA A3-N3: a corrupt recovery.json disabled recovery for good)', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'wf-rec-')) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it.each([
    ['zero-byte', ''],
    ['half-written', '{"lastState": {"serviceId": 1, "ts": 17'],
    ['not an object', '[1,2]'],
    ['null', 'null'],
  ])('moves a %s file aside so a fresh one is created', (_name, body) => {
    const f = join(dir, 'recovery.json')
    writeFileSync(f, body)
    const aside = quarantineCorruptJson(f, 42)
    expect(aside).toBe(`${f}.corrupt-42`)
    expect(existsSync(f)).toBe(false)
    expect(readFileSync(aside as string, 'utf8')).toBe(body)
  })
  it('leaves a good file and a missing file alone', () => {
    const f = join(dir, 'recovery.json')
    expect(quarantineCorruptJson(f)).toBeNull()
    writeFileSync(f, '{"cleanExit":true}')
    expect(quarantineCorruptJson(f)).toBeNull()
    expect(readdirSync(dir)).toEqual(['recovery.json'])
  })
  it('recovery.ts uses it and clearInvalidConfig', () => {
    const src = readFileSync(join(__dirname, 'recovery.ts'), 'utf8')
    expect(src).toMatch(/quarantineCorruptJson\(join\(app\.getPath\('userData'\), 'recovery\.json'\)\)/)
    expect(src).toMatch(/clearInvalidConfig: true/)
  })
})
