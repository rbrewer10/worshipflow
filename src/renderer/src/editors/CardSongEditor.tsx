import { analyzeAndLabelSections, previewAutoLabels } from '../autoLabel'
import type { SongFull } from '../../../shared/types'
import { memo } from 'react'
import { Tag, Film, Image as ImageIcon, X, Check } from 'lucide-react'
import Modal from '../Modal'
import ReflowEditor from '../ReflowEditor'

interface CardSongEditorProps {
  songFull: SongFull | null
  lyrics: string
  showAutoLabelPreview: boolean
  autoLabelPreview: string
  autoLabelAnalyses: any[]
  onLyricsChange: (lyrics: string) => void
  onSave: () => void
  onAutoLabelClick: () => void
  onAutoLabelPreviewClose: () => void
  onAutoLabelApply: (preview: string) => void
  onBackgroundClick: () => void
  onRemoveBackground: () => void
  fontScale: number
  onFontScaleChange: (scale: number) => void
  setAutoLabelPreview: (preview: string) => void
  setAutoLabelAnalyses: (analyses: any[]) => void
  setShowAutoLabelPreview: (show: boolean) => void
}

export const CardSongEditor = memo(function CardSongEditor({
  songFull,
  lyrics,
  showAutoLabelPreview,
  autoLabelPreview,
  autoLabelAnalyses,
  onLyricsChange,
  onSave,
  onAutoLabelClick,
  onAutoLabelPreviewClose,
  onAutoLabelApply,
  onBackgroundClick,
  onRemoveBackground,
  fontScale,
  onFontScaleChange,
  setAutoLabelPreview,
  setAutoLabelAnalyses,
  setShowAutoLabelPreview
}: CardSongEditorProps): JSX.Element {
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
      <div className="flex min-h-0 flex-col gap-2" style={{ height: '320px' }}>
        <span className="section-header block">Lyrics</span>
        <p className="text-xs text-content-secondary">A blank line starts a new slide — a label like "Chorus" starts a new section</p>
        {songFull && <ReflowEditor song={songFull} value={lyrics} onChange={onLyricsChange} />}
      </div>

      {/* Lyrics controls */}
      <div className="flex gap-2">
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

      {/* Font size — was previously only adjustable reactively, from Live
          Control while the song was already live. Matches the slider
          Scripture/Text/Announcement items already have here. */}
      <div className="border-t border-border pt-3">
        <label htmlFor="song-font-size-slider" className="mb-1.5 flex items-center justify-between text-[11px] text-content-secondary">
          <span>Font size</span>
          <span className="font-mono text-content-primary">{fontScale} vw</span>
        </label>
        <input id="song-font-size-slider" type="range" min={3} max={14} step={0.5}
          value={fontScale}
          onChange={(e) => onFontScaleChange(Number(e.target.value))}
          aria-label="Font size slider from 3 to 14"
          className="w-full accent-blue-600" />
      </div>

      {/* Song background */}
      <div className="space-y-2 border-t border-border pt-3">
        <span className="section-header">Motion Background</span>
        {songFull?.background ? (
          <div className="surface flex items-center gap-2">
            {/\.(mp4|webm|mov|m4v)$/i.test(songFull.background)
              ? <Film size={14} className="shrink-0 text-content-secondary" />
              : <ImageIcon size={14} className="shrink-0 text-content-secondary" />}
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-content-secondary">
              {songFull.background.split(/[/\\]/).pop()}
            </span>
            <button onClick={onRemoveBackground} aria-label="Remove song background" className="btn-danger shrink-0 text-xs py-1"><X size={13} /></button>
          </div>
        ) : (
          <p className="text-xs text-content-secondary">No background set — lyrics show over animated gradient</p>
        )}
        <button onClick={onBackgroundClick}
          aria-label={songFull?.background ? 'Change song background' : 'Add motion background to song'}
          className="w-full btn-secondary text-xs">
          <Film size={13} /> {songFull?.background ? 'Change background…' : 'Add motion background…'}
        </button>
      </div>

      {/* Auto-label preview modal */}
      {showAutoLabelPreview && (
        <Modal onClose={onAutoLabelPreviewClose} labelledBy="auto-label-title" className="card-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="mb-4">
              <h3 id="auto-label-title" className="section-title mb-1">Auto-Label Preview</h3>
              <p className="text-xs text-content-secondary">
                Detected <span className="font-semibold text-content-secondary">{autoLabelAnalyses.length}</span> sections — review confidence scores below
              </p>
            </div>

            {/* Show each detected section with its analysis */}
            <div className="mb-4 space-y-3 max-h-64 overflow-y-auto rounded-lg border border-border bg-panel-raised p-3">
              {autoLabelAnalyses.map((analysis) => (
                <div key={analysis.ordinal} className="text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-content-secondary">
                      Section {analysis.ordinal + 1}: <span className="text-blue-400">{analysis.detectedKind}</span>
                    </span>
                    <span className="text-content-secondary">
                      {Math.round(analysis.confidence * 100)}% confidence
                    </span>
                  </div>
                  <span className="text-content-secondary">{analysis.reason}</span>
                </div>
              ))}
            </div>

            {/* Preview of labeled lyrics */}
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold text-content-secondary uppercase tracking-wider">Preview with labels</p>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-panel-raised p-3 font-mono text-xs leading-relaxed text-content-secondary whitespace-pre-wrap break-words">
                {autoLabelPreview}
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-border mt-4">
              <button onClick={() => onAutoLabelApply(autoLabelPreview)} className="flex-1 btn-primary text-sm py-2">
                <Check size={14} /> Apply Labels
              </button>
              <button onClick={onAutoLabelPreviewClose} className="flex-1 btn text-sm py-2">
                Cancel
              </button>
            </div>
        </Modal>
      )}
    </div>
  )
})
