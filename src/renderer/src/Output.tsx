import { useEffect, useState } from 'react'
import type { LiveState, Mode } from '../../shared/types'

function toAssetUrl(p: string): string {
  return 'wf-asset://?path=' + encodeURIComponent(p)
}

function isVideo(p: string): boolean {
  return /\.(mp4|webm|mov|avi|mkv)$/i.test(p)
}

// A "dumb" fullscreen output. Subscribes to broadcast state and renders it:
// motion background + crossfading lyric layers, or logo / black. Holds no
// authority — the main process tells it what to show.
function Output(): JSX.Element {
  const id = new URLSearchParams(window.location.search).get('id')
  const [mode, setMode] = useState<Mode>('lyrics')
  const [layers, setLayers] = useState<{ front: 0 | 1; a: string; b: string }>({
    front: 0,
    a: '',
    b: ''
  })
  const [fps, setFps] = useState(0)
  const [bgSrc, setBgSrc] = useState<string | null>(null)
  const [bgReady, setBgReady] = useState(false)

  useEffect(() => {
    const apply = (s: LiveState): void => {
      setMode(s.mode)
      setBgSrc(s.background ?? null)
      if (s.mode === 'lyrics') {
        setLayers((prev) =>
          prev.front === 0
            ? { front: 1, a: prev.a, b: s.line }
            : { front: 0, a: s.line, b: prev.b }
        )
      }
    }
    const off = window.wf.onState(apply)
    window.wf.getState().then(apply)
    return off
  }, [])

  // Reset ready-state when source changes so gradient shows while new video loads.
  useEffect(() => { setBgReady(false) }, [bgSrc])

  // On-screen FPS meter (smoothness measurement).
  useEffect(() => {
    let raf = 0
    let frames = 0
    let last = performance.now()
    const loop = (now: number): void => {
      frames++
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)))
        frames = 0
        last = now
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const black = mode === 'black'
  const logo = mode === 'logo'
  const bgVisibility = black ? 'hidden' : 'visible'
  const showVideo = bgSrc !== null && bgReady

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black" style={{ cursor: 'none' }}>
      {/* Animated gradient fallback — always present underneath the video */}
      <div
        className="wf-fallback absolute inset-0 transition-opacity duration-700"
        style={{ opacity: showVideo ? 0 : 1, visibility: bgVisibility }}
      />

      {/* Per-song background — video or image, fades in when ready */}
      {bgSrc && (
        isVideo(bgSrc) ? (
          <video
            key={bgSrc}
            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
            style={{ opacity: showVideo ? 1 : 0, visibility: bgVisibility }}
            src={toAssetUrl(bgSrc)}
            autoPlay
            loop
            muted
            playsInline
            onCanPlay={() => setBgReady(true)}
            onError={() => setBgReady(false)}
          />
        ) : (
          <img
            key={bgSrc}
            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
            style={{ opacity: showVideo ? 1 : 0, visibility: bgVisibility }}
            src={toAssetUrl(bgSrc)}
            onLoad={() => setBgReady(true)}
            onError={() => setBgReady(false)}
          />
        )
      )}

      {!black && !logo && (
        <>
          <LyricLayer text={layers.a} show={layers.front === 0} />
          <LyricLayer text={layers.b} show={layers.front === 1} />
        </>
      )}

      {logo && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ background: 'radial-gradient(circle at 50% 40%, #0b2350, #050a1a)' }}
        >
          <div className="text-[9vw] font-extrabold tracking-wide text-white">✝ SNOW HILL</div>
          <div className="mt-2 text-[2.2vw] uppercase tracking-[0.4em] text-blue-200">
            Worship Service
          </div>
        </div>
      )}

      <div className="absolute right-3 top-2 rounded bg-black/45 px-2 py-1 font-mono text-[13px] font-semibold text-emerald-400">
        {fps} fps
      </div>
      {id && (
        <div className="absolute left-3 top-2 rounded bg-black/45 px-2 py-1 font-mono text-[13px] font-semibold text-blue-200">
          OUT {id}
        </div>
      )}
    </div>
  )
}

function LyricLayer({ text, show }: { text: string; show: boolean }): JSX.Element {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center px-[8vw] py-[6vh] text-center transition-opacity duration-500"
      style={{ opacity: show ? 1 : 0 }}
    >
      <span
        className="text-[6vw] font-bold leading-tight text-white"
        style={{ textShadow: '0 3px 24px rgba(0,0,0,.85), 0 1px 3px rgba(0,0,0,.9)' }}
      >
        {text}
      </span>
    </div>
  )
}

export default Output
