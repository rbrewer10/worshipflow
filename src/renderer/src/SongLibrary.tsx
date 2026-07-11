import { useEffect, useState } from 'react'
import { Film, Image as ImageIcon, Music, Plus, X } from 'lucide-react'
import type { SongSummary } from '../../shared/types'
import CcliPanel from './CcliPanel'
import SongEditor from './editor/SongEditor'
import PptxImport from './PptxImport'

function SongLibrary(): JSX.Element {
  const [songs, setSongs] = useState<SongSummary[]>([])
  const [search, setSearch] = useState('')
  const [editorId, setEditorId] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; title: string } | null>(null)

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
    if (editorId === confirmDelete.id) setEditorId(null)
    await window.wf.songDelete(confirmDelete.id)
    refresh()
    setConfirmDelete(null)
  }

  const pickBg = async (id: number): Promise<void> => {
    const result = await window.wf.dialogOpenFile()
    if (result.canceled || !result.filePaths[0]) return
    await window.wf.songSetBackground(id, result.filePaths[0])
    refresh()
  }

  const clearBg = async (id: number): Promise<void> => {
    await window.wf.songSetBackground(id, null)
    refresh()
  }

  return (
    <>
      {/* Confirmation Dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-xl border border-slate-200 bg-[#f4f6f9] p-5 shadow-lg max-w-sm">
            <h3 className="mb-2 text-lg font-semibold text-slate-900">Delete Song?</h3>
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
          </div>
        </div>
      )}
      <div className="flex h-full min-h-0 gap-4 p-4 text-slate-900">
      {/* Library list */}
      <div className="flex w-96 flex-col rounded-xl border border-slate-200 bg-[#f4f6f9] p-3">
        <CcliPanel />
        <PptxImport onImported={() => refresh()} />
        <button
          onClick={async () => {
            const id = await window.wf.songCreate({
              title: 'New Song',
              sections: [{ kind: 'verse', ordinal: 0, lyrics: '' }]
            })
            refresh()
            setEditorId(id)
          }}
          className="mb-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          <Plus size={15} /> New Song
        </button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search songs by title, author, or lyrics…"
          className="mb-3 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm outline-none focus:border-emerald-500"
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
                editorId === s.id ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30' : 'hover:bg-slate-100'
              }`}
            >
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setEditorId(s.id)}>
                <div className="text-sm font-medium">{s.title}</div>
                {s.author && <div className="text-xs text-slate-600">{s.author}</div>}
              </div>
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
