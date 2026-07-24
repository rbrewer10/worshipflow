import { useEffect, useState } from 'react'

function formatNow(): string {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// A small always-on clock for the bottom drawer's tab strip, matching
// FreeShow's corner clock. Refreshes every 15s — frequent enough that the
// displayed minute is never meaningfully stale, infrequent enough to avoid
// a once-a-second re-render for information nobody needs at that granularity.
function Clock(): JSX.Element {
  const [now, setNow] = useState(formatNow)
  useEffect(() => {
    const t = setInterval(() => setNow(formatNow()), 15000)
    return () => clearInterval(t)
  }, [])
  return <span className="text-xs font-medium tabular-nums text-slate-500">{now}</span>
}

export default Clock
