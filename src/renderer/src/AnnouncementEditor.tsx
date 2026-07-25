import { useEffect, useState } from 'react'
import type { Announcement, AnnouncementInput } from '../../shared/types'
import { announcementExpired } from '../../shared/announcementSchedule'
import BackgroundLibraryGrid from './BackgroundLibraryGrid'

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
      blurBehindText: next.blurBehindText,
      frequency: next.frequency,
      startDate: next.startDate,
      endDate: next.endDate,
      active: next.active
    }
    window.wf.announcementUpdate(id, input).then(onSaved)
  }

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
        className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-lg font-semibold outline-none focus:border-blue-500"
      />
      <textarea
        value={a.body}
        onChange={(e) => setA({ ...a, body: e.target.value })}
        onBlur={() => save({ body: a.body })}
        placeholder="Announcement text…"
        rows={4}
        className="w-full resize-none rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm outline-none focus:border-blue-500"
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
                a.display === d ? 'border-blue-500 bg-blue-500/10 text-blue-700' : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Background + blur (slide only) */}
      {a.display === 'slide' && (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-slate-600">Background (optional)</label>
          <button
            onClick={() => save({ blurBehindText: !a.blurBehindText })}
            className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors ${
              a.blurBehindText ? 'border-blue-400 bg-blue-500/10' : 'border-slate-200 bg-white'
            }`}
          >
            <span className="text-[11px] font-semibold text-slate-700">Blur behind text</span>
            <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${a.blurBehindText ? 'bg-blue-600' : 'bg-slate-300'}`}>
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${a.blurBehindText ? 'translate-x-4' : 'translate-x-1'}`} />
            </span>
          </button>
          <BackgroundLibraryGrid
            activePath={a.background ?? null}
            onApply={(path) => save({ background: path || null })}
          />
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
                a.frequency === f ? 'border-blue-500 bg-blue-500/10 text-blue-700' : 'border-slate-200 bg-white text-slate-500'
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
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
            />
          </label>
          {a.frequency === 'recurring' && (
            <label className="flex-1 text-xs text-slate-600">
              End (optional)
              <input
                type="date"
                value={a.endDate ?? ''}
                onChange={(e) => save({ endDate: e.target.value || null })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
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
