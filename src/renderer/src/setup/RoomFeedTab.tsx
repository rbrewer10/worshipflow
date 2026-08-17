import { useEffect, useRef, useState } from 'react'
import { Camera, Monitor, QrCode } from 'lucide-react'
import QRCode from 'qrcode'
import { useRoomFeed } from '../livecall/useRoomFeed'
import type { SenderState } from '../livecall/RoomFeedSender'

const STATE_LABEL: Record<SenderState, { label: string; className: string }> = {
  idle: { label: 'Standby', className: 'bg-panel-raised text-content-secondary ring-border' },
  starting: { label: 'Starting…', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  live: { label: 'Live', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  error: { label: 'Error', className: 'bg-red-50 text-red-700 ring-red-200' },
}

// Setup destination for the return feed: a camera and the mixer's audio,
// sent to a tablet in front of the remote preacher so he can see and hear
// the room. Independent of the outbound Live Call — see the 2026-08-01
// design spec for why the two are deliberately not tied together.
function RoomFeedTab(): JSX.Element {
  const {
    state, error, viewerCount, stream, feedUrl, feedUrlIsSecure, tabletPort,
    cameras, microphones, requestDevicePermission, start, stop,
  } = useRoomFeed()
  const [cameraId, setCameraId] = useState('')
  const [audioId, setAudioId] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  useEffect(() => {
    if (!feedUrl) return
    QRCode.toDataURL(feedUrl, { width: 240, margin: 1 })
      .then(setQr)
      .catch(() => setQr(null))
  }, [feedUrl])

  useEffect(() => {
    if (cameras.length && !cameraId) setCameraId(cameras[0].deviceId)
  }, [cameras, cameraId])
  useEffect(() => {
    if (microphones.length && !audioId) setAudioId(microphones[0].deviceId)
  }, [microphones, audioId])

  const pill = STATE_LABEL[state]
  const canStart = state === 'idle' && !!cameraId && !!audioId
  const hasLabels = cameras.some((c) => c.label) || microphones.some((m) => m.label)

  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="mb-1 flex items-center gap-2 text-lg font-semibold text-content-primary">
            <Camera size={18} className="text-content-secondary" /> Room feed
          </h1>
          <p className="text-sm text-content-secondary">
            Sends a camera and the mixer&apos;s audio to a tablet in front of a remote
            preacher, so he can see and hear the room. Independent of Live Call — start
            and stop this whenever you want, whether or not his call is live.
          </p>
        </div>

        {!hasLabels && (
          <div className="rounded-xl border border-border bg-panel p-5">
            <p className="mb-3 text-sm text-content-secondary">
              Grant camera and microphone access once so the pickers below can show real
              device names.
            </p>
            <button onClick={() => void requestDevicePermission()} className="btn text-xs">
              Grant access
            </button>
          </div>
        )}

        <div className="rounded-xl border border-border bg-panel p-5">
          <div className="mb-3 flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${pill.className}`}>
              {pill.label}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-content-secondary">
              <Monitor size={12} />
              {viewerCount === 1 ? '1 tablet connected' : `${viewerCount} tablets connected`}
            </span>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-content-secondary">Camera</span>
              <select
                value={cameraId}
                onChange={(e) => setCameraId(e.target.value)}
                disabled={state !== 'idle'}
                className="w-full rounded-lg border border-border px-2 py-1.5 text-sm"
              >
                {cameras.length === 0 && <option value="">No camera found</option>}
                {cameras.map((c) => (
                  <option key={c.deviceId} value={c.deviceId}>{c.label || 'Camera'}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-content-secondary">Audio input</span>
              <select
                value={audioId}
                onChange={(e) => setAudioId(e.target.value)}
                disabled={state !== 'idle'}
                className="w-full rounded-lg border border-border px-2 py-1.5 text-sm"
              >
                {microphones.length === 0 && <option value="">No audio input found</option>}
                {microphones.map((m) => (
                  <option key={m.deviceId} value={m.deviceId}>{m.label || 'Microphone'}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="relative mb-3 aspect-video w-full overflow-hidden rounded-lg bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full"
              style={{ objectFit: 'contain' }}
            />
            {state === 'idle' && (
              <div className="absolute inset-0 flex items-center justify-center text-[11px] text-content-tertiary">
                Not started
              </div>
            )}
          </div>

          {error && <p className="mb-3 text-[11px] text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => void start(cameraId, audioId)}
              disabled={!canStart}
              className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-40"
            >
              Start
            </button>
            <button
              onClick={stop}
              disabled={state === 'idle'}
              className="btn text-xs disabled:cursor-not-allowed disabled:opacity-40"
            >
              Stop
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-panel p-5">
          <div className="section-header mb-2 flex items-center gap-1.5">
            <QrCode size={12} /> Set up the tablet
          </div>
          <div className="flex items-start gap-3">
            {qr && <img src={qr} alt="QR code linking to the room feed viewer page" className="h-[120px] w-[120px] rounded bg-panel-raised p-1" />}
            <div className="space-y-1.5 text-[11px] leading-snug text-content-secondary">
              <p>Scan this on the tablet, then Share &rarr; Add to Home Screen.</p>
              <p className="break-all font-mono text-[10px] text-content-tertiary">{feedUrl}</p>
              {feedUrlIsSecure ? (
                <p className="rounded bg-emerald-50 p-2 text-emerald-800 ring-1 ring-emerald-200">
                  Tailscale address detected — the same one already set up for Live Call.
                  No additional setup needed.
                </p>
              ) : (
                <p className="rounded bg-amber-50 p-2 text-amber-800 ring-1 ring-amber-200">
                  <b>Tailscale not detected.</b> Set it up the same way you did for Live
                  Call — install Tailscale on this computer and the tablet, run{' '}
                  <code className="font-mono">tailscale serve --bg {tabletPort}</code>, and
                  reopen this panel.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RoomFeedTab
