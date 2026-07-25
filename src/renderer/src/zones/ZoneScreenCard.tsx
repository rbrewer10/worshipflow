import { useEffect, useState } from 'react'
import type { ZoneId, ZoneMode, ServiceItem, ThemeColors, SongFull } from '../../../shared/types'
import { ZONE_NAMES } from '../../../shared/types'
import type { ZoneRole } from '../../../shared/zoneScenes'
import { roleForMode } from '../../../shared/zoneScenes'
import ServiceSlidePreview from '../ServiceSlidePreview'
import { ROLE_DND_TYPE, ROLES, ROLE_LABEL } from './ZoneRolePalette'

function toAssetUrl(p: string): string {
  return 'wf-asset://?path=' + encodeURIComponent(p)
}

// One physical screen. Renders what that screen will actually show for this
// item, and accepts a role by drop or by click-to-cycle. A mode with no role
// equivalent ('off', 'stage') renders read-only — the Advanced grid remains the
// way to change those.
export default function ZoneScreenCard({
  zoneId, mode, item, serviceTheme, serviceColors, songFull, logoPath, offTrack, offTrackLabel, slideText, onRoleChange
}: {
  zoneId: ZoneId
  mode: ZoneMode
  item: ServiceItem
  serviceTheme: string | null
  serviceColors: ThemeColors | null
  songFull: SongFull | null
  logoPath: string | null
  offTrack?: boolean
  offTrackLabel?: string
  slideText?: string
  onRoleChange: (role: ZoneRole) => void
}): JSX.Element {
  const [dragOver, setDragOver] = useState(false)
  const role = roleForMode(mode)
  const editable = role !== null && !offTrack

  // dragend fires on the drag SOURCE, so a cancelled drag (Esc, or a drop
  // outside any target) never reaches this card's own dragleave/drop handlers
  // and would leave the highlight stuck on. Clear it globally instead.
  useEffect(() => {
    const clear = (): void => setDragOver(false)
    window.addEventListener('dragend', clear)
    return () => window.removeEventListener('dragend', clear)
  }, [])

  const cycle = (): void => {
    if (role === null || !editable) return
    onRoleChange(ROLES[(ROLES.indexOf(role) + 1) % ROLES.length])
  }

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragOver(false)
    if (!editable) return
    const dropped = e.dataTransfer.getData(ROLE_DND_TYPE)
    if (dropped === 'content' || dropped === 'logo' || dropped === 'black') onRoleChange(dropped)
  }

  const body = (): JSX.Element => {
    if (role === 'content') {
      return <ServiceSlidePreview item={item} serviceTheme={serviceTheme} serviceColors={serviceColors} songFull={songFull} overrideLine={slideText} />
    }
    // Same 16:9 box shape ServiceSlidePreview uses, so all four cards line up.
    return (
      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-2xl ring-1 ring-white/10"
             style={{ background: role === 'black' ? '#000' : '#2b2f36' }}>
          {role === 'logo' && logoPath && (
            <img src={toAssetUrl(logoPath)} alt="" className="max-h-[70%] max-w-[70%] object-contain" />
          )}
          {role === 'logo' && !logoPath && (
            <span className="text-[11px] font-semibold text-white/30">Logo</span>
          )}
          {role === null && (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-white/40">{mode}</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => { if (editable) { e.preventDefault(); setDragOver(true) } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={cycle}
      role={editable ? 'button' : undefined}
      tabIndex={editable ? 0 : undefined}
      onKeyDown={(e) => { if (editable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); cycle() } }}
      title={editable ? `${ZONE_NAMES[zoneId]} — click to cycle, or drop a role here` : ZONE_NAMES[zoneId]}
      className={`rounded-xl border-2 p-2 transition-colors ${
        dragOver ? 'border-blue-500 bg-blue-500/10' : 'border-slate-200 bg-white'
      } ${editable ? 'cursor-pointer hover:border-slate-300' : 'cursor-default'} ${offTrack ? 'opacity-50' : ''}`}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{ZONE_NAMES[zoneId]}</span>
        <span className="text-[10px] font-semibold text-slate-400">{offTrack ? offTrackLabel : role ? ROLE_LABEL[role] : mode}</span>
      </div>
      {body()}
    </div>
  )
}
