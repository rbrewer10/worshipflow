import { useState } from 'react'
import { ListMusic } from 'lucide-react'
import { parseSetlist, matchSongTitle } from '../../shared/setlistImport'
import { notifyLocal } from './NotifyToasts'
import { useService } from './ServiceContext'

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
        const today = new Date().toISOString().slice(0, 10)
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
        One item per line. Songs match your library by title. Scripture like “John 3:16”. Lines starting with Sermon become a sermon card.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={'1. Amazing Grace\n2. How Great Thou Art\nJohn 3:16\nSermon: The Cross'}
        className="mb-1.5 w-full resize-y rounded-lg border border-border bg-panel px-2 py-1.5 font-mono text-xs outline-none focus:border-blue-500"
      />
      {entries.length > 0 && (
        <p className="mb-1.5 text-[11px] text-content-secondary">
          {entries.length} item{entries.length === 1 ? '' : 's'} · {entries.filter((e) => e.kind === 'song').length} songs · {entries.filter((e) => e.kind === 'scripture').length} scripture
        </p>
      )}
      <div className="flex gap-1.5">
        <button type="button" onClick={() => { setOpen(false); setText('') }} className="flex-1 rounded-lg border border-border px-2 py-1.5 text-[11px] font-semibold">Cancel</button>
        <button type="button" disabled={entries.length === 0 || busy} onClick={() => void importNow()} className="flex-1 rounded-lg bg-blue-600 px-2 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40">
          {busy ? 'Importing…' : activeServiceId ? 'Add to this service' : 'Create service'}
        </button>
      </div>
    </div>
  )
}

export default SetlistImport
