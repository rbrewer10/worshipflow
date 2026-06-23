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
    <header className="flex items-center gap-3 border-b border-white/[0.07] bg-[#141418] px-4 py-2.5">
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500 text-sm font-bold text-[#06270f]">✝</div>
      <span className="text-sm font-medium text-white">WorshipFlow</span>
      <div className="flex flex-1 justify-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              view === t.id ? 'bg-[#26262c] text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.live && <span className={`h-1.5 w-1.5 rounded-full ${outputs > 0 ? 'bg-emerald-400' : 'bg-slate-600'}`} />}
            {t.label}
          </button>
        ))}
      </div>
      <span className={`text-[11px] font-medium ${outputs > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
        {outputs > 0 ? `● ${outputs} output${outputs === 1 ? '' : 's'}` : '○ no output'}
      </span>
      <button
        onClick={() => window.wf.stageOpen()}
        title="Open stage display"
        className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
      >
        ✝ Stage
      </button>
    </header>
  )
}

export default TopBar
