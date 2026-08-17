import type { ZoneId, TrackId } from '../../shared/types'
import type { ZoneTrackAssignment } from '../../shared/zoneTrack'

// The Main/Second button pair for a single zone — shared by ZonePanel (Live tab)
// and Build Service's zone-assignment popover, both driving the same per-service
// zone_track_assignment through window.wf.zoneTrackAssignmentSet.
function ZoneTrackToggle({ serviceId, zoneId, assignment, onChanged, onPersisted }: {
  serviceId: number
  zoneId: ZoneId
  assignment: ZoneTrackAssignment
  onChanged: (next: ZoneTrackAssignment) => void
  // Fired after zoneTrackAssignmentSet resolves — lets a caller (e.g. ZonePanel)
  // refresh dependent state (like zoneStates' mode labels) at the same point the
  // pre-extraction inline implementation did, not immediately on click.
  onPersisted?: () => void
}): JSX.Element {
  const setZoneTrack = (track: TrackId): void => {
    const next = { ...assignment, [zoneId]: track }
    onChanged(next)
    void window.wf.zoneTrackAssignmentSet(serviceId, next).then(() => onPersisted?.())
  }

  return (
    <div className="flex gap-1">
      {(['main', 'second'] as TrackId[]).map((tb) => (
        <button
          key={tb}
          onClick={() => setZoneTrack(tb)}
          className={`rounded px-2 py-0.5 text-[10px] font-semibold ring-1 ring-border transition-colors ${
            assignment[zoneId] === tb ? 'bg-blue-600 text-white' : 'text-content-secondary hover:bg-panel'
          }`}
        >
          {tb === 'main' ? 'Main' : 'Second'}
        </button>
      ))}
    </div>
  )
}

export default ZoneTrackToggle
