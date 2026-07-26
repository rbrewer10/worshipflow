import { memo, useEffect } from 'react'
import { Trash2, X } from 'lucide-react'
import type { ServiceItem, SongFull, ThemeColors } from '../../shared/types'
import ServiceSlidePreview from './ServiceSlidePreview'
import ItemBackgroundPanel from './ItemBackgroundPanel'
import { SongEditor } from './editors/SongEditor'
import { ScriptureEditor } from './editors/ScriptureEditor'
import { TextEditor } from './editors/TextEditor'
import { ImageEditor } from './editors/ImageEditor'
import { CountdownEditor } from './editors/CountdownEditor'
import { TickerEditor } from './editors/TickerEditor'
import { SermonEditor } from './editors/SermonEditor'
import LiveCallEditor from './editors/LiveCallEditor'
import AnnouncementItemEditor from './AnnouncementItemEditor'

interface ItemEditorProps {
  item: ServiceItem
  serviceTheme: string | null
  serviceColors: ThemeColors | null
  showPreview?: boolean
  onClose: () => void
  onChanged: () => void
  onDelete: (item: ServiceItem) => void
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
}

export const ItemEditor = memo(function ItemEditor({
  item,
  serviceTheme,
  serviceColors,
  showPreview,
  onClose,
  onChanged,
  onDelete,
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
  savePayload
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
    <div className="card-lg flex w-80 shrink-0 flex-col gap-3 overflow-auto text-slate-900 animate-[fade-in_0.15s_ease-out]">
      <div className="flex items-center justify-between">
        <h3 className="section-title capitalize">{item.type}</h3>
        <button onClick={onClose} aria-label="Close item editor" className="btn-pill text-xs"><X size={12} /> Close</button>
      </div>

      {/* Live slide preview */}
      {showPreview !== false && (
        <ServiceSlidePreview item={item} serviceTheme={serviceTheme} serviceColors={serviceColors} songFull={songFull} />
      )}

      {/* Type-specific editors */}
      {item.type === 'song' && (
        <SongEditor
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
          onReferenceChange={(ref) => savePayload({ ...payload, reference: ref })}
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
        <SermonEditor
          title={(payload.title as string) ?? ''}
          speaker={(payload.speaker as string) ?? ''}
          passage={(payload.passage as string) ?? ''}
          onTitleChange={(title) => savePayload({ ...payload, title })}
          onSpeakerChange={(speaker) => savePayload({ ...payload, speaker })}
          onPassageChange={(passage) => savePayload({ ...payload, passage })}
        />
      )}

      {item.type === 'announcement' && (
        <AnnouncementItemEditor refId={item.ref_id} />
      )}

      {item.type === 'livecall' && <LiveCallEditor />}

      {/* ── Background & Color ── */}
      <div className="border-t border-slate-200 pt-3">
        <ItemBackgroundPanel item={item} songFull={songFull} onChanged={onChanged} />
      </div>

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
