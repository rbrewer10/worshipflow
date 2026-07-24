import type { ZoneId, TrackId } from '../../shared/types'
import { ZONE_NAMES } from '../../shared/types'
import type { ZoneTrackAssignment } from '../../shared/zoneTrack'

const CELL_COLOR: Record<TrackId, string> = {
  main: 'bg-blue-600',
  second: 'bg-purple-500',
}

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

// Tiny truthful visual of a ZoneTrackAssignment — same 4-cell shape as the
// existing ZoneStripBadge (Z1 Z2 back screens, Z3 lyrics TVs, narrow Z4 stage),
// but colored by which TRACK each zone follows rather than by content mode.
export default function ZoneTrackStripBadge({ assignment }: { assignment: ZoneTrackAssignment }): JSX.Element {
  const title = ZONE_IDS.map((z) => `${ZONE_NAMES[z]}: ${assignment[z] === 'main' ? 'Main' : 'Second'}`).join(' · ')
  return (
    <span className="inline-flex items-center gap-[2px] align-middle" title={title}>
      <span className={`h-[10px] w-[15px] rounded-[2px] ${CELL_COLOR[assignment[1]]}`} />
      <span className={`h-[10px] w-[15px] rounded-[2px] ${CELL_COLOR[assignment[2]]}`} />
      <span className={`h-[10px] w-[15px] rounded-[2px] ${CELL_COLOR[assignment[3]]}`} />
      <span className={`h-[10px] w-[9px] rounded-[2px] ${CELL_COLOR[assignment[4]]}`} />
    </span>
  )
}
