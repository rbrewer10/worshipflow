import type { ServiceFull, ServiceItem, ServicePerson, SongSummary } from '../../shared/types'

export type ServiceIssueLevel = 'blocking' | 'warning'

export interface ServiceReadinessIssue {
  id: string
  level: ServiceIssueLevel
  label: string
  detail: string
  itemId?: number
}

export interface ServiceReadiness {
  issues: ServiceReadinessIssue[]
  blocking: ServiceReadinessIssue[]
  warnings: ServiceReadinessIssue[]
  ready: boolean
}

function itemLabel(item: ServiceItem): string {
  return item.title || item.type
}

export function computeServiceReadiness(service: ServiceFull, songs: SongSummary[], people: ServicePerson[] = service.team.people): ServiceReadiness {
  const issues: ServiceReadinessIssue[] = []
  const songIds = new Set(songs.map((song) => song.id))

  if (!service.service_date) {
    issues.push({ id: 'date', level: 'blocking', label: 'Choose a service date', detail: 'A published plan needs to be tied to a Sunday.' })
  }
  if (service.items.length === 0) {
    issues.push({ id: 'empty', level: 'blocking', label: 'Add your first service moment', detail: 'Start with a template or add a song, scripture, or section.' })
  }

  for (const item of service.items) {
    if (item.type === 'placeholder') {
      issues.push({ id: `placeholder-${item.id}`, level: 'blocking', label: `Replace “${itemLabel(item)}”`, detail: 'This placeholder is still visible in the running order.', itemId: item.id })
    }
    if (item.type === 'song' && item.ref_id != null && !songIds.has(item.ref_id)) {
      issues.push({ id: `missing-song-${item.id}`, level: 'blocking', label: `Find the song for “${itemLabel(item)}”`, detail: 'This song is not currently in the library.', itemId: item.id })
    }
    if (item.type === 'scripture' && !(item.payload.reference as string | undefined)?.trim()) {
      issues.push({ id: `scripture-${item.id}`, level: 'blocking', label: 'Add a scripture reference', detail: 'Enter a passage before publishing this reading.', itemId: item.id })
    }
    if ((item.type === 'text' || item.type === 'sermon') && !Object.values(item.payload).some((value) => typeof value === 'string' && value.trim())) {
      issues.push({ id: `content-${item.id}`, level: 'blocking', label: `Add content to “${itemLabel(item)}”`, detail: 'This item is empty and cannot be reviewed yet.', itemId: item.id })
    }
    if (item.type === 'song' && item.ref_id != null) {
      const song = songs.find((candidate) => candidate.id === item.ref_id)
      if (song && !song.background) {
        issues.push({ id: `background-${item.id}`, level: 'warning', label: `Choose a background for “${itemLabel(item)}”`, detail: 'The service theme will be used until a song background is selected.', itemId: item.id })
      }
    }
  }

  if (people.length === 0 && service.items.some((item) => item.type === 'song' || item.type === 'sermon')) {
    issues.push({ id: 'team', level: 'warning', label: 'Add your Sunday team', detail: 'Assign a worship leader, pastor, or host so the plan is ready to hand off.' })
  }

  const blocking = issues.filter((issue) => issue.level === 'blocking')
  const warnings = issues.filter((issue) => issue.level === 'warning')
  return { issues, blocking, warnings, ready: blocking.length === 0 }
}
