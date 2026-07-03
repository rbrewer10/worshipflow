// Real, IPC-wired Engineer dashboard — visual language adapted from the throwaway
// preview's Variant D ("Mission Control", see ./preview/VariantD.tsx).
//
// Scope boundaries honored here (see task doc):
//  - No live audio meters / recommendation feed with real data: there is no pipeline
//    feeding live mic audio into AudioAnalyzer, and no IPC push-channel for live
//    heuristics (verified: no `wf:sound-check:*` ipcRenderer.on listener exists
//    anywhere in main/preload). The meter grid below shows each channel's real,
//    static currentFaderDb/isMuted from getChannels(), refreshed manually — not an
//    animated live feed. The recommendations panel is an honest empty state.
//  - No manual mute/fader controls here — that's Task 8. Fader/mute cells are
//    present for layout parity with the mockup but inert (no onClick handlers).
//  - Automation rules are display-only (read via getAutomationRules) — CRUD is
//    Task 9.

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import type { AutomationRule, Channel } from '../../../main/types/sound-check-types'
import type { ViewMode } from './SoundCheckTab'

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

function Panel({
  title,
  right,
  children,
  className
}: {
  title: string
  right?: string
  children: ReactNode
  className?: string
}): JSX.Element {
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

function Pill({ kind, children }: { kind: 'mic' | 'trk' | 'none'; children: ReactNode }): JSX.Element {
  if (kind === 'none') {
    return <span className="text-[#ffc043]">{children}</span>
  }
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

function Head({ mode, onRefresh }: { mode: ViewMode; onRefresh: () => void }): JSX.Element {
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
      </div>
      <button
        type="button"
        onClick={onRefresh}
        className="ml-auto rounded-[6px] border border-[#1d2434] bg-[#10141d] px-2.5 py-1 text-[10.5px] font-semibold text-[#8fd3ff] hover:bg-[#1c2740]"
      >
        Refresh channels
      </button>
    </div>
  )
}

function channelKind(c: Channel): 'mic' | 'trk' | 'none' {
  if (c.isMic) return 'mic'
  if (c.isBackingTrack) return 'trk'
  return 'none'
}

function ClassificationPanel({ channels }: { channels: Channel[] }): JSX.Element {
  return (
    <Panel title="Channel classification" right={`CH 01–${String(channels.length).padStart(2, '0')}`}>
      {channels.length === 0 ? (
        <p className="m-0 py-2 text-[11.5px] text-[#5a6480]">No channels loaded.</p>
      ) : (
        channels.map((c) => {
          const kind = channelKind(c)
          return (
            <Kv
              key={c.id}
              label={`${String(c.yamahaChannel).padStart(2, '0')} ${c.name}`}
              value={<Pill kind={kind}>{kind === 'none' ? 'unassigned' : kind.toUpperCase()}</Pill>}
            />
          )
        })
      )}
    </Panel>
  )
}

function AutomationRulesPanel(): JSX.Element {
  const [rules, setRules] = useState<AutomationRule[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.wf.soundCheck
      .getAutomationRules()
      .then(setRules)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  return (
    <Panel title="Automation rules" right="display only">
      {error ? (
        <p className="m-0 py-2 text-[11.5px] text-red-300">{error}</p>
      ) : rules === null ? (
        <p className="m-0 py-2 text-[11.5px] text-[#5a6480]">Loading…</p>
      ) : rules.length === 0 ? (
        <p className="m-0 py-2 text-[11.5px] text-[#5a6480]">
          No automation rules yet. An editor for creating rules is coming in a later task.
        </p>
      ) : (
        rules.map((rule) => (
          <Kv
            key={rule.id}
            label={rule.serviceItemType.toUpperCase()}
            value={
              <span className={rule.enabled ? 'text-[#d7deea]' : 'text-[#4a5570]'}>
                {rule.sceneNameToRecall ? `scene "${rule.sceneNameToRecall}"` : ''}
                {rule.faderAdjustments && rule.faderAdjustments.length > 0
                  ? ` · ${rule.faderAdjustments.length} fader adj.`
                  : ''}
                {!rule.enabled ? ' (disabled)' : ''}
              </span>
            }
          />
        ))
      )}
    </Panel>
  )
}

function SetupView({ channels }: { channels: Channel[] }): JSX.Element {
  const classifiedCount = channels.filter((c) => c.isMic || c.isBackingTrack).length
  return (
    <>
      <div className="mb-3 grid grid-cols-3 gap-2.5">
        <Tile edge="ok" k="Connection" v="TF-Rack" s={`Connected · ${channels.length} ch imported`} />
        <Tile
          edge={classifiedCount === channels.length && channels.length > 0 ? 'ok' : 'acc'}
          k="Channels classified"
          v={
            <>
              {classifiedCount} <Unit>/ {channels.length}</Unit>
            </>
          }
          s={classifiedCount === channels.length ? 'All channels assigned' : 'Some still unassigned'}
        />
        <Tile edge="warn" k="Reference mix" v="—" s="No live audio feed to record from yet" />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <ClassificationPanel channels={channels} />
        <AutomationRulesPanel />
      </div>
    </>
  )
}

function MeterRow({ c }: { c: Channel }): JSX.Element {
  return (
    <div className="grid grid-cols-[150px_34px_1fr_70px] items-center gap-[9px] border-b border-[#141926] py-[4.5px] last:border-b-0">
      <span
        className={`overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] font-semibold ${
          c.isMuted ? 'text-[#4a5570] line-through decoration-[#333e58]' : 'text-[#d7deea]'
        }`}
      >
        {c.name}
      </span>
      <span className="font-mono text-[9.5px] text-[#4a5570]">{String(c.yamahaChannel).padStart(2, '0')}</span>
      {/* Static fader position — not a live meter. Fill reflects currentFaderDb only;
          no animation, no polling. Manual control lands in Task 8. */}
      <span className="relative h-2.5 overflow-hidden rounded-[3px] border border-[#161c2b] bg-[#0a0e16]">
        <span
          className="absolute bottom-0 left-0 top-0 rounded-[2px]"
          style={{
            width: `${Math.max(0, Math.min(100, ((c.currentFaderDb + 60) / 120) * 100)).toFixed(0)}%`,
            background: 'linear-gradient(90deg,#1d8f5a,#2fd97b 62%,#ffc043 82%,#ff5c5c 96%)'
          }}
        />
      </span>
      <span className="text-right font-mono text-[11px] tabular-nums text-[#aeb9cc]">
        {c.isMuted ? 'MUTE' : `${c.currentFaderDb.toFixed(1)} dB`}
      </span>
    </div>
  )
}

function RecommendationsPanel(): JSX.Element {
  return (
    <Panel title="Live recommendations" right="NOT CONNECTED" className="w-[340px] flex-shrink-0">
      <div className="rounded-[7px] border border-dashed border-[#232d3b] bg-[#0c101a] px-3 py-4 text-[11.5px] leading-relaxed text-[#6b7690]">
        Live audio analysis isn&rsquo;t connected yet — this will show real-time recommendations once the mixer
        audio feed is wired up. Nothing here is fabricated.
      </div>
    </Panel>
  )
}

function LiveView({ channels }: { channels: Channel[] }): JSX.Element {
  return (
    <>
      <div className="mb-3 grid grid-cols-3 gap-2.5">
        <Tile edge="ok" k="Connection" v="TF-Rack" s="Connected" />
        <Tile edge="acc" k="Channels" v={channels.length} s={`${channels.filter((c) => c.isMuted).length} muted`} />
        <Tile edge="warn" k="Reference match" v="—" s="No live audio feed to compare against" />
      </div>
      <div className="flex items-start gap-2.5">
        <Panel title="Channel meters" right="STATIC · dB" className="min-w-0 flex-1">
          {channels.length === 0 ? (
            <p className="m-0 py-2 text-[11.5px] text-[#5a6480]">No channels loaded.</p>
          ) : (
            channels.map((c) => <MeterRow key={c.id} c={c} />)
          )}
        </Panel>
        <RecommendationsPanel />
      </div>
    </>
  )
}

function EngineerDashboard({
  mode,
  channels,
  onRefresh
}: {
  mode: ViewMode
  channels: Channel[]
  onRefresh: () => void
}): JSX.Element {
  return (
    <div className="min-h-full bg-[#0a0d14] p-3.5 text-xs text-[#c7cfdd]">
      <Head mode={mode} onRefresh={onRefresh} />
      {mode === 'setup' ? <SetupView channels={channels} /> : <LiveView channels={channels} />}
    </div>
  )
}

export default EngineerDashboard
