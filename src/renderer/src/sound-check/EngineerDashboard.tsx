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
//  - Manual mute/fader controls ARE live here (Task 8): each MeterRow has a mute
//    toggle and an interactive fader slider wired to muteChannel/setFader, which
//    reconcile against canonical state via onRefresh. The fader reflects the SET
//    position, not a live audio level — see the "no live meters" boundary above.
//  - Automation rules have a full CRUD editor (Task 9): AutomationRulesPanel lists
//    rules with Edit/Delete and an inline add/edit form (serviceItemType, enabled,
//    optional scene recall, and an add/remove list of channel + deltaDb fader
//    adjustments). Rules remain IN-MEMORY only (lost on app restart) — SQLite
//    persistence is a separate deferred task (see the TODOs in sound-check-state.ts).

import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { AutomationRule, Channel } from '../../../main/types/sound-check-types'
import type { ViewMode } from './SoundCheckTab'

// Fader UI range. Mirrors the YamahaController's PLACEHOLDER usable range: it maps
// -60..+60 dB linearly onto the 0..1 OSC value. Real TF-Rack faders are -inf..+10 dB
// with a non-linear taper — to be revisited at hardware calibration. Kept as renderer-
// local constants (renderer may only import TYPES from main, not runtime values).
const FADER_MIN_DB = -60
const FADER_MAX_DB = 60
const FADER_STEP_DB = 0.5

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

// The 5 service-item types an automation rule can fire on — mirrors the union in
// AutomationRule['serviceItemType']. Kept as a renderer-local const (renderer may
// import TYPES but not runtime values from main) and typed as the union tuple so a
// change to the type surfaces as a compile error here.
const SERVICE_ITEM_TYPES: AutomationRule['serviceItemType'][] = [
  'song',
  'scripture',
  'announcement',
  'prayer',
  'countdown'
]

// deltaDb input bounds for a fader adjustment. Relative nudge (not an absolute
// level), so a modest symmetric range is plenty; step matches the fader's 0.5 dB.
const DELTA_MIN_DB = -24
const DELTA_MAX_DB = 24
const DELTA_STEP_DB = 0.5

// Editable draft of a fader adjustment. channelId is nullable while the row is
// being filled in (the "pick a channel" placeholder); deltaDb is a string so the
// number input can be transiently empty/partial without fighting the user. Both are
// validated into a real { channelId: number; deltaDb: number } on save.
interface FaderDraft {
  channelId: number | null
  deltaDb: string
}

interface RuleDraft {
  // Present when editing an existing rule; undefined for a new rule (id minted on
  // save). Reused on save so the upsert replaces the rule rather than duplicating it.
  id?: string
  serviceItemType: AutomationRule['serviceItemType']
  enabled: boolean
  sceneNameToRecall: string
  faderAdjustments: FaderDraft[]
}

function emptyDraft(): RuleDraft {
  return { serviceItemType: 'song', enabled: true, sceneNameToRecall: '', faderAdjustments: [] }
}

function draftFromRule(rule: AutomationRule): RuleDraft {
  return {
    id: rule.id,
    serviceItemType: rule.serviceItemType,
    enabled: rule.enabled,
    sceneNameToRecall: rule.sceneNameToRecall ?? '',
    faderAdjustments: (rule.faderAdjustments ?? []).map((a) => ({
      channelId: a.channelId,
      deltaDb: String(a.deltaDb)
    }))
  }
}

// Field styling shared across the form's inputs/selects — matches the panel's dark
// palette. Extracted so the several controls stay visually consistent.
const FIELD_CLASS =
  'w-full rounded-[5px] border border-[#1d2434] bg-[#0a0e16] px-2 py-1 text-[11.5px] text-[#d7deea] outline-none focus:border-[#2f5480]'

function RuleForm({
  draft,
  channels,
  pending,
  onChange,
  onSave,
  onCancel
}: {
  draft: RuleDraft
  channels: Channel[]
  pending: boolean
  onChange: (next: RuleDraft) => void
  onSave: () => void
  onCancel: () => void
}): JSX.Element {
  // Validation mirrors the save-side rule: a rule must DO something — recall a scene
  // and/or adjust at least one fader — and every fader row must be fully specified.
  const trimmedScene = draft.sceneNameToRecall.trim()
  const faderErrors = draft.faderAdjustments.map((a) => {
    if (a.channelId === null) return 'pick a channel'
    if (!Number.isFinite(Number(a.deltaDb)) || a.deltaDb.trim() === '') return 'invalid dB'
    return null
  })
  const hasFaderError = faderErrors.some((e) => e !== null)
  const doesNothing = trimmedScene === '' && draft.faderAdjustments.length === 0
  const validationError = doesNothing
    ? 'A rule must recall a scene or adjust at least one fader.'
    : hasFaderError
      ? 'Fix the highlighted fader adjustment(s): each needs a channel and a valid dB.'
      : null

  const set = (patch: Partial<RuleDraft>): void => onChange({ ...draft, ...patch })
  const setFader = (index: number, patch: Partial<FaderDraft>): void =>
    set({
      faderAdjustments: draft.faderAdjustments.map((a, i) => (i === index ? { ...a, ...patch } : a))
    })

  return (
    <div className="mb-2 rounded-[8px] border border-[#232d3b] bg-[#0c101a] p-2.5">
      <label className="mb-2 block">
        <span className="mb-1 block text-[9px] font-extrabold uppercase tracking-[.16em] text-[#5a6480]">
          When a service item of type
        </span>
        <select
          className={FIELD_CLASS}
          value={draft.serviceItemType}
          disabled={pending}
          onChange={(e) =>
            set({ serviceItemType: e.target.value as AutomationRule['serviceItemType'] })
          }
        >
          {SERVICE_ITEM_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label className="mb-2 flex cursor-pointer items-center gap-2 text-[11.5px] text-[#aeb9cc]">
        <input
          type="checkbox"
          checked={draft.enabled}
          disabled={pending}
          onChange={(e) => set({ enabled: e.target.checked })}
        />
        Rule enabled
      </label>

      <label className="mb-2 block">
        <span className="mb-1 block text-[9px] font-extrabold uppercase tracking-[.16em] text-[#5a6480]">
          Recall scene (optional)
        </span>
        <input
          type="text"
          className={FIELD_CLASS}
          placeholder="e.g. Worship"
          value={draft.sceneNameToRecall}
          disabled={pending}
          onChange={(e) => set({ sceneNameToRecall: e.target.value })}
        />
      </label>

      <div className="mb-2">
        <div className="mb-1 flex items-center">
          <span className="text-[9px] font-extrabold uppercase tracking-[.16em] text-[#5a6480]">
            Fader adjustments
          </span>
          <button
            type="button"
            disabled={pending || channels.length === 0}
            onClick={() =>
              set({
                faderAdjustments: [
                  ...draft.faderAdjustments,
                  { channelId: channels[0]?.id ?? null, deltaDb: '0' }
                ]
              })
            }
            className="ml-auto rounded-[4px] border border-[#1d2434] bg-[#10141d] px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[#8fd3ff] hover:bg-[#1c2740] disabled:opacity-40"
          >
            + Add
          </button>
        </div>
        {channels.length === 0 ? (
          <p className="m-0 text-[10.5px] leading-relaxed text-[#5a6480]">
            Fader adjustments need a connected mixer. Scene-only rules can still be created.
          </p>
        ) : draft.faderAdjustments.length === 0 ? (
          <p className="m-0 text-[10.5px] text-[#5a6480]">None. Scene recall only.</p>
        ) : (
          draft.faderAdjustments.map((a, i) => (
            <div key={i} className="mb-1 flex items-center gap-1.5">
              <select
                className={FIELD_CLASS}
                value={a.channelId ?? ''}
                disabled={pending}
                onChange={(e) =>
                  setFader(i, { channelId: e.target.value === '' ? null : Number(e.target.value) })
                }
              >
                <option value="">pick a channel…</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {String(c.yamahaChannel).padStart(2, '0')} {c.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={DELTA_MIN_DB}
                max={DELTA_MAX_DB}
                step={DELTA_STEP_DB}
                className={`${FIELD_CLASS} w-[74px] flex-shrink-0`}
                value={a.deltaDb}
                disabled={pending}
                aria-label="delta dB"
                onChange={(e) => setFader(i, { deltaDb: e.target.value })}
              />
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  set({ faderAdjustments: draft.faderAdjustments.filter((_, j) => j !== i) })
                }
                aria-label="remove fader adjustment"
                className="flex-shrink-0 rounded-[4px] bg-[#141926] px-2 py-1 text-[11px] text-[#8b96ad] hover:text-[#ff8f8f]"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      {validationError && (
        <p className="m-0 mb-2 text-[11px] text-[#ffc043]">{validationError}</p>
      )}
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={pending || validationError !== null}
          onClick={onSave}
          className="rounded-[5px] bg-[#1c2740] px-3 py-1 text-[10.5px] font-bold uppercase tracking-widest text-[#8fd3ff] shadow-[inset_0_0_0_1px_rgba(94,180,255,.35)] hover:bg-[#243456] disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="rounded-[5px] border border-[#1d2434] bg-[#10141d] px-3 py-1 text-[10.5px] font-semibold text-[#8b96ad] hover:text-[#aeb9cc] disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function AutomationRulesPanel({ channels }: { channels: Channel[] }): JSX.Element {
  const [rules, setRules] = useState<AutomationRule[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The open editor draft (null = form closed). 'id' distinguishes edit vs. new.
  const [draft, setDraft] = useState<RuleDraft | null>(null)
  // A save or delete IPC call is in flight — disables the action buttons so a rule
  // can't be double-submitted / double-deleted.
  const [pending, setPending] = useState(false)
  // Two-click confirm for delete (id awaiting confirmation), so a stray click can't
  // destroy a rule — deliberately lighter-weight than pulling in a modal library.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Mounted guard for post-await setState in the action handlers (save/delete),
  // matching the cancelled-flag discipline the fetch effect and VolunteerCheck use.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Re-fetch canonical rules from state after every mutation (save/delete) rather
  // than optimistically editing local list state — matches the channel-control
  // call-then-refetch pattern, so the list always reflects what the main process holds.
  const refetch = async (): Promise<void> => {
    const r = await window.wf.soundCheck.getAutomationRules()
    if (mountedRef.current) setRules(r)
  }

  useEffect(() => {
    let cancelled = false
    window.wf.soundCheck
      .getAutomationRules()
      .then((r) => {
        if (!cancelled) setRules(r)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSave = (): void => {
    if (!draft) return
    const scene = draft.sceneNameToRecall.trim()
    const faderAdjustments = draft.faderAdjustments
      .filter((a) => a.channelId !== null)
      .map((a) => ({ channelId: a.channelId as number, deltaDb: Number(a.deltaDb) }))
    // crypto.randomUUID is available in the renderer's secure context (Electron and
    // localhost both qualify). Reuse the existing id when editing so the upsert
    // replaces in place; mint a fresh id for a new rule.
    const rule: AutomationRule = {
      id: draft.id ?? crypto.randomUUID(),
      serviceItemType: draft.serviceItemType,
      enabled: draft.enabled,
      // Omit the field entirely when blank rather than storing an empty string.
      ...(scene ? { sceneNameToRecall: scene } : {}),
      ...(faderAdjustments.length > 0 ? { faderAdjustments } : {})
    }
    setPending(true)
    setError(null)
    window.wf.soundCheck
      .saveAutomationRule(rule)
      .then(refetch)
      .then(() => {
        if (mountedRef.current) setDraft(null)
      })
      .catch((err: unknown) => {
        if (mountedRef.current) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (mountedRef.current) setPending(false)
      })
  }

  const handleDelete = (id: string): void => {
    setPending(true)
    setError(null)
    setConfirmDeleteId(null)
    window.wf.soundCheck
      .deleteAutomationRule(id)
      .then(refetch)
      .then(() => {
        // If the rule being edited was the one deleted, close the form.
        if (mountedRef.current && draft?.id === id) setDraft(null)
      })
      .catch((err: unknown) => {
        if (mountedRef.current) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (mountedRef.current) setPending(false)
      })
  }

  return (
    <Panel title="Automation rules" right={rules ? `${rules.length} rule${rules.length === 1 ? '' : 's'}` : undefined}>
      {error && <p className="m-0 mb-2 text-[11.5px] text-red-300">{error}</p>}

      {rules === null ? (
        <p className="m-0 py-2 text-[11.5px] text-[#5a6480]">Loading…</p>
      ) : rules.length === 0 && !draft ? (
        <p className="m-0 py-2 text-[11.5px] text-[#5a6480]">No automation rules yet.</p>
      ) : (
        rules.map((rule) => (
          <div
            key={rule.id}
            className="flex items-center gap-2 border-b border-[#141926] py-[5px] last:border-b-0"
          >
            <span className="min-w-0 flex-1 text-[11.5px]">
              <b className="font-semibold text-[#d7deea]">{rule.serviceItemType.toUpperCase()}</b>{' '}
              <span className={rule.enabled ? 'text-[#8b96ad]' : 'text-[#4a5570]'}>
                {rule.sceneNameToRecall ? `scene "${rule.sceneNameToRecall}"` : 'no scene'}
                {rule.faderAdjustments && rule.faderAdjustments.length > 0
                  ? ` · ${rule.faderAdjustments.length} fader adj.`
                  : ''}
                {!rule.enabled ? ' · disabled' : ''}
              </span>
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setConfirmDeleteId(null)
                setDraft(draftFromRule(rule))
              }}
              className="flex-shrink-0 rounded-[4px] bg-[#141926] px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[#8fd3ff] hover:text-[#bfe2ff] disabled:opacity-40"
            >
              Edit
            </button>
            {confirmDeleteId === rule.id ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => handleDelete(rule.id)}
                className="flex-shrink-0 rounded-[4px] bg-[#ff5c5c]/[0.16] px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[#ff8f8f] shadow-[inset_0_0_0_1px_rgba(255,92,92,.4)] disabled:opacity-40"
              >
                Confirm
              </button>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmDeleteId(rule.id)}
                className="flex-shrink-0 rounded-[4px] bg-[#141926] px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[#8b96ad] hover:text-[#ff8f8f] disabled:opacity-40"
              >
                Delete
              </button>
            )}
          </div>
        ))
      )}

      {draft ? (
        <div className="mt-2">
          <RuleForm
            draft={draft}
            channels={channels}
            pending={pending}
            onChange={setDraft}
            onSave={handleSave}
            onCancel={() => setDraft(null)}
          />
        </div>
      ) : (
        <button
          type="button"
          disabled={pending || rules === null}
          onClick={() => {
            setConfirmDeleteId(null)
            setDraft(emptyDraft())
          }}
          className="mt-2 rounded-[5px] border border-[#1d2434] bg-[#10141d] px-3 py-1 text-[10.5px] font-semibold text-[#8fd3ff] hover:bg-[#1c2740] disabled:opacity-40"
        >
          + Add rule
        </button>
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
        <AutomationRulesPanel channels={channels} />
      </div>
    </>
  )
}

// Interactive fader + mute row (Task 8). The slider position reflects the channel's
// SET fader dB (draft while dragging, else canonical currentFaderDb) — NOT a live audio
// meter. IPC is committed on release, never per onChange, to avoid flooding the mixer.
function MeterRow({
  c,
  pending,
  draftDb,
  onMuteToggle,
  onFaderDraft,
  onFaderCommit
}: {
  c: Channel
  pending: boolean
  // Live draft dB during a drag; undefined => follow canonical currentFaderDb.
  draftDb: number | undefined
  onMuteToggle: () => void
  onFaderDraft: (db: number) => void
  onFaderCommit: () => void
}): JSX.Element {
  const displayDb = draftDb ?? c.currentFaderDb
  const fillPct = Math.max(
    0,
    Math.min(100, ((displayDb - FADER_MIN_DB) / (FADER_MAX_DB - FADER_MIN_DB)) * 100)
  )
  return (
    <div className="grid grid-cols-[130px_28px_58px_1fr_58px] items-center gap-[9px] border-b border-[#141926] py-[4.5px] last:border-b-0">
      <span
        className={`overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] font-semibold ${
          c.isMuted ? 'text-[#4a5570] line-through decoration-[#333e58]' : 'text-[#d7deea]'
        }`}
      >
        {c.name}
      </span>
      <span className="font-mono text-[9.5px] text-[#4a5570]">{String(c.yamahaChannel).padStart(2, '0')}</span>
      <button
        type="button"
        disabled={pending}
        onClick={onMuteToggle}
        aria-pressed={c.isMuted}
        className={`rounded-[4px] px-1.5 py-[3px] text-[9px] font-extrabold uppercase tracking-widest disabled:opacity-50 ${
          c.isMuted
            ? 'bg-[#ff5c5c]/[0.16] text-[#ff8f8f] shadow-[inset_0_0_0_1px_rgba(255,92,92,.4)]'
            : 'bg-[#141926] text-[#5a6480] hover:text-[#aeb9cc]'
        }`}
      >
        Mute
      </button>
      {/* Slim range slider over a gradient fill track — same visual language as the old
          static bar, but the fill now tracks the draft-or-canonical dB and the native
          input handles the drag. Commit fires only on release (pointer/key up, blur). */}
      <span className="relative flex h-2.5 items-center">
        <span className="absolute inset-0 overflow-hidden rounded-[3px] border border-[#161c2b] bg-[#0a0e16]">
          <span
            className="absolute bottom-0 left-0 top-0 rounded-[2px]"
            style={{
              width: `${fillPct.toFixed(1)}%`,
              background: 'linear-gradient(90deg,#1d8f5a,#2fd97b 62%,#ffc043 82%,#ff5c5c 96%)',
              opacity: c.isMuted ? 0.4 : 1
            }}
          />
        </span>
        <input
          type="range"
          min={FADER_MIN_DB}
          max={FADER_MAX_DB}
          step={FADER_STEP_DB}
          value={displayDb}
          disabled={pending}
          aria-label={`${c.name} fader (dB)`}
          onChange={(e) => onFaderDraft(Number(e.target.value))}
          onPointerUp={onFaderCommit}
          onKeyUp={onFaderCommit}
          onBlur={onFaderCommit}
          className="relative m-0 h-2.5 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-default disabled:opacity-50 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-1.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-[2px] [&::-webkit-slider-thumb]:bg-[#eef2f8] [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgba(0,0,0,.5)]"
        />
      </span>
      <span className="text-right font-mono text-[11px] tabular-nums text-[#aeb9cc]">
        {c.isMuted ? 'MUTE' : `${displayDb.toFixed(1)} dB`}
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

function LiveView({ channels, onRefresh }: { channels: Channel[]; onRefresh: () => Promise<void> }): JSX.Element {
  // Channel ids with an in-flight muteChannel()/setFader() call. Same guard pattern as
  // VolunteerCheck's classification chips: add id before the IPC call, remove in
  // .finally(), disable that channel's mute + fader while pending. ALWAYS build a new Set
  // per setState (never mutate in place) or React won't re-render.
  const [pendingChannelIds, setPendingChannelIds] = useState<Set<number>>(new Set())
  // Per-channel live fader draft (keyed by channel id). Present only while a channel is
  // being dragged/committed; the slider shows the draft. Commit awaits the canonical
  // refresh before dropping the draft, so the displayed value goes draft -> equal
  // canonical value with no snap-back flash. Keyed so a refresh or another channel's
  // activity never clobbers the channel being dragged.
  const [draftFaders, setDraftFaders] = useState<Record<number, number>>({})
  const [controlError, setControlError] = useState<string | null>(null)

  const markPending = (channelId: number): void =>
    setPendingChannelIds((prev) => new Set(prev).add(channelId))
  const clearPending = (channelId: number): void =>
    setPendingChannelIds((prev) => {
      const next = new Set(prev)
      next.delete(channelId)
      return next
    })

  const handleMuteToggle = (channel: Channel): void => {
    markPending(channel.id)
    setControlError(null)
    window.wf.soundCheck
      .muteChannel(channel.id, !channel.isMuted)
      .then(onRefresh)
      .catch((err: unknown) => {
        setControlError(`${channel.name}: ${err instanceof Error ? err.message : String(err)}`)
      })
      .finally(() => clearPending(channel.id))
  }

  const handleFaderDraft = (channelId: number, db: number): void =>
    setDraftFaders((prev) => ({ ...prev, [channelId]: db }))

  // Commit on release. No-op if there's no draft (e.g. blur without a preceding drag).
  // Awaits the canonical refresh BEFORE dropping the draft: until the refreshed prop
  // carries the committed value, the draft keeps the slider on that same value, so there
  // is no window where it falls back to the stale pre-commit position.
  const handleFaderCommit = async (channelId: number): Promise<void> => {
    const db = draftFaders[channelId]
    if (db === undefined) return
    const channelName = channels.find((c) => c.id === channelId)?.name ?? `Channel ${channelId}`
    markPending(channelId)
    setControlError(null)
    try {
      await window.wf.soundCheck.setFader(channelId, db)
      await onRefresh()
    } catch (err: unknown) {
      setControlError(`${channelName}: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      clearPending(channelId)
      setDraftFaders((prev) => {
        const next = { ...prev }
        delete next[channelId]
        return next
      })
    }
  }

  return (
    <>
      <div className="mb-3 grid grid-cols-3 gap-2.5">
        <Tile edge="ok" k="Connection" v="TF-Rack" s="Connected" />
        <Tile edge="acc" k="Channels" v={channels.length} s={`${channels.filter((c) => c.isMuted).length} muted`} />
        <Tile edge="warn" k="Reference match" v="—" s="No live audio feed to compare against" />
      </div>
      <div className="flex items-start gap-2.5">
        <Panel title="Channel controls" right="SET · dB" className="min-w-0 flex-1">
          {channels.length === 0 ? (
            <p className="m-0 py-2 text-[11.5px] text-[#5a6480]">No channels loaded.</p>
          ) : (
            channels.map((c) => (
              <MeterRow
                key={c.id}
                c={c}
                pending={pendingChannelIds.has(c.id)}
                draftDb={draftFaders[c.id]}
                onMuteToggle={() => handleMuteToggle(c)}
                onFaderDraft={(db) => handleFaderDraft(c.id, db)}
                onFaderCommit={() => handleFaderCommit(c.id)}
              />
            ))
          )}
          {controlError && <p className="m-0 mt-2 text-[11.5px] text-red-300">{controlError}</p>}
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
  onRefresh: () => Promise<void>
}): JSX.Element {
  return (
    <div className="min-h-full bg-[#0a0d14] p-3.5 text-xs text-[#c7cfdd]">
      <Head mode={mode} onRefresh={onRefresh} />
      {mode === 'setup' ? <SetupView channels={channels} /> : <LiveView channels={channels} onRefresh={onRefresh} />}
    </div>
  )
}

export default EngineerDashboard
