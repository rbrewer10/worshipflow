import { useEffect, useState } from 'react'
import type { ZoneId } from '../../shared/types'
import { ZONE_NAMES } from '../../shared/types'
import ZoneLiveGrid from './zones/ZoneLiveGrid'

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

// The Live tab's zone section: the four clickable screen cards, plus the Pi
// addresses. Authoring (scenes, per-item routing) deliberately does NOT live
// here — editing an item's stored setup from the Live tab looked like a live
// control but silently changed what the item does every future time it goes up.
function ZonePanel(): JSX.Element {
  const [serverIp, setServerIp] = useState<string>('...')
  const [port, setPort] = useState<number | null>(null)
  const [savingLook, setSavingLook] = useState(false)
  const [lookName, setLookName] = useState('')

  useEffect(() => {
    void window.wf.zoneGetIp().then(setServerIp)
    void window.wf.getTabletPort().then(p => setPort(p)).catch(err => {
      console.error('Failed to get tablet port:', err)
      setPort(3691) // fallback
    })
  }, [])

  const saveLook = async (): Promise<void> => {
    const name = lookName.trim()
    if (!name) return
    await window.wf.looksSave(name)
    setLookName('')
    setSavingLook(false)
  }

  return (
    <div className="space-y-3">
      <ZoneLiveGrid />

      {/* Save the 4 zones' current pins as a one-click preset, recalled from the Live tab */}
      <div className="rounded-lg border border-slate-200 bg-slate-100/70 p-2.5">
        {savingLook ? (
          <div className="flex items-center gap-1.5">
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus -- continuation of the operator's own "+ Save..." click, matching this session's existing convention (e.g. SongLibrary.tsx)
              autoFocus
              value={lookName}
              onChange={(e) => setLookName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveLook()
                if (e.key === 'Escape') { setSavingLook(false); setLookName('') }
              }}
              placeholder="Name this Look"
              aria-label="Name this Look"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-blue-500"
            />
            <button onClick={saveLook} className="shrink-0 text-xs font-semibold text-blue-700">Save</button>
          </div>
        ) : (
          <button
            onClick={() => setSavingLook(true)}
            className="w-full rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-800"
          >
            + Save current pins as a Look
          </button>
        )}
      </div>

      {/* Pi network addresses */}
      <div className="rounded-lg border border-slate-200 bg-slate-100/70 p-2.5">
        <div className="mb-1.5 text-[11px] font-semibold text-slate-500">Pi Display URLs</div>
        <div className="space-y-1">
          {ZONE_IDS.map((zoneId) => (
            <div key={zoneId} className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400">Zone {zoneId} — {ZONE_NAMES[zoneId]}</span>
              <span className="font-mono text-[11px] text-blue-700">
                http://{serverIp}:{port ?? '...'}/zone/{zoneId}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ZonePanel
