import type { ServiceItem } from '../../../shared/types'
import { PAYLOAD_BACKGROUND_TYPES } from '../../../shared/types'

export type BackgroundApplyAction =
  | { kind: 'song'; songId: number; path: string }
  | { kind: 'payload'; itemId: number; payload: Record<string, unknown>; path: string }
  | { kind: 'unsupported'; itemType: string }

// Pure decision: given a service item and a background file path, decide what
// update to make. Songs store their background on the song record; Text/
// Scripture/Countdown/Welcome/Sermon items store it in their own payload;
// everything else doesn't support a background (matches ItemBackgroundPanel.tsx's rules).
export function resolveBackgroundApply(item: ServiceItem, path: string): BackgroundApplyAction {
  if (item.type === 'song' && item.ref_id != null) {
    return { kind: 'song', songId: item.ref_id, path }
  }
  if (PAYLOAD_BACKGROUND_TYPES.includes(item.type)) {
    return { kind: 'payload', itemId: item.id, payload: { ...(item.payload ?? {}), background: path }, path }
  }
  return { kind: 'unsupported', itemType: item.type }
}
