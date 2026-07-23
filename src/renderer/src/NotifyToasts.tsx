import { useEffect, useState } from 'react'
import { AlertTriangle, Info, X } from 'lucide-react'

interface Toast {
  id: number
  message: string
  level: 'info' | 'warn' | 'error'
}

// Renderer-only toast trigger for client-detected conditions (e.g. "no active
// service") that don't need a main-process round trip. Dispatches the same
// { message, level } shape onNotify delivers, so NotifyToasts renders both
// main-driven and local toasts through one code path.
export function notifyLocal(message: string, level: 'info' | 'warn' | 'error' = 'warn'): void {
  window.dispatchEvent(new CustomEvent('wf:localNotify', { detail: { message, level } }))
}

// Listens for operator notifications from the main process (wf:notify) AND
// local renderer-triggered ones (wf:localNotify) — used for save failures,
// scripture fallbacks, drawer validation, etc. so the operator is never left
// guessing when something went wrong.
function NotifyToasts(): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    let seq = 0
    const push = (n: { message: string; level: 'info' | 'warn' | 'error' }): void => {
      const id = ++seq
      setToasts((prev) => [...prev, { id, ...n }])
      // Errors linger longer so they can't be missed mid-service.
      const ttl = n.level === 'error' ? 12000 : 6000
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), ttl)
    }
    const off = window.wf.onNotify(push)
    const onLocal = (e: Event): void => push((e as CustomEvent<{ message: string; level: 'info' | 'warn' | 'error' }>).detail)
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
