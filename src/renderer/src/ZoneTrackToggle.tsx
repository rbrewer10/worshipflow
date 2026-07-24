import type { ZoneId, TrackId } from '../../shared/types'
import type { ZoneTrackAssignment } from '../../shared/zoneTrack'

// The Main/Second button pair for a single zone — shared by ZonePanel (Live tab)
// and Build Service's zone-assignment popover, both driving the same per-service
// zone_track_assignment through window.wf.zoneTrackAssignmentSet.
function ZoneTrackToggle({ serviceId, zoneId, assignment, onChanged }: {
  serviceId: number
  zoneId: ZoneId
  assignment: ZoneTrackAssignment
  onChanged: (next: ZoneTrackAssignment) => void
}): JSX.Element {
  const setZoneTrack = (track: TrackId): void => {
    const next = { ...assignment, [zoneId]: track }
    onChanged(next)
    void window.wf.zoneTrackAssignmentSet(serviceId, next)
  }

  return (
    <div className="flex gap-1">
      {(['main', 'second'] as TrackId[]).map((tb) => (
        <button
          key={tb}
          onClick={() => setZoneTrack(tb)}
          className={`rounded px-2 py-0.5 text-[10px] font-semibold ring-1 ring-slate-200 transition-colors ${
            assignment[zoneId] === tb ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-200'
          }`}
        >
          {tb === 'main' ? 'Main' : 'Second'}
        </button>
      ))}
    </div>
  )
}

export default ZoneTrackToggle
