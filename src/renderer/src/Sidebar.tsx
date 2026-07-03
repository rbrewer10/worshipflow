import { useEffect, useState } from 'react'
import type { AppInfo } from '../../shared/types'
import type { View } from './AppShell'

function Sidebar({ view, setView }: { view: View; setView: (v: View) => void }): JSX.Element {
  const [outputs, setOutputs] = useState(0)
  useEffect(() => {
    const load = (): void => { window.wf.getInfo().then((i: AppInfo) => setOutputs(i.outputs)) }
    load()
    const t = setInterval(load, 2000)
    return () => clearInterval(t)
  }, [])

  const nav = (v: View, icon: string, label: string): JSX.Element => (
    <button
      key={v}
      onClick={() => setView(v)}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        view === v
          ? 'bg-white/[0.08] font-medium text-white'
          : 'font-normal text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
      }`}
    >
      <span className="w-4 flex-shrink-0 text-center leading-none">{icon}</span>
      {label}
    </button>
  )

  return (
    <aside className="flex w-44 flex-shrink-0 flex-col border-r border-white/[0.07] bg-[#141418]">
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-3">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-emerald-500 text-sm font-bold text-emerald-950">✝</div>
        <span className="text-sm font-medium text-white">WorshipFlow</span>
      </div>

      <div className="border-b border-white/[0.07] p-2">
        {outputs > 0
          ? <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2">
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-400" />
              <span className="text-xs font-semibold text-emerald-400">{outputs} screen{outputs !== 1 ? 's' : ''} live</span>
            </div>
          : <div className="flex items-center gap-1.5 rounded-lg px-3 py-2">
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-600" />
              <span className="text-xs text-slate-500">No output</span>
            </div>
        }
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        <p className="mb-0.5 px-3 pt-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Live</p>
        {nav('home', '⊞', 'Home')}
        {nav('live', '▶', 'Live control')}
        <button
          onClick={() => window.wf.multiviewOpen()}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-normal text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
        >
          <span className="w-4 flex-shrink-0 text-center leading-none">⊡</span>
          Zone screens
        </button>
        <button
          onClick={() => window.wf.stageOpen()}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-normal text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
        >
          <span className="w-4 flex-shrink-0 text-center leading-none">◻</span>
          Stage monitor
        </button>

        <p className="mb-0.5 mt-3 px-3 pt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Prepare</p>
        {nav('service', '≡', 'Build service')}
        {nav('songs', '♪', 'Song library')}
        {nav('scripture', '✦', 'Scripture')}

        <p className="mb-0.5 mt-3 px-3 pt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Setup</p>
        {nav('soundcheck', '◉', 'Sound check')}
        {nav('settings', '⚙', 'Logo & background')}
      </nav>

      <div className="border-t border-white/[0.07] p-2 space-y-0.5">
        <button
          onClick={() => setView('volunteer')}
          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
            view === 'volunteer'
              ? 'bg-violet-600/20 font-medium text-violet-300'
              : 'font-normal text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
          }`}
        >
          <span className="w-4 flex-shrink-0 text-center leading-none">👤</span>
          Volunteer mode
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
