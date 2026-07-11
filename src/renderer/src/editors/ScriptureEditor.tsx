import { memo } from 'react'

interface ScriptureEditorProps {
  reference: string
  onReferenceChange: (ref: string) => void
}

export const ScriptureEditor = memo(function ScriptureEditor({ reference, onReferenceChange }: ScriptureEditorProps): JSX.Element {
  return (
    <div>
      <label htmlFor="scripture-ref" className="section-header block mb-2">Scripture Reference</label>
      <input id="scripture-ref" value={reference} placeholder="John 3:16"
        onChange={(e) => onReferenceChange(e.target.value)}
        aria-label="Scripture reference (e.g., John 3:16)" />
    </div>
  )
})
