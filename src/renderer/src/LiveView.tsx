import SlideGrid from './SlideGrid'
import LiveTools from './LiveTools'
import SecondTrackTools from './SecondTrackTools'
import { useService } from './ServiceContext'

// The Live tab: the click-a-slide grid + the right-hand tools panel, for Main —
// plus, once a service has second-track items, a Second column reusing SlideGrid
// with a leaner SecondTrackTools rail. (The loaded service + output preview live
// in the shell's left rail — ServiceRail, in AppShell. The bottom content drawer
// is mounted app-wide in AppShell too, not here — see LiveDrawer.tsx.)
// Keyboard shortcuts (B/L/N/P/S) are handled globally in AppShell and always
// target the Main track.
function LiveView(): JSX.Element {
  const { activeService } = useService()
  const hasSecond = activeService?.items.some((it) => it.track === 'second') ?? false

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-h-0 min-w-0 flex-1">
        <SlideGrid track="main" />
        <LiveTools track="main" />
      </div>
      {hasSecond && (
        <div className="flex min-h-0 min-w-0 flex-1 border-l border-slate-300">
          <SlideGrid track="second" />
          <SecondTrackTools />
        </div>
      )}
    </div>
  )
}

export default LiveView
