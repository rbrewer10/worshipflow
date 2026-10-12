// QA B12-N2: a service that carries its pictures and videos is a different
// kind of file from the plain-JSON .wfservice older WorshipFlow builds open,
// so it gets its own extension:
//   .wfservice — ALWAYS plain JSON, no media (any version opens it)
//   .wfbundle  — a tar carrying service.json + media (needs 0.20.3+)
// Import accepts both and decides by the content, so the tar-in-.wfservice
// files 986f8a2 wrote still open.

export type ServiceFileFormat = 'wfbundle' | 'wfservice'

export const BUNDLE_FILTER = { name: 'With pictures & videos (.wfbundle, needs WorshipFlow 0.20.3+)', extensions: ['wfbundle'] }
export const SERVICE_FILTER = { name: 'Without media (.wfservice, works on older versions)', extensions: ['wfservice'] }
export const IMPORT_FILTERS = [{ name: 'WorshipFlow service (.wfbundle, .wfservice)', extensions: ['wfbundle', 'wfservice'] }]
/** The version a plain .wfservice is written as: v3 adds only the media manifest, so older builds open it without a "newer version" note. */
export const PLAIN_SERVICE_VERSION = 2

/** Save-dialog options: with media the bundle is offered first (the default); both are always offered. */
export function exportDialogOptions(serviceName: string, hasMedia: boolean): { defaultPath: string; filters: Array<{ name: string; extensions: string[] }> } {
  const safe = serviceName.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'Service'
  return hasMedia
    ? { defaultPath: `${safe}.wfbundle`, filters: [BUNDLE_FILTER, SERVICE_FILTER] }
    : { defaultPath: `${safe}.wfservice`, filters: [SERVICE_FILTER, BUNDLE_FILTER] }
}

/**
 * The format follows the extension the operator ended up with (the dialog
 * doesn't report the chosen filter). No/unknown extension → the default for
 * this service, appended.
 */
export function chooseExportFormat(filePath: string, hasMedia: boolean): { filePath: string; format: ServiceFileFormat } {
  const m = /\.(wfbundle|wfservice)$/i.exec(filePath)
  if (m) return { filePath, format: m[1].toLowerCase() as ServiceFileFormat }
  const format: ServiceFileFormat = hasMedia ? 'wfbundle' : 'wfservice'
  return { filePath: `${filePath}.${format}`, format }
}

export type MediaSkipReason = 'missing' | 'tooBig' | 'network' | 'notMedia'

const REASON_TEXT: Record<MediaSkipReason, string> = {
  tooBig: 'over 8 GB, too big to carry', // QA B13-N8: no nested brackets inside “name (reason)”
  network: 'on a network share — copy it onto this computer first',
  notMedia: 'not a real picture or video',
  missing: 'not found on this computer'
}

export interface ExportOutcome {
  fileName: string
  format: ServiceFileFormat
  /** Files carried in the bundle. */
  mediaCount: number
  /** Files the service uses that a plain .wfservice leaves out (the operator chose "Without media"). */
  leftOut: number
  skipped: Array<{ name: string; reason: MediaSkipReason }>
}

/** The toast after a save (QA B12-N2/N6): what's in the file, what isn't and why. */
export function describeExport(o: ExportOutcome): { text: string; warn: boolean } {
  const plural = (n: number): string => `${n} picture/video file${n === 1 ? '' : 's'}`
  const parts = [o.format === 'wfbundle' && o.mediaCount ? `Saved ${o.fileName} with ${plural(o.mediaCount)} (opens in WorshipFlow 0.20.3 or newer).` : `Saved ${o.fileName}.`]
  if (o.format === 'wfservice' && o.leftOut) parts.push(`It doesn’t include the ${plural(o.leftOut)} the service uses — save as .wfbundle to carry them.`)
  if (o.format === 'wfbundle') {
    const by = new Map<MediaSkipReason, string[]>()
    for (const s of o.skipped) {
      const list = by.get(s.reason) ?? []
      if (!list.includes(s.name)) list.push(s.name)
      by.set(s.reason, list)
    }
    const order: MediaSkipReason[] = ['tooBig', 'network', 'notMedia', 'missing']
    const bits = order.filter((r) => by.has(r)).map((r) => `${by.get(r)!.join(', ')} (${REASON_TEXT[r]})`)
    if (bits.length) parts.push(`Not in the file: ${bits.join('; ')}.`)
  }
  return { text: parts.join(' '), warn: (o.format === 'wfbundle' && o.skipped.length > 0) || (o.format === 'wfservice' && o.leftOut > 0) }
}

/** The service file Windows/macOS passed on the command line, if any (last one wins; flags ignored). */
export function serviceFileFromArgv(argv: readonly string[]): string | null {
  for (let i = argv.length - 1; i >= 1; i--) {
    const a = argv[i]
    if (a && !a.startsWith('-') && /\.(wfbundle|wfservice)$/i.test(a)) return a
  }
  return null
}
