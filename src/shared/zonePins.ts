// Live-operation pins: "this screen holds X until unpinned." Top of the zone
// precedence chain — a pin beats decks, per-item routing and track assignment,
// because it is the operator's most recent, most explicit intent. Pure module.
import type { ZoneId } from './types'

export type ZonePin =
  | { kind: 'mode'; mode: 'logo' | 'black' | 'lyrics' }
  | { kind: 'titleCard'; itemId: number }

export type ZonePins = Partial<Record<ZoneId, ZonePin>>

const PIN_MODES = ['logo', 'black', 'lyrics'] as const

export function validateZonePins(value: unknown): value is ZonePins {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  for (const [k, pin] of Object.entries(value as Record<string, unknown>)) {
    if (!['1', '2', '3', '4'].includes(k)) return false
    if (typeof pin !== 'object' || pin === null) return false
    const p = pin as ZonePin
    if (p.kind === 'mode') { if (!PIN_MODES.includes(p.mode as never)) return false }
    else if (p.kind === 'titleCard') { if (typeof p.itemId !== 'number') return false }
    else return false
  }
  return true
}

export function parseZonePins(json: string | null): ZonePins {
  if (!json) return {}
  try {
    const parsed = JSON.parse(json)
    return validateZonePins(parsed) ? parsed : {}
  } catch { return {} }
}

export function pinLabel(pin: ZonePin, items: { id: number; title: string }[]): string {
  if (pin.kind === 'mode') return pin.mode === 'logo' ? 'Logo' : pin.mode === 'black' ? 'Black' : 'Live text'
  const item = items.find((it) => it.id === pin.itemId)
  return item ? `Holding “${item.title}”` : 'Held item'
}
