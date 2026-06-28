import type { View } from './AppShell'
import { useService } from './ServiceContext'

const CARDS: { view?: View; action?: string; icon: string; color: string; label: string; sub: string }[] = [
  { action: 'multiview', icon: '⊡', color: '#ea580c', label: 'Zone screens', sub: 'Open all 4 TVs' },
  { action: 'stage',     icon: '◻', color: '#059669', label: 'Stage monitor', sub: 'Open stage display' },
  { view: 'service',     icon: '≡', color: '#2563eb', label: 'Build service',  sub: 'Songs, slides, scripture' },
  { view: 'songs',       icon: '♪', color: '#7c3aed', label: 'Song library',   sub: 'Upload & manage songs' },
  { view: 'scripture',   icon: '✦', color: '#db2777', label: 'Scripture',      sub: 'Look up Bible verses' },
  { view: 'volunteer',   icon: '👤', color: '#7c3aed', label: 'Volunteer mode', sub: 'Simple touch screen' },
]

function HomeView({ setView }: { setView: (v: View) => void }): JSX.Element {
  const { activeService } = useService()

  const handle = (card: typeof CARDS[0]): void => {
    if (card.view) setView(card.view)
    else if (card.action === 'multiview') window.wf.multiviewOpen()
    else if (card.action === 'stage') window.wf.stageOpen()
  }

  return (
    <div className="h-full overflow-auto bg-gray-50 p-6">
      <div className="mb-1 text-xl font-semibold text-gray-900">Good morning</div>
      <div className="mb-6 text-sm text-gray-400">WorshipFlow is ready</div>

      <button
        onClick={() => setView('live')}
        className="mb-4 flex w-full items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-left transition-colors hover:bg-emerald-100"
      >
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-2xl text-emerald-600">▶</div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-gray-900">Go live</div>
          <div className="truncate text-sm text-gray-500">
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
            className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50"
          >
            <span className="mb-2.5 text-2xl leading-none" style={{ color: card.color }}>{card.icon}</span>
            <div className="text-sm font-medium text-gray-900">{card.label}</div>
            <div className="text-xs text-gray-400">{card.sub}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default HomeView
