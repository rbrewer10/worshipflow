// src/shared/serviceControlModes.test.ts
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_MODE_MAPPING, parseServiceControlModeMapping, validateServiceControlModeMapping, resolveModeScene
} from './serviceControlModes'
import { starterConfig } from './zoneScenes'

describe('validateServiceControlModeMapping', () => {
  it('accepts an empty object', () => { expect(validateServiceControlModeMapping({})).toBe(true) })
  it('accepts all 3 keys as strings', () => {
    expect(validateServiceControlModeMapping({ sermon: 'a', worship: 'b', invitation: 'c' })).toBe(true)
  })
  it('rejects a non-object', () => {
    expect(validateServiceControlModeMapping('nope')).toBe(false)
    expect(validateServiceControlModeMapping(null)).toBe(false)
  })
  it('rejects a non-string value for a known key', () => {
    expect(validateServiceControlModeMapping({ sermon: 5 })).toBe(false)
  })
})

describe('parseServiceControlModeMapping', () => {
  it('returns the default mapping for null input', () => {
    expect(parseServiceControlModeMapping(null)).toEqual(DEFAULT_MODE_MAPPING)
  })
  it('returns the default mapping for invalid JSON', () => {
    expect(parseServiceControlModeMapping('{not json')).toEqual(DEFAULT_MODE_MAPPING)
  })
  it('returns the default mapping for valid JSON that fails validation', () => {
    expect(parseServiceControlModeMapping('{"sermon":5}')).toEqual(DEFAULT_MODE_MAPPING)
  })
  it('parses a real custom mapping', () => {
    expect(parseServiceControlModeMapping('{"sermon":"my-scene"}')).toEqual({ sermon: 'my-scene' })
  })
})

describe('resolveModeScene', () => {
  const config = starterConfig()

  it('resolves the default mapping against the starter scene palette', () => {
    expect(resolveModeScene('sermon', DEFAULT_MODE_MAPPING, config)?.id).toBe('focus')
    expect(resolveModeScene('worship', DEFAULT_MODE_MAPPING, config)?.id).toBe('lyrics-tvs-only')
    expect(resolveModeScene('invitation', DEFAULT_MODE_MAPPING, config)?.id).toBe('everywhere')
  })
  it('returns null when the mapped sceneId does not exist in the current config', () => {
    expect(resolveModeScene('sermon', { sermon: 'deleted-scene' }, config)).toBeNull()
  })
  it('returns null when the mode has no mapping at all', () => {
    expect(resolveModeScene('sermon', {}, config)).toBeNull()
  })
})
