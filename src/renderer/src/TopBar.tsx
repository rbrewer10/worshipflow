import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { Home, Play, ListMusic, Music, Megaphone, BookOpen, Video, Image as ImageIcon, User, Monitor, Palette, Tablet, Stethoscope, Camera, HelpCircle } from 'lucide-react'
import type { AppInfo, ObsStatus, ZoneId } from '../../shared/types'
import { ZONE_IDS, ZONE_NAMES } from '../../shared/types'
import type { View } from './AppShell'
import BrandMark from './BrandMark'
import NavMenu from './NavMenu'
import type { NavMenuItem } from './NavMenu'
import OnboardingHelp from './OnboardingHelp'

type IconType = ComponentType<{ size?: number | string; className?: string }>

function elapsed(startedAt: number | null, now: number): string {
  if (!startedAt) return '0:00'
  const s = Math.max(0, Math.floor((now - startedAt) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`
}

// Three destinations stay visible because they are what gets switched between
// week to week; the rest are entered deliberately, so a menu costs nothing.
// This is the grouping the 2026-07-23 top bar spec deferred until the bottom
// dock went app-wide — it has, so this is that phase, not a reversal.
const PRIMARY_ITEMS: { id: View; Icon: IconType; label: string }[] = [
  { id: 'home', Icon: Home, label: 'Home' },
  { id: 'live', Icon: Play, label: 'Live' },
  { id: 'service', Icon: ListMusic, label: 'Build service' }
]

const LIBRARY_ITEMS: NavMenuItem<View>[] = [
  { id: 'songs', Icon: Music, label: 'Songs' },
  { id: 'announcements', Icon: Megaphone, label: 'Announcements' },
  { id: 'scripture', Icon: BookOpen, label: 'Scripture' },
  { id: 'backgrounds', Icon: ImageIcon, label: 'Backgrounds' }
]

// Sound Check (Yamaha TF-Rack) is a prototype — fake channel data, unverified
// OSC addresses/fader curve (see yamaha-controller.ts). Still absent from the
// nav until it's real; the tab/route/controller code is untouched.
const SETUP_ITEMS: NavMenuItem<View>[] = [
  { id: 'zones', Icon: Monitor, label: 'Screens & zones' },
  { id: 'obs', Icon: Video, label: 'OBS connect' },
  { id: 'settings', Icon: Palette, label: 'Logo & branding' },
  { id: 'tablet', Icon: Tablet, label: 'Tablet remote' },
  { id: 'roomfeed', Icon: Camera, label: 'Room feed' },
  { id: 'diagnostics', Icon: Stethoscope, label: 'Diagnostics & backups' }
]

function TopBar({ view, setView }: { view: View; setView: (v: View) => void }): JSX.Element {
  const [outputs, setOutputs] = useState(0)
  const [zonesConnected, setZonesConnected] = useState<ZoneId[]>([])
  const [build, setBuild] = useState<{ version: string; isPackaged: boolean } | null>(null)
  const [obs, setObs] = useState<ObsStatus | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [rehearsal, setRehearsal] = useState(false)
  const [updateReady, setUpdateReady] = useState(false)
  const [stageRehearsalActive, setStageRehearsalActive] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  useEffect(() => {
    window.wf.settingGet('has_seen_onboarding').then((v) => {
      if (v !== '1') {
        setHelpOpen(true)
        void window.wf.settingSet('has_seen_onboarding', '1')
      }
    })
  }, [])
  useEffect(() => {
    const load = (): void => {
      window.wf.getInfo().then((i: AppInfo) => {
        setOutputs(i.outputs)
        setZonesConnected(i.zonesConnected)
        setBuild({ version: i.appVersion, isPackaged: i.isPackaged })
      })
    }
    load()
    const t = setInterval(load, 2000)
    window.wf.obsGetStatus().then(setObs)
    const off = window.wf.obsOnStatus(setObs)
    window.wf.getRehearsalMode().then(setRehearsal)
    const offUpdate = window.wf.onUpdateReady(() => setUpdateReady(true))
    window.wf.getStageRehearsal().then((s) => setStageRehearsalActive(s.active))
    const offStageRehearsal = window.wf.onState((s) => setStageRehearsalActive(s.stageRehearsal.active))
    return () => { clearInterval(t); off(); offUpdate(); offStageRehearsal() }
  }, [])

  const toggleRehearsal = (): void => {
    const next = !rehearsal
    setRehearsal(next)
    void window.wf.setRehearsalMode(next)
  }

  const screenCount = outputs + zonesConnected.length
  const missingZoneNames = ZONE_IDS.filter((id) => !zonesConnected.includes(id)).map((id) => ZONE_NAMES[id])

  const onAir = Boolean(obs?.streaming || obs?.recording)
  useEffect(() => {
    if (!onAir) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [onAir])

  return (
    <header className="flex flex-shrink-0 items-center gap-1 border-b border-slate-200 bg-[#f4f6f9] px-3 py-2">
      <div className="mr-3 flex flex-shrink-0 items-center gap-2">
        <BrandMark size={26} className="flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-medium leading-tight text-slate-900">
            WorshipFlow <span className="font-normal text-slate-500">Pro</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] leading-tight text-slate-500">
            <span>v{build?.version ?? '…'}</span>
            {build && !build.isPackaged && (
              <span className="rounded bg-amber-100 px-1 font-bold text-amber-700">DEV</span>
            )}
            {updateReady && (
              <button
                onClick={() => window.wf.updateInstallNow()}
                title="A new version has finished downloading — click to restart and install it"
                className="rounded bg-emerald-600 px-1.5 py-0.5 font-bold text-white hover:bg-emerald-700"
              >
                Restart to update
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Named so tests and screen readers can address this nav specifically —
          the app-wide bottom drawer renders its own buttons with the same
          labels as some of these destinations. */}
      <nav aria-label="Main" className="flex min-w-0 flex-1 items-center gap-1">
        {PRIMARY_ITEMS.map(({ id, Icon, label }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              view === id
                ? 'bg-blue-600 font-medium text-white'
                : 'font-normal text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
            }`}
          >
            <Icon size={15} className="flex-shrink-0" />
            {label}
          </button>
        ))}
        <NavMenu label="Library" items={LIBRARY_ITEMS} activeId={view} onSelect={setView} />
        <NavMenu label="Setup" items={SETUP_ITEMS} activeId={view} onSelect={setView} />
      </nav>

      <div className="flex flex-shrink-0 items-center gap-2">
        <button
          onClick={toggleRehearsal}
          title={rehearsal ? 'Rehearsing — real outputs show nothing. Click to disarm.' : 'Arm rehearsal mode — real outputs will show nothing while you practice'}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
            rehearsal ? 'bg-amber-500 text-black' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
          }`}
        >
          {rehearsal ? 'Rehearsing' : 'Rehearsal'}
        </button>

        {stageRehearsalActive && (
          <button
            onClick={() => setView('live')}
            title="Stage Rehearsal is armed — Zone 4 is looping the rehearsal song, Zones 1-3 are looping announcements. Click to go manage it."
            className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-1.5 ring-1 ring-violet-500/30 hover:bg-violet-500/20"
          >
            <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-violet-500" />
            <span className="text-xs font-bold uppercase tracking-wide text-violet-700">
              Stage Rehearsal active
            </span>
          </button>
        )}

        {rehearsal ? (
          <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 ring-1 ring-amber-500/30" title="Rehearsal mode is armed — real outputs are showing nothing, regardless of what's happening here">
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
            <span className="text-xs font-bold uppercase tracking-wide text-amber-700">
              Outputs held back
            </span>
          </div>
        ) : screenCount > 0 ? (
          <div
            className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 ring-1 ring-red-500/30"
            title={missingZoneNames.length > 0
              ? `Real screens are connected — anything sent live reaches the congregation. Not connected: ${missingZoneNames.join(', ')}.`
              : 'Real screens are connected — anything sent live reaches the congregation'}
          >
            <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-red-500" />
            <span className="text-xs font-bold uppercase tracking-wide text-red-700">
              Live armed · {screenCount} screen{screenCount !== 1 ? 's' : ''}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-400" />
            <span className="text-xs text-slate-500">No output</span>
            <button
              onClick={() => window.wf.outputOpen()}
              className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Open on projector
            </button>
          </div>
        )}

        {onAir && (
          <>
            {obs?.streaming && (
              <div className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-1">
                <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-red-500" />
                <span className="text-xs font-bold uppercase tracking-wide text-red-700">Live</span>
                <span className="font-mono text-xs tabular-nums text-red-700">{elapsed(obs.streamStartedAt, now)}</span>
              </div>
            )}
            {obs?.recording && (
              <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1">
                <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-amber-500" />
                <span className="text-xs font-bold uppercase tracking-wide text-amber-700">Rec</span>
                <span className="font-mono text-xs tabular-nums text-amber-700">{elapsed(obs.recordStartedAt, now)}</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="ml-2 flex flex-shrink-0 items-center border-l border-slate-200 pl-3">
        <button
          onClick={() => setView('volunteer')}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
            view === 'volunteer'
              ? 'border-blue-600 bg-blue-600 text-white'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          <User size={15} className="flex-shrink-0" />
          Volunteer mode
        </button>
        <button
          onClick={() => setHelpOpen(true)}
          title="Quick start help"
          className="ml-1.5 flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-100"
        >
          <HelpCircle size={15} />
        </button>
      </div>
      {helpOpen && (
        <OnboardingHelp
          onClose={() => setHelpOpen(false)}
          onGoToVolunteer={() => { setView('volunteer'); setHelpOpen(false) }}
        />
      )}
    </header>
  )
}

export default TopBar
