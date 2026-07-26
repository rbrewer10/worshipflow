import { describe, it, expect } from 'vitest'
import { parseZonePins, validateZonePins, pinLabel } from './zonePins'
import type { ZonePins } from './zonePins'

const pins: ZonePins = { 1: { kind: 'titleCard', itemId: 42 }, 4: { kind: 'mode', mode: 'black' } }

describe('validateZonePins', () => {
  it('accepts a partial record with valid pins', () => expect(validateZonePins(pins)).toBe(true))
  it('rejects unknown kinds and bad modes', () => {
    expect(validateZonePins({ 1: { kind: 'nope' } })).toBe(false)
    expect(validateZonePins({ 1: { kind: 'mode', mode: 'stage' } })).toBe(false) // only logo|black|lyrics pinnable
    expect(validateZonePins({ 1: { kind: 'titleCard' } })).toBe(false) // itemId required
  })
  it('accepts empty object', () => expect(validateZonePins({})).toBe(true))
})

describe('parseZonePins', () => {
  it('null/garbage/invalid -> empty pins, never throws', () => {
    expect(parseZonePins(null)).toEqual({})
    expect(parseZonePins('{{nope')).toEqual({})
    expect(parseZonePins('[1,2]')).toEqual({})
  })
  it('round-trips', () => expect(parseZonePins(JSON.stringify(pins))).toEqual(pins))
})

describe('pinLabel', () => {
  const items = [{ id: 42, title: 'He’s Risen' }]
  it('mode labels', () => {
    expect(pinLabel({ kind: 'mode', mode: 'logo' }, items)).toBe('Logo')
    expect(pinLabel({ kind: 'mode', mode: 'black' }, items)).toBe('Black')
    expect(pinLabel({ kind: 'mode', mode: 'lyrics' }, items)).toBe('Live text')
  })
  it('titleCard uses the item title, tolerates missing item', () => {
    expect(pinLabel({ kind: 'titleCard', itemId: 42 }, items)).toContain('He’s Risen')
    expect(pinLabel({ kind: 'titleCard', itemId: 999 }, items)).toBe('Held item')
  })
})
