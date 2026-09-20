import { describe, it, expect } from 'vitest'
import { detectNdiRuntime, overlayUrl, recommendedSourceName } from './ndiRuntime'

describe('detectNdiRuntime', () => {
  it('reports missing when no DLL is on disk', () => {
    expect(detectNdiRuntime(() => false)).toEqual({ found: false, version: null, dllPath: null })
  })

  it('finds NDI 6 in the default Program Files path', () => {
    const dll = 'C:\\Program Files\\NDI\\NDI 6 Runtime\\v6\\Processing.NDI.Lib.x64.dll'
    expect(detectNdiRuntime((p) => p === dll)).toEqual({ found: true, version: '6', dllPath: dll })
  })

  it('prefers NDI_RUNTIME_DIR when it points at a real DLL', () => {
    const dll = 'D:\\NDI\\Processing.NDI.Lib.x64.dll'
    expect(detectNdiRuntime((p) => p === dll, { NDI_RUNTIME_DIR: 'D:\\NDI' })).toEqual({
      found: true,
      version: '6',
      dllPath: dll,
    })
  })
})

describe('overlay helpers', () => {
  it('builds the OBS browser-source URL', () => {
    expect(overlayUrl('192.168.1.10', 3691)).toBe('http://192.168.1.10:3691/overlay')
  })

  it('names the native NDI source the switcher should look for', () => {
    expect(recommendedSourceName()).toBe('WorshipFlow Lyrics')
  })
})
