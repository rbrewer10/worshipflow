import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { activeServiceSettingValue, parseActiveServiceSetting, pickInitialService } from './activeService'

describe('pickInitialService (QA B-N1)', () => {
  const list = [{ id: 9 }, { id: 4 }, { id: 2 }] // newest first, like listServices()
  it('keeps the service main has active, even when a newer one exists', () => {
    expect(pickInitialService(list, 4)).toEqual({ id: 4, tellMain: false })
  })
  it('falls back to the newest only when main has none', () => {
    expect(pickInitialService(list, null)).toEqual({ id: 9, tellMain: true })
  })
  it('falls back when main points at a deleted service', () => {
    expect(pickInitialService(list, 77)).toEqual({ id: 9, tellMain: true })
  })
  it('selects nothing with no services', () => expect(pickInitialService([], null)).toBeNull())
})

describe('active service setting round-trip', () => {
  it('parses what it writes', () => {
    expect(parseActiveServiceSetting(activeServiceSettingValue(12))).toBe(12)
    expect(parseActiveServiceSetting(activeServiceSettingValue(null))).toBeNull()
  })
  it('ignores junk', () => {
    for (const v of [null, undefined, '', 'abc', '0', '-3', '1.5']) expect(parseActiveServiceSetting(v)).toBeNull()
  })
})

describe('wiring (source guards)', () => {
  const root = join(__dirname, '..')
  const ctx = readFileSync(join(root, 'renderer/src/ServiceContext.tsx'), 'utf8')
  const main = readFileSync(join(root, 'main/index.ts'), 'utf8')
  it('the operator window asks main for the active service instead of taking list[0]', () => {
    expect(ctx).toMatch(/getActiveServiceId\(\)/)
    expect(ctx).toMatch(/pickInitialService\(/)
    expect(ctx).not.toMatch(/selectService\(list\[0\]\.id\)/)
  })
  it('main persists the active service and restores it at startup', () => {
    expect(main).toMatch(/setSetting\(ACTIVE_SERVICE_SETTING/)
    expect(main).toMatch(/restoreActiveServiceFromSettings\(\)/)
  })
})
