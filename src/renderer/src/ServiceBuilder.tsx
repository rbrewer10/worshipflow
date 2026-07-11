import { useState } from 'react'
import type { ServiceItem } from '../../shared/types'
import ServiceEditor from './ServiceEditor'
import { useService } from './ServiceContext'

const ICON: Record<ServiceItem['type'], string> = {
  song: '🎵',
  scripture: '📖',
  text: '📝',
  countdown: '⏱',
  image: '🖼',
  welcome: '👋',
  ticker: '📰',
  announcement: '📣'
}

function ServiceBuilder(): JSX.Element {
  const { services, activeServiceId: openId, activeService: service, selectService, refreshServices, reloadActiveService } = useService()
  const [newName, setNewName] = useState('')
  const [importing, setImporting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null)

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
                <div style={{ fontSize: 15, fontWeight: 600 }}>{ICON[item.type]} {item.title}</div>
                {item.notes && <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{item.notes}</div>}
              </div>
            ))}
          </>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="max-w-sm rounded-xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold text-white">Delete Service?</h3>
            <p className="mb-4 text-sm text-slate-400">
              Are you sure you want to delete <span className="font-semibold text-white">{confirmDelete.name}</span>? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)}
                aria-label="Cancel service deletion"
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10 min-h-10">
                Cancel
              </button>
              <button onClick={confirmServiceDelete}
                aria-label={`Confirm deletion of service ${confirmDelete.name}`}
                className="flex-1 rounded-lg bg-red-800 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 min-h-10">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex h-full min-h-0 gap-4 bg-[#0b0b0f] p-4">
        {/* Services list */}
        <div className="flex w-72 flex-col rounded-xl border border-white/[0.07] bg-[#18181c] p-3">
          <div className="mb-3 flex gap-2">
            <label htmlFor="new-service-name" className="sr-only">New service name</label>
            <input id="new-service-name" value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              placeholder="New service name…"
              aria-label="Enter a new service name"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-400 focus:border-blue-500" />
            <button onClick={create} disabled={!newName.trim()}
              aria-label="Create new service"
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 min-h-10">+</button>
          </div>
          <div className="mb-3 space-y-1.5">
            <button onClick={importImages} disabled={importing}
              aria-label="Import slides as images (export PowerPoint as PNG first)"
              className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 min-h-9"
              title="Export your PowerPoint slides as images first (File → Save As → PNG)">
              🖼 Import slides as images
            </button>
            <button onClick={importPptx} disabled={importing}
              aria-label="Import PowerPoint file with editable text"
              className="w-full rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/20 disabled:opacity-50 min-h-9"
              title="Import a .pptx directly — text becomes editable, backgrounds extracted where possible">
              📑 Import .pptx (editable text)
            </button>
            <button onClick={importServiceFile}
              aria-label="Load a saved service file (.wfservice)"
              className="w-full rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-300 hover:bg-violet-500/20 min-h-9"
              title="Load a .wfservice file exported from another computer">
              📂 Load saved service (.wfservice)
            </button>
            {importing && <p className="text-center text-[11px] text-slate-400" role="status" aria-live="polite">Importing…</p>}
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
                    ? 'bg-indigo-500/10 ring-1 ring-indigo-500/30 text-white'
                    : 'text-slate-300 hover:bg-white/[0.05]'
                }`}>
                <span className="truncate text-sm font-medium">{s.name}</span>
                <button onClick={(e) => { e.stopPropagation(); del(s.id) }}
                  aria-label={`Delete service ${s.name}`}
                  className="rounded px-2 py-1 text-xs text-slate-500 opacity-0 hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100 min-h-8">
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Open service */}
        <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-white/[0.07] bg-[#18181c]">
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
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300 min-h-9"
                    title="Open this service in its own window">⧉ Pop out</button>
                  <button onClick={exportService}
                    aria-label="Save service to file"
                    className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-500/20 min-h-9"
                    title="Save this service to a file">💾 Save to file</button>
                  <button onClick={handlePrint}
                    aria-label="Print service order"
                    className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/[0.12] min-h-9"
                    title="Print service order">🖨 Print</button>
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
