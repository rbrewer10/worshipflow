import { useMemo, useRef, useState } from 'react'
import { createSaveQueue, type SaveStatus } from './saveQueue'
import { notifyLocal } from './NotifyToasts'

export type { SaveStatus }

// Thin React wrapper around the pure createSaveQueue state machine — see
// saveQueue.ts for what problem this actually solves and why the logic
// lives there instead of here (testability without a DOM environment).
export function useAutosave<T>(save: (value: T) => Promise<void>): {
  status: SaveStatus
  error: string | null
  trigger: (value: T) => void
  retry: () => void
} {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  // `save` is a fresh closure every render, but the queue instance must
  // survive re-renders (it holds the pending/in-flight state) — so it always
  // calls through this ref rather than closing over `save` directly.
  const saveRef = useRef(save)
  saveRef.current = save

  const queue = useMemo(
    () =>
      createSaveQueue<T>({
        save: (value) => saveRef.current(value),
        onStatusChange: (s, e) => { setStatus(s); setError(e) },
        notifyFailure: (message) => notifyLocal(`Save failed: ${message}`, 'error')
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  return { status, error, trigger: queue.trigger, retry: queue.retry }
}
