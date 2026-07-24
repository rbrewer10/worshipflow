import { useState, useEffect } from 'react'
import { ServiceProvider } from './ServiceContext'
import TopBar from './TopBar'
import ServiceRail from './ServiceRail'
import HomeView from './HomeView'
import LiveView from './LiveView'
import LiveDrawer from './LiveDrawer'
import ServiceBuilder from './ServiceBuilder'
import SongLibrary from './SongLibrary'
import AnnouncementsLibrary from './AnnouncementsLibrary'
import ScriptureLookup from './ScriptureLookup'
import VolunteerView from './VolunteerView'
import LogoSettings from './LogoSettings'
import SoundCheckTab from './sound-check/SoundCheckTab'
import NotifyToasts from './NotifyToasts'

export type View = 'home' | 'live' | 'service' | 'songs' | 'announcements' | 'scripture' | 'volunteer' | 'settings' | 'soundcheck'

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
        window.wf.sendIntent('main', 'black')
        return
      }

      // L = logo screen
      if (key === 'l') {
        e.preventDefault()
        window.wf.sendIntent('main', 'logo')
        return
      }

      // N = next slide/item
      if (key === 'n') {
        e.preventDefault()
        window.wf.sendIntent('main', 'next')
        return
      }

      // P = previous slide/item
      if (key === 'p') {
        e.preventDefault()
        window.wf.sendIntent('main', 'prev')
        return
      }

      // S = toggle lyrics/slides display
      if (key === 's') {
        e.preventDefault()
        window.wf.sendIntent('main', 'lyrics')
        return
      }

      // Space or ArrowRight = next slide
      if (key === ' ' || key === 'arrowright') {
        e.preventDefault()
        window.wf.sendIntent('main', 'next')
        return
      }

      // ArrowLeft = previous slide
      if (key === 'arrowleft') {
        e.preventDefault()
        window.wf.sendIntent('main', 'prev')
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Restore recovery state after renderer is ready and activeServiceItems is populated
  useEffect(() => {
    window.wf.restoreRecovery().catch(err => {
      console.error('Failed to restore recovery state:', err)
    })
  }, [])

  if (view === 'volunteer') {
    return (
      <ServiceProvider>
        <NotifyToasts />
        <VolunteerView onExit={() => setView('home')} />
      </ServiceProvider>
    )
  }
  return (
    <ServiceProvider>
      <NotifyToasts />
      <div className="flex h-screen flex-col overflow-hidden bg-[#e9ecf1] text-slate-900">
        <TopBar view={view} setView={setView} />
        <div className="flex min-h-0 flex-1 flex-col">
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
          ) : view === 'announcements' ? (
            <AnnouncementsLibrary />
          ) : view === 'soundcheck' ? (
            <SoundCheckTab />
          ) : view === 'settings' ? (
            <LogoSettings />
          ) : (
            <ScriptureLookup />
          )}
        </div>
        <LiveDrawer key={view} />
      </div>
    </ServiceProvider>
  )
}

export default AppShell
