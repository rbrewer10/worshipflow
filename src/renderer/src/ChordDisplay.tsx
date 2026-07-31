import { useState } from 'react'
import { Plus } from 'lucide-react'
import { extractChords, renderChordsWithLyrics, COMMON_CHORDS, formatChord } from './chordUtils'
import Modal from './Modal'

interface ChordDisplayProps {
  lyrics: string
  showChords?: boolean
  onChordsChange?: (updatedLyrics: string) => void
}

export function ChordDisplay({ lyrics, showChords = true, onChordsChange }: ChordDisplayProps): JSX.Element {
  const [editingLineIdx, setEditingLineIdx] = useState<number | null>(null)
  const [editingChords, setEditingChords] = useState<string>('')
  const [showChordPicker, setShowChordPicker] = useState(false)
  const [chordSuggestions, setChordSuggestions] = useState<string[]>([])

  const lines = lyrics.split('\n')

  const handleAddChordToLine = (lineIdx: number): void => {
    setEditingLineIdx(lineIdx)
    const line = lines[lineIdx] ?? ''
    const { chords } = extractChords(line)
    setEditingChords(chords.map((c) => c.chord).join(', '))
    setShowChordPicker(true)
  }

  const handleSaveChords = (): void => {
    if (editingLineIdx == null) return

    const newLines = [...lines]
    let line = newLines[editingLineIdx] ?? ''

    // Remove existing chords
    line = line.replace(/\[([^\]]+)\]/g, '')

    // Add new chords if provided
    if (editingChords.trim()) {
      const chordList = editingChords.split(',').map((c) => `[${formatChord(c)}]`)
      line = `${chordList.join(' ')} ${line}`.trim()
    }

    newLines[editingLineIdx] = line
    onChordsChange?.(newLines.join('\n'))
    setShowChordPicker(false)
    setEditingLineIdx(null)
  }

  const handleChordInput = (text: string): void => {
    setEditingChords(text)

    // Provide suggestions for partial input
    if (text.trim().length > 0) {
      const lastChord = text.split(',').pop()?.trim().toUpperCase() ?? ''
      const suggestions = COMMON_CHORDS.filter((c) => c.toUpperCase().startsWith(lastChord)).slice(0, 5)
      setChordSuggestions(suggestions)
    } else {
      setChordSuggestions([])
    }
  }

  if (!showChords) {
    return <div className="text-xs text-slate-600">Chord display disabled</div>
  }

  return (
    <div className="space-y-2 font-mono text-xs leading-relaxed text-slate-900">
      {lines.map((line, idx) => {
        const { line: cleanLine, chords } = extractChords(line)
        const isBlank = !line.trim()

        if (isBlank) {
          return <div key={idx} className="h-3" />
        }

        return (
          <div
            key={idx}
            className="group relative rounded-lg bg-slate-100 p-2 hover:bg-slate-200"
            onDoubleClick={() => handleAddChordToLine(idx)}
          >
            {/* Chord line */}
            {chords.length > 0 && (
              <div className="mb-1 min-h-5 text-blue-700">
                {chords.map((chord, cidx) => (
                  <span key={cidx} className="mr-2">
                    [{chord.chord}]
                  </span>
                ))}
              </div>
            )}

            {/* Lyric line */}
            <div className="flex items-center justify-between">
              <span className="flex-1">{cleanLine}</span>
              <button
                onClick={() => handleAddChordToLine(idx)}
                className="ml-2 hidden items-center gap-1 rounded-lg bg-blue-600/20 px-2 py-1 text-[10px] text-blue-700 group-hover:inline-flex hover:bg-blue-600/30"
                title="Click to add/edit chords"
              >
                <Plus size={11} /> Chord
              </button>
            </div>
          </div>
        )
      })}

      {/* Chord editor modal */}
      {showChordPicker && editingLineIdx != null && (
        <Modal
          onClose={() => { setShowChordPicker(false); setEditingLineIdx(null) }}
          labelledBy="edit-chords-title"
          className="w-full max-w-sm rounded-xl border border-slate-200 bg-[#f4f6f9] p-4 shadow-2xl"
        >
            <h3 id="edit-chords-title" className="mb-3 text-sm font-bold text-slate-900">Edit Chords</h3>
            <p className="mb-2 text-xs text-slate-600">{lines[editingLineIdx]}</p>

            <input
              type="text"
              value={editingChords}
              onChange={(e) => handleChordInput(e.target.value)}
              placeholder="e.g. G, D, Em"
              className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 mb-2"
              // This dialog only exists because the operator just clicked "Edit
              // Chords" — autofocusing its one input is the expected, deliberate
              // continuation of that action, not an unexpected focus steal.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />

            {/* Chord suggestions */}
            {chordSuggestions.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1">
                {chordSuggestions.map((chord) => (
                  <button
                    key={chord}
                    onClick={() => handleChordInput(editingChords.replace(/[^,]*$/, `${chord}`))}
                    className="rounded-lg bg-blue-600/30 px-2 py-1 text-xs text-blue-700 hover:bg-blue-600/50"
                  >
                    {chord}
                  </button>
                ))}
              </div>
            )}

            {/* Common chords grid */}
            <div className="mb-3">
              <p className="mb-2 text-xs text-slate-600">Common chords:</p>
              <div className="flex flex-wrap gap-1">
                {COMMON_CHORDS.slice(0, 12).map((chord) => (
                  <button
                    key={chord}
                    onClick={() => {
                      const current = editingChords.trim()
                      const separator = current.length > 0 ? ', ' : ''
                      handleChordInput(`${current}${separator}${chord}`)
                    }}
                    className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200"
                  >
                    {chord}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSaveChords}
                className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setShowChordPicker(false)
                  setEditingLineIdx(null)
                }}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
        </Modal>
      )}
    </div>
  )
}
