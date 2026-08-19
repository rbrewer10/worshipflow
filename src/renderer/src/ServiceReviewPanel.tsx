import { AlertTriangle, CheckCircle2, CircleAlert, ExternalLink, Play, Send, X } from 'lucide-react'
import type { ServiceFull } from '../../shared/types'
import type { ServiceReadiness } from './serviceReadiness'
import Modal from './Modal'

export default function ServiceReviewPanel({ service, readiness, onSelectItem, onReplaceItem, onFixIssue, onPublish, onOpenLive, onClose }: {
  service: ServiceFull
  readiness: ServiceReadiness
  onSelectItem: (id: number) => void
  onReplaceItem: (id: number) => void
  onFixIssue: (issueId: string) => void
  onPublish: () => void
  onOpenLive?: () => void
  onClose: () => void
}): JSX.Element {
  const actionLabel = (issue: ServiceReadiness['issues'][number]): string => {
    if (issue.itemId != null) {
      if (issue.id.startsWith('placeholder-') || issue.id.startsWith('missing-song-')) return 'Replace'
      if (issue.id.startsWith('background-')) return 'Style'
      return 'Open'
    }
    if (issue.id === 'date') return 'Set date'
    if (issue.id === 'team') return 'Add team'
    if (issue.id === 'empty') return 'Add content'
    return 'Fix'
  }

  const renderIssue = (issue: ServiceReadiness['issues'][number]): JSX.Element => (
    <div key={issue.id} className={`flex items-start gap-3 rounded-xl border p-3 ${issue.level === 'blocking' ? 'border-amber-500/25 bg-amber-500/[0.06]' : 'border-border bg-panel'}`}>
      {issue.level === 'blocking' ? <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" /> : <CircleAlert size={16} className="mt-0.5 shrink-0 text-content-tertiary" />}
      <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{issue.label}</div><div className="mt-0.5 text-xs text-content-secondary">{issue.detail}</div></div>
      {issue.itemId != null ? ((issue.id.startsWith('placeholder-') || issue.id.startsWith('missing-song-')) ? <button onClick={() => { onReplaceItem(issue.itemId as number); onClose() }} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300">{actionLabel(issue)} <ExternalLink size={12} /></button> : <button onClick={() => { onSelectItem(issue.itemId as number); onClose() }} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300">{actionLabel(issue)} <ExternalLink size={12} /></button>) : <button onClick={() => { onFixIssue(issue.id); onClose() }} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300">{actionLabel(issue)} <ExternalLink size={12} /></button>}
    </div>
  )

  return (
    <Modal onClose={onClose} labelledBy="service-review-title" className="flex max-h-[calc(100vh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-panel-raised p-6 text-content-primary shadow-2xl">
      <div className="mb-5 flex shrink-0 items-start justify-between gap-4">
        <div>
          <div className={`mb-2 flex h-10 w-10 items-center justify-center rounded-xl ${readiness.ready ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
            {readiness.ready ? <CheckCircle2 size={20} /> : <CircleAlert size={20} />}
          </div>
          <h2 id="service-review-title" className="text-xl font-semibold">Sunday readiness</h2>
          <p className="mt-1 text-sm text-content-secondary">{service.name}{service.service_date ? ` · ${service.service_date}` : ''}</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-content-tertiary hover:text-content-primary"><X size={18} /></button>
      </div>

      <div className="mb-5 grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-3">
        <div className={`rounded-xl border p-3 ${readiness.blocking.length ? 'border-amber-500/25 bg-amber-500/[0.06]' : 'border-emerald-500/25 bg-emerald-500/[0.06]'}`}><div className="text-[10px] font-bold uppercase tracking-widest text-content-tertiary">Blockers</div><div className={`mt-1 text-lg font-semibold ${readiness.blocking.length ? 'text-amber-400' : 'text-emerald-400'}`}>{readiness.blocking.length || 'None'}</div></div>
        <div className="rounded-xl border border-border bg-panel p-3"><div className="text-[10px] font-bold uppercase tracking-widest text-content-tertiary">Warnings</div><div className="mt-1 text-lg font-semibold text-content-primary">{readiness.warnings.length || 'None'}</div></div>
        <div className="rounded-xl border border-border bg-panel p-3"><div className="text-[10px] font-bold uppercase tracking-widest text-content-tertiary">Status</div><div className={`mt-1 text-sm font-semibold ${readiness.ready ? 'text-emerald-400' : 'text-amber-400'}`}>{readiness.ready ? 'Ready' : 'Needs work'}</div></div>
      </div>

      {readiness.issues.length === 0 ? (
        <div className="mb-5 shrink-0 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] p-4"><div className="flex items-center gap-2 text-sm font-semibold text-emerald-400"><CheckCircle2 size={16} /> {service.published_at ? 'Published and ready for Live Control.' : 'This service is ready to publish.'}</div><p className="mt-1 text-xs text-content-secondary">The date, order, and content are ready for Sunday.</p></div>
      ) : (
        <div className="mb-5 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {readiness.blocking.length > 0 && <section><div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-amber-400">Must fix before publishing</div><div className="space-y-2">{readiness.blocking.map(renderIssue)}</div></section>}
          {readiness.warnings.length > 0 && <section><div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-content-tertiary">Recommended before Sunday</div><div className="space-y-2">{readiness.warnings.map(renderIssue)}</div></section>}
        </div>
      )}

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="text-xs text-content-tertiary">{readiness.blocking.length} blocking · {readiness.warnings.length} warning{readiness.warnings.length === 1 ? '' : 's'}</div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {service.published_at && onOpenLive ? (
            <>
              <button onClick={onPublish} disabled={!readiness.ready} className="btn disabled:cursor-not-allowed disabled:opacity-40"><Send size={14} /> Update publish</button>
              <button onClick={onOpenLive} disabled={!readiness.ready} className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"><Play size={14} /> Open Live Control</button>
            </>
          ) : (
            <button onClick={onPublish} disabled={!readiness.ready} className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"><Send size={14} /> Publish service</button>
          )}
        </div>
      </div>
    </Modal>
  )
}
