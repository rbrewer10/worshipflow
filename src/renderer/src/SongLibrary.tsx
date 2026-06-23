import { useEffect, useState } from 'react'
import type { SongFull, SongInput, SongSection, SongSummary } from '../../shared/types'
import CcliPanel from './CcliPanel'
import PptxImport from './PptxImport'
import { parseSections, sectionsToText } from './songText'

function sectionLabel(sec: SongSection, idx: number): string {
  if (sec.label) return sec.label
  return sec.kind.charAt(0).toUpperCase() + sec.kind.slice(1) + (idx > 0 ? ` ${idx + 1}` : '')
}

function SongLibrary(): JSX.Element {
  const [songs, setSongs] = useState<SongSummary[]>([])
  const [search, setSearch] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [ccli, setCcli] = useState('')
  const [copyright, setCopyright] = useState('')
  const [publisher, setPublisher] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [arrangement, setArrangement] = useState<number[]>([])
  const [fontScale, setFontScale] = useState<number>(6)
  const [linesPerSlide, setLinesPerSlide] = useState<number>(2)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; title: string } | null>(null)

  const parsedSections = lyrics.trim() ? parseSections(lyrics) : []

  const refresh = (q = search): void => {
    window.wf.songsList(q).then(setSongs)
  }

  useEffect(() => {
    refresh(search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const resetForm = (): void => {
    setEditId(null)
    setTitle('')
    setAuthor('')
    setCcli('')
    setCopyright('')
    setPublisher('')
    setLyrics('')
    setArrangement([])
    setFontScale(6)
    setLinesPerSlide(2)
  }

  const startEdit = async (id: number): Promise<void> => {
    const song = await window.wf.songGet(id)
    if (!song) return
    setEditId(id)
    setTitle(song.title)
    setAuthor(song.author ?? '')
    setCcli(song.ccli ?? '')
    setCopyright(song.copyright ?? '')
    setPublisher(song.publisher ?? '')
    setLyrics(sectionsToText(song))
    setArrangement(song.arrangement ?? [])
    setFontScale(song.fontScale ?? 6)
    setLinesPerSlide(song.linesPerSlide ?? 2)
  }

  const save = async (): Promise<void> => {
    if (!title.trim() || saving) return
    setSaving(true)
    const sections = parseSections(lyrics)
    // Filter out arrangement indices that exceed current section count.
    const validArrangement = arrangement.filter((i) => i < sections.length)
    const input: SongInput = {
      title: title.trim(),
      author: author.trim() || undefined,
      ccli: ccli.trim() || undefined,
      copyright: copyright.trim() || undefined,
      publisher: publisher.trim() || undefined,
      sections,
      arrangement: validArrangement.length > 0 ? validArrangement : null,
      fontScale: fontScale !== 6 ? fontScale : null,
      linesPerSlide: linesPerSlide !== 2 ? linesPerSlide : null
    }
    if (editId != null) {
      await window.wf.songUpdate(editId, input)
    } else {
      await window.wf.songCreate(input)
    }
    resetForm()
    setSaving(false)
    refresh('')
    setSearch('')
  }

  const remove = (id: number): void => {
    const song = songs.find((s) => s.id === id)
    if (song) setConfirmDelete({ id, title: song.title })
  }

  const confirmRemove = async (): Promise<void> => {
    if (!confirmDelete) return
    if (editId === confirmDelete.id) resetForm()
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

  const addToArrangement = (idx: number): void =>
    setArrangement((prev) => [...prev, idx])

  const removeFromArrangement = (pos: number): void =>
    setArrangement((prev) => prev.filter((_, i) => i !== pos))

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
      <div className="flex w-96 flex-col rounded-xl border border-white/10 bg-white/[0.03] p-3">
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
                editId === s.id ? 'bg-blue-500/10 ring-1 ring-blue-500/30' : 'hover:bg-white/[0.05]'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{s.title}</div>
                {s.author && <div className="text-xs text-slate-400">{s.author}</div>}
              </div>
              {s.background ? (
                <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
                  <span className="max-w-[70px] truncate text-xs text-emerald-400" title={s.background}>
                    🎬 {s.background.split(/[/\\]/).pop()}
                  </span>
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
                  className="shrink-0 rounded px-2 py-0.5 text-xs text-slate-500 opacity-0 hover:bg-white/10 hover:text-slate-300 group-hover:opacity-100"
                >
                  + bg
                </button>
              )}
              <button
                onClick={() => startEdit(s.id)}
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

      {/* Add / Edit form */}
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {editId != null ? 'Edit song' : 'Add a song'}
          </h2>
          {editId != null && (
            <button onClick={resetForm} className="text-xs text-slate-500 hover:text-slate-300">
              Cancel
            </button>
          )}
        </div>
        <div className="mb-3 flex gap-3">
          <div className="flex-1">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Song title (required)"
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${
                title.trim()
                  ? 'border-emerald-500/50 bg-emerald-500/5 focus:border-emerald-400'
                  : 'border-white/10 bg-black/30 focus:border-blue-500'
              }`}
            />
            {!title.trim() && editId != null && <p className="mt-1 text-xs text-slate-600">Title is required</p>}
          </div>
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Author (optional)"
            className="w-48 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        {/* CCLI / copyright metadata */}
        <div className="mb-3 flex flex-wrap gap-3">
          <input
            value={ccli}
            onChange={(e) => setCcli(e.target.value)}
            placeholder="CCLI Song # (optional)"
            className="w-44 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors"
          />
          <input
            value={copyright}
            onChange={(e) => setCopyright(e.target.value)}
            placeholder="Copyright (e.g. © 2001 Songs)"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors"
          />
          <input
            value={publisher}
            onChange={(e) => setPublisher(e.target.value)}
            placeholder="Publisher (optional)"
            className="w-48 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <textarea
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          placeholder={
            'Paste lyrics. Separate sections with a blank line.\n\nOptionally label a block:\n\nVerse 1\nAmazing grace, how sweet the sound...\n\nChorus\nMy chains are gone...'
          }
          className="min-h-0 flex-1 resize-none rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-sm leading-relaxed outline-none focus:border-blue-500"
        />

        {/* Arrangement editor — only shows when there are multiple sections */}
        {parsedSections.length > 1 && (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Play order
              </span>
              {arrangement.length > 0 && (
                <button
                  onClick={() => setArrangement([])}
                  className="text-xs text-slate-500 hover:text-slate-300"
                >
                  ↺ Reset to default
                </button>
              )}
            </div>

            {/* Source section chips */}
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500">Add:</span>
              {parsedSections.map((sec, i) => (
                <button
                  key={i}
                  onClick={() => addToArrangement(i)}
                  className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-0.5 text-xs hover:bg-blue-600/30 hover:border-blue-500/40"
                >
                  {sectionLabel(sec, i)} +
                </button>
              ))}
            </div>

            {/* Current play order */}
            <div className="flex min-h-[26px] flex-wrap gap-1.5">
              {arrangement.length === 0 ? (
                <span className="text-xs text-slate-600 italic">
                  Default: {parsedSections.map((s, i) => sectionLabel(s, i)).join(' → ')}
                </span>
              ) : (
                arrangement.map((idx, pos) => {
                  const sec = parsedSections[idx]
                  return sec ? (
                    <div
                      key={pos}
                      className="flex items-center gap-1 rounded-full bg-blue-600/20 border border-blue-500/30 px-2.5 py-0.5 text-xs"
                    >
                      <span className="text-blue-200">{sectionLabel(sec, idx)}</span>
                      <button
                        onClick={() => removeFromArrangement(pos)}
                        className="text-blue-400/60 hover:text-red-400 leading-none"
                      >
                        ×
                      </button>
                    </div>
                  ) : null
                })
              )}
            </div>
          </div>
        )}

        {/* Lines per slide */}
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
          <span className="text-xs text-slate-400">Lines per slide:</span>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4].map((v) => (
              <button
                key={v}
                onClick={() => setLinesPerSlide(v)}
                className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors ${
                  linesPerSlide === v
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-500 hover:bg-white/10 hover:text-slate-200'
                }`}
              >
                {v === 2 ? `${v} (default)` : v}
              </button>
            ))}
          </div>
        </div>

        {/* Font size */}
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
          <span className="text-xs text-slate-400">Text size on screen:</span>
          <div className="flex items-center gap-1">
            {[3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
              <button
                key={v}
                onClick={() => setFontScale(v)}
                className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors ${
                  fontScale === v
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-500 hover:bg-white/10 hover:text-slate-200'
                }`}
              >
                {v === 6 ? `${v} (default)` : v}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {parsedSections.length > 0
              ? `${parsedSections.length} section(s) · ${
                  arrangement.length > 0
                    ? `custom order (${arrangement.length} plays)`
                    : 'default order'
                }`
              : ' '}
          </span>
          <button
            onClick={save}
            disabled={!title.trim() || saving}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving…' : editId != null ? 'Save changes' : 'Add to library'}
          </button>
        </div>
      </div>
    </div>
    </>
  )
}

export default SongLibrary
