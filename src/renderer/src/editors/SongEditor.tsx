import { ChordDisplay } from '../ChordDisplay'
import { transposeLyrics } from '../chordUtils'
import { analyzeAndLabelSections, previewAutoLabels } from '../autoLabel'
import type { SongFull } from '../../../shared/types'
import { memo } from 'react'
import { Guitar, Tag, Film, Image as ImageIcon, X, Check, Minus, Plus } from 'lucide-react'

interface SongEditorProps {
  songFull: SongFull | null
  lyrics: string
  showChords: boolean
  showAutoLabelPreview: boolean
  autoLabelPreview: string
  autoLabelAnalyses: any[]
  onLyricsChange: (lyrics: string) => void
  onSave: () => void
  onShowChordsToggle: () => void
  onAutoLabelClick: () => void
  onAutoLabelPreviewClose: () => void
  onAutoLabelApply: (preview: string) => void
  onBackgroundClick: () => void
  onRemoveBackground: () => void
  setAutoLabelPreview: (preview: string) => void
  setAutoLabelAnalyses: (analyses: any[]) => void
  setShowAutoLabelPreview: (show: boolean) => void
}

export const SongEditor = memo(function SongEditor({
  songFull,
  lyrics,
  showChords,
  showAutoLabelPreview,
  autoLabelPreview,
  autoLabelAnalyses,
  onLyricsChange,
  onSave,
  onShowChordsToggle,
  onAutoLabelClick,
  onAutoLabelPreviewClose,
  onAutoLabelApply,
  onBackgroundClick,
  onRemoveBackground,
  setAutoLabelPreview,
  setAutoLabelAnalyses,
  setShowAutoLabelPreview
}: SongEditorProps): JSX.Element {
  const handleAutoLabel = (): void => {
    const analyses = analyzeAndLabelSections(lyrics)
    const preview = previewAutoLabels(lyrics, analyses)
    setAutoLabelAnalyses(analyses)
    setAutoLabelPreview(preview)
    setShowAutoLabelPreview(true)
  }

  return (
    <div className="space-y-4">
      {/* Lyrics */}
      <div className="space-y-2">
        <label htmlFor="song-lyrics" className="section-header block">Lyrics</label>
        <p className="text-xs text-slate-500">Separate sections with blank lines</p>
        <textarea id="song-lyrics" value={lyrics} onChange={(e) => onLyricsChange(e.target.value)} rows={8}
          placeholder="Enter lyrics — one section per paragraph (separated by blank lines)…"
          aria-label="Song lyrics"
          className="font-mono text-xs leading-relaxed" />
      </div>

      {/* Lyrics controls */}
      <div className="flex gap-2">
        <button onClick={onShowChordsToggle} className="btn text-xs">
          <Guitar size={13} /> {showChords ? 'Hide chords' : 'Show chords'}
        </button>
        <button onClick={handleAutoLabel} disabled={!lyrics.trim()}
          aria-label="Auto-detect and label song sections (Verse, Chorus, Bridge, etc.)"
          className="btn-secondary text-xs disabled:opacity-40">
          <Tag size={13} /> Auto-label
        </button>
        <button onClick={onSave} disabled={!songFull}
          aria-label="Save song lyrics"
          className="btn-primary text-xs disabled:opacity-40">
          Save lyrics
        </button>
      </div>

      {/* Chord display */}
      {showChords && songFull && (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Transpose</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onLyricsChange(transposeLyrics(lyrics, -1))}
                disabled={!lyrics.trim()}
                aria-label="Transpose all chords down one semitone"
                title="Transpose down a semitone"
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                <Minus size={13} />
              </button>
              <button
                onClick={() => onLyricsChange(transposeLyrics(lyrics, 1))}
                disabled={!lyrics.trim()}
                aria-label="Transpose all chords up one semitone"
                title="Transpose up a semitone"
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                <Plus size={13} />
              </button>
            </div>
          </div>
          <ChordDisplay lyrics={lyrics} showChords={showChords} onChordsChange={onLyricsChange} />
        </div>
      )}

      {/* Song background */}
      <div className="space-y-2 border-t border-slate-200 pt-3">
        <label className="section-header">Motion Background</label>
        {songFull?.background ? (
          <div className="surface flex items-center gap-2">
            {/\.(mp4|webm|mov|m4v)$/i.test(songFull.background)
              ? <Film size={14} className="shrink-0 text-slate-600" />
              : <ImageIcon size={14} className="shrink-0 text-slate-600" />}
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">
              {songFull.background.split(/[/\\]/).pop()}
            </span>
            <button onClick={onRemoveBackground} aria-label="Remove song background" className="btn-danger shrink-0 text-xs py-1"><X size={13} /></button>
          </div>
        ) : (
          <p className="text-xs text-slate-500">No background set — lyrics show over animated gradient</p>
        )}
        <button onClick={onBackgroundClick}
          aria-label={songFull?.background ? 'Change song background' : 'Add motion background to song'}
          className="w-full btn-secondary text-xs">
          <Film size={13} /> {songFull?.background ? 'Change background…' : 'Add motion background…'}
        </button>
      </div>

      {/* Auto-label preview modal */}
      {showAutoLabelPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="mb-4">
              <h3 className="section-title mb-1">Auto-Label Preview</h3>
              <p className="text-xs text-slate-500">
                Detected <span className="font-semibold text-slate-700">{autoLabelAnalyses.length}</span> sections — review confidence scores below
              </p>
            </div>

            {/* Show each detected section with its analysis */}
            <div className="mb-4 space-y-3 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-slate-100 p-3">
              {autoLabelAnalyses.map((analysis) => (
                <div key={analysis.ordinal} className="text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-700">
                      Section {analysis.ordinal + 1}: <span className="text-emerald-700">{analysis.detectedKind}</span>
                    </span>
                    <span className="text-slate-500">
                      {Math.round(analysis.confidence * 100)}% confidence
                    </span>
                  </div>
                  <span className="text-slate-500">{analysis.reason}</span>
                </div>
              ))}
            </div>

            {/* Preview of labeled lyrics */}
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold text-slate-700 uppercase tracking-wider">Preview with labels</p>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-slate-100 p-3 font-mono text-xs leading-relaxed text-slate-700 whitespace-pre-wrap break-words">
                {autoLabelPreview}
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-200 mt-4">
              <button onClick={() => onAutoLabelApply(autoLabelPreview)} className="flex-1 btn-primary text-sm py-2">
                <Check size={14} /> Apply Labels
              </button>
              <button onClick={onAutoLabelPreviewClose} className="flex-1 btn text-sm py-2">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
