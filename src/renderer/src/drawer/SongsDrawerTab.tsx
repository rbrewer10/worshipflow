import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import type { SongSummary } from '../../../shared/types'
import { useService } from '../ServiceContext'
import { addAndGoLive } from './addAndGoLive'

export default function SongsDrawerTab({ onDone }: { onDone: () => void }): JSX.Element {
  const { activeServiceId, reloadActiveService } = useService()
  const [search, setSearch] = useState('')
  const [songs, setSongs] = useState<SongSummary[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.wf.songsList(search).then(setSongs)
  }, [search])

  const pick = async (songId: number): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const ok = await addAndGoLive(activeServiceId, { type: 'song', ref_id: songId }, reloadActiveService)
      if (ok) onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search songs…"
        className="rounded border border-slate-300 px-2 py-1 text-sm"
      />
      <div className="flex flex-col gap-1">
        {songs.length === 0 && <p className="text-xs text-slate-400">No songs found.</p>}
        {songs.map((s) => (
          <button
            key={s.id}
            onClick={() => void pick(s.id)}
            disabled={busy}
            className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2 py-1.5 text-left text-sm hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="truncate">
              {s.title}
              {s.author ? <span className="text-slate-400"> — {s.author}</span> : null}
            </span>
            <Play size={13} className="shrink-0 text-blue-600" />
          </button>
        ))}
      </div>
    </div>
  )
}
