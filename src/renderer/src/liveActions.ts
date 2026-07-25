import type { ServiceItem, TrackId } from '../../shared/types'

// Shared live-load helpers used by both LiveView and the service deck builder.

// Resolves the background file an item's slide thumbnail should show. Text-item
// backgrounds live on the item itself; song backgrounds live on the referenced
// song record, so callers must supply a songId -> background lookup for those.
export function itemThumbBackground(item: ServiceItem, songBg: Record<number, string | null>): string | null {
  if (item.type === 'text') return (item.payload?.background as string | undefined) ?? null
  if (item.type === 'song' && item.ref_id != null) return songBg[item.ref_id] ?? null
  return null
}

export function canGoLive(item: ServiceItem): boolean {
  return (
    (item.type === 'song' && item.ref_id != null) ||
    (item.type === 'scripture' && !!(item.payload.reference as string)) ||
    (item.type === 'text' && !!((item.payload.title as string) || (item.payload.body as string))) ||
    (item.type === 'countdown' && (item.payload.seconds as number) > 0) ||
    (item.type === 'image' && !!(item.payload.path as string)) ||
    (item.type === 'welcome' && (item.payload.seconds as number) > 0) ||
    (item.type === 'ticker' && !!(item.payload.text as string)) ||
    (item.type === 'announcement' && item.ref_id != null) ||
    (item.type === 'sermon')
  )
}

export async function sendItemLive(item: ServiceItem, track: TrackId): Promise<boolean> {
  if (item.type === 'song' && item.ref_id != null) {
    await window.wf.liveLoadSong(track, item.ref_id)
  } else if (item.type === 'scripture') {
    const ref = item.payload.reference as string
    if (!ref) return false
    // A failed lookup must NOT mark the item live — that would leave the previous
    // content on screen re-themed as scripture while the deck says scripture is live.
    const ok = await window.wf.liveLoadScripture(track, ref, item.payload.background as string | null | undefined)
    if (!ok) return false
  } else if (item.type === 'text') {
    await window.wf.liveLoadText(
      track,
      (item.payload.title as string) ?? '',
      (item.payload.body as string) ?? '',
      (item.payload.background as string) ?? null,
      item.payload.fontScale as number | undefined
    )
  } else if (item.type === 'countdown') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return false
    await window.wf.liveLoadCountdown(track, secs, item.payload.background as string | null | undefined)
  } else if (item.type === 'image') {
    const p = item.payload.path as string
    if (!p) return false
    await window.wf.liveLoadMedia(track, p, item.title)
  } else if (item.type === 'welcome') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return false
    await window.wf.liveLoadCountdown(track, secs, item.payload.background as string | null | undefined)
  } else if (item.type === 'ticker') {
    const txt = item.payload.text as string
    if (!txt) return false
    await window.wf.liveLoadText(track, 'Announcement', txt)
  } else if (item.type === 'announcement' && item.ref_id != null) {
    await window.wf.liveLoadAnnouncement(track, item.ref_id)
  } else if (item.type === 'sermon') {
    window.wf.sendIntent(track, 'logo')
  } else {
    return false
  }
  await window.wf.liveSetItemId(track, item.id)
  return true
}
