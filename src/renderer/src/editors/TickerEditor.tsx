import { memo } from 'react'

interface TickerEditorProps {
  text: string
  onTextChange: (text: string) => void
}

export const TickerEditor = memo(function TickerEditor({ text, onTextChange }: TickerEditorProps): JSX.Element {
  return (
    <div>
      <label htmlFor="ticker-text" className="section-header block mb-2">Announcement Text</label>
      <input id="ticker-text" value={text} placeholder="Announcement text"
        onChange={(e) => onTextChange(e.target.value)}
        aria-label="Ticker announcement text" />
    </div>
  )
})
