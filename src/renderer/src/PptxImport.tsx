import { useState } from 'react'
import { FileUp } from 'lucide-react'
import type { ParsedPptxSong, SongInput } from '../../shared/types'

// Import songs from PowerPoint (.pptx) files: pick files, review, then save.
function PptxImport({ onImported }: { onImported: () => void }): JSX.Element {
  const [parsed, setParsed] = useState<ParsedPptxSong[] | null>(null)
  const [titles, setTitles] = useState<string[]>([])
  const [include, setInclude] = useState<boolean[]>([])
  const [importing, setImporting] = useState(false)

  const pick = async (): Promise<void> => {
    const songs = await window.wf.songsImportPptx()
    if (songs.length === 0) return
    setParsed(songs)
    setTitles(songs.map((s) => s.title))
    setInclude(songs.map(() => true))
  }

  const close = (): void => {
    setParsed(null)
    setTitles([])
    setInclude([])
  }

  const doImport = async (): Promise<void> => {
    if (!parsed) return
    setImporting(true)
    for (let i = 0; i < parsed.length; i++) {
      if (!include[i]) continue
      const song = parsed[i]
      const input: SongInput = {
        title: titles[i].trim() || song.fileName,
        sections: song.slides.map((text, idx) => ({ kind: 'verse', label: null, ordinal: idx, lyrics: text }))
      }
      await window.wf.songCreate(input)
    }
    setImporting(false)
    close()
    onImported()
  }

  const includedCount = include.filter(Boolean).length

  return (
    <>
      <button
        onClick={pick}
        className="mb-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-600/20 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-600/30"
      >
        <FileUp size={15} /> Import from PowerPoint
      </button>

      {parsed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={close}>
          <div
            className="flex max-h-[82vh] w-full max-w-3xl flex-col rounded-xl border border-slate-200 bg-[#f4f6f9] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Import {parsed.length} PowerPoint file{parsed.length === 1 ? '' : 's'}</h3>
              <button onClick={close} className="rounded bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200">Cancel</button>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Each slide becomes a section. Review the titles, then import. You can add CCLI info and re-label sections later in the editor.
            </p>

            <div className="min-h-0 flex-1 space-y-2 overflow-auto">
              {parsed.map((song, i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-slate-100 p-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={include[i]}
                      onChange={(e) => setInclude((cur) => cur.map((v, idx) => (idx === i ? e.target.checked : v)))}
                      className="h-4 w-4 shrink-0"
                    />
                    <input
                      value={titles[i]}
                      onChange={(e) => setTitles((cur) => cur.map((v, idx) => (idx === i ? e.target.value : v)))}
                      className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-sm font-medium text-slate-900 outline-none focus:border-blue-500"
                    />
                    <span className="shrink-0 text-xs text-slate-500">{song.slides.length} slide{song.slides.length === 1 ? '' : 's'}</span>
                  </div>
                  {song.slides[0] && (
                    <div className="mt-1.5 max-h-16 overflow-hidden whitespace-pre-line pl-6 text-xs text-slate-500">
                      {song.slides[0].slice(0, 160)}{song.slides[0].length > 160 ? '…' : ''}
                    </div>
                  )}
                  {song.slides.length === 0 && (
                    <div className="mt-1 pl-6 text-xs text-amber-700">No text found in this file — it may be image-based slides.</div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-slate-500">{includedCount} of {parsed.length} selected</span>
              <button
                onClick={doImport}
                disabled={importing || includedCount === 0}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-40"
              >
                {importing ? 'Importing…' : `Import ${includedCount} song${includedCount === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default PptxImport
