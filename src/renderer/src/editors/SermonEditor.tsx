import { memo } from 'react'

interface SermonEditorProps {
  title: string
  speaker: string
  passage: string
  onTitleChange: (title: string) => void
  onSpeakerChange: (speaker: string) => void
  onPassageChange: (passage: string) => void
}

export const SermonEditor = memo(function SermonEditor({
  title,
  speaker,
  passage,
  onTitleChange,
  onSpeakerChange,
  onPassageChange
}: SermonEditorProps): JSX.Element {
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="sermon-title" className="section-header block mb-2">Sermon title</label>
        <input id="sermon-title" value={title} placeholder="e.g. The Prodigal Son"
          onChange={(e) => onTitleChange(e.target.value)}
          aria-label="Sermon title" />
      </div>
      <div>
        <label htmlFor="sermon-speaker" className="section-header block mb-2">Speaker</label>
        <input id="sermon-speaker" value={speaker} placeholder="e.g. Pastor Ryan"
          onChange={(e) => onSpeakerChange(e.target.value)}
          aria-label="Sermon speaker" />
      </div>
      <div>
        <label htmlFor="sermon-passage" className="section-header block mb-2">Passage</label>
        <input id="sermon-passage" value={passage} placeholder="e.g. Luke 15:11-32"
          onChange={(e) => onPassageChange(e.target.value)}
          aria-label="Sermon passage" />
      </div>
      <p className="text-[11px] leading-snug text-content-tertiary">
        When live, the screen shows the logo. This marks where the sermon starts for recording chapters.
      </p>
    </div>
  )
})
