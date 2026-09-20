// Pure staleness check, extracted so it's testable without touching the store
// or Electron. See RECOVERY_STALE_MS in index.ts for the threshold rationale.
export function isRecoveryStale(snap: { ts: number }, now: number, staleMs: number): boolean {
  return now - snap.ts > staleMs
}
