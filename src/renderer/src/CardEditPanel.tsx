import { useEffect, useState } from 'react'
import type { ServiceItem, SongFull, SongInput, ThemeColors } from '../../shared/types'
import ServiceSlidePreview from './ServiceSlidePreview'
import ItemBackgroundPanel from './ItemBackgroundPanel'
import { parseSections, sectionsToText } from './songText'

function CardEditPanel({ item, serviceTheme, serviceColors, showPreview = true, onClose, onChanged, onDelete }: {
  item: ServiceItem
  serviceTheme: string | null
  serviceColors: ThemeColors | null
  showPreview?: boolean
  onClose: () => void
  onChanged: () => void
  onDelete: (item: ServiceItem) => void
}): JSX.Element {
  const [p, setP] = useState<Record<string, unknown>>(item.payload ?? {})
  const [notes, setNotes] = useState(item.notes ?? '')
  const [songFull, setSongFull] = useState<SongFull | null>(null)
  const [lyrics, setLyrics] = useState('')
  const [songSaved, setSongSaved] = useState(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setP(item.payload ?? {}); setNotes(item.notes ?? ''); setSongSaved(false)
    if (item.type === 'song' && item.ref_id != null) {
      window.wf.songGet(item.ref_id).then((s) => { setSongFull(s); setLyrics(s ? sectionsToText(s) : '') })
    } else {
      setSongFull(null); setLyrics('')
    }
  }, [item.id])

  const pickSongBg = async (): Promise<void> => {
    if (!songFull) return
    const result = await window.wf.dialogOpenFile()
    if (!result.canceled && result.filePaths[0]) {
      await window.wf.songSetBackground(songFull.id, result.filePaths[0])
      window.wf.songGet(songFull.id).then(setSongFull)
      onChanged()
    }
  }

  const removeSongBg = async (): Promise<void> => {
    if (!songFull) return
    await window.wf.songSetBackground(songFull.id, null)
    window.wf.songGet(songFull.id).then(setSongFull)
    onChanged()
  }

  const saveSong = (): void => {
    if (!songFull) return
    const sections = parseSections(lyrics)
    const validArr = (songFull.arrangement ?? []).filter((i) => i < sections.length)
    const input: SongInput = {
      title: songFull.title,
      author: songFull.author ?? undefined,
      ccli: songFull.ccli ?? undefined,
      copyright: songFull.copyright ?? undefined,
      publisher: songFull.publisher ?? undefined,
      background: songFull.background,
      sections,
      arrangement: validArr.length ? validArr : null,
      fontScale: songFull.fontScale,
      linesPerSlide: songFull.linesPerSlide
    }
    window.wf.songUpdate(songFull.id, input).then(() => {
      setSongSaved(true)
      setTimeout(() => setSongSaved(false), 2500)
      onChanged()
    })
  }

  const savePayload = (next: Record<string, unknown>): void => {
    setP(next)
    window.wf.serviceSetItemPayload(item.id, next).then(onChanged)
  }
  const saveNotes = (): void => { window.wf.serviceUpdateItemNotes(item.id, notes.trim() || null).then(onChanged) }

  const inputCls = 'rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-400 outline-none focus:border-blue-500'

  return (
    <div className="flex w-80 shrink-0 flex-col gap-3 overflow-auto rounded-xl border border-white/[0.07] bg-[#161618] p-3 text-white">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold capitalize text-white">{item.type}</h3>
        <button onClick={onClose} className="text-xs text-slate-400 hover:text-white">✕ Close</button>
      </div>

      {/* Live slide preview */}
      {showPreview !== false && (
        <ServiceSlidePreview item={item} serviceTheme={serviceTheme} serviceColors={serviceColors} songFull={songFull} />
      )}

      {item.type === 'scripture' && (
        <input value={(p.reference as string) ?? ''} placeholder="John 3:16"
          onChange={(e) => savePayload({ ...p, reference: e.target.value })}
          className={inputCls} />
      )}
      {item.type === 'text' && (
        <>
          <input value={(p.title as string) ?? ''} placeholder="Title (optional)"
            onChange={(e) => savePayload({ ...p, title: e.target.value })}
            className={inputCls} />
          <textarea value={(p.body as string) ?? ''} placeholder="Body text — what you want on screen" rows={4}
            onChange={(e) => savePayload({ ...p, body: e.target.value })}
            className={inputCls} />

          {/* ── Text Style ── */}
          <div className="space-y-3 border-t border-white/[0.07] pt-3">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Text Style</label>

            {/* Font size */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
                <span>Font size</span>
                <span className="font-mono text-slate-200">{(p.fontScale as number) ?? 6} vw</span>
              </div>
              <input type="range" min={3} max={14} step={0.5}
                value={(p.fontScale as number) ?? 6}
                onChange={(e) => savePayload({ ...p, fontScale: Number(e.target.value) })}
                className="w-full accent-blue-600" />
              <div className="mt-0.5 flex justify-between text-[10px] text-slate-500">
                <span>Small</span><span>Large</span>
              </div>
            </div>

            {/* Text alignment */}
            <div>
              <div className="mb-1.5 text-[11px] text-slate-400">Text alignment</div>
              <div className="flex gap-1">
                {(['left', 'center', 'right'] as const).map((a) => (
                  <button key={a} onClick={() => savePayload({ ...p, textAlign: a })}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-colors ${
                      ((p.textAlign as string) ?? 'center') === a
                        ? 'border-blue-500/50 bg-blue-500/15 text-blue-300'
                        : 'border-white/10 bg-black/30 text-slate-400 hover:bg-white/5'
                    }`}>
                    {a === 'left' ? '⬛ Left' : a === 'center' ? '▪ Center' : 'Right ⬛'}
                  </button>
                ))}
              </div>
            </div>

            {/* Text position */}
            <div>
              <div className="mb-1.5 text-[11px] text-slate-400">Text position</div>
              <div className="flex gap-1">
                {(['top', 'center', 'bottom'] as const).map((pos) => (
                  <button key={pos} onClick={() => savePayload({ ...p, textPosition: pos })}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold capitalize transition-colors ${
                      ((p.textPosition as string) ?? 'center') === pos
                        ? 'border-blue-500/50 bg-blue-500/15 text-blue-300'
                        : 'border-white/10 bg-black/30 text-slate-400 hover:bg-white/5'
                    }`}>
                    {pos === 'top' ? '▲ Top' : pos === 'center' ? '▪ Center' : '▼ Bottom'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
      {item.type === 'ticker' && (
        <input value={(p.text as string) ?? ''} placeholder="Announcement text"
          onChange={(e) => savePayload({ ...p, text: e.target.value })}
          className={inputCls} />
      )}
      {(item.type === 'countdown' || item.type === 'welcome') && (
        <label className="text-xs font-semibold text-slate-400">
          Minutes
          <input type="number" value={Math.round(((p.seconds as number) ?? 300) / 60)}
            onChange={(e) => savePayload({ ...p, seconds: Math.max(1, Number(e.target.value)) * 60 })}
            className="ml-2 w-20 rounded border border-white/10 bg-black/30 px-2 py-1 text-sm text-white outline-none focus:border-blue-500" />
        </label>
      )}
      {item.type === 'song' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200">{songFull?.title ?? item.title}</span>
            {songSaved && <span className="text-[10px] font-bold text-emerald-400">✓ Saved</span>}
          </div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Lyrics</label>
          <textarea value={lyrics} onChange={(e) => setLyrics(e.target.value)} rows={10}
            placeholder="Verse 1&#10;Amazing grace…&#10;&#10;Chorus&#10;…"
            className="resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs leading-relaxed text-white placeholder:text-slate-400 outline-none focus:border-blue-500" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500">Blank line = new slide section</span>
            <button onClick={saveSong} disabled={!songFull}
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40">
              Save lyrics
            </button>
          </div>

          {/* Song background */}
          <div className="space-y-2 border-t border-white/[0.07] pt-3">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Motion Background</label>
            {songFull?.background ? (
              <div className="flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2">
                <span className="text-sm">{/\.(mp4|webm|mov|m4v)$/i.test(songFull.background) ? '🎬' : '🖼'}</span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-violet-300">
                  {songFull.background.split(/[/\\]/).pop()}
                </span>
                <button onClick={removeSongBg} className="shrink-0 text-xs text-slate-400 hover:text-red-400">✕ Remove</button>
              </div>
            ) : (
              <p className="text-xs text-slate-500">No background set — lyrics show over animated gradient</p>
            )}
            <button onClick={pickSongBg}
              className="w-full rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-300 hover:bg-violet-500/20">
              {songFull?.background ? '🎬 Change background…' : '🎬 Add motion background…'}
            </button>
          </div>
        </div>
      )}
      {item.type === 'image' && (
        <p className="break-all text-xs text-slate-400">Image: {(p.path as string) ?? '—'}</p>
      )}

      {/* ── Background & Color (panel renders its own header) ── */}
      <div className="border-t border-white/[0.07] pt-3">
        <ItemBackgroundPanel item={item} onChanged={onChanged} />
      </div>

      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} rows={2}
          placeholder="Notes for operator / pastor…"
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white placeholder:text-slate-400 outline-none focus:border-blue-500" />
      </div>

      <button onClick={() => onDelete(item)}
        className="mt-auto rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20">
        🗑 Delete item
      </button>
    </div>
  )
}

export default CardEditPanel
