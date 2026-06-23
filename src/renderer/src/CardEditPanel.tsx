import { useEffect, useState } from 'react'
import type { ServiceItem, ItemStyle, SongFull, SongInput, ThemeColors } from '../../shared/types'
import ThemeChooser from './ThemeChooser'
import { parseSections, sectionsToText } from './songText'

// Edit one card's content (by type) + its per-item design.
function CardEditPanel({ item, onClose, onChanged, onDelete }: {
  item: ServiceItem
  onClose: () => void
  onChanged: () => void
  onDelete: (item: ServiceItem) => void
}): JSX.Element {
  const [p, setP] = useState<Record<string, unknown>>(item.payload ?? {})
  const [notes, setNotes] = useState(item.notes ?? '')
  const [songFull, setSongFull] = useState<SongFull | null>(null)
  const [lyrics, setLyrics] = useState('')
  const [songSaved, setSongSaved] = useState(false)
  const override = item.style?.theme != null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setP(item.payload ?? {}); setNotes(item.notes ?? ''); setSongSaved(false)
    if (item.type === 'song' && item.ref_id != null) {
      window.wf.songGet(item.ref_id).then((s) => { setSongFull(s); setLyrics(s ? sectionsToText(s) : '') })
    } else {
      setSongFull(null); setLyrics('')
    }
  }, [item.id])

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

  const setStyle = (style: ItemStyle | null): void => { window.wf.serviceSetItemStyle(item.id, style).then(onChanged) }
  const setOverride = (on: boolean): void => setStyle(on ? { theme: 'sanctuary' } : null)
  const pickTheme = (id: string): void => setStyle({ theme: id, colors: item.style?.colors })
  const setColor = (key: keyof ThemeColors, val: string): void =>
    setStyle({ theme: item.style?.theme ?? 'sanctuary', colors: { ...(item.style?.colors ?? {}), [key]: val } })
  const resetColors = (): void => setStyle({ theme: item.style?.theme ?? 'sanctuary' })

  return (
    <div className="flex w-80 shrink-0 flex-col gap-3 overflow-auto rounded-xl border border-white/[0.07] bg-[#15151a] p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold capitalize">{item.type}</h3>
        <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300">✕ Close</button>
      </div>

      {item.type === 'scripture' && (
        <input value={(p.reference as string) ?? ''} placeholder="John 3:16"
          onChange={(e) => savePayload({ ...p, reference: e.target.value })}
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-blue-500" />
      )}
      {item.type === 'text' && (
        <>
          <input value={(p.title as string) ?? ''} placeholder="Title"
            onChange={(e) => savePayload({ ...p, title: e.target.value })}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-blue-500" />
          <textarea value={(p.body as string) ?? ''} placeholder="Body" rows={4}
            onChange={(e) => savePayload({ ...p, body: e.target.value })}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-blue-500" />
        </>
      )}
      {item.type === 'ticker' && (
        <input value={(p.text as string) ?? ''} placeholder="Announcement text"
          onChange={(e) => savePayload({ ...p, text: e.target.value })}
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-blue-500" />
      )}
      {(item.type === 'countdown' || item.type === 'welcome') && (
        <label className="text-xs text-slate-400">Minutes
          <input type="number" value={Math.round(((p.seconds as number) ?? 300) / 60)}
            onChange={(e) => savePayload({ ...p, seconds: Math.max(1, Number(e.target.value)) * 60 })}
            className="ml-2 w-20 rounded border border-white/10 bg-black/30 px-2 py-1 text-sm" /></label>
      )}
      {item.type === 'song' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">{songFull?.title ?? item.title}</span>
            {songSaved && <span className="text-[10px] font-bold text-emerald-400 animate-[fade-in_0.2s_ease-out]">✓ Saved</span>}
          </div>
          <label className="text-[11px] uppercase tracking-wider text-slate-500">Lyrics</label>
          <textarea value={lyrics} onChange={(e) => setLyrics(e.target.value)} rows={10}
            placeholder="Verse 1&#10;Amazing grace…&#10;&#10;Chorus&#10;…"
            className="resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-blue-500" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-600">Blank line = new slide section</span>
            <button onClick={saveSong} disabled={!songFull}
              className="rounded-lg border border-emerald-500/30 bg-emerald-600/20 px-3 py-1 text-xs font-semibold text-emerald-200 hover:bg-emerald-600/30 disabled:opacity-40">
              Save lyrics
            </button>
          </div>
        </div>
      )}
      {item.type === 'image' && (
        <p className="text-xs text-slate-500 break-all">Image: {(p.path as string) ?? '—'}</p>
      )}

      <div>
        <label className="text-[11px] uppercase tracking-wider text-slate-500">Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} rows={2}
          placeholder="Notes for operator / pastor…"
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs outline-none focus:border-blue-500" />
      </div>

      <div className="border-t border-white/10 pt-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <input type="checkbox" checked={!override} onChange={(e) => setOverride(!e.target.checked)} className="h-4 w-4" />
          Use service theme
        </label>
        {override && (
          <div className="mt-2">
            <ThemeChooser themeId={item.style?.theme ?? 'sanctuary'} colors={item.style?.colors ?? null}
              onPickTheme={pickTheme} onSetColor={setColor} onReset={resetColors} />
          </div>
        )}
      </div>

      <button onClick={() => onDelete(item)}
        className="mt-auto rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20">
        🗑 Delete item
      </button>
    </div>
  )
}

export default CardEditPanel
