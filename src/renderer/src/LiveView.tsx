import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppInfo, Intent, LiveState } from '../../shared/types'

// The live control surface (Phase 0 engine UI). Sends intents to main and
// mirrors the broadcast state — never holds authority itself.
function LiveView(): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [live, setLive] = useState<LiveState | null>(null)

  useEffect(() => {
    window.wf.getInfo().then(setInfo)
    const t = setTimeout(() => window.wf.getInfo().then(setInfo), 900)
    const off = window.wf.onState(setLive)
    return () => {
      clearTimeout(t)
      off()
    }
  }, [])

  // Re-fetch song lines whenever a new song is loaded into the engine.
  useEffect(() => {
    if (live?.songTitle) window.wf.getInfo().then(setInfo)
  }, [live?.songTitle])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const k = e.key.toLowerCase()
      if (e.code === 'Space' || e.code === 'ArrowRight') {
        e.preventDefault()
        send('next')
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        send('prev')
      } else if (k === 'b') send('black')
      else if (k === 'l') send('logo')
      else if (k === 's') send('lyrics')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const send = (type: Intent): void => window.wf.sendIntent(type)

  const lines = info?.song.lines ?? []
  const mode = live?.mode ?? 'lyrics'
  const index = live?.index ?? 0
  const previewText = mode === 'black' ? '' : mode === 'logo' ? '✝ SNOW HILL' : live?.line ?? ''

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 px-5 py-2 text-xs text-slate-400">
        Space / → next · ← prev · B black · L logo · S lyrics
      </div>

      <main className="flex min-h-0 flex-1 gap-4 p-4">
        <div className="flex w-80 flex-col gap-3">
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Controls
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <Btn onClick={() => send('prev')}>◀ Prev</Btn>
              <Btn onClick={() => send('next')}>Next ▶</Btn>
              <Btn onClick={() => send('black')} className="col-span-2 bg-black">
                Black
              </Btn>
              <Btn onClick={() => send('logo')} className="col-span-2 bg-blue-600 hover:bg-blue-500">
                Logo
              </Btn>
              <Btn onClick={() => send('lyrics')} className="col-span-2">
                Lyrics
              </Btn>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Displays detected
            </h2>
            <div className="space-y-1 text-xs text-slate-400">
              <div>
                <b className="text-slate-100">{info?.displays.length ?? '…'}</b> display(s) ·{' '}
                <span className={info && info.outputs > 0 ? 'text-emerald-400' : 'text-amber-400'}>
                  {info?.outputs ?? 0} output(s) live
                </span>
              </div>
              {info?.displays.map((d) => (
                <div key={d.id}>
                  • {d.bounds.width}×{d.bounds.height} @ {d.bounds.x},{d.bounds.y}{' '}
                  {d.primary && <span className="text-emerald-400">(primary)</span>}
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Operator preview (mirrors the live outputs)
            </h2>
            <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-lg bg-black p-6 text-center">
              <span className="text-3xl font-bold">{previewText}</span>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Now playing — {info?.song.title ?? '…'}
            </h2>
            <div className="max-h-40 space-y-1 overflow-auto text-sm text-slate-400">
              {lines.map((l, i) => (
                <div key={i} className={i === index && mode === 'lyrics' ? 'font-bold text-white' : ''}>
                  {i + 1}. {l}
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

function Btn({
  children,
  onClick,
  className = ''
}: {
  children: ReactNode
  onClick: () => void
  className?: string
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border border-white/10 bg-white/[0.06] px-3 py-3 text-sm font-semibold hover:bg-white/[0.12] ${className}`}
    >
      {children}
    </button>
  )
}

export default LiveView
