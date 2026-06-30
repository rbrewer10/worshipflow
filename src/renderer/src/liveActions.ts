import type { ServiceItem } from '../../shared/types'

// Shared live-load helpers used by both LiveView and the service deck builder.

export function canGoLive(item: ServiceItem): boolean {
  return (
    (item.type === 'song' && item.ref_id != null) ||
    (item.type === 'scripture' && !!(item.payload.reference as string)) ||
    (item.type === 'text' && !!((item.payload.title as string) || (item.payload.body as string))) ||
    (item.type === 'countdown' && (item.payload.seconds as number) > 0) ||
    (item.type === 'image' && !!(item.payload.path as string)) ||
    (item.type === 'welcome' && (item.payload.seconds as number) > 0) ||
    (item.type === 'ticker' && !!(item.payload.text as string))
  )
}

export async function sendItemLive(item: ServiceItem): Promise<void> {
  if (item.type === 'song' && item.ref_id != null) {
    await window.wf.liveLoadSong(item.ref_id)
  } else if (item.type === 'scripture') {
    const ref = item.payload.reference as string
    if (!ref) return
    await window.wf.liveLoadScripture(ref)
  } else if (item.type === 'text') {
    await window.wf.liveLoadText(
      (item.payload.title as string) ?? '',
      (item.payload.body as string) ?? '',
      (item.payload.background as string) ?? null
    )
  } else if (item.type === 'countdown') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return
    await window.wf.liveLoadCountdown(secs)
  } else if (item.type === 'image') {
    const p = item.payload.path as string
    if (!p) return
    await window.wf.liveLoadMedia(p, item.title)
  } else if (item.type === 'welcome') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return
    await window.wf.liveLoadCountdown(secs)
  } else if (item.type === 'ticker') {
    const txt = item.payload.text as string
    if (!txt) return
    await window.wf.liveLoadText('Announcement', txt)
  } else {
    return
  }
  window.wf.liveSetItemId(item.id)
  // Send the per-item style override to live state
  if (item.style) {
    window.wf.liveSetItemStyle(item.style).catch(err => {
      console.error('Failed to set item style:', err)
    })
  }
}
