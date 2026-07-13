// WorshipFlow Pro brand mark — a white cross with a ribbon infinity in front, on
// a navy tile, as an inline SVG so it stays crisp at any size. The source of truth
// for the packaged app icon is build/icon.svg; keep the two in sync.
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
  const ribbon = `wf-ribbon-${uid}`
  const path = 'M256 350 C 214 296, 150 296, 128 350 C 106 404, 214 404, 256 350 C 298 296, 406 296, 384 350 C 362 404, 298 404, 256 350 Z'
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
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={cross} x1="256" y1="150" x2="256" y2="406" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#eef4ff" />
        </linearGradient>
        <linearGradient id={ribbon} x1="256" y1="300" x2="256" y2="404" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9cc6f7" />
          <stop offset="0.5" stopColor="#5a97e8" />
          <stop offset="1" stopColor="#2f6fd6" />
        </linearGradient>
      </defs>
      <rect x="32" y="32" width="448" height="448" rx="108" fill={`url(#${tile})`} />
      <rect x="32" y="32" width="448" height="448" rx="108" fill={`url(#${glow})`} />
      <g fill={`url(#${cross})`}>
        <rect x="222" y="150" width="68" height="256" rx="26" />
        <rect x="164" y="232" width="184" height="68" rx="26" />
      </g>
      <path d={path} stroke={`url(#${ribbon})`} strokeWidth="42" strokeLinejoin="round" fill="none" />
      <path d={path} stroke="#dbeafe" strokeOpacity="0.35" strokeWidth="10" strokeLinejoin="round" fill="none" />
    </svg>
  )
}
