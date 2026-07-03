// Decorative SVG bar-waveform, adapted from the design-preview mockup
// (./preview/Waveform.tsx). Purely visual — not bound to any real audio data.
// Used by VolunteerCheck as a non-data-bound flourish since there is no live
// audio capture pipeline to visualize yet.

interface WaveformProps {
  mode: 'mono' | 'stereo'
  accent: string
  height: number
  /** Stable seed so the "random" waveform looks organic but never changes */
  seed: number
}

function prng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

function Waveform({ mode, accent, height, seed }: WaveformProps): JSX.Element {
  const rows = mode === 'stereo' ? 2 : 1
  const rowH = rows === 2 ? (height - 8) / 2 : height
  const W = 1000
  const N = 140
  const bw = (W / N) * 0.62

  const rowEls: JSX.Element[] = []
  for (let r = 0; r < rows; r++) {
    const gradId = `scp-wg-${seed}-${r}`
    const cy = r === 0 ? rowH / 2 : rowH + 8 + rowH / 2
    const rnd = prng(1234 + r * 777 + seed)
    let peakX = 0
    let peakA = 0
    const bars: JSX.Element[] = []
    for (let i = 0; i < N; i++) {
      const t = i / N
      const env = 0.25 + 0.75 * Math.pow(Math.sin(t * Math.PI * (2.1 + r * 0.4) + r), 2)
      const a = (0.18 + 0.82 * rnd() * env) * (rowH / 2 - 3)
      if (a > peakA) {
        peakA = a
        peakX = i * (W / N)
      }
      bars.push(
        <rect
          key={i}
          x={(i * (W / N)).toFixed(1)}
          y={(cy - a).toFixed(1)}
          width={bw.toFixed(1)}
          height={(a * 2).toFixed(1)}
          rx={1.5}
          fill={`url(#${gradId})`}
        />
      )
    }
    rowEls.push(
      <g key={r}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={accent} stopOpacity=".95" />
            <stop offset=".5" stopColor={accent} stopOpacity=".55" />
            <stop offset="1" stopColor={accent} stopOpacity=".95" />
          </linearGradient>
        </defs>
        <line x1={0} y1={cy} x2={W} y2={cy} stroke={accent} strokeOpacity=".25" strokeWidth={1} />
        <g
          className={r === 0 ? 'scp-pulse-y' : undefined}
          style={r === 0 ? { transformOrigin: `50% ${cy}px` } : undefined}
        >
          {bars}
        </g>
        <line
          x1={(peakX + bw / 2).toFixed(1)}
          y1={cy - rowH / 2 + 2}
          x2={(peakX + bw / 2).toFixed(1)}
          y2={cy + rowH / 2 - 2}
          stroke="#ffffff"
          strokeOpacity=".55"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      </g>
    )
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label="live waveform"
    >
      {rowEls}
    </svg>
  )
}

export default Waveform
