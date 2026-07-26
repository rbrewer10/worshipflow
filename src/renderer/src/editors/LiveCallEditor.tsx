import { useEffect, useRef, useState } from 'react'
import { Video, Phone, PhoneOff, Monitor, QrCode } from 'lucide-react'
import QRCode from 'qrcode'
import { useLiveCall } from '../livecall/useLiveCall'
import type { CallState } from '../livecall/LiveCallRelay'

const STATE_STYLE: Record<CallState, { label: string; className: string }> = {
  idle: { label: 'Standby', className: 'bg-slate-100 text-slate-500 ring-slate-200' },
  ringing: { label: 'Incoming call', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  live: { label: 'Live', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  reconnecting: { label: 'Reconnecting', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
}

/**
 * Live Call item editor.
 *
 * The operator's questions during a service are "is he connected?" and "are the
 * screens getting it?" — so call state and viewer count are the two things this
 * shows biggest. The QR code exists because the token is 64 hex characters and
 * setting up the phone by typing it is miserable.
 */
export default function LiveCallEditor(): JSX.Element {
  const { state, telemetry, viewerCount, autoAccept, setAutoAccept, accept, decline, stream, phoneUrl, phoneUrlIsSecure, tabletPort } = useLiveCall()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  useEffect(() => {
    if (!phoneUrl) return
    QRCode.toDataURL(phoneUrl, { width: 240, margin: 1 })
      .then(setQr)
      .catch(() => setQr(null))
  }, [phoneUrl])

  const pill = STATE_STYLE[state]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${pill.className}`}>
          <Video size={12} />
          {pill.label}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
          <Monitor size={12} />
          {viewerCount === 1 ? '1 screen connected' : `${viewerCount} screens connected`}
        </span>
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full"
          style={{ objectFit: 'contain' }}
        />
        {state === 'idle' && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-400">
            Waiting for a call
          </div>
        )}
      </div>

      <div className="min-h-[14px] font-mono text-[10px] text-slate-400">{telemetry}</div>

      <div className="flex items-center gap-2">
        <button
          onClick={accept}
          disabled={state !== 'ringing'}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          <Phone size={13} /> Accept
        </button>
        <button
          onClick={decline}
          disabled={state === 'idle'}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold text-slate-600 ring-1 ring-slate-200 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          <PhoneOff size={13} /> End
        </button>
        <label className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-slate-500">
          <input
            type="checkbox"
            checked={autoAccept}
            onChange={(e) => setAutoAccept(e.target.checked)}
          />
          Answer automatically
        </label>
      </div>

      <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
        <div className="section-header mb-2 flex items-center gap-1.5">
          <QrCode size={12} /> Set up the phone
        </div>
        <div className="flex items-start gap-3">
          {qr && <img src={qr} alt="QR code linking to the Live Call phone page" className="h-[120px] w-[120px] rounded bg-white p-1" />}
          <div className="space-y-1.5 text-[11px] leading-snug text-slate-500">
            <p>Scan this on the phone, then Share &rarr; Add to Home Screen.</p>
            <p className="break-all font-mono text-[10px] text-slate-400">{phoneUrl}</p>
            {phoneUrlIsSecure ? (
              <p className="rounded bg-emerald-50 p-2 text-emerald-800 ring-1 ring-emerald-200">
                Tailscale address detected. It only serves this page while{' '}
                <code className="font-mono">tailscale serve --bg {tabletPort}</code> is running on
                this computer — that survives reboots once set.
              </p>
            ) : (
              <p className="rounded bg-amber-50 p-2 text-amber-800 ring-1 ring-amber-200">
                <b>Tailscale not detected, so this http:// address cannot use the camera.</b>{' '}
                Phones only allow camera access over https. Install Tailscale on this computer and
                on his phone, run{' '}
                <code className="font-mono">tailscale serve --bg {tabletPort}</code>, and reopen
                this panel — the code will switch to the https address on its own.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
