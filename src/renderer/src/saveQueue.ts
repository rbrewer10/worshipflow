export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

// Combines several independent save queues into the one badge an editor
// renders — "saving" if anything is, else "failed" if anything is, else
// "saved" if anything is. A user edits one field at a time in practice, so
// one combined indicator matches "is my editor dirty/saved" better than a
// badge per field would.
export function combineSaveStatus(statuses: SaveStatus[]): SaveStatus {
  if (statuses.includes('saving')) return 'saving'
  if (statuses.includes('failed')) return 'failed'
  if (statuses.includes('saved')) return 'saved'
  return 'idle'
}

export interface SaveQueueDeps<T> {
  save: (value: T) => Promise<void>
  onStatusChange: (status: SaveStatus, error: string | null) => void
  // Injected so tests don't depend on a real toast/notification system.
  notifyFailure: (message: string) => void
}

export interface SaveQueue<T> {
  trigger: (value: T) => void
  retry: () => void
}

// Pure (no React) serialized-save state machine — the core of useAutosave,
// split out so it's unit-testable with plain async/await instead of needing
// a DOM/React-hooks test environment (this project's vitest config is
// deliberately Node-only pure-logic tests).
//
// Serializes saves per record (only one in flight at a time) and coalesces
// rapid successive triggers into just the latest pending value, fixing two
// failure modes an ad-hoc "save on blur" call site has: a slower earlier
// write landing after (and overwriting) a newer one, and a silently
// swallowed rejected save leaving the UI's optimistic state lying about
// what's actually persisted.
export function createSaveQueue<T>(deps: SaveQueueDeps<T>): SaveQueue<T> {
  let pending: { value: T } | null = null
  let lastFailed: { value: T } | null = null
  let inFlight = false

  async function runLoop(): Promise<void> {
    if (inFlight) return
    inFlight = true
    deps.onStatusChange('saving', null)
    while (pending) {
      const { value } = pending
      pending = null
      try {
        await deps.save(value)
      } catch (err) {
        inFlight = false
        lastFailed = { value }
        const message = err instanceof Error ? err.message : String(err)
        deps.onStatusChange('failed', message)
        deps.notifyFailure(message)
        return
      }
    }
    inFlight = false
    lastFailed = null
    deps.onStatusChange('saved', null)
  }

  return {
    trigger(value: T) {
      lastFailed = null
      pending = { value }
      void runLoop()
    },
    retry() {
      if (!lastFailed) return
      pending = lastFailed
      lastFailed = null
      void runLoop()
    }
  }
}
