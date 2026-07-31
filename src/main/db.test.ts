import { describe, it, expect } from 'vitest'
import { normalizeTitleText } from './db'

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
