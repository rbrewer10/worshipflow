// Next/Prev item lookup that survives the live item being deleted (QA B10).
//
// Before: Next/Prev located the live item in the service list by id. If the
// live item had been deleted from Build service (multi-select delete didn't
// exclude it), the lookup failed, and once the last slide was reached Next
// did nothing at all — the operator was stuck until they clicked a rail item.
// Now the order the list had *while the item was still in it* is remembered,
// and its surviving neighbours are used instead.

export function pickAdjacentItem<T extends { id: number }>(
  items: T[],
  liveId: number | null,
  dir: 1 | -1,
  canGoLive: (it: T) => boolean,
  previousOrder?: readonly number[] | null
): T | undefined {
  if (liveId == null) return undefined
  const idx = items.findIndex((it) => it.id === liveId)
  if (idx >= 0) {
    const rest = dir === 1 ? items.slice(idx + 1) : items.slice(0, idx).reverse()
    return rest.find(canGoLive)
  }
  const prevIdx = previousOrder ? previousOrder.indexOf(liveId) : -1
  if (!previousOrder || prevIdx < 0) return undefined
  const neighbourIds = dir === 1 ? previousOrder.slice(prevIdx + 1) : previousOrder.slice(0, prevIdx).reverse()
  const byId = new Map(items.map((it) => [it.id, it]))
  for (const id of neighbourIds) {
    const it = byId.get(id)
    if (it && canGoLive(it)) return it
  }
  return undefined
}

/**
 * What to remember about the old list when the service items are reloaded:
 * the old id order, but only while it still contains the live item (so a
 * second reload after the deletion doesn't overwrite the useful snapshot).
 */
export function nextOrderSnapshot(
  oldIds: readonly number[],
  liveId: number | null,
  current: readonly number[] | null
): number[] | null {
  if (liveId == null) return null
  if (oldIds.includes(liveId)) return [...oldIds]
  return current && current.includes(liveId) ? [...current] : null
}

/** Split a multi-selection into what may be deleted and the live item that must stay. */
export function splitLiveFromDeletion<T extends { id: number }>(selected: T[], liveItemId: number | null | undefined): { deletable: T[]; skippedLive: T | null } {
  const skippedLive = liveItemId == null ? null : selected.find((it) => it.id === liveItemId) ?? null
  return { deletable: selected.filter((it) => it.id !== liveItemId), skippedLive }
}
