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
import ObsConnectTab from './ObsConnectTab'
import BackgroundsTab from './BackgroundsTab'
import ScreensZonesTab from './setup/ScreensZonesTab'
import TabletRemoteTab from './setup/TabletRemoteTab'
import DiagnosticsTab from './setup/DiagnosticsTab'
import NotifyToasts from './NotifyToasts'
import { hasFailedSaves } from './saveRegistry'

export type View =
  | 'home' | 'live' | 'service'
  | 'songs' | 'announcements' | 'scripture' | 'backgrounds'
  | 'zones' | 'obs' | 'settings' | 'tablet' | 'diagnostics'
  | 'volunteer' | 'soundcheck'

function AppShell(): JSX.Element {
  const [view, setViewRaw] = useState<View>('home')
  // Autosave means most navigation is already safe — but a save that's
  // actively FAILED (not just in flight) means the edit sitting in that
  // editor's local state never actually reached the DB, and switching tabs
  // would unmount it and silently lose that edit. saveRegistry is how any
  // useAutosave instance, anywhere, reports that back up here without this
  // component needing to know about every editor individually.
  const setView = (next: View): void => {
    if (next === view) return
    if (hasFailedSaves() && !confirm(
      "A recent change failed to save. If you leave this screen now, that change may be lost.\n\nLeave anyway?"
    )) return
    setViewRaw(next)
  }

  // Global keyboard shortcuts for live control — Live tab only. These used to
  // fire from any tab (including while editing songs/services), so e.g. typing
  // "b" or using arrow keys anywhere in the app could black the live output or
  // advance/reverse it. Volunteer mode has its own separate, smarter handler
  // (VolunteerView.tsx) — this one staying mounted for 'volunteer' too would
  // double-fire the same keystroke through two different intent paths.
  useEffect(() => {
    if (view !== 'live') return
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
  }, [view])

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
          ) : view === 'backgrounds' ? (
            <BackgroundsTab />
          ) : view === 'zones' ? (
            <ScreensZonesTab />
          ) : view === 'tablet' ? (
            <TabletRemoteTab />
          ) : view === 'diagnostics' ? (
            <DiagnosticsTab />
          ) : view === 'obs' ? (
            <ObsConnectTab />
          ) : view === 'soundcheck' ? (
            <SoundCheckTab />
          ) : view === 'settings' ? (
            <LogoSettings />
          ) : (
            <ScriptureLookup />
          )}
        </div>
        <LiveDrawer key={view} isBuildService={view === 'service'} />
      </div>
    </ServiceProvider>
  )
}

export default AppShell
