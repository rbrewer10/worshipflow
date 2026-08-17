import ZonePanel from '../ZonePanel'

// Zone routing is set up for the room and then left alone, so it lives here
// rather than in the Live panel where it used to sit (2026-08-01 spec).
function ScreensZonesTab(): JSX.Element {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 text-lg font-semibold text-content-primary">Screens &amp; zones</h1>
        <p className="mb-5 text-sm text-content-secondary">
          What each screen in the room shows, and the address to open on each Pi.
        </p>
        <ZonePanel />
      </div>
    </div>
  )
}

export default ScreensZonesTab
