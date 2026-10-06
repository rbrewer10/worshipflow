// Title the stage monitor shows under "Up next" when the live item is on its
// last slide (QA A-H1). Pure so it can be unit-tested.
const TYPE_LABEL: Record<string, string> = {
  song: 'Song',
  scripture: 'Scripture',
  sermon: 'Sermon',
  countdown: 'Countdown',
  announcement: 'Announcement',
  media: 'Media',
  video: 'Video',
  image: 'Image',
  livecall: 'Live call',
  text: 'Text'
}

export function stageItemTitle(type: string, title: string | null | undefined, payload: Record<string, unknown> | null | undefined): string {
  const fromPayload = typeof payload?.title === 'string' ? payload.title.trim() : ''
  const own = (title ?? '').trim()
  if (fromPayload) return fromPayload
  if (own) return own
  if (type === 'scripture' && typeof payload?.reference === 'string' && payload.reference.trim()) return payload.reference.trim()
  if (type === 'text' && typeof payload?.body === 'string') {
    const first = payload.body.split('\n').map((l) => l.trim()).find(Boolean)
    if (first) return first.length > 60 ? first.slice(0, 57) + '…' : first
  }
  return TYPE_LABEL[type] ?? 'Next item'
}
