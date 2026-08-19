import { useEffect, useState, type ComponentType } from 'react'
import { ArrowRight, CalendarDays, ClipboardCheck, Play, LayoutGrid, MonitorSpeaker, ListMusic, Music, BookOpen, User, Check, TriangleAlert, Volume2 } from 'lucide-react'
import type { SongSummary } from '../../shared/types'
import type { View } from './AppShell'
import { useService } from './ServiceContext'
import { usePreflightChecks } from './usePreflightChecks'
import { computeServiceReadiness } from './serviceReadiness'
import BrandMark from './BrandMark'

type IconType = ComponentType<{ size?: number | string; className?: string }>

const CARDS: { view?: View; action?: string; Icon: IconType; label: string; sub: string }[] = [
  { action: 'multiview', Icon: LayoutGrid,     label: 'Zone screens',   sub: 'Open all 4 TVs' },
  { action: 'stage',     Icon: MonitorSpeaker, label: 'Stage monitor',  sub: 'Open stage display' },
  { view: 'service',     Icon: ListMusic,      label: 'Build service',  sub: 'Songs, slides, scripture' },
  { view: 'songs',       Icon: Music,          label: 'Song library',   sub: 'Upload & manage songs' },
  { view: 'scripture',   Icon: BookOpen,       label: 'Scripture',      sub: 'Look up Bible verses' },
  { view: 'volunteer',   Icon: User,           label: 'Volunteer mode', sub: 'Simple touch screen' },
  { view: 'soundcheck',  Icon: Volume2,        label: 'Sound check',    sub: 'Prepare the room audio' },
]

const PREFLIGHT_VIEWS: View[] = ['live', 'zones', 'service', 'obs']

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function HomeView({ setView }: { setView: (v: View) => void }): JSX.Element {
  const { activeService } = useService()
  const { checks, needsAttention } = usePreflightChecks()
  const [songs, setSongs] = useState<SongSummary[]>([])
  const hasService = activeService != null
  const hasItems = (activeService?.items.length ?? 0) > 0
  const isPublished = activeService?.published_at != null
  const readiness = activeService ? computeServiceReadiness(activeService, songs, activeService.team.people) : null
  const readyToPublish = !isPublished && hasItems && readiness?.ready === true

  useEffect(() => {
    if (!activeService) { setSongs([]); return }
    window.wf.songsList().then(setSongs)
  }, [activeService?.id, activeService?.items.length])

  const launchpad = !hasService
    ? { label: 'Start this Sunday', sub: 'Choose a Sunday template and build the order', action: 'service' as View, Icon: CalendarDays, button: 'Open Build Service' }
    : readyToPublish
    ? { label: 'Review & publish', sub: `${activeService.name} · Ready for Sunday${readiness?.warnings.length ? ` · ${readiness.warnings.length} recommendation${readiness.warnings.length === 1 ? '' : 's'}` : ''}`, action: 'service' as View, Icon: ClipboardCheck, button: 'Review service' }
    : !isPublished || !hasItems
    ? { label: 'Continue building', sub: `${activeService.name} · ${activeService.items.length} item${activeService.items.length === 1 ? '' : 's'} · ${readiness?.blocking.length ? `${readiness.blocking.length} thing${readiness.blocking.length === 1 ? '' : 's'} to fix` : 'Review before Sunday'}`, action: 'service' as View, Icon: ClipboardCheck, button: 'Open Build Service' }
    : { label: 'Go live', sub: `${activeService.name} · Published and ready for Live Control`, action: 'live' as View, Icon: Play, button: 'Open Live Control' }

  const launchpadIsLive = isPublished && hasItems

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
          <button
            key={i}
            onClick={() => setView(PREFLIGHT_VIEWS[i])}
            title="Open the related setup screen"
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium ${
              c.level === 'warn'
                ? 'border-amber-500/30 bg-amber-500/[0.08] text-amber-400'
                : c.level === 'ok'
                ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400'
                : 'border-border bg-panel text-content-secondary'
            } transition-colors hover:border-blue-500/40 hover:bg-panel-raised`}
          >
            {c.level === 'warn' ? <TriangleAlert size={13} className="shrink-0" /> : c.level === 'ok' ? <Check size={13} className="shrink-0" /> : null}
            <span className="truncate">{c.label}</span>
          </button>
        ))}
      </div>

      <button
        onClick={() => setView(launchpad.action)}
        className={`mb-4 flex w-full items-center gap-4 rounded-xl border px-5 py-4 text-left transition-colors ${
          launchpadIsLive
            ? 'border-blue-500/30 bg-blue-500/[0.10] hover:bg-blue-500/[0.16]'
            : 'border-amber-500/30 bg-amber-500/[0.08] hover:bg-amber-500/[0.14]'
        }`}
      >
        <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${launchpadIsLive ? 'bg-blue-500/15 text-blue-400' : 'bg-amber-500/15 text-amber-400'}`}>
          <launchpad.Icon size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-content-primary">{launchpad.label}</div>
          <div className="truncate text-sm text-content-secondary">{launchpad.sub}</div>
        </div>
        <div className={`flex flex-shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white ${launchpadIsLive ? 'bg-blue-600' : 'bg-amber-600'}`}>
          {launchpad.button} <ArrowRight size={14} />
        </div>
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
