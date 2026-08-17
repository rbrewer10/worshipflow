import { memo } from 'react'

interface TextEditorProps {
  title: string
  body: string
  fontScale: number
  textAlign: string
  onTitleChange: (title: string) => void
  onBodyChange: (body: string) => void
  onFontScaleChange: (scale: number) => void
  onTextAlignChange: (align: string) => void
}

export const TextEditor = memo(function TextEditor({
  title,
  body,
  fontScale,
  textAlign,
  onTitleChange,
  onBodyChange,
  onFontScaleChange,
  onTextAlignChange
}: TextEditorProps): JSX.Element {
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="text-title" className="section-header block mb-2">Title</label>
        <input id="text-title" value={title} placeholder="Title (optional)"
          onChange={(e) => onTitleChange(e.target.value)}
          aria-label="Text item title (optional)" />
      </div>
      <div>
        <label htmlFor="text-body" className="section-header block mb-2">Body Text</label>
        <textarea id="text-body" value={body} placeholder="Body text — what you want on screen" rows={4}
          onChange={(e) => onBodyChange(e.target.value)}
          aria-label="Text item body content" />
      </div>

      {/* ── Text Style ── */}
      <div className="space-y-3 border-t border-border pt-3 mt-2">
        <div className="flex items-center justify-between">
          <span className="section-header">Text Style</span>
          <span className="text-xs text-content-secondary">Appearance</span>
        </div>

        {/* Font size */}
        <div>
          <label htmlFor="font-size-slider" className="mb-1.5 flex items-center justify-between text-[11px] text-content-secondary">
            <span>Font size</span>
            <span className="font-mono text-content-primary">{fontScale} vw</span>
          </label>
          <input id="font-size-slider" type="range" min={3} max={14} step={0.5}
            value={fontScale}
            onChange={(e) => onFontScaleChange(Number(e.target.value))}
            aria-label="Font size slider from 3 to 14"
            className="w-full accent-blue-600" />
        </div>

        {/* Text alignment */}
        <div>
          <span className="mb-2 block text-[11px] text-content-secondary">Text alignment</span>
          <div className="flex gap-1.5">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button key={align} onClick={() => onTextAlignChange(align)}
                className={`flex-1 btn text-xs capitalize ${textAlign === align ? 'bg-blue-600 border-blue-500 text-white' : ''}`}>
                {align}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
})
