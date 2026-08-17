import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import type { SermonVerse } from '../../../shared/sermonVerses'

// Add/reorder/delete rows of {reference, notes} on a sermon item — same
// add/reorder-in-place shape as AnnouncementItemEditor's refIds list, just
// with richer rows (an object per verse instead of a bare id).
export function SermonVersesEditor({
  verses,
  onChange
}: {
  verses: SermonVerse[]
  onChange: (verses: SermonVerse[]) => void
}): JSX.Element {
  const addVerse = (): void => {
    onChange([...verses, { reference: '', notes: '' }])
  }

  const updateVerse = (index: number, next: Partial<SermonVerse>): void => {
    onChange(verses.map((v, i) => (i === index ? { ...v, ...next } : v)))
  }

  const removeVerse = (index: number): void => {
    onChange(verses.filter((_, i) => i !== index))
  }

  const move = (index: number, delta: number): void => {
    const target = index + delta
    if (target < 0 || target >= verses.length) return
    const next = [...verses]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="section-header">Verses</span>
        <button type="button" onClick={addVerse} className="btn-pill text-xs">
          <Plus size={12} /> Add verse
        </button>
      </div>

      {verses.length === 0 && (
        <p className="text-[11px] leading-snug text-content-tertiary">
          No verses yet — his pulpit tablet will just show the title card until you add some.
        </p>
      )}

      <ol className="space-y-2">
        {verses.map((verse, index) => (
          <li key={index} className="card space-y-2 p-2">
            <div className="flex items-center gap-2">
              <input
                value={verse.reference}
                placeholder="e.g. John 3:16-17"
                onChange={(e) => updateVerse(index, { reference: e.target.value })}
                aria-label={`Verse ${index + 1} reference`}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={`Move verse ${index + 1} up`}
                className="btn-icon"
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === verses.length - 1}
                aria-label={`Move verse ${index + 1} down`}
                className="btn-icon"
              >
                <ChevronDown size={14} />
              </button>
              <button
                type="button"
                onClick={() => removeVerse(index)}
                aria-label={`Remove verse ${index + 1}`}
                className="btn-icon"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <textarea
              value={verse.notes}
              placeholder="Notes for this verse"
              onChange={(e) => updateVerse(index, { notes: e.target.value })}
              aria-label={`Verse ${index + 1} notes`}
              rows={2}
              className="w-full"
            />
          </li>
        ))}
      </ol>
    </div>
  )
}
