// Option D — "Mission Control": everything on one pane of glass.
// Throwaway design preview: hardcoded demo data, no IPC.

import type { ReactNode } from 'react'
import { CHANNELS } from './demoData'
import type { DemoChannel, ViewMode } from './demoData'

type Edge = 'ok' | 'err' | 'acc' | 'warn'
const EDGE: Record<Edge, string> = {
  ok: 'shadow-[inset_3px_0_0_#2fd97b]',
  err: 'shadow-[inset_3px_0_0_#ff5c5c]',
  acc: 'shadow-[inset_3px_0_0_#5eb4ff]',
  warn: 'shadow-[inset_3px_0_0_#ffc043]'
}

function Tile({ edge, k, v, s }: { edge: Edge; k: string; v: ReactNode; s: string }): JSX.Element {
  return (
    <div className={`relative overflow-hidden rounded-[10px] border border-[#1d2434] bg-[#0f131c] px-[13px] py-[11px] ${EDGE[edge]}`}>
      <p className="mb-[7px] mt-0 text-[9px] font-extrabold uppercase tracking-[.18em] text-[#5a6480]">{k}</p>
      <p className="m-0 text-[19px] font-bold tracking-tight tabular-nums text-[#eef2f8]">{v}</p>
      <p className="mb-0 mt-[3px] text-[11px] tabular-nums text-[#6b7690]">{s}</p>
    </div>
  )
}

function Unit({ children }: { children: ReactNode }): JSX.Element {
  return <span className="text-xs font-semibold text-[#6b7690]">{children}</span>
}

function Panel({ title, right, children, className }: { title: string; right?: string; children: ReactNode; className?: string }): JSX.Element {
  return (
    <div className={`rounded-[10px] border border-[#1d2434] bg-[#0f131c] px-[13px] py-[11px] ${className ?? ''}`}>
      <p className="mb-[9px] mt-0 flex items-center text-[9px] font-extrabold uppercase tracking-[.18em] text-[#5a6480]">
        {title}
        {right !== undefined && <span className="ml-auto font-semibold tracking-[.08em] text-[#3f4a63]">{right}</span>}
      </p>
      {children}
    </div>
  )
}

function Kv({ label, value }: { label: string; value: ReactNode }): JSX.Element {
  return (
    <div className="flex justify-between border-b border-[#141926] py-[5px] text-[11.5px] text-[#8b96ad] last:border-b-0">
      <span>{label}</span>
      <b className="font-semibold tabular-nums text-[#d7deea]">{value}</b>
    </div>
  )
}

function Pill({ kind, children }: { kind: 'mic' | 'trk'; children: ReactNode }): JSX.Element {
  return (
    <span
      className={`rounded px-[7px] py-0.5 text-[9px] font-extrabold uppercase tracking-widest ${
        kind === 'mic' ? 'bg-[#5eb4ff]/[0.12] text-[#8fd3ff]' : 'bg-[#c084fc]/[0.12] text-[#d8b4fe]'
      }`}
    >
      {children}
    </span>
  )
}

function Head({ mode }: { mode: ViewMode }): JSX.Element {
  const m = (label: string, on: boolean): JSX.Element => (
    <span
      key={label}
      className={`rounded-[5px] px-3 py-1 text-[10.5px] font-bold uppercase tracking-widest ${
        on ? 'bg-[#1c2740] text-[#8fd3ff] shadow-[inset_0_0_0_1px_rgba(94,180,255,.35)]' : 'text-[#6b7690]'
      }`}
    >
      {label}
    </span>
  )
  return (
    <div className="mb-3 flex items-center gap-3.5">
      <h2 className="m-0 text-[13px] font-bold uppercase tracking-[.14em] text-[#eef2f8]">Sound Check</h2>
      <div className="flex gap-0.5 rounded-[7px] border border-[#1d2434] bg-[#10141d] p-0.5">
        {m('Setup', mode === 'setup')}
        {m('Sound Check', mode === 'live')}
        {m('Auto', false)}
      </div>
      <span className="ml-auto font-mono text-[11.5px] tabular-nums text-[#6b7690]">
        {mode === 'setup' ? '09:14:22 · config' : '10:41:58 · service in 18:02'}
      </span>
    </div>
  )
}

const DELTA_CLS: Record<DemoChannel['deltaTone'], string> = {
  ok: 'bg-[#2fd97b]/10 text-[#5fe39a]',
  hi: 'bg-[#ffc043]/[0.12] text-[#ffd27a]',
  err: 'bg-[#ff5c5c]/[0.14] text-[#ff8a8a]',
  mut: 'bg-[#141926] text-[#4a5570]'
}

function MeterRow({ c, animate }: { c: DemoChannel; animate?: boolean }): JSX.Element {
  const peak = Math.min(c.lvl + 0.06, 1)
  return (
    <div className="grid grid-cols-[150px_34px_1fr_62px_66px] items-center gap-[9px] border-b border-[#141926] py-[4.5px] last:border-b-0">
      <span
        className={`overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] font-semibold ${
          c.muted ? 'text-[#4a5570] line-through decoration-[#333e58]' : 'text-[#d7deea]'
        }`}
      >
        {c.name}
      </span>
      <span className="font-mono text-[9.5px] text-[#4a5570]">{c.ch}</span>
      <span className="relative h-2.5 overflow-hidden rounded-[3px] border border-[#161c2b] bg-[#0a0e16]">
        <span
          className={`absolute bottom-0 left-0 top-0 rounded-[2px] ${animate ? 'scp-pulse-x' : ''}`}
          style={{
            width: `${(c.lvl * 100).toFixed(0)}%`,
            background: 'linear-gradient(90deg,#1d8f5a,#2fd97b 62%,#ffc043 82%,#ff5c5c 96%)'
          }}
        />
        {!c.muted && (
          <span className="absolute -bottom-px -top-px w-0.5 bg-[#eef2f8] opacity-[.85]" style={{ left: `${(peak * 100).toFixed(0)}%` }} />
        )}
      </span>
      <span className="text-right font-mono text-[11px] tabular-nums text-[#aeb9cc]">{c.dbMission} dB</span>
      <span className={`rounded py-0.5 text-center text-[9.5px] font-bold tabular-nums ${DELTA_CLS[c.deltaTone]}`}>{c.delta}</span>
    </div>
  )
}

type EvTone = 'crit' | 'warn' | 'info' | 'ok'
const EV_STRIPE: Record<EvTone, string> = {
  crit: 'before:bg-[#ff5c5c]',
  warn: 'before:bg-[#ffc043]',
  info: 'before:bg-[#5eb4ff]',
  ok: 'before:bg-[#2fd97b]'
}

function Event({ tone, t, text, sub, act }: { tone: EvTone; t: string; text: string; sub: string; act?: string }): JSX.Element {
  return (
    <div
      className={`relative mb-1.5 flex gap-[9px] overflow-hidden rounded-[7px] border border-[#161c2b] bg-[#0c101a] py-2 pl-[11px] pr-[9px] before:absolute before:bottom-0 before:left-0 before:top-0 before:w-[3px] before:content-[''] ${EV_STRIPE[tone]}`}
    >
      <span className="flex-shrink-0 pt-0.5 font-mono text-[9.5px] tabular-nums text-[#4a5570]">{t}</span>
      <p className="m-0 text-[11.5px] leading-[1.45] text-[#d7deea]">
        {text}
        <small className="mt-px block text-[10.5px] text-[#6b7690]">{sub}</small>
      </p>
      {act !== undefined && (
        <span className="ml-auto flex-shrink-0 self-center rounded-[5px] border border-[#5eb4ff]/40 bg-[#5eb4ff]/[0.08] px-2 py-[3px] text-[9px] font-extrabold uppercase tracking-[.08em] text-[#8fd3ff]">
          {act}
        </span>
      )}
    </div>
  )
}

function SetupView(): JSX.Element {
  return (
    <>
      <div className="mb-3 grid grid-cols-4 gap-2.5">
        <Tile edge="ok" k="Connection" v="TF-Rack" s="192.168.1.100 · Connected · 11 ch imported" />
        <Tile edge="acc" k="Channels classified" v={<>9 <Unit>/ 11</Unit></>} s="Keys, Bass DI still unassigned" />
        <Tile edge="warn" k="Reference mix" v={<>4 <Unit>days old</Unit></>} s="Jun 28 · “Good AM mix” · 5:00" />
        <Tile edge="acc" k="Automation rules" v={<>4 <Unit>active</Unit></>} s="song · announce · scripture · prayer" />
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <Panel title="Channel classification" right="CH 01–11">
          <Kv label="01 Pastor Mic" value={<Pill kind="mic">MIC</Pill>} />
          <Kv label="02 Worship Leader Vox" value={<Pill kind="mic">MIC</Pill>} />
          <Kv label="03 BGV 1" value={<Pill kind="mic">MIC</Pill>} />
          <Kv label="04 Acoustic Gtr" value={<Pill kind="mic">LINE</Pill>} />
          <Kv label="05 Keys" value={<span className="text-[#ffc043]">unassigned</span>} />
          <Kv label="06 Bass DI" value={<span className="text-[#ffc043]">unassigned</span>} />
          <Kv label="07/08 Drum OH L/R" value={<Pill kind="mic">MIC</Pill>} />
          <Kv label="09/10 Tracks L/R" value={<Pill kind="trk">TRACK</Pill>} />
          <Kv label="11 Speaker Podium" value={<Pill kind="mic">MIC</Pill>} />
        </Panel>
        <Panel title="Reference mix">
          <Kv label="Recorded" value="Jun 28, 2026 · 10:22" />
          <Kv label="Duration" value="5:00" />
          <Kv label="Low / Mid / Presence / Air" value="31 / 42 / 19 / 8 %" />
          <Kv label="Dynamic range" value="11.2 dB" />
          <Kv label="Status" value={<span className="text-[#5fe39a]">Fresh (4 days)</span>} />
          <div className="mt-2.5">
            <span className="inline-flex rounded-[7px] border border-[#5eb4ff]/40 bg-[#0c101a] px-3 py-[7px] text-[11.5px] font-bold text-[#8fd3ff]">
              ● Record Reference Mix (5 min)
            </span>
          </div>
        </Panel>
        <Panel title="Automation rules">
          <Kv label="SONG" value="scene “Worship” · click muted v1" />
          <Kv label="ANNOUNCEMENT" value="mute Tracks L/R · Pastor +1 dB" />
          <Kv label="SCRIPTURE" value="scene “Speech”" />
          <Kv label="PRAYER" value="all −4 dB · OH muted" />
          <Kv label="Conflicts" value={<span className="text-[#5fe39a]">none</span>} />
          <Kv label="Manual override" value={<span className="text-[#5fe39a]">always wins</span>} />
        </Panel>
      </div>
    </>
  )
}

function LiveView(): JSX.Element {
  return (
    <>
      <div className="mb-3 grid grid-cols-4 gap-2.5">
        <Tile edge="ok" k="Connection" v="TF-Rack" s="192.168.1.100 · Connected · 12 ms" />
        <Tile edge="err" k="Active alerts" v="2" s="1 feedback · 1 clipping" />
        <Tile edge="acc" k="Reference match" v={<>87<Unit>%</Unit></>} s="vs Jun 28 · bass band pulling it down" />
        <Tile edge="ok" k="Room level" v={<>−16.8 <Unit>dB RMS</Unit></>} s="in target window (−20 … −14)" />
      </div>
      <div className="flex items-start gap-2.5">
        <Panel title="Channel meters" right="LEVEL · dB · Δ REF" className="min-w-0 flex-1">
          {CHANNELS.map((c, i) => (
            <MeterRow key={c.ch} c={c} animate={i === 1 || i === 8} />
          ))}
        </Panel>
        <div className="w-[340px] flex-shrink-0">
          <Panel title="Live recommendations" right="NEWEST FIRST">
            <Event tone="crit" t="10:41:52" text="Feedback building at 2.4 kHz — Worship Leader Vox" sub="sustained spike, 3.1 s · suggest −3 dB or notch" act="−3 dB" />
            <Event tone="warn" t="10:41:38" text="Clipping on Tracks L (2.3% of samples)" sub="peaks at 0 dBFS · lower trim on ch 09" act="Trim" />
            <Event tone="info" t="10:41:12" text="Bass 28% above reference — pull Bass DI down ~2 dB" sub="60–250 Hz band heavy vs Jun 28 fingerprint" act="−2 dB" />
            <Event tone="info" t="10:40:55" text="Pastor Mic presence 8% below reference — raise ~1 dB" sub="2 kHz band soft · speech may sit back" />
            <Event tone="ok" t="10:39:41" text="Drum OH pair matches reference within 3%" sub="no action needed" />
            <Event tone="ok" t="10:38:02" text="Step 2 passed — BGV 1 level locked" sub="+1 dB applied · logged" />
          </Panel>
        </div>
      </div>
    </>
  )
}

function VariantD({ mode }: { mode: ViewMode }): JSX.Element {
  return (
    <div className="min-h-full bg-[#0a0d14] p-3.5 text-xs text-[#c7cfdd]">
      <Head mode={mode} />
      {mode === 'setup' ? <SetupView /> : <LiveView />}
    </div>
  )
}

export default VariantD
