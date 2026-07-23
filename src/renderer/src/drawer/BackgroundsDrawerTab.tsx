import { useEffect, useState } from 'react'
import type { LiveState } from '../../../shared/types'
import { useService } from '../ServiceContext'
import { notifyLocal } from '../NotifyToasts'
import { resolveBackgroundApply } from './resolveBackgroundApply'

interface BgEntry {
  filename: string
  path: string
  kind: 'upload' | 'generated'
  isVideo: boolean
}

function toAssetUrl(p: string): string {
  return 'wf-asset://?path=' + encodeURIComponent(p)
}

export default function BackgroundsDrawerTab({ onDone }: { onDone: () => void }): JSX.Element {
  const { activeService, reloadActiveService } = useService()
  const [backgrounds, setBackgrounds] = useState<BgEntry[]>([])
  const [live, setLive] = useState<LiveState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.wf.bgList().then(setBackgrounds)
    const off = window.wf.onState(setLive)
    return off
  }, [])

  const pick = async (path: string): Promise<void> => {
    if (busy) return
    const liveItem = activeService?.items.find((it) => it.id === live?.liveServiceItemId) ?? null
    if (!liveItem) {
      notifyLocal('Nothing is live yet — send something live first.', 'warn')
      return
    }

    setBusy(true)
    try {
      const action = resolveBackgroundApply(liveItem, path)
      if (action.kind === 'song') {
        await window.wf.songSetBackground(action.songId, action.path)
      } else if (action.kind === 'text') {
        await window.wf.serviceSetItemPayload(action.itemId, action.payload)
      } else {
        notifyLocal(`Backgrounds aren't supported on ${action.itemType} items.`, 'warn')
        return
      }
      await window.wf.liveSetBackground(action.path)
      reloadActiveService()
      onDone()
    } catch {
      notifyLocal('Could not apply that background.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid grid-cols-6 gap-2">
      {backgrounds.length === 0 && (
        <p className="col-span-6 text-xs text-slate-400">No backgrounds yet — add some in Build Service.</p>
      )}
      {backgrounds.map((bg) => (
        <button
          key={bg.path}
          onClick={() => void pick(bg.path)}
          disabled={busy}
          className="overflow-hidden rounded border border-slate-200 hover:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ aspectRatio: '16/9' }}
          title={bg.filename}
        >
          {bg.isVideo ? (
            <video src={toAssetUrl(bg.path)} className="h-full w-full object-cover" muted />
          ) : (
            <img src={toAssetUrl(bg.path)} className="h-full w-full object-cover" alt={bg.filename} />
          )}
        </button>
      ))}
    </div>
  )
}
