import { useEffect } from 'react'
import { Download, Globe } from 'lucide-react'
import { notifyLocal } from './NotifyToasts'

function SongSelectPanel({ onImported }: { onImported: (id: number) => void }): JSX.Element {
  useEffect(() => {
    return window.wf.onSongSelectImported((song) => {
      notifyLocal(
        song.created === false
          ? `“${song.title}” is already in your library`
          : `Imported “${song.title}” from SongSelect`,
        'info'
      )
      onImported(song.id)
    })
  }, [onImported])

  return (
    <div className="mb-3 rounded-lg border border-blue-500/30 bg-blue-500/[0.06] p-2">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-blue-300">SongSelect by CCLI</div>
      <p className="mb-2 text-[11px] text-content-secondary">
        Sign in, open a song, Lyrics → Download → Text File. A popup confirms it landed in your library. Downloading the same song twice will not make a copy.
      </p>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => void window.wf.songSelectOpen()}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
        >
          <Globe size={14} /> Open SongSelect
        </button>
        <button
          type="button"
          onClick={() => void window.wf.songSelectImportFile()}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-panel px-3 py-2 text-xs font-semibold text-content-secondary hover:bg-panel-raised"
          title="Import a .usr or .txt you already downloaded"
        >
          <Download size={14} /> File
        </button>
      </div>
    </div>
  )
}

export default SongSelectPanel
