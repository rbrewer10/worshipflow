import { useState } from 'react'
import { ServiceProvider } from './ServiceContext'
import Sidebar from './Sidebar'
import ServiceRail from './ServiceRail'
import HomeView from './HomeView'
import LiveView from './LiveView'
import ServiceBuilder from './ServiceBuilder'
import SongLibrary from './SongLibrary'
import ScriptureLookup from './ScriptureLookup'
import VolunteerView from './VolunteerView'
import LogoSettings from './LogoSettings'

export type View = 'home' | 'live' | 'service' | 'songs' | 'scripture' | 'volunteer' | 'settings'

function AppShell(): JSX.Element {
  const [view, setView] = useState<View>('home')
  if (view === 'volunteer') {
    return (
      <ServiceProvider>
        <VolunteerView onExit={() => setView('home')} />
      </ServiceProvider>
    )
  }
  return (
    <ServiceProvider>
      <div className="flex h-screen flex-row overflow-hidden bg-gray-50 text-gray-900">
        <Sidebar view={view} setView={setView} />
        <div className="flex min-w-0 flex-1 flex-col">
          {view === 'home' ? (
            <HomeView setView={setView} />
          ) : view === 'live' ? (
            <div className="flex min-h-0 flex-1">
              <ServiceRail />
              <main className="min-h-0 flex-1 overflow-hidden"><LiveView /></main>
            </div>
          ) : view === 'service' ? (
            <ServiceBuilder />
          ) : view === 'songs' ? (
            <SongLibrary />
          ) : view === 'settings' ? (
            <LogoSettings />
          ) : (
            <ScriptureLookup />
          )}
        </div>
      </div>
    </ServiceProvider>
  )
}

export default AppShell
