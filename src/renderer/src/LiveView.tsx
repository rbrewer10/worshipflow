import SlideGrid from './SlideGrid'
import LiveTools from './LiveTools'
import LiveDrawer from './LiveDrawer'

// The Live tab: the click-a-slide grid + the right-hand tools panel, with the
// bottom content drawer (Songs/Scripture/Announcements/Backgrounds) docked
// below both. (The loaded service + output preview live in the shell's left
// rail — ServiceRail — which stays above the drawer, outside this component.)
// Keyboard shortcuts (B/L/N/P/S) are now handled globally in AppShell.
function LiveView(): JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        <SlideGrid />
        <LiveTools />
      </div>
      <LiveDrawer />
    </div>
  )
}

export default LiveView
