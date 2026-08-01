import { describe, it, expect } from 'vitest'
import {
  STARTER_SCENES, starterConfig, contentModeFor, expandScene, roleForMode, modeForRole,
  defaultRoutingFor, effectiveRouting, matchScene, parseSceneConfig, validateSceneConfig
} from './zoneScenes'
import { ZONE_ROUTING_DEFAULTS } from './types'
import type { SceneDef } from './zoneScenes'
import type { ZoneRouting } from './types'

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
    expect(contentModeFor('livecall')).toBe('livecall')
  })
})

describe('livecall', () => {
  it('puts the call on every audience screen and leaves stage alone', () => {
    expect(ZONE_ROUTING_DEFAULTS.livecall).toEqual({
      1: 'livecall', 2: 'livecall', 3: 'livecall', 4: 'stage'
    })
  })

  it('is expressible as a content role, so the zone grid can set it', () => {
    expect(roleForMode('livecall')).toBe('content')
    expect(modeForRole('content', 'livecall')).toBe('livecall')
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

describe('roleForMode', () => {
  it('maps filler modes to their own role', () => {
    expect(roleForMode('logo')).toBe('logo')
    expect(roleForMode('black')).toBe('black')
  })
  it('maps every content-bearing mode to content', () => {
    expect(roleForMode('lyrics')).toBe('content')
    expect(roleForMode('text')).toBe('content')
    expect(roleForMode('countdown')).toBe('content')
    expect(roleForMode('image')).toBe('content')
  })
  it('returns null for modes with no role equivalent', () => {
    expect(roleForMode('off')).toBeNull()
    expect(roleForMode('stage')).toBeNull()
  })
  it('round-trips every starter scene role for zones 1-3', () => {
    for (const scene of STARTER_SCENES) {
      const routing = expandScene(scene, 'song')
      for (const z of ['1', '2', '3'] as const) {
        expect(roleForMode(routing[Number(z) as 1 | 2 | 3])).toBe(scene.zones[z])
      }
    }
  })
})

describe('modeForRole', () => {
  it('content resolves against the item type', () => {
    expect(modeForRole('content', 'song')).toBe('lyrics')
    expect(modeForRole('content', 'countdown')).toBe('countdown')
    expect(modeForRole('content', 'image')).toBe('image')
    expect(modeForRole('content', 'sermon')).toBe('text')
  })
  it('logo and black ignore the item type', () => {
    expect(modeForRole('logo', 'song')).toBe('logo')
    expect(modeForRole('black', 'image')).toBe('black')
  })
  it('a missing role falls back to logo (safe filler)', () => {
    expect(modeForRole(undefined, 'song')).toBe('logo')
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

  it('validateSceneConfig rejects non-string typeDefaults values', () => {
    const bad = { scenes: [lyricsTvsOnly], typeDefaults: { song: 123 } }
    expect(validateSceneConfig(bad)).toBe(false)
  })
})

describe('unknown item type (row from a newer build, or a downgrade)', () => {
  // Regression: ZONE_ROUTING_DEFAULTS had no entry, defaultRoutingFor returned
  // undefined, and matchScene threw reading routing[1] — blanking the Build tab
  // on a single such row.
  const unknown = 'somethingelse' as unknown as Parameters<typeof defaultRoutingFor>[0]

  it('returns a usable routing instead of undefined', () => {
    const routing = defaultRoutingFor(unknown, config)
    expect(routing).toBeDefined()
    expect(routing[1]).toBeDefined()
    expect(routing[4]).toBeDefined()
  })

  it('puts nothing unexpected on the audience screens', () => {
    expect(defaultRoutingFor(unknown, config)).toEqual({
      1: 'logo', 2: 'logo', 3: 'logo', 4: 'stage'
    })
  })

  it('matchScene does not throw on a missing routing', () => {
    expect(() => matchScene(undefined as unknown as ZoneRouting, unknown, config)).not.toThrow()
    expect(matchScene(undefined as unknown as ZoneRouting, unknown, config)).toBe('custom')
  })

  it('effectiveRouting is safe for an unknown type with no explicit routing', () => {
    expect(() => effectiveRouting({ type: unknown, zoneRouting: null }, config)).not.toThrow()
  })
})
