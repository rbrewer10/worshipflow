// src/renderer/src/ServiceSlidePreview.tsx
// A 16:9 themed preview of a single service item, rendered on its EFFECTIVE
// background (per-item style override → service theme → 'sanctuary' default).
// Mirrors the projector's live styling so the operator sees what will show.

import { getTheme, resolveColors, FONT_FAMILY } from '../../shared/themes'
import type { ServiceItem, ThemeColors, SongFull } from '../../shared/types'

function toAssetUrl(p: string): string {
  return 'wf-asset://?path=' + encodeURIComponent(p)
}

const isVideoFile = (p: string): boolean => /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(p)

export interface ServiceSlidePreviewProps {
  item: ServiceItem
  serviceTheme: string | null
  serviceColors: ThemeColors | null
  songFull?: SongFull | null
  className?: string
}

export default function ServiceSlidePreview({
  item,
  serviceTheme,
  serviceColors,
  songFull,
  className
}: ServiceSlidePreviewProps): JSX.Element {
  const payload = (item.payload ?? {}) as Record<string, unknown>

  const effThemeId = item.style?.theme ?? serviceTheme ?? 'sanctuary'
  const theme = getTheme(effThemeId)
  const colors = resolveColors(theme, item.style?.colors ?? serviceColors ?? undefined)

  const gradientCss = `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`
  const fontFamily = FONT_FAMILY[theme.font]
  const textColor = colors.text || '#fff'

  // Resolve a file/image background by item type (else fall back to gradient).
  let bgFile: string | null = null
  if (item.type === 'text') {
    const b = payload.background as string | undefined
    if (b) bgFile = b
  } else if (item.type === 'image') {
    const p = payload.path as string | undefined
    if (p) bgFile = p
  } else if (item.type === 'song') {
    const sb = songFull?.background
    if (sb && !sb.startsWith('theme:')) bgFile = sb
  }

  const seconds = (payload.seconds as number | undefined) ?? 300
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')

  const baseTextStyle: React.CSSProperties = {
    fontFamily,
    color: textColor,
    textShadow: '0 2px 12px rgba(0,0,0,.7)'
  }

  const renderContent = (): JSX.Element => {
    switch (item.type) {
      case 'scripture': {
        const reference = (payload.reference as string | undefined) || 'Reference'
        return (
          <div className="flex flex-col items-center gap-2 px-6 text-center">
            <div className="text-3xl font-bold leading-tight" style={baseTextStyle}>
              {reference}
            </div>
            <div className="text-xs" style={{ ...baseTextStyle, opacity: 0.6 }}>
              Verse text appears on the projector when live
            </div>
          </div>
        )
      }
      case 'text': {
        const title = payload.title as string | undefined
        const body = payload.body as string | undefined
        const textAlign = ((payload.textAlign as string | undefined) ?? 'center') as 'left' | 'center' | 'right'
        const textPosition = ((payload.textPosition as string | undefined) ?? 'center') as 'top' | 'center' | 'bottom'
        // Same unit the live projector uses (cqw, off the preview box's own
        // width via container-type below) — so this slider actually moves
        // something here, not just in the saved payload.
        const fontScale = (payload.fontScale as number | undefined) ?? 6
        const justify =
          textPosition === 'top' ? 'flex-start' : textPosition === 'bottom' ? 'flex-end' : 'center'
        const align =
          textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center'
        return (
          <div
            className="flex h-full w-full flex-col gap-2 px-8 py-6"
            style={{ justifyContent: justify, alignItems: align, textAlign }}
          >
            {title && (
              <div
                className="text-[10px] font-semibold uppercase tracking-[0.2em]"
                style={{ ...baseTextStyle, opacity: 0.8 }}
              >
                {title}
              </div>
            )}
            {body ? (
              <div className="font-bold leading-tight" style={{ ...baseTextStyle, fontSize: `${fontScale}cqw` }}>
                {body}
              </div>
            ) : (
              <div className="font-bold leading-tight" style={{ ...baseTextStyle, fontSize: `${fontScale}cqw`, opacity: 0.4 }}>
                Type your text…
              </div>
            )}
          </div>
        )
      }
      case 'song': {
        const title = songFull?.title ?? item.title
        const firstLines = songFull?.sections?.[0]?.lyrics?.split('\n').slice(0, 3).join('\n')
        return (
          <div className="flex flex-col items-center gap-2 px-6 text-center">
            <div
              className="text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{ ...baseTextStyle, opacity: 0.8 }}
            >
              {title}
            </div>
            {firstLines ? (
              <div className="whitespace-pre-line text-2xl font-bold leading-tight" style={baseTextStyle}>
                {firstLines}
              </div>
            ) : (
              <div className="text-2xl font-bold leading-tight" style={{ ...baseTextStyle, opacity: 0.4 }}>
                Song lyrics
              </div>
            )}
          </div>
        )
      }
      case 'countdown':
      case 'welcome':
        return (
          <div
            className="text-5xl font-bold tabular-nums"
            style={{ ...baseTextStyle, fontFamily: "'Roboto Mono', ui-monospace, monospace" }}
          >
            {mm}:00
          </div>
        )
      case 'image': {
        if (!bgFile) {
          return (
            <div className="text-sm" style={{ ...baseTextStyle, opacity: 0.4 }}>
              Image slide
            </div>
          )
        }
        return <></>
      }
      case 'ticker': {
        const text = (payload.text as string | undefined) ?? ''
        return (
          <div className="truncate px-6 text-lg font-semibold" style={baseTextStyle}>
            {text}
          </div>
        )
      }
      default:
        return <></>
    }
  }

  return (
    // padding-bottom keeps a true 16:9 box even as a stretched flex item
    // (aspect-ratio can collapse to 0 height in that context).
    <div className={`relative w-full${className ? ` ${className}` : ''}`} style={{ paddingBottom: '56.25%' }}>
      <div className="absolute inset-0 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10" style={{ containerType: 'inline-size' }}>
        {/* Background layer — CSS background-image can only ever show a still
            image, so a video file needs an actual <video> element or it
            silently fails to render (showing nothing behind it). */}
        {bgFile && isVideoFile(bgFile) ? (
          <video
            key={bgFile}
            className="absolute inset-0 h-full w-full object-cover"
            src={toAssetUrl(bgFile)}
            autoPlay
            loop
            muted
            playsInline
          />
        ) : bgFile ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${toAssetUrl(bgFile)})` }}
          />
        ) : (
          <div className="absolute inset-0" style={{ background: gradientCss }} />
        )}

        {/* Dark readability overlay */}
        <div className="absolute inset-0 bg-black/25" />

        {/* Content layer */}
        <div className="absolute inset-0 flex items-center justify-center">{renderContent()}</div>
      </div>
    </div>
  )
}
