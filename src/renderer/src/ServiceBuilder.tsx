import { useEffect, useState } from 'react'
import type { LiveState, ServiceItem, SongSummary } from '../../shared/types'
import ThemePicker from './ThemePicker'
import ServiceDeck from './ServiceDeck'
import CardEditPanel from './CardEditPanel'
import { sendItemLive } from './liveActions'
import { useService } from './ServiceContext'

const ICON: Record<ServiceItem['type'], string> = {
  song: '🎵',
  scripture: '📖',
  text: '📝',
  countdown: '⏱',
  image: '🖼',
  welcome: '👋',
  ticker: '📰'
}

function ServiceBuilder(): JSX.Element {
  const { services, activeServiceId: openId, activeService: service, selectService, reloadActiveService, refreshServices } = useService()
  const [songs, setSongs] = useState<SongSummary[]>([])
  const [newName, setNewName] = useState('')
  const [importing, setImporting] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [live, setLive] = useState<LiveState | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'service' | 'item'; id: number; name: string } | null>(null)

  const refreshSongs = (): void => { window.wf.songsList().then(setSongs) }
  const reload = reloadActiveService
  const open = (id: number): void => { setSelectedId(null); selectService(id) }

  useEffect(() => {
    refreshSongs()
    const off = window.wf.onState(setLive)
    window.wf.getState().then(setLive)
    return off
  }, [])
  useEffect(() => { if (openId != null) refreshSongs() }, [openId])

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

  const del = (id: number): void => {
    const svc = services.find((s) => s.id === id)
    setConfirmDelete({ type: 'service', id, name: svc?.name ?? 'Service' })
  }
  const confirmServiceDelete = async (): Promise<void> => {
    if (!confirmDelete || confirmDelete.type !== 'service') return
    await window.wf.serviceDelete(confirmDelete.id)
    if (openId === confirmDelete.id) selectService(null)
    refreshServices()
    setConfirmDelete(null)
  }
  const delItem = (item: ServiceItem): void => setConfirmDelete({ type: 'item', id: item.id, name: item.title })
  const confirmItemDelete = async (): Promise<void> => {
    if (!confirmDelete || confirmDelete.type !== 'item') return
    await window.wf.serviceRemoveItem(confirmDelete.id)
    if (selectedId === confirmDelete.id) setSelectedId(null)
    reload()
    setConfirmDelete(null)
  }

  const addSong = async (songId: number): Promise<void> => {
    if (openId == null) return
    const id = await window.wf.serviceAddItem(openId, { type: 'song', ref_id: songId })
    reload()
    setSelectedId(id)
  }
  const addCard = async (type: ServiceItem['type']): Promise<void> => {
    if (openId == null) return
    if (type === 'image') {
      const result = await window.wf.dialogOpenFile()
      if (result.canceled || !result.filePaths[0]) return
      const id = await window.wf.serviceAddItem(openId, { type: 'image', payload: { path: result.filePaths[0] } })
      reload()
      setSelectedId(id)
      return
    }
    const payload: Record<string, unknown> = (type === 'countdown' || type === 'welcome') ? { seconds: 300 } : {}
    const id = await window.wf.serviceAddItem(openId, { type, payload })
    reload()
    setSelectedId(id)
  }

  const handlePrint = (): void => window.print()

  const items = service?.items ?? []
  const selectedItem = service?.items.find((it) => it.id === selectedId) ?? null

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-w-sm rounded-xl border border-white/10 bg-slate-900 p-5 shadow-lg">
            <h3 className="mb-2 text-lg font-semibold text-white">
              Delete {confirmDelete.type === 'service' ? 'Service' : 'Item'}?
            </h3>
            <p className="mb-4 text-sm text-slate-400">
              Are you sure you want to delete <span className="font-semibold text-slate-200">{confirmDelete.name}</span>? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold hover:bg-white/[0.12]">
                Cancel
              </button>
              <button onClick={confirmDelete.type === 'service' ? confirmServiceDelete : confirmItemDelete}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex h-full min-h-0 gap-4 p-4">
        {/* Services list */}
        <div className="flex w-72 flex-col rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-3 flex gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              placeholder="New service name…"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-blue-500" />
            <button onClick={create} disabled={!newName.trim()}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-40">+</button>
          </div>
          <div className="mb-3 space-y-1.5">
            <button onClick={importImages} disabled={importing}
              className="w-full rounded-lg border border-emerald-500/30 bg-emerald-600/15 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-600/25 disabled:opacity-50"
              title="Export your PowerPoint slides as images first (File → Save As → PNG)">
              🖼 Import slides as images
            </button>
            <button onClick={importPptx} disabled={importing}
              className="w-full rounded-lg border border-blue-500/30 bg-blue-600/15 px-3 py-2 text-xs font-semibold text-blue-200 hover:bg-blue-600/25 disabled:opacity-50"
              title="Import a .pptx directly — text becomes editable, backgrounds extracted where possible">
              📑 Import .pptx (editable text)
            </button>
            {importing && <p className="text-center text-[11px] text-slate-500">Importing…</p>}
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-auto">
            {services.length === 0 && <p className="px-1 py-6 text-center text-sm text-slate-500">No saved services yet.</p>}
            {services.map((s) => (
              <div key={s.id} onClick={() => open(s.id)}
                className={`group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 ${
                  openId === s.id ? 'bg-blue-500/15 ring-1 ring-blue-500/40' : 'hover:bg-white/[0.05]'
                }`}>
                <span className="truncate text-sm font-medium">{s.name}</span>
                <button onClick={(e) => { e.stopPropagation(); del(s.id) }}
                  className="rounded px-2 py-0.5 text-xs text-slate-500 opacity-0 hover:bg-red-500/20 hover:text-red-300 group-hover:opacity-100">
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Open service */}
        <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-white/10 bg-white/[0.03] p-4">
          {!service ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
              Select a service, or create one to start building your order of worship.
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">{service.name}</h2>
                <button onClick={handlePrint}
                  className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold hover:bg-white/[0.12]"
                  title="Print service order">🖨 Print</button>
              </div>

              {openId != null && (
                <ThemePicker serviceId={openId} themeId={service.theme} colors={service.themeColors} onChange={reload} />
              )}

              <div className="flex min-h-0 flex-1 gap-3">
                <ServiceDeck
                  service={service}
                  songs={songs}
                  liveItemId={live?.liveServiceItemId ?? null}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onAdd={addCard}
                  onAddSong={addSong}
                  onGoLive={(it) => sendItemLive(it)}
                  onDelete={delItem}
                  onReordered={reload}
                />
                {selectedItem && (
                  <CardEditPanel
                    item={selectedItem}
                    onClose={() => setSelectedId(null)}
                    onChanged={reload}
                    onDelete={delItem}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

export default ServiceBuilder
