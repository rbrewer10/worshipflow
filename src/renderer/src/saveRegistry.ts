import type { SaveStatus } from './useAutosave'

// Every useAutosave instance registers its current status here, keyed by a
// unique per-instance id. Save status otherwise lives in component state, so
// it simply vanishes the moment the editor holding it unmounts — e.g.
// switching tabs while a save is still failing silently abandons the failed
// edit with no warning. This lets AppShell ask "is anything failed right
// now?" before letting a tab switch go through, without every editor needing
// to know about navigation.
const registry = new Map<symbol, SaveStatus>()
const listeners = new Set<() => void>()

export function registerSave(id: symbol, status: SaveStatus): void {
  registry.set(id, status)
  listeners.forEach((l) => l())
}

export function unregisterSave(id: symbol): void {
  registry.delete(id)
  listeners.forEach((l) => l())
}

export function hasFailedSaves(): boolean {
  for (const status of registry.values()) if (status === 'failed') return true
  return false
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
