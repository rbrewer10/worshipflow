import { useState, useEffect } from 'react'
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

  // Global keyboard shortcuts for live control (available from any tab)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Don't intercept while typing in a field
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      // Ignore if modifier keys are held (avoid interfering with app shortcuts)
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const key = e.key.toLowerCase()

      // B = black screen
      if (key === 'b') {
        e.preventDefault()
        window.wf.sendIntent('black')
        return
      }

      // L = logo screen
      if (key === 'l') {
        e.preventDefault()
        window.wf.sendIntent('logo')
        return
      }

      // N = next slide/item
      if (key === 'n') {
        e.preventDefault()
        window.wf.sendIntent('next')
        return
      }

      // P = previous slide/item
      if (key === 'p') {
        e.preventDefault()
        window.wf.sendIntent('prev')
        return
      }

      // S = toggle lyrics/slides display
      if (key === 's') {
        e.preventDefault()
        window.wf.sendIntent('lyrics')
        return
      }

      // Space or ArrowRight = next slide
      if (key === ' ' || key === 'arrowright') {
        e.preventDefault()
        window.wf.sendIntent('next').catch(console.error)
        return
      }

      // ArrowLeft = previous slide
      if (key === 'arrowleft') {
        e.preventDefault()
        window.wf.sendIntent('prev').catch(console.error)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
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
