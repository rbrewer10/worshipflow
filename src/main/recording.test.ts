import { describe, it, expect, vi } from 'vitest'
import { createRecordingSession, type RecordingDeps } from './recording'
import type { ServiceItem } from '../shared/types'

function makeItem(id: number, type: ServiceItem['type'], title: string): ServiceItem {
  return { id, ordinal: id, type, ref_id: null, payload: {}, title, notes: null, style: null, zoneRouting: null, track: 'main' }
}

function makeDeps(over: Partial<RecordingDeps> = {}): { deps: RecordingDeps; markers: Array<{ recId: number; kind: string; label: string; offsetMs: number }>; sidecars: unknown[]; toasts: string[] } {
  let clock = 1000
  const markers: Array<{ recId: number; kind: string; label: string; offsetMs: number }> = []
  const sidecars: unknown[] = []
  const toasts: string[] = []
  const deps: RecordingDeps = {
    now: () => clock,
    advance: (ms: number) => { clock += ms }, // test-only helper on deps for readability
    appVersion: '0.9.0',
    autoRecordEnabled: () => true,
    obsConnected: () => true,
    obsRecording: () => false,
    obsRecordStartedMs: () => clock,
    startRecord: vi.fn(async () => {}),
    stopRecord: vi.fn(async () => 'C:/nas/2026-07-19.mkv'),
    createRecording: vi.fn(() => 7),
    addMarker: (recId, m) => markers.push({ recId, kind: m.kind, label: m.label, offsetMs: m.offsetMs }),
    finalizeRecording: vi.fn(),
    listMarkers: () => markers.map((m, i) => ({ id: i, recordingId: m.recId, itemId: null, kind: m.kind as never, label: m.label, offsetMs: m.offsetMs })),
    writeSidecar: (_path, sidecar) => sidecars.push(sidecar),
    toast: (msg) => toasts.push(msg),
    ...over
  }
  return { deps, markers, sidecars, toasts }
}

describe('recording session', () => {
  it('starts recording on the first live item and stamps it at offset 0', async () => {
    const { deps, markers } = makeDeps()
    const s = createRecordingSession(deps)
    await s.onItemLive(makeItem(1, 'welcome', 'Welcome'), 42, 'Sunday AM', '2026-07-19')
    expect(deps.startRecord).toHaveBeenCalledOnce()
    expect(deps.createRecording).toHaveBeenCalledOnce()
    expect(s.isActive()).toBe(true)
    expect(markers).toEqual([{ recId: 7, kind: 'item', label: 'Welcome', offsetMs: 0 }])
  })

  it('classifies marker kinds and computes offsets from start', async () => {
    const { deps, markers } = makeDeps()
    const s = createRecordingSession(deps)
    await s.onItemLive(makeItem(1, 'song', 'Amazing Grace'), 42, 'Sunday AM', '2026-07-19')
    deps.advance!(320000)
    await s.onItemLive(makeItem(2, 'sermon', 'The Prodigal Son'), 42, 'Sunday AM', '2026-07-19')
    expect(markers).toEqual([
      { recId: 7, kind: 'song', label: 'Amazing Grace', offsetMs: 0 },
      { recId: 7, kind: 'sermon', label: 'The Prodigal Son', offsetMs: 320000 }
    ])
    expect(deps.startRecord).toHaveBeenCalledOnce() // not restarted on 2nd item
  })

  it('finalizes and writes a sidecar on service end', async () => {
    const { deps, sidecars } = makeDeps()
    const s = createRecordingSession(deps)
    await s.onItemLive(makeItem(1, 'sermon', 'Msg'), 42, 'Sunday AM', '2026-07-19')
    deps.advance!(60000)
    await s.onServiceEnded()
    expect(deps.stopRecord).toHaveBeenCalledOnce()
    expect(deps.finalizeRecording).toHaveBeenCalledWith(7, 61000, 'C:/nas/2026-07-19.mkv')
    expect(sidecars).toHaveLength(1)
    expect(s.isActive()).toBe(false)
  })

  it('skips recording and toasts when OBS is offline', async () => {
    const { deps, toasts } = makeDeps({ obsConnected: () => false })
    const s = createRecordingSession(deps)
    await s.onItemLive(makeItem(1, 'welcome', 'Welcome'), 42, 'Sunday AM', '2026-07-19')
    expect(deps.startRecord).not.toHaveBeenCalled()
    expect(s.isActive()).toBe(false)
    expect(toasts.some((t) => /OBS/i.test(t))).toBe(true)
  })

  it('does not start when auto-record is disabled', async () => {
    const { deps } = makeDeps({ autoRecordEnabled: () => false })
    const s = createRecordingSession(deps)
    await s.onItemLive(makeItem(1, 'welcome', 'Welcome'), 42, 'Sunday AM', '2026-07-19')
    expect(deps.startRecord).not.toHaveBeenCalled()
    expect(s.isActive()).toBe(false)
  })

  it('adopts an already-running OBS recording without double-starting', async () => {
    const { deps } = makeDeps({ obsRecording: () => true })
    const s = createRecordingSession(deps)
    await s.onItemLive(makeItem(1, 'welcome', 'Welcome'), 42, 'Sunday AM', '2026-07-19')
    expect(deps.startRecord).not.toHaveBeenCalled()
    expect(deps.createRecording).toHaveBeenCalledOnce() // still tracked
    expect(s.isActive()).toBe(true)
  })

  it('measures marker offsets from OBS record start, not go-live time (adoption path)', async () => {
    // makeDeps' clock starts at 1000; OBS actually began recording at 500 (500ms earlier).
    const { deps, markers } = makeDeps({ obsRecording: () => true, obsRecordStartedMs: () => 500 })
    const s = createRecordingSession(deps)
    await s.onItemLive(makeItem(1, 'song', 'Opener'), 42, 'Sunday AM', '2026-07-19')
    expect(deps.startRecord).not.toHaveBeenCalled() // adopted, not restarted
    // Offset must be relative to the real video start (1000 - 500), NOT 0.
    expect(markers).toEqual([{ recId: 7, kind: 'song', label: 'Opener', offsetMs: 500 }])
  })

  // Regression: ensureStarted's `recordingId != null` guard only blocks a
  // SECOND call arriving after the first fully finished — nothing stopped two
  // near-simultaneous onItemLive calls (e.g. double-clicking Go Live/Next
  // right at a service's start) from both seeing recordingId == null and both
  // awaiting startRecord before either had set it, each calling
  // createRecording and leaving a dangling, never-finalized second row.
  it('de-dupes two concurrent onItemLive calls into a single recording', async () => {
    let resolveStart: () => void = () => {}
    const startGate = new Promise<void>((resolve) => { resolveStart = resolve })
    const { deps, markers } = makeDeps({
      startRecord: vi.fn(() => startGate)
    })
    const s = createRecordingSession(deps)

    // Both fire before startRecord has resolved — this is the exact race.
    const first = s.onItemLive(makeItem(1, 'welcome', 'Welcome'), 42, 'Sunday AM', '2026-07-19')
    const second = s.onItemLive(makeItem(2, 'song', 'Opener'), 42, 'Sunday AM', '2026-07-19')
    resolveStart()
    await Promise.all([first, second])

    expect(deps.startRecord).toHaveBeenCalledOnce()
    expect(deps.createRecording).toHaveBeenCalledOnce()
    expect(markers).toHaveLength(2) // both items still get their own marker
    expect(markers.map((m) => m.recId)).toEqual([7, 7]) // on the SAME recording row
  })

  it('allows a fresh start attempt on the SAME session after a failed one, not stuck forever', async () => {
    let obsUp = false
    const { deps } = makeDeps({ obsConnected: () => obsUp })
    const s = createRecordingSession(deps)

    // First item: OBS is offline, start attempt fails.
    await s.onItemLive(makeItem(1, 'welcome', 'Welcome'), 42, 'Sunday AM', '2026-07-19')
    expect(s.isActive()).toBe(false)

    // OBS comes online before the next item — the failed attempt's in-flight
    // guard must have cleared itself, or this would hang/no-op forever.
    obsUp = true
    await s.onItemLive(makeItem(2, 'song', 'Opener'), 42, 'Sunday AM', '2026-07-19')
    expect(s.isActive()).toBe(true)
    expect(deps.createRecording).toHaveBeenCalledOnce()
  })
})
