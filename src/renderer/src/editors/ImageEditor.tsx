import { memo } from 'react'
import { AlertTriangle, Film, Image as ImageIcon, Upload } from 'lucide-react'
import { notifyLocal } from '../NotifyToasts'

interface ImageEditorProps {
  imagePath: string
  onPathChange: (path: string) => void
  /** From wf:services:get — the projector can't load this file (QA B2-N1). */
  mediaProblem?: 'missing' | 'outside'
}

const isVideoFile = (p: string): boolean => /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(p)

export const ImageEditor = memo(function ImageEditor({ imagePath, onPathChange, mediaProblem }: ImageEditorProps): JSX.Element {
  const hasFile = Boolean(imagePath) && imagePath !== '—'

  // wf.mediaPick copies the chosen file into WorshipFlow's own media folder and
  // returns the copy — the projector can only load files from there (B2-N1).
  const pickFile = async (): Promise<void> => {
    const result = await window.wf.mediaPick()
    if (result.error) { notifyLocal(result.error, 'error'); return }
    if (!result.canceled && result.path) onPathChange(result.path)
  }

  return (
    <div className="space-y-2">
      <span className="section-header block">Image or Video</span>
      {hasFile ? (
        <div className="surface flex items-center gap-2">
          {isVideoFile(imagePath)
            ? <Film size={14} className="shrink-0 text-content-secondary" />
            : <ImageIcon size={14} className="shrink-0 text-content-secondary" />}
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-content-secondary" title={imagePath}>
            {imagePath.split(/[/\\]/).pop()}
          </span>
        </div>
      ) : (
        <p className="text-xs text-content-secondary">No file selected</p>
      )}
      {hasFile && mediaProblem && (
        <div role="alert" data-testid="media-problem" className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            {mediaProblem === 'missing'
              ? 'This file isn’t on this computer any more, so the projector will be blank. Re-link it to the picture or video.'
              : 'This file is outside WorshipFlow’s media folder, so the projector can’t show it. Re-link it and WorshipFlow will keep its own copy.'}
          </span>
        </div>
      )}
      <button onClick={pickFile} className="w-full btn-secondary text-xs">
        <Upload size={13} /> {hasFile ? (mediaProblem ? 'Re-link file…' : 'Change file…') : 'Choose file…'}
      </button>
    </div>
  )
})
