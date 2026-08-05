import { describe, it, expect } from 'vitest'
import { validateLook, validateLooksConfig, parseLooksConfig } from './zoneLooks'
import type { Look } from './zoneLooks'

describe('validateLook', () => {
  it('accepts a well-formed Look with mode pins', () => {
    const look: Look = { id: 'a', name: 'Sermon', pins: { 1: { kind: 'mode', mode: 'logo' }, 3: { kind: 'mode', mode: 'black' } } }
    expect(validateLook(look)).toBe(true)
  })

  it('accepts a well-formed Look with a titleCard pin', () => {
    const look: Look = { id: 'a', name: 'Hold sermon', pins: { 1: { kind: 'titleCard', itemId: 42 } } }
    expect(validateLook(look)).toBe(true)
  })

  it('accepts a Look with no pins at all (every zone follows the service)', () => {
    const look: Look = { id: 'a', name: 'Nothing pinned', pins: {} }
    expect(validateLook(look)).toBe(true)
  })

  it('rejects a missing or empty id', () => {
    expect(validateLook({ id: '', name: 'X', pins: {} })).toBe(false)
    expect(validateLook({ name: 'X', pins: {} })).toBe(false)
  })

  it('rejects a missing or blank name', () => {
    expect(validateLook({ id: 'a', name: '', pins: {} })).toBe(false)
    expect(validateLook({ id: 'a', name: '   ', pins: {} })).toBe(false)
    expect(validateLook({ id: 'a', pins: {} })).toBe(false)
  })

  it('rejects a Look whose pins fail zone-pin validation', () => {
    expect(validateLook({ id: 'a', name: 'X', pins: { 1: { kind: 'mode', mode: 'bogus' } } })).toBe(false)
    expect(validateLook({ id: 'a', name: 'X', pins: { 5: { kind: 'mode', mode: 'logo' } } })).toBe(false)
  })

  it('rejects non-object input', () => {
    expect(validateLook(null)).toBe(false)
    expect(validateLook('a look')).toBe(false)
    expect(validateLook(42)).toBe(false)
  })
})

describe('validateLooksConfig', () => {
  it('accepts an array of valid Looks', () => {
    const looks: Look[] = [
      { id: 'a', name: 'Sermon', pins: { 1: { kind: 'mode', mode: 'logo' } } },
      { id: 'b', name: 'Everywhere', pins: {} }
    ]
    expect(validateLooksConfig(looks)).toBe(true)
  })

  it('accepts an empty array', () => {
    expect(validateLooksConfig([])).toBe(true)
  })

  it('rejects a non-array', () => {
    expect(validateLooksConfig({})).toBe(false)
  })

  it('rejects duplicate ids', () => {
    const looks = [
      { id: 'a', name: 'One', pins: {} },
      { id: 'a', name: 'Two', pins: {} }
    ]
    expect(validateLooksConfig(looks)).toBe(false)
  })

  it('rejects an array containing one invalid Look', () => {
    const looks = [
      { id: 'a', name: 'Valid', pins: {} },
      { id: 'b', name: '', pins: {} }
    ]
    expect(validateLooksConfig(looks)).toBe(false)
  })
})

describe('parseLooksConfig', () => {
  it('returns an empty array for null input', () => {
    expect(parseLooksConfig(null)).toEqual([])
  })

  it('returns an empty array for malformed JSON', () => {
    expect(parseLooksConfig('{not json')).toEqual([])
  })

  it('returns an empty array for well-formed JSON that fails validation', () => {
    expect(parseLooksConfig(JSON.stringify([{ id: 'a', name: '', pins: {} }]))).toEqual([])
  })

  it('round-trips a real list of Looks', () => {
    const looks: Look[] = [{ id: 'a', name: 'Sermon', pins: { 1: { kind: 'mode', mode: 'logo' } } }]
    expect(parseLooksConfig(JSON.stringify(looks))).toEqual(looks)
  })
})
