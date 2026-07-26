import { useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import type { ServiceItem, ZoneId } from '../../../shared/types'
import type { ZonePin } from '../../../shared/zonePins'
import type { ZoneTrackAssignment } from '../../../shared/zoneTrack'
import ZoneTrackToggle from '../ZoneTrackToggle'

// Only these two item types carry a title/speaker/passage worth freezing onto a
// screen — pinning a song or a countdown as a title card would render a card
// nobody authored.
const HOLDABLE_TYPES = ['sermon', 'text']

function Row({ checked, label, muted, onClick }: {
  checked?: boolean
  label: string
  muted?: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-slate-100 ${
        muted ? 'text-[11px] text-slate-500' : 'text-xs text-slate-700'
      }`}
    >
      <span className="w-3 shrink-0">{checked && <Check size={12} className="text-blue-600" />}</span>
      <span className="truncate">{label}</span>
    </button>
  )
}

// The pin menu for one zone card. Every choice is a pin (or "Follow service",
// which is the absence of one) so there is exactly one mental model for holding
// a screen — the old Auto/Black/Logo/Lyrics chips lived alongside three other
// controls that could contradict them.
export default function ZonePinPicker({
  zoneId, pin, liveItem, items, serviceId, trackAssignment, onTrackAssignmentChange, onTrackAssignmentPersisted,
  onPick, onClose, placement, align
}: {
  zoneId: ZoneId
  pin: ZonePin | null
  // The main track's live item, offered as the one-click "hold what's on now".
  liveItem: ServiceItem | null
  // Every item of the active service, both tracks — a pin is deliberately not
  // track-scoped (see computeZoneStates), so neither is this list.
  items: ServiceItem[]
  serviceId: number | null
  trackAssignment: ZoneTrackAssignment
  onTrackAssignmentChange: (next: ZoneTrackAssignment) => void
  // Changing the track a zone follows only fires zoneBroadcast() in main (the
  // zone pages), not the wf:state push the grid listens to — so the grid has to
  // be told to re-read the zone states itself.
  onTrackAssignmentPersisted: () => void
  onPick: (pin: ZonePin | null) => void
  onClose: () => void
  placement: 'above' | 'below'
  align: 'left' | 'right'
}): JSX.Element {
  const [showOthers, setShowOthers] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const holdable = items.filter((it) => HOLDABLE_TYPES.includes(it.type) && it.id !== liveItem?.id)
  const liveHoldable = liveItem && HOLDABLE_TYPES.includes(liveItem.type) ? liveItem : null
  const heldId = pin?.kind === 'titleCard' ? pin.itemId : null

  return (
    <>
      {/* Backdrop, not a document-level mousedown listener: the card itself is
          this popover's trigger, so a listener would close on mousedown and the
          card's own click would immediately reopen it. Swallowing the whole
          click here closes it exactly once. */}
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div
        className={`absolute z-30 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg ${
          placement === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'
        } ${align === 'right' ? 'right-0' : 'left-0'}`}
      >
        <Row checked={pin == null} label="Follow service" onClick={() => onPick(null)} />
        {liveHoldable && (
          <Row
            checked={heldId === liveHoldable.id}
            label={`Hold “${liveHoldable.title}”`}
            onClick={() => onPick({ kind: 'titleCard', itemId: liveHoldable.id })}
          />
        )}
        {holdable.length > 0 && (
          <>
            <button
              onClick={() => setShowOthers((v) => !v)}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-100"
            >
              <span className="w-3 shrink-0">{heldId != null && heldId !== liveHoldable?.id && <Check size={12} className="text-blue-600" />}</span>
              <span className="flex-1 truncate">Hold another item…</span>
              {showOthers ? <ChevronUp size={12} className="text-slate-400" /> : <ChevronDown size={12} className="text-slate-400" />}
            </button>
            {showOthers && (
              <div className="max-h-40 overflow-auto border-l border-slate-200 pl-1.5">
                {holdable.map((it) => (
                  <Row
                    key={it.id}
                    checked={heldId === it.id}
                    label={it.title || it.type}
                    onClick={() => onPick({ kind: 'titleCard', itemId: it.id })}
                  />
                ))}
              </div>
            )}
          </>
        )}

        <div className="my-1 border-t border-slate-200" />

        <Row checked={pin?.kind === 'mode' && pin.mode === 'logo'} label="Logo" onClick={() => onPick({ kind: 'mode', mode: 'logo' })} />
        <Row checked={pin?.kind === 'mode' && pin.mode === 'black'} label="Black" onClick={() => onPick({ kind: 'mode', mode: 'black' })} />
        {/* Secondary on purpose: holding raw live text on a back screen is the
            rare case, and it is what the old "Lyrics" chip actually did. */}
        <Row muted checked={pin?.kind === 'mode' && pin.mode === 'lyrics'} label="Live text" onClick={() => onPick({ kind: 'mode', mode: 'lyrics' })} />

        {serviceId != null && (
          <>
            <div className="my-1 border-t border-slate-200" />
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] text-slate-500 hover:bg-slate-100"
            >
              <span className="flex-1">Advanced</span>
              {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showAdvanced && (
              <div className="px-2 pb-1">
                <div className="mb-1 text-[10px] text-slate-400">Which track this screen follows</div>
                <ZoneTrackToggle
                  serviceId={serviceId}
                  zoneId={zoneId}
                  assignment={trackAssignment}
                  onChanged={onTrackAssignmentChange}
                  onPersisted={onTrackAssignmentPersisted}
                />
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
