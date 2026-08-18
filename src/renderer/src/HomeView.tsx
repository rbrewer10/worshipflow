import type { ComponentType } from 'react'
import { Play, LayoutGrid, MonitorSpeaker, ListMusic, Music, BookOpen, User, Check, TriangleAlert } from 'lucide-react'
import type { View } from './AppShell'
import { useService } from './ServiceContext'
import { usePreflightChecks } from './usePreflightChecks'
import BrandMark from './BrandMark'

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
  const { checks, needsAttention } = usePreflightChecks()

  const handle = (card: typeof CARDS[0]): void => {
    if (card.view) setView(card.view)
    else if (card.action === 'multiview') window.wf.multiviewOpen()
    else if (card.action === 'stage') window.wf.stageOpen()
  }

  return (
    <div className="h-full overflow-auto bg-app p-6">
      <div className="mb-5 flex items-center gap-3">
        <BrandMark size={40} className="flex-shrink-0 rounded-[9px] shadow-sm" />
        <h1 className="flex items-baseline gap-1.5">
          <span className="text-2xl font-extrabold tracking-tight text-content-primary">WorshipFlow</span>
          <span className="text-base font-bold tracking-wide text-blue-400">PRO</span>
        </h1>
      </div>
      <div className="mb-1 text-xl font-semibold text-content-primary">{greeting()}</div>
      <div className="mb-3 text-sm text-content-secondary">
        {needsAttention ? 'A few things to check before you go live' : 'Ready when you are'}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {checks.map((c, i) => (
          <div
            key={i}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium ${
              c.level === 'warn'
                ? 'border-amber-500/30 bg-amber-500/[0.08] text-amber-400'
                : c.level === 'ok'
                ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400'
                : 'border-border bg-panel text-content-secondary'
            }`}
          >
            {c.level === 'warn' ? <TriangleAlert size={13} className="shrink-0" /> : c.level === 'ok' ? <Check size={13} className="shrink-0" /> : null}
            <span className="truncate">{c.label}</span>
          </div>
        ))}
      </div>

      <button
        onClick={() => setView('live')}
        className="mb-4 flex w-full items-center gap-4 rounded-xl border border-blue-500/30 bg-blue-500/[0.10] px-5 py-4 text-left transition-colors hover:bg-blue-500/[0.16]"
      >
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
          <Play size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-content-primary">Go live</div>
          <div className="truncate text-sm text-content-secondary">
            {activeService
              ? `${activeService.name} — ${activeService.items.length} item${activeService.items.length !== 1 ? 's' : ''} loaded`
              : 'Open live control'}
          </div>
        </div>
        <div className="flex-shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Start</div>
      </button>

      <div className="grid grid-cols-3 gap-3">
        {CARDS.map((card) => (
          <button key={card.label} onClick={() => handle(card)} className="card-interactive flex flex-col text-left">
            <card.Icon size={20} className="mb-2.5 text-content-secondary" />
            <div className="text-sm font-medium text-content-primary">{card.label}</div>
            <div className="text-xs text-content-secondary">{card.sub}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default HomeView
