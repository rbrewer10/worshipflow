import { useEffect, useState } from 'react'
import { Megaphone } from 'lucide-react'
import type { Announcement } from '../../shared/types'

// Shown in the service editor for an `announcement` item. Content is owned by the
// Announcements library, so this is read-only — it points the operator there to edit.
export default function AnnouncementItemEditor({ refId }: { refId: number | null }): JSX.Element {
  const [a, setA] = useState<Announcement | null>(null)
  useEffect(() => {
    if (refId != null) window.wf.announcementGet(refId).then(setA)
  }, [refId])

  if (!a) return <div className="text-sm text-slate-500">Announcement not found. It may have been deleted from the library.</div>

  return (
    <div className="space-y-2 text-sm text-slate-700">
      <div className="flex items-center gap-2 font-semibold text-slate-900">
        <Megaphone size={15} /> {a.title}
      </div>
      <p className="whitespace-pre-line rounded-lg bg-slate-100 px-3 py-2 text-slate-600">{a.body || '(no text)'}</p>
      <p className="text-xs text-slate-500">
        Shows as <b className="capitalize">{a.display}</b>. Edit the text, background, or schedule in the <b>Announcements</b> tab.
      </p>
    </div>
  )
}
