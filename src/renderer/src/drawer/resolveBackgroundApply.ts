import type { ServiceItem } from '../../../shared/types'

export type BackgroundApplyAction =
  | { kind: 'song'; songId: number; path: string }
  | { kind: 'text'; itemId: number; payload: Record<string, unknown>; path: string }
  | { kind: 'unsupported'; itemType: string }

// Pure decision: given the item that's currently live and a background file
// path, decide what update to make. Songs store their background on the song
// record; text items store it in their own payload; everything else doesn't
// support a background (matches itemThumbBackground's existing rules in
// liveActions.ts).
export function resolveBackgroundApply(item: ServiceItem, path: string): BackgroundApplyAction {
  if (item.type === 'song' && item.ref_id != null) {
    return { kind: 'song', songId: item.ref_id, path }
  }
  if (item.type === 'text') {
    return { kind: 'text', itemId: item.id, payload: { ...(item.payload ?? {}), background: path }, path }
  }
  return { kind: 'unsupported', itemType: item.type }
}
