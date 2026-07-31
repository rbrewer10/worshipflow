import { useEffect, useState } from 'react'
import { AlertTriangle, Info, X } from 'lucide-react'

interface Toast {
  id: number
  message: string
  level: 'info' | 'warn' | 'error'
  actionLabel?: string
  onAction?: () => void
}

// Renderer-only toast trigger for client-detected conditions (e.g. "no active
// service") that don't need a main-process round trip. Dispatches the same
// { message, level } shape onNotify delivers, so NotifyToasts renders both
// main-driven and local toasts through one code path.
export function notifyLocal(message: string, level: 'info' | 'warn' | 'error' = 'warn'): void {
  window.dispatchEvent(new CustomEvent('wf:localNotify', { detail: { message, level } }))
}

// Same as notifyLocal, but with a clickable action (e.g. "Undo") — the
// main-process onNotify path is string-only (IPC can't carry a function), so
// this is renderer-only, used for reversing a just-confirmed delete.
export function notifyLocalAction(message: string, actionLabel: string, onAction: () => void, level: 'info' | 'warn' | 'error' = 'info'): void {
  window.dispatchEvent(new CustomEvent('wf:localNotify', { detail: { message, level, actionLabel, onAction } }))
}

// Listens for operator notifications from the main process (wf:notify) AND
// local renderer-triggered ones (wf:localNotify) — used for save failures,
// scripture fallbacks, drawer validation, etc. so the operator is never left
// guessing when something went wrong.
function NotifyToasts(): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    let seq = 0
    const push = (n: { message: string; level: 'info' | 'warn' | 'error'; actionLabel?: string; onAction?: () => void }): void => {
      const id = ++seq
      setToasts((prev) => [...prev, { id, ...n }])
      // Errors linger longer so they can't be missed mid-service. An actionable
      // toast (Undo) gets the longest window — it needs to still be there by
      // the time the operator notices and decides to click it.
      const ttl = n.onAction ? 8000 : n.level === 'error' ? 12000 : 6000
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), ttl)
    }
    const off = window.wf.onNotify(push)
    const onLocal = (e: Event): void => push((e as CustomEvent<{ message: string; level: 'info' | 'warn' | 'error'; actionLabel?: string; onAction?: () => void }>).detail)
    window.addEventListener('wf:localNotify', onLocal)
    return () => { off(); window.removeEventListener('wf:localNotify', onLocal) }
  }, [])

  if (toasts.length === 0) return <></>

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[9999] flex flex-col items-center gap-2">
      {toasts.map((t) => {
        const tone =
          t.level === 'error' ? 'bg-red-600 text-white'
          : t.level === 'warn' ? 'bg-amber-500 text-white'
          : 'bg-slate-800 text-white'
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-lg items-start gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${tone}`}
          >
            {t.level === 'info' ? <Info size={16} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />}
            <span className="flex-1">{t.message}</span>
            {t.onAction && t.actionLabel && (
              <button
                onClick={() => { t.onAction!(); setToasts((prev) => prev.filter((x) => x.id !== t.id)) }}
                className="mt-0.5 flex-shrink-0 rounded bg-black/20 px-2 py-0.5 text-xs font-bold underline-offset-2 hover:bg-black/30 hover:underline"
              >
                {t.actionLabel}
              </button>
            )}
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="mt-0.5 flex-shrink-0 opacity-70 hover:opacity-100"
              aria-label="Dismiss"
            >
              <X size={15} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default NotifyToasts
