import { memo } from 'react'

interface PlaceholderEditorProps {
  label: string
  onLabelChange: (label: string) => void
}

// Reserves a labeled TBD slot in the running order before its real content
// exists — e.g. "Special Music — TBD" while you're still waiting to hear who's
// singing. Never goes live; swap it for the real item once it's known. Use the
// Notes field below for anything else you already know about it.
export const PlaceholderEditor = memo(function PlaceholderEditor({
  label,
  onLabelChange
}: PlaceholderEditorProps): JSX.Element {
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="placeholder-label" className="section-header block mb-2">What goes here</label>
        <input id="placeholder-label" value={label} placeholder="e.g. Special Music — TBD"
          onChange={(e) => onLabelChange(e.target.value)}
          aria-label="Placeholder label" />
      </div>
      <p className="text-[11px] leading-snug text-content-tertiary">
        Reserves this spot in the order. Delete it and add the real item once you know what's going here.
      </p>
    </div>
  )
})
