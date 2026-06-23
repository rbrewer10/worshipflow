import { useEffect, useRef, useState } from 'react'
import type { Intent, LiveState, ServiceFull, ServiceItem, ServiceSummary } from '../../shared/types'

const ICON: Record<ServiceItem['type'], string> = {
  song: '🎵',
  scripture: '📖',
  text: '📝',
  countdown: '⏱',
  image: '🖼',
  welcome: '👋',
  ticker: '📰'
}

function canGoLive(item: ServiceItem): boolean {
  return (
    (item.type === 'song' && item.ref_id != null) ||
    (item.type === 'scripture' && !!(item.payload.reference as string)) ||
    (item.type === 'text' && !!(item.payload.title as string || item.payload.body as string)) ||
    (item.type === 'countdown' && (item.payload.seconds as number) > 0) ||
    (item.type === 'image' && !!(item.payload.path as string)) ||
    (item.type === 'welcome' && (item.payload.seconds as number) > 0) ||
    (item.type === 'ticker' && !!(item.payload.text as string))
  )
}

async function loadItem(item: ServiceItem): Promise<void> {
  if (item.type === 'song' && item.ref_id != null) {
    await window.wf.liveLoadSong(item.ref_id)
  } else if (item.type === 'scripture') {
    const ref = item.payload.reference as string
    if (!ref) return
    await window.wf.liveLoadScripture(ref)
  } else if (item.type === 'text') {
    await window.wf.liveLoadText(
      (item.payload.title as string) ?? '',
      (item.payload.body as string) ?? '',
      (item.payload.background as string) ?? null
    )
  } else if (item.type === 'countdown') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return
    await window.wf.liveLoadCountdown(secs)
  } else if (item.type === 'image') {
    const p = item.payload.path as string
    if (!p) return
    await window.wf.liveLoadMedia(p, item.title)
  } else if (item.type === 'welcome') {
    await window.wf.liveLoadCountdown((item.payload.seconds as number) ?? 300)
  } else if (item.type === 'ticker') {
    const txt = item.payload.text as string
    if (!txt) return
    await window.wf.liveLoadText('Announcement', txt)
  } else {
    return
  }
  window.wf.liveSetItemId(item.id)
}

// Simplified, touch-friendly operator surface for volunteers.
// PREV / NEXT take up most of the screen; BLACK / LOGO are at the top.
// The keyboard shortcuts (Space = next, ← = prev, B/L) also work.
function VolunteerView(): JSX.Element {
  const [live, setLive] = useState<LiveState | null>(null)
  const [services, setServices] = useState<ServiceSummary[]>([])
  const [activeServiceId, setActiveServiceId] = useState<number | null>(null)
  const [service, setService] = useState<ServiceFull | null>(null)

  // Shared across all views via main-process broadcast.
  const liveItemId = live?.liveServiceItemId ?? null

  const liveRef = useRef<LiveState | null>(null)
  const serviceRef = useRef<ServiceFull | null>(null)
  const liveItemIdRef = useRef<number | null>(null)
  useEffect(() => { liveRef.current = live }, [live])
  useEffect(() => { serviceRef.current = service }, [service])
  useEffect(() => { liveItemIdRef.current = liveItemId }, [liveItemId])

  useEffect(() => {
    const off = window.wf.onState(setLive)
    window.wf.getState().then(setLive)
    window.wf.servicesList().then((list) => {
      setServices(list)
      if (list.length > 0) {
        setActiveServiceId(list[0].id)
        window.wf.serviceGet(list[0].id).then(setService)
      }
    })
    return off
  }, [])

  const pickService = (id: number): void => {
    setActiveServiceId(id)
    window.wf.serviceGet(id).then(setService)
  }

  const send = (type: Intent): void => window.wf.sendIntent(type)

  // Advance to next item when at the last slide of the current one.
  const goNext = (): void => {
    const cur = liveRef.current
    const isAtEnd = cur?.mode === 'lyrics' && cur.total > 0 && cur.index >= cur.total - 1
    if (isAtEnd && serviceRef.current && liveItemIdRef.current != null) {
      const items = serviceRef.current.items
      const idx = items.findIndex((it) => it.id === liveItemIdRef.current)
      const next = idx >= 0 ? items.slice(idx + 1).find(canGoLive) : undefined
      if (next) { loadItem(next); return }
    }
    send('next')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const k = e.key.toLowerCase()
      if (e.code === 'Space' || e.code === 'ArrowRight') { e.preventDefault(); goNext() }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); send('prev') }
      else if (k === 'b') send('black')
      else if (k === 'l') send('logo')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const mode = live?.mode ?? 'lyrics'
  const isBlack = mode === 'black'
  const isLogo = mode === 'logo'
  const isCountdown = mode === 'countdown'

  return (
    <div className="flex h-full select-none flex-col bg-[#080c14]">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-black/30 px-4 py-2">
        <TopBtn active={isBlack} onClick={() => send('black')} className={isBlack ? 'bg-slate-700 ring-1 ring-white/20' : ''}>
          ■ Black
        </TopBtn>
        <TopBtn active={isLogo} onClick={() => send('logo')} className={isLogo ? 'bg-blue-700' : ''}>
          ✝ Logo
        </TopBtn>
        <TopBtn active={!isBlack && !isLogo} onClick={() => send('lyrics')}>
          Lyrics
        </TopBtn>
        <div className="mx-2 h-5 w-px bg-white/10" />
        <select
          value={activeServiceId ?? ''}
          onChange={(e) => e.target.value && pickService(Number(e.target.value))}
          className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
        >
          {services.length === 0 && <option value="">No services</option>}
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <div className="ml-auto text-xs text-slate-500">Space / → next · ← prev · B black · L logo</div>
      </div>

      {/* ── Main: PREV | content | NEXT ── */}
      <div className="flex min-h-0 flex-1 items-stretch">
        {/* PREV */}
        <button
          onClick={() => send('prev')}
          className="flex w-44 shrink-0 flex-col items-center justify-center gap-3 border-r border-white/10 text-slate-500 transition-all hover:bg-white/[0.06] hover:text-white active:bg-white/10"
        >
          <span className="text-6xl leading-none">◀</span>
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Prev</span>
        </button>

        {/* Slide content */}
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-5 px-10 text-center">
          {isCountdown ? (
            <>
              <div className="text-base font-semibold uppercase tracking-[0.35em] text-blue-300">
                Service begins in
              </div>
              <div className="font-mono text-9xl font-black tabular-nums text-white">
                {live?.line ?? ''}
              </div>
            </>
          ) : isBlack ? (
            <div className="text-2xl font-semibold text-slate-700">Screen is black</div>
          ) : isLogo ? (
            <div className="text-3xl font-bold text-blue-300">✝ SNOW HILL — Logo screen</div>
          ) : (
            <>
              <div className="text-5xl font-bold leading-snug text-white" style={{ whiteSpace: 'pre-line' }}>
                {live?.line || <span className="italic text-slate-700">Nothing loaded</span>}
              </div>
              {live && live.total > 0 && (
                <div className="text-sm text-slate-500">
                  Slide {live.index + 1} of {live.total}
                  {live.songTitle ? <> · <span className="text-slate-400">{live.songTitle}</span></> : null}
                </div>
              )}
              {live?.next && (
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2 text-sm text-slate-600">
                  Next: {live.next}
                </div>
              )}
            </>
          )}
        </div>

        {/* NEXT */}
        <button
          onClick={goNext}
          className="flex w-44 shrink-0 flex-col items-center justify-center gap-3 border-l border-white/10 bg-emerald-950/30 text-emerald-600 transition-all hover:bg-emerald-900/30 hover:text-emerald-400 active:bg-emerald-800/30"
        >
          <span className="text-6xl leading-none">▶</span>
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-500">Next</span>
        </button>
      </div>

      {/* ── Bottom: service item strip ── */}
      {service && service.items.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto border-t border-white/10 bg-black/20 px-3 py-2">
          <span className="shrink-0 text-xs text-slate-600">Jump:</span>
          {service.items.map((item, i) => (
            <button
              key={item.id}
              onClick={() => canGoLive(item) && loadItem(item)}
              disabled={!canGoLive(item)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                liveItemId === item.id
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                  : canGoLive(item)
                  ? 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.09]'
                  : 'cursor-default border-transparent bg-transparent text-slate-700'
              }`}
            >
              <span className="font-mono text-[10px] text-slate-600">{i + 1}</span>
              <span>{ICON[item.type]}</span>
              <span className="max-w-[110px] truncate">{item.title}</span>
              {liveItemId === item.id && (
                <span className="text-[9px] font-bold text-emerald-400">LIVE</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TopBtn({
  children,
  onClick,
  active,
  className = ''
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
  className?: string
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
        active ? '' : 'bg-white/[0.06] text-slate-300 hover:bg-white/[0.12] hover:text-white'
      } ${className}`}
    >
      {children}
    </button>
  )
}

export default VolunteerView
