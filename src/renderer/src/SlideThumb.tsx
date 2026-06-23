import { getTheme, resolveColors, staticBackgroundCss, FONT_FAMILY } from '../../shared/themes'
import type { ItemStyle, ThemeColors } from '../../shared/types'

// 16:9 preview of an item using its effective theme (item override else service theme).
function SlideThumb({ label, itemStyle, serviceTheme, serviceColors }: {
  label: string
  itemStyle: ItemStyle | null
  serviceTheme: string | null
  serviceColors: ThemeColors | null
}): JSX.Element {
  const themeId = itemStyle?.theme ?? serviceTheme
  const overrides = itemStyle?.theme ? (itemStyle.colors ?? null) : serviceColors
  const theme = getTheme(themeId)
  const colors = resolveColors(theme, overrides)
  const bg = theme.kind === 'static'
    ? staticBackgroundCss(theme, colors)
    : `linear-gradient(120deg, ${colors.primary}, ${colors.secondary})`
  return (
    <div
      className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-md px-2 text-center"
      style={{ background: bg }}
    >
      <span
        className="line-clamp-2 text-[11px] font-semibold leading-tight"
        style={{ fontFamily: FONT_FAMILY[theme.font], color: colors.text }}
      >
        {label}
      </span>
    </div>
  )
}

export default SlideThumb
