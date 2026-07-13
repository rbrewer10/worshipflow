import { useEffect, useRef, useState } from 'react'
import { useChurchName } from './useChurchName'
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Church,
  FileText,
  Hand,
  Image as ImageIcon,
  Mic,
  Music,
  Newspaper,
  Square,
  Timer,
  X
} from 'lucide-react'
import type { Intent, LiveState, ServiceFull, ServiceItem, ServiceSummary } from '../../shared/types'

const ICON: Record<ServiceItem['type'], JSX.Element> = {
  song: <Music size={14} />,
  scripture: <BookOpen size={14} />,
  text: <FileText size={14} />,
  countdown: <Timer size={14} />,
  image: <ImageIcon size={14} />,
  welcome: <Hand size={14} />,
  ticker: <Newspaper size={14} />,
  announcement: <Newspaper size={14} />,
  sermon: <Mic size={14} />
}

function canGoLive(item: ServiceItem): boolean {
  return (
    (item.type === 'song' && item.ref_id != null) ||
    (item.type === 'scripture' && !!(item.payload.reference as string)) ||
    (item.type === 'text' && !!(item.payload.title as string || item.payload.body as string)) ||
    (item.type === 'countdown' && (item.payload.seconds as number) > 0) ||
    (item.type === 'image' && !!(item.payload.path as string)) ||
    (item.type === 'welcome' && (item.payload.seconds as number) > 0) ||
    (item.type === 'ticker' && !!(item.payload.text as string)) ||
    (item.type === 'announcement' && item.ref_id != null) ||
    (item.type === 'sermon')
  )
}

async function loadItem(item: ServiceItem): Promise<void> {
  if (item.type === 'song' && item.ref_id != null) {
    await window.wf.liveLoadSong(item.ref_id)
  } else if (item.type === 'scripture') {
    const ref = item.payload.reference as string
    if (!ref) return
    const ok = await window.wf.liveLoadScripture(ref)
    if (!ok) return
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
  } else if (item.type === 'announcement' && item.ref_id != null) {
    await window.wf.liveLoadAnnouncement(item.ref_id)
  } else if (item.type === 'sermon') {
    window.wf.sendIntent('logo')
  } else {
    return
  }
  window.wf.liveSetItemId(item.id)
}

// Simplified, touch-friendly operator surface for volunteers.
// PREV / NEXT take up most of the screen; BLACK / LOGO are at the top.
// The keyboard shortcuts (Space = next, ← = prev, B/L) also work.
function VolunteerView({ onExit }: { onExit?: () => void }): JSX.Element {
  const [live, setLive] = useState<LiveState | null>(null)
  const [services, setServices] = useState<ServiceSummary[]>([])
  const [activeServiceId, setActiveServiceId] = useState<number | null>(null)
  const [service, setService] = useState<ServiceFull | null>(null)

  // Shared across all views via main-process broadcast.
  const liveItemId = live?.liveServiceItemId ?? null

  const liveRef = useRef<LiveState | null>(null)
  const serviceRef = useRef<ServiceFull | null>(null)
  const liveItemIdRef = useRef<number | null>(null)
  const churchName = useChurchName()
  useEffect(() => { liveRef.current = live }, [live])
  useEffect(() => { serviceRef.current = service }, [service])
  useEffect(() => { liveItemIdRef.current = liveItemId }, [liveItemId])

  useEffect(() => {
    const off = window.wf.onState(setLive)
    window.wf.getState().then(setLive)
    window.wf.servicesList().then(async (list) => {
      setServices(list)
      if (list.length === 0) return
      // Honor the service the operator prepared (the shared active service) rather
      // than blindly defaulting to the first/most-recent one.
      const activeId = await window.wf.getActiveServiceId()
      const chosen = activeId != null && list.some((s) => s.id === activeId) ? activeId : list[0].id
      setActiveServiceId(chosen)
      window.wf.setActiveService(chosen)
      window.wf.serviceGet(chosen).then(setService)
    })
    return off
  }, [])

  const pickService = (id: number): void => {
    setActiveServiceId(id)
    window.wf.setActiveService(id)  // keep projector/zones/tablet in sync with the volunteer's choice
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
    <div className="flex h-full select-none flex-col bg-[#e9ecf1]">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-[#f4f6f9] px-4 py-2">
        <TopBtn active={isBlack} onClick={() => send('black')} className={isBlack ? 'bg-slate-700 text-white ring-1 ring-slate-900/10' : ''}>
          <Square size={16} /> Black
        </TopBtn>
        <TopBtn active={isLogo} onClick={() => send('logo')} className={isLogo ? 'bg-blue-600 text-white' : ''}>
          <Church size={16} /> Logo
        </TopBtn>
        <TopBtn active={!isBlack && !isLogo} onClick={() => send('lyrics')}>
          Lyrics
        </TopBtn>
        <div className="mx-2 h-5 w-px bg-slate-200" />
        <select
          value={activeServiceId ?? ''}
          onChange={(e) => e.target.value && pickService(Number(e.target.value))}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-500"
        >
          {services.length === 0 && <option value="">No services</option>}
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-500">Space / → next · ← prev · B black · L logo</span>
          {onExit && (
            <button onClick={onExit} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              <X size={13} /> Exit
            </button>
          )}
        </div>
      </div>

      {/* ── Main: PREV | content | NEXT ── */}
      <div className="flex min-h-0 flex-1 items-stretch">
        {/* PREV */}
        <button
          onClick={() => send('prev')}
          className="flex w-44 shrink-0 flex-col items-center justify-center gap-3 border-r border-slate-200 bg-[#f4f6f9] text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200"
        >
          <ChevronLeft size={64} strokeWidth={2.5} />
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Prev</span>
        </button>

        {/* Slide content */}
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-5 px-10 text-center">
          {isCountdown ? (
            <>
              <div className="text-base font-semibold uppercase tracking-[0.35em] text-blue-700">
                Service begins in
              </div>
              <div className="font-mono text-9xl font-black tabular-nums text-slate-900">
                {live?.line ?? ''}
              </div>
            </>
          ) : isBlack ? (
            <div className="text-2xl font-semibold text-slate-500">Screen is black</div>
          ) : isLogo ? (
            <div className="inline-flex items-center gap-2.5 text-3xl font-bold text-blue-700"><Church size={30} /> {churchName} — Logo screen</div>
          ) : (
            <>
              <div className="text-5xl font-bold leading-snug text-slate-900" style={{ whiteSpace: 'pre-line' }}>
                {live?.line || <span className="italic text-slate-400">Nothing loaded</span>}
              </div>
              {live && live.total > 0 && (
                <div className="text-sm text-slate-500">
                  Slide {live.index + 1} of {live.total}
                  {live.songTitle ? <> · <span className="text-slate-600">{live.songTitle}</span></> : null}
                </div>
              )}
              {live?.next && (
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
                  Next: {live.next}
                </div>
              )}
            </>
          )}
        </div>

        {/* NEXT */}
        <button
          onClick={goNext}
          className="flex w-44 shrink-0 flex-col items-center justify-center gap-3 border-l border-slate-200 bg-blue-500/10 text-blue-700 transition-all hover:bg-blue-500/15 hover:text-blue-800 active:bg-blue-500/20"
        >
          <ChevronRight size={64} strokeWidth={2.5} />
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">Next</span>
        </button>
      </div>

      {/* ── Bottom: service item strip ── */}
      {service && service.items.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto border-t border-slate-200 bg-[#f4f6f9] px-3 py-2">
          <span className="shrink-0 text-xs text-slate-500">Jump:</span>
          {service.items.map((item, i) => (
            <button
              key={item.id}
              onClick={() => canGoLive(item) && loadItem(item)}
              disabled={!canGoLive(item)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                liveItemId === item.id
                  ? 'border-blue-500/40 bg-blue-500/15 text-blue-700'
                  : canGoLive(item)
                  ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  : 'cursor-default border-transparent bg-transparent text-slate-400'
              }`}
            >
              <span className="font-mono text-[10px] text-slate-500">{i + 1}</span>
              <span>{ICON[item.type]}</span>
              <span className="max-w-[110px] truncate">{item.title}</span>
              {liveItemId === item.id && (
                <span className="text-[9px] font-bold text-blue-700">LIVE</span>
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
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
        active ? '' : 'bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900'
      } ${className}`}
    >
      {children}
    </button>
  )
}

export default VolunteerView
