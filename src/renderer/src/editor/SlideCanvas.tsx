// src/renderer/src/editor/SlideCanvas.tsx
// 16:9 WYSIWYG slide canvas. Sizes itself to the largest 16:9 box that fits its
// parent (width AND height constrained), centered. Shows real background + lyrics;
// click to edit.

import { useRef, useState, useEffect } from 'react'
import { getTheme, resolveColors, FONT_FAMILY } from '../../../shared/themes'
import type { SongFull } from '../../../shared/types'
import type { EditorSlide } from './slideCompute'

function toAssetUrl(p: string): string {
  return 'wf-asset://?path=' + encodeURIComponent(p)
}

function isVideo(p: string): boolean {
  return /\.(mp4|webm|mov|avi)$/i.test(p)
}

export interface SlideCanvasProps {
  song: SongFull
  slide: EditorSlide | null
  onTextChange: (sectionOrdinal: number, lineStart: number, lineCount: number, newText: string) => void
  onFontScaleChange?: (size: number) => void
}

const FONT_SIZES = [3, 4, 5, 6, 7, 8, 9, 10]

export default function SlideCanvas({ song, slide, onTextChange, onFontScaleChange }: SlideCanvasProps): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [showToolbar, setShowToolbar] = useState(false)
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 450 })
  const textRef = useRef<HTMLTextAreaElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Measure the PARENT and compute the largest 16:9 box that fits inside it,
  // constrained by both width and height. Re-measures on parent resize.
  useEffect(() => {
    const wrap = wrapRef.current
    const parent = wrap?.parentElement
    if (!parent) return
    const measure = (): void => {
      const pw = parent.clientWidth
      const ph = parent.clientHeight
      if (pw <= 0 || ph <= 0) return
      const w = Math.min(pw, ph * (16 / 9))
      const h = w * (9 / 16)
      setSize({ w, h })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [])

  // When the active slide changes, stop editing.
  useEffect(() => { setEditing(false); setShowToolbar(false) }, [slide?.key])

  const canvasWidth = size.w
  const fontSizePxValue = ((song.fontScale ?? 4) / 100) * canvasWidth

  // Auto-grow the edit textarea to fit its content (and the current font size)
  // so long lines never clip while typing.
  useEffect(() => {
    const el = textRef.current
    if (!editing || !el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [editing, editText, fontSizePxValue])

  const fontFamily = FONT_FAMILY[song.font ?? getTheme(null).font]
  const textColor = song.textColor ?? '#ffffff'
  const bg = song.background && !song.background.startsWith('theme:') ? song.background : null

  const handleTextClick = (): void => {
    if (editing) return
    setEditText(slide?.text ?? '')
    setEditing(true)
    setShowToolbar(true)
    setTimeout(() => textRef.current?.focus(), 0)
  }

  const handleBlur = (): void => {
    if (!slide) return
    setEditing(false)
    setShowToolbar(false)
    if (editText !== slide.text) {
      onTextChange(slide.sectionOrdinal, slide.lineStart, slide.lineCount, editText)
    }
  }

  const isEmpty = !slide

  // Resolve background CSS. Default (no background) and theme:<id> both read
  // their colors from the themes API so colors can be tuned centrally.
  const bgIsTheme = song.background?.startsWith('theme:')
  const bgThemeId = bgIsTheme ? song.background!.slice(6) : null

  const defTheme = getTheme(bgIsTheme ? bgThemeId : null)
  const defColors = resolveColors(defTheme)
  const gradientCss = `linear-gradient(135deg, ${defColors.primary}, ${defColors.secondary})`

  const fontSizePx = `${((song.fontScale ?? 4) / 100) * canvasWidth}px`
  const textIsEmpty = !slide?.text || slide.text.trim() === ''

  return (
    <div ref={wrapRef}>
      <div
        className="relative select-none overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/10"
        style={{ width: size.w, height: size.h }}
      >
        {/* Background layer */}
        {bg ? (
          isVideo(bg)
            ? <video key={bg} className="absolute inset-0 h-full w-full object-cover" src={toAssetUrl(bg)} autoPlay loop muted playsInline />
            : <div
                key={bg}
                className={`absolute inset-0 ${song.bgMotion === 'pan' ? 'wf-kb-pan' : song.bgMotion === 'zoom' ? 'wf-kb-zoom' : ''} ${song.bgMotion === 'shimmer' ? 'wf-kb-shimmer-overlay' : ''}`}
                style={{ backgroundImage: `url(${toAssetUrl(bg)})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
              />
        ) : (
          <div className="absolute inset-0" style={{ background: gradientCss }} />
        )}

        {/* Overlay for readability */}
        <div className="absolute inset-0 bg-black/20" />

        {/* Floating font-size pill (shown while editing) */}
        {showToolbar && (
          <div className="absolute left-3 top-3 z-20 flex items-center gap-1 rounded-full border border-white/15 bg-black/70 px-2 py-1 shadow-xl backdrop-blur">
            <span className="mr-1 pl-1 text-[10px] font-medium text-white/50">Size</span>
            {FONT_SIZES.map((s) => (
              <button
                key={s}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onFontScaleChange?.(s)
                }}
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                  (song.fontScale ?? 4) === s ? 'bg-emerald-500 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Slide text — click to edit */}
        {!isEmpty && !editing && (
          <div
            className="absolute inset-0 flex cursor-text items-center justify-center px-[8%] py-[6%] text-center"
            onClick={handleTextClick}
          >
            {textIsEmpty ? (
              <span
                className="font-semibold italic"
                style={{
                  fontSize: `${((song.fontScale ?? 4) / 100) * canvasWidth * 0.6}px`,
                  fontFamily,
                  color: 'rgba(255,255,255,0.45)'
                }}
              >
                Click to add lyrics
              </span>
            ) : (
              <span
                className="font-bold leading-tight"
                style={{
                  fontSize: fontSizePx,
                  fontFamily,
                  color: textColor,
                  textShadow: '0 3px 24px rgba(0,0,0,.85), 0 1px 3px rgba(0,0,0,.9)',
                  whiteSpace: 'pre-line',
                  maxWidth: '100%'
                }}
              >
                {slide.text}
              </span>
            )}
          </div>
        )}

        {/* Inline textarea (editing mode) */}
        {editing && (
          <div className="absolute inset-0 flex items-center justify-center px-[8%] py-[6%]">
            <textarea
              ref={textRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setEditing(false); setShowToolbar(false) }
              }}
              className="w-full resize-none overflow-hidden rounded bg-transparent text-center font-bold leading-tight outline-none ring-2 ring-emerald-400/60"
              style={{
                fontSize: fontSizePx,
                fontFamily,
                color: textColor,
                textShadow: '0 3px 24px rgba(0,0,0,.85)',
                whiteSpace: 'pre-line',
                minHeight: '1.2em',
                caretColor: '#fff'
              }}
              rows={1}
            />
          </div>
        )}

        {/* Section label chip */}
        {slide && !showToolbar && (
          <div className="absolute left-3 top-3 rounded-full bg-black/50 px-2.5 py-0.5 text-xs font-semibold text-white/70 backdrop-blur">
            {slide.sectionLabel}
          </div>
        )}

        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/30">
            No slides — add lyrics first
          </div>
        )}
      </div>
    </div>
  )
}
