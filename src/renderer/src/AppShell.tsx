import { useState } from 'react'
import { ServiceProvider } from './ServiceContext'
import TopBar from './TopBar'
import ServiceRail from './ServiceRail'
import LiveView from './LiveView'
import ServiceBuilder from './ServiceBuilder'
import SongLibrary from './SongLibrary'
import ScriptureLookup from './ScriptureLookup'

export type View = 'live' | 'service' | 'songs' | 'scripture'

function AppShell(): JSX.Element {
  const [view, setView] = useState<View>('live')
  return (
    <ServiceProvider>
      <div className="flex h-screen flex-col text-slate-100">
        <TopBar view={view} setView={setView} />
        <div className="flex min-h-0 flex-1">
          {view === 'live' && <ServiceRail />}
          <main className="min-h-0 flex-1 overflow-hidden">
            {view === 'live' ? <LiveView />
              : view === 'service' ? <ServiceBuilder />
              : view === 'songs' ? <SongLibrary />
              : <ScriptureLookup />}
          </main>
        </div>
      </div>
    </ServiceProvider>
  )
}

export default AppShell
