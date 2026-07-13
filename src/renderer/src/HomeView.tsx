import type { ComponentType } from 'react'
import { Play, LayoutGrid, MonitorSpeaker, ListMusic, Music, BookOpen, User } from 'lucide-react'
import type { View } from './AppShell'
import { useService } from './ServiceContext'

type IconType = ComponentType<{ size?: number | string; className?: string }>

const CARDS: { view?: View; action?: string; Icon: IconType; label: string; sub: string }[] = [
  { action: 'multiview', Icon: LayoutGrid,     label: 'Zone screens',   sub: 'Open all 4 TVs' },
  { action: 'stage',     Icon: MonitorSpeaker, label: 'Stage monitor',  sub: 'Open stage display' },
  { view: 'service',     Icon: ListMusic,      label: 'Build service',  sub: 'Songs, slides, scripture' },
  { view: 'songs',       Icon: Music,          label: 'Song library',   sub: 'Upload & manage songs' },
  { view: 'scripture',   Icon: BookOpen,       label: 'Scripture',      sub: 'Look up Bible verses' },
  { view: 'volunteer',   Icon: User,           label: 'Volunteer mode', sub: 'Simple touch screen' },
]

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function HomeView({ setView }: { setView: (v: View) => void }): JSX.Element {
  const { activeService } = useService()

  const handle = (card: typeof CARDS[0]): void => {
    if (card.view) setView(card.view)
    else if (card.action === 'multiview') window.wf.multiviewOpen()
    else if (card.action === 'stage') window.wf.stageOpen()
  }

  return (
    <div className="h-full overflow-auto bg-[#e9ecf1] p-6">
      <div className="mb-1 text-xl font-semibold text-slate-900">{greeting()}</div>
      <div className="mb-6 text-sm text-slate-500">WorshipFlow is ready</div>

      <button
        onClick={() => setView('live')}
        className="mb-4 flex w-full items-center gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.10] px-5 py-4 text-left transition-colors hover:bg-emerald-500/[0.16]"
      >
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600">
          <Play size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-slate-900">Go live</div>
          <div className="truncate text-sm text-slate-600">
            {activeService
              ? `${activeService.name} — ${activeService.items.length} item${activeService.items.length !== 1 ? 's' : ''} loaded`
              : 'Open live control'}
          </div>
        </div>
        <div className="flex-shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Start</div>
      </button>

      <div className="grid grid-cols-3 gap-3">
        {CARDS.map((card) => (
          <button
            key={card.label}
            onClick={() => handle(card)}
            className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <card.Icon size={20} className="mb-2.5 text-slate-500" />
            <div className="text-sm font-medium text-slate-900">{card.label}</div>
            <div className="text-xs text-slate-500">{card.sub}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default HomeView
