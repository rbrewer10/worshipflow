import { memo } from 'react'

const COLORS = ['#64748b', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#c026d3']

interface HeaderEditorProps {
  label: string
  color: string
  onLabelChange: (label: string) => void
  onColorChange: (color: string) => void
}

// A section divider — Welcome / Worship / Sermon / Response — purely visual,
// never goes live. Keeps a long flat running order scannable at a glance.
export const HeaderEditor = memo(function HeaderEditor({
  label,
  color,
  onLabelChange,
  onColorChange
}: HeaderEditorProps): JSX.Element {
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="header-label" className="section-header block mb-2">Section Label</label>
        <input id="header-label" value={label} placeholder="e.g. Worship Set"
          onChange={(e) => onLabelChange(e.target.value)}
          aria-label="Header section label" />
      </div>
      <div>
        <span className="section-header block mb-2">Color</span>
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onColorChange(c)}
              aria-label={`Set header color to ${c}`}
              className={`h-7 w-7 rounded-full transition-transform ${color === c ? 'ring-2 ring-offset-2 ring-white ring-offset-panel scale-110' : 'hover:scale-105'}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <p className="text-[11px] leading-snug text-content-tertiary">
        A section divider — never goes live, just breaks up a long list into readable chunks.
      </p>
    </div>
  )
})
