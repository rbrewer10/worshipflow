import type { ServiceItem, ThemeColors, SongFull, ZoneId, ZoneMode } from '../../../shared/types'
import type { ZoneSlide, ZoneSlot } from '../../../shared/zoneSlides'
import { resolveSlot } from '../../../shared/zoneSlides'
import type { ZoneTrackAssignment } from '../../../shared/zoneTrack'
import ZoneDeckStrip from './ZoneDeckStrip'
import ZoneScreenCard from './ZoneScreenCard'
import ZoneSlotEditor from './ZoneSlotEditor'

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

// Mirrors zoneSlides.ts's private slotText helper. Duplicated rather than
// exported because this task's file scope is src/renderer/src/zones/ only —
// 'logo'/'black'/'same' intentionally fall through to '', since they aren't
// text-bearing kinds; the card's own role box (not slideText) is what shows
// black/logo.
function slotPreviewText(slot: ZoneSlot, source: string[]): string {
  if (slot.kind === 'slide') return source[slot.index ?? -1] ?? ''
  if (slot.kind === 'text') return slot.text ?? ''
  if (slot.kind === 'scripture') return slot.reference ?? ''
  return ''
}

// What ServiceSlidePreview actually draws for this slot, independent of the
// item's own type — see ServiceSlidePreview's deckSlot prop for why that
// distinction matters. 'slide' folds into 'text': it's a plain resolved line
// from the item's own source slides, same as an authored text slot.
function slotToDeckSlot(
  slot: ZoneSlot,
  source: string[]
): { kind: 'text' | 'scripture' | 'sermon'; text?: string; reference?: string } | undefined {
  if (slot.kind === 'text') return { kind: 'text', text: slot.text }
  if (slot.kind === 'scripture') return { kind: 'scripture', reference: slot.reference }
  if (slot.kind === 'sermon') return { kind: 'sermon', text: slot.text, reference: slot.reference }
  if (slot.kind === 'slide') return { kind: 'text', text: source[slot.index ?? -1] ?? '' }
  return undefined
}

// A deck slot's kind is what actually governs the screen once a deck exists —
// exactly how the live engine's computeZoneStates treats the deck as winning
// over the item's stored zone_routing (see zoneStateFromSlot in main/index.ts).
// The card must follow the same rule, or a sermon's default 'logo' routing
// would hide the authored text/verse/slide behind the plain logo box.
function modeForSlot(slot: ZoneSlot): ZoneMode {
  if (slot.kind === 'logo') return 'logo'
  if (slot.kind === 'black') return 'black'
  return 'text' // slide / scripture / text all resolve to role 'content', rendered via slideText
}

// The deck-mode branch of ZoneScreenGrid, split out to keep that file from
// having to own both the plain routing UI and the full composer. Renders the
// deck strip above the 2x2 grid; each card gets a slot editor beneath it and
// accepts a dropped source slide.
export default function ZoneDeckComposer({
  item, serviceTheme, serviceColors, songFull, slides, trackAssignment, logoPath,
  deck, selectedDeckSlide, onSelectDeckSlide, onSaveDeck,
}: {
  item: ServiceItem
  serviceTheme: string | null
  serviceColors: ThemeColors | null
  songFull: SongFull | null
  slides: string[]
  trackAssignment: ZoneTrackAssignment
  logoPath: string | null
  deck: ZoneSlide[]
  selectedDeckSlide: number
  onSelectDeckSlide: (index: number) => void
  onSaveDeck: (next: ZoneSlide[]) => void
}): JSX.Element {
  const blankSlide = (): ZoneSlide => ({
    zones: { 1: { kind: 'same' }, 2: { kind: 'same' }, 3: { kind: 'same' }, 4: { kind: 'black' } },
  })

  const addSlide = (): void => {
    onSaveDeck([...deck, blankSlide()])
    onSelectDeckSlide(deck.length)
  }

  const deleteSlide = (index: number): void => {
    if (deck.length <= 1) return
    const next = deck.filter((_, i) => i !== index)
    onSaveDeck(next)
    if (selectedDeckSlide >= next.length) onSelectDeckSlide(next.length - 1)
  }

  const setSlot = (zoneId: ZoneId, slot: ZoneSlot): void => {
    const next = deck.map((s, i) => (i === selectedDeckSlide ? { zones: { ...s.zones, [zoneId]: slot } } : s))
    onSaveDeck(next)
  }

  // Picking a kind used to produce a bare { kind } — an empty slot, which the
  // engine renders as a blank card or (for an unresolvable verse) a black
  // screen, with nothing in the composer saying it still needed filling in. A
  // sermon already knows its own title and passage, so start from those instead
  // of from nothing; the operator can still overwrite either field.
  const defaultsForKind = (kind: ZoneSlot['kind']): ZoneSlot => {
    const payload = item.payload ?? {}
    const title = (payload.title as string | undefined) || item.title || ''
    const passage = (payload.passage as string | undefined) || (payload.reference as string | undefined) || ''
    if (kind === 'sermon') return { kind, text: title, reference: passage }
    if (kind === 'scripture') return { kind, reference: passage }
    if (kind === 'text') return { kind, text: '' }
    return { kind }
  }

  return (
    <div className="flex flex-col gap-3">
      <ZoneDeckStrip
        slides={deck}
        source={slides}
        selected={selectedDeckSlide}
        onSelect={onSelectDeckSlide}
        onAdd={addSlide}
        onDelete={deleteSlide}
      />

      <div className="grid grid-cols-2 gap-3">
        {ZONE_IDS.map((zoneId) => {
          const offTrack = trackAssignment[zoneId] !== item.track
          const rawSlot = deck[selectedDeckSlide]?.zones?.[zoneId] ?? { kind: 'black' as const }
          const resolved = resolveSlot(deck, selectedDeckSlide, zoneId)
          return (
            <div key={zoneId} className="flex flex-col gap-1.5">
              <ZoneScreenCard
                zoneId={zoneId}
                mode={modeForSlot(resolved)}
                item={item}
                serviceTheme={serviceTheme}
                serviceColors={serviceColors}
                songFull={songFull}
                logoPath={logoPath}
                offTrack={offTrack}
                offTrackLabel={trackAssignment[zoneId] === 'main' ? 'Follows Main' : 'Follows Second'}
                slideText={slotPreviewText(resolved, slides)}
                deckSlot={slotToDeckSlot(resolved, slides)}
                onSlideDrop={(sourceIndex) => setSlot(zoneId, { kind: 'slide', index: sourceIndex })}
              />
              <ZoneSlotEditor
                slot={rawSlot}
                zoneId={zoneId}
                defaultsForKind={defaultsForKind}
                onChange={(next) => setSlot(zoneId, next)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
