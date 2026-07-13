import type {
  ServiceItem,
  RecordingMarkerInput,
  RecordingMarker,
  RecordingMarkerKind,
  RecordingSidecar
} from '../shared/types'

export interface RecordingDeps {
  now: () => number
  advance?: (ms: number) => void // test-only fake-clock helper; unused in production
  appVersion: string
  autoRecordEnabled: () => boolean
  obsConnected: () => boolean
  obsRecording: () => boolean
  obsRecordStartedMs: () => number
  startRecord: () => Promise<void>
  stopRecord: () => Promise<string | null>
  createRecording: (serviceId: number | null, startedAt: number, obsRecordStartedMs: number) => number
  addMarker: (recordingId: number, m: RecordingMarkerInput) => void
  finalizeRecording: (recordingId: number, endedAt: number, filePath: string | null) => void
  listMarkers: (recordingId: number) => RecordingMarker[]
  writeSidecar: (filePath: string, sidecar: RecordingSidecar) => void
  toast: (msg: string) => void
}

export interface RecordingSession {
  onItemLive: (item: ServiceItem, serviceId: number | null, serviceName: string, serviceDate: string | null) => Promise<void>
  onServiceEnded: () => Promise<void>
  isActive: () => boolean
}

function markerKind(type: ServiceItem['type']): RecordingMarkerKind {
  if (type === 'sermon') return 'sermon'
  if (type === 'song') return 'song'
  return 'item'
}

export function createRecordingSession(deps: RecordingDeps): RecordingSession {
  let recordingId: number | null = null
  let startedAtMs = 0     // app wall clock when the session began (row started_at)
  let offsetBaseMs = 0    // OBS's actual record-start time — the t=0 all marker offsets are measured from
  let ctx: { serviceId: number | null; serviceName: string; serviceDate: string | null } | null = null

  async function ensureStarted(serviceId: number | null, serviceName: string, serviceDate: string | null): Promise<boolean> {
    if (recordingId != null) return true
    if (!deps.autoRecordEnabled()) return false
    if (!deps.obsConnected()) {
      deps.toast('Recording skipped — OBS is offline.')
      return false
    }
    if (!deps.obsRecording()) {
      await deps.startRecord()
    }
    startedAtMs = deps.now()
    // Measure offsets from OBS's real record start, not go-live time. On the auto-start
    // path these are ~equal; on the adopt-existing-recording path OBS may have started
    // minutes earlier, and marker offsets must reflect the true position in the video file.
    offsetBaseMs = deps.obsRecordStartedMs()
    ctx = { serviceId, serviceName, serviceDate }
    recordingId = deps.createRecording(serviceId, startedAtMs, offsetBaseMs)
    return true
  }

  return {
    async onItemLive(item, serviceId, serviceName, serviceDate) {
      const ok = await ensureStarted(serviceId, serviceName, serviceDate)
      if (!ok || recordingId == null) return
      deps.addMarker(recordingId, {
        itemId: item.id,
        kind: markerKind(item.type),
        label: item.title,
        offsetMs: Math.max(0, deps.now() - offsetBaseMs)
      })
    },

    async onServiceEnded() {
      if (recordingId == null) return
      const filePath = await deps.stopRecord()
      const endedAt = deps.now()
      deps.finalizeRecording(recordingId, endedAt, filePath)
      if (filePath) {
        const markers = deps.listMarkers(recordingId)
        const file = filePath.split(/[\\/]/).pop() ?? filePath
        deps.writeSidecar(filePath, {
          worshipflowVersion: deps.appVersion,
          service: { id: ctx?.serviceId ?? null, name: ctx?.serviceName ?? '', date: ctx?.serviceDate ?? null },
          recording: { startedAt: offsetBaseMs, durationMs: endedAt - offsetBaseMs, file },
          markers: markers.map((m) => ({ kind: m.kind, label: m.label, offsetMs: m.offsetMs }))
        })
      } else {
        deps.toast('Recording saved, but OBS did not report a file path — sidecar skipped.')
      }
      recordingId = null
      ctx = null
    },

    isActive() {
      return recordingId != null
    }
  }
}
