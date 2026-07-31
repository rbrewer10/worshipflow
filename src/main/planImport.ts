import type { ServiceItemType } from '../shared/types'

// A single item from a Snow Hill Church service plan (.wfplan).
export interface PlanItemInput {
  type: string
  title?: string
  detail?: string
  leader?: string
}

export interface MappedPlanItem {
  type: ServiceItemType
  ref_id: number | null
  payload: Record<string, unknown>
  notes: string | null
}

/**
 * Map church-app plan items onto WorshipFlow service items. Songs are matched
 * to the library by title (via `findSongId`); scripture/sermon map to their
 * real types; everything else becomes a labeled placeholder. Pure so it can be
 * unit-tested without the DB or Electron.
 */
export function mapPlanItems(
  items: PlanItemInput[],
  findSongId: (title: string) => number | null
): { mapped: MappedPlanItem[]; matched: number; missing: string[] } {
  const mapped: MappedPlanItem[] = []
  const missing: string[] = []
  let matched = 0

  for (const it of items) {
    const title = (it.title ?? '').trim()
    const leader = (it.leader ?? '').trim()
    const detail = (it.detail ?? '').trim()
    const notes = [leader ? `Led by ${leader}` : '', detail].filter(Boolean).join(' · ') || null

    if (it.type === 'song') {
      const id = findSongId(title)
      if (id != null) {
        matched++
        mapped.push({ type: 'song', ref_id: id, payload: {}, notes })
      } else {
        missing.push(title)
        mapped.push({ type: 'placeholder', ref_id: null, payload: { label: `Song: ${title}` }, notes })
      }
    } else if (it.type === 'scripture') {
      mapped.push({ type: 'scripture', ref_id: null, payload: { reference: title }, notes })
    } else if (it.type === 'sermon') {
      mapped.push({ type: 'sermon', ref_id: null, payload: { title, speaker: leader || undefined }, notes })
    } else {
      mapped.push({ type: 'placeholder', ref_id: null, payload: { label: title || it.type }, notes })
    }
  }

  return { mapped, matched, missing }
}
