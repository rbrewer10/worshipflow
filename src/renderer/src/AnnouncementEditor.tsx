import { useEffect, useState } from 'react'
import { Film, Image as ImageIcon, X } from 'lucide-react'
import type { Announcement, AnnouncementInput } from '../../shared/types'
import { announcementExpired } from '../../shared/announcementSchedule'

// Edits one announcement. Loads the full record by id, saves via announcementUpdate
// (dates/toggles save immediately; text fields save on blur to avoid a DB write per
// keystroke). Calls onSaved so the library list refreshes.
export default function AnnouncementEditor({ id, onSaved }: { id: number; onSaved: () => void }): JSX.Element {
  const [a, setA] = useState<Announcement | null>(null)

  useEffect(() => {
    window.wf.announcementGet(id).then(setA)
  }, [id])

  if (!a) return <div className="text-sm text-slate-500">Loading…</div>

  const save = (patch: Partial<Announcement>): void => {
    const next = { ...a, ...patch }
    setA(next)
    const input: AnnouncementInput = {
      title: next.title,
      body: next.body,
      display: next.display,
      background: next.background,
      frequency: next.frequency,
      startDate: next.startDate,
      endDate: next.endDate,
      active: next.active
    }
    window.wf.announcementUpdate(id, input).then(onSaved)
  }

  const pickBg = async (): Promise<void> => {
    const result = await window.wf.dialogOpenFile()
    if (result.canceled || !result.filePaths[0]) return
    save({ background: result.filePaths[0] })
  }

  const isVid = a.background ? /\.(mp4|webm|mov|m4v)$/i.test(a.background) : false
  const expired = announcementExpired(a, new Date().toISOString().slice(0, 10))

  const summary = ((): string => {
    if (a.frequency === 'once') return a.startDate ? `One time on ${a.startDate}` : 'One time (pick a date)'
    const from = a.startDate ? `from ${a.startDate}` : 'from now'
    const to = a.endDate ? `until ${a.endDate}` : 'no end date'
    return `Every service ${from}, ${to}`
  })()

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
      <input
        value={a.title}
        onChange={(e) => setA({ ...a, title: e.target.value })}
        onBlur={() => save({ title: a.title })}
        placeholder="Announcement title"
        className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-lg font-semibold outline-none focus:border-emerald-500"
      />
      <textarea
        value={a.body}
        onChange={(e) => setA({ ...a, body: e.target.value })}
        onBlur={() => save({ body: a.body })}
        placeholder="Announcement text…"
        rows={4}
        className="w-full resize-none rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm outline-none focus:border-emerald-500"
      />

      {/* Display type */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Show as</label>
        <div className="flex gap-2">
          {(['slide', 'ticker'] as const).map((d) => (
            <button
              key={d}
              onClick={() => save({ display: d })}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold capitalize ${
                a.display === d ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Background (slide only) */}
      {a.display === 'slide' && (
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Background (optional)</label>
          {a.background ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                {isVid ? <Film size={13} /> : <ImageIcon size={13} />}{isVid ? 'video' : 'image'}
              </span>
              <button onClick={() => save({ background: null })} className="rounded px-1 text-slate-500 hover:text-red-600" title="Remove background"><X size={13} /></button>
            </div>
          ) : (
            <button onClick={pickBg} className="rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700">
              Choose image or video…
            </button>
          )}
        </div>
      )}

      {/* Schedule */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Schedule</label>
        <div className="mb-2 flex gap-2">
          {(['once', 'recurring'] as const).map((f) => (
            <button
              key={f}
              onClick={() => save({ frequency: f })}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
                a.frequency === f ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              {f === 'once' ? 'One time' : 'Recurring'}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-slate-600">
            {a.frequency === 'once' ? 'Date' : 'Start'}
            <input
              type="date"
              value={a.startDate ?? ''}
              onChange={(e) => save({ startDate: e.target.value || null })}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
            />
          </label>
          {a.frequency === 'recurring' && (
            <label className="flex-1 text-xs text-slate-600">
              End (optional)
              <input
                type="date"
                value={a.endDate ?? ''}
                onChange={(e) => save({ endDate: e.target.value || null })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
              />
            </label>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {summary}{expired ? ' · expired' : ''}
        </p>
      </div>

      {/* Active */}
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={a.active} onChange={(e) => save({ active: e.target.checked })} />
        Active (uncheck to pause without deleting)
      </label>
    </div>
  )
}
