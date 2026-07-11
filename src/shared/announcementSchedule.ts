// Pure scheduling predicates for announcements. Dates are ISO 'YYYY-MM-DD'
// strings (lexicographically comparable). No DB or clock access — the caller
// supplies the comparison date so this is fully unit-testable.

export interface AnnouncementSchedule {
  active: boolean
  frequency: 'once' | 'recurring'
  startDate: string | null
  endDate: string | null
}

// Does this announcement's schedule cover a service happening on `serviceDate`?
export function announcementMatchesDate(a: AnnouncementSchedule, serviceDate: string): boolean {
  if (!a.active) return false
  if (a.frequency === 'once') return a.startDate === serviceDate
  // recurring: inside [startDate, endDate], either bound optional/open.
  if (a.startDate != null && serviceDate < a.startDate) return false
  if (a.endDate != null && serviceDate > a.endDate) return false
  return true
}

// Is this announcement past its useful life as of `today`? (Independent of `active`.)
export function announcementExpired(
  a: Pick<AnnouncementSchedule, 'frequency' | 'startDate' | 'endDate'>,
  today: string
): boolean {
  if (a.frequency === 'once') return a.startDate != null && a.startDate < today
  return a.endDate != null && a.endDate < today
}
