import { useEffect, useState } from 'react'
import type { AppInfo } from '../../shared/types'
import type { View } from './AppShell'

const TABS: { id: View; label: string; live?: boolean }[] = [
  { id: 'live', label: 'Live', live: true },
  { id: 'service', label: 'Services' },
  { id: 'songs', label: 'Songs' },
  { id: 'scripture', label: 'Scripture' }
]

function TopBar({ view, setView }: { view: View; setView: (v: View) => void }): JSX.Element {
  const [outputs, setOutputs] = useState(0)
  useEffect(() => {
    const load = (): void => { window.wf.getInfo().then((i: AppInfo) => setOutputs(i.outputs)) }
    load()
    const t = setInterval(load, 2000)
    return () => clearInterval(t)
  }, [])

  return (
    <header className="flex items-center gap-3 border-b border-white/[0.07] bg-[#141418] px-4 py-3.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500 text-base font-bold text-[#06270f]">✝</div>
      <span className="text-base font-medium text-white">WorshipFlow</span>
      <div className="flex flex-1 justify-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={`flex items-center gap-2 px-6 py-2.5 text-base font-medium transition-colors ${
              view === t.id
                ? 'border-b-2 border-emerald-400 text-white'
                : 'rounded-md text-slate-300 hover:text-slate-100'
            }`}
          >
            {t.live && <span className={`h-2 w-2 rounded-full ${outputs > 0 ? 'bg-emerald-400' : 'bg-slate-600'}`} />}
            {t.label}
          </button>
        ))}
      </div>
      {outputs > 0
        ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300 ring-1 ring-emerald-500/40">● {outputs} live</span>
        : <span className="text-xs text-slate-600">○ no output</span>
      }
      <button
        onClick={() => setView('volunteer')}
        title="Switch to simplified volunteer view"
        className={`rounded px-2 py-1 text-xs font-semibold ${view === 'volunteer' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'}`}
      >
        👤 Volunteer
      </button>
      <button
        onClick={() => window.wf.stageOpen()}
        title="Open stage display"
        className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
      >
        ✝ Stage
      </button>
      <button
        onClick={() => window.wf.multiviewOpen()}
        title="Open all 4 zones on second monitor"
        className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
      >
        ▣ Zones
      </button>
    </header>
  )
}

export default TopBar
