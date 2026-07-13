import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { Home, Play, LayoutGrid, MonitorSpeaker, ListMusic, Music, Megaphone, BookOpen, Mic, Image as ImageIcon, User } from 'lucide-react'
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

function Sidebar({ view, setView }: { view: View; setView: (v: View) => void }): JSX.Element {
  const [outputs, setOutputs] = useState(0)
  const [obs, setObs] = useState<ObsStatus | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const load = (): void => { window.wf.getInfo().then((i: AppInfo) => setOutputs(i.outputs)) }
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

  const nav = (v: View, Icon: IconType, label: string): JSX.Element => (
    <button
      key={v}
      onClick={() => setView(v)}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        view === v
          ? 'bg-emerald-500/12 font-medium text-emerald-800'
          : 'font-normal text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
      }`}
    >
      <Icon size={15} className="w-4 flex-shrink-0" />
      {label}
    </button>
  )

  return (
    <aside className="flex w-44 flex-shrink-0 flex-col border-r border-slate-200 bg-[#f4f6f9]">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-3">
        <BrandMark size={28} className="flex-shrink-0" />
        <span className="text-sm font-medium text-slate-900">WorshipFlow <span className="font-normal text-slate-500">Pro</span></span>
      </div>

      <div className="border-b border-slate-200 p-2">
        {outputs > 0
          ? <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2">
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold text-emerald-700">{outputs} screen{outputs !== 1 ? 's' : ''} live</span>
            </div>
          : <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 rounded-lg px-3 py-2">
                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-400" />
                <span className="text-xs text-slate-500">No output</span>
              </div>
              <button
                onClick={() => window.wf.outputOpen()}
                className="w-full rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Open on projector
              </button>
            </div>
        }
      </div>

      {/* OBS on-air indicator — visible from every tab so you never stay live by accident */}
      {onAir && (
        <div className="space-y-1 border-b border-slate-200 p-2">
          {obs?.streaming && (
            <div className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5">
              <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-red-500" />
              <span className="text-xs font-bold uppercase tracking-wide text-red-700">Live</span>
              <span className="ml-auto font-mono text-xs tabular-nums text-red-700">{elapsed(obs.streamStartedAt, now)}</span>
            </div>
          )}
          {obs?.recording && (
            <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5">
              <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-amber-500" />
              <span className="text-xs font-bold uppercase tracking-wide text-amber-700">Rec</span>
              <span className="ml-auto font-mono text-xs tabular-nums text-amber-700">{elapsed(obs.recordStartedAt, now)}</span>
            </div>
          )}
        </div>
      )}

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        <p className="mb-0.5 px-3 pt-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Live</p>
        {nav('home', Home, 'Home')}
        {nav('live', Play, 'Live control')}
        <button
          onClick={() => window.wf.multiviewOpen()}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-normal text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
        >
          <LayoutGrid size={15} className="w-4 flex-shrink-0" />
          Zone screens
        </button>
        <button
          onClick={() => window.wf.stageOpen()}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-normal text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
        >
          <MonitorSpeaker size={15} className="w-4 flex-shrink-0" />
          Stage monitor
        </button>

        <p className="mb-0.5 mt-3 px-3 pt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Prepare</p>
        {nav('service', ListMusic, 'Build service')}
        {nav('songs', Music, 'Song library')}
        {nav('announcements', Megaphone, 'Announcements')}
        {nav('scripture', BookOpen, 'Scripture')}

        <p className="mb-0.5 mt-3 px-3 pt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Setup</p>
        {nav('soundcheck', Mic, 'Sound check')}
        {nav('settings', ImageIcon, 'Logo & background')}
      </nav>

      <div className="border-t border-slate-200 p-2 space-y-0.5">
        <button
          onClick={() => setView('volunteer')}
          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
            view === 'volunteer'
              ? 'bg-emerald-500/12 font-medium text-emerald-800'
              : 'font-normal text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
          }`}
        >
          <User size={15} className="w-4 flex-shrink-0" />
          Volunteer mode
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
