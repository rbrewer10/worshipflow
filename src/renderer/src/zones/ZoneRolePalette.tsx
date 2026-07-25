import type { ZoneRole } from '../../../shared/zoneScenes'

// The MIME type carrying a role between the palette and a screen card. A custom
// type (rather than text/plain) means an unrelated text drag can't be mistaken
// for a role drop.
export const ROLE_DND_TYPE = 'application/x-wf-zone-role'

export const ROLES: ZoneRole[] = ['content', 'logo', 'black']

export const ROLE_LABEL: Record<ZoneRole, string> = {
  content: 'Content',
  logo: 'Logo',
  black: 'Black',
}

// Matches ZoneStripBadge's cell colours so the palette, the chips, and the
// cards all read as the same vocabulary.
export const ROLE_CLASS: Record<ZoneRole, string> = {
  content: 'bg-blue-600 text-white',
  logo: 'bg-slate-300 text-slate-800',
  black: 'bg-slate-800 text-white',
}

export default function ZoneRolePalette(): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Drag onto a screen
      </span>
      {ROLES.map((role) => (
        <span
          key={role}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(ROLE_DND_TYPE, role)
            e.dataTransfer.effectAllowed = 'copy'
          }}
          className={`cursor-grab select-none rounded px-2.5 py-1 text-[11px] font-semibold ${ROLE_CLASS[role]}`}
        >
          {ROLE_LABEL[role]}
        </span>
      ))}
    </div>
  )
}
