// Shared .wfservice import/export for Home ("Open from file" / "Save to USB")
// and Build service, so both give the same feedback (QA B12, B24).
import { notifyLocal } from './NotifyToasts'

/** Import a .wfservice; on success the caller selects the new service. Always tells the operator what happened. */
export async function importServiceFromFile(onImported: (serviceId: number) => void): Promise<void> {
  try {
    const res = await window.wf.serviceImportFile()
    if (res.canceled) return
    if (res.error || res.serviceId == null) {
      notifyLocal(res.error ?? 'The service couldn’t be imported.', 'error')
      return
    }
    onImported(res.serviceId)
    notifyLocal(res.summary ?? 'Service imported.', res.warn ? 'warn' : 'info')
  } catch (err) {
    notifyLocal(`The service couldn’t be imported: ${err instanceof Error ? err.message : String(err)}`, 'error')
  }
}

export async function exportServiceToFile(serviceId: number): Promise<void> {
  try {
    const res = await window.wf.serviceExport(serviceId)
    if (res.canceled) return
    if (res.error) notifyLocal(res.error, 'error')
    else notifyLocal(`Saved ${res.filePath?.split(/[\\/]/).pop() ?? 'the service file'}.`, 'info')
  } catch (err) {
    notifyLocal(`The service couldn’t be saved: ${err instanceof Error ? err.message : String(err)}`, 'error')
  }
}
