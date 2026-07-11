import { memo } from 'react'

interface CountdownEditorProps {
  seconds: number
  onSecondsChange: (seconds: number) => void
}

export const CountdownEditor = memo(function CountdownEditor({ seconds, onSecondsChange }: CountdownEditorProps): JSX.Element {
  return (
    <div>
      <label htmlFor="countdown-minutes" className="section-header block mb-2">
        Minutes
      </label>
      <input id="countdown-minutes" type="number" min="1" max="1440" value={Math.round(seconds / 60)}
        onChange={(e) => onSecondsChange(Math.max(1, Number(e.target.value)) * 60)}
        aria-label="Countdown duration in minutes"
        className="w-20" />
    </div>
  )
})
