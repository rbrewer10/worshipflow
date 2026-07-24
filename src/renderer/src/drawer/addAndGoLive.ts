import type { NewServiceItem } from '../../../shared/types'
import { sendItemLive } from '../liveActions'
import { notifyLocal } from '../NotifyToasts'

// Shared by the Songs/Scripture/Announcements drawer tabs: append a new item to
// the active service, then send it live through the SAME chokepoint the rest of
// the app uses (sendItemLive) — this is what keeps Phase-1 recording markers and
// zone routing correct, instead of a separate "quick push" path.
//
// serviceRefreshActiveItems must run before sendItemLive: sendItemLive ends by
// calling liveSetItemId(item.id), and main resolves that id against its own
// activeServiceItems cache — a newly-added item isn't in that cache yet unless
// it's refreshed first. This mirrors exactly what ServiceContext's
// reloadActiveService() already does (refresh, then get).
export async function addAndGoLive(
  serviceId: number | null,
  newItem: NewServiceItem,
  reloadActiveService: () => void
): Promise<boolean> {
  if (serviceId == null) {
    notifyLocal('Load a service first (Build Service).', 'warn')
    return false
  }
  try {
    const itemId = await window.wf.serviceAddItem(serviceId, newItem)
    await window.wf.serviceRefreshActiveItems(serviceId)
    const fresh = await window.wf.serviceGet(serviceId)
    const item = fresh?.items.find((it) => it.id === itemId) ?? null
    if (!item) {
      notifyLocal('Could not load the new item.', 'error')
      return false
    }
    const wentLive = await sendItemLive(item, 'main')
    if (!wentLive) {
      // The item was already added to the service — deliberately left in place
      // (matches existing Build Service behavior for a bad reference) so the
      // operator can see it and fix/delete it. Don't clear the drawer input or
      // close the drawer on this path so they can see what happened and retry.
      notifyLocal('Could not go live — check the item and try again.', 'warn')
      return false
    }
    reloadActiveService()
    return true
  } catch {
    notifyLocal('Something went wrong adding that item.', 'error')
    return false
  }
}
