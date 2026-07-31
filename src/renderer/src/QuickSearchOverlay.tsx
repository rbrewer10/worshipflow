import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Music, Megaphone, BookOpen, X } from 'lucide-react'
import type { SongSummary, AnnouncementSummary } from '../../shared/types'
import Modal from './Modal'

type Result =
  | { kind: 'song'; id: number; label: string }
  | { kind: 'announcement'; id: number; label: string }
  | { kind: 'scripture'; reference: string; label: string }

// Ctrl/Cmd+F from anywhere in Build Service: search songs + announcements at
// once, plus a standing "add this as scripture" option, and drop the pick
// straight onto the end of the open service — no navigating a per-type picker.
export default function QuickSearchOverlay({
  songs,
  announcements,
  onAddSong,
  onAddAnnouncement,
  onAddScripture,
  onClose
}: {
  songs: SongSummary[]
  announcements: AnnouncementSummary[]
  onAddSong: (id: number) => void
  onAddAnnouncement: (id: number) => void
  onAddScripture: (reference: string) => void
  onClose: () => void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase()
    const songResults: Result[] = (q ? songs.filter((s) => s.title.toLowerCase().includes(q)) : songs.slice(0, 6))
      .slice(0, 8)
      .map((s) => ({ kind: 'song', id: s.id, label: s.title }))
    const annResults: Result[] = (q ? announcements.filter((a) => a.title.toLowerCase().includes(q)) : [])
      .slice(0, 5)
      .map((a) => ({ kind: 'announcement', id: a.id, label: a.title }))
    const scriptureResult: Result[] = q ? [{ kind: 'scripture', reference: query.trim(), label: query.trim() }] : []
    return [...songResults, ...annResults, ...scriptureResult]
  }, [query, songs, announcements])

  useEffect(() => { setHighlighted(0) }, [query])

  const pick = (r: Result): void => {
    if (r.kind === 'song') onAddSong(r.id)
    else if (r.kind === 'announcement') onAddAnnouncement(r.id)
    else onAddScripture(r.reference)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, results.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); return }
    if (e.key === 'Enter') { e.preventDefault(); const r = results[highlighted]; if (r) pick(r); return }
  }

  return (
    <Modal onClose={onClose} align="top" label="Quick search" className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5">
          <Search size={16} className="shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search songs, announcements, or type a scripture reference…"
            aria-label="Quick search — songs, announcements, scripture"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button onClick={onClose} aria-label="Close quick search" className="shrink-0 text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <div className="max-h-80 overflow-auto py-1.5">
          {results.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-slate-400">Type to search your songs and announcements, or a scripture reference like John 3:16.</p>
          )}
          {results.map((r, i) => {
            const Icon = r.kind === 'song' ? Music : r.kind === 'announcement' ? Megaphone : BookOpen
            const kindLabel = r.kind === 'song' ? 'Song' : r.kind === 'announcement' ? 'Announcement' : 'Add as scripture'
            return (
              <button
                key={`${r.kind}:${r.kind === 'scripture' ? r.reference : r.id}`}
                onClick={() => pick(r)}
                onMouseEnter={() => setHighlighted(i)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  highlighted === i ? 'bg-blue-500/10' : 'hover:bg-slate-50'
                }`}
              >
                <Icon size={14} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-900">{r.label}</span>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{kindLabel}</span>
              </button>
            )
          })}
        </div>
        <div className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] text-slate-400">
          ↑↓ to navigate · Enter to add to the end of this service · Esc to close
        </div>
    </Modal>
  )
}
