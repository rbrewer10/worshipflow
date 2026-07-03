// Real, IPC-wired Volunteer guided checklist — visual language adapted from the
// throwaway preview's Variant C ("Guided Checklist", see ./preview/VariantC.tsx).
// Replaces demoData.ts with real channels passed down from SoundCheckTab and wires
// the two volunteer-facing actions (classify a channel, record a reference mix) to
// window.wf.soundCheck.*.

import { useState } from 'react'
import type { Channel } from '../../../main/types/sound-check-types'
import type { ViewMode } from './SoundCheckTab'
import Waveform from './Waveform'

function TopLine(): JSX.Element {
  return (
    <div className="mb-[18px] flex items-center gap-3.5">
      <span className="text-[17px] font-bold tracking-tight text-white">Sound Check</span>
      <span className="ml-auto flex items-center gap-2 rounded-full border border-[#232d3b] bg-[#161d27] px-3.5 py-1.5 text-[12.5px] text-[#93a3b8]">
        <span className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,.7)]" />
        TF-Rack · Connected
      </span>
    </div>
  )
}

function Modes({ mode }: { mode: ViewMode }): JSX.Element {
  const item = (label: string, sub: string, on: boolean): JSX.Element => (
    <span
      key={label}
      className={`flex-1 rounded-xl border p-3 text-center text-[13.5px] font-semibold ${
        on
          ? 'border-sky-400 bg-[#1b2a3d] text-[#e8f4fe] shadow-[0_0_0_1px_rgba(56,189,248,.35)]'
          : 'border-[#232d3b] bg-[#161d27] text-[#8fa0b5]'
      }`}
    >
      {label}
      <small className={`mt-0.5 block text-[11px] font-medium ${on ? 'text-[#7dc8f0]' : 'text-[#5d6d82]'}`}>{sub}</small>
    </span>
  )
  return (
    <div className="mb-[22px] flex gap-2">
      {item('Setup', 'Get everything ready once', mode === 'setup')}
      {item('Sound Check', 'Before the service', mode === 'live')}
    </div>
  )
}

type RowState = 'done' | 'cur' | 'todo'
function SetupRow({
  state,
  n,
  title,
  children
}: {
  state: RowState
  n: number
  title: string
  children: React.ReactNode
}): JSX.Element {
  const badge: Record<RowState, string> = {
    done: 'border border-green-400/40 bg-green-400/15 text-green-400',
    cur: 'bg-sky-500 text-[#03131c]',
    todo: 'border border-[#2c3849] bg-[#1a2230] text-[#5d6d82]'
  }
  return (
    <div className="mb-3 flex items-start gap-3.5 rounded-2xl border border-[#26303f] bg-[#151c27] px-[22px] py-5">
      <span
        className={`flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full text-[15px] font-extrabold ${badge[state]}`}
      >
        {state === 'done' ? '✓' : n}
      </span>
      <div className="min-w-0 flex-1">
        <h4 className="mb-1 mt-0.5 text-[16.5px] font-bold text-white">{title}</h4>
        {children}
      </div>
    </div>
  )
}

type ChipKind = 'mic' | 'track' | 'unassigned'

function classificationOf(ch: Channel): ChipKind {
  if (ch.isMic) return 'mic'
  if (ch.isBackingTrack) return 'track'
  return 'unassigned'
}

function ChannelChip({
  channel,
  onClassify,
  pending
}: {
  channel: Channel
  onClassify: (property: 'isMic' | 'isBackingTrack', value: boolean) => void
  pending: boolean
}): JSX.Element {
  const kind = classificationOf(channel)
  const pill: Record<ChipKind, JSX.Element> = {
    mic: (
      <span className="rounded-[5px] border border-sky-400/35 bg-sky-400/15 px-[7px] py-0.5 text-[10px] font-extrabold tracking-wide text-sky-300">
        MIC
      </span>
    ),
    track: (
      <span className="rounded-[5px] border border-purple-400/35 bg-purple-400/[0.14] px-[7px] py-0.5 text-[10px] font-extrabold tracking-wide text-purple-300">
        TRACK
      </span>
    ),
    unassigned: (
      <span className="rounded-[5px] border border-dashed border-[#33415a] bg-[#1a2230] px-[7px] py-0.5 text-[10px] font-extrabold tracking-wide text-[#5d6d82]">
        PICK ONE
      </span>
    )
  }
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-[#232d3b] bg-[#0e141d] px-2.5 py-[7px] text-[12.5px] text-[#c3d0e0]">
      <span>{channel.name}</span>
      {pill[kind]}
      <div className="ml-1 flex gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => onClassify('isMic', !channel.isMic)}
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold disabled:opacity-50 ${
            channel.isMic ? 'bg-sky-500 text-[#03131c]' : 'bg-[#1a2230] text-[#8fa0b5] hover:text-sky-300'
          }`}
        >
          Mic
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onClassify('isBackingTrack', !channel.isBackingTrack)}
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold disabled:opacity-50 ${
            channel.isBackingTrack
              ? 'bg-purple-500 text-[#03131c]'
              : 'bg-[#1a2230] text-[#8fa0b5] hover:text-purple-300'
          }`}
        >
          Track
        </button>
      </div>
    </div>
  )
}

function SetupView({
  channels,
  onChannelsChanged
}: {
  channels: Channel[]
  onChannelsChanged: () => void
}): JSX.Element {
  const [recording, setRecording] = useState(false)
  const [recorded, setRecorded] = useState<{ durationSeconds: number } | null>(null)
  const [recordError, setRecordError] = useState<string | null>(null)
  const [classifyError, setClassifyError] = useState<string | null>(null)
  // Channel ids with an in-flight setChannelClassification() call. Guards against
  // rapid double-clicks on one chip, or clicking Mic then Track before the first
  // call resolves, queuing concurrent calls to the same channel with no ordering
  // guarantee. Both chip buttons disable while their channel id is in this set.
  const [pendingChannelIds, setPendingChannelIds] = useState<Set<number>>(new Set())

  const handleClassify = (channelId: number, property: 'isMic' | 'isBackingTrack', value: boolean): void => {
    setPendingChannelIds((prev) => new Set(prev).add(channelId))
    setClassifyError(null)
    window.wf.soundCheck
      .setChannelClassification(channelId, property, value)
      .then(onChannelsChanged)
      .catch((err: unknown) => {
        setClassifyError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        setPendingChannelIds((prev) => {
          const next = new Set(prev)
          next.delete(channelId)
          return next
        })
      })
  }

  const handleRecordReference = (): void => {
    setRecording(true)
    setRecordError(null)
    // There is no live audio capture pipeline yet (Task 4's AudioAnalyzer buffer is
    // empty/zeroed in practice), so this produces a mix from whatever is currently
    // buffered rather than a real 5-minute capture. Wired faithfully anyway per the
    // task's scope — no fake countdown implying real capture is happening.
    window.wf.soundCheck
      .recordReferenceMix(300, 'Recorded from Volunteer setup flow')
      .then((mix) => {
        setRecording(false)
        setRecorded({ durationSeconds: mix.durationSeconds })
      })
      .catch((err: unknown) => {
        setRecording(false)
        setRecordError(err instanceof Error ? err.message : String(err))
      })
  }

  const unassignedCount = channels.filter((c) => classificationOf(c) === 'unassigned').length

  return (
    <>
      <SetupRow state="done" n={1} title="Connect to the mixer">
        <p className="m-0 text-[13.5px] leading-normal text-[#93a3b8]">
          Found your TF-Rack and pulled in {channels.length} channel{channels.length === 1 ? '' : 's'}. Nothing to
          do here.
        </p>
      </SetupRow>
      <SetupRow state={unassignedCount === 0 ? 'done' : 'cur'} n={2} title="Tell us what each channel is">
        <p className="m-0 text-[13.5px] leading-normal text-[#93a3b8]">
          Tap <b className="font-semibold text-sky-300">Mic</b> or <b className="font-semibold text-purple-300">Track</b>{' '}
          on each one.{' '}
          {unassignedCount > 0
            ? `${unassignedCount} left to go — you're almost there.`
            : 'All channels classified.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {channels.map((c) => (
            <ChannelChip
              key={c.id}
              channel={c}
              pending={pendingChannelIds.has(c.id)}
              onClassify={(property, value) => handleClassify(c.id, property, value)}
            />
          ))}
        </div>
        {classifyError && <p className="mt-2 text-[12.5px] text-red-300">{classifyError}</p>}
      </SetupRow>
      <SetupRow state={recorded ? 'done' : 'todo'} n={3} title="Record a reference mix">
        <p className="m-0 text-[13.5px] leading-normal text-[#93a3b8]">
          When the band sounds great, press record and let it listen for a few minutes. That becomes the
          &ldquo;this is how our room should sound&rdquo; yardstick.
        </p>
        <button
          type="button"
          disabled={recording}
          onClick={handleRecordReference}
          className="mt-3 inline-flex items-center gap-2.5 rounded-xl border border-sky-400 bg-[#1b2a3d] px-5 py-3 text-[14.5px] font-bold text-[#e8f4fe] disabled:opacity-60"
        >
          <span className="h-[11px] w-[11px] rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,.7)]" />
          {recording ? 'Recording reference mix…' : recorded ? 'Recorded — record again' : 'Record Reference Mix'}
        </button>
        {recorded && !recording && (
          <p className="mt-2 text-[12.5px] text-green-300">
            Reference mix saved ({recorded.durationSeconds}s). Live audio capture isn&rsquo;t wired up yet, so this
            was built from an empty buffer for now — the flow is real, the audio feed is coming in a later task.
          </p>
        )}
        {recordError && <p className="mt-2 text-[12.5px] text-red-300">{recordError}</p>}
      </SetupRow>
      <SetupRow state="todo" n={4} title="Choose what happens automatically">
        <p className="m-0 text-[13.5px] leading-normal text-[#93a3b8]">
          Simple if-this-then-that rules, like &ldquo;during announcements, quiet the backing tracks.&rdquo; Set
          these up with an engineer in the Engineer view.
        </p>
      </SetupRow>
    </>
  )
}

function LiveView({ channels }: { channels: Channel[] }): JSX.Element {
  return (
    <>
      <div className="mb-3.5 flex items-center gap-3">
        <span className="whitespace-nowrap text-xs font-bold uppercase tracking-widest text-[#7d8da3]">
          Manual sound check
        </span>
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#1a2230]" />
      </div>

      <div className="mb-4 rounded-[18px] border border-[#26303f] bg-[#151c27] px-[30px] py-7">
        <p className="mb-1.5 mt-0 text-xs font-bold uppercase tracking-widest text-sky-400">Walk each mic</p>
        <h3 className="mb-2 mt-0 text-2xl font-bold tracking-tight text-white">
          Have each speaker/singer talk or sing for a few seconds
        </h3>
        <p className="mb-5 mt-0 max-w-[56ch] text-[15px] leading-relaxed text-[#9db0c6]">
          Live audio analysis isn&rsquo;t connected yet, so there&rsquo;s no automatic feedback here — use your ears
          and the channel list below to confirm nothing is muted or obviously wrong, then coordinate fader moves
          with the engineer.
        </p>
        <div className="mb-[18px] rounded-xl border border-[#232d3b] bg-[#0e141d] px-[18px] py-4">
          <Waveform mode="mono" accent="#38bdf8" height={64} seed={31} />
          <p className="mt-3 text-[12.5px] italic text-[#5d6d82]">
            Decorative only — not connected to a live audio feed.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {channels.map((c) => (
          <span
            key={c.id}
            className={`rounded-full border px-[13px] py-1.5 text-[12.5px] ${
              c.isMuted
                ? 'border-red-400/30 bg-[#141b25] text-red-300 line-through'
                : 'border-[#212b39] bg-[#141b25] text-[#7d8da3]'
            }`}
          >
            {c.name}
          </span>
        ))}
      </div>
    </>
  )
}

function VolunteerCheck({
  mode,
  channels,
  onChannelsChanged
}: {
  mode: ViewMode
  channels: Channel[]
  onChannelsChanged: () => void
}): JSX.Element {
  return (
    <div className="min-h-full bg-[#10151d] px-4 pb-[34px] pt-[26px] text-sm text-[#dbe3ee]">
      <div className="mx-auto w-full max-w-[780px]">
        <TopLine />
        <Modes mode={mode} />
        {mode === 'setup' ? (
          <SetupView channels={channels} onChannelsChanged={onChannelsChanged} />
        ) : (
          <LiveView channels={channels} />
        )}
      </div>
    </div>
  )
}

export default VolunteerCheck
