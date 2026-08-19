import { useState } from 'react'
import { CalendarDays, CheckCircle2, CircleAlert, Plus, Image as ImageIcon, FileUp, FolderOpen, Trash2, ExternalLink, Save, Printer, ChevronDown, ChevronUp, ListMusic } from 'lucide-react'
import type { ServiceItem } from '../../shared/types'
import ServiceEditor from './ServiceEditor'
import { useService } from './ServiceContext'
import { TemplatesPanel } from './TemplatesPanel'
import Modal from './Modal'
import StartSundayModal, { type SundayTemplateChoice } from './StartSundayModal'
import { DEFAULT_SERVICE_TEMPLATES } from './defaultServiceTemplates'
import { notifyLocal, notifyLocalAction } from './NotifyToasts'

function nextSundayISO(): string {
  const date = new Date()
  const daysUntilSunday = (7 - date.getDay()) % 7 || 7
  date.setDate(date.getDate() + daysUntilSunday)
  return date.toISOString().slice(0, 10)
}

function serviceDateLabel(value: string | null): string {
  if (!value) return 'Date not set'
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function ServiceBuilder({ onOpenLive }: { onOpenLive?: () => void }): JSX.Element {
  const { services, activeServiceId: openId, activeService: service, selectService, refreshServices, reloadActiveService } = useService()
  const [newName, setNewName] = useState('')
  const [importing, setImporting] = useState(false)
  const [showImportTools, setShowImportTools] = useState(false)
  const [startSundayOpen, setStartSundayOpen] = useState(false)
  const [startName, setStartName] = useState('Sunday Worship')
  const [startDate, setStartDate] = useState(nextSundayISO)
  const [startTemplates, setStartTemplates] = useState<SundayTemplateChoice[]>([])
  const [startingSunday, setStartingSunday] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null)

  const open = (id: number): void => { selectService(id) }

  const create = async (): Promise<void> => {
    if (!newName.trim()) return
    const id = await window.wf.serviceCreate(newName.trim(), nextSundayISO())
    setNewName('')
    refreshServices()
    open(id)
  }

  const openStartSunday = async (): Promise<void> => {
    try {
      const savedTemplates = await window.wf.templatesList()
      setStartTemplates([...DEFAULT_SERVICE_TEMPLATES, ...(savedTemplates as SundayTemplateChoice[])])
    } catch {
      setStartTemplates(DEFAULT_SERVICE_TEMPLATES)
    }
    setStartName(newName.trim() || 'Sunday Worship')
    setStartDate(nextSundayISO())
    setStartSundayOpen(true)
  }

  const startSunday = async (template: SundayTemplateChoice | null): Promise<void> => {
    if (!startName.trim()) return
    setStartingSunday(true)
    try {
      const id = await window.wf.serviceCreate(startName.trim(), startDate || nextSundayISO())
      if (template) {
        for (const item of template.items) {
          const newItemId = await window.wf.serviceAddItem(id, {
            type: item.type,
            ref_id: item.ref_id ?? null,
            payload: item.payload ?? {},
            track: item.track ?? 'main'
          })
          if (item.notes) await window.wf.serviceUpdateItemNotes(newItemId, item.notes)
          if (item.style) await window.wf.serviceSetItemStyle(newItemId, item.style)
          if (item.zoneRouting) await window.wf.zoneSetRouting(newItemId, item.zoneRouting)
        }
        if (template.theme) await window.wf.serviceSetTheme(id, template.theme, template.themeColors ?? null)
      }
      setNewName('')
      setStartSundayOpen(false)
      refreshServices()
      open(id)
    } finally {
      setStartingSunday(false)
    }
  }

  const importImages = async (): Promise<void> => {
    setImporting(true)
    const res = await window.wf.serviceImportImages()
    setImporting(false)
    if (res) { refreshServices(); open(res.id) }
  }
  const importPptx = async (): Promise<void> => {
    setImporting(true)
    const res = await window.wf.serviceImportPptx()
    setImporting(false)
    if (res) { refreshServices(); open(res.id) }
  }

  const exportService = async (): Promise<void> => {
    if (openId == null) return
    await window.wf.serviceExport(openId)
  }

  const importServiceFile = async (): Promise<void> => {
    const res = await window.wf.serviceImportFile()
    if (!res.canceled && res.serviceId != null) {
      refreshServices()
      open(res.serviceId)
    }
  }

  const importPlan = async (): Promise<void> => {
    const res = await window.wf.serviceImportPlan()
    if (res.canceled || res.serviceId == null) return
    refreshServices()
    open(res.serviceId)
    if (res.missing.length > 0) {
      window.alert(
        `Imported the plan. ${res.matched} song${res.matched === 1 ? '' : 's'} matched your library.\n\n` +
          `These songs weren't found (added as placeholders — add them to your Song Library):\n• ` +
          res.missing.join('\n• ')
      )
    }
  }

  const del = (id: number): void => {
    const svc = services.find((s) => s.id === id)
    setConfirmDelete({ id, name: svc?.name ?? 'Service' })
  }
  const confirmServiceDelete = async (): Promise<void> => {
    if (!confirmDelete) return
    await window.wf.serviceDelete(confirmDelete.id)
    if (openId === confirmDelete.id) selectService(null)
    refreshServices()
    setConfirmDelete(null)
  }

  const handlePrint = (): void => window.print()

  const loadTemplateIntoService = async (items: ServiceItem[], theme: string | null, themeColors: any | null): Promise<void> => {
    if (!service) return
    const previousItems = structuredClone(service.items)
    const previousTheme = service.theme
    const previousThemeColors = service.themeColors

    const restorePreviousService = async (): Promise<void> => {
      try {
        const latest = await window.wf.serviceGet(service.id)
        if (!latest) return
        for (const item of latest.items) await window.wf.serviceRemoveItem(item.id)
        for (const item of previousItems) {
          const restoredId = await window.wf.serviceAddItem(service.id, {
            type: item.type,
            ref_id: item.ref_id,
            payload: item.payload,
            track: item.track
          })
          if (item.notes) await window.wf.serviceUpdateItemNotes(restoredId, item.notes)
          if (item.style) await window.wf.serviceSetItemStyle(restoredId, item.style)
          if (item.zoneRouting) await window.wf.zoneSetRouting(restoredId, item.zoneRouting)
        }
        await window.wf.serviceSetTheme(service.id, previousTheme, previousThemeColors)
        refreshServices()
        reloadActiveService()
        notifyLocal('Restored the previous service order.', 'info')
      } catch (err) {
        notifyLocal(`Could not restore the previous service: ${err instanceof Error ? err.message : String(err)}`, 'error')
      }
    }

    try {
      // Remove all current items
      for (const item of service.items) {
        await window.wf.serviceRemoveItem(item.id)
      }
      // Add template items
      for (const item of items) {
        const newItem = {
          type: item.type,
          ref_id: item.ref_id,
          payload: item.payload
        }
        await window.wf.serviceAddItem(service.id, newItem)
      }
      // Set theme if provided
      await window.wf.serviceSetTheme(service.id, theme, themeColors)
      refreshServices()
      reloadActiveService()
      notifyLocalAction('Template loaded into this service.', 'Undo', () => { void restorePreviousService() })
    } catch (err) {
      notifyLocal(`Failed to load template: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  const items = service?.items ?? []

  return (
    <>
      <style>{`
        @media print {
          body > * { display: none !important; }
          #wf-print { display: block !important; }
        }
        #wf-print { display: none; }
      `}</style>
      <div id="wf-print" style={{ fontFamily: 'sans-serif', color: '#000', padding: 24 }}>
        {service && (
          <>
            <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>{service.name}</h1>
            {service.service_date && <p style={{ color: '#666', fontSize: 13, margin: '0 0 16px' }}>{service.service_date}</p>}
            <hr style={{ margin: '12px 0' }} />
            {items.map((item, i) => (
              <div key={item.id} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
                <div style={{ color: '#888', fontSize: 12 }}>#{i + 1} · {item.type.toUpperCase()}</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{item.title}</div>
                {item.notes && <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{item.notes}</div>}
              </div>
            ))}
          </>
        )}
      </div>

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)} labelledBy="delete-service-title" className="card-lg max-w-sm">
            <h3 id="delete-service-title" className="section-title">Delete Service?</h3>
            <p className="mb-4 text-sm text-content-secondary">
              Are you sure you want to delete <span className="font-semibold text-content-primary">{confirmDelete.name}</span>? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)}
                aria-label="Cancel service deletion"
                className="flex-1 btn">
                Cancel
              </button>
              <button onClick={confirmServiceDelete}
                aria-label={`Confirm deletion of service ${confirmDelete.name}`}
                className="flex-1 btn-danger">
                Delete
              </button>
            </div>
        </Modal>
      )}

      {startSundayOpen && (
        <StartSundayModal
          name={startName}
          date={startDate}
          templates={startTemplates}
          loading={startingSunday}
          onNameChange={setStartName}
          onDateChange={setStartDate}
          onStart={(template) => { void startSunday(template) }}
          onClose={() => setStartSundayOpen(false)}
        />
      )}

      <div className="wf-service-builder-shell flex h-full min-h-0 flex-1 gap-3 p-3">
        <h1 className="sr-only">Build Service</h1>
        {/* Services list */}
        <div className="wf-service-list flex w-64 shrink-0 flex-col rounded-xl border border-border bg-panel p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-content-tertiary">Your services</div>
              <div className="text-xs text-content-secondary">{services.length} saved plan{services.length === 1 ? '' : 's'}</div>
            </div>
            <button
              onClick={() => setShowImportTools((v) => !v)}
              className="btn-pill shrink-0 text-[11px]"
              aria-expanded={showImportTools}
              aria-label="Show import options"
            >
              <FolderOpen size={12} /> Import {showImportTools ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
          <div className="mb-3 flex gap-2">
            <label htmlFor="new-service-name" className="sr-only">New service name</label>
            <input id="new-service-name" value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              placeholder="Sunday service name…"
              aria-label="Enter a new service name" />
            <button onClick={openStartSunday} disabled={startingSunday}
              aria-label="Start a Sunday service"
              className="btn-secondary shrink-0 px-2 text-[11px] font-bold"
              title="Start with a Sunday date and optional template">Start Sunday</button>
            <button onClick={create} disabled={!newName.trim()}
              aria-label="Create new service"
              className="btn-primary disabled:opacity-40"><Plus size={15} /></button>
          </div>
          {showImportTools && (
            <div className="mb-3 grid grid-cols-2 gap-1.5 rounded-lg border border-border bg-panel-raised p-1.5">
              <button onClick={importImages} disabled={importing}
                aria-label="Import slides as images (export PowerPoint as PNG first)"
                className="btn-secondary min-h-9 px-2 text-[11px] leading-tight disabled:opacity-50"
                title="Export your PowerPoint slides as images first (File → Save As → PNG)">
                <ImageIcon size={12} /> Slides
              </button>
              <button onClick={importPptx} disabled={importing}
                aria-label="Import PowerPoint file with editable text"
                className="btn-secondary min-h-9 px-2 text-[11px] leading-tight disabled:opacity-50"
                title="Import a .pptx directly — text becomes editable, backgrounds extracted where possible">
                <FileUp size={12} /> PowerPoint
              </button>
              <button onClick={importServiceFile}
                aria-label="Load a saved service file (.wfservice)"
                className="btn min-h-9 px-2 text-[11px] leading-tight"
                title="Load a .wfservice file exported from another computer">
                <FolderOpen size={12} /> Saved file
              </button>
              <button onClick={importPlan}
                aria-label="Import a service plan from the church app"
                className="btn min-h-9 px-2 text-[11px] leading-tight"
                title="Import a .wfplan exported from the Snow Hill Church planning app — songs match your library by title">
                <FileUp size={12} /> Church plan
              </button>
              {importing && <p className="col-span-2 text-center text-[11px] text-content-secondary" role="status" aria-live="polite">Importing…</p>}
            </div>
          )}
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {services.length === 0 && <p className="px-1 py-6 text-center text-sm text-content-secondary">No saved services yet.</p>}
            {services.map((s) => (
              <div key={s.id} onClick={() => open(s.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') open(s.id) }}
                aria-label={`Service: ${s.name}, ${serviceDateLabel(s.service_date)}, ${s.published_at ? 'published' : 'draft'}`}
                aria-pressed={openId === s.id}
                className={`group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 transition-colors min-h-10 ${
                  openId === s.id
                    ? 'bg-blue-500/10 ring-1 ring-blue-500/30 text-content-primary'
                    : 'text-content-secondary hover:bg-panel-raised'
                }`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{s.name}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-content-tertiary">
                      <CalendarDays size={11} className="shrink-0" />
                      <span className="truncate">{serviceDateLabel(s.service_date)}</span>
                      <span className="text-border-strong">·</span>
                      {s.published_at ? <CheckCircle2 size={11} className="shrink-0 text-emerald-400" /> : <CircleAlert size={11} className="shrink-0 text-amber-400" />}
                      <span className={s.published_at ? 'text-emerald-400' : 'text-amber-400'}>{s.published_at ? 'Published' : 'Draft'}</span>
                    </span>
                  </span>
                <button onClick={(e) => { e.stopPropagation(); del(s.id) }}
                  aria-label={`Delete service ${s.name}`}
                  className="btn-danger opacity-60 hover:opacity-100 text-xs py-1">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}

            <div className="mt-3 border-t border-border pt-3">
              <TemplatesPanel
                currentService={service}
                onLoadTemplate={loadTemplateIntoService}
                inline
              />
            </div>
          </div>
        </div>

        {/* Open service */}
        <div className="wf-service-workspace flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-border bg-panel">
          {openId == null ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-sm text-content-secondary">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-400">
                <ListMusic size={22} />
              </div>
              <div>
                <p className="font-semibold text-content-primary">Build this Sunday’s service</p>
                <p className="mt-1 max-w-sm text-xs text-content-secondary">Choose a saved plan, create a new one, or import the order from your church planning app.</p>
              </div>
            </div>
          ) : (
            <ServiceEditor
              serviceId={openId}
              onServiceChanged={reloadActiveService}
              onOpenLive={onOpenLive}
              headerActions={
                <div className="flex gap-2">
                  <button onClick={() => window.wf.serviceOpen(openId)}
                    aria-label="Open service in separate window"
                    className="btn-pill text-xs"
                    title="Open this service in its own window"><ExternalLink size={12} /> Pop out</button>
                  <button onClick={exportService}
                    aria-label="Save service to file"
                    className="btn text-xs"
                    title="Save this service to a file"><Save size={13} /> Save to file</button>
                  <button onClick={handlePrint}
                    aria-label="Print service order"
                    className="btn text-xs"
                    title="Print service order"><Printer size={13} /> Print</button>
                </div>
              }
            />
          )}
        </div>
      </div>
    </>
  )
}

export default ServiceBuilder
