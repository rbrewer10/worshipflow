import type { TrackId } from '../../shared/types'

function LayerStrip({ track, textHidden, bgHidden, overlayOn }: {
  track: TrackId
  textHidden: boolean
  bgHidden: boolean
  overlayOn: boolean
}): JSX.Element {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-content-tertiary">Layers</div>
      <div className="grid grid-cols-3 gap-1.5">
        <button
          onClick={() => void window.wf.liveSetLayers(track, { textHidden: !textHidden })}
          title="Hide lyrics, keep the background (C)"
          className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${
            textHidden ? 'border-amber-500/50 bg-amber-500/15 text-amber-300' : 'border-border bg-panel-raised text-content-secondary'
          }`}
        >
          {textHidden ? 'Lyrics off' : 'Clear lyrics'}
        </button>
        <button
          onClick={() => void window.wf.liveSetLayers(track, { bgHidden: !bgHidden })}
          title="Hide the background, keep the words (G)"
          className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${
            bgHidden ? 'border-amber-500/50 bg-amber-500/15 text-amber-300' : 'border-border bg-panel-raised text-content-secondary'
          }`}
        >
          {bgHidden ? 'BG off' : 'Clear BG'}
        </button>
        <button
          onClick={() => void window.wf.liveSetOverlayTicker(track, null)}
          title="Clear the lower-third overlay (X)"
          disabled={!overlayOn}
          className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold disabled:opacity-40 ${
            overlayOn ? 'border-amber-500/50 bg-amber-500/15 text-amber-300' : 'border-border bg-panel-raised text-content-secondary'
          }`}
        >
          Clear overlay
        </button>
      </div>
    </div>
  )
}

export default LayerStrip
