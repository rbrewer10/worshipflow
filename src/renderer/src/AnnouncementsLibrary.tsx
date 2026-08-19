import { useEffect, useState } from 'react'
import { Megaphone, Plus, ScrollText, Type } from 'lucide-react'
import type { AnnouncementSummary } from '../../shared/types'
import AnnouncementEditor from './AnnouncementEditor'
import Modal from './Modal'
import { notifyLocal, notifyLocalAction } from './NotifyToasts'
import { useService } from './ServiceContext'

function AnnouncementsLibrary(): JSX.Element {
  const { activeServiceId, activeService, reloadActiveService } = useService()
  const [items, setItems] = useState<AnnouncementSummary[]>([])
  const [search, setSearch] = useState('')
  const [editorId, setEditorId] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; title: string } | null>(null)
  // "New Announcement" used to create a permanent "New Announcement" DB record
  // on the first click, before the operator had typed anything — abandoning
  // it left a placeholder in the real library. Naming it first means nothing
  // is created until there's a real title to save.
  const [namingNew, setNamingNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  // Full-library titles for duplicate detection, independent of whatever the
  // search box currently shows — see the matching comment in SongLibrary.tsx.
  const [existingTitles, setExistingTitles] = useState<string[]>([])
  const [addingAnnouncementId, setAddingAnnouncementId] = useState<number | null>(null)
  useEffect(() => {
    if (namingNew) window.wf.announcementsList('').then((list) => setExistingTitles(list.map((a) => a.title)))
  }, [namingNew])
  const duplicateTitle = existingTitles.find((t) => t.trim().toLowerCase() === newTitle.trim().toLowerCase())

  const refresh = (q = search): void => {
    window.wf.announcementsList(q).then(setItems)
  }
  useEffect(() => {
    refresh(search)
  }, [search])

  const confirmRemove = async (): Promise<void> => {
    if (!confirmDelete) return
    const { id, title } = confirmDelete
    if (editorId === id) setEditorId(null)
    // Captured before deleting so Undo can recreate it — see the matching
    // comment in SongLibrary.tsx (a real re-create, not a true un-delete).
    const full = await window.wf.announcementGet(id)
    await window.wf.announcementDelete(id)
    refresh()
    setConfirmDelete(null)
    if (full) {
      notifyLocalAction(`Deleted "${title}"`, 'Undo', () => {
        void window.wf.announcementCreate({
          title: full.title,
          body: full.body,
          display: full.display,
          background: full.background,
          blurBehindText: full.blurBehindText,
          frequency: full.frequency,
          startDate: full.startDate,
          endDate: full.endDate,
          active: full.active
        }).then(() => refresh())
      })
    }
  }

  const createAnnouncement = async (): Promise<void> => {
    const title = newTitle.trim()
    if (!title) return
    const id = await window.wf.announcementCreate({ title, body: '', display: 'slide', frequency: 'recurring' })
    setNamingNew(false)
    setNewTitle('')
    refresh()
    setEditorId(id)
  }

  const addToCurrentService = async (item: AnnouncementSummary): Promise<void> => {
    if (activeServiceId == null || addingAnnouncementId != null) return
    setAddingAnnouncementId(item.id)
    try {
      await window.wf.serviceAddItem(activeServiceId, { type: 'announcement', ref_id: item.id, track: 'main' })
      reloadActiveService()
      notifyLocal(`Added “${item.title}” to ${activeService?.name ?? 'the current service'}.`, 'info')
    } finally {
      setAddingAnnouncementId(null)
    }
  }

  return (
    <>
      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)} labelledBy="delete-announcement-title" className="max-w-sm rounded-xl border border-border bg-panel p-5 shadow-lg">
            <h3 id="delete-announcement-title" className="mb-2 text-lg font-semibold text-content-primary">Delete announcement?</h3>
            <p className="mb-4 text-sm text-content-secondary">
              Delete <span className="font-semibold text-content-primary">{confirmDelete.title}</span>? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 rounded-lg border border-border bg-panel-raised px-4 py-2 text-sm font-semibold hover:bg-border-strong">Cancel</button>
              <button onClick={confirmRemove} className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">Delete</button>
            </div>
        </Modal>
      )}
      <div className="flex h-full min-h-0 gap-4 p-4 text-content-primary">
        <h1 className="sr-only">Announcements</h1>
        <div className="flex w-96 flex-col rounded-xl border border-border bg-panel p-3">
          {namingNew ? (
            <form
              onSubmit={(e) => { e.preventDefault(); void createAnnouncement() }}
              className="mb-2 flex flex-col gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/[0.06] p-2"
            >
              <input
                // This form only renders because the operator just clicked
                // "New Announcement" — autofocusing the title field is the
                // deliberate continuation of that action, not an unexpected
                // focus steal.
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setNamingNew(false); setNewTitle('') } }}
                placeholder="Announcement title…"
                className="w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
              {duplicateTitle && (
                <p className="text-[11px] text-amber-400">
                  “{duplicateTitle}” is already in your library — this will create a separate copy.
                </p>
              )}
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => { setNamingNew(false); setNewTitle('') }}
                  className="flex-1 rounded-lg border border-border bg-panel px-3 py-1.5 text-xs font-semibold text-content-secondary hover:bg-panel-raised"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTitle.trim()}
                  className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
                >
                  Create
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setNamingNew(true)}
              className="mb-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-500"
            >
              <Plus size={15} /> New Announcement
            </button>
          )}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search announcements…"
            className="mb-3 w-full rounded-lg border border-border bg-panel-raised px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          {activeService && (
            <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-blue-500/20 bg-blue-500/[0.06] px-2.5 py-1.5 text-[11px] text-content-secondary">
              <Plus size={12} className="shrink-0 text-blue-400" />
              <span className="truncate">Add announcements directly to <span className="font-semibold text-content-primary">{activeService.name}</span></span>
            </div>
          )}
          <div className="min-h-0 flex-1 space-y-1 overflow-auto">
            {items.length === 0 && (
              <p className="px-1 py-6 text-center text-sm text-content-secondary">{search ? 'No matches.' : 'No announcements yet — add your first one'}</p>
            )}
            {items.map((it) => (
              <div
                key={it.id}
                className={`group flex items-center gap-2 rounded-lg px-3 py-2 ${editorId === it.id ? 'bg-blue-500/10 ring-1 ring-blue-500/30' : 'hover:bg-panel-raised'} ${it.expired ? 'opacity-50' : ''}`}
              >
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-panel-raised text-content-secondary">
                  {it.display === 'ticker' ? <ScrollText size={14} /> : <Type size={14} />}
                </div>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditorId(it.id)}>
                  <div className="truncate text-sm font-medium">{it.title}</div>
                  <div className="truncate text-xs text-content-secondary">
                    {it.frequency === 'once' ? 'One time' : 'Recurring'}{it.expired ? ' · expired' : it.active ? '' : ' · paused'}
                  </div>
                </button>
                {activeServiceId != null && (
                  <button
                    onClick={() => { void addToCurrentService(it) }}
                    disabled={addingAnnouncementId != null}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-blue-500/25 bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-400 hover:bg-blue-500/20 disabled:cursor-wait disabled:opacity-50"
                    title={`Add “${it.title}” to ${activeService?.name ?? 'the current service'}`}
                    aria-label={`Add ${it.title} to current service`}
                  >
                    <Plus size={12} /> {addingAnnouncementId === it.id ? 'Adding…' : 'Add'}
                  </button>
                )}
                <button onClick={() => setConfirmDelete({ id: it.id, title: it.title })} className="shrink-0 rounded px-2 py-1 text-xs text-content-secondary opacity-0 hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100">Del</button>
              </div>
            ))}
          </div>
          <div className="mt-2 border-t border-border pt-2 text-xs text-content-secondary">{items.length} announcement{items.length === 1 ? '' : 's'}</div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-border bg-panel p-4">
          {editorId != null ? (
            <AnnouncementEditor key={editorId} id={editorId} onSaved={() => refresh()} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <Megaphone size={40} className="opacity-20" />
              <p className="text-sm text-content-secondary">Select an announcement to edit, or add a new one</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default AnnouncementsLibrary
