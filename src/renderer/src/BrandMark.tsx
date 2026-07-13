// WorshipFlow Pro brand mark — the square app-button logo (navy tile, cross, and
// ribbon infinity). Rendered from the same image that produces the packaged app
// icon (build/icon-source.png, mirrored here as an asset) so the in-app logo and
// the taskbar icon always match. Update both by replacing build/icon-source.png
// and re-copying it to src/renderer/src/assets/brand-icon.png (then npm run icons).
import brandIcon from './assets/brand-icon.png'

export default function BrandMark({
  size = 28,
  className
}: {
  size?: number
  className?: string
}): JSX.Element {
  return (
    <img
      src={brandIcon}
      width={size}
      height={size}
      className={className}
      alt="WorshipFlow Pro"
      draggable={false}
    />
  )
}
