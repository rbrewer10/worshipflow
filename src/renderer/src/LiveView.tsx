import SlideGrid from './SlideGrid'
import LiveTools from './LiveTools'

// The Live tab: the click-a-slide grid + the right-hand tools panel.
// (The loaded service + output preview live in the shell's left rail —
// ServiceRail, in AppShell. The bottom content drawer is now mounted
// app-wide in AppShell too, not here — see LiveDrawer.tsx.)
// Keyboard shortcuts (B/L/N/P/S) are handled globally in AppShell.
function LiveView(): JSX.Element {
  return (
    <div className="flex h-full min-h-0">
      <SlideGrid />
      <LiveTools />
    </div>
  )
}

export default LiveView
