import { useEffect, useState } from 'react'
import { Tablet, Cpu } from 'lucide-react'
import type { ZoneId } from '../../shared/types'
import { ZONE_NAMES } from '../../shared/types'
import ObsPanel from './ObsPanel'

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

// Full-page home for everything set up once before a service and then left
// alone: OBS (streaming/recording/scenes), and the network addresses for the
// Pi zone displays and the tablet remote. Pulled out of the Live tab's narrow
// sidebar, which had no room to show this comfortably.
function ObsConnectTab(): JSX.Element {
  const [serverIp, setServerIp] = useState('...')
  const [tabletPort, setTabletPort] = useState<number | null>(null)
  const [tabletUrl, setTabletUrl] = useState('')

  useEffect(() => {
    void window.wf.zoneGetIp().then(setServerIp)
    void window.wf.getTabletPort().then(setTabletPort).catch(() => setTabletPort(3691))
    window.wf.getTabletUrl().then(setTabletUrl)
  }, [])

  return (
    <div className="h-full overflow-auto bg-gray-50 p-6">
      <div className="mb-6">
        <div className="text-xl font-semibold text-gray-900">OBS Connect</div>
        <div className="mt-1 text-sm text-gray-400">
          Set up streaming/recording and the network addresses your Pi displays and tablet remote need — do this once before the service.
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-5">
        <ObsPanel />

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 font-semibold text-gray-900">
            <Cpu size={15} /> Pi Display URLs
          </div>
          <div className="space-y-1.5">
            {ZONE_IDS.map((zoneId) => (
              <div key={zoneId} className="flex items-center justify-between rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                <span className="text-xs text-gray-500">Zone {zoneId} — {ZONE_NAMES[zoneId]}</span>
                <span className="font-mono text-xs text-blue-700">
                  http://{serverIp}:{tabletPort ?? '...'}/zone/{zoneId}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-400">Point each Raspberry Pi's kiosk browser at its own URL above.</p>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-5">
          <div className="mb-2 flex items-center gap-2 font-semibold text-gray-900">
            <Tablet size={15} /> Tablet Remote
          </div>
          <div className="break-all rounded-lg bg-white border border-gray-200 px-3 py-2 text-center font-mono text-xs text-blue-700">
            {tabletUrl || 'Starting server…'}
          </div>
          <p className="mt-2 text-xs text-gray-400">Open on an iPad/phone as a wireless stage monitor + remote.</p>
        </div>
      </div>
    </div>
  )
}

export default ObsConnectTab
