import { useEffect, useState } from 'react'
import type { ServiceItem, SongFull, SongInput, ThemeColors } from '../../shared/types'
import { ItemEditor } from './ItemEditor'
import { parseSections, sectionsToText } from './songText'
import { analyzeAndLabelSections, previewAutoLabels } from './autoLabel'

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
  const [songSaved, setSongSaved] = useState(false)
  const [showAutoLabelPreview, setShowAutoLabelPreview] = useState(false)
  const [autoLabelPreview, setAutoLabelPreview] = useState('')
  const [autoLabelAnalyses, setAutoLabelAnalyses] = useState<any[]>([])
  const [showChords, setShowChords] = useState(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setP(item.payload ?? {}); setNotes(item.notes ?? ''); setSongSaved(false)
    if (item.type === 'song' && item.ref_id != null) {
      window.wf.songGet(item.ref_id).then((s) => { setSongFull(s); setLyrics(s ? sectionsToText(s) : '') })
    } else {
      setSongFull(null); setLyrics('')
    }
  }, [item.id])

  const pickSongBg = async (): Promise<void> => {
    if (!songFull) return
    const result = await window.wf.dialogOpenFile()
    if (!result.canceled && result.filePaths[0]) {
      await window.wf.songSetBackground(songFull.id, result.filePaths[0])
      window.wf.songGet(songFull.id).then(setSongFull)
      onChanged()
    }
  }

  const removeSongBg = async (): Promise<void> => {
    if (!songFull) return
    await window.wf.songSetBackground(songFull.id, null)
    window.wf.songGet(songFull.id).then(setSongFull)
    onChanged()
  }

  const saveSong = (): void => {
    if (!songFull) return
    const sections = parseSections(lyrics)
    const validArr = (songFull.arrangement ?? []).filter((i) => i < sections.length)
    const input: SongInput = {
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
      blurBehindText: songFull.blurBehindText
    }
    window.wf.songUpdate(songFull.id, input).then(() => {
      setSongSaved(true)
      setTimeout(() => setSongSaved(false), 2500)
      onChanged()
    })
  }

  const savePayload = (next: Record<string, unknown>): void => {
    setP(next)
    window.wf.serviceSetItemPayload(item.id, next).then(onChanged)
  }
  const saveNotes = (): void => { window.wf.serviceUpdateItemNotes(item.id, notes.trim() || null).then(onChanged) }

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
      songFull={songFull}
      lyrics={lyrics}
      showChords={showChords}
      showAutoLabelPreview={showAutoLabelPreview}
      autoLabelPreview={autoLabelPreview}
      autoLabelAnalyses={autoLabelAnalyses}
      notes={notes}
      onLyricsChange={setLyrics}
      onNotesChange={setNotes}
      onSaveSong={saveSong}
      onShowChordsToggle={() => setShowChords(!showChords)}
      onAutoLabelClick={handleAutoLabel}
      onAutoLabelPreviewClose={() => setShowAutoLabelPreview(false)}
      onAutoLabelApply={applyAutoLabels}
      onBackgroundClick={pickSongBg}
      onRemoveBackground={removeSongBg}
      onSaveNotes={saveNotes}
      setAutoLabelPreview={setAutoLabelPreview}
      setAutoLabelAnalyses={setAutoLabelAnalyses}
      setShowAutoLabelPreview={setShowAutoLabelPreview}
      savePayload={savePayload}
    />
  )
}

export default CardEditPanel
