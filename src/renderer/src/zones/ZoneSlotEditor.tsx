import { useState } from 'react'
import type { ZoneId } from '../../../shared/types'
import type { ZoneSlot, ZoneSlotKind } from '../../../shared/zoneSlides'
import Modal from '../Modal'
import BackgroundLibraryGrid from '../BackgroundLibraryGrid'

// 'slide' is produced only by dragging a filmstrip slide onto the card, never
// by a button here.
const KINDS: { kind: ZoneSlotKind; label: string }[] = [
  { kind: 'text', label: 'Text' },
  { kind: 'scripture', label: 'Verse' },
  { kind: 'sermon', label: 'Title card' },
  { kind: 'image', label: 'Image' },
  { kind: 'logo', label: 'Logo' },
  { kind: 'black', label: 'Black' },
  { kind: 'same', label: 'Hold' },
]

function toAssetUrl(p: string): string {
  return 'wf-asset://?path=' + encodeURIComponent(p)
}

const INPUT_CLASS = 'w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-500/50'

// One zone's content for one deck slide. 'Hold' repeats whatever this screen
// showed on the previous slide, which is how a sermon title spans a whole
// deck without being retyped on every slide.
export default function ZoneSlotEditor({ slot, zoneId, onChange }: {
  slot: ZoneSlot
  zoneId: ZoneId
  onChange: (next: ZoneSlot) => void
}): JSX.Element {
  const sizable = slot.kind === 'text' || slot.kind === 'scripture'
  // Just for the slider's unset-state display — the stage monitor (zone 4)
  // actually renders smaller than the room-facing screens when nothing is set.
  const defaultScale = zoneId === 4 ? 5 : 14
  const [picking, setPicking] = useState(false)

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
          onChange={(e) => onChange({ ...slot, kind: 'text', text: e.target.value })}
          rows={2}
          placeholder="What this screen shows…"
          className={INPUT_CLASS}
        />
      )}
      {slot.kind === 'scripture' && (
        <input
          value={slot.reference ?? ''}
          onChange={(e) => onChange({ ...slot, kind: 'scripture', reference: e.target.value })}
          placeholder="John 3:16"
          className={INPUT_CLASS}
        />
      )}
      {slot.kind === 'sermon' && (
        <div className="flex flex-col gap-1">
          <input
            value={slot.text ?? ''}
            onChange={(e) => onChange({ ...slot, kind: 'sermon', text: e.target.value })}
            placeholder="Sermon title"
            className={INPUT_CLASS}
          />
          <input
            value={slot.reference ?? ''}
            onChange={(e) => onChange({ ...slot, kind: 'sermon', reference: e.target.value })}
            placeholder="John 3:16-18"
            className={INPUT_CLASS}
          />
        </div>
      )}
      {slot.kind === 'image' && (
        // The engine and the zone pages already render image slots end to end;
        // this panel just never offered a way to choose one, so a screen could
        // hold its own picture in the data model but not in practice.
        <div className="flex flex-col gap-1">
          {slot.path ? (
            <button
              onClick={() => setPicking(true)}
              className="overflow-hidden rounded border border-slate-200"
              title="Choose a different picture for this screen"
            >
              <img src={toAssetUrl(slot.path)} alt="" className="h-14 w-full object-cover" />
            </button>
          ) : (
            <button onClick={() => setPicking(true)} className={`${INPUT_CLASS} text-slate-500`}>
              Choose a picture…
            </button>
          )}
          {slot.path && (
            <button
              onClick={() => onChange({ kind: 'image' })}
              className="self-start text-[10px] text-slate-400 hover:text-slate-600"
            >
              Clear
            </button>
          )}
        </div>
      )}
      {picking && (
        <Modal onClose={() => setPicking(false)} labelledBy="zone-slot-image-title" className="card-lg max-w-3xl">
          <h3 id="zone-slot-image-title" className="section-title">Picture for this screen</h3>
          <BackgroundLibraryGrid
            activePath={slot.path ?? null}
            onApply={(path) => { onChange({ ...slot, kind: 'image', path: path || undefined }); setPicking(false) }}
          />
        </Modal>
      )}
      {slot.kind === 'slide' && (
        // Read-only: this slot was set by dragging, not typing, so the
        // operator just needs to see the drag landed on the right slide.
        <span className="text-[10px] text-slate-400">Source slide {(slot.index ?? 0) + 1}</span>
      )}
      {sizable && (
        // Manual override for when auto-fit guesses wrong on THIS slide —
        // the escape hatch, not the default. Leaving it alone keeps the
        // automatic sizing that already accounts for which zone this is.
        <div className="flex items-center gap-1.5 pt-0.5">
          <span className="w-8 shrink-0 text-[10px] text-slate-500">Size</span>
          <input
            type="range"
            min={3}
            max={20}
            step={1}
            value={slot.fontScale ?? defaultScale}
            onChange={(e) => onChange({ ...slot, fontScale: Number(e.target.value) })}
            title="Sets the exact size, bypassing auto-fit — long text can run off the screen if set too high"
            className="h-1 flex-1 accent-blue-600"
          />
          <span className="w-5 shrink-0 text-right text-[10px] tabular-nums text-slate-500">
            {slot.fontScale ?? defaultScale}
          </span>
          {slot.fontScale != null && (
            <button
              onClick={() => onChange({ ...slot, fontScale: undefined })}
              className="shrink-0 text-[10px] text-slate-400 hover:text-slate-600"
              title="Back to automatic sizing"
            >
              Reset
            </button>
          )}
        </div>
      )}
    </div>
  )
}
