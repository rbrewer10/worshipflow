/**
 * Live Call — React binding for the room feed sender.
 *
 * Unlike useLiveCall's relay, this is NOT a module-level singleton started on
 * app boot — the camera and mixer input must not open until the operator
 * explicitly clicks Start (see the 2026-08-01 design spec). One sender per
 * mounted RoomFeedTab is fine: there is only ever one Setup destination for
 * it, and stop() tears everything down on unmount so navigating away doesn't
 * leave a hidden capture running with nothing on screen showing it.
 */
import { useEffect, useRef, useState } from 'react'
import { RoomFeedSender, type SenderState } from './RoomFeedSender'

export interface RoomFeedUi {
  state: SenderState
  error: string | null
  viewerCount: number
  stream: MediaStream | null
  feedUrl: string
  feedUrlIsSecure: boolean
  tabletPort: number
  cameras: MediaDeviceInfo[]
  microphones: MediaDeviceInfo[]
  requestDevicePermission: () => Promise<void>
  start: (cameraId: string, audioId: string) => Promise<void>
  stop: () => void
}

export function useRoomFeed(): RoomFeedUi {
  const senderRef = useRef<RoomFeedSender | null>(null)
  const unmountedRef = useRef(false)
  const [state, setState] = useState<SenderState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [viewerCount, setViewerCount] = useState(0)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [feedUrl, setFeedUrl] = useState('')
  const [feedUrlIsSecure, setFeedUrlIsSecure] = useState(false)
  const [tabletPort, setTabletPort] = useState(3691)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([])

  useEffect(() => {
    let cancelled = false
    void window.wf.roomFeedConfig().then((cfg) => {
      if (cancelled) return
      setFeedUrl(cfg.phoneUrl)
      setFeedUrlIsSecure(cfg.phoneUrlIsSecure)
      setTabletPort(cfg.tabletPort)
    })
    void refreshDevices()
    return () => {
      cancelled = true
      unmountedRef.current = true
      // Stop on unmount: this is the one component that ever shows Room Feed
      // is running, so leaving it running with the panel gone would be a
      // camera/mic active with nothing telling the operator so.
      senderRef.current?.stop()
      void window.wf.roomFeedNotifyCapturing(false)
    }
  }, [])

  async function refreshDevices(): Promise<void> {
    const devices = await navigator.mediaDevices.enumerateDevices()
    setCameras(devices.filter((d) => d.kind === 'videoinput'))
    setMicrophones(devices.filter((d) => d.kind === 'audioinput'))
  }

  async function requestDevicePermission(): Promise<void> {
    // Device labels are blank until a permission has been granted at least
    // once — without this, the pickers show "Camera 1" / "Microphone 1"
    // instead of real names, and the operator can't tell which is which.
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      probe.getTracks().forEach((t) => t.stop())
      await refreshDevices()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function start(cameraId: string, audioId: string): Promise<void> {
    setError(null)
    const cfg = await window.wf.roomFeedConfig()
    if (unmountedRef.current) return
    const sender = new RoomFeedSender(cfg.url, cfg.token, cfg.room)
    senderRef.current = sender
    sender.setCallbacks({
      onStateChange: (s) => { setState(s); setStream(sender.getStream()) },
      onError: setError,
      onViewerCount: setViewerCount,
    })
    await sender.start(cameraId, audioId)
    if (unmountedRef.current) {
      sender.stop()
      return
    }
    if (sender.getState() === 'error') return
    void window.wf.roomFeedNotifyCapturing(true)
  }

  function stop(): void {
    senderRef.current?.stop()
    senderRef.current = null
    setState('idle')
    setStream(null)
    setViewerCount(0)
    void window.wf.roomFeedNotifyCapturing(false)
  }

  return {
    state, error, viewerCount, stream, feedUrl, feedUrlIsSecure, tabletPort,
    cameras, microphones, requestDevicePermission, start, stop,
  }
}
