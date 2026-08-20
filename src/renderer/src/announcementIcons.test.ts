import { describe, it, expect } from 'vitest'
import { resolveAnnouncementIcon } from './announcementIcons'
import { Megaphone, Music, CalendarDays, Users, Utensils, Baby, Heart, BookOpen } from 'lucide-react'

describe('resolveAnnouncementIcon', () => {
  it('resolves a built-in icon key', () => {
    const r = resolveAnnouncementIcon('icon:music')
    expect(r).toEqual({ kind: 'builtin', Icon: Music })
  })

  it('falls back to the default (megaphone) for null', () => {
    const r = resolveAnnouncementIcon(null)
    expect(r).toEqual({ kind: 'builtin', Icon: Megaphone })
  })

  it('falls back to the default for an unrecognized icon: key', () => {
    const r = resolveAnnouncementIcon('icon:not-a-real-key')
    expect(r).toEqual({ kind: 'builtin', Icon: Megaphone })
  })

  it('treats anything without the icon: prefix as a custom image path', () => {
    const r = resolveAnnouncementIcon('C:\\Users\\ryan\\backgrounds\\choir.png')
    expect(r).toEqual({ kind: 'custom', path: 'C:\\Users\\ryan\\backgrounds\\choir.png' })
  })

  it.each([
    ['icon:megaphone', Megaphone],
    ['icon:music', Music],
    ['icon:calendar', CalendarDays],
    ['icon:people', Users],
    ['icon:meal', Utensils],
    ['icon:kids', Baby],
    ['icon:outreach', Heart],
    ['icon:study', BookOpen]
  ])('resolves %s to its documented component', (key, Icon) => {
    const r = resolveAnnouncementIcon(key)
    expect(r).toEqual({ kind: 'builtin', Icon })
  })

  it('falls back to the default for an empty string', () => {
    const r = resolveAnnouncementIcon('')
    expect(r).toEqual({ kind: 'builtin', Icon: Megaphone })
  })

  it('falls back to the default for "icon:" with nothing after the prefix', () => {
    const r = resolveAnnouncementIcon('icon:')
    expect(r).toEqual({ kind: 'builtin', Icon: Megaphone })
  })
})
