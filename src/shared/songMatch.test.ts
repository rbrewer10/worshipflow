import { describe, it, expect } from 'vitest'
import { normalizeCcli, authorsCompatible, titleMatchIsSameSong } from './songMatch'

describe('normalizeCcli', () => {
  it('reads the common formats', () => {
    expect(normalizeCcli('6158927')).toBe('6158927')
    expect(normalizeCcli('CCLI# 6158927')).toBe('6158927')
    expect(normalizeCcli('CCLI Song # 6158927')).toBe('6158927')
    expect(normalizeCcli(' 6 158 927 ')).toBe('6158927')
    expect(normalizeCcli('6,158,927')).toBe('6158927')
  })
  it('QA A-H5: a field with two numbers is the FIRST number, not both glued together', () => {
    expect(normalizeCcli('6158927, License 123456')).toBe('6158927')
  })
  it('blank → empty', () => {
    expect(normalizeCcli(null)).toBe('')
    expect(normalizeCcli('   ')).toBe('')
  })
})

describe('titleMatchIsSameSong (QA A-H5)', () => {
  it('"Holy Spirit" CCLI 6087919 (Battistelli) is NOT "Holy Spirit" CCLI 9999999 (Torwalt)', () => {
    expect(titleMatchIsSameSong({ ccli: '9999999', author: 'Bryan Torwalt' }, { ccli: '6087919', author: 'Francesca Battistelli' })).toBe(false)
  })
  it('different CCLI numbers mean different songs even with the same author', () => {
    expect(titleMatchIsSameSong({ ccli: '1', author: 'A' }, { ccli: '2', author: 'A' })).toBe(false)
  })
  it('same CCLI number in different formatting is the same song', () => {
    expect(titleMatchIsSameSong({ ccli: 'CCLI# 6158927' }, { ccli: '6158927' })).toBe(true)
  })
  it('one side has no CCLI: same song unless the authors have nobody in common', () => {
    expect(titleMatchIsSameSong({ ccli: '6087919', author: 'Francesca Battistelli' }, { ccli: null, author: null })).toBe(true)
    expect(titleMatchIsSameSong({ ccli: '6087919', author: 'Francesca Battistelli' }, { ccli: '', author: 'Battistelli, Francesca' })).toBe(false)
    expect(titleMatchIsSameSong({ author: 'Francesca Battistelli, Bryan Torwalt' }, { author: 'Bryan Torwalt' })).toBe(true)
    expect(titleMatchIsSameSong({ author: 'Bryan Torwalt' }, { author: 'Chris Tomlin' })).toBe(false)
  })
  it('authorsCompatible treats blanks as unknown (compatible)', () => {
    expect(authorsCompatible('', 'Anyone')).toBe(true)
    expect(authorsCompatible('John Newton & Edwin Excell', 'john newton')).toBe(true)
  })
})
