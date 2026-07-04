// WorshipFlow Pro brand mark — the app icon (a cross with a stream of light
// flowing behind it) as an inline SVG so it stays crisp at any size. The source
// of truth for the packaged app icon is build/icon.svg; keep the two in sync.
//
// Gradient ids are namespaced with useId() so multiple instances on one page
// don't collide on duplicate <defs> ids.
import { useId } from 'react'

export default function BrandMark({
  size = 28,
  className
}: {
  size?: number
  className?: string
}): JSX.Element {
  const uid = useId()
  const tile = `wf-tile-${uid}`
  const glow = `wf-glow-${uid}`
  const cross = `wf-cross-${uid}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="WorshipFlow Pro"
    >
      <defs>
        <linearGradient id={tile} x1="64" y1="48" x2="448" y2="464" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="0.55" stopColor="#10b981" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
        <radialGradient id={glow} cx="0.5" cy="0.28" r="0.75">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={cross} x1="256" y1="150" x2="256" y2="404" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#eafff5" />
        </linearGradient>
      </defs>
      <rect x="32" y="32" width="448" height="448" rx="108" fill={`url(#${tile})`} />
      <rect x="32" y="32" width="448" height="448" rx="108" fill={`url(#${glow})`} />
      <path
        d="M64 356 C 128 316, 176 316, 232 344 S 356 388, 448 340"
        stroke="#d1fae5"
        strokeOpacity="0.9"
        strokeWidth="18"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M64 396 C 136 364, 188 372, 248 392 S 372 420, 448 384"
        stroke="#ffffff"
        strokeOpacity="0.35"
        strokeWidth="12"
        strokeLinecap="round"
        fill="none"
      />
      <g fill={`url(#${cross})`}>
        <rect x="222" y="150" width="68" height="256" rx="26" />
        <rect x="164" y="232" width="184" height="68" rx="26" />
      </g>
    </svg>
  )
}
