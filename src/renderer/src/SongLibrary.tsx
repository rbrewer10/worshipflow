import { useEffect, useState } from 'react'
import type { SectionKind, SongInput, SongSection, SongSummary } from '../../shared/types'

const KNOWN: SectionKind[] = ['verse', 'chorus', 'bridge', 'tag', 'intro', 'ending']

// Parse a lyrics textarea into sections. Blocks are separated by blank lines.
// If a block's first short line names a section (e.g. "Chorus", "Verse 2"),
// it becomes the label/kind; otherwise the block is a verse.
function parseSections(text: string): SongSection[] {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  return blocks.map((block, i) => {
    const linesArr = block.split('\n')
    const first = linesArr[0].trim()
    const word = first.toLowerCase().replace(/\s*\d+\s*$/, '')
    const matched = KNOWN.find((k) => word === k)
    if (matched && first.length <= 14) {
      return { kind: matched, label: first, ordinal: i, lyrics: linesArr.slice(1).join('\n').trim() }
    }
    return { kind: 'verse', label: null, ordinal: i, lyrics: block }
  })
}

function SongLibrary(): JSX.Element {
  const [songs, setSongs] = useState<SongSummary[]>([])
  const [search, setSearch] = useState('')
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [saving, setSaving] = useState(false)

  const refresh = (q = search): void => {
    window.wf.songsList(q).then(setSongs)
  }

  useEffect(() => {
    refresh(search)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const add = async (): Promise<void> => {
    if (!title.trim() || saving) return
    setSaving(true)
    const input: SongInput = {
      title: title.trim(),
      author: author.trim() || undefined,
      sections: parseSections(lyrics)
    }
    await window.wf.songCreate(input)
    setTitle('')
    setAuthor('')
    setLyrics('')
    setSaving(false)
    refresh('')
    setSearch('')
  }

  const remove = async (id: number): Promise<void> => {
    await window.wf.songDelete(id)
    refresh()
  }

  return (
    <div className="flex h-full min-h-0 gap-4 p-4">
      {/* Library list */}
      <div className="flex w-96 flex-col rounded-xl border border-white/10 bg-white/[0.03] p-3">
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
              className="group flex items-center justify-between rounded-lg px-3 py-2 hover:bg-white/[0.05]"
            >
              <div>
                <div className="text-sm font-medium">{s.title}</div>
                {s.author && <div className="text-xs text-slate-400">{s.author}</div>}
              </div>
              <button
                onClick={() => remove(s.id)}
                className="rounded px-2 py-1 text-xs text-slate-500 opacity-0 hover:bg-red-500/20 hover:text-red-300 group-hover:opacity-100"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 border-t border-white/10 pt-2 text-xs text-slate-500">
          {songs.length} song{songs.length === 1 ? '' : 's'} in library
        </div>
      </div>

      {/* Add form */}
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Add a song
        </h2>
        <div className="mb-3 flex gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Author (optional)"
            className="w-56 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </div>
        <textarea
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          placeholder={
            'Paste lyrics. Separate sections with a blank line.\n\nOptionally start a block with a label:\n\nVerse 1\nAmazing grace, how sweet the sound...\n\nChorus\n...'
          }
          className="min-h-0 flex-1 resize-none rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-sm leading-relaxed outline-none focus:border-blue-500"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {lyrics.trim() ? `${parseSections(lyrics).length} section(s) detected` : ' '}
          </span>
          <button
            onClick={add}
            disabled={!title.trim() || saving}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Add to library'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SongLibrary
