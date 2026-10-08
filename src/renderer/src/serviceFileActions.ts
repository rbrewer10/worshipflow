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
    if (res.error) { notifyLocal(res.error, 'error'); return }
    const name = res.filePath?.split(/[\\/]/).pop() ?? 'the service file'
    const carried = res.mediaCount ? ` with ${res.mediaCount} picture/video file${res.mediaCount === 1 ? '' : 's'}` : ''
    const missing = res.missingMedia ?? []
    // Ryan's decision (Oct 2026): the file carries the service's media; say
    // plainly when something it uses couldn't be found and isn't in the file.
    if (missing.length) {
      notifyLocal(`Saved ${name}${carried}, but ${missing.length} file${missing.length === 1 ? ' it uses wasn’t' : 's it uses weren’t'} found on this computer and ${missing.length === 1 ? 'isn’t' : 'aren’t'} in it: ${missing.join(', ')}.`, 'warn')
    } else {
      notifyLocal(`Saved ${name}${carried}.`, 'info')
    }
  } catch (err) {
    notifyLocal(`The service couldn’t be saved: ${err instanceof Error ? err.message : String(err)}`, 'error')
  }
}
