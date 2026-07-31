import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import type { AnnouncementSummary } from '../../../shared/types'
import { useService } from '../ServiceContext'
import { addAndGoLive } from './addAndGoLive'

export default function AnnouncementsDrawerTab({ onDone }: { onDone: () => void }): JSX.Element {
  const { activeServiceId, reloadActiveService } = useService()
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<AnnouncementSummary[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.wf.announcementsList(search).then(setItems)
  }, [search])

  const pick = async (id: number): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const ok = await addAndGoLive(activeServiceId, { type: 'announcement', ref_id: id }, reloadActiveService)
      if (ok) onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        // This drawer tab only opens because the operator just chose to add
        // an announcement — autofocusing the search box is the deliberate
        // continuation of that action, not an unexpected focus steal.
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search announcements…"
        className="rounded border border-slate-300 px-2 py-1 text-sm"
      />
      <div className="flex flex-col gap-1">
        {items.length === 0 && <p className="text-xs text-slate-400">No announcements found.</p>}
        {items.map((a) => (
          <button
            key={a.id}
            onClick={() => void pick(a.id)}
            disabled={busy}
            className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2 py-1.5 text-left text-sm hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="truncate">{a.title}</span>
            <Play size={13} className="shrink-0 text-blue-600" />
          </button>
        ))}
      </div>
    </div>
  )
}
