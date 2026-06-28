import { useEffect, useState } from 'react'
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
          <div className="rounded-xl border border-white/10 bg-slate-900 p-5 shadow-lg max-w-sm">
            <h3 className="mb-2 text-lg font-semibold text-white">Delete Song?</h3>
            <p className="mb-4 text-sm text-slate-400">
              Are you sure you want to delete <span className="font-semibold text-slate-200">{confirmDelete.title}</span>? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold hover:bg-white/[0.12]"
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
      <div className="flex h-full min-h-0 gap-4 p-4">
      {/* Library list */}
      <div className="flex w-96 flex-col rounded-xl border border-white/[0.07] bg-[#15151a] p-3">
        <CcliPanel />
        <PptxImport onImported={() => refresh()} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search songs by title, author, or lyrics…"
          className="mb-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <div className="min-h-0 flex-1 space-y-1 overflow-auto">
          {songs.length === 0 && (
            <p className="px-1 py-6 text-center text-sm text-slate-500">
              {search ? 'No matches.' : 'No songs yet — add your first one →'}
            </p>
          )}
          {songs.map((s) => (
            <div
              key={s.id}
              className={`group flex items-center gap-2 rounded-lg px-3 py-2 ${
                editorId === s.id ? 'bg-blue-500/10 ring-1 ring-blue-500/30' : 'hover:bg-white/[0.05]'
              }`}
            >
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setEditorId(s.id)}>
                <div className="text-sm font-medium">{s.title}</div>
                {s.author && <div className="text-xs text-slate-400">{s.author}</div>}
              </div>
              {s.background ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => pickBg(s.id)}
                    className="max-w-[80px] truncate rounded-md bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-violet-400 hover:bg-violet-500/25"
                    title={s.background}
                  >
                    🎬 {/\.(mp4|webm|mov|m4v)$/i.test(s.background) ? 'video' : 'image'}
                  </button>
                  <button
                    onClick={() => clearBg(s.id)}
                    className="rounded px-1 text-slate-500 hover:text-red-400"
                    title="Remove background"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => pickBg(s.id)}
                  className="shrink-0 rounded-md border border-dashed border-slate-600 px-2 py-0.5 text-xs text-slate-500 hover:border-violet-400 hover:text-violet-400"
                  title="Add background video or image"
                >
                  + bg
                </button>
              )}
              <button
                onClick={() => setEditorId(s.id)}
                className="shrink-0 rounded px-2 py-1 text-xs text-slate-500 opacity-0 hover:bg-white/10 hover:text-slate-200 group-hover:opacity-100"
              >
                Edit
              </button>
              <button
                onClick={() => remove(s.id)}
                className="shrink-0 rounded px-2 py-1 text-xs text-slate-500 opacity-0 hover:bg-red-500/20 hover:text-red-300 group-hover:opacity-100"
              >
                Del
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 border-t border-white/10 pt-2 text-xs text-slate-500">
          {songs.length} song{songs.length === 1 ? '' : 's'} in library
        </div>
      </div>

      {/* WYSIWYG editor or welcome state */}
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-white/[0.07] bg-[#1a1a1d] p-4">
        {editorId != null ? (
          <SongEditor
            key={editorId}
            songId={editorId}
            onSaved={() => { refresh() }}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="text-4xl opacity-20">🎵</div>
            <p className="text-sm text-slate-500">Select a song from the list to open the slide editor</p>
          </div>
        )}
      </div>
    </div>
    </>
  )
}

export default SongLibrary
