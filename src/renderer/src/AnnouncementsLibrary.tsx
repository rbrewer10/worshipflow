import { useEffect, useState } from 'react'
import { Megaphone, Plus, ScrollText, Type } from 'lucide-react'
import type { AnnouncementSummary } from '../../shared/types'
import AnnouncementEditor from './AnnouncementEditor'

function AnnouncementsLibrary(): JSX.Element {
  const [items, setItems] = useState<AnnouncementSummary[]>([])
  const [search, setSearch] = useState('')
  const [editorId, setEditorId] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; title: string } | null>(null)

  const refresh = (q = search): void => {
    window.wf.announcementsList(q).then(setItems)
  }
  useEffect(() => {
    refresh(search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const confirmRemove = async (): Promise<void> => {
    if (!confirmDelete) return
    if (editorId === confirmDelete.id) setEditorId(null)
    await window.wf.announcementDelete(confirmDelete.id)
    refresh()
    setConfirmDelete(null)
  }

  return (
    <>
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-w-sm rounded-xl border border-slate-200 bg-[#f4f6f9] p-5 shadow-lg">
            <h3 className="mb-2 text-lg font-semibold text-slate-900">Delete announcement?</h3>
            <p className="mb-4 text-sm text-slate-600">
              Delete <span className="font-semibold text-slate-900">{confirmDelete.title}</span>? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold hover:bg-slate-200">Cancel</button>
              <button onClick={confirmRemove} className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">Delete</button>
            </div>
          </div>
        </div>
      )}
      <div className="flex h-full min-h-0 gap-4 p-4 text-slate-900">
        <div className="flex w-96 flex-col rounded-xl border border-slate-200 bg-[#f4f6f9] p-3">
          <button
            onClick={async () => {
              const id = await window.wf.announcementCreate({ title: 'New Announcement', body: '', display: 'slide', frequency: 'recurring' })
              refresh()
              setEditorId(id)
            }}
            className="mb-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            <Plus size={15} /> New Announcement
          </button>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search announcements…"
            className="mb-3 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <div className="min-h-0 flex-1 space-y-1 overflow-auto">
            {items.length === 0 && (
              <p className="px-1 py-6 text-center text-sm text-slate-500">{search ? 'No matches.' : 'No announcements yet — add your first one'}</p>
            )}
            {items.map((it) => (
              <div
                key={it.id}
                className={`group flex items-center gap-2 rounded-lg px-3 py-2 ${editorId === it.id ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30' : 'hover:bg-slate-100'} ${it.expired ? 'opacity-50' : ''}`}
              >
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                  {it.display === 'ticker' ? <ScrollText size={14} /> : <Type size={14} />}
                </div>
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setEditorId(it.id)}>
                  <div className="truncate text-sm font-medium">{it.title}</div>
                  <div className="truncate text-xs text-slate-500">
                    {it.frequency === 'once' ? 'One time' : 'Recurring'}{it.expired ? ' · expired' : it.active ? '' : ' · paused'}
                  </div>
                </div>
                <button onClick={() => setConfirmDelete({ id: it.id, title: it.title })} className="shrink-0 rounded px-2 py-1 text-xs text-slate-500 opacity-0 hover:bg-red-500/20 hover:text-red-600 group-hover:opacity-100">Del</button>
              </div>
            ))}
          </div>
          <div className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500">{items.length} announcement{items.length === 1 ? '' : 's'}</div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-slate-200 bg-[#f4f6f9] p-4">
          {editorId != null ? (
            <AnnouncementEditor key={editorId} id={editorId} onSaved={() => refresh()} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <Megaphone size={40} className="opacity-20" />
              <p className="text-sm text-slate-500">Select an announcement to edit, or add a new one</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default AnnouncementsLibrary
