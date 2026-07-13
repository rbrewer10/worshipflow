import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { Music, BookOpen, Type, Timer, Image as ImageIcon, Hand, ScrollText, Megaphone, Play, Mic } from 'lucide-react'
import type { LiveState, ServiceItem } from '../../shared/types'
import { useService } from './ServiceContext'
import SlideThumb from './SlideThumb'
import { canGoLive, itemThumbBackground } from './liveActions'

type IconType = ComponentType<{ size?: number | string; className?: string }>

const ICON: Record<ServiceItem['type'], IconType> = {
  song: Music, scripture: BookOpen, text: Type, countdown: Timer, image: ImageIcon, welcome: Hand, ticker: ScrollText, announcement: Megaphone, sermon: Mic
}

// The Live tab's main area: each item a panel of clickable slide thumbnails.
function SlideGrid(): JSX.Element {
  const { activeService } = useService()
  const [live, setLive] = useState<LiveState | null>(null)
  const [slides, setSlides] = useState<Record<number, string[]>>({})
  const [songBg, setSongBg] = useState<Record<number, string | null>>({})
  const liveRowRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const off = window.wf.onState(setLive)
    window.wf.getState().then(setLive)
    return off
  }, [])

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

  const items = activeService.items.filter(canGoLive)

  return (
    <div className="h-full min-h-0 min-w-0 flex-1 space-y-3 overflow-auto p-3">
      {items.length === 0 && <p className="py-8 text-center text-sm text-slate-500">This service has no go-live items yet.</p>}
      {items.map((it) => {
        const its = slides[it.id] ?? ['']
        const isLiveItem = liveItemId === it.id
        const Icon = ICON[it.type]
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
                return (
                  <button
                    key={idx}
                    onClick={() => window.wf.liveGoLiveAt(it.id, idx)}
                    aria-label={`Play slide ${idx + 1} of ${its.length}`}
                    className={`overflow-hidden rounded-md transition-shadow min-h-10 cursor-pointer group relative ${isLiveSlide ? 'ring-2 ring-blue-500' : 'ring-1 ring-slate-200 hover:ring-blue-400/50'}`}
                    title={`Click to play slide ${idx + 1}`}
                  >
                    <SlideThumb label={slideText} itemStyle={it.style} serviceTheme={activeService.theme} serviceColors={activeService.themeColors} bgFile={bgFile} />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play size={20} className="text-white" fill="currentColor" />
                    </div>
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
