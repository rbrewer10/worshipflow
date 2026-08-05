import { useEffect, useState } from 'react'
import { Hourglass } from 'lucide-react'
import type { LiveState, ServiceItem } from '../../shared/types'
import { useService } from './ServiceContext'
import SlideThumb from './SlideThumb'
import LiveZoneStatus from './zones/LiveZoneStatus'
import LooksPanel from './zones/LooksPanel'
import { sendItemLive, itemThumbBackground, usePendingConfirm } from './liveActions'

// Persistent left rail: the loaded service's items + the pinned zone status.
function ServiceRail(): JSX.Element {
  const { activeService } = useService()
  const [live, setLive] = useState<LiveState | null>(null)
  const { pendingKey, trigger, cancel } = usePendingConfirm()
  const [songBg, setSongBg] = useState<Record<number, string | null>>({})
  useEffect(() => {
    const off = window.wf.onState((s) => setLive(s.main))
    window.wf.getState('main').then(setLive)
    // Also cancel a pending tap-to-confirm on unmount so it can't fire the
    // wrong item live after the operator navigates away from the Live tab.
    return () => { off(); cancel() }
  }, [cancel])

  useEffect(() => {
    window.wf.songsList().then((list) => {
      const map: Record<number, string | null> = {}
      list.forEach((s) => { map[s.id] = s.background ?? null })
      setSongBg(map)
    })
  }, [activeService?.id, activeService?.items.length])

  const liveId = live?.liveServiceItemId ?? null

  const handleItemClick = (it: ServiceItem): void => {
    trigger(String(it.id), () => { sendItemLive(it, 'main') })
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-[#f4f6f9]">
      <div className="border-b border-slate-200 px-3 py-3">
        {activeService ? (
          <>
            <div className="text-sm text-slate-500">{activeService.service_date ?? 'Service'}</div>
            <div className="truncate text-base font-medium text-slate-900">{activeService.name}</div>
          </>
        ) : (
          <div className="text-base text-slate-500">No service loaded</div>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-auto p-2">
        {(() => {
          // This rail is Main-only (same scope as the zone status it's pinned
          // above) — without this filter, Second-track items would interleave by
          // per-track ordinal and tapping one would incorrectly go live on Main.
          const mainItems = activeService?.items.filter((it) => it.track === 'main') ?? []
          return mainItems.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-slate-400">No items — pick a service in the Services tab.</p>
          ) : (
            mainItems.map((it) => (
              <button
                key={it.id}
                onClick={() => handleItemClick(it)}
                aria-label={`Go live: ${it.title}`}
                className={`relative flex w-full items-center gap-2 rounded-md px-2 py-2.5 text-left transition-colors min-h-10 ${
                  liveId === it.id
                    ? 'bg-blue-600/15 ring-1 ring-blue-500/50'
                    : pendingKey === String(it.id)
                    ? 'bg-amber-500/20 ring-2 ring-amber-500/60'
                    : 'hover:bg-slate-100'
                }`}
              >
                {pendingKey === String(it.id) && (
                  <div className="absolute inset-0 rounded-md border-2 border-amber-400 animate-pulse" />
                )}
                <div className="w-10 shrink-0">
                  <SlideThumb label="" itemStyle={it.style} serviceTheme={activeService?.theme ?? null} serviceColors={activeService?.themeColors ?? null} bgFile={itemThumbBackground(it, songBg)} />
                </div>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{it.title}</span>
                {pendingKey === String(it.id)
                  ? <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-amber-700"><Hourglass size={11} /> tap to cancel</span>
                  : liveId === it.id
                  ? <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                  : null
                }
              </button>
            ))
          )
        })()}
      </div>
      <div className="border-t border-slate-200">
        <LiveZoneStatus />
      </div>
      <div className="border-t border-slate-200">
        <LooksPanel />
      </div>
    </aside>
  )
}

export default ServiceRail
