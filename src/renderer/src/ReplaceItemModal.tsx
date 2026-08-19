import { useState } from 'react'
import { BookOpen, FileText, Music2, Plus, X } from 'lucide-react'
import type { ServiceItem, ServiceItemType, SongSummary } from '../../shared/types'
import Modal from './Modal'

export type Replacement = { type: ServiceItemType; refId: number | null; payload: Record<string, unknown> }

export default function ReplaceItemModal({ item, songs, onReplace, onClose }: {
  item: ServiceItem
  songs: SongSummary[]
  onReplace: (replacement: Replacement) => void
  onClose: () => void
}): JSX.Element {
  const [kind, setKind] = useState<'song' | 'scripture' | 'text'>('song')
  const [songId, setSongId] = useState(songs[0]?.id ? String(songs[0].id) : '')
  const [reference, setReference] = useState('')
  const [body, setBody] = useState('')

  const submit = (): void => {
    if (kind === 'song' && songId) onReplace({ type: 'song', refId: Number(songId), payload: {} })
    if (kind === 'scripture' && reference.trim()) onReplace({ type: 'scripture', refId: null, payload: { reference: reference.trim() } })
    if (kind === 'text' && body.trim()) onReplace({ type: 'text', refId: null, payload: { body: body.trim() } })
  }

  return (
    <Modal onClose={onClose} labelledBy="replace-item-title" className="w-full max-w-lg rounded-2xl border border-border bg-panel-raised p-6 text-content-primary shadow-2xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div><div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-400">Keep this position</div><h2 id="replace-item-title" className="text-xl font-semibold">Replace {item.title}</h2><p className="mt-1 text-sm text-content-secondary">Choose the real content for this moment. Its order, notes, and styling stay in place.</p></div>
        <button onClick={onClose} aria-label="Close" className="text-content-tertiary hover:text-content-primary"><X size={18} /></button>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {([['song', Music2, 'Song'], ['scripture', BookOpen, 'Scripture'], ['text', FileText, 'Text']] as const).map(([value, Icon, label]) => (
          <button key={value} onClick={() => setKind(value)} className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${kind === value ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-border bg-panel text-content-secondary hover:bg-panel-raised'}`}><Icon size={13} /> {label}</button>
        ))}
      </div>

      {kind === 'song' && <select value={songId} onChange={(e) => setSongId(e.target.value)} aria-label="Replacement song" className="w-full"><option value="">Choose a song…</option>{songs.map((song) => <option key={song.id} value={song.id}>{song.title}</option>)}</select>}
      {kind === 'scripture' && <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="John 3:16" aria-label="Replacement scripture reference" className="w-full" />}
      {kind === 'text' && <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write the text for this moment…" aria-label="Replacement text" rows={4} className="w-full" />}

      <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="btn">Cancel</button><button onClick={submit} disabled={(kind === 'song' && !songId) || (kind === 'scripture' && !reference.trim()) || (kind === 'text' && !body.trim())} className="btn-primary disabled:opacity-40"><Plus size={14} /> Replace in place</button></div>
    </Modal>
  )
}
