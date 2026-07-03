// Option C — "Guided Checklist": one decision at a time, built for volunteers.
// Throwaway design preview: hardcoded demo data, no IPC.

import type { ReactNode } from 'react'
import Waveform from './Waveform'
import { CHANNELS, C_KINDS } from './demoData'
import type { ViewMode } from './demoData'

function TopLine(): JSX.Element {
  return (
    <div className="mb-[18px] flex items-center gap-3.5">
      <span className="text-[17px] font-bold tracking-tight text-white">Sound Check</span>
      <span className="ml-auto flex items-center gap-2 rounded-full border border-[#232d3b] bg-[#161d27] px-3.5 py-1.5 text-[12.5px] text-[#93a3b8]">
        <span className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,.7)]" />
        TF-Rack · 192.168.1.100 · Connected
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
      {item('Auto', 'During the service', false)}
    </div>
  )
}

type RowState = 'done' | 'cur' | 'todo'
function SetupRow({ state, n, title, children }: { state: RowState; n: number; title: string; children: ReactNode }): JSX.Element {
  const badge: Record<RowState, string> = {
    done: 'border border-green-400/40 bg-green-400/15 text-green-400',
    cur: 'bg-sky-500 text-[#03131c]',
    todo: 'border border-[#2c3849] bg-[#1a2230] text-[#5d6d82]'
  }
  return (
    <div className="mb-3 flex items-start gap-3.5 rounded-2xl border border-[#26303f] bg-[#151c27] px-[22px] py-5">
      <span className={`flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full text-[15px] font-extrabold ${badge[state]}`}>
        {state === 'done' ? '✓' : n}
      </span>
      <div className="min-w-0 flex-1">
        <h4 className="mb-1 mt-0.5 text-[16.5px] font-bold text-white">{title}</h4>
        {children}
      </div>
    </div>
  )
}

function ChannelChip({ name, kind }: { name: string; kind: 'mic' | 'track' | 'unassigned' }): JSX.Element {
  const pill: Record<typeof kind, JSX.Element> = {
    mic: <span className="rounded-[5px] border border-sky-400/35 bg-sky-400/15 px-[7px] py-0.5 text-[10px] font-extrabold tracking-wide text-sky-300">MIC</span>,
    track: <span className="rounded-[5px] border border-purple-400/35 bg-purple-400/[0.14] px-[7px] py-0.5 text-[10px] font-extrabold tracking-wide text-purple-300">TRACK</span>,
    unassigned: <span className="rounded-[5px] border border-dashed border-[#33415a] bg-[#1a2230] px-[7px] py-0.5 text-[10px] font-extrabold tracking-wide text-[#5d6d82]">PICK ONE</span>
  }
  return (
    <span className="flex items-center gap-2 rounded-[10px] border border-[#232d3b] bg-[#0e141d] px-2.5 py-[7px] text-[12.5px] text-[#c3d0e0]">
      {name} {pill[kind]}
    </span>
  )
}

function SetupView(): JSX.Element {
  return (
    <>
      <SetupRow state="done" n={1} title="Connect to the mixer">
        <p className="m-0 text-[13.5px] leading-normal text-[#93a3b8]">
          Found your TF-Rack on the church WiFi and pulled in all 11 channel names from the iPad setup. Nothing to do here.
        </p>
      </SetupRow>
      <SetupRow state="cur" n={2} title="Tell us what each channel is">
        <p className="m-0 text-[13.5px] leading-normal text-[#93a3b8]">
          Tap each one and pick <b className="font-semibold text-sky-300">Mic</b> or <b className="font-semibold text-purple-300">Track</b>. Two left to go — you&rsquo;re almost there.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {CHANNELS.map((c) => (
            <ChannelChip key={c.ch} name={c.name} kind={C_KINDS[c.ch] ?? 'unassigned'} />
          ))}
        </div>
      </SetupRow>
      <SetupRow state="todo" n={3} title="Record a reference mix">
        <p className="m-0 text-[13.5px] leading-normal text-[#93a3b8]">
          Next Sunday when the band sounds great, press record and let it listen for five minutes. That becomes the &ldquo;this is how our room should sound&rdquo; yardstick.
        </p>
        <span className="mt-3 inline-flex items-center gap-2.5 rounded-xl border border-sky-400 bg-[#1b2a3d] px-5 py-3 text-[14.5px] font-bold text-[#e8f4fe]">
          <span className="h-[11px] w-[11px] rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,.7)]" />
          Record Reference Mix (5 min)
        </span>
      </SetupRow>
      <SetupRow state="todo" n={4} title="Choose what happens automatically">
        <p className="m-0 text-[13.5px] leading-normal text-[#93a3b8]">
          Simple if-this-then-that rules, like &ldquo;during announcements, quiet the backing tracks.&rdquo; We&rsquo;ll suggest a starter set.
        </p>
      </SetupRow>
    </>
  )
}

function LiveView(): JSX.Element {
  return (
    <>
      <div className="mb-3.5 flex items-center gap-3">
        <span className="whitespace-nowrap text-xs font-bold uppercase tracking-widest text-[#7d8da3]">Step 3 of 8</span>
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#1a2230]">
          <span className="block h-full w-[37%] rounded-full bg-gradient-to-r from-sky-600 to-sky-400" />
        </span>
        <span className="text-xs font-bold uppercase tabular-nums text-[#7d8da3]">07:41</span>
      </div>

      <div className="mb-4 rounded-[18px] border border-[#26303f] bg-[#151c27] px-[30px] py-7">
        <p className="mb-1.5 mt-0 text-xs font-bold uppercase tracking-widest text-sky-400">Step 3 · Pastor&rsquo;s microphone</p>
        <h3 className="mb-2 mt-0 text-2xl font-bold tracking-tight text-white">Ask Pastor Dave to speak like he&rsquo;s preaching</h3>
        <p className="mb-5 mt-0 max-w-[56ch] text-[15px] leading-relaxed text-[#9db0c6]">
          A few sentences at full Sunday volume is perfect. Watch the sound picture below — the app is listening through the room mics and will tell you if anything needs attention.
        </p>
        <div className="mb-[18px] rounded-xl border border-[#232d3b] bg-[#0e141d] px-[18px] py-4">
          <Waveform mode="mono" accent="#38bdf8" height={80} seed={31} />
          <div className="mt-3 flex items-center gap-2.5 text-sm text-amber-300">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,.6)]" />
            We hear a whistle starting (2.4 kHz) on the Worship Leader&rsquo;s mic — nudge that fader down a touch, then carry on.
          </div>
          <div className="mt-3 flex items-center gap-2.5 text-sm text-green-300">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,.6)]" />
            Pastor Dave&rsquo;s mic sounds clear and is at a good volume. Nice work.
          </div>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            tabIndex={-1}
            className="flex-1 cursor-default rounded-[14px] bg-gradient-to-b from-green-500 to-green-600 p-4 text-base font-bold text-[#04140a] shadow-[0_4px_14px_-4px_rgba(34,197,94,.5)]"
          >
            Sounds good — next step
          </button>
          <button
            type="button"
            tabIndex={-1}
            className="flex-1 cursor-default rounded-[14px] border border-[#2c3849] bg-[#1a2230] p-4 text-base font-semibold text-[#c3d0e0]"
          >
            Something&rsquo;s off — help me fix it
          </button>
        </div>
        <p className="mb-0 mt-3.5 rounded-[10px] border border-[#212b39] bg-[#141b25] px-3.5 py-2.5 text-[13px] text-[#7d8da3]">
          <b className="font-semibold text-[#b8c7da]">Tip:</b> The backing tracks were a little crackly just now (peaking 2.3% of the time on Tracks L). We&rsquo;ll check that properly in step 6 — nothing to do yet.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-green-400/30 bg-[#141b25] px-[13px] py-1.5 text-[12.5px] text-[#6ee7a0]">✓ Worship Leader Vox</span>
        <span className="rounded-full border border-green-400/30 bg-[#141b25] px-[13px] py-1.5 text-[12.5px] text-[#6ee7a0]">✓ BGV 1</span>
        <span className="rounded-full border border-sky-400 bg-[#141b25] px-[13px] py-1.5 text-[12.5px] text-[#e8f4fe]">● Pastor Mic</span>
        {['Acoustic Gtr', 'Keys + Bass DI', 'Tracks L/R', 'Drum OH L/R', 'Speaker Podium'].map((n) => (
          <span key={n} className="rounded-full border border-[#212b39] bg-[#141b25] px-[13px] py-1.5 text-[12.5px] text-[#7d8da3]">
            {n}
          </span>
        ))}
      </div>
    </>
  )
}

function VariantC({ mode }: { mode: ViewMode }): JSX.Element {
  return (
    <div className="min-h-full bg-[#10151d] px-4 pb-[34px] pt-[26px] text-sm text-[#dbe3ee]">
      <div className="mx-auto w-full max-w-[780px]">
        <TopLine />
        <Modes mode={mode} />
        {mode === 'setup' ? <SetupView /> : <LiveView />}
      </div>
    </div>
  )
}

export default VariantC
