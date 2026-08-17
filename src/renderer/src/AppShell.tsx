import { useState, useEffect } from 'react'
import type { TrackId } from '../../shared/types'
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
import RoomFeedTab from './setup/RoomFeedTab'
import { getRelay } from './livecall/useLiveCall'
import NotifyToasts from './NotifyToasts'
import { hasFailedSaves } from './saveRegistry'

export type View =
  | 'home' | 'live' | 'service'
  | 'songs' | 'announcements' | 'scripture' | 'backgrounds'
  | 'zones' | 'obs' | 'settings' | 'tablet' | 'roomfeed' | 'diagnostics'
  | 'volunteer' | 'soundcheck'

function AppShell(): JSX.Element {
  const [view, setViewRaw] = useState<View>('home')
  // While Stage Rehearsal is armed, the operator's attention (and keyboard)
  // is on advancing the song on the Stage Monitor, not the announcement loop
  // quietly cycling on Main — so the global shortcuts below target whichever
  // track rehearsal has actually put the operator in control of.
  const [shortcutTrack, setShortcutTrack] = useState<TrackId>('main')
  useEffect(() => {
    window.wf.getStageRehearsal().then((s) => setShortcutTrack(s.active ? 'second' : 'main'))
    const off = window.wf.onState((s) => setShortcutTrack(s.stageRehearsal.active ? 'second' : 'main'))
    return off
  }, [])
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
        window.wf.sendIntent(shortcutTrack, 'black')
        return
      }

      // L = logo screen
      if (key === 'l') {
        e.preventDefault()
        window.wf.sendIntent(shortcutTrack, 'logo')
        return
      }

      // N = next slide/item
      if (key === 'n') {
        e.preventDefault()
        window.wf.sendIntent(shortcutTrack, 'next')
        return
      }

      // P = previous slide/item
      if (key === 'p') {
        e.preventDefault()
        window.wf.sendIntent(shortcutTrack, 'prev')
        return
      }

      // S = toggle lyrics/slides display
      if (key === 's') {
        e.preventDefault()
        window.wf.sendIntent(shortcutTrack, 'lyrics')
        return
      }

      // Space or ArrowRight = next slide
      if (key === ' ' || key === 'arrowright') {
        e.preventDefault()
        window.wf.sendIntent(shortcutTrack, 'next')
        return
      }

      // ArrowLeft = previous slide
      if (key === 'arrowleft') {
        e.preventDefault()
        window.wf.sendIntent(shortcutTrack, 'prev')
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [view, shortcutTrack])

  // Restore recovery state once the renderer is ready. The main process self-loads
  // the recovered service before restoring tracks, so this doesn't depend on the
  // operator having already navigated to a service.
  useEffect(() => {
    window.wf.restoreRecovery().catch(err => {
      console.error('Failed to restore recovery state:', err)
    })
  }, [])

  // Start the Live Call relay app-wide rather than when its editor opens. The
  // screens negotiate with the relay, so if it only existed while the operator
  // had the item open, taking a call live without opening it would leave every
  // screen black. One idle WebSocket is a cheap price for that not happening.
  useEffect(() => {
    void getRelay().catch(err => {
      console.error('Failed to start Live Call relay:', err)
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
      <div className="flex h-screen flex-col overflow-hidden bg-app text-content-primary">
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
          ) : view === 'roomfeed' ? (
            <RoomFeedTab />
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
