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
  // De-dupes concurrent starts. The `recordingId != null` check above only guards
  // against a SECOND call arriving after the first has finished — nothing stopped
  // two near-simultaneous onItemLive calls (e.g. the operator double-clicking
  // Go Live/Next right at the start of a service) from both passing that check
  // before either had set recordingId, both awaiting deps.startRecord() (a real
  // OBS websocket round trip, not a same-tick microtask), and both calling
  // createRecording — leaving a dangling, never-finalized second row and
  // misattributed markers. render.ts/content.ts avoid this by setting their own
  // busy-guard synchronously before their first await; this does the same by
  // handing every concurrent caller the one in-flight promise instead of
  // starting a second one.
  let inFlightStart: Promise<boolean> | null = null

  // The actual start attempt, kept separate from ensureStarted so its
  // completion can be observed from the OUTSIDE via .finally() rather than a
  // try/finally inside the same function that's being assigned to
  // inFlightStart. That distinction matters: a try/finally inside an async
  // function whose body never reaches an await (e.g. the autoRecordEnabled/
  // obsConnected checks below both fail before touching startRecord) runs
  // synchronously as part of *calling* the function — including the finally
  // — before the call expression's result is even assigned to inFlightStart.
  // That ran the "clear inFlightStart" step first and then the assignment
  // immediately clobbered it back to a settled promise, permanently stuck
  // (verified with a standalone repro) — the exact opposite of "retryable
  // after a failure." A externally-attached .finally() is always deferred to
  // a microtask regardless of whether the promise it's attached to already
  // settled synchronously, so it reliably runs AFTER inFlightStart has been
  // assigned below, not before.
  async function attemptStart(serviceId: number | null, serviceName: string, serviceDate: string | null): Promise<boolean> {
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

  async function ensureStarted(serviceId: number | null, serviceName: string, serviceDate: string | null): Promise<boolean> {
    if (recordingId != null) return true
    if (inFlightStart) return inFlightStart
    const attempt = attemptStart(serviceId, serviceName, serviceDate)
    inFlightStart = attempt
    // Cleared on both success and failure — a failed attempt (OBS offline,
    // auto-record off) must be retryable on the next onItemLive, not stuck
    // forever pointing at a stale rejected/false result. The `=== attempt`
    // check means a THIS-attempt's cleanup never clobbers a newer attempt
    // that (in principle) could already be in flight by the time this runs.
    void attempt.finally(() => {
      if (inFlightStart === attempt) inFlightStart = null
    })
    return attempt
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
