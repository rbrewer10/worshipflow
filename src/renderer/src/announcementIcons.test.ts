import { describe, it, expect } from 'vitest'
import { resolveAnnouncementIcon } from './announcementIcons'
import { Megaphone, Music, Baby } from 'lucide-react'

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

  it('resolves every key in ANNOUNCEMENT_ICON_KEYS to a distinct component', () => {
    const r = resolveAnnouncementIcon('icon:kids')
    expect(r).toEqual({ kind: 'builtin', Icon: Baby })
  })
})
