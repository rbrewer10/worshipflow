import { useState } from 'react'
import { FileUp } from 'lucide-react'
import { importLyrics } from '../../shared/lyricImport'
import { notifyLocal } from './NotifyToasts'

function LyricImport({ onImported }: { onImported: (id: number) => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const preview = text.trim() ? importLyrics(text) : null

  const save = async (): Promise<void> => {
    const song = importLyrics(text)
    if (!song) return
    setBusy(true)
    try {
      const id = await window.wf.songCreate({
        title: song.title,
        author: song.author,
        ccli: song.ccli,
        copyright: song.copyright,
        sections: song.sections,
      })
      notifyLocal(`Imported “${song.title}”`, 'info')
      setText('')
      setOpen(false)
      onImported(id)
    } catch (err) {
      notifyLocal(err instanceof Error ? err.message : 'Could not import that song', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-panel px-3 py-2 text-sm font-semibold text-content-secondary hover:bg-panel-raised"
        title="Paste ChordPro, CCLI SongSelect, or plain lyrics"
      >
        <FileUp size={15} /> Paste lyrics
      </button>
    )
  }

  return (
    <div className="mb-3 rounded-lg border border-blue-500/30 bg-blue-500/[0.06] p-2">
      <p className="mb-1.5 text-[11px] text-content-secondary">
        Paste ChordPro, a CCLI SongSelect copy, or labeled lyrics (Verse / Chorus).
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder="{title: Amazing Grace}&#10;Verse 1&#10;Amazing grace, how sweet the sound"
        className="mb-1.5 w-full resize-y rounded-lg border border-border bg-panel px-2 py-1.5 font-mono text-xs outline-none focus:border-blue-500"
      />
      {preview && (
        <p className="mb-1.5 text-[11px] text-content-secondary">
          {preview.source === 'chordpro' ? 'ChordPro' : preview.source === 'ccli' ? 'CCLI' : 'Plain lyrics'}
          {' · '}
          <span className="font-semibold text-content-primary">{preview.title}</span>
          {preview.author ? ` · ${preview.author}` : ''}
          {preview.ccli ? ` · #${preview.ccli}` : ''}
          {` · ${preview.sections.length} section${preview.sections.length === 1 ? '' : 's'}`}
        </p>
      )}
      <div className="flex gap-1.5">
        <button type="button" onClick={() => { setOpen(false); setText('') }} className="flex-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-content-secondary hover:bg-panel-raised">
          Cancel
        </button>
        <button type="button" disabled={!preview || busy} onClick={() => void save()} className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
          {busy ? 'Saving…' : 'Add to library'}
        </button>
      </div>
    </div>
  )
}

export default LyricImport
