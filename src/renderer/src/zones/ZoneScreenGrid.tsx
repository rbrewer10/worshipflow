import { useEffect, useState } from 'react'
import type { ServiceItem, ThemeColors, SongFull, ZoneId, ZoneRouting } from '../../../shared/types'
import type { SceneConfig, ZoneRole } from '../../../shared/zoneScenes'
import { effectiveRouting, matchScene, expandScene, modeForRole } from '../../../shared/zoneScenes'
import type { ZoneSlide } from '../../../shared/zoneSlides'
import type { ZoneTrackAssignment } from '../../../shared/zoneTrack'
import ScenePresetRow from '../ScenePresetRow'
import ZoneRoutingGrid from '../ZoneRoutingGrid'
import ZoneDeckComposer from './ZoneDeckComposer'
import ZoneRolePalette from './ZoneRolePalette'
import ZoneScreenCard from './ZoneScreenCard'
import ZoneSlideFilmstrip from './ZoneSlideFilmstrip'

const ZONE_IDS: ZoneId[] = [1, 2, 3, 4]

// The four physical screens for the selected item: preset row, drag palette,
// 2x2 grid of live previews, and the raw-mode Advanced escape hatch. Writes the
// same per-item zone_routing the scene chips always have, through the existing
// zoneSetRouting IPC — no new persistence.
export default function ZoneScreenGrid({ item, serviceId, serviceTheme, serviceColors, songFull, slides, trackAssignment, onChanged }: {
  item: ServiceItem
  serviceId: number
  serviceTheme: string | null
  serviceColors: ThemeColors | null
  songFull: SongFull | null
  slides: string[]
  trackAssignment: ZoneTrackAssignment
  onChanged: () => void
}): JSX.Element {
  const [config, setConfig] = useState<SceneConfig | null>(null)
  const [logoPath, setLogoPath] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [selectedSlide, setSelectedSlide] = useState(0)
  const [deck, setDeck] = useState<ZoneSlide[] | null>(null)
  const [selectedDeckSlide, setSelectedDeckSlide] = useState(0)
  const [buildingSlides, setBuildingSlides] = useState(false)

  useEffect(() => { void window.wf.scenesGet().then(setConfig) }, [])
  useEffect(() => { void window.wf.logoGet().then(({ logoPath: p }) => setLogoPath(p)) }, [])

  // A different item (or an edit that changes the slide count) must not leave
  // the strip pointing past the end of the new slide list.
  useEffect(() => { setSelectedSlide(0) }, [item.id, slides.length])

  useEffect(() => { void window.wf.zoneGetSlides(item.id).then(setDeck); setSelectedDeckSlide(0) }, [item.id])

  if (!config) return <></>

  const routing = effectiveRouting(item, config)
  const matched = matchScene(routing, item.type, config)
  const isDefault = item.zoneRouting == null

  // A deck is only meaningful for items that resolve to more than one thing to
  // say per screen — a sermon title held on one screen while another cycles
  // verses. Songs, scripture-alone, etc. keep the plain routing UI untouched.
  // Announcements join sermon and text: a block has many things to say per
  // screen, which is exactly what a deck expresses.
  const canDeck = item.type === 'sermon' || item.type === 'text' || item.type === 'announcement'

  const save = (next: ZoneRouting): void => {
    void window.wf.zoneSetRouting(item.id, next).then(onChanged)
  }

  const saveDeck = (next: ZoneSlide[] | null): void => {
    setDeck(next)
    void window.wf.zoneSetSlides(item.id, next).then(onChanged)
  }

  // The FIRST slide is seeded with real content — the sermon/text title on
  // Back Left, logo on the Lyrics TVs. An all-'same' first slide has nothing
  // earlier to hold, so every zone resolved to black and a fresh deck showed
  // literally nothing, which read as "it's broken." (Slides ADDED after this
  // one are all-'same' on purpose — there, holding the previous slide is the
  // whole point; see ZoneDeckComposer's blankSlide.)
  const seedSlide = (): ZoneSlide => ({
    zones: {
      1: { kind: 'text', text: (item.payload?.title as string) || item.title || '' },
      2: { kind: 'black' },
      3: { kind: 'logo' },
      4: { kind: 'black' },
    },
  })

  // "Build slides" for a sermon or announcement block pulls in the ACTUAL
  // reading/announcements — real verse text, real references, one slide per
  // chunk — rather than a single blank card the operator has to type from
  // scratch. Once saved it's a normal stored deck: click any slide, edit its
  // wording, or set its size, exactly like a hand-built one.
  const buildSlides = async (): Promise<void> => {
    setBuildingSlides(true)
    try {
      const generated = await window.wf.zoneGenerateSlides(item)
      saveDeck(generated ?? [seedSlide()])
    } finally {
      setBuildingSlides(false)
    }
  }

  const pickScene = (sceneId: string): void => {
    const scene = config.scenes.find((s) => s.id === sceneId)
    if (!scene) return
    save(expandScene(scene, item.type))
  }

  // Dropping/cycling a role stamps a full explicit routing onto the item, the
  // same thing tapping a preset chip has always done.
  const setRole = (zoneId: ZoneId, role: ZoneRole): void => {
    save({ ...routing, [zoneId]: modeForRole(role, item.type) })
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      {deck ? (
        // A deck governs what every screen shows directly, slide by slide —
        // the preset row and role palette configure the OTHER (non-deck) path
        // and would misleadingly suggest they still apply here.
        <ZoneDeckComposer
          item={item}
          serviceTheme={serviceTheme}
          serviceColors={serviceColors}
          songFull={songFull}
          slides={slides}
          trackAssignment={trackAssignment}
          logoPath={logoPath}
          deck={deck}
          selectedDeckSlide={selectedDeckSlide}
          onSelectDeckSlide={setSelectedDeckSlide}
          onSaveDeck={saveDeck}
        />
      ) : (
        <>
          <ScenePresetRow
            config={config}
            itemType={item.type}
            routing={routing}
            matched={matched}
            isDefault={isDefault}
            onPick={pickScene}
          />

          <div className="flex items-center justify-between gap-2">
            <ZoneRolePalette />
            {canDeck && (
              <button
                onClick={() => { void buildSlides() }}
                disabled={buildingSlides}
                className="shrink-0 text-[10px] font-semibold text-blue-600 hover:text-blue-700 disabled:text-slate-400"
              >
                {buildingSlides ? 'Building…' : 'Build slides'}
              </button>
            )}
          </div>

          {/* An item only ever reaches zones tuned to its own track — a zone
              assigned to the other track will never actually show this item's
              content, no matter what role gets set here. Dim and lock those cards
              instead of rendering something that would never appear there. */}
          <div className="grid grid-cols-2 gap-3">
            {ZONE_IDS.map((zoneId) => {
              const offTrack = trackAssignment[zoneId] !== item.track
              return (
                <ZoneScreenCard
                  key={zoneId}
                  zoneId={zoneId}
                  mode={routing[zoneId]}
                  item={item}
                  serviceTheme={serviceTheme}
                  serviceColors={serviceColors}
                  songFull={songFull}
                  logoPath={logoPath}
                  offTrack={offTrack}
                  offTrackLabel={trackAssignment[zoneId] === 'main' ? 'Follows Main' : 'Follows Second'}
                  slideText={slides[selectedSlide]}
                  onRoleChange={(role) => setRole(zoneId, role)}
                />
              )
            })}
          </div>
        </>
      )}

      {/* The drag source for the deck composer, so it stays visible in both
          modes — deck mode needs it to fill zone slots by dragging. */}
      <ZoneSlideFilmstrip slides={slides} selected={selectedSlide} onSelect={setSelectedSlide} />

      <div>
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-[10px] font-semibold text-slate-400 hover:text-slate-600"
        >
          Advanced {showAdvanced ? '▴' : '▾'}
        </button>
        {showAdvanced && (
          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-100/70 p-2.5">
            <ZoneRoutingGrid routing={routing} onChange={save} />
            {!isDefault && (
              <button
                onClick={() => { void window.wf.zoneSetRouting(item.id, null).then(onChanged) }}
                className="mt-2 text-[10px] font-semibold text-slate-400 hover:text-slate-600"
              >
                Reset to default for this type
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
