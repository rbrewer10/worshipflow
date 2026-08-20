import { useEffect, useState } from 'react'
import type { ItemStyle, ServiceItem, SongFull, SongInput, ThemeColors } from '../../shared/types'
import { ItemEditor } from './ItemEditor'
import { parseReflowText, sectionsToReflowText } from '../../shared/reflowText'
import { analyzeAndLabelSections, previewAutoLabels } from './autoLabel'
import { useAutosave } from './useAutosave'
import { combineSaveStatus } from './saveQueue'

function CardEditPanel({ item, serviceTheme, serviceColors, showPreview = true, onClose, onChanged, onDelete }: {
  item: ServiceItem
  serviceTheme: string | null
  serviceColors: ThemeColors | null
  showPreview?: boolean
  onClose: () => void
  onChanged: () => void
  onDelete: (item: ServiceItem) => void
}): JSX.Element {
  const [p, setP] = useState<Record<string, unknown>>(item.payload ?? {})
  const [notes, setNotes] = useState(item.notes ?? '')
  const [songFull, setSongFull] = useState<SongFull | null>(null)
  const [lyrics, setLyrics] = useState('')
  const [showAutoLabelPreview, setShowAutoLabelPreview] = useState(false)
  const [autoLabelPreview, setAutoLabelPreview] = useState('')
  const [autoLabelAnalyses, setAutoLabelAnalyses] = useState<any[]>([])
  useEffect(() => {
    setP(item.payload ?? {}); setNotes(item.notes ?? '')
    if (item.type === 'song' && item.ref_id != null) {
      window.wf.songGet(item.ref_id).then((s) => { setSongFull(s); setLyrics(s ? sectionsToReflowText(s.sections) : '') })
    } else {
      setSongFull(null); setLyrics('')
    }
  }, [item.id])

  // One save queue per independent thing this panel persists — see
  // saveQueue.ts. Routing the song record's background changes through the
  // same queue as saveSong (rather than awaiting them directly) means a
  // background pick can never land out of order against an in-flight lyric
  // save to the same song row.
  const songQueue = useAutosave<SongInput & { __id: number }>(({ __id, ...input }) =>
    window.wf.songUpdate(__id, input).then(() => {
      window.wf.songGet(__id).then(setSongFull)
      onChanged()
    })
  )
  const payloadQueue = useAutosave<Record<string, unknown>>((next) =>
    window.wf.serviceSetItemPayload(item.id, next).then(() => onChanged())
  )
  const notesQueue = useAutosave<string>((value) =>
    window.wf.serviceUpdateItemNotes(item.id, value.trim() || null).then(() => onChanged())
  )
  // ItemBackgroundPanel's theme/color picker writes item.style — previously it
  // had its own separate useAutosave queue for this even though it's rendered
  // as a child of this same item's editor, so a rapid theme click here and a
  // text edit elsewhere in the panel could reach the DB out of order. Owning
  // it here and passing the trigger down closes that gap.
  const styleQueue = useAutosave<ItemStyle | null>((style) =>
    window.wf.serviceSetItemStyle(item.id, style).then(() => onChanged())
  )

  const buildSongInput = (overrides: Partial<SongInput> = {}): (SongInput & { __id: number }) | null => {
    if (!songFull) return null
    const sections = parseReflowText(lyrics)
    const validArr = (songFull.arrangement ?? []).filter((i) => i < sections.length)
    return {
      __id: songFull.id,
      title: songFull.title,
      author: songFull.author ?? undefined,
      ccli: songFull.ccli ?? undefined,
      copyright: songFull.copyright ?? undefined,
      publisher: songFull.publisher ?? undefined,
      background: songFull.background,
      sections,
      arrangement: validArr.length ? validArr : null,
      fontScale: songFull.fontScale,
      linesPerSlide: songFull.linesPerSlide,
      bgMotion: songFull.bgMotion,
      textColor: songFull.textColor,
      font: songFull.font,
      blurBehindText: songFull.blurBehindText,
      ...overrides
    }
  }

  const pickSongBg = async (): Promise<void> => {
    if (!songFull) return
    const result = await window.wf.dialogOpenFile()
    if (!result.canceled && result.filePaths[0]) {
      const input = buildSongInput({ background: result.filePaths[0] })
      if (input) songQueue.trigger(input)
    }
  }

  const removeSongBg = async (): Promise<void> => {
    if (!songFull) return
    const input = buildSongInput({ background: null })
    if (input) songQueue.trigger(input)
  }

  // Song font size used to be adjustable only reactively, from Live Control
  // while the song was already live — Scripture/Text/Announcement items all
  // got a Build Service slider, songs never did. Same buildSongInput/
  // songQueue path pickSongBg already uses, so it can't land out of order
  // against an in-flight lyrics save.
  const setSongFontScale = (scale: number): void => {
    const input = buildSongInput({ fontScale: scale })
    if (input) songQueue.trigger(input)
  }

  const saveSong = (): void => {
    const input = buildSongInput()
    if (input) songQueue.trigger(input)
  }

  const savePayload = (next: Record<string, unknown>): void => {
    setP(next)
    payloadQueue.trigger(next)
  }
  const saveNotes = (): void => { notesQueue.trigger(notes) }

  // Passed down to ItemBackgroundPanel so its background/blur picks for a
  // song item go through this same songQueue instead of a separate one.
  const applySongBackground = (path: string | null): void => {
    const input = buildSongInput({ background: path })
    if (input) songQueue.trigger(input)
  }
  const toggleSongBlurBehindText = (): void => {
    if (!songFull) return
    const input = buildSongInput({ blurBehindText: !songFull.blurBehindText })
    if (input) songQueue.trigger(input)
  }
  const applyItemStyle = (style: ItemStyle | null): void => styleQueue.trigger(style)

  const saveStatus = combineSaveStatus([songQueue.status, payloadQueue.status, notesQueue.status, styleQueue.status])
  const saveError = songQueue.error ?? payloadQueue.error ?? notesQueue.error ?? styleQueue.error ?? null
  const retrySave = (): void => { songQueue.retry(); payloadQueue.retry(); notesQueue.retry(); styleQueue.retry() }

  const handleAutoLabel = (): void => {
    const analyses = analyzeAndLabelSections(lyrics)
    const preview = previewAutoLabels(lyrics, analyses)
    setAutoLabelAnalyses(analyses)
    setAutoLabelPreview(preview)
    setShowAutoLabelPreview(true)
  }

  const applyAutoLabels = (): void => {
    setLyrics(autoLabelPreview)
    setShowAutoLabelPreview(false)
  }

  return (
    <ItemEditor
      item={item}
      serviceTheme={serviceTheme}
      serviceColors={serviceColors}
      showPreview={showPreview}
      onClose={onClose}
      onChanged={onChanged}
      onDelete={onDelete}
      saveStatus={saveStatus}
      saveError={saveError}
      onRetrySave={retrySave}
      songFull={songFull}
      lyrics={lyrics}
      showAutoLabelPreview={showAutoLabelPreview}
      autoLabelPreview={autoLabelPreview}
      autoLabelAnalyses={autoLabelAnalyses}
      notes={notes}
      onLyricsChange={setLyrics}
      onNotesChange={setNotes}
      onSaveSong={saveSong}
      onAutoLabelClick={handleAutoLabel}
      onAutoLabelPreviewClose={() => setShowAutoLabelPreview(false)}
      onAutoLabelApply={applyAutoLabels}
      onBackgroundClick={pickSongBg}
      onRemoveBackground={removeSongBg}
      onSongFontScaleChange={setSongFontScale}
      onSaveNotes={saveNotes}
      setAutoLabelPreview={setAutoLabelPreview}
      setAutoLabelAnalyses={setAutoLabelAnalyses}
      setShowAutoLabelPreview={setShowAutoLabelPreview}
      savePayload={savePayload}
      applySongBackground={applySongBackground}
      onToggleSongBlur={toggleSongBlurBehindText}
      applyItemStyle={applyItemStyle}
    />
  )
}

export default CardEditPanel
