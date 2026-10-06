import { useState } from 'react'
import { ListMusic } from 'lucide-react'
import { parseSetlist, matchSongTitle, type SetlistKind } from '../../shared/setlistImport'
import { localDateString } from '../../shared/localDate'
import { notifyLocal } from './NotifyToasts'
import { useService } from './ServiceContext'

const KIND_LABEL: Record<SetlistKind, string> = {
  song: 'Song', scripture: 'Scripture', sermon: 'Sermon', placeholder: 'Placeholder', element: 'Header'
}
const KIND_CLASS: Record<SetlistKind, string> = {
  song: 'text-blue-400', scripture: 'text-emerald-400', sermon: 'text-violet-400', placeholder: 'text-amber-400', element: 'text-content-tertiary'
}

function SetlistImport({ onImported }: { onImported: (serviceId: number) => void }): JSX.Element {
  const { activeServiceId, reloadActiveService } = useService()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const entries = text.trim() ? parseSetlist(text) : []

  const importNow = async (): Promise<void> => {
    if (entries.length === 0) return
    setBusy(true)
    try {
      const songs = await window.wf.songsList('')
      let serviceId = activeServiceId
      if (serviceId == null) {
        // Local date — toISOString() is UTC, so after 8 PM EDT the new
        // service was dated tomorrow (QA B2-N7).
        const today = localDateString()
        serviceId = await window.wf.serviceCreate('Imported setlist', today)
      }
      const missing: string[] = []
      for (const entry of entries) {
        if (entry.kind === 'song') {
          const id = matchSongTitle(entry.title, songs)
          if (id != null) {
            await window.wf.serviceAddItem(serviceId, { type: 'song', ref_id: id })
          } else {
            missing.push(entry.title)
            await window.wf.serviceAddItem(serviceId, { type: 'placeholder', payload: { label: `Song: ${entry.title}` } })
          }
        } else if (entry.kind === 'scripture') {
          await window.wf.serviceAddItem(serviceId, { type: 'scripture', payload: { reference: entry.title } })
        } else if (entry.kind === 'sermon') {
          await window.wf.serviceAddItem(serviceId, { type: 'sermon', payload: { title: entry.title } })
        } else if (entry.kind === 'element') {
          // Welcome / Communion / Offering / Prayer…: a run-sheet header, not a
          // "Song: …" placeholder that blocks the readiness check (QA B16).
          await window.wf.serviceAddItem(serviceId, { type: 'header', payload: { label: entry.title } })
        }
      }
      await reloadActiveService()
      onImported(serviceId)
      setText('')
      setOpen(false)
      if (missing.length) {
        notifyLocal(`${missing.length} song${missing.length === 1 ? '' : 's'} not in the library — added as placeholders.`, 'warn')
      } else {
        notifyLocal(`Imported ${entries.length} item${entries.length === 1 ? '' : 's'}.`, 'info')
      }
    } catch (err) {
      notifyLocal(err instanceof Error ? err.message : 'Could not import that setlist', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="btn min-h-9 px-2 text-[11px] leading-tight"
        title="Paste a Planning Center or typed order of service"
      >
        <ListMusic size={12} /> Paste setlist
      </button>
    )
  }

  return (
    <div className="col-span-2 rounded-lg border border-blue-500/30 bg-blue-500/[0.06] p-2">
      <p className="mb-1 text-[11px] text-content-secondary">
        One item per line. Songs match your library by title. Scripture like “John 3:16”. “Sermon: The Cross” becomes a sermon card. Welcome, Offering, Prayer and similar become section headers.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={'1. Amazing Grace\n2. How Great Thou Art\nJohn 3:16\nSermon: The Cross'}
        className="mb-1.5 w-full resize-y rounded-lg border border-border bg-panel px-2 py-1.5 font-mono text-xs outline-none focus:border-blue-500"
      />
      {entries.length > 0 && (
        <>
          <p className="mb-1 text-[11px] text-content-secondary">
            {entries.length} item{entries.length === 1 ? '' : 's'} · {entries.filter((e) => e.kind === 'song').length} songs · {entries.filter((e) => e.kind === 'scripture').length} scripture
          </p>
          {/* What each line will become, so a mistake ("Song: Prelude") is
              caught before importing (QA B2-N6). */}
          <ol data-testid="setlist-preview" aria-label="Setlist preview" className="mb-1.5 max-h-24 space-y-0.5 overflow-y-auto rounded-md [@media(min-height:860px)]:max-h-40 border border-border bg-panel px-2 py-1 text-[11px]">
            {entries.map((e, i) => (
              <li key={i} className="flex gap-2">
                <span className={`w-16 shrink-0 font-semibold ${KIND_CLASS[e.kind]}`}>{KIND_LABEL[e.kind]}</span>
                <span className="min-w-0 truncate text-content-primary">{e.title}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      {/* Pinned to the bottom of the scrolling import panel so the commit
          button is never pushed off-screen by a long preview (QA B3-N1). */}
      <div data-testid="setlist-actions" className="sticky bottom-0 -mx-2 -mb-2 flex gap-1.5 rounded-b-lg border-t border-blue-500/20 bg-panel-raised p-2">
        <button type="button" onClick={() => { setOpen(false); setText('') }} className="flex-1 rounded-lg border border-border px-2 py-1.5 text-[11px] font-semibold">Cancel</button>
        <button type="button" disabled={entries.length === 0 || busy} onClick={() => void importNow()} className="flex-1 rounded-lg bg-blue-600 px-2 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40">
          {busy ? 'Importing…' : activeServiceId ? 'Add to this service' : 'Create service'}
        </button>
      </div>
    </div>
  )
}

export default SetlistImport
