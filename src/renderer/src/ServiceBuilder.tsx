import { useState } from 'react'
import { Plus, Image as ImageIcon, FileUp, FolderOpen, Layers, Trash2, ExternalLink, Save, Printer } from 'lucide-react'
import type { ServiceItem } from '../../shared/types'
import ServiceEditor from './ServiceEditor'
import { useService } from './ServiceContext'
import { TemplatesPanel } from './TemplatesPanel'

function ServiceBuilder(): JSX.Element {
  const { services, activeServiceId: openId, activeService: service, selectService, refreshServices, reloadActiveService } = useService()
  const [newName, setNewName] = useState('')
  const [importing, setImporting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)

  const open = (id: number): void => { selectService(id) }

  const create = async (): Promise<void> => {
    if (!newName.trim()) return
    const id = await window.wf.serviceCreate(newName.trim())
    setNewName('')
    refreshServices()
    open(id)
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
      if (theme) {
        await window.wf.serviceSetTheme(service.id, theme, themeColors)
      }
      refreshServices()
      reloadActiveService()
    } catch (err) {
      console.error('Failed to load template:', err)
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="card-lg max-w-sm">
            <h3 className="section-title">Delete Service?</h3>
            <p className="mb-4 text-sm text-slate-600">
              Are you sure you want to delete <span className="font-semibold text-slate-900">{confirmDelete.name}</span>? This cannot be undone.
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
          </div>
        </div>
      )}

      <div className="flex h-full min-h-0 gap-4 bg-[#e9ecf1] p-4">
        {/* Services list */}
        <div className="flex w-72 flex-col rounded-xl border border-slate-200 bg-[#f4f6f9] p-3">
          <div className="mb-3 flex gap-2">
            <label htmlFor="new-service-name" className="sr-only">New service name</label>
            <input id="new-service-name" value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              placeholder="New service name…"
              aria-label="Enter a new service name" />
            <button onClick={create} disabled={!newName.trim()}
              aria-label="Create new service"
              className="btn-primary disabled:opacity-40"><Plus size={15} /></button>
          </div>
          <div className="mb-3 space-y-1.5">
            <button onClick={importImages} disabled={importing}
              aria-label="Import slides as images (export PowerPoint as PNG first)"
              className="w-full btn-secondary text-xs disabled:opacity-50"
              title="Export your PowerPoint slides as images first (File → Save As → PNG)">
              <ImageIcon size={13} /> Import slides as images
            </button>
            <button onClick={importPptx} disabled={importing}
              aria-label="Import PowerPoint file with editable text"
              className="w-full btn-secondary text-xs disabled:opacity-50"
              title="Import a .pptx directly — text becomes editable, backgrounds extracted where possible">
              <FileUp size={13} /> Import .pptx (editable text)
            </button>
            <button onClick={importServiceFile}
              aria-label="Load a saved service file (.wfservice)"
              className="w-full btn text-xs"
              title="Load a .wfservice file exported from another computer">
              <FolderOpen size={13} /> Load saved service (.wfservice)
            </button>
            <button onClick={() => setShowTemplates(true)}
              aria-label="Manage service templates"
              className="w-full btn text-xs"
              title="Save, load, or manage service templates for quick setup">
              <Layers size={13} /> Service Templates
            </button>
            {importing && <p className="text-center text-[11px] text-slate-600" role="status" aria-live="polite">Importing…</p>}
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-auto">
            {services.length === 0 && <p className="px-1 py-6 text-center text-sm text-slate-500">No saved services yet.</p>}
            {services.map((s) => (
              <div key={s.id} onClick={() => open(s.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') open(s.id) }}
                aria-label={`Service: ${s.name}`}
                aria-pressed={openId === s.id}
                className={`group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 transition-colors min-h-10 ${
                  openId === s.id
                    ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30 text-slate-900'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}>
                <span className="truncate text-sm font-medium">{s.name}</span>
                <button onClick={(e) => { e.stopPropagation(); del(s.id) }}
                  aria-label={`Delete service ${s.name}`}
                  className="btn-danger opacity-60 hover:opacity-100 text-xs py-1">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Open service */}
        <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-slate-200 bg-[#f4f6f9]">
          {openId == null ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
              Select a service, or create one to start building your order of worship.
            </div>
          ) : (
            <ServiceEditor
              serviceId={openId}
              onServiceChanged={reloadActiveService}
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

      {showTemplates && (
        <TemplatesPanel
          currentService={service}
          onLoadTemplate={loadTemplateIntoService}
          onClose={() => setShowTemplates(false)}
        />
      )}
    </>
  )
}

export default ServiceBuilder
