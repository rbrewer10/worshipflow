import { Film } from 'lucide-react'
import { getTheme, resolveColors, staticBackgroundCss, FONT_FAMILY } from '../../shared/themes'
import type { ItemStyle, ThemeColors } from '../../shared/types'

function toAssetUrl(p: string): string {
  return 'wf-asset://?path=' + encodeURIComponent(p)
}

const isVideoFile = (p: string): boolean => /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(p)

// 16:9 preview of an item using its effective theme (item override else service theme).
// bgFile (a song's own uploaded background) takes priority over the theme gradient
// when present, matching ServiceSlidePreview's behavior for the big preview.
function SlideThumb({ label, itemStyle, serviceTheme, serviceColors, bgFile }: {
  label: string
  itemStyle: ItemStyle | null
  serviceTheme: string | null
  serviceColors: ThemeColors | null
  bgFile?: string | null
}): JSX.Element {
  const themeId = itemStyle?.theme ?? serviceTheme
  const overrides = itemStyle?.theme ? (itemStyle.colors ?? null) : serviceColors
  const theme = getTheme(themeId)
  const colors = resolveColors(theme, overrides)
  const bg = theme.kind === 'static'
    ? staticBackgroundCss(theme, colors)
    : `linear-gradient(120deg, ${colors.primary}, ${colors.secondary})`
  const isVideo = bgFile ? isVideoFile(bgFile) : false
  return (
    <div
      className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md px-2 text-center"
      style={bgFile && !isVideo ? undefined : { background: bg }}
    >
      {bgFile && !isVideo && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${toAssetUrl(bgFile)})` }}
        />
      )}
      {/* Video thumbnails show a static placeholder rather than decoding/playing
          every slide's video simultaneously in a scrolling grid — cheap and honest
          about what's there without the performance cost of many <video> elements. */}
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <Film size={16} className="text-white/70" />
        </div>
      )}
      <span
        className="relative z-10 line-clamp-2 text-[11px] font-semibold leading-tight"
        style={{ fontFamily: FONT_FAMILY[theme.font], color: bgFile ? '#ffffff' : colors.text, textShadow: bgFile ? '0 1px 4px rgba(0,0,0,0.8)' : undefined }}
      >
        {label}
      </span>
    </div>
  )
}

export default SlideThumb
