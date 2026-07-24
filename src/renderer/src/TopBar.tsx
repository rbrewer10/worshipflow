import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { Home, Play, ListMusic, Music, Megaphone, BookOpen, Mic, Image as ImageIcon, User } from 'lucide-react'
import type { AppInfo, ObsStatus } from '../../shared/types'
import type { View } from './AppShell'
import BrandMark from './BrandMark'

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

const NAV_ITEMS: { id: View; Icon: IconType; label: string }[] = [
  { id: 'home', Icon: Home, label: 'Home' },
  { id: 'live', Icon: Play, label: 'Live' },
  { id: 'service', Icon: ListMusic, label: 'Build Service' },
  { id: 'songs', Icon: Music, label: 'Songs' },
  { id: 'announcements', Icon: Megaphone, label: 'Announcements' },
  { id: 'scripture', Icon: BookOpen, label: 'Scripture' },
  { id: 'soundcheck', Icon: Mic, label: 'Sound Check' },
  { id: 'settings', Icon: ImageIcon, label: 'Logo & BG' }
]

function TopBar({ view, setView }: { view: View; setView: (v: View) => void }): JSX.Element {
  const [outputs, setOutputs] = useState(0)
  const [build, setBuild] = useState<{ version: string; isPackaged: boolean } | null>(null)
  const [obs, setObs] = useState<ObsStatus | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const load = (): void => {
      window.wf.getInfo().then((i: AppInfo) => {
        setOutputs(i.outputs)
        setBuild({ version: i.appVersion, isPackaged: i.isPackaged })
      })
    }
    load()
    const t = setInterval(load, 2000)
    window.wf.obsGetStatus().then(setObs)
    const off = window.wf.obsOnStatus(setObs)
    return () => { clearInterval(t); off() }
  }, [])

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
          </div>
        </div>
      </div>

      <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {NAV_ITEMS.map(({ id, Icon, label }) => (
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
      </nav>

      <div className="flex flex-shrink-0 items-center gap-2">
        {outputs > 0 ? (
          <div className="flex items-center gap-1.5 rounded-lg bg-blue-500/10 px-3 py-1.5">
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
            <span className="text-xs font-semibold text-blue-700">
              {outputs} screen{outputs !== 1 ? 's' : ''} live
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
      </div>
    </header>
  )
}

export default TopBar
