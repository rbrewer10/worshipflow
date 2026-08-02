import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { Play, LayoutGrid, MonitorSpeaker, ListMusic, Music, BookOpen, User, Check, TriangleAlert } from 'lucide-react'
import type { View } from './AppShell'
import type { AppInfo, ObsStatus, ZoneId } from '../../shared/types'
import { ZONE_IDS, ZONE_NAMES } from '../../shared/types'
import { useService } from './ServiceContext'
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

// A row's status. 'ok' and 'warn' are opinions ("this probably needs
// attention before Sunday"); 'info' is neutral — not every church streams
// every service, so no OBS connection isn't itself a problem.
type PreflightLevel = 'ok' | 'warn' | 'info'

function HomeView({ setView }: { setView: (v: View) => void }): JSX.Element {
  const { activeService } = useService()
  const [outputs, setOutputs] = useState(0)
  const [zonesConnected, setZonesConnected] = useState<ZoneId[]>([])
  const [rehearsal, setRehearsal] = useState(false)
  const [obs, setObs] = useState<ObsStatus | null>(null)

  // Startup preflight: the app used to say "Ready when you are" unconditionally,
  // with no way to tell whether outputs are actually connected, rehearsal mode
  // was left armed, or a service is even loaded. This surfaces that state
  // up front instead of leaving the operator to discover it live.
  useEffect(() => {
    const load = (): void => {
      window.wf.getInfo().then((i: AppInfo) => { setOutputs(i.outputs); setZonesConnected(i.zonesConnected) })
      window.wf.getRehearsalMode().then(setRehearsal)
    }
    load()
    const t = setInterval(load, 2000)
    window.wf.obsGetStatus().then(setObs)
    const off = window.wf.obsOnStatus(setObs)
    return () => { clearInterval(t); off() }
  }, [])

  const screenCount = outputs + zonesConnected.length
  const missingZoneNames = ZONE_IDS.filter((id) => !zonesConnected.includes(id)).map((id) => ZONE_NAMES[id])

  const checks: { level: PreflightLevel; label: string }[] = [
    rehearsal
      ? { level: 'warn', label: 'Rehearsal mode is armed — real outputs are showing nothing' }
      : { level: 'ok', label: 'Rehearsal mode off' },
    screenCount === 0
      ? { level: 'warn', label: 'No screens connected yet' }
      : missingZoneNames.length > 0
      ? { level: 'warn', label: `${screenCount} screen${screenCount !== 1 ? 's' : ''} connected — ${missingZoneNames.join(', ')} not connected` }
      : { level: 'ok', label: `${screenCount} screen${screenCount !== 1 ? 's' : ''} connected` },
    activeService
      ? { level: 'ok', label: `"${activeService.name}" loaded` }
      : { level: 'warn', label: 'No service loaded yet' },
    { level: obs?.connected ? 'ok' : 'info', label: obs?.connected ? 'OBS connected' : 'OBS not connected' }
  ]
  const needsAttention = checks.some((c) => c.level === 'warn')

  const handle = (card: typeof CARDS[0]): void => {
    if (card.view) setView(card.view)
    else if (card.action === 'multiview') window.wf.multiviewOpen()
    else if (card.action === 'stage') window.wf.stageOpen()
  }

  return (
    <div className="h-full overflow-auto bg-[#e9ecf1] p-6">
      <div className="mb-5 flex items-center gap-3">
        <BrandMark size={40} className="flex-shrink-0 rounded-[9px] shadow-sm" />
        <h1 className="flex items-baseline gap-1.5">
          <span className="text-2xl font-extrabold tracking-tight text-slate-900">WorshipFlow</span>
          <span className="text-base font-bold tracking-wide text-blue-600">PRO</span>
        </h1>
      </div>
      <div className="mb-1 text-xl font-semibold text-slate-900">{greeting()}</div>
      <div className="mb-3 text-sm text-slate-500">
        {needsAttention ? 'A few things to check before you go live' : 'Ready when you are'}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {checks.map((c, i) => (
          <div
            key={i}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium ${
              c.level === 'warn'
                ? 'border-amber-500/30 bg-amber-500/[0.08] text-amber-800'
                : c.level === 'ok'
                ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-800'
                : 'border-slate-200 bg-white text-slate-500'
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
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600">
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
        <div className="flex-shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Start</div>
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
