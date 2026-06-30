import { useEffect, useRef, useState } from 'react'
import type { LiveState, ServiceItem } from '../../shared/types'
import { useService } from './ServiceContext'
import SlideThumb from './SlideThumb'
import OutputPreview from './OutputPreview'
import { sendItemLive } from './liveActions'

const ICON: Record<ServiceItem['type'], string> = {
  song: '🎵', scripture: '📖', text: '📝', countdown: '⏱', image: '🖼', welcome: '👋', ticker: '📰'
}

// Persistent left rail: the loaded service's items + the pinned output preview.
function ServiceRail(): JSX.Element {
  const { activeService } = useService()
  const [live, setLive] = useState<LiveState | null>(null)
  const [pendingId, setPendingId] = useState<number | null>(null)
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const off = window.wf.onState(setLive)
    window.wf.getState().then(setLive)
    return off
  }, [])
  const liveId = live?.liveServiceItemId ?? null

  const handleItemClick = (it: ServiceItem): void => {
    if (pendingId === it.id) {
      if (pendingTimer.current) clearTimeout(pendingTimer.current)
      setPendingId(null)
      return
    }
    setPendingId(it.id)
    pendingTimer.current = setTimeout(() => {
      sendItemLive(it)
      setPendingId(null)
    }, 1500)
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-white/[0.07] bg-[#121216]">
      <div className="border-b border-white/[0.06] px-3 py-3">
        {activeService ? (
          <>
            <div className="text-sm text-slate-500">{activeService.service_date ?? 'Service'}</div>
            <div className="truncate text-base font-medium text-slate-200">{activeService.name}</div>
          </>
        ) : (
          <div className="text-base text-slate-500">No service loaded</div>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-auto p-2">
        {!activeService || activeService.items.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-slate-600">No items — pick a service in the Services tab.</p>
        ) : (
          activeService.items.map((it) => (
            <button
              key={it.id}
              onClick={() => handleItemClick(it)}
              aria-label={`Go live: ${it.title}`}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-2.5 text-left transition-colors min-h-10 ${
                liveId === it.id
                  ? 'bg-emerald-600/15 ring-1 ring-emerald-500/50'
                  : pendingId === it.id
                  ? 'bg-amber-500/15 ring-1 ring-amber-500/40'
                  : 'hover:bg-white/[0.05]'
              }`}
            >
              <div className="w-10 shrink-0">
                <SlideThumb label="" itemStyle={it.style} serviceTheme={activeService.theme} serviceColors={activeService.themeColors} />
              </div>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{it.title}</span>
              {pendingId === it.id
                ? <span className="shrink-0 text-[10px] font-bold text-amber-400">tap to cancel</span>
                : liveId === it.id
                ? <span className="shrink-0 text-xs font-bold text-emerald-400">●</span>
                : null
              }
            </button>
          ))
        )}
      </div>
      <div className="border-t border-white/[0.06]">
        <OutputPreview />
      </div>
    </aside>
  )
}

export default ServiceRail
