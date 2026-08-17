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
  Minus,
  Music,
  Newspaper,
  HelpCircle,
  Square,
  Timer,
  Video,
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
  sermon: <Mic size={14} />,
  livecall: <Video size={14} />,
  header: <Minus size={14} />,
  placeholder: <HelpCircle size={14} />
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
    // A block carries its announcements in payload.refIds and may have no
    // ref_id at all, so requiring one would make it un-airable. Mirrors the
    // liveActions.ts fix — this file keeps its own copy of canGoLive/loadItem
    // for the simplified Volunteer surface, so the fix has to land here too.
    (item.type === 'announcement' &&
      (item.ref_id != null || ((item.payload.refIds as number[] | undefined)?.length ?? 0) > 0)) ||
    (item.type === 'sermon') ||
    // Nothing to configure — the call either connects or it doesn't.
    (item.type === 'livecall')
  )
}

async function loadItem(item: ServiceItem): Promise<void> {
  if (item.type === 'song' && item.ref_id != null) {
    await window.wf.liveLoadSong('main', item.ref_id)
  } else if (item.type === 'scripture') {
    const ref = item.payload.reference as string
    if (!ref) return
    const ok = await window.wf.liveLoadScripture('main', ref, item.payload.background as string | null | undefined, item.payload.blurBehindText as boolean | undefined)
    if (!ok) return
  } else if (item.type === 'text') {
    await window.wf.liveLoadText(
      'main',
      (item.payload.title as string) ?? '',
      (item.payload.body as string) ?? '',
      (item.payload.background as string) ?? null,
      item.payload.fontScale as number | undefined,
      item.payload.blurBehindText as boolean | undefined
    )
  } else if (item.type === 'countdown') {
    const secs = item.payload.seconds as number
    if (secs <= 0) return
    await window.wf.liveLoadCountdown('main', secs, item.payload.background as string | null | undefined, item.payload.blurBehindText as boolean | undefined)
  } else if (item.type === 'image') {
    const p = item.payload.path as string
    if (!p) return
    await window.wf.liveLoadMedia('main', p, item.title)
  } else if (item.type === 'welcome') {
    await window.wf.liveLoadCountdown('main', (item.payload.seconds as number) ?? 300, item.payload.background as string | null | undefined, item.payload.blurBehindText as boolean | undefined)
  } else if (item.type === 'ticker') {
    const txt = item.payload.text as string
    if (!txt) return
    await window.wf.liveLoadText('main', 'Announcement', txt)
  } else if (item.type === 'announcement') {
    // itemId is required for a refIds-only block — the main process looks its
    // announcement list up by item id when there's no single ref_id to load.
    // Omitting it here meant canGoLive could say yes while this silently did
    // nothing for a block with no ref_id.
    await window.wf.liveLoadAnnouncement('main', item.ref_id, item.id)
  } else if (item.type === 'sermon') {
    await window.wf.liveLoadSermon(
      'main',
      (item.payload.title as string) ?? '',
      (item.payload.speaker as string) ?? '',
      (item.payload.passage as string) ?? '',
      item.payload.background as string | null | undefined,
      item.payload.blurBehindText as boolean | undefined
    )
  } else if (item.type === 'livecall') {
    await window.wf.liveLoadLiveCall('main', item.title)
  } else {
    return
  }
  window.wf.liveSetItemId('main', item.id)
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
    const off = window.wf.onState((s) => setLive(s.main))
    window.wf.getState('main').then(setLive)
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

  const send = (type: Intent): void => window.wf.sendIntent('main', type)

  // Advance to next item when at the last slide of the current one.
  const goNext = (): void => {
    const cur = liveRef.current
    const isAtEnd = cur?.mode === 'lyrics' && cur.total > 0 && cur.index >= cur.total - 1
    if (isAtEnd && serviceRef.current && liveItemIdRef.current != null) {
      // Volunteer mode is Main-only — filter out Second-track items so
      // auto-advance-to-next-item can't cross tracks or land on an id
      // loadItem's hardcoded 'main' calls can't correctly resolve.
      const items = serviceRef.current.items.filter((it) => it.track === 'main')
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
    <div className="flex h-full select-none flex-col bg-app">
      {/* No visible title by design (this screen is all big touch controls) —
          an sr-only heading still gives screen-reader heading-navigation
          something to land on. */}
      <h1 className="sr-only">Volunteer Mode</h1>
      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 border-b border-border bg-panel px-4 py-2">
        <TopBtn active={isBlack} onClick={() => send('black')} className={isBlack ? 'bg-border-strong text-white ring-1 ring-white/10' : ''}>
          <Square size={16} /> Black
        </TopBtn>
        <TopBtn active={isLogo} onClick={() => send('logo')} className={isLogo ? 'bg-blue-600 text-white' : ''}>
          <Church size={16} /> Logo
        </TopBtn>
        <TopBtn active={!isBlack && !isLogo} onClick={() => send('lyrics')}>
          Lyrics
        </TopBtn>
        <div className="mx-2 h-5 w-px bg-border" />
        <select
          value={activeServiceId ?? ''}
          onChange={(e) => e.target.value && pickService(Number(e.target.value))}
          className="rounded-lg border border-border bg-panel-raised px-2 py-1.5 text-sm text-content-primary outline-none focus:border-blue-500"
        >
          {services.length === 0 && <option value="">No services</option>}
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-content-secondary">Space / → next · ← prev · B black · L logo</span>
          {onExit && (
            <button onClick={onExit} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-panel-raised px-3 py-1.5 text-xs font-semibold text-content-secondary hover:bg-border-strong hover:text-content-primary">
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
          className="flex w-44 shrink-0 flex-col items-center justify-center gap-3 border-r border-border bg-panel text-content-secondary transition-all hover:bg-panel-raised hover:text-content-primary active:bg-border-strong"
        >
          <ChevronLeft size={64} strokeWidth={2.5} />
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-content-secondary">Prev</span>
        </button>

        {/* Slide content */}
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-5 px-10 text-center">
          {isCountdown ? (
            <>
              <div className="text-base font-semibold uppercase tracking-[0.35em] text-blue-400">
                Service begins in
              </div>
              <div className="font-mono text-9xl font-black tabular-nums text-content-primary">
                {live?.line ?? ''}
              </div>
            </>
          ) : isBlack ? (
            <div className="text-2xl font-semibold text-content-secondary">Screen is black</div>
          ) : isLogo ? (
            <div className="inline-flex items-center gap-2.5 text-3xl font-bold text-blue-400"><Church size={30} /> {churchName} — Logo screen</div>
          ) : (
            <>
              <div className="text-5xl font-bold leading-snug text-content-primary" style={{ whiteSpace: 'pre-line' }}>
                {live?.line || <span className="italic text-content-tertiary">Nothing loaded</span>}
              </div>
              {live && live.total > 0 && (
                <div className="text-sm text-content-secondary">
                  Slide {live.index + 1} of {live.total}
                  {live.songTitle ? <> · <span className="text-content-secondary">{live.songTitle}</span></> : null}
                </div>
              )}
              {live?.next && (
                <div className="rounded-lg border border-border bg-panel px-4 py-2 text-sm text-content-secondary">
                  Next: {live.next}
                </div>
              )}
            </>
          )}
        </div>

        {/* NEXT */}
        <button
          onClick={goNext}
          className="flex w-44 shrink-0 flex-col items-center justify-center gap-3 border-l border-border bg-blue-500/10 text-blue-400 transition-all hover:bg-blue-500/15 hover:text-blue-300 active:bg-blue-500/20"
        >
          <ChevronRight size={64} strokeWidth={2.5} />
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400">Next</span>
        </button>
      </div>

      {/* ── Bottom: service item strip (Main-only — see goNext's filter) ── */}
      {service && service.items.some((it) => it.track === 'main') && (
        <div className="flex items-center gap-2 overflow-x-auto border-t border-border bg-panel px-3 py-2">
          <span className="shrink-0 text-xs text-content-secondary">Jump:</span>
          {service.items.filter((it) => it.track === 'main').map((item, i) => (
            <button
              key={item.id}
              onClick={() => canGoLive(item) && loadItem(item)}
              disabled={!canGoLive(item)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                liveItemId === item.id
                  ? 'border-blue-500/40 bg-blue-500/15 text-blue-400'
                  : canGoLive(item)
                  ? 'border-border bg-panel-raised text-content-secondary hover:bg-border-strong'
                  : 'cursor-default border-transparent bg-transparent text-content-tertiary'
              }`}
            >
              <span className="font-mono text-[10px] text-content-secondary">{i + 1}</span>
              <span>{ICON[item.type]}</span>
              <span className="max-w-[110px] truncate">{item.title}</span>
              {liveItemId === item.id && (
                <span className="text-[9px] font-bold text-blue-400">LIVE</span>
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
        active ? '' : 'bg-panel-raised text-content-secondary hover:bg-border-strong hover:text-content-primary'
      } ${className}`}
    >
      {children}
    </button>
  )
}

export default VolunteerView
