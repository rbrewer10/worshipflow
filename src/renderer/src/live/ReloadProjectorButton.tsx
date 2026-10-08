// src/renderer/src/live/ReloadProjectorButton.tsx
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { notifyLocal } from '../NotifyToasts'

// Ryan's decision (Oct 2026): a manual "Reload projector" for when the
// projector looks wrong (stuck frame, a display-driver hiccup) without
// restarting the app. Main reloads every output window; each comes back black
// and repaints what is live now — the live item, slide and Black/Logo state
// are untouched.
function ReloadProjectorButton(): JSX.Element {
  const [busy, setBusy] = useState(false)
  const reload = async (): Promise<void> => {
    setBusy(true)
    try {
      const n = await window.wf.reloadProjector()
      notifyLocal(n > 0
        ? `Projector reloaded${n > 1 ? ` (${n} screens)` : ''} — showing what's live now.`
        : 'No projector window is open to reload.', n > 0 ? 'info' : 'warn')
    } catch (err) {
      notifyLocal(err instanceof Error ? err.message : 'Could not reload the projector', 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      onClick={() => void reload()}
      disabled={busy}
      title="Reload the projector window(s) if the picture looks stuck or wrong. The screen goes black for a moment, then shows what's live now — nothing changes in the service."
      className="btn mb-2 flex w-full items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-semibold disabled:cursor-wait disabled:opacity-50"
    >
      <RefreshCw size={13} className={busy ? 'animate-spin' : undefined} /> Reload projector
    </button>
  )
}

export default ReloadProjectorButton
