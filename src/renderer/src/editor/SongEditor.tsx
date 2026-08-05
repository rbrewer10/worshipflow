// src/renderer/src/editor/SongEditor.tsx
// Top-level editor: continuous-lyrics ReflowEditor + BackgroundPanel
// Replaces the right-side form panel in SongLibrary.

import { useState, useEffect, useCallback, useRef } from 'react'
import { Pencil, ExternalLink, ArrowLeft } from 'lucide-react'
import type { SongFull, SongInput } from '../../../shared/types'
import { parseReflowText, sectionsToReflowText, computeReflowSlides } from '../../../shared/reflowText'
import ReflowEditor from '../ReflowEditor'
import BackgroundPanel from './BackgroundPanel'
import { useAutosave } from '../useAutosave'
import { combineSaveStatus } from '../saveQueue'
import SaveStatusBadge from '../SaveStatusBadge'
import { notifyLocal } from '../NotifyToasts'

export default function SongEditor({ songId, onSaved }: {
  songId: number
  onSaved?: () => void
}): JSX.Element {
  const [song, setSong] = useState<SongFull | null>(null)
  const [lyricsText, setLyricsText] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)
  // Holds the not-yet-fired debounced save, if any, so it can be flushed
  // immediately on unmount (switching songs, navigating away, closing the
  // pop-out window) instead of silently discarded — see the flush effect
  // near the bottom of this component for why this matters.
  const pendingLyricsSaveRef = useRef<(() => void) | null>(null)

  // Guards the debounced-save effect below against firing on the lyricsText
  // change caused by loading a song, rather than an actual edit — set true
  // whenever load() replaces lyricsText, set false only inside
  // handleLyricsChange (the sole path for a real operator edit), so the
  // effect can tell "this change is a load" from "this change is a
  // keystroke" regardless of whether the loaded text happens to differ from
  // whatever was there before (a plain lyricsText-changed check alone can't
  // tell these apart, e.g. for a song whose lyrics happen to be empty).
  const justLoadedRef = useRef(true)

  const load = useCallback(async () => {
    const s = await window.wf.songGet(songId)
    setSong(s)
    justLoadedRef.current = true
    setLyricsText(s ? sectionsToReflowText(s.sections) : '')
  }, [songId])

  useEffect(() => { load() }, [load])

  // One queue for the main record (title/lyrics/sections/arrangement — the
  // fields edited continuously while typing/reordering slides) plus one per
  // one-off setter, each hitting its own targeted IPC call so a background
  // pick can't accidentally clobber a concurrent lyric edit or vice versa.
  // Previously each of these was `if (saving) return; ...; await ...` with no
  // catch: a save that arrived while another was in flight was silently
  // DROPPED (not queued), and a rejected save left `saving` stuck true
  // forever with the editor showing "Saving…" indefinitely — exactly the
  // audit's complaint.
  const songQueue = useAutosave<SongInput>((input) => window.wf.songUpdate(songId, input).then(() => onSaved?.()))
  const bgQueue = useAutosave<string | null>((path) => window.wf.songSetBackground(songId, path))
  const bgMotionQueue = useAutosave<SongFull['bgMotion']>((motion) => window.wf.songSetBgMotion(songId, motion))
  const blurQueue = useAutosave<boolean>((value) => window.wf.songSetBlurBehindText(songId, value))
  const fontScaleQueue = useAutosave<number>((scale) => window.wf.songSetFontScale(songId, scale))
  const textColorQueue = useAutosave<string>((color) => window.wf.songSetTextColor(songId, color))
  const fontQueue = useAutosave<SongFull['font']>((font) => window.wf.songSetFont(songId, font))

  const saveStatus = combineSaveStatus([
    songQueue.status, bgQueue.status, bgMotionQueue.status,
    blurQueue.status, fontScaleQueue.status, textColorQueue.status, fontQueue.status
  ])
  const saveError = songQueue.error ?? bgQueue.error ?? bgMotionQueue.error ?? blurQueue.error
    ?? fontScaleQueue.error ?? textColorQueue.error ?? fontQueue.error ?? null
  const retrySave = (): void => {
    songQueue.retry(); bgQueue.retry(); bgMotionQueue.retry()
    blurQueue.retry(); fontScaleQueue.retry(); textColorQueue.retry(); fontQueue.retry()
  }

  // Continuous editing can add/remove sections as a byproduct of ordinary
  // typing (delete a verse's text and label, add a "Bridge"), which can leave
  // `arrangement` — a list of indices into the sections array — pointing
  // past the end or at a since-shifted section. Filtering here (mirroring
  // CardEditPanel.tsx's buildSongInput, which guards the exact same
  // staleness for the Card editor) keeps a stale index from silently
  // dropping or misrouting a slide on save. Shared by both the normal
  // (queued) save path and the direct unmount-flush path below.
  const buildSongInput = (updated: SongFull): SongInput => {
    const validArrangement = updated.arrangement && updated.arrangement.length > 0
      ? updated.arrangement.filter((i) => i < updated.sections.length)
      : null
    return {
      title: updated.title,
      author: updated.author ?? undefined,
      ccli: updated.ccli ?? undefined,
      copyright: updated.copyright ?? undefined,
      publisher: updated.publisher ?? undefined,
      background: updated.background ?? null,
      sections: updated.sections,
      arrangement: validArrangement && validArrangement.length > 0 ? validArrangement : null,
      fontScale: updated.fontScale,
      linesPerSlide: updated.linesPerSlide,
      bgMotion: updated.bgMotion,
      textColor: updated.textColor,
      font: updated.font,
      blurBehindText: updated.blurBehindText
    }
  }

  const saveSong = async (updated: SongFull): Promise<void> => {
    songQueue.trigger(buildSongInput(updated))
  }

  // Debounced autosave for lyrics: useAutosave's queue only coalesces triggers
  // that arrive while a save is already in flight, so without this, typing at
  // normal speed would fire close to one full save per keystroke. Other
  // fields (background, font, color, title) stay on their own immediate
  // triggers below — those are discrete, infrequent actions, not continuous
  // typing. Must sit before the `if (!song) return` below it, since hooks
  // can't be called conditionally — the null check happens inside the effect
  // body instead.
  useEffect(() => {
    if (justLoadedRef.current) { justLoadedRef.current = false; return }
    if (!song) return
    const currentSong = song
    // The unmount flush (below) calls window.wf.songUpdate directly instead
    // of going through saveSong/songQueue.trigger. useAutosave's own
    // unregister-on-unmount effect (useAutosave.ts) runs as part of this same
    // component's unmount, in the same hook-declaration order as everything
    // else — if the flush went through the queue, it could re-register this
    // save's status with saveRegistry just after (or before) that cleanup
    // fires, permanently corrupting the "any save failed?" bookkeeping
    // AppShell's navigation guard depends on. There's no future save left to
    // serialize against once this component is gone, so bypassing the queue
    // here is safe. notifyLocal is a plain module-level toast function (not
    // scoped to this component), so a failure here can still surface a
    // toast even after unmount, without touching saveRegistry at all.
    pendingLyricsSaveRef.current = () => {
      window.wf.songUpdate(songId, buildSongInput(currentSong))
        .then(() => onSaved?.())
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err)
          notifyLocal(`Save failed: ${message}`, 'error')
        })
    }
    const t = setTimeout(() => {
      pendingLyricsSaveRef.current = null
      void saveSong(currentSong)
    }, 600)
    return () => clearTimeout(t)
  }, [lyricsText])

  // Flushes a still-pending debounced lyrics save when this editor unmounts.
  // Without this, the last keystroke or two before switching songs or
  // navigating away would be silently lost: the debounce timer above is
  // cancelled on unmount along with everything else, and — because
  // songQueue's status only becomes 'saving' once the timer actually
  // fires — AppShell's existing "unsaved changes" navigation guard has no
  // way to know an edit is still waiting to be saved during that window.
  // Deliberately a separate effect with an empty dependency array (not
  // folded into the debounce effect above), so its cleanup only runs on a
  // true unmount, never on an ordinary lyricsText change while still typing.
  useEffect(() => {
    return () => { pendingLyricsSaveRef.current?.() }
  }, [])

  if (!song) {
    return <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Loading…</div>
  }

  const slides = computeReflowSlides(parseReflowText(lyricsText), song.arrangement ?? null)

  // The textarea's own state (lyricsText) is set directly, unconditionally —
  // never re-derived from song.sections — so the operator's literal keystrokes
  // are never fought with a reformatted value. song.sections is kept as a
  // derived cache purely so the rest of this component (BackgroundPanel,
  // title, the autosave payload) still has a valid SongFull to work with;
  // parsing only happens here, not on every render. The actual save is
  // debounced (see the effect below) rather than triggered here directly —
  // saving on every keystroke would mean a full song-record write, and a
  // full-database persist(), on every character typed.
  const handleLyricsChange = (text: string): void => {
    justLoadedRef.current = false
    setLyricsText(text)
    const updatedSections = parseReflowText(text)
    setSong({ ...song, sections: updatedSections })
  }

  // --- Inline title rename ---
  const startTitleEdit = (): void => {
    setTitleDraft(song.title)
    setEditingTitle(true)
    setTimeout(() => { titleRef.current?.focus(); titleRef.current?.select() }, 0)
  }

  const commitTitle = async (): Promise<void> => {
    setEditingTitle(false)
    const next = titleDraft.trim()
    if (!next || next === song.title) return
    const updated = { ...song, title: next }
    setSong(updated)
    await saveSong(updated)
  }

  const handleApplyBackground = (bgPath: string): void => {
    if (!song) return
    // bgPath can be empty string meaning "clear background"
    const path = bgPath || null
    setSong({ ...song, background: path })
    bgQueue.trigger(path)
  }

  const handleBgMotionChange = (motion: SongFull['bgMotion']): void => {
    if (!song) return
    setSong({ ...song, bgMotion: motion })
    bgMotionQueue.trigger(motion)
  }

  const handleBlurBehindTextChange = (value: boolean): void => {
    if (!song) return
    setSong({ ...song, blurBehindText: value })
    blurQueue.trigger(value)
  }

  const handleFontScaleChange = (scale: number): void => {
    if (!song) return
    setSong({ ...song, fontScale: scale })
    fontScaleQueue.trigger(scale)
  }

  const handleTextColorChange = (color: string): void => {
    if (!song) return
    setSong({ ...song, textColor: color })
    textColorQueue.trigger(color)
  }

  const handleFontChange = (font: SongFull['font']): void => {
    if (!song) return
    setSong({ ...song, font })
    fontQueue.trigger(font)
  }

  const colorSwatches: { hex: string; label: string }[] = [
    { hex: '#ffffff', label: 'White' },
    { hex: '#111111', label: 'Black' },
    { hex: '#f5d76e', label: 'Gold' },
    { hex: '#fff5e6', label: 'Cream' }
  ]
  const activeColor = song.textColor ?? '#ffffff'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Header bar */}
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-[#f4f6f9] px-4 py-2.5">
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <input
              ref={titleRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle()
                if (e.key === 'Escape') setEditingTitle(false)
              }}
              className="w-full rounded-md border border-blue-400/50 bg-white px-2 py-1 text-base font-semibold text-slate-900 outline-none ring-2 ring-blue-500/30"
            />
          ) : (
            <button
              onClick={startTitleEdit}
              title="Click to rename"
              className="group flex max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-slate-100"
            >
              <span className="truncate text-base font-semibold text-slate-900">{song.title}</span>
              <span className="text-slate-500 opacity-0 transition-opacity group-hover:opacity-100"><Pencil size={12} /></span>
            </button>
          )}
          {song.author && <p className="truncate px-1 text-xs text-slate-500">{song.author}</p>}
        </div>

        <SaveStatusBadge status={saveStatus} error={saveError} onRetry={retrySave} />

        <button
          onClick={() => window.wf.editorOpen(songId)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-500/10 hover:text-blue-800"
          title="Open editor in its own window"
        >
          <ExternalLink size={13} /> Pop out
        </button>
        {onSaved && (
          <button
            onClick={() => onSaved()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900"
          >
            <ArrowLeft size={13} /> Back
          </button>
        )}
      </div>

      {/* Editor body: continuous lyrics editor + background panel */}
      <div className="flex min-h-0 flex-1 gap-3">
        {/* Center: continuous lyrics editor + live slide preview */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* Text toolbar: font, color, font size */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-[#f4f6f9] px-3 py-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-600">Font</span>
              <select
                value={song.font ?? 'modern'}
                onChange={(e) => handleFontChange(e.target.value as SongFull['font'])}
                className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-900"
              >
                <option value="modern">Modern</option>
                <option value="classic">Classic</option>
                <option value="bold">Bold</option>
                <option value="elegant">Elegant</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-600">Text</span>
              <input
                type="color"
                value={activeColor}
                onChange={(e) => handleTextColorChange(e.target.value)}
                className="h-7 w-9 cursor-pointer rounded bg-transparent"
              />
              {colorSwatches.map((sw) => (
                <button
                  key={sw.hex}
                  type="button"
                  title={sw.label}
                  onClick={() => handleTextColorChange(sw.hex)}
                  className={`h-5 w-5 rounded-full border border-slate-200 transition ${
                    activeColor.toLowerCase() === sw.hex.toLowerCase() ? 'ring-2 ring-blue-400 ring-offset-1 ring-offset-[#f4f6f9]' : ''
                  }`}
                  style={{ background: sw.hex }}
                />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-600">Size</span>
              <select
                value={song.fontScale ?? 4}
                onChange={(e) => handleFontScaleChange(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-900"
              >
                {[3, 4, 5, 6, 7, 8, 9, 10].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex min-h-0 flex-1">
            <ReflowEditor song={song} value={lyricsText} onChange={handleLyricsChange} />
          </div>
          <p className="text-center text-[10px] text-slate-400">
            A blank line starts a new slide, a label like "Chorus" starts a new section • {slides.length} slide{slides.length !== 1 ? 's' : ''} total
          </p>
        </div>

        {/* Right: background panel */}
        <BackgroundPanel
          song={song}
          onApply={handleApplyBackground}
          onBgMotionChange={handleBgMotionChange}
          onBlurBehindTextChange={handleBlurBehindTextChange}
        />
      </div>
    </div>
  )
}
