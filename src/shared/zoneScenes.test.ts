import { describe, it, expect } from 'vitest'
import {
  STARTER_SCENES, starterConfig, contentModeFor, expandScene,
  defaultRoutingFor, effectiveRouting, matchScene, parseSceneConfig, validateSceneConfig
} from './zoneScenes'
import { ZONE_ROUTING_DEFAULTS } from './types'
import type { SceneDef } from './zoneScenes'

const lyricsTvsOnly = STARTER_SCENES.find((s) => s.id === 'lyrics-tvs-only')!
const everywhere = STARTER_SCENES.find((s) => s.id === 'everywhere')!
const config = starterConfig()

describe('contentModeFor', () => {
  it('maps each type to its natural mode', () => {
    expect(contentModeFor('song')).toBe('lyrics')
    expect(contentModeFor('scripture')).toBe('text')
    expect(contentModeFor('text')).toBe('text')
    expect(contentModeFor('ticker')).toBe('text')
    expect(contentModeFor('announcement')).toBe('text')
    expect(contentModeFor('countdown')).toBe('countdown')
    expect(contentModeFor('welcome')).toBe('countdown')
    expect(contentModeFor('image')).toBe('image')
  })
})

describe('expandScene', () => {
  it('expands content role per item type, Z4 always stage', () => {
    expect(expandScene(lyricsTvsOnly, 'song')).toEqual({ 1: 'logo', 2: 'logo', 3: 'lyrics', 4: 'stage' })
    expect(expandScene(everywhere, 'scripture')).toEqual({ 1: 'text', 2: 'text', 3: 'text', 4: 'stage' })
    expect(expandScene(everywhere, 'image')).toEqual({ 1: 'image', 2: 'image', 3: 'image', 4: 'stage' })
  })
  it('treats a missing zone key as logo (safe filler)', () => {
    const partial = { id: 'p', name: 'P', zones: { '3': 'content' } } as unknown as SceneDef
    expect(expandScene(partial, 'song')).toEqual({ 1: 'logo', 2: 'logo', 3: 'lyrics', 4: 'stage' })
  })
})

describe('defaultRoutingFor / effectiveRouting', () => {
  it('starter typeDefaults reproduce todays hardcoded defaults', () => {
    expect(defaultRoutingFor('song', config)).toEqual(ZONE_ROUTING_DEFAULTS.song)
    expect(defaultRoutingFor('scripture', config)).toEqual(ZONE_ROUTING_DEFAULTS.scripture)
  })
  it('falls back to ZONE_ROUTING_DEFAULTS when type has no palette default', () => {
    expect(defaultRoutingFor('countdown', config)).toEqual(ZONE_ROUTING_DEFAULTS.countdown)
    expect(defaultRoutingFor('image', config)).toEqual(ZONE_ROUTING_DEFAULTS.image)
  })
  it('falls back when typeDefault points at a deleted scene', () => {
    const cfg = { ...config, typeDefaults: { song: 'no-such-scene' } }
    expect(defaultRoutingFor('song', cfg)).toEqual(ZONE_ROUTING_DEFAULTS.song)
  })
  it('effectiveRouting: stored routing wins over defaults', () => {
    const item = { type: 'song' as const, zoneRouting: { 1: 'black', 2: 'black', 3: 'lyrics', 4: 'stage' } as const }
    expect(effectiveRouting(item, config)[1]).toBe('black')
    expect(effectiveRouting({ type: 'song', zoneRouting: null }, config)).toEqual(ZONE_ROUTING_DEFAULTS.song)
  })
})

describe('matchScene', () => {
  it('null-routing (default) and an explicitly stamped default match the SAME scene', () => {
    const stamped = expandScene(lyricsTvsOnly, 'song')
    expect(matchScene(stamped, 'song', config)).toBe('lyrics-tvs-only')
    expect(matchScene(effectiveRouting({ type: 'song', zoneRouting: null }, config), 'song', config)).toBe('lyrics-tvs-only')
  })
  it('hand-tuned routing (incl. Z4 changed) is custom', () => {
    expect(matchScene({ 1: 'lyrics', 2: 'black', 3: 'logo', 4: 'stage' }, 'song', config)).toBe('custom')
    expect(matchScene({ 1: 'logo', 2: 'logo', 3: 'lyrics', 4: 'black' }, 'song', config)).toBe('custom')
  })
})

describe('parse/validate', () => {
  it('null, garbage, and wrong-shape JSON all yield the starter config', () => {
    expect(parseSceneConfig(null)).toEqual(starterConfig())
    expect(parseSceneConfig('not json{{')).toEqual(starterConfig())
    expect(parseSceneConfig('{"scenes": "nope"}')).toEqual(starterConfig())
  })
  it('valid JSON round-trips', () => {
    const json = JSON.stringify(config)
    expect(parseSceneConfig(json)).toEqual(config)
  })
  it('validateSceneConfig rejects empty list, duplicate ids, blank names', () => {
    expect(validateSceneConfig({ scenes: [], typeDefaults: {} })).toBe(false)
    const dup = { scenes: [lyricsTvsOnly, { ...everywhere, id: 'lyrics-tvs-only' }], typeDefaults: {} }
    expect(validateSceneConfig(dup)).toBe(false)
    const blank = { scenes: [{ ...lyricsTvsOnly, name: '  ' }], typeDefaults: {} }
    expect(validateSceneConfig(blank)).toBe(false)
    expect(validateSceneConfig(config)).toBe(true)
  })
})
