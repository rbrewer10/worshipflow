import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { Music, BookOpen, Type, Timer, Image as ImageIcon, Hand, ScrollText, Megaphone, Play, Mic, FileQuestion, Minus, HelpCircle, Hourglass } from 'lucide-react'
import type { LiveState, ServiceItem, TrackId } from '../../shared/types'
import { useService } from './ServiceContext'
import SlideThumb from './SlideThumb'
import { canGoLive, itemThumbBackground, usePendingConfirm } from './liveActions'

type IconType = ComponentType<{ size?: number | string; className?: string }>

const ICON: Record<ServiceItem['type'], IconType> = {
  song: Music, scripture: BookOpen, text: Type, countdown: Timer, image: ImageIcon, welcome: Hand, ticker: ScrollText, announcement: Megaphone, sermon: Mic,
  header: Minus, placeholder: HelpCircle
}

// The Live tab's main area: each item a panel of clickable slide thumbnails.
// Used for both the Main and Second columns — `track` selects which live
// cursor/state this instance follows and drives.
function SlideGrid({ track }: { track: TrackId }): JSX.Element {
  const { activeService } = useService()
  const [live, setLive] = useState<LiveState | null>(null)
  const [slides, setSlides] = useState<Record<number, string[]>>({})
  const [songBg, setSongBg] = useState<Record<number, string | null>>({})
  const liveRowRef = useRef<HTMLDivElement | null>(null)
  const { pendingKey, trigger, cancel } = usePendingConfirm()

  useEffect(() => {
    const off = window.wf.onState((s) => setLive(track === 'main' ? s.main : s.second))
    window.wf.getState(track).then(setLive)
    // Also cancel a pending tap-to-confirm on unmount so it can't fire the
    // wrong item live after the operator navigates away from this tab.
    return () => { off(); cancel() }
  }, [track, cancel])

  useEffect(() => {
    window.wf.songsList().then((list) => {
      const map: Record<number, string | null> = {}
      list.forEach((s) => { map[s.id] = s.background ?? null })
      setSongBg(map)
    })
  }, [activeService?.id, activeService?.items.length])

  useEffect(() => {
    if (activeService == null) { setSlides({}); return }
    window.wf.serviceSlides(activeService.id).then((rows) => {
      const map: Record<number, string[]> = {}
      rows.forEach((r) => { map[r.id] = r.slides })
      setSlides(map)
    })
  }, [activeService?.id, activeService?.items.length])

  useEffect(() => {
    liveRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [live?.liveServiceItemId])

  const liveItemId = live?.liveServiceItemId ?? null
  const liveIndex = live?.index ?? -1

  if (!activeService) {
    return <div className="flex h-full min-w-0 flex-1 items-center justify-center text-sm text-slate-500">No service loaded — pick one in the Services tab.</div>
  }

  const items = activeService.items.filter((it) => it.track === track).filter(canGoLive)

  return (
    <div className="h-full min-h-0 min-w-0 flex-1 space-y-3 overflow-auto p-3">
      {items.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-500">
          {track === 'main' ? 'This service has no go-live items yet.' : 'No second-track items yet — add some in Build Service.'}
        </p>
      )}
      {items.map((it) => {
        const its = slides[it.id] ?? ['']
        const isLiveItem = liveItemId === it.id
        // See ServiceDeck: an unknown item type must not blank the tab.
        const Icon = ICON[it.type] ?? FileQuestion
        const bgFile = itemThumbBackground(it, songBg)
        return (
          <div key={it.id} ref={isLiveItem ? liveRowRef : null} className="card-lg">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-900">
              <Icon size={13} className="shrink-0 text-slate-600" />
              <span className="truncate">{it.title}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {its.map((slideText, idx) => {
                const isLiveSlide = isLiveItem && liveIndex === idx
                const slideKey = `${it.id}:${idx}`
                const isPending = pendingKey === slideKey
                const goLive = (): void => { window.wf.liveGoLiveAt(track, it.id, idx) }
                // Navigating within the item that's ALREADY live is just moving
                // the cursor (same as Next/Prev) — instant. Jumping to a DIFFERENT
                // item switches what the congregation sees, so it gets the same
                // tap-to-confirm gesture as the item rail, instead of firing on
                // the first stray click the way this used to.
                const handleClick = (): void => { isLiveItem ? goLive() : trigger(slideKey, goLive) }
                return (
                  <button
                    key={idx}
                    onClick={handleClick}
                    aria-label={`Play slide ${idx + 1} of ${its.length}`}
                    className={`overflow-hidden rounded-md transition-shadow min-h-10 cursor-pointer group relative ${
                      isLiveSlide ? 'ring-2 ring-blue-500' : isPending ? 'ring-2 ring-amber-500/70' : 'ring-1 ring-slate-200 hover:ring-blue-400/50'
                    }`}
                    title={isPending ? 'Tap again to confirm' : `Click to play slide ${idx + 1}`}
                  >
                    <SlideThumb label={slideText} itemStyle={it.style} serviceTheme={activeService.theme} serviceColors={activeService.themeColors} bgFile={bgFile} />
                    {isPending ? (
                      <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/55 text-[10px] font-bold text-amber-300 animate-pulse">
                        <Hourglass size={13} /> tap to confirm
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play size={20} className="text-white" fill="currentColor" />
                      </div>
                    )}
                    <div className="bg-[#e9ecf1] px-1.5 py-0.5 text-left text-[9px] text-slate-500">{idx + 1}</div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default SlideGrid
