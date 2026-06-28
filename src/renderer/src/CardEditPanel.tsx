import { useEffect, useState } from 'react'
import type { ServiceItem, ItemStyle, SongFull, SongInput, ThemeColors } from '../../shared/types'
import ThemeChooser from './ThemeChooser'
import { parseSections, sectionsToText } from './songText'

function SlidePreview({ item, p, songFull }: {
  item: ServiceItem
  p: Record<string, unknown>
  songFull: SongFull | null
}): JSX.Element {
  const bgFromPayload = item.type === 'text' ? (p.bgColor as string | undefined) : undefined
  const bg = bgFromPayload ?? (item.style?.colors?.primary) ?? '#0d0d0d'
  const textCol = (item.style?.colors?.text) ?? '#ffffff'
  return (
    <div
      className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl p-5 text-center"
      style={{ background: bg }}
    >
      {item.type === 'text' && (
        <div className="w-full" style={{ textAlign: (p.textAlign as 'left' | 'center' | 'right') ?? 'center' }}>
          {(p.title as string) && (
            <div className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: textCol, opacity: 0.45 }}>
              {p.title as string}
            </div>
          )}
          <div className="font-bold leading-snug whitespace-pre-line" style={{ fontSize: `${Math.round(((p.fontScale as number) ?? 6) * 2.5)}px`, color: textCol }}>
            {(p.body as string) || <span style={{ opacity: 0.2 }}>Type your text below…</span>}
          </div>
        </div>
      )}
      {item.type === 'song' && (
        <div className="w-full">
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: textCol, opacity: 0.4 }}>
            {item.title}
          </div>
          <div className="font-bold leading-snug whitespace-pre-line" style={{ fontSize: '14px', color: textCol }}>
            {songFull?.sections?.[0]?.lyrics?.split('\n').slice(0, 3).join('\n') ?? (
              <span style={{ opacity: 0.25 }}>First section preview</span>
            )}
          </div>
        </div>
      )}
      {item.type === 'scripture' && (
        <div className="w-full">
          <div className="mb-2 text-sm" style={{ color: textCol, opacity: 0.55 }}>{(p.reference as string) || 'Reference'}</div>
          <div className="text-xs" style={{ color: textCol, opacity: 0.35 }}>Verse will display when loaded live</div>
        </div>
      )}
      {(item.type === 'countdown' || item.type === 'welcome') && (
        <div className="font-mono text-4xl font-bold" style={{ color: textCol }}>
          {String(Math.floor(((p.seconds as number) ?? 300) / 60)).padStart(2, '0')}:00
        </div>
      )}
      {item.type === 'image' && (
        <div className="text-sm" style={{ color: textCol, opacity: 0.4 }}>📸 Image slide</div>
      )}
      {item.type === 'ticker' && (
        <div className="text-lg font-semibold" style={{ color: textCol }}>
          {(p.text as string) || <span style={{ opacity: 0.25 }}>Announcement text…</span>}
        </div>
      )}
    </div>
  )
}

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

  const pickBg = async (): Promise<void> => {
    const result = await window.wf.dialogOpenFile()
    if (!result.canceled && result.filePaths[0]) {
      savePayload({ ...p, background: result.filePaths[0] })
    }
  }

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

  const setStyle = (style: ItemStyle | null): void => { window.wf.serviceSetItemStyle(item.id, style).then(onChanged) }
  const setOverride = (on: boolean): void => setStyle(on ? { theme: 'sanctuary' } : null)
  const pickTheme = (id: string): void => setStyle({ theme: id, colors: item.style?.colors })
  const setColor = (key: keyof ThemeColors, val: string): void =>
    setStyle({ theme: item.style?.theme ?? 'sanctuary', colors: { ...(item.style?.colors ?? {}), [key]: val } })
  const resetColors = (): void => setStyle({ theme: item.style?.theme ?? 'sanctuary' })

  return (
    <div className="flex w-80 shrink-0 flex-col gap-3 overflow-auto rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold capitalize text-gray-900">{item.type}</h3>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">✕ Close</button>
      </div>

      {/* Live slide preview */}
      <SlidePreview item={item} p={p} songFull={songFull} />

      {item.type === 'scripture' && (
        <input value={(p.reference as string) ?? ''} placeholder="John 3:16"
          onChange={(e) => savePayload({ ...p, reference: e.target.value })}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500" />
      )}
      {item.type === 'text' && (
        <>
          <input value={(p.title as string) ?? ''} placeholder="Title (optional)"
            onChange={(e) => savePayload({ ...p, title: e.target.value })}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500" />
          <textarea value={(p.body as string) ?? ''} placeholder="Body text — what you want on screen" rows={4}
            onChange={(e) => savePayload({ ...p, body: e.target.value })}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500" />

          {/* ── Background ── */}
          <div className="space-y-3 border-t border-gray-100 pt-3">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Background</label>

            {/* File info row */}
            {(p.background as string) ? (
              <div className="flex items-center gap-2 rounded-lg border border-violet-100 bg-violet-50 px-3 py-2">
                <span className="text-sm">{/\.(mp4|webm|mov|m4v)$/i.test(p.background as string) ? '🎬' : '🖼'}</span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-violet-700">
                  {(p.background as string).split(/[/\\]/).pop()}
                </span>
                <button onClick={() => savePayload({ ...p, background: null })}
                  className="shrink-0 text-gray-400 hover:text-red-500 text-xs">✕</button>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="h-9 w-14 shrink-0 rounded-md border border-gray-200"
                  style={{ background: (p.bgColor as string) || '#0c1a3a' }} />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 text-[11px] text-gray-500">Solid background color</div>
                  <input type="color" value={(p.bgColor as string) || '#0c1a3a'}
                    onChange={(e) => savePayload({ ...p, bgColor: e.target.value })}
                    className="h-7 w-full cursor-pointer rounded border border-gray-200 p-0.5" />
                </div>
              </div>
            )}

            <button onClick={pickBg}
              className="w-full rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100">
              {(p.background as string) ? '🎬 Change file…' : '🎬 Pick video or image file…'}
            </button>

            {/* Overlay darkness — only meaningful with a bg file */}
            {(p.background as string) && (
              <div>
                <div className="mb-1.5 flex items-center justify-between text-[11px] text-gray-500">
                  <span>Readability overlay</span>
                  <span className="font-mono text-gray-700">{Math.round(((p.bgOverlay as number) ?? 0.9) * 100)}%</span>
                </div>
                <input type="range" min={0} max={100}
                  value={Math.round(((p.bgOverlay as number) ?? 0.9) * 100)}
                  onChange={(e) => savePayload({ ...p, bgOverlay: Number(e.target.value) / 100 })}
                  className="w-full accent-violet-600" />
                <div className="mt-0.5 flex justify-between text-[10px] text-gray-400">
                  <span>Show more background</span><span>Darker (more readable)</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Text Style ── */}
          <div className="space-y-3 border-t border-gray-100 pt-3">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Text Style</label>

            {/* Font size */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-gray-500">
                <span>Font size</span>
                <span className="font-mono text-gray-700">{(p.fontScale as number) ?? 6} vw</span>
              </div>
              <input type="range" min={3} max={14} step={0.5}
                value={(p.fontScale as number) ?? 6}
                onChange={(e) => savePayload({ ...p, fontScale: Number(e.target.value) })}
                className="w-full accent-blue-600" />
              <div className="mt-0.5 flex justify-between text-[10px] text-gray-400">
                <span>Small</span><span>Large</span>
              </div>
            </div>

            {/* Text alignment */}
            <div>
              <div className="mb-1.5 text-[11px] text-gray-500">Text alignment</div>
              <div className="flex gap-1">
                {(['left', 'center', 'right'] as const).map((a) => (
                  <button key={a} onClick={() => savePayload({ ...p, textAlign: a })}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-colors ${
                      ((p.textAlign as string) ?? 'center') === a
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
                    }`}>
                    {a === 'left' ? '⬛ Left' : a === 'center' ? '▪ Center' : 'Right ⬛'}
                  </button>
                ))}
              </div>
            </div>

            {/* Text position */}
            <div>
              <div className="mb-1.5 text-[11px] text-gray-500">Text position</div>
              <div className="flex gap-1">
                {(['top', 'center', 'bottom'] as const).map((pos) => (
                  <button key={pos} onClick={() => savePayload({ ...p, textPosition: pos })}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold capitalize transition-colors ${
                      ((p.textPosition as string) ?? 'center') === pos
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
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
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500" />
      )}
      {(item.type === 'countdown' || item.type === 'welcome') && (
        <label className="text-xs font-semibold text-gray-500">
          Minutes
          <input type="number" value={Math.round(((p.seconds as number) ?? 300) / 60)}
            onChange={(e) => savePayload({ ...p, seconds: Math.max(1, Number(e.target.value)) * 60 })}
            className="ml-2 w-20 rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900" />
        </label>
      )}
      {item.type === 'song' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700">{songFull?.title ?? item.title}</span>
            {songSaved && <span className="text-[10px] font-bold text-emerald-600">✓ Saved</span>}
          </div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Lyrics</label>
          <textarea value={lyrics} onChange={(e) => setLyrics(e.target.value)} rows={10}
            placeholder="Verse 1&#10;Amazing grace…&#10;&#10;Chorus&#10;…"
            className="resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-gray-900 outline-none focus:border-blue-500" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-400">Blank line = new slide section</span>
            <button onClick={saveSong} disabled={!songFull}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40">
              Save lyrics
            </button>
          </div>

          {/* Song background */}
          <div className="space-y-2 border-t border-gray-100 pt-3">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Motion Background</label>
            {songFull?.background ? (
              <div className="flex items-center gap-2 rounded-lg border border-violet-100 bg-violet-50 px-3 py-2">
                <span className="text-sm">{/\.(mp4|webm|mov|m4v)$/i.test(songFull.background) ? '🎬' : '🖼'}</span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-violet-700">
                  {songFull.background.split(/[/\\]/).pop()}
                </span>
                <button onClick={removeSongBg} className="shrink-0 text-xs text-gray-400 hover:text-red-500">✕ Remove</button>
              </div>
            ) : (
              <p className="text-xs text-gray-400">No background set — lyrics show over animated gradient</p>
            )}
            <button onClick={pickSongBg}
              className="w-full rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100">
              {songFull?.background ? '🎬 Change background…' : '🎬 Add motion background…'}
            </button>
          </div>
        </div>
      )}
      {item.type === 'image' && (
        <p className="break-all text-xs text-gray-400">Image: {(p.path as string) ?? '—'}</p>
      )}

      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} rows={2}
          placeholder="Notes for operator / pastor…"
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 outline-none focus:border-blue-500" />
      </div>

      <div className="border-t border-gray-100 pt-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
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
        className="mt-auto rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100">
        🗑 Delete item
      </button>
    </div>
  )
}

export default CardEditPanel
