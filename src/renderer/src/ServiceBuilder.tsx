import { useEffect, useState } from 'react'
import type { ServiceFull, ServiceItem, ServiceSummary, SongSummary } from '../../shared/types'

const ICON: Record<ServiceItem['type'], string> = {
  song: '🎵',
  scripture: '📖',
  text: '📝',
  countdown: '⏱'
}

function ServiceBuilder(): JSX.Element {
  const [services, setServices] = useState<ServiceSummary[]>([])
  const [openId, setOpenId] = useState<number | null>(null)
  const [service, setService] = useState<ServiceFull | null>(null)
  const [songs, setSongs] = useState<SongSummary[]>([])
  const [liveSongId, setLiveSongId] = useState<number | null>(null)

  const [newName, setNewName] = useState('')
  const [songPick, setSongPick] = useState('')
  const [textTitle, setTextTitle] = useState('')
  const [textBody, setTextBody] = useState('')
  const [mins, setMins] = useState('5')
  const [ref, setRef] = useState('')

  const refreshServices = (): void => {
    window.wf.servicesList().then(setServices)
  }
  const reload = (): void => {
    if (openId != null) window.wf.serviceGet(openId).then(setService)
  }
  const open = (id: number): void => {
    setOpenId(id)
    window.wf.serviceGet(id).then(setService)
  }

  useEffect(() => {
    refreshServices()
    window.wf.songsList().then(setSongs)
  }, [])
  // Keep the song picker fresh whenever a service is open.
  useEffect(() => {
    if (openId != null) window.wf.songsList().then(setSongs)
  }, [openId])

  const create = async (): Promise<void> => {
    if (!newName.trim()) return
    const id = await window.wf.serviceCreate(newName.trim())
    setNewName('')
    refreshServices()
    open(id)
  }
  const del = async (id: number): Promise<void> => {
    await window.wf.serviceDelete(id)
    if (openId === id) {
      setOpenId(null)
      setService(null)
    }
    refreshServices()
  }

  const addSong = async (): Promise<void> => {
    if (!songPick || openId == null) return
    await window.wf.serviceAddItem(openId, { type: 'song', ref_id: Number(songPick) })
    setSongPick('')
    reload()
  }
  const addText = async (): Promise<void> => {
    if (!textTitle.trim() || openId == null) return
    await window.wf.serviceAddItem(openId, { type: 'text', payload: { title: textTitle, body: textBody } })
    setTextTitle('')
    setTextBody('')
    reload()
  }
  const addCountdown = async (): Promise<void> => {
    if (openId == null) return
    const seconds = Math.max(0, Math.round(parseFloat(mins || '0') * 60))
    await window.wf.serviceAddItem(openId, { type: 'countdown', payload: { seconds } })
    reload()
  }
  const addScripture = async (): Promise<void> => {
    if (!ref.trim() || openId == null) return
    await window.wf.serviceAddItem(openId, { type: 'scripture', payload: { reference: ref.trim() } })
    setRef('')
    reload()
  }

  const goLive = async (songId: number): Promise<void> => {
    await window.wf.liveLoadSong(songId)
    setLiveSongId(songId)
  }

  const move = async (id: number, dir: 'up' | 'down'): Promise<void> => {
    await window.wf.serviceMoveItem(id, dir)
    reload()
  }
  const removeItem = async (id: number): Promise<void> => {
    await window.wf.serviceRemoveItem(id)
    reload()
  }

  return (
    <div className="flex h-full min-h-0 gap-4 p-4">
      {/* Services list */}
      <div className="flex w-72 flex-col rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div className="mb-3 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder="New service name…"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <button
            onClick={create}
            disabled={!newName.trim()}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-40"
          >
            +
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-auto">
          {services.length === 0 && (
            <p className="px-1 py-6 text-center text-sm text-slate-500">No saved services yet.</p>
          )}
          {services.map((s) => (
            <div
              key={s.id}
              onClick={() => open(s.id)}
              className={`group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 ${
                openId === s.id ? 'bg-blue-500/15 ring-1 ring-blue-500/40' : 'hover:bg-white/[0.05]'
              }`}
            >
              <span className="truncate text-sm font-medium">{s.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  del(s.id)
                }}
                className="rounded px-2 py-0.5 text-xs text-slate-500 opacity-0 hover:bg-red-500/20 hover:text-red-300 group-hover:opacity-100"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Open service */}
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-white/10 bg-white/[0.03] p-4">
        {!service ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            Select a service, or create one to start building your order of worship.
          </div>
        ) : (
          <>
            <h2 className="mb-3 text-lg font-semibold">{service.name}</h2>

            <div className="mb-4 min-h-0 flex-1 space-y-1 overflow-auto">
              {service.items.length === 0 && (
                <p className="px-1 py-6 text-center text-sm text-slate-500">
                  Empty service — add items below.
                </p>
              )}
              {service.items.map((it, i) => (
                <div
                  key={it.id}
                  className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
                >
                  <span className="w-6 text-right font-mono text-xs text-slate-500">{i + 1}</span>
                  <span className="text-lg">{ICON[it.type]}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{it.title}</span>
                  <div className="flex items-center gap-1 text-slate-400">
                    {it.type === 'song' && it.ref_id != null && (
                      <button
                        onClick={() => goLive(it.ref_id!)}
                        className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors ${
                          liveSongId === it.ref_id
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'hover:bg-emerald-500/20 hover:text-emerald-300'
                        }`}
                        title="Send to live outputs"
                      >
                        {liveSongId === it.ref_id ? 'LIVE' : '▶'}
                      </button>
                    )}
                    <button onClick={() => move(it.id, 'up')} className="rounded px-1.5 hover:bg-white/10">
                      ↑
                    </button>
                    <button onClick={() => move(it.id, 'down')} className="rounded px-1.5 hover:bg-white/10">
                      ↓
                    </button>
                    <button
                      onClick={() => removeItem(it.id)}
                      className="rounded px-1.5 hover:bg-red-500/20 hover:text-red-300"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add items */}
            <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-3">
              <div className="flex gap-2">
                <select
                  value={songPick}
                  onChange={(e) => setSongPick(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm outline-none focus:border-blue-500"
                >
                  <option value="">Add a song…</option>
                  {songs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
                <AddBtn onClick={addSong} disabled={!songPick} />
              </div>

              <div className="flex gap-2">
                <input
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="Scripture (e.g. John 3:16)"
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm outline-none focus:border-blue-500"
                />
                <AddBtn onClick={addScripture} disabled={!ref.trim()} />
              </div>

              <div className="flex gap-2">
                <input
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  placeholder="Text / announcement title"
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm outline-none focus:border-blue-500"
                />
                <AddBtn onClick={addText} disabled={!textTitle.trim()} />
              </div>

              <div className="flex gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2">
                  <span className="text-sm text-slate-400">Countdown</span>
                  <input
                    value={mins}
                    onChange={(e) => setMins(e.target.value)}
                    className="w-12 bg-transparent py-2 text-sm outline-none"
                  />
                  <span className="text-sm text-slate-400">min</span>
                </div>
                <AddBtn onClick={addCountdown} disabled={false} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function AddBtn({ onClick, disabled }: { onClick: () => void; disabled: boolean }): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-semibold hover:bg-white/[0.12] disabled:opacity-40"
    >
      Add
    </button>
  )
}

export default ServiceBuilder
