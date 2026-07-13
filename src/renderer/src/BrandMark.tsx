// WorshipFlow Pro brand mark — a cross with an infinity woven at its base, as an
// inline SVG so it stays crisp at any size. The source of truth for the packaged
// app icon is build/icon.svg; keep the two in sync.
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
  const infinity = `wf-inf-${uid}`
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
          <stop offset="0" stopColor="#173a6b" />
          <stop offset="0.55" stopColor="#0f2b52" />
          <stop offset="1" stopColor="#0a1e3c" />
        </linearGradient>
        <radialGradient id={glow} cx="0.5" cy="0.28" r="0.75">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={cross} x1="256" y1="150" x2="256" y2="406" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#eaf2ff" />
        </linearGradient>
        <linearGradient id={infinity} x1="150" y1="366" x2="362" y2="366" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#93c0f5" />
          <stop offset="0.5" stopColor="#5a97e8" />
          <stop offset="1" stopColor="#3f83e0" />
        </linearGradient>
      </defs>
      <rect x="32" y="32" width="448" height="448" rx="108" fill={`url(#${tile})`} />
      <rect x="32" y="32" width="448" height="448" rx="108" fill={`url(#${glow})`} />
      <g fill={`url(#${cross})`}>
        <rect x="222" y="150" width="68" height="256" rx="26" />
        <rect x="164" y="232" width="184" height="68" rx="26" />
      </g>
      <path
        d="M256 372 C 224 328, 168 328, 150 372 C 132 416, 224 416, 256 372 C 288 328, 380 328, 362 372 C 344 416, 288 416, 256 372 Z"
        stroke={`url(#${infinity})`}
        strokeWidth="32"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
