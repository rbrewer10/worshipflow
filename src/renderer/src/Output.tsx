import { useEffect, useState } from 'react'
import type { LiveState, Mode, ThemeColors } from '../../shared/types'
import { getTheme, resolveColors, staticBackgroundCss, FONT_FAMILY } from '../../shared/themes'
import type { MotionEffect } from '../../shared/themes'
import { useChurchName } from './useChurchName'

function toAssetUrl(p: string): string {
  return 'wf-asset://?path=' + encodeURIComponent(p)
}

function isVideo(p: string): boolean {
  return /\.(mp4|webm|mov|avi|mkv)$/i.test(p)
}

// The live "render model" — everything needed to draw the audience screen. Built
// by useLiveModel() from the broadcast state and consumed by AudienceStage. Kept
// as one object so the fullscreen Output window and the embedded LiveMirror render
// from an identical source of truth and can never visually drift apart.
export interface AudienceModel {
  mode: Mode
  layers: { front: 0 | 1; a: string; b: string }
  bgSrc: string | null
  clockLine: string
  fontScale: number
  tickerText: string
  bgFit: 'cover' | 'contain'
  bgMotion: 'pan' | 'zoom' | 'shimmer' | null
  slideThemeId: string
  slideThemeColors: ThemeColors | null
  songTextColor: string | null
  songFont: string | null
  ccli: { author: string | null; copyright: string | null; ccli: string | null; license: string | null }
}

// Subscribes to the main-process live broadcast and returns the current render
// model. Any window that shows the audience content uses this.
export function useLiveModel(): AudienceModel {
  const [mode, setMode] = useState<Mode>('lyrics')
  const [layers, setLayers] = useState<{ front: 0 | 1; a: string; b: string }>({ front: 0, a: '', b: '' })
  const [bgSrc, setBgSrc] = useState<string | null>(null)
  const [clockLine, setClockLine] = useState('')
  const [fontScale, setFontScale] = useState(6)
  const [tickerText, setTickerText] = useState('')
  const [bgFit, setBgFit] = useState<'cover' | 'contain'>('cover')
  const [bgMotion, setBgMotion] = useState<'pan' | 'zoom' | 'shimmer' | null>(null)
  const [slideThemeId, setSlideThemeId] = useState<string>('sanctuary')
  const [slideThemeColors, setSlideThemeColors] = useState<ThemeColors | null>(null)
  const [songTextColor, setSongTextColor] = useState<string | null>(null)
  const [songFont, setSongFont] = useState<string | null>(null)
  const [ccli, setCcli] = useState<{
    author: string | null
    copyright: string | null
    ccli: string | null
    license: string | null
  }>({ author: null, copyright: null, ccli: null, license: null })

  useEffect(() => {
    const apply = (s: LiveState): void => {
      setMode(s.mode)
      setBgSrc(s.background ?? null)
      setBgFit(s.bgFit ?? 'cover')
      setBgMotion((s.bgMotion as 'pan' | 'zoom' | 'shimmer' | null) ?? null)
      setSlideThemeId(s.slideTheme ?? 'sanctuary')
      setSlideThemeColors(s.slideThemeColors ?? null)
      setSongTextColor(s.songTextColor ?? null)
      setSongFont(s.songFont ?? null)
      setFontScale(s.fontScale ?? 6)
      setCcli({
        author: s.songAuthor ?? null,
        copyright: s.songCopyright ?? null,
        ccli: s.songCcli ?? null,
        license: s.ccliLicense ?? null
      })
      if (s.mode === 'countdown') {
        setClockLine(s.line)
        setTickerText('')
      } else if (s.mode === 'lyrics') {
        setLayers((prev) =>
          prev.front === 0
            ? { front: 1, a: prev.a, b: s.line }
            : { front: 0, a: s.line, b: prev.b }
        )
        setTickerText('')
      } else if (s.songTitle?.includes('Announcement')) {
        // Ticker mode: show the line as scrolling text
        setTickerText(s.line || '')
      }
    }
    const off = window.wf.onState(apply)
    window.wf.getState().then(apply)
    return off
  }, [])

  return {
    mode, layers, bgSrc, clockLine, fontScale, tickerText, bgFit, bgMotion,
    slideThemeId, slideThemeColors, songTextColor, songFont, ccli
  }
}

// The audience picture itself — motion background + crossfading lyric layers, or
// logo / black / countdown / ticker. Sizes everything in container-query units
// (cqw/cqh) and declares itself a size container, so it renders identically whether
// it fills a whole output window or a small preview card. Holds no authority — the
// model tells it what to show.
export function AudienceStage({ model }: { model: AudienceModel }): JSX.Element {
  const {
    mode, layers, bgSrc, clockLine, fontScale, tickerText, bgFit, bgMotion,
    slideThemeId, slideThemeColors, songTextColor, songFont, ccli
  } = model
  const [bgReady, setBgReady] = useState(false)
  const [logoImg, setLogoImg] = useState<string | null>(null)
  const churchName = useChurchName()

  // Reset ready-state when source changes so gradient shows while new video loads.
  useEffect(() => { setBgReady(false) }, [bgSrc])
  useEffect(() => {
    window.wf.logoGet().then((l) => setLogoImg(l.logoPath ?? null)).catch(() => {})
  }, [])

  const black = mode === 'black'
  const logo = mode === 'logo'
  const countdown = mode === 'countdown'
  const bgVisibility = black ? 'hidden' : 'visible'
  const isThemeBg = bgSrc?.startsWith('theme:') ?? false
  const showVideo = bgSrc !== null && !isThemeBg && bgReady
  const resolvedThemeId = isThemeBg ? bgSrc!.slice(6) : slideThemeId
  const theme = getTheme(resolvedThemeId)
  const colors = resolveColors(theme, slideThemeColors)
  const posAlign = theme.position === 'top' ? 'flex-start' : theme.position === 'bottom' ? 'flex-end' : 'center'

  return (
    <div className="relative h-full w-full overflow-hidden bg-black" style={{ containerType: 'size' }}>
      {/* Theme background — shown when no per-item background is active and not black */}
      {!black && !showVideo && (
        theme.kind === 'static'
          ? <div className="absolute inset-0" style={{ background: staticBackgroundCss(theme, colors) }} />
          : <MotionBackground effect={theme.effect!} colors={colors} />
      )}

      {/* Per-song background — video or image, fades in when ready */}
      {bgSrc && !isThemeBg && (
        isVideo(bgSrc) ? (
          <video
            key={bgSrc}
            className="absolute inset-0 h-full w-full transition-opacity duration-700"
            style={{ opacity: showVideo ? 1 : 0, visibility: bgVisibility, objectFit: bgFit }}
            src={toAssetUrl(bgSrc)}
            autoPlay
            loop
            muted
            playsInline
            onCanPlay={() => setBgReady(true)}
            onError={() => setBgReady(false)}
          />
        ) : (
          <div
            key={bgSrc}
            className={[
              'absolute inset-0 transition-opacity duration-700',
              bgMotion === 'pan' ? 'wf-kb-pan' : '',
              bgMotion === 'zoom' ? 'wf-kb-zoom' : '',
              bgMotion === 'shimmer' ? 'wf-kb-shimmer-overlay' : '',
            ].join(' ').trim()}
            style={{
              opacity: showVideo ? 1 : 0,
              visibility: bgVisibility,
              backgroundImage: `url(${toAssetUrl(bgSrc)})`,
              backgroundSize: bgFit === 'contain' ? 'contain' : 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
            onLoad={() => setBgReady(true)}
            ref={(el) => {
              if (el) {
                const img = new Image()
                img.onload = () => setBgReady(true)
                img.onerror = () => setBgReady(false)
                img.src = toAssetUrl(bgSrc)
              }
            }}
          />
        )
      )}

      {!black && !logo && !countdown && (
        <>
          <LyricLayer text={layers.a} show={layers.front === 0} fontScale={fontScale}
            fontFamily={FONT_FAMILY[(songFont as keyof typeof FONT_FAMILY) ?? theme.font]} color={songTextColor ?? colors.text} align={posAlign} />
          <LyricLayer text={layers.b} show={layers.front === 1} fontScale={fontScale}
            fontFamily={FONT_FAMILY[(songFont as keyof typeof FONT_FAMILY) ?? theme.font]} color={songTextColor ?? colors.text} align={posAlign} />
        </>
      )}

      {/* CCLI copyright footer — shown on song slides when copyright info exists */}
      {!black && !logo && !countdown && (ccli.author || ccli.copyright || ccli.ccli) && (
        <div className="absolute bottom-0 left-0 right-0 px-[3cqw] pb-[1.5cqh] text-center">
          <div
            className="mx-auto text-[1.1cqw] font-medium leading-snug text-white/75"
            style={{ textShadow: '0 2px 6px rgba(0,0,0,.95)' }}
          >
            {[
              ccli.author,
              ccli.copyright,
              ccli.ccli ? `CCLI Song #${ccli.ccli}` : null,
              ccli.license ? `CCLI License #${ccli.license}` : null
            ]
              .filter(Boolean)
              .join('  ·  ')}
          </div>
        </div>
      )}

      {countdown && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="mb-[1.5cqh] text-[2.5cqw] font-semibold uppercase tracking-[0.35em] text-blue-200">
            Service begins in
          </div>
          <div
            className="font-mono text-[20cqw] font-black leading-none tabular-nums text-white"
            style={{ textShadow: '0 4px 40px rgba(0,0,0,.9)' }}
          >
            {clockLine}
          </div>
        </div>
      )}

      {tickerText && !black && !logo && !countdown && (
        <div className="absolute bottom-0 left-0 right-0 overflow-hidden border-t-4 border-amber-500 bg-gradient-to-r from-amber-900/85 via-amber-800/85 to-amber-900/85">
          <div
            className="wf-ticker-track py-[1cqh] text-[1.6cqw] font-bold text-amber-100"
            style={{ animationDuration: `${Math.max(12, tickerText.length * 0.35)}s` }}
          >
            {/* Two identical copies → seamless loop at translateX(-50%). */}
            <span className="px-[3cqw]">{tickerText}</span>
            <span className="px-[3cqw]">{tickerText}</span>
          </div>
        </div>
      )}

      {logo && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ background: 'radial-gradient(circle at 50% 40%, #0b2350, #050a1a)' }}
        >
          {logoImg ? (
            <img
              src={toAssetUrl(logoImg)}
              className="max-h-[55cqh] max-w-[60cqw] object-contain"
              style={{ filter: 'drop-shadow(0 0 6cqw rgba(0,0,0,0.6))' }}
            />
          ) : (
            <>
              <div className="text-[9cqw] font-extrabold tracking-wide text-white">✝ {churchName}</div>
              <div className="mt-[0.5cqh] text-[2.2cqw] uppercase tracking-[0.4em] text-blue-200">
                Worship Service
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// A "dumb" fullscreen output window. Subscribes to broadcast state and renders it,
// plus operator-only diagnostics badges (FPS meter + output id).
function Output(): JSX.Element {
  const id = new URLSearchParams(window.location.search).get('id')
  const model = useLiveModel()
  const [fps, setFps] = useState(0)

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

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black" style={{ cursor: 'none' }}>
      <AudienceStage model={model} />

      <div className="absolute right-3 top-2 rounded bg-black/45 px-2 py-1 font-mono text-[13px] font-semibold text-blue-400">
        {fps} fps
      </div>
      {id && (
        <div className="absolute left-3 top-2 rounded bg-black/45 px-2 py-1 font-mono text-[13px] font-semibold text-blue-400">
          OUT {id}
        </div>
      )}
    </div>
  )
}

// A live, scaled-down mirror of the audience screen for embedding in operator UI
// (e.g. Volunteer sound-check mode). Shares AudienceStage — so it shows exactly
// what the congregation sees — sized to whatever container it's placed in. Give it
// a parent with a definite size (e.g. `aspect-[16/9] w-full`).
export function LiveMirror(): JSX.Element {
  const model = useLiveModel()
  return <AudienceStage model={model} />
}

function LyricLayer({ text, show, fontScale, fontFamily, color, align }: {
  text: string; show: boolean; fontScale: number; fontFamily: string; color: string; align: string
}): JSX.Element {
  return (
    <div
      className="absolute inset-0 flex justify-center px-[8cqw] py-[6cqh] text-center transition-opacity duration-500"
      style={{ opacity: show ? 1 : 0, alignItems: align }}
    >
      <span
        className="font-bold leading-tight"
        style={{
          fontSize: `${fontScale}cqw`,
          fontFamily,
          color,
          textShadow: '0 3px 24px rgba(0,0,0,.85), 0 1px 3px rgba(0,0,0,.9)',
          whiteSpace: 'pre-line'
        }}
      >
        {text}
      </span>
    </div>
  )
}

// Code-generated animated theme backgrounds (no video files).
function MotionBackground({ effect, colors }: {
  effect: MotionEffect
  colors: { primary: string; secondary: string }
}): JSX.Element {
  if (effect === 'aurora') {
    return <div className="absolute inset-0" style={{
      background: `linear-gradient(120deg, ${colors.primary}, ${colors.secondary}, ${colors.primary})`,
      backgroundSize: '320% 320%', animation: 'themeAurora 9s ease infinite' }} />
  }
  if (effect === 'drift') {
    return <div className="absolute inset-0" style={{
      background: `radial-gradient(circle at 30% 30%, ${colors.primary}, ${colors.secondary})`,
      backgroundSize: '200% 200%', animation: 'themeDrift 12s ease-in-out infinite' }} />
  }
  if (effect === 'rays') {
    return (
      <div className="absolute inset-0 overflow-hidden" style={{ background: colors.primary }}>
        <div className="absolute inset-y-0" style={{ width: '6cqw', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent)', animation: 'themeRay 6s linear infinite' }} />
        <div className="absolute inset-y-0" style={{ width: '3.5cqw', left: '20cqw', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.14), transparent)', animation: 'themeRay 8s linear infinite' }} />
      </div>
    )
  }
  if (effect === 'fire') {
    return <div className="absolute inset-0" style={{
      background: `radial-gradient(ellipse at 50% 120%, ${colors.secondary} 0%, ${colors.primary} 60%)`,
      backgroundSize: '150% 200%', animation: 'themeFire 4s ease-in-out infinite' }} />
  }
  if (effect === 'starfield') {
    return (
      <div className="absolute inset-0 overflow-hidden" style={{ background: colors.primary }}>
        <div className="absolute" style={{ inset: '-33% 0 0', height: '166%',
          backgroundImage: `radial-gradient(circle, ${colors.secondary} 1px, transparent 1px)`,
          backgroundSize: '80px 80px', animation: 'themeStarfield 8s linear infinite' }} />
        <div className="absolute" style={{ inset: '-33% 0 0', height: '166%',
          backgroundImage: `radial-gradient(circle, ${colors.secondary}99 1px, transparent 1px)`,
          backgroundSize: '40px 40px', animation: 'themeStarfield 14s linear infinite' }} />
      </div>
    )
  }
  if (effect === 'waterfall') {
    return <div className="absolute inset-0" style={{
      background: `repeating-linear-gradient(180deg, ${colors.primary} 0px, ${colors.secondary}55 40px, ${colors.primary} 80px)`,
      backgroundSize: '100% 200px', animation: 'themeWaterfall 3s linear infinite' }} />
  }
  if (effect === 'embers') {
    return (
      <div className="absolute inset-0 overflow-hidden" style={{ background: colors.primary }}>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="absolute rounded-full" style={{
            width: `${4 + (i % 5)}px`, height: `${4 + (i % 5)}px`,
            background: colors.secondary, bottom: `${(i * 7) % 50}%`, left: `${(i * 17 + 5) % 90}%`,
            '--dx': `${((i % 5) - 2) * 20}px`,
            opacity: 0.8, filter: 'blur(1px)',
            animation: `themeEmber ${3 + (i % 4)}s ${i * 0.4}s ease-out infinite`
          } as React.CSSProperties} />
        ))}
      </div>
    )
  }
  if (effect === 'shimmer') {
    return (
      <div className="absolute inset-0 overflow-hidden" style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary}44, ${colors.primary})` }}>
        <div className="absolute inset-y-0" style={{ width: '30%', background: `linear-gradient(90deg, transparent, ${colors.secondary}55, transparent)`, animation: 'themeShimmer 4s linear infinite' }} />
      </div>
    )
  }
  if (effect === 'cosmic') {
    return <div className="absolute inset-0" style={{
      background: `radial-gradient(ellipse at 50% 50%, ${colors.secondary}88 0%, ${colors.primary} 60%)`,
      backgroundSize: '200% 200%', animation: 'themeCosmic 8s ease-in-out infinite' }} />
  }
  if (effect === 'cross-glow') {
    return (
      <div className="absolute inset-0" style={{ background: colors.primary }}>
        <div className="absolute" style={{ top: '45%', left: '30%', right: '30%', height: '8%',
          background: `radial-gradient(ellipse, ${colors.secondary}cc, transparent)`,
          animation: 'themeCrossGlow 3s ease-in-out infinite' }} />
        <div className="absolute" style={{ left: '47%', top: '25%', bottom: '25%', width: '4%',
          background: `radial-gradient(ellipse, ${colors.secondary}cc, transparent)`,
          animation: 'themeCrossGlow 3s ease-in-out infinite' }} />
      </div>
    )
  }
  if (effect === 'mist') {
    return (
      <div className="absolute inset-0 overflow-hidden" style={{ background: colors.primary }}>
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 40%, ${colors.secondary}33 100%)`, animation: 'themeMist 8s ease-in-out infinite' }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${colors.secondary}22, transparent 60%)`, animation: 'themeMist 12s ease-in-out infinite reverse' }} />
      </div>
    )
  }
  if (effect === 'neon') {
    return (
      <div className="absolute inset-0 overflow-hidden" style={{ background: colors.primary }}>
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 50%, ${colors.secondary}33 0%, transparent 70%)`, animation: 'themeNeon 2s ease-in-out infinite' }} />
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 20% 80%, ${colors.secondary}22 0%, transparent 50%)`, animation: 'themeNeon 3s ease-in-out infinite 1s' }} />
      </div>
    )
  }
  if (effect === 'sunrise') {
    return <div className="absolute inset-0" style={{
      background: `radial-gradient(ellipse at 50% 130%, ${colors.secondary} 0%, ${colors.primary} 55%)`,
      backgroundSize: '100% 200%', animation: 'themeSunrise 10s ease-in-out infinite' }} />
  }
  // bokeh (default fallback)
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: colors.primary }}>
      <div className="tb-blob" style={{ width: '16cqw', height: '16cqw', background: colors.secondary, top: '12%', left: '14%', animation: 'themeFloatA 7s ease-in-out infinite' }} />
      <div className="tb-blob" style={{ width: '12cqw', height: '12cqw', background: colors.secondary, bottom: '14%', right: '18%', animation: 'themeFloatB 8s ease-in-out infinite' }} />
      <div className="tb-blob" style={{ width: '9cqw', height: '9cqw', background: colors.secondary, top: '40%', right: '40%', animation: 'themeFloatA 6s ease-in-out infinite' }} />
    </div>
  )
}

export default Output
