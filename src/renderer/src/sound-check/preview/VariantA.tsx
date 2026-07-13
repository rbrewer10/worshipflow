// Option A — "Presenter Flat": reuses WorshipFlow's exact shell grammar.
// Throwaway design preview: hardcoded demo data, no IPC.

import type { ReactNode } from 'react'
import Waveform from './Waveform'
import { A_MIC_CHECKED, A_TRACK_CHECKED, CHANNELS } from './demoData'
import type { ViewMode } from './demoData'

function ModePills({ mode }: { mode: ViewMode }): JSX.Element {
  const pill = (label: string, on: boolean): JSX.Element => (
    <span
      key={label}
      className={`rounded-md px-3.5 py-1 text-xs ${on ? 'bg-white/[0.09] font-semibold text-white' : 'text-slate-400'}`}
    >
      {label}
    </span>
  )
  return (
    <div className="flex gap-1 rounded-lg border border-white/[0.07] bg-white/[0.04] p-[3px]">
      {pill('Setup', mode === 'setup')}
      {pill('Sound Check', mode === 'live')}
      {pill('Auto', false)}
    </div>
  )
}

function TopBar({ mode }: { mode: ViewMode }): JSX.Element {
  return (
    <div className="flex items-center gap-4 border-b border-white/[0.07] bg-[#141418] px-3.5 py-2.5">
      <h2 className="m-0 text-sm font-semibold text-white">Sound Check</h2>
      <ModePills mode={mode} />
      <div className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-blue-500/[0.07] px-2.5 py-1 text-[11.5px] text-slate-400">
        <span className="h-[7px] w-[7px] rounded-full bg-blue-400 shadow-[0_0_6px_rgba(52,211,153,.7)]" />
        <b className="font-semibold text-slate-200">TF-Rack</b>· 192.168.1.100 · Connected
      </div>
    </div>
  )
}

function Card({ title, right, children, className }: { title?: string; right?: JSX.Element | string; children: ReactNode; className?: string }): JSX.Element {
  return (
    <div className={`rounded-xl border border-white/[0.07] bg-[#1a1a1d] p-3 ${className ?? ''}`}>
      {title !== undefined && (
        <p className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          {title}
          {right !== undefined && <span className="ml-auto normal-case tracking-normal font-medium text-slate-500">{right}</span>}
        </p>
      )}
      {children}
    </div>
  )
}

function Check({ on }: { on: boolean }): JSX.Element {
  return on ? (
    <span className="relative inline-block h-[15px] w-[15px] -translate-y-px rounded border border-blue-500 bg-blue-500 align-middle">
      <span className="absolute left-[4px] top-[1px] h-2 w-1 rotate-[42deg] border-b-2 border-r-2 border-blue-950" />
    </span>
  ) : (
    <span className="inline-block h-[15px] w-[15px] -translate-y-px rounded border border-white/[0.18] align-middle" />
  )
}

type BtnTone = 'em' | 'ghost' | 'red'
function Btn({ tone, children, className }: { tone: BtnTone; children: ReactNode; className?: string }): JSX.Element {
  const tones: Record<BtnTone, string> = {
    em: 'bg-blue-500/15 border-blue-500/30 text-blue-300',
    ghost: 'bg-[#1a1a1d] border-white/10 text-slate-300',
    red: 'bg-red-400/10 border-red-400/30 text-red-300'
  }
  return (
    <span className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[12.5px] font-semibold ${tones[tone]} ${className ?? ''}`}>
      {children}
    </span>
  )
}

function Rule({ tag, tagClass, text }: { tag: string; tagClass: string; text: string }): JSX.Element {
  return (
    <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-[7px] text-xs text-slate-300">
      <span className={`rounded px-[7px] py-[2px] text-[10px] font-bold tracking-wide ${tagClass}`}>{tag}</span>
      <span className="text-slate-600">→</span>
      {text}
    </div>
  )
}

type StepState = 'done' | 'cur' | 'todo'
function Step({ state, n, title, sub }: { state: StepState; n: number; title: string; sub: string }): JSX.Element {
  const dot: Record<StepState, string> = {
    done: 'bg-blue-500/20 text-blue-400',
    cur: 'bg-blue-500 text-white',
    todo: 'bg-white/[0.06] text-slate-500'
  }
  return (
    <div
      className={`mb-1.5 flex items-start gap-2.5 rounded-lg border px-2.5 py-2 ${
        state === 'cur' ? 'border-blue-500/50 bg-blue-500/[0.08]' : 'border-white/[0.05]'
      }`}
    >
      <span className={`mt-px flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${dot[state]}`}>
        {state === 'done' ? '✓' : n}
      </span>
      <div className="text-[13px] text-slate-200">
        {title}
        <small className="mt-px block text-[11px] text-slate-500">{sub}</small>
      </div>
    </div>
  )
}

type AlertTone = 'err' | 'warn' | 'info'
function Alert({ tone, sev, children, sub }: { tone: AlertTone; sev: string; children: ReactNode; sub: string }): JSX.Element {
  const box: Record<AlertTone, string> = {
    err: 'border-red-400/30 bg-red-400/[0.08]',
    warn: 'border-amber-400/30 bg-amber-400/[0.07]',
    info: 'border-blue-500/25 bg-blue-500/[0.06]'
  }
  const chip: Record<AlertTone, string> = {
    err: 'bg-red-400 text-red-950',
    warn: 'bg-amber-400 text-amber-950',
    info: 'bg-blue-500 text-blue-50'
  }
  return (
    <div className={`mb-[7px] flex gap-2 rounded-lg border p-[9px] text-xs ${box[tone]}`}>
      <span className={`h-fit flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider ${chip[tone]}`}>{sev}</span>
      <p className="m-0 leading-[1.4] text-slate-200">
        {children}
        <small className="mt-0.5 block text-slate-400">{sub}</small>
      </p>
    </div>
  )
}

function SetupBody(): JSX.Element {
  return (
    <div className="flex flex-1 items-start gap-3 p-3">
      <Card title="Channels — imported from mixer" right="11 channels" className="flex-[1.35]">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className="border-b border-white/[0.07] px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Ch</th>
              <th className="border-b border-white/[0.07] px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Name</th>
              <th className="border-b border-white/[0.07] px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">Mic</th>
              <th className="border-b border-white/[0.07] px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">Track</th>
              <th className="border-b border-white/[0.07] px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">Ref level</th>
            </tr>
          </thead>
          <tbody>
            {CHANNELS.map((c) => (
              <tr key={c.ch}>
                <td className="border-b border-white/[0.05] px-2 py-1.5 tabular-nums text-slate-500">{c.ch}</td>
                <td className="border-b border-white/[0.05] px-2 py-1.5 text-slate-200">{c.name}</td>
                <td className="border-b border-white/[0.05] px-2 py-1.5 text-center"><Check on={A_MIC_CHECKED.has(c.ch)} /></td>
                <td className="border-b border-white/[0.05] px-2 py-1.5 text-center"><Check on={A_TRACK_CHECKED.has(c.ch)} /></td>
                <td className="border-b border-white/[0.05] px-2 py-1.5 text-right tabular-nums text-slate-400">{c.refLevel}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2.5 flex gap-2">
          <Btn tone="ghost">Re-import channels</Btn>
          <Btn tone="ghost">Rename…</Btn>
        </div>
      </Card>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Card title="Reference mix">
          <p className="mb-2.5 mt-0 text-xs leading-normal text-slate-400">
            Record 5 minutes of a Sunday that sounded right. New mixes get compared against this fingerprint.
          </p>
          <Btn tone="em">● Record Reference Mix (5 min)</Btn>
          <p className="mb-0 mt-2.5 text-[11px] text-slate-500">
            Last recorded <span className="tabular-nums">Jun 28, 2026</span> · “Good morning mix, full band” ·{' '}
            <span className="text-blue-400">4 days old</span>
          </p>
        </Card>
        <Card title="Automation rules">
          <Rule tag="SONG" tagClass="bg-blue-500/15 text-blue-300" text="Recall “Worship” scene · mute click for verse 1" />
          <Rule tag="ANNOUNCEMENT" tagClass="bg-amber-400/15 text-amber-300" text="Mute Tracks L/R · Pastor Mic +1 dB" />
          <Rule tag="SCRIPTURE" tagClass="bg-blue-500/15 text-blue-300" text="Recall “Speech” scene" />
          <Rule tag="PRAYER" tagClass="bg-purple-400/15 text-purple-300" text="All faders −4 dB · mute Drum OH L/R" />
          <Btn tone="ghost" className="mt-1">+ Add rule</Btn>
        </Card>
      </div>
    </div>
  )
}

function LiveBody(): JSX.Element {
  return (
    <div className="flex flex-1 items-start gap-3 p-3">
      <div className="flex min-w-0 flex-[1.35] flex-col gap-3">
        <Card
          title="Checklist"
          right={
            <span>
              Step 3 of 8 · <span className="tabular-nums">07:41</span> elapsed
            </span>
          }
        >
          <Step state="done" n={1} title="Worship Leader Vox — sang a verse, level set" sub="Passed · −14.2 dB avg, matches reference" />
          <Step state="done" n={2} title="BGV 1 — harmonies check" sub="Passed · slight bump +1 dB applied" />
          <Step state="cur" n={3} title="Pastor Mic — have Pastor Dave speak at preaching volume" sub="Listening… watch the meters and alerts on the right" />
          <Step state="todo" n={4} title="Acoustic Gtr — strum through the chorus" sub="Waiting" />
          <Step state="todo" n={5} title="Keys + Bass DI — play the intro pad" sub="Waiting" />
          <Step state="todo" n={6} title="Tracks L/R — play a sample from the set" sub="Waiting" />
        </Card>
        <Card
          title="Audience mics — live waveform"
          right={
            <span>
              RMS <span className="tabular-nums">−16.8 dB</span> · in the good range
            </span>
          }
        >
          <Waveform mode="stereo" accent="#60a5fa" height={96} seed={11} />
        </Card>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Card title="Live recommendations" className="flex-1">
          <Alert tone="err" sev="FEEDBACK" sub="Pull fader −3 dB or engage notch on ch 02">
            Feedback building at <b className="tabular-nums">2.4 kHz</b> — Worship Leader Vox
          </Alert>
          <Alert tone="warn" sev="CLIPPING" sub="Lower Tracks L trim; peaks hitting 0 dBFS">
            Clipping on Tracks L (<b className="tabular-nums">2.3%</b> of samples)
          </Alert>
          <Alert tone="info" sev="REFERENCE" sub="Low band (60–250 Hz) heavier than your Jun 28 mix">
            Bass <b className="tabular-nums">28%</b> above reference — pull Bass DI down ~<span className="tabular-nums">2 dB</span>
          </Alert>
          <Alert tone="info" sev="REFERENCE" sub="2 kHz band a touch soft; speech may sit back">
            Pastor Mic presence <b className="tabular-nums">8%</b> below reference — raise ~<span className="tabular-nums">1 dB</span>
          </Alert>
        </Card>
        <Card title="Finish this step">
          <div className="flex gap-2">
            <Btn tone="em" className="flex-1 justify-center">Pass — sounds good</Btn>
            <Btn tone="red" className="flex-1 justify-center">Fail — redo step</Btn>
          </div>
        </Card>
      </div>
    </div>
  )
}

function VariantA({ mode }: { mode: ViewMode }): JSX.Element {
  return (
    <div className="flex min-h-full flex-col bg-[#0e0e11] text-[13px] text-slate-200">
      <TopBar mode={mode} />
      {mode === 'setup' ? <SetupBody /> : <LiveBody />}
    </div>
  )
}

export default VariantA
