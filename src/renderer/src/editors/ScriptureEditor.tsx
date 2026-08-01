import { memo } from 'react'
import ScriptureRefField from './ScriptureRefField'

interface ScriptureEditorProps {
  reference: string
  fontScale: number
  onReferenceChange: (ref: string) => void
  onFontScaleChange: (scale: number) => void
}

export const ScriptureEditor = memo(function ScriptureEditor({
  reference,
  fontScale,
  onReferenceChange,
  onFontScaleChange
}: ScriptureEditorProps): JSX.Element {
  return (
    <div className="space-y-3">
      <ScriptureRefField reference={reference} onReferenceChange={onReferenceChange} />
      <div>
        <label htmlFor="scripture-font-size" className="mb-1.5 flex items-center justify-between text-[11px] text-slate-600">
          <span>Font size</span>
          <span className="font-mono text-slate-900">{fontScale} vw</span>
        </label>
        <input id="scripture-font-size" type="range" min={3} max={14} step={0.5}
          value={fontScale}
          onChange={(e) => onFontScaleChange(Number(e.target.value))}
          aria-label="Font size slider from 3 to 14"
          className="w-full accent-blue-600" />
      </div>
    </div>
  )
})
