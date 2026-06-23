import { useEffect, useState } from 'react'
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
  useEffect(() => {
    const off = window.wf.onState(setLive)
    window.wf.getState().then(setLive)
    return off
  }, [])
  const liveId = live?.liveServiceItemId ?? null

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-white/[0.07] bg-[#121216]">
      <div className="border-b border-white/[0.06] px-3 py-2">
        {activeService ? (
          <>
            <div className="text-[10px] text-slate-500">{activeService.service_date ?? 'Service'}</div>
            <div className="truncate text-xs font-medium text-slate-200">{activeService.name}</div>
          </>
        ) : (
          <div className="text-xs text-slate-500">No service loaded</div>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-auto p-1.5">
        {!activeService || activeService.items.length === 0 ? (
          <p className="px-2 py-4 text-center text-[11px] text-slate-600">No items — pick a service in the Services tab.</p>
        ) : (
          activeService.items.map((it) => (
            <button
              key={it.id}
              onClick={() => sendItemLive(it)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                liveId === it.id ? 'bg-blue-600/20 ring-1 ring-blue-500/40' : 'hover:bg-white/[0.05]'
              }`}
            >
              <div className="w-9 shrink-0">
                <SlideThumb label="" itemStyle={it.style} serviceTheme={activeService.theme} serviceColors={activeService.themeColors} />
              </div>
              <span className="text-xs">{ICON[it.type]}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">{it.title}</span>
              {liveId === it.id && <span className="text-[9px] font-bold text-emerald-400">●</span>}
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
