import type { ZoneSlot, ZoneSlotKind } from '../../../shared/zoneSlides'

// 'slide' is produced only by dragging a filmstrip slide onto the card, never
// by a button here. 'image' slots reuse the existing Backgrounds drawer and
// are out of scope for this editor — selecting one there is a separate flow,
// not something this compact panel needs to offer.
const KINDS: { kind: ZoneSlotKind; label: string }[] = [
  { kind: 'text', label: 'Text' },
  { kind: 'scripture', label: 'Verse' },
  { kind: 'logo', label: 'Logo' },
  { kind: 'black', label: 'Black' },
  { kind: 'same', label: 'Hold' },
]

// One zone's content for one deck slide. 'Hold' repeats whatever this screen
// showed on the previous slide, which is how a sermon title spans a whole
// deck without being retyped on every slide.
export default function ZoneSlotEditor({ slot, onChange }: {
  slot: ZoneSlot
  onChange: (next: ZoneSlot) => void
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1">
        {KINDS.map(({ kind, label }) => (
          <button
            key={kind}
            onClick={() => onChange({ kind })}
            className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${
              slot.kind === kind ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {slot.kind === 'text' && (
        <textarea
          value={slot.text ?? ''}
          onChange={(e) => onChange({ kind: 'text', text: e.target.value })}
          rows={2}
          placeholder="What this screen shows…"
          className="w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-500/50"
        />
      )}
      {slot.kind === 'scripture' && (
        <input
          value={slot.reference ?? ''}
          onChange={(e) => onChange({ kind: 'scripture', reference: e.target.value })}
          placeholder="John 3:16"
          className="w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-500/50"
        />
      )}
      {slot.kind === 'slide' && (
        // Read-only: this slot was set by dragging, not typing, so the
        // operator just needs to see the drag landed on the right slide.
        <span className="text-[10px] text-slate-400">Source slide {(slot.index ?? 0) + 1}</span>
      )}
    </div>
  )
}
