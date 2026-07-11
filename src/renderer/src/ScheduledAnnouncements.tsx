import { useEffect, useState } from 'react'
import { CalendarClock, Check, Plus } from 'lucide-react'
import type { AnnouncementSummary } from '../../shared/types'

// Lists active announcements scheduled for `serviceDate`, with one-tap add. Rows
// already present in the service (by ref_id) show as "Added". Hidden entirely when
// the service has no date set.
export default function ScheduledAnnouncements({
  serviceDate,
  addedRefIds,
  onAdd
}: {
  serviceDate: string | null
  addedRefIds: Set<number>
  onAdd: (announcementId: number) => void
}): JSX.Element | null {
  const [items, setItems] = useState<AnnouncementSummary[]>([])

  useEffect(() => {
    if (!serviceDate) { setItems([]); return }
    window.wf.announcementsScheduled(serviceDate).then(setItems)
  }, [serviceDate, addedRefIds.size])

  if (!serviceDate) {
    return (
      <div className="mb-3 rounded-xl border border-dashed border-slate-300 bg-[#f4f6f9] p-3 text-xs text-slate-500">
        Set a service date to see scheduled announcements.
      </div>
    )
  }
  if (items.length === 0) return null

  const unadded = items.filter((it) => !addedRefIds.has(it.id))

  return (
    <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <CalendarClock size={14} className="text-emerald-700" />
        <span className="text-xs font-bold uppercase tracking-widest text-emerald-700">Scheduled for {serviceDate}</span>
        {unadded.length > 0 && (
          <button
            onClick={() => unadded.forEach((it) => onAdd(it.id))}
            className="ml-auto rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
          >
            Add all
          </button>
        )}
      </div>
      <div className="space-y-1">
        {items.map((it) => {
          const added = addedRefIds.has(it.id)
          return (
            <div key={it.id} className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-slate-800">{it.title}</span>
              {added ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><Check size={13} /> Added</span>
              ) : (
                <button onClick={() => onAdd(it.id)} className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-200">
                  <Plus size={13} /> Add
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
