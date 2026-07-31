import { Check, Loader2, TriangleAlert } from 'lucide-react'
import type { SaveStatus } from './useAutosave'

// Small status pill for editors using useAutosave — the visible half of the
// "dirty/saving/saved/failed" state the audit asked for. 'idle' renders
// nothing (nothing has changed yet, so there's nothing to report).
function SaveStatusBadge({ status, error, onRetry }: { status: SaveStatus; error?: string | null; onRetry?: () => void }): JSX.Element | null {
  if (status === 'idle') return null
  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
        <Loader2 size={12} className="animate-spin" /> Saving…
      </span>
    )
  }
  if (status === 'saved') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
        <Check size={12} /> Saved
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-red-600" title={error ?? undefined}>
      <TriangleAlert size={12} /> Save failed
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-semibold underline hover:no-underline">
          Retry
        </button>
      )}
    </span>
  )
}

export default SaveStatusBadge
