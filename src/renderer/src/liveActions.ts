import { useCallback, useRef, useState } from 'react'
import type { ServiceItem, TrackId } from '../../shared/types'
import { PAYLOAD_BACKGROUND_TYPES } from '../../shared/types'

// Shared live-load helpers used by both LiveView and the service deck builder.

// Tap-to-arm, tap-again-to-cancel, auto-fires after delayMs — the "are you
// sure" gesture for any click that can switch what's live, so one stray tap
// can't send the wrong thing to the congregation. Keyed by a caller-chosen
// string so unrelated targets (item id, or `${itemId}:${slideIndex}`) each
// arm/cancel independently, and arming a new target always clears a still-
// pending one first — otherwise both timers would fire independently and send
// two different things live back-to-back.
export function usePendingConfirm(delayMs = 1500): {
  pendingKey: string | null
  trigger: (key: string, run: () => void) => void
  cancel: () => void
} {
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const pendingKeyRef = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancel = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    pendingKeyRef.current = null
    setPendingKey(null)
  }, [])

  const trigger = useCallback((key: string, run: () => void) => {
    if (pendingKeyRef.current === key) { cancel(); return } // second tap on the same target cancels it
    cancel() // arming a different target always clears any still-pending one first
    pendingKeyRef.current = key
    setPendingKey(key)
    timer.current = setTimeout(() => {
      pendingKeyRef.current = null
      timer.current = null
      setPendingKey(null)
      run()
    }, delayMs)
  }, [cancel, delayMs])

  return { pendingKey, trigger, cancel }
}

// Resolves the background file an item's slide thumbnail should show.
// Text/Scripture/Countdown/Welcome/Sermon backgrounds live on the item itself;
// song backgrounds live on the referenced song record, so callers must supply
// a songId -> background lookup for those.
export function itemThumbBackground(item: ServiceItem, songBg: Record<number, string | null>): string | null {
  if (PAYLOAD_BACKGROUND_TYPES.includes(item.type)) return (item.payload?.background as string | undefined) ?? null
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
    // A block carries its announcements in payload.refIds and may have no
    // ref_id at all, so requiring one would make it un-airable.
    (item.type === 'announcement' &&
      (item.ref_id != null || ((item.payload.refIds as number[] | undefined)?.length ?? 0) > 0)) ||
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
    const ok = await window.wf.liveLoadScripture(track, ref, item.payload.background as string | null | undefined, item.payload.blurBehindText as boolean | undefined)
    if (!ok) return false
  } else if (item.type === 'text') {
    await window.wf.liveLoadText(
      track,
      (item.payload.title as string) ?? '',
      (item.payload.body as string) ?? '',
      (item.payload.background as string) ?? null,
      item.payload.fontScale as number | undefined,
      item.payload.blurBehindText as boolean | undefined
    )
  } else if (item.type === 'countdown') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return false
    await window.wf.liveLoadCountdown(track, secs, item.payload.background as string | null | undefined, item.payload.blurBehindText as boolean | undefined)
  } else if (item.type === 'image') {
    const p = item.payload.path as string
    if (!p) return false
    await window.wf.liveLoadMedia(track, p, item.title)
  } else if (item.type === 'welcome') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return false
    await window.wf.liveLoadCountdown(track, secs, item.payload.background as string | null | undefined, item.payload.blurBehindText as boolean | undefined)
  } else if (item.type === 'ticker') {
    const txt = item.payload.text as string
    if (!txt) return false
    await window.wf.liveLoadText(track, 'Announcement', txt)
  } else if (item.type === 'announcement') {
    await window.wf.liveLoadAnnouncement(track, item.ref_id, item.id)
  } else if (item.type === 'sermon') {
    await window.wf.liveLoadSermon(
      track,
      (item.payload.title as string) ?? '',
      (item.payload.speaker as string) ?? '',
      (item.payload.passage as string) ?? '',
      item.payload.background as string | null | undefined,
      item.payload.blurBehindText as boolean | undefined
    )
  } else {
    return false
  }
  await window.wf.liveSetItemId(track, item.id)
  return true
}
