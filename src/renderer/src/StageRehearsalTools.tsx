import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Mic2, Square, Search } from 'lucide-react'
import type { LiveState, SongSummary } from '../../shared/types'
import type { StageRehearsalState } from '../../shared/stageRehearsal'

// Purpose-built rehearsal control: automatically steps through the active
// service's songs, in order, on the Stage Monitor (Zone 4), while Zones 1-3
// loop through the service's announcements on Main — untouched by the
// operator. Deliberately narrower than the general Main/Second track UI (no
// scripture, no black/logo) — see docs/superpowers/plans/
// 2026-08-08-stage-rehearsal.md for why that general UI stays hidden.
function StageRehearsalTools({ onActiveChange }: { onActiveChange: (active: boolean) => void }): JSX.Element {
  const [state, setState] = useState<StageRehearsalState | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<SongSummary[]>([])
  const [allSongs, setAllSongs] = useState<SongSummary[]>([])
  const [live, setLive] = useState<LiveState | null>(null)

  useEffect(() => {
    window.wf.getStageRehearsal().then(setState)
    window.wf.songsList().then(setAllSongs)
    const off = window.wf.onState((s) => setLive(s.second))
    window.wf.getState('second').then(setLive)
    return off
  }, [])

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return }
    void window.wf.songsList(search).then(setSearchResults)
  }, [search])

  const titleFor = (songId: number): string => allSongs.find((s) => s.id === songId)?.title ?? `Song #${songId}`

  const refresh = async (): Promise<void> => {
    const next = await window.wf.getStageRehearsal()
    setState(next)
    onActiveChange(next.active)
  }

  const start = async (): Promise<void> => {
    setStarting(true)
    setStartError(null)
    try {
      await window.wf.setStageRehearsal(true)
      await refresh()
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Could not start rehearsal.')
    } finally {
      setStarting(false)
    }
  }

  const stop = async (): Promise<void> => {
    await window.wf.setStageRehearsal(false)
    await refresh()
  }

  const nextSong = async (): Promise<void> => { await window.wf.stageRehearsalNextSong(); await refresh() }
  const prevSong = async (): Promise<void> => { await window.wf.stageRehearsalPrevSong(); await refresh() }
  const goToSong = async (index: number): Promise<void> => { await window.wf.stageRehearsalGoToSong(index); await refresh() }

  const pickSong = async (id: number): Promise<void> => {
    await window.wf.liveLoadSong('second', id)
    window.wf.liveSetItemId('second', null)
  }

  if (!state) return <></>

  if (!state.active) {
    return (
      <aside className="flex w-96 shrink-0 flex-col gap-3 overflow-auto border-l border-slate-200 bg-[#f4f6f9] p-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
          <Mic2 size={14} /> Stage Rehearsal
        </div>
        <p className="text-xs text-slate-500">
          Steps through this service's songs, in order, on the Stage Monitor only — Zones 1-3 automatically loop
          through the service's announcements the whole time.
        </p>
        {startError && <p className="text-xs font-medium text-red-600">{startError}</p>}
        <button
          onClick={start}
          disabled={starting}
          className="btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Mic2 size={14} /> {starting ? 'Starting…' : 'Start Stage Rehearsal'}
        </button>
      </aside>
    )
  }

  const atStart = state.songIndex === 0
  const atEnd = state.songIndex >= state.songQueue.length - 1

  return (
    <aside className="flex w-96 shrink-0 flex-col gap-3 overflow-auto border-l border-slate-200 bg-[#f4f6f9] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-violet-700">
          <Mic2 size={14} /> Rehearsing
        </div>
        <button onClick={stop} className="btn bg-slate-800 text-white">
          <Square size={12} /> Stop
        </button>
      </div>

      <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">
        Stage Monitor shows the song below. Zones 1-3 are looping the service's announcements.
      </div>

      {live?.songTitle && (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-sm font-semibold text-slate-900">{live.songTitle}</p>
          <p className="text-[11px] text-slate-500">
            Song {state.songIndex + 1} of {state.songQueue.length}
            {live.total > 0 && ` · Slide ${live.index + 1} of ${live.total}`}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={prevSong}
          disabled={atStart}
          className="btn flex-1 justify-center disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft size={14} /> Prev song
        </button>
        <button
          onClick={nextSong}
          disabled={atEnd}
          className="btn-primary flex-1 justify-center disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next song <ChevronRight size={14} />
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => window.wf.sendIntent('second', 'prev')}
          disabled={!live?.songTitle}
          className="btn flex-1 justify-center text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          Back a slide
        </button>
        <button
          onClick={() => window.wf.sendIntent('second', 'next')}
          disabled={!live?.songTitle}
          className="btn flex-1 justify-center text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next slide
        </button>
      </div>

      <div className="border-t border-slate-200" />

      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Service order</p>
      <div className="flex flex-col gap-1">
        {state.songQueue.map((id, i) => (
          <button
            key={`${id}-${i}`}
            onClick={() => void goToSong(i)}
            className={[
              'rounded-lg px-3 py-2 text-left text-sm',
              i === state.songIndex ? 'bg-violet-600 text-white' : 'text-slate-700 hover:bg-slate-200',
            ].join(' ')}
          >
            {i + 1}. {titleFor(id)}
          </button>
        ))}
      </div>

      <div className="border-t border-slate-200" />

      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        Warm up on something else
      </p>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search any song…"
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-blue-500"
        />
      </div>
      {search.trim() && (
        <div className="flex flex-col gap-1">
          {searchResults.map((s) => (
            <button
              key={s.id}
              onClick={() => pickSong(s.id)}
              className="rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-200"
            >
              {s.title}
            </button>
          ))}
          {searchResults.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">No songs match.</p>}
        </div>
      )}
    </aside>
  )
}

export default StageRehearsalTools
