// src/renderer/src/live/LiveTriptych.tsx
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { LiveState, TrackId } from '../../../shared/types'
import { useService } from '../ServiceContext'
import { resolveUpcoming } from '../liveUpcoming'

// Replaces the click-any-slide SlideGrid for the main track. CURRENT/NEXT are
// read straight off LiveState (main process already computes them); AFTER
// NEXT needs the client-side lookahead in liveUpcoming.ts since the main
// process's own `next` field never looks past the current item's own slides.
function LiveTriptych({ track }: { track: TrackId }): JSX.Element {
  const { activeService } = useService()
  const [live, setLive] = useState<LiveState | null>(null)
  const [slides, setSlides] = useState<Record<number, string[]>>({})

  useEffect(() => {
    const off = window.wf.onState((s) => setLive(track === 'main' ? s.main : s.second))
    window.wf.getState(track).then(setLive)
    return off
  }, [track])

  useEffect(() => {
    if (activeService == null) { setSlides({}); return }
    window.wf.serviceSlides(activeService.id).then((rows) => {
      const map: Record<number, string[]> = {}
      rows.forEach((r) => { map[r.id] = r.slides })
      setSlides(map)
    })
  }, [activeService?.id, activeService?.items.length])

  // The main process broadcasts live-state updates at up to ~10x/second while
  // auto-advance is armed. resolveUpcoming's flat-sequence build only depends
  // on (items, track, slides) — none of which change tick-to-tick, only the
  // live position does — so memoize it rather than rebuilding the whole
  // service's flat slide sequence on every single state push.
  const items = activeService?.items ?? []
  const { next, afterNext } = useMemo(
    () => resolveUpcoming(items, track, slides, live?.liveServiceItemId ?? null, live?.index ?? 0),
    [items, track, slides, live?.liveServiceItemId, live?.index]
  )

  if (!activeService) {
    return <div className="flex h-full min-w-0 flex-1 items-center justify-center text-sm text-content-secondary">No service loaded — pick one in the Services tab.</div>
  }

  const advance = (): void => { void window.wf.sendIntent(track, 'next') }

  const progressPct = live && live.total > 0 ? Math.min(100, ((live.index + 1) / live.total) * 100) : 0

  // Black/Logo cutaways deliberately leave the last song/line/index/total
  // untouched in main (see processIntent's black/logo branches), so the
  // CURRENT panel must branch on mode rather than trusting those fields —
  // otherwise it shows stale lyric content while the screen is actually
  // black or on the logo.
  const isBlack = live?.mode === 'black'
  const isLogo = live?.mode === 'logo'
  const showLiveContent = !isBlack && !isLogo

  return (
    <div className="wf-live-triptych grid h-full min-w-0 flex-1 grid-cols-[minmax(0,1.55fr)_minmax(190px,0.85fr)] grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3 overflow-hidden p-3">
      {/* CURRENT — large, dominant */}
      <div className="wf-live-current card-lg row-span-2 flex min-h-0 flex-col justify-center gap-3 overflow-hidden p-6">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-content-secondary">
          <span>{showLiveContent ? (live?.songTitle || 'Current') : 'Current'}</span>
          {showLiveContent && live && live.total > 0 && <span className="tabular-nums">Slide {live.index + 1} of {live.total}</span>}
        </div>
        <p className="whitespace-pre-line text-center text-3xl font-semibold leading-snug text-content-primary">
          {isBlack
            ? <span className="italic text-content-tertiary">Screen is black</span>
            : isLogo
              ? <span className="italic text-content-tertiary">Logo screen</span>
              : (live?.line || <span className="italic text-content-tertiary">Nothing live</span>)}
        </p>
        {showLiveContent && live && live.total > 0 && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-raised">
            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </div>

      {/* NEXT — clearly secondary, clickable as a convenience (the real
          advance path is the existing keyboard shortcuts / sendIntent, this
          just gives the same action a visible on-screen target) */}
      <button
        onClick={advance}
        disabled={!next}
        title={next ? 'Click to advance' : 'End of service'}
        className="wf-live-next card-lg flex min-h-0 flex-col justify-center gap-1.5 overflow-hidden p-4 text-left transition-colors hover:bg-panel-raised disabled:cursor-default disabled:hover:bg-transparent"
      >
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-content-secondary">
          <span className="inline-flex items-center gap-1"><ChevronRight size={13} /> Next</span>
          {next && next.itemTitle && <span className="truncate text-content-tertiary">{next.itemTitle}</span>}
        </div>
        <p className="line-clamp-4 whitespace-pre-line text-xl font-medium text-content-primary">
          {next?.text || <span className="italic text-content-tertiary">End of service</span>}
        </p>
      </button>

      {/* AFTER NEXT — small, thumbnail-only preview */}
      <div className="wf-live-after card-lg flex min-h-0 items-center gap-2 overflow-hidden p-3">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-content-tertiary">After next</span>
        <p className="min-w-0 flex-1 truncate text-sm text-content-secondary">
          {afterNext?.text || <span className="italic text-content-tertiary">—</span>}
        </p>
      </div>
    </div>
  )
}

export default LiveTriptych
