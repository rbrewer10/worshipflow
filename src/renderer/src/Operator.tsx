import { useState } from 'react'
import type { ReactNode } from 'react'
import LiveView from './LiveView'
import SongLibrary from './SongLibrary'

// Operator shell: global nav + the active view. Phase 1 adds the Songs tab
// alongside the Phase 0 Live control surface.
type View = 'live' | 'songs'

function Operator(): JSX.Element {
  const [view, setView] = useState<View>('live')

  return (
    <div className="flex h-screen flex-col bg-[#0b0f17] text-slate-100">
      <nav className="flex items-center gap-1 border-b border-white/10 px-4 py-2">
        <span className="mr-4 text-sm font-semibold">✝ WorshipFlow</span>
        <Tab active={view === 'live'} onClick={() => setView('live')}>
          Live
        </Tab>
        <Tab active={view === 'songs'} onClick={() => setView('songs')}>
          Songs
        </Tab>
      </nav>
      <div className="min-h-0 flex-1">{view === 'live' ? <LiveView /> : <SongLibrary />}</div>
    </div>
  )
}

function Tab({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
        active ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  )
}

export default Operator
