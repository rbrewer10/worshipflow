import { useEffect, useState } from 'react'
import { FileDown, Film, Image as ImageIcon, Music, Plus, X } from 'lucide-react'
import type { SongSummary } from '../../shared/types'
import CcliPanel from './CcliPanel'
import SongEditor from './editor/SongEditor'
import PptxImport from './PptxImport'
import Modal from './Modal'
import { useAutosave } from './useAutosave'
import { notifyLocalAction } from './NotifyToasts'

function SongLibrary(): JSX.Element {
  const [songs, setSongs] = useState<SongSummary[]>([])
  const [search, setSearch] = useState('')
  const [editorId, setEditorId] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; title: string } | null>(null)
  // "New Song" used to create a permanent "New Song" DB record on the first
  // click, before the operator had typed anything — abandoning it left a
  // placeholder in the real library (the audit found several). Naming it
  // first means nothing is created until there's a real title to save.
  const [namingNew, setNamingNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  // Full-library titles for duplicate detection — fetched fresh (not filtered
  // by whatever's in the search box) each time the naming form opens, per the
  // audit's "warn about likely duplicates" (the library already had several
  // duplicate "New Song" placeholders from before the draft-gate existed).
  const [existingTitles, setExistingTitles] = useState<string[]>([])
  useEffect(() => {
    if (namingNew) window.wf.songsList('').then((list) => setExistingTitles(list.map((s) => s.title)))
  }, [namingNew])
  const duplicateTitle = existingTitles.find((t) => t.trim().toLowerCase() === newTitle.trim().toLowerCase())

  const refresh = (q = search): void => {
    window.wf.songsList(q).then(setSongs)
  }

  useEffect(() => {
    refresh(search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const remove = (id: number): void => {
    const song = songs.find((s) => s.id === id)
    if (song) setConfirmDelete({ id, title: song.title })
  }

  const confirmRemove = async (): Promise<void> => {
    if (!confirmDelete) return
    const { id, title } = confirmDelete
    if (editorId === id) setEditorId(null)
    // Captured before deleting so a click on the Undo toast can recreate it —
    // there's no soft-delete/trash table, so this is a real re-create (a new
    // id, same content) rather than a true un-delete, but it gets the operator
    // back to where they were after an accidental confirm.
    const full = await window.wf.songGet(id)
    await window.wf.songDelete(id)
    refresh()
    setConfirmDelete(null)
    if (full) {
      notifyLocalAction(`Deleted "${title}"`, 'Undo', () => {
        void window.wf.songCreate({
          title: full.title,
          author: full.author ?? undefined,
          ccli: full.ccli ?? undefined,
          copyright: full.copyright ?? undefined,
          publisher: full.publisher ?? undefined,
          background: full.background,
          sections: full.sections,
          arrangement: full.arrangement ?? undefined,
          fontScale: full.fontScale ?? undefined,
          linesPerSlide: full.linesPerSlide ?? undefined,
          bgMotion: full.bgMotion,
          textColor: full.textColor,
          font: full.font,
          blurBehindText: full.blurBehindText
        }).then(() => refresh())
      })
    }
  }

  // Serialized so picking backgrounds on two different rows in quick
  // succession can't land out of order, and a rejected write surfaces as a
  // toast (see saveQueue.ts) instead of vanishing — previously this had no
  // catch at all.
  const bgQueue = useAutosave<{ id: number; path: string | null }>(({ id, path }) =>
    window.wf.songSetBackground(id, path).then(() => refresh())
  )
  const pickBg = async (id: number): Promise<void> => {
    const result = await window.wf.dialogOpenFile()
    if (result.canceled || !result.filePaths[0]) return
    bgQueue.trigger({ id, path: result.filePaths[0] })
  }

  const clearBg = (id: number): void => {
    bgQueue.trigger({ id, path: null })
  }

  const createSong = async (): Promise<void> => {
    const title = newTitle.trim()
    if (!title) return
    const id = await window.wf.songCreate({
      title,
      sections: [{ kind: 'verse', ordinal: 0, lyrics: '' }]
    })
    setNamingNew(false)
    setNewTitle('')
    refresh()
    setEditorId(id)
  }

  return (
    <>
      {/* Confirmation Dialog */}
      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)} labelledBy="delete-song-title" className="rounded-xl border border-slate-200 bg-[#f4f6f9] p-5 shadow-lg max-w-sm">
            <h3 id="delete-song-title" className="mb-2 text-lg font-semibold text-slate-900">Delete Song?</h3>
            <p className="mb-4 text-sm text-slate-600">
              Are you sure you want to delete <span className="font-semibold text-slate-900">{confirmDelete.title}</span>? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemove}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
              >
                Delete
              </button>
            </div>
        </Modal>
      )}
      <div className="flex h-full min-h-0 gap-4 p-4 text-slate-900">
      <h1 className="sr-only">Song Library</h1>
      {/* Library list */}
      <div className="flex w-96 flex-col rounded-xl border border-slate-200 bg-[#f4f6f9] p-3">
        <CcliPanel />
        <PptxImport onImported={() => refresh()} />
        <button
          onClick={async () => {
            const res = await window.wf.songsExportList()
            if (!res.canceled)
              window.alert(
                `Exported ${res.count} song${res.count === 1 ? '' : 's'}.\n\n` +
                  'In the Snow Hill Church app: Planning → "Sync songs from WorshipFlow" → choose this file.'
              )
          }}
          className="mb-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          title="Export your song titles as a file to load into the church planning app"
        >
          <FileDown size={15} /> Export song list (for church app)
        </button>
        {namingNew ? (
          <form
            onSubmit={(e) => { e.preventDefault(); void createSong() }}
            className="mb-2 flex flex-col gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/[0.06] p-2"
          >
            <input
              // This form only renders because the operator just clicked "New
              // Song" — autofocusing the title field is the deliberate
              // continuation of that action, not an unexpected focus steal.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setNamingNew(false); setNewTitle('') } }}
              placeholder="Song title…"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            {duplicateTitle && (
              <p className="text-[11px] text-amber-700">
                “{duplicateTitle}” is already in your library — this will create a separate copy.
              </p>
            )}
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => { setNamingNew(false); setNewTitle('') }}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
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
            <Plus size={15} /> New Song
          </button>
        )}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search songs by title, author, or lyrics…"
          className="mb-3 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <div className="min-h-0 flex-1 space-y-1 overflow-auto">
          {songs.length === 0 && (
            <p className="px-1 py-6 text-center text-sm text-slate-500">
              {search ? 'No matches.' : 'No songs yet — add your first one'}
            </p>
          )}
          {songs.map((s) => (
            <div
              key={s.id}
              className={`group flex items-center gap-2 rounded-lg px-3 py-2 ${
                editorId === s.id ? 'bg-blue-500/10 ring-1 ring-blue-500/30' : 'hover:bg-slate-100'
              }`}
            >
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditorId(s.id)}>
                <div className="text-sm font-medium">{s.title}</div>
                {s.author && <div className="text-xs text-slate-600">{s.author}</div>}
              </button>
              {s.background ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => pickBg(s.id)}
                    className="inline-flex max-w-[80px] items-center justify-center gap-1.5 truncate rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                    title={s.background}
                  >
                    {/\.(mp4|webm|mov|m4v)$/i.test(s.background) ? <Film size={13} /> : <ImageIcon size={13} />}
                    {/\.(mp4|webm|mov|m4v)$/i.test(s.background) ? 'video' : 'image'}
                  </button>
                  <button
                    onClick={() => clearBg(s.id)}
                    className="inline-flex items-center justify-center rounded px-1 text-slate-500 hover:text-red-600"
                    title="Remove background"
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => pickBg(s.id)}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700"
                  title="Add background video or image"
                >
                  <Plus size={13} /> bg
                </button>
              )}
              <button
                onClick={() => setEditorId(s.id)}
                className="shrink-0 rounded px-2 py-1 text-xs text-slate-500 opacity-0 hover:bg-slate-200 hover:text-slate-900 group-hover:opacity-100"
              >
                Edit
              </button>
              <button
                onClick={() => remove(s.id)}
                className="shrink-0 rounded px-2 py-1 text-xs text-slate-500 opacity-0 hover:bg-red-500/20 hover:text-red-600 group-hover:opacity-100"
              >
                Del
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500">
          {songs.length} song{songs.length === 1 ? '' : 's'} in library
        </div>
      </div>

      {/* WYSIWYG editor or welcome state */}
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-slate-200 bg-[#f4f6f9] p-4">
        {editorId != null ? (
          <SongEditor
            key={editorId}
            songId={editorId}
            onSaved={() => { refresh() }}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <Music size={40} className="opacity-20" />
            <p className="text-sm text-slate-500">Select a song from the list to open the slide editor</p>
          </div>
        )}
      </div>
    </div>
    </>
  )
}

export default SongLibrary
