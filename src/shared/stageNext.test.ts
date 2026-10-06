import { describe, it, expect } from 'vitest'
import { stageItemTitle } from './stageNext'

describe('stageItemTitle (QA A-H1: stage "Up next" on the last slide)', () => {
  it('prefers the payload title, then the item title', () => {
    expect(stageItemTitle('song', 'How Great Thou Art', {})).toBe('How Great Thou Art')
    expect(stageItemTitle('text', 'Item', { title: 'Welcome' })).toBe('Welcome')
  })
  it('untitled scripture shows the reference; untitled text its first line', () => {
    expect(stageItemTitle('scripture', '', { reference: 'John 3:16-17' })).toBe('John 3:16-17')
    expect(stageItemTitle('text', '', { title: '', body: '\nCall to Worship\nPsalm 100' })).toBe('Call to Worship')
  })
  it('falls back to the item type', () => {
    expect(stageItemTitle('countdown', '', {})).toBe('Countdown')
    expect(stageItemTitle('mystery', '', null)).toBe('Next item')
  })
})
