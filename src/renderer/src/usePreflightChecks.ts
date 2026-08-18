import { useEffect, useState } from 'react'
import type { AppInfo, ObsStatus, ZoneId } from '../../shared/types'
import { ZONE_IDS, ZONE_NAMES } from '../../shared/types'
import { useService } from './ServiceContext'

// A row's status. 'ok' and 'warn' are opinions ("this probably needs
// attention before Sunday"); 'info' is neutral — not every church streams
// every service, so no OBS connection isn't itself a problem.
export type PreflightLevel = 'ok' | 'warn' | 'info'

export interface PreflightCheck {
  level: PreflightLevel
  label: string
}

export interface PreflightResult {
  checks: PreflightCheck[]
  needsAttention: boolean
}

export function computePreflightChecks(input: {
  rehearsal: boolean
  screenCount: number
  missingZoneNames: string[]
  activeServiceName: string | null
  obsConnected: boolean
}): PreflightCheck[] {
  const { rehearsal, screenCount, missingZoneNames, activeServiceName, obsConnected } = input
  return [
    rehearsal
      ? { level: 'warn', label: 'Rehearsal mode is armed — real outputs are showing nothing' }
      : { level: 'ok', label: 'Rehearsal mode off' },
    screenCount === 0
      ? { level: 'warn', label: 'No screens connected yet' }
      : missingZoneNames.length > 0
      ? { level: 'warn', label: `${screenCount} screen${screenCount !== 1 ? 's' : ''} connected — ${missingZoneNames.join(', ')} not connected` }
      : { level: 'ok', label: `${screenCount} screen${screenCount !== 1 ? 's' : ''} connected` },
    activeServiceName
      ? { level: 'ok', label: `"${activeServiceName}" loaded` }
      : { level: 'warn', label: 'No service loaded yet' },
    { level: obsConnected ? 'ok' : 'info', label: obsConnected ? 'OBS connected' : 'OBS not connected' }
  ]
}

// Shared by HomeView (the full checklist) and ServiceEditor (a compact status
// pill, added in a later task) so the two can never disagree about what
// "ready" means.
export function usePreflightChecks(): PreflightResult {
  const { activeService } = useService()
  const [outputs, setOutputs] = useState(0)
  const [zonesConnected, setZonesConnected] = useState<ZoneId[]>([])
  const [rehearsal, setRehearsal] = useState(false)
  const [obs, setObs] = useState<ObsStatus | null>(null)

  useEffect(() => {
    const load = (): void => {
      window.wf.getInfo().then((i: AppInfo) => { setOutputs(i.outputs); setZonesConnected(i.zonesConnected) })
      window.wf.getRehearsalMode().then(setRehearsal)
    }
    load()
    const t = setInterval(load, 2000)
    window.wf.obsGetStatus().then(setObs)
    const off = window.wf.obsOnStatus(setObs)
    return () => { clearInterval(t); off() }
  }, [])

  const screenCount = outputs + zonesConnected.length
  const missingZoneNames = ZONE_IDS.filter((id) => !zonesConnected.includes(id)).map((id) => ZONE_NAMES[id])

  const checks = computePreflightChecks({
    rehearsal,
    screenCount,
    missingZoneNames,
    activeServiceName: activeService?.name ?? null,
    obsConnected: obs?.connected ?? false
  })

  return { checks, needsAttention: checks.some((c) => c.level === 'warn') }
}
