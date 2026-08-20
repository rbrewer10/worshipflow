// Maps an announcement's `icon` field (built-in key or custom image path) to
// what actually renders in the icon panel. Lives in renderer/, not shared/,
// because it returns real lucide-react components — shared/ is imported by
// the main process too, which has no React.
import type { LucideIcon } from 'lucide-react'
import { Megaphone, Music, CalendarDays, Users, Utensils, Baby, Heart, BookOpen } from 'lucide-react'
import type { AnnouncementIconKey } from '../../shared/types'

export const ANNOUNCEMENT_ICON_COMPONENTS: Record<AnnouncementIconKey, LucideIcon> = {
  megaphone: Megaphone,
  music: Music,
  calendar: CalendarDays,
  people: Users,
  meal: Utensils,
  kids: Baby,
  outreach: Heart,
  study: BookOpen
}

export const ANNOUNCEMENT_ICON_LABELS: Record<AnnouncementIconKey, string> = {
  megaphone: 'General',
  music: 'Music',
  calendar: 'Event',
  people: 'Fellowship',
  meal: 'Meal',
  kids: 'Kids',
  outreach: 'Outreach',
  study: 'Study'
}

export type ResolvedAnnouncementIcon =
  | { kind: 'builtin'; Icon: LucideIcon }
  | { kind: 'custom'; path: string }

// null/unset, or an 'icon:<key>' that doesn't match a known key (e.g. a key
// removed in a future version) both fall back to the same default rather
// than rendering nothing.
export function resolveAnnouncementIcon(icon: string | null): ResolvedAnnouncementIcon {
  if (!icon) return { kind: 'builtin', Icon: Megaphone }
  if (icon.startsWith('icon:')) {
    const key = icon.slice(5)
    const components: Record<string, LucideIcon> = ANNOUNCEMENT_ICON_COMPONENTS
    const Icon = Object.prototype.hasOwnProperty.call(components, key) ? components[key] : undefined
    return Icon ? { kind: 'builtin', Icon } : { kind: 'builtin', Icon: Megaphone }
  }
  return { kind: 'custom', path: icon }
}
