// src/renderer/src/editor/SlideCanvas.tsx
// 16:9 WYSIWYG slide canvas. Shows real background + lyrics; click to edit.

import { useRef, useState, useEffect } from 'react'
import { getTheme, resolveColors, staticBackgroundCss, FONT_FAMILY } from '../../../shared/themes'
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
}

const FONT_SIZES = [3, 4, 5, 6, 7, 8, 9, 10]

export default function SlideCanvas({ song, slide, onTextChange }: SlideCanvasProps): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [showToolbar, setShowToolbar] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)

  // When the active slide changes, stop editing.
  useEffect(() => { setEditing(false); setShowToolbar(false) }, [slide?.key])

  const theme = getTheme(null)
  const colors = resolveColors(theme)
  const fontFamily = FONT_FAMILY[theme.font]
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

  // Resolve background CSS
  const bgIsTheme = song.background?.startsWith('theme:')
  const bgThemeId = bgIsTheme ? song.background!.slice(6) : null
  const bgTheme = getTheme(bgThemeId)
  const bgColors = resolveColors(bgTheme)

  return (
    <div className="relative w-full select-none overflow-hidden rounded-lg bg-black" style={{ aspectRatio: '16/9' }}>

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
        <div className="absolute inset-0" style={{ background: staticBackgroundCss(bgTheme, bgColors) }} />
      )}

      {/* Overlay for readability */}
      <div className="absolute inset-0 bg-black/20" />

      {/* Inline font toolbar (shown while editing) */}
      {showToolbar && (
        <div className="absolute left-2 top-2 z-20 flex items-center gap-1 rounded-lg border border-white/20 bg-black/80 px-2 py-1 shadow-xl backdrop-blur">
          <span className="mr-1 text-[10px] text-white/50">Size</span>
          {FONT_SIZES.map((s) => (
            <button
              key={s}
              onMouseDown={(e) => {
                e.preventDefault()
                window.wf.songSetFontScale(song.id, s)
              }}
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                (song.fontScale ?? 6) === s ? 'bg-blue-600 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
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
          <span
            className="font-bold leading-tight"
            style={{
              fontSize: `${song.fontScale ?? 6}vw`,
              fontFamily,
              color: '#ffffff',
              textShadow: '0 3px 24px rgba(0,0,0,.85), 0 1px 3px rgba(0,0,0,.9)',
              whiteSpace: 'pre-line',
              maxWidth: '100%'
            }}
          >
            {slide.text || <span className="opacity-40 italic">Click to type lyrics…</span>}
          </span>
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
            className="w-full resize-none bg-transparent text-center font-bold leading-tight outline-none ring-2 ring-blue-400/60 rounded"
            style={{
              fontSize: `${song.fontScale ?? 6}vw`,
              fontFamily,
              color: '#ffffff',
              textShadow: '0 3px 24px rgba(0,0,0,.85)',
              whiteSpace: 'pre-line',
              minHeight: '2em',
              caretColor: '#fff'
            }}
            rows={song.linesPerSlide ?? 2}
          />
        </div>
      )}

      {/* Section label chip */}
      {slide && !showToolbar && (
        <div className="absolute top-2 left-2 rounded bg-black/50 px-2 py-0.5 text-xs font-semibold text-white/70">
          {slide.sectionLabel}
        </div>
      )}

      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm">
          No slides — add lyrics first
        </div>
      )}
    </div>
  )
}
