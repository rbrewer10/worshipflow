// Which service is "active" when the operator window opens (QA B-N1).
//
// The renderer used to select list[0] — the most recently *created* service —
// on every mount and push it to main. So every relaunch, and finishing the
// setup wizard with "Load sample Sunday" (B1), silently swapped the service
// the operator had prepared for whichever one was created last. Main now
// remembers the active service (setting below, restored at startup) and the
// renderer adopts main's choice; list[0] is only a fallback when main has none.

export const ACTIVE_SERVICE_SETTING = 'active_service_id'

export function parseActiveServiceSetting(raw: string | null | undefined): number | null {
  if (!raw) return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

export function activeServiceSettingValue(id: number | null): string {
  return id == null ? '' : String(id)
}

/**
 * What the operator window should select on mount.
 *  - main already has an active service that still exists → adopt it without
 *    re-sending it to main (re-sending resets CCLI counting and zone pins,
 *    which would also happen on every crash-reload of the operator renderer);
 *  - otherwise fall back to the newest service and tell main.
 */
export function pickInitialService(
  list: ReadonlyArray<{ id: number }>,
  mainActiveId: number | null
): { id: number; tellMain: boolean } | null {
  if (mainActiveId != null && list.some((s) => s.id === mainActiveId)) return { id: mainActiveId, tellMain: false }
  if (list.length === 0) return null
  return { id: list[0].id, tellMain: true }
}
