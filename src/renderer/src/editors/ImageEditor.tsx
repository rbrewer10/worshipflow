import { memo } from 'react'
import { Film, Image as ImageIcon, Upload } from 'lucide-react'

interface ImageEditorProps {
  imagePath: string
  onPathChange: (path: string) => void
}

const isVideoFile = (p: string): boolean => /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(p)

export const ImageEditor = memo(function ImageEditor({ imagePath, onPathChange }: ImageEditorProps): JSX.Element {
  const hasFile = Boolean(imagePath) && imagePath !== '—'

  const pickFile = async (): Promise<void> => {
    const result = await window.wf.dialogOpenFile()
    if (!result.canceled && result.filePaths[0]) {
      onPathChange(result.filePaths[0])
    }
  }

  return (
    <div className="space-y-2">
      <label className="section-header block">Image or Video</label>
      {hasFile ? (
        <div className="surface flex items-center gap-2">
          {isVideoFile(imagePath)
            ? <Film size={14} className="shrink-0 text-slate-600" />
            : <ImageIcon size={14} className="shrink-0 text-slate-600" />}
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700" title={imagePath}>
            {imagePath.split(/[/\\]/).pop()}
          </span>
        </div>
      ) : (
        <p className="text-xs text-slate-500">No file selected</p>
      )}
      <button onClick={pickFile} className="w-full btn-secondary text-xs">
        <Upload size={13} /> {hasFile ? 'Change file…' : 'Choose file…'}
      </button>
    </div>
  )
})
