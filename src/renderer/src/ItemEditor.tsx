import { memo, useEffect } from 'react'
import { Trash2, X } from 'lucide-react'
import type { ItemStyle, ServiceItem, SongFull, ThemeColors } from '../../shared/types'
import { NON_LIVE_TYPES } from '../../shared/types'
import type { SermonVerse } from '../../shared/sermonVerses'
import ServiceSlidePreview from './ServiceSlidePreview'
import ItemBackgroundPanel from './ItemBackgroundPanel'
import { CardSongEditor } from './editors/CardSongEditor'
import { ScriptureEditor } from './editors/ScriptureEditor'
import { TextEditor } from './editors/TextEditor'
import { ImageEditor } from './editors/ImageEditor'
import { CountdownEditor } from './editors/CountdownEditor'
import { TickerEditor } from './editors/TickerEditor'
import { SermonEditor } from './editors/SermonEditor'
import { SermonVersesEditor } from './editors/SermonVersesEditor'
import LiveCallEditor from './editors/LiveCallEditor'
import AnnouncementItemEditor from './AnnouncementItemEditor'
import { HeaderEditor } from './editors/HeaderEditor'
import { PlaceholderEditor } from './editors/PlaceholderEditor'
import SaveStatusBadge from './SaveStatusBadge'
import type { SaveStatus } from './useAutosave'

interface ItemEditorProps {
  item: ServiceItem
  serviceTheme: string | null
  serviceColors: ThemeColors | null
  showPreview?: boolean
  onClose: () => void
  onChanged: () => void
  onDelete: (item: ServiceItem) => void
  saveStatus: SaveStatus
  saveError: string | null
  onRetrySave: () => void
  songFull: SongFull | null
  lyrics: string
  showChords: boolean
  showAutoLabelPreview: boolean
  autoLabelPreview: string
  autoLabelAnalyses: any[]
  notes: string
  onLyricsChange: (lyrics: string) => void
  onNotesChange: (notes: string) => void
  onSaveSong: () => void
  onShowChordsToggle: () => void
  onAutoLabelClick: () => void
  onAutoLabelPreviewClose: () => void
  onAutoLabelApply: (preview: string) => void
  onBackgroundClick: () => void
  onRemoveBackground: () => void
  onSaveNotes: () => void
  setAutoLabelPreview: (preview: string) => void
  setAutoLabelAnalyses: (analyses: any[]) => void
  setShowAutoLabelPreview: (show: boolean) => void
  savePayload: (payload: Record<string, unknown>) => void
  applySongBackground: (path: string | null) => void
  onToggleSongBlur: () => void
  applyItemStyle: (style: ItemStyle | null) => void
}

export const ItemEditor = memo(function ItemEditor({
  item,
  serviceTheme,
  serviceColors,
  showPreview,
  onClose,
  onChanged,
  onDelete,
  saveStatus,
  saveError,
  onRetrySave,
  songFull,
  lyrics,
  showChords,
  showAutoLabelPreview,
  autoLabelPreview,
  autoLabelAnalyses,
  notes,
  onLyricsChange,
  onNotesChange,
  onSaveSong,
  onShowChordsToggle,
  onAutoLabelClick,
  onAutoLabelPreviewClose,
  onAutoLabelApply,
  onBackgroundClick,
  onRemoveBackground,
  onSaveNotes,
  setAutoLabelPreview,
  setAutoLabelAnalyses,
  setShowAutoLabelPreview,
  savePayload,
  applySongBackground,
  onToggleSongBlur,
  applyItemStyle
}: ItemEditorProps): JSX.Element {
  const payload = item.payload ?? {}

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="card-lg flex flex-col gap-3 overflow-auto text-content-primary animate-[fade-in_0.15s_ease-out]">
      <div className="flex items-center justify-between">
        <h3 className="section-title capitalize">{item.type}</h3>
        <div className="flex items-center gap-2">
          <SaveStatusBadge status={saveStatus} error={saveError} onRetry={onRetrySave} />
          <button onClick={onClose} aria-label="Close item editor" className="btn-pill text-xs"><X size={12} /> Close</button>
        </div>
      </div>

      {/* Live slide preview — headers/placeholders never go live, nothing to preview */}
      {showPreview !== false && !NON_LIVE_TYPES.includes(item.type) && (
        <ServiceSlidePreview item={item} serviceTheme={serviceTheme} serviceColors={serviceColors} songFull={songFull} />
      )}

      {/* Type-specific editors */}
      {item.type === 'song' && (
        <CardSongEditor
          songFull={songFull}
          lyrics={lyrics}
          showChords={showChords}
          showAutoLabelPreview={showAutoLabelPreview}
          autoLabelPreview={autoLabelPreview}
          autoLabelAnalyses={autoLabelAnalyses}
          onLyricsChange={onLyricsChange}
          onSave={onSaveSong}
          onShowChordsToggle={onShowChordsToggle}
          onAutoLabelClick={onAutoLabelClick}
          onAutoLabelPreviewClose={onAutoLabelPreviewClose}
          onAutoLabelApply={onAutoLabelApply}
          onBackgroundClick={onBackgroundClick}
          onRemoveBackground={onRemoveBackground}
          setAutoLabelPreview={setAutoLabelPreview}
          setAutoLabelAnalyses={setAutoLabelAnalyses}
          setShowAutoLabelPreview={setShowAutoLabelPreview}
        />
      )}

      {item.type === 'scripture' && (
        <ScriptureEditor
          reference={(payload.reference as string) ?? ''}
          fontScale={(payload.fontScale as number) ?? 6}
          onReferenceChange={(ref) => savePayload({ ...payload, reference: ref })}
          onFontScaleChange={(scale) => savePayload({ ...payload, fontScale: scale })}
        />
      )}

      {item.type === 'text' && (
        <TextEditor
          title={(payload.title as string) ?? ''}
          body={(payload.body as string) ?? ''}
          fontScale={(payload.fontScale as number) ?? 6}
          textAlign={(payload.textAlign as string) ?? 'center'}
          onTitleChange={(title) => savePayload({ ...payload, title })}
          onBodyChange={(body) => savePayload({ ...payload, body })}
          onFontScaleChange={(scale) => savePayload({ ...payload, fontScale: scale })}
          onTextAlignChange={(align) => savePayload({ ...payload, textAlign: align })}
        />
      )}

      {item.type === 'image' && (
        <ImageEditor
          imagePath={(payload.path as string) ?? '—'}
          onPathChange={(path) => savePayload({ ...payload, path })}
        />
      )}

      {(item.type === 'countdown' || item.type === 'welcome') && (
        <CountdownEditor
          seconds={(payload.seconds as number) ?? 300}
          onSecondsChange={(secs) => savePayload({ ...payload, seconds: secs })}
        />
      )}

      {item.type === 'ticker' && (
        <TickerEditor
          text={(payload.text as string) ?? ''}
          onTextChange={(text) => savePayload({ ...payload, text })}
        />
      )}

      {item.type === 'sermon' && (
        <>
          <SermonEditor
            title={(payload.title as string) ?? ''}
            speaker={(payload.speaker as string) ?? ''}
            passage={(payload.passage as string) ?? ''}
            onTitleChange={(title) => savePayload({ ...payload, title })}
            onSpeakerChange={(speaker) => savePayload({ ...payload, speaker })}
            onPassageChange={(passage) => savePayload({ ...payload, passage })}
          />
          <SermonVersesEditor
            verses={(payload.verses as SermonVerse[] | undefined) ?? []}
            onChange={(verses) => savePayload({ ...payload, verses })}
          />
        </>
      )}

      {item.type === 'announcement' && (
        <AnnouncementItemEditor
          refId={item.ref_id}
          refIds={(payload.refIds as number[] | undefined) ?? []}
          onChange={(refIds) => savePayload({ ...payload, refIds })}
          fontScale={(payload.fontScale as number) ?? 6}
          onFontScaleChange={(scale) => savePayload({ ...payload, fontScale: scale })}
        />
      )}

      {item.type === 'header' && (
        <HeaderEditor
          label={(payload.label as string) ?? ''}
          color={(payload.color as string) ?? '#64748b'}
          onLabelChange={(label) => savePayload({ ...payload, label })}
          onColorChange={(color) => savePayload({ ...payload, color })}
        />
      )}

      {item.type === 'placeholder' && (
        <PlaceholderEditor
          label={(payload.label as string) ?? ''}
          onLabelChange={(label) => savePayload({ ...payload, label })}
        />
      )}

      {/* The call itself is the on-screen content — nothing to configure beyond
          whether it's connected, which LiveCallEditor shows directly. */}
      {item.type === 'livecall' && <LiveCallEditor />}

      {/* ── Background & Color — headers/placeholders never render on screen,
          and a live call has no background to pick: the video IS the screen. ── */}
      {!NON_LIVE_TYPES.includes(item.type) && item.type !== 'livecall' && (
        <div className="border-t border-border pt-3">
          <ItemBackgroundPanel
            item={item}
            songFull={songFull}
            onChanged={onChanged}
            savePayload={savePayload}
            applySongBackground={applySongBackground}
            onToggleSongBlur={onToggleSongBlur}
            applyItemStyle={applyItemStyle}
            saveStatus={saveStatus}
            saveError={saveError}
            onRetrySave={onRetrySave}
          />
        </div>
      )}

      {/* Notes */}
      <div>
        <label htmlFor="item-notes" className="section-header block mb-2">Notes</label>
        <textarea id="item-notes" value={notes} onChange={(e) => onNotesChange(e.target.value)} onBlur={onSaveNotes} rows={2}
          placeholder="Notes for operator / pastor…"
          aria-label="Notes for operator and pastor" />
      </div>

      <button onClick={() => onDelete(item)}
        aria-label={`Delete ${item.type} item: ${item.title}`}
        className="mt-auto btn-danger text-xs">
        <Trash2 size={13} /> Delete item
      </button>
    </div>
  )
})
