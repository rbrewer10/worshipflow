/**
 * Live Call — React binding for the relay.
 *
 * The relay is a module-level singleton, not per-component state. Two relays
 * would both claim the room's single `receiver` slot and evict each other in a
 * loop, so the call would never connect.
 */
import { useEffect, useState } from 'react'
import { LiveCallRelay, type CallState } from './LiveCallRelay'

let relay: LiveCallRelay | null = null
let starting: Promise<LiveCallRelay> | null = null

/**
 * The one relay for this renderer, started on first use. Concurrent callers
 * share the same in-flight start rather than racing to create a second one.
 */
export function getRelay(): Promise<LiveCallRelay> {
  if (relay) return Promise.resolve(relay)
  if (!starting) {
    starting = window.wf.livecallConfig().then((cfg) => {
      if (!relay) {
        relay = new LiveCallRelay(cfg.url, cfg.token, cfg.room)
        relay.start()
      }
      return relay
    })
  }
  return starting
}

export interface LiveCallUi {
  state: CallState
  telemetry: string
  viewerCount: number
  autoAccept: boolean
  setAutoAccept: (on: boolean) => void
  accept: () => void
  decline: () => void
  stream: MediaStream | null
  phoneUrl: string
  phoneUrlIsSecure: boolean
  tabletPort: number
}

export function useLiveCall(): LiveCallUi {
  const [state, setState] = useState<CallState>('idle')
  const [telemetry, setTelemetry] = useState('')
  const [viewerCount, setViewerCount] = useState(0)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [autoAccept, setAutoAcceptState] = useState(true)
  const [phoneUrl, setPhoneUrl] = useState('')
  const [phoneUrlIsSecure, setPhoneUrlIsSecure] = useState(false)
  const [tabletPort, setTabletPort] = useState(3691)

  useEffect(() => {
    let cancelled = false
    void window.wf.livecallConfig().then((cfg) => {
      if (cancelled) return
      setPhoneUrl(cfg.phoneUrl)
      setPhoneUrlIsSecure(cfg.phoneUrlIsSecure)
      setTabletPort(cfg.tabletPort)
    })
    void getRelay().then((r) => {
      if (cancelled) return
      r.setCallbacks({
        onStateChange: (s) => { setState(s); setStream(r.getStream()) },
        onTelemetry: setTelemetry,
        onViewerCount: setViewerCount,
      })
      setState(r.getState())
      setStream(r.getStream())
      setViewerCount(r.getViewerCount())
      setAutoAcceptState(r.getAutoAccept())
    })
    return () => {
      cancelled = true
      // Deliberately does NOT stop the relay: it outlives any one panel, so the
      // call survives the operator navigating away mid-service.
      void getRelay().then((r) => r.setCallbacks({}))
    }
  }, [])

  return {
    state,
    telemetry,
    viewerCount,
    autoAccept,
    setAutoAccept: (on) => { setAutoAcceptState(on); void getRelay().then((r) => r.setAutoAccept(on)) },
    accept: () => { void getRelay().then((r) => r.acceptCall()) },
    decline: () => { void getRelay().then((r) => r.declineCall()) },
    stream,
    phoneUrl,
    phoneUrlIsSecure,
    tabletPort,
  }
}
