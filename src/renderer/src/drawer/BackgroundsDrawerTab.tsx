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
  folder: string | null
}

function toAssetUrl(p: string): string {
  return 'wf-asset://?path=' + encodeURIComponent(p)
}

export default function BackgroundsDrawerTab({ onDone, isBuildService }: { onDone: () => void; isBuildService: boolean }): JSX.Element {
  const { activeService, reloadActiveService, selectedItemId } = useService()
  const [backgrounds, setBackgrounds] = useState<BgEntry[]>([])
  const [live, setLive] = useState<LiveState | null>(null)
  const [busy, setBusy] = useState(false)
  const [folders, setFolders] = useState<string[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null | 'ALL'>('ALL')

  useEffect(() => {
    window.wf.bgList().then(setBackgrounds)
    window.wf.bgListFolders().then(setFolders)
    // onState only pushes future broadcasts — seed the current state too, or this
    // tab thinks nothing is live until the next unrelated state change (matches
    // the same getState()+onState() pattern ServiceRail.tsx already uses).
    window.wf.getState('main').then(setLive)
    const off = window.wf.onState((s) => setLive(s.main))
    // This drawer can stay mounted while the operator renames/deletes a folder
    // elsewhere (e.g. a song/item's own background picker on the same Build
    // Service screen) — without a refetch, this tab would show stale folder
    // pills and stale paths. Re-reading on window focus matches the same fix
    // BackgroundLibraryGrid.tsx already applies for the same staleness risk.
    const onFocus = (): void => {
      window.wf.bgList().then(setBackgrounds)
      window.wf.bgListFolders().then(setFolders)
    }
    window.addEventListener('focus', onFocus)
    return () => {
      off()
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const folderScoped = selectedFolder === 'ALL'
    ? backgrounds
    : backgrounds.filter((bg) => bg.folder === selectedFolder)

  const pick = async (path: string): Promise<void> => {
    if (busy) return

    // On Build Service, target whatever's selected in the builder — never the
    // live item, which may be something unrelated the operator hasn't touched.
    // Everywhere else, target the live item, exactly as before this feature.
    const targetItem = isBuildService
      ? (activeService?.items.find((it) => it.id === selectedItemId) ?? null)
      : (activeService?.items.find((it) => it.id === live?.liveServiceItemId) ?? null)

    if (!targetItem) {
      notifyLocal(
        isBuildService
          ? 'Select an item in the builder first.'
          : 'Nothing is live yet — send something live first.',
        'warn'
      )
      return
    }

    setBusy(true)
    try {
      const action = resolveBackgroundApply(targetItem, path)
      if (action.kind === 'song') {
        await window.wf.songSetBackground(action.songId, action.path)
      } else if (action.kind === 'payload') {
        await window.wf.serviceSetItemPayload(action.itemId, action.payload)
      } else {
        notifyLocal(`Backgrounds aren't supported on ${action.itemType} items.`, 'warn')
        return
      }
      // Only push the live projector when we're actually targeting the live
      // item (i.e. not building) — building shouldn't change what's on air.
      if (!isBuildService) {
        await window.wf.liveSetBackground('main', action.path)
      }
      reloadActiveService()
      onDone()
    } catch {
      notifyLocal('Could not apply that background.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Folder rail */}
      {folders.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSelectedFolder('ALL')}
            className={[
              'rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all',
              selectedFolder === 'ALL' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            ].join(' ')}
          >
            All
          </button>
          <button
            onClick={() => setSelectedFolder(null)}
            className={[
              'rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all',
              selectedFolder === null ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            ].join(' ')}
          >
            Uncategorized
          </button>
          {folders.map((f) => (
            <button
              key={f}
              onClick={() => setSelectedFolder(f)}
              className={[
                'rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all',
                selectedFolder === f ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              ].join(' ')}
            >
              {f}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-6 gap-2">
        {backgrounds.length === 0 ? (
          <p className="col-span-6 text-xs text-slate-400">No backgrounds yet — add some in Build Service.</p>
        ) : folderScoped.length === 0 ? (
          <p className="col-span-6 text-xs text-slate-400">Nothing in this folder yet.</p>
        ) : (
          folderScoped.map((bg) => (
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
          ))
        )}
      </div>
    </div>
  )
}
