// src/renderer/src/ReflowEditor.tsx
// Continuous-text lyric editor with a live WYSIWYG slide preview, used by
// both the Song Library editor and the Service-builder Card editor. `value`
// is the raw, literal lyrics text — this component never reformats it on
// its own; only the read-only preview pane is derived from it. See the
// 2026-08-05 design spec and this plan's "critical interaction-design point"
// note for why the textarea must never round-trip through parse+serialize.
import { useRef, useLayoutEffect } from 'react'
import type { ClipboardEvent } from 'react'
import { getTheme, resolveColors, FONT_FAMILY } from '../../shared/themes'
import { parseReflowText, computeReflowSlides, autoBreakPastedText } from '../../shared/reflowText'
import type { ReflowSlide } from '../../shared/reflowText'
import type { SongFull } from '../../shared/types'

function toAssetUrl(p: string): string {
  return 'wf-asset://?path=' + encodeURIComponent(p)
}

export default function ReflowEditor({ song, value, onChange }: {
  song: SongFull
  value: string
  onChange: (text: string) => void
}): JSX.Element {
  const textRef = useRef<HTMLTextAreaElement>(null)
  // A scripted `.value` write on a controlled textarea (our onChange path,
  // since preventDefault() stops the browser's own paste from ever touching
  // the DOM) resets the caret to the very end of the whole value, not to
  // where the edit happened. Harmless when pasting into an empty textarea
  // (end-of-value and end-of-paste coincide) but wrong for a mid-document
  // paste — the caret would jump past any trailing lyrics. This ref carries
  // the intended caret position across the render triggered by a transformed
  // paste so the effect below can restore it.
  const pendingCaretRef = useRef<number | null>(null)

  const sections = parseReflowText(value)
  const slides = computeReflowSlides(sections, song.arrangement ?? null)

  useLayoutEffect(() => {
    const caret = pendingCaretRef.current
    if (caret === null) return
    pendingCaretRef.current = null
    textRef.current?.setSelectionRange(caret, caret)
  }, [value])

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>): void => {
    const pasted = e.clipboardData.getData('text/plain')
    if (!pasted) return
    const transformed = autoBreakPastedText(pasted)
    if (transformed === pasted) return // nothing to add — let the browser paste natively
    e.preventDefault()
    const el = textRef.current
    if (!el) return
    const { selectionStart, selectionEnd } = el
    const next = value.slice(0, selectionStart) + transformed + value.slice(selectionEnd)
    pendingCaretRef.current = selectionStart + transformed.length
    onChange(next)
  }

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      <textarea
        ref={textRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={handlePaste}
        aria-label="Song lyrics"
        placeholder={'Type or paste lyrics — a blank line starts a new slide, a label like "Chorus" starts a new section…'}
        className="min-h-0 flex-1 resize-none rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs leading-relaxed text-slate-900 outline-none focus:border-blue-500"
      />
      <div className="flex w-40 shrink-0 flex-col gap-2.5 overflow-y-auto py-1 pr-1">
        {slides.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">
            No slides yet
          </div>
        ) : (
          slides.map((slide) => <ReflowSlideThumb key={slide.key} song={song} slide={slide} />)
        )}
      </div>
    </div>
  )
}

// Read-only WYSIWYG thumbnail — real background image/video, real font and
// color, same visual quality as the projector. Adapted from the interactive
// version this replaces (editor/SlideStrip.tsx) minus the click-to-select
// and "active" state, since this preview isn't independently editable —
// editing only happens in the continuous textarea above.
// Matches the w-36 (144px) thumbnail width below — kept as a constant since
// the font-size formula needs the exact pixel width it's proportioning
// against, not just the Tailwind class name.
const THUMB_WIDTH_PX = 144

function ReflowSlideThumb({ song, slide }: { song: SongFull; slide: ReflowSlide }): JSX.Element {
  const theme = getTheme(null)
  const bg = song.background && !song.background.startsWith('theme:') ? song.background : null
  const bgIsTheme = song.background?.startsWith('theme:')
  const bgThemeId = bgIsTheme ? song.background!.slice(6) : null
  const thumbTheme = getTheme(bgIsTheme ? bgThemeId : null)
  const thumbColors = resolveColors(thumbTheme)
  const bgStyle = bg
    ? `url(${toAssetUrl(bg)}) center/cover`
    : `linear-gradient(135deg, ${thumbColors.primary}, ${thumbColors.secondary})`
  // Same proportion-of-canvas-width formula the old WYSIWYG canvas used
  // (fontScale / 100 * width), scaled down to this thumbnail's width instead
  // of the full editor canvas — otherwise changing the font-size picker had
  // no visible effect until the operator went live. Floored so a very small
  // fontScale doesn't shrink below legible even at thumbnail size.
  const fontSizePx = Math.max(6, ((song.fontScale ?? 4) / 100) * THUMB_WIDTH_PX)

  return (
    <div className="w-36 shrink-0">
      <p className="mb-1 truncate px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {slide.sectionLabel}
      </p>
      <div
        className="relative w-full overflow-hidden rounded-lg ring-1 ring-slate-200"
        style={{ aspectRatio: '16/9', background: bgStyle }}
      >
        <div className="absolute inset-0 bg-black/35" />
        <div className="absolute inset-0 flex items-center justify-center px-1.5 text-center">
          <span
            className="line-clamp-2 font-bold leading-tight"
            style={{
              fontSize: `${fontSizePx}px`,
              fontFamily: FONT_FAMILY[song.font ?? theme.font],
              color: song.textColor ?? '#fff',
              textShadow: '0 1px 4px rgba(0,0,0,.9)'
            }}
          >
            {slide.text}
          </span>
        </div>
      </div>
    </div>
  )
}
