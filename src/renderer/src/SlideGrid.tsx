import { useEffect, useRef, useState } from 'react'
import type { LiveState, ServiceItem } from '../../shared/types'
import { useService } from './ServiceContext'
import SlideThumb from './SlideThumb'
import { canGoLive } from './liveActions'

const ICON: Record<ServiceItem['type'], string> = {
  song: '🎵', scripture: '📖', text: '📝', countdown: '⏱', image: '🖼', welcome: '👋', ticker: '📰'
}

// The Live tab's main area: each item a panel of clickable slide thumbnails.
function SlideGrid(): JSX.Element {
  const { activeService } = useService()
  const [live, setLive] = useState<LiveState | null>(null)
  const [slides, setSlides] = useState<Record<number, string[]>>({})
  const liveRowRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const off = window.wf.onState(setLive)
    window.wf.getState().then(setLive)
    return off
  }, [])

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
    return <div className="flex h-full items-center justify-center text-sm text-slate-500">No service loaded — pick one in the Services tab.</div>
  }

  const items = activeService.items.filter(canGoLive)

  return (
    <div className="h-full min-h-0 space-y-3 overflow-auto p-3">
      {items.length === 0 && <p className="py-8 text-center text-sm text-slate-500">This service has no go-live items yet.</p>}
      {items.map((it) => {
        const its = slides[it.id] ?? ['']
        const isLiveItem = liveItemId === it.id
        return (
          <div key={it.id} ref={isLiveItem ? liveRowRef : null} className="rounded-lg border border-white/[0.07] bg-[#1a1a1d] p-2.5">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-200">
              <span>{ICON[it.type]}</span>
              <span className="truncate">{it.title}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {its.map((slideText, idx) => {
                const isLiveSlide = isLiveItem && liveIndex === idx
                return (
                  <button
                    key={idx}
                    onClick={() => window.wf.liveGoLiveAt(it.id, idx)}
                    aria-label={`Go live: slide ${idx + 1} of ${its.length}`}
                    className={`overflow-hidden rounded-md transition-shadow min-h-10 ${isLiveSlide ? 'ring-2 ring-blue-500' : 'ring-1 ring-white/10 hover:ring-white/30'}`}
                    title={`Go live: slide ${idx + 1}`}
                  >
                    <SlideThumb label={slideText} itemStyle={it.style} serviceTheme={activeService.theme} serviceColors={activeService.themeColors} />
                    <div className="bg-[#0e0e11] px-1.5 py-0.5 text-left text-[9px] text-slate-500">{idx + 1}</div>
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
