import { CalendarDays, FilePlus2, HelpCircle, ListChecks, Music2, Sparkles, X } from 'lucide-react'
import Modal from './Modal'

export interface SundayTemplateChoice {
  id: string
  name: string
  description?: string
  items: any[]
  theme: string | null
  themeColors: any | null
  builtIn?: boolean
}

function templateStats(template: SundayTemplateChoice): { items: number; songs: number; placeholders: number; sections: string[] } {
  const items = template.items.filter((item) => item.type !== 'header')
  return {
    items: items.length,
    songs: items.filter((item) => item.type === 'song').length,
    placeholders: items.filter((item) => item.type === 'placeholder').length,
    sections: template.items.filter((item) => item.type === 'header').map((item) => (item.payload?.label as string | undefined) ?? 'Section').slice(0, 4)
  }
}

export default function StartSundayModal({ name, date, templates, loading, onNameChange, onDateChange, onStart, onClose }: {
  name: string
  date: string
  templates: SundayTemplateChoice[]
  loading: boolean
  onNameChange: (value: string) => void
  onDateChange: (value: string) => void
  onStart: (template: SundayTemplateChoice | null) => void
  onClose: () => void
}): JSX.Element {
  return (
    <Modal onClose={onClose} labelledBy="start-sunday-title" className="w-full max-w-2xl rounded-2xl border border-border bg-panel-raised p-6 text-content-primary shadow-2xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/25 bg-blue-500/10 text-blue-400"><Sparkles size={20} /></div>
          <h2 id="start-sunday-title" className="text-xl font-semibold">Start this Sunday</h2>
          <p className="mt-1 text-sm text-content-secondary">Create a plan with the right date and a repeatable starting flow.</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-content-tertiary hover:text-content-primary"><X size={18} /></button>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-content-secondary">
          Service name
          <input value={name} onChange={(e) => onNameChange(e.target.value)} className="mt-1.5 w-full" placeholder="Sunday Worship" />
        </label>
        <label className="text-xs font-semibold text-content-secondary">
          Sunday date
          <span className="relative mt-1.5 block">
            <CalendarDays size={14} className="pointer-events-none absolute left-3 top-3 text-content-tertiary" />
            <input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} className="w-full pl-9" />
          </span>
        </label>
      </div>

      <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-content-tertiary">Choose your starting point</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button onClick={() => onStart(null)} disabled={loading || !name.trim()} className="flex min-h-32 flex-col items-start gap-3 rounded-xl border border-blue-500/40 bg-blue-500/10 p-3 text-left transition-colors hover:bg-blue-500/15 disabled:opacity-50">
          <div className="flex w-full items-center justify-between"><FilePlus2 size={18} className="text-blue-400" /><span className="text-xs font-semibold text-blue-400">Start</span></div>
          <span className="min-w-0"><span className="block text-sm font-semibold">Blank Sunday plan</span><span className="mt-1 block text-xs leading-relaxed text-content-secondary">Build the order from scratch with the quick-add tools.</span></span>
        </button>
        {templates.map((template) => {
          const stats = templateStats(template)
          return (
            <button key={template.id} onClick={() => onStart(template)} disabled={loading || !name.trim()} className="flex min-h-32 flex-col items-start gap-2 rounded-xl border border-border bg-panel p-3 text-left transition-colors hover:border-blue-500/50 hover:bg-panel-raised disabled:opacity-50">
              <div className="flex w-full items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><Sparkles size={16} className="shrink-0 text-amber-400" /><span className="truncate text-sm font-semibold">{template.name}</span></div><span className="shrink-0 text-xs font-semibold text-content-secondary">Use</span></div>
              <span className="line-clamp-2 text-xs leading-relaxed text-content-secondary">{template.description || 'Ready to customize for Sunday.'}</span>
              <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold text-content-tertiary">
                <span className="inline-flex items-center gap-1"><ListChecks size={11} /> {stats.items} items</span>
                {stats.songs > 0 && <span className="inline-flex items-center gap-1"><Music2 size={11} /> {stats.songs} song{stats.songs === 1 ? '' : 's'}</span>}
                {stats.placeholders > 0 && <span className="inline-flex items-center gap-1 text-amber-400"><HelpCircle size={11} /> {stats.placeholders} to fill</span>}
              </div>
              {stats.sections.length > 0 && <div className="truncate text-[10px] text-content-tertiary">{stats.sections.join(' · ')}</div>}
            </button>
          )
        })}
        {templates.length === 0 && <p className="rounded-lg border border-dashed border-border-strong p-3 text-xs text-content-tertiary">No saved templates yet. Start blank, then save the finished plan as a template for next Sunday.</p>}
      </div>
    </Modal>
  )
}
