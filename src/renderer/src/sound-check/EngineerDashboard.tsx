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
//    adjustments). Rules are persisted to SQLite and survive app restarts.

import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { CircleStop, CircleX, Info, Play, Plus, TriangleAlert, X } from 'lucide-react'
import type { AutomationRule, Channel, Heuristic } from '../../../main/types/sound-check-types'
import type { ViewMode } from './SoundCheckTab'

// Fader UI range. Mirrors the YamahaController's PLACEHOLDER usable range: it maps
// -60..+60 dB linearly onto the 0..1 OSC value. Real TF-Rack faders are -inf..+10 dB
// with a non-linear taper — to be revisited at hardware calibration. Kept as renderer-
// local constants (renderer may only import TYPES from main, not runtime values).
const FADER_MIN_DB = -60
const FADER_MAX_DB = 60
const FADER_STEP_DB = 0.5

// Status edge colors carry real meaning (ok/err/acc/warn) and are preserved — darkened
// slightly from the original dark-theme hues so they still read clearly as a left-edge
// accent stripe against the light panel background.
type Edge = 'ok' | 'err' | 'acc' | 'warn'
const EDGE: Record<Edge, string> = {
  ok: 'shadow-[inset_3px_0_0_#16a34a]',
  err: 'shadow-[inset_3px_0_0_#dc2626]',
  acc: 'shadow-[inset_3px_0_0_#2563eb]',
  warn: 'shadow-[inset_3px_0_0_#d97706]'
}

function Tile({ edge, k, v, s }: { edge: Edge; k: string; v: ReactNode; s: string }): JSX.Element {
  return (
    <div className={`relative overflow-hidden rounded-[10px] border border-slate-200 bg-white px-[13px] py-[11px] ${EDGE[edge]}`}>
      <p className="mb-[7px] mt-0 text-[9px] font-extrabold uppercase tracking-[.18em] text-slate-500">{k}</p>
      <p className="m-0 text-[19px] font-bold tracking-tight tabular-nums text-slate-900">{v}</p>
      <p className="mb-0 mt-[3px] text-[11px] tabular-nums text-slate-500">{s}</p>
    </div>
  )
}

function Unit({ children }: { children: ReactNode }): JSX.Element {
  return <span className="text-xs font-semibold text-slate-500">{children}</span>
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
    <div className={`rounded-[10px] border border-slate-200 bg-white px-[13px] py-[11px] ${className ?? ''}`}>
      <p className="mb-[9px] mt-0 flex items-center text-[9px] font-extrabold uppercase tracking-[.18em] text-slate-500">
        {title}
        {right !== undefined && <span className="ml-auto font-semibold tracking-[.08em] text-slate-400">{right}</span>}
      </p>
      {children}
    </div>
  )
}

function Kv({ label, value }: { label: string; value: ReactNode }): JSX.Element {
  return (
    <div className="flex justify-between border-b border-slate-100 py-[5px] text-[11.5px] text-slate-600 last:border-b-0">
      <span>{label}</span>
      <b className="font-semibold tabular-nums text-slate-900">{value}</b>
    </div>
  )
}

// Mic/Track classification pills carry real meaning (matches VolunteerCheck's chip
// colors: emerald for mic, purple for track) — hues chosen to stay legible on white.
function Pill({ kind, children }: { kind: 'mic' | 'trk' | 'none'; children: ReactNode }): JSX.Element {
  if (kind === 'none') {
    return <span className="text-amber-600">{children}</span>
  }
  return (
    <span
      className={`rounded px-[7px] py-0.5 text-[9px] font-extrabold uppercase tracking-widest ${
        kind === 'mic' ? 'bg-blue-500/15 text-blue-700' : 'bg-purple-500/15 text-purple-700'
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
        on ? 'bg-blue-500/15 text-blue-700 shadow-[inset_0_0_0_1px_rgba(16,185,129,.35)]' : 'text-slate-500'
      }`}
    >
      {label}
    </span>
  )
  return (
    <div className="mb-3 flex items-center gap-3.5">
      <h2 className="m-0 text-[13px] font-bold uppercase tracking-[.14em] text-slate-900">Sound Check</h2>
      <div className="flex gap-0.5 rounded-[7px] border border-slate-200 bg-[#f4f6f9] p-0.5">
        {m('Setup', mode === 'setup')}
        {m('Sound Check', mode === 'live')}
      </div>
      <button
        type="button"
        onClick={onRefresh}
        className="ml-auto rounded-[6px] border border-slate-200 bg-[#f4f6f9] px-2.5 py-1 text-[10.5px] font-semibold text-blue-700 hover:bg-blue-500/10"
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
        <p className="m-0 py-2 text-[11.5px] text-slate-500">No channels loaded.</p>
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

// The number input's min/max are only advisory (a user can type/paste out-of-range
// values), so clamp on save too — a nonsense delta like +1000 dB must never reach a
// stored rule that could drive real mixer output.
const clampDelta = (n: number): number => Math.min(DELTA_MAX_DB, Math.max(DELTA_MIN_DB, n))

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

// Field styling shared across the form's inputs/selects — matches the panel's light
// palette. Extracted so the several controls stay visually consistent.
const FIELD_CLASS =
  'w-full rounded-[5px] border border-slate-200 bg-white px-2 py-1 text-[11.5px] text-slate-900 outline-none focus:border-blue-500'

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
    const n = Number(a.deltaDb)
    if (!Number.isFinite(n) || a.deltaDb.trim() === '') return 'invalid dB'
    if (n < DELTA_MIN_DB || n > DELTA_MAX_DB) return `dB must be ${DELTA_MIN_DB} to ${DELTA_MAX_DB}`
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
    <div className="mb-2 rounded-[8px] border border-slate-200 bg-[#f4f6f9] p-2.5">
      <label className="mb-2 block">
        <span className="mb-1 block text-[9px] font-extrabold uppercase tracking-[.16em] text-slate-500">
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

      <label className="mb-2 flex cursor-pointer items-center gap-2 text-[11.5px] text-slate-700">
        <input
          type="checkbox"
          checked={draft.enabled}
          disabled={pending}
          onChange={(e) => set({ enabled: e.target.checked })}
        />
        Rule enabled
      </label>

      <label className="mb-2 block">
        <span className="mb-1 block text-[9px] font-extrabold uppercase tracking-[.16em] text-slate-500">
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
          <span className="text-[9px] font-extrabold uppercase tracking-[.16em] text-slate-500">
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
            className="ml-auto inline-flex items-center justify-center gap-1 rounded-[4px] border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-blue-700 hover:bg-blue-500/10 disabled:opacity-40"
          >
            <Plus size={11} /> Add
          </button>
        </div>
        {channels.length === 0 ? (
          <p className="m-0 text-[10.5px] leading-relaxed text-slate-500">
            Fader adjustments need a connected mixer. Scene-only rules can still be created.
          </p>
        ) : draft.faderAdjustments.length === 0 ? (
          <p className="m-0 text-[10.5px] text-slate-500">None. Scene recall only.</p>
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
                className="inline-flex flex-shrink-0 items-center justify-center rounded-[4px] bg-slate-100 px-2 py-1 text-slate-500 hover:text-red-600"
              >
                <X size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      {validationError && (
        <p className="m-0 mb-2 text-[11px] text-amber-600">{validationError}</p>
      )}
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={pending || validationError !== null}
          onClick={onSave}
          className="rounded-[5px] bg-blue-500/15 px-3 py-1 text-[10.5px] font-bold uppercase tracking-widest text-blue-700 shadow-[inset_0_0_0_1px_rgba(16,185,129,.35)] hover:bg-blue-500/25 disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="rounded-[5px] border border-slate-200 bg-white px-3 py-1 text-[10.5px] font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-40"
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
      .map((a) => ({ channelId: a.channelId as number, deltaDb: clampDelta(Number(a.deltaDb)) }))
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
      {error && <p className="m-0 mb-2 text-[11.5px] text-red-600">{error}</p>}

      {rules === null ? (
        <p className="m-0 py-2 text-[11.5px] text-slate-500">Loading…</p>
      ) : rules.length === 0 && !draft ? (
        <p className="m-0 py-2 text-[11.5px] text-slate-500">No automation rules yet.</p>
      ) : (
        rules.map((rule) => (
          <div
            key={rule.id}
            className="flex items-center gap-2 border-b border-slate-100 py-[5px] last:border-b-0"
          >
            <span className="min-w-0 flex-1 text-[11.5px]">
              <b className="font-semibold text-slate-900">{rule.serviceItemType.toUpperCase()}</b>{' '}
              <span className={rule.enabled ? 'text-slate-600' : 'text-slate-400'}>
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
              className="flex-shrink-0 rounded-[4px] bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-blue-700 hover:text-blue-800 disabled:opacity-40"
            >
              Edit
            </button>
            {confirmDeleteId === rule.id ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => handleDelete(rule.id)}
                className="flex-shrink-0 rounded-[4px] bg-red-500/[0.14] px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-red-700 shadow-[inset_0_0_0_1px_rgba(220,38,38,.35)] disabled:opacity-40"
              >
                Confirm
              </button>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmDeleteId(rule.id)}
                className="flex-shrink-0 rounded-[4px] bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-500 hover:text-red-600 disabled:opacity-40"
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
          className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-[5px] border border-slate-200 bg-white px-3 py-1 text-[10.5px] font-semibold text-blue-700 hover:bg-blue-500/10 disabled:opacity-40"
        >
          <Plus size={13} /> Add rule
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
    <div className="grid grid-cols-[130px_28px_58px_1fr_58px] items-center gap-[9px] border-b border-slate-100 py-[4.5px] last:border-b-0">
      <span
        className={`overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] font-semibold ${
          c.isMuted ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-900'
        }`}
      >
        {c.name}
      </span>
      <span className="font-mono text-[9.5px] text-slate-400">{String(c.yamahaChannel).padStart(2, '0')}</span>
      <button
        type="button"
        disabled={pending}
        onClick={onMuteToggle}
        aria-pressed={c.isMuted}
        className={`rounded-[4px] px-1.5 py-[3px] text-[9px] font-extrabold uppercase tracking-widest disabled:opacity-50 ${
          c.isMuted
            ? 'bg-red-500/[0.14] text-red-700 shadow-[inset_0_0_0_1px_rgba(220,38,38,.35)]'
            : 'bg-slate-100 text-slate-500 hover:text-slate-800'
        }`}
      >
        Mute
      </button>
      {/* Slim range slider over a gradient fill track — same visual language as the old
          static bar, but the fill now tracks the draft-or-canonical dB and the native
          input handles the drag. Commit fires only on release (pointer/key up, blur).
          Track kept dark intentionally: the fill is a real green→amber→red level meter,
          like a hardware fader scale, and reads best against a dark meter-style track. */}
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
      <span className="text-right font-mono text-[11px] tabular-nums text-slate-700">
        {c.isMuted ? 'MUTE' : `${displayDb.toFixed(1)} dB`}
      </span>
    </div>
  )
}

function RecommendationsPanel({
  heuristics,
  isCapturing
}: {
  heuristics: Heuristic[]
  isCapturing: boolean
}): JSX.Element {
  const severityIcon: Record<string, JSX.Element> = {
    info: <Info size={12} className="shrink-0" />,
    warning: <TriangleAlert size={12} className="shrink-0" />,
    error: <CircleX size={12} className="shrink-0" />
  }

  // Severity colors carry real meaning and are preserved, darkened for light-background
  // legibility (the original sky/amber/red were tuned for a dark backdrop and would
  // wash out on white).
  const severityColor: Record<string, string> = {
    info: 'text-blue-700',
    warning: 'text-amber-600',
    error: 'text-red-600'
  }

  return (
    <Panel
      title="Live recommendations"
      right={isCapturing ? 'CAPTURING' : 'NOT CONNECTED'}
      className="w-[340px] flex-shrink-0"
    >
      {!isCapturing ? (
        <div className="rounded-[7px] border border-dashed border-slate-200 bg-[#f4f6f9] px-3 py-4 text-[11.5px] leading-relaxed text-slate-500">
          Start audio capture to see real-time recommendations from the live mix. Nothing here is fabricated.
        </div>
      ) : heuristics.length === 0 ? (
        <div className="rounded-[7px] border border-dashed border-slate-200 bg-[#f4f6f9] px-3 py-4 text-[11.5px] leading-relaxed text-slate-500">
          Listening for audio issues… No issues detected yet.
        </div>
      ) : (
        <div className="space-y-2">
          {heuristics.map((h, i) => (
            <div
              key={i}
              className="rounded-[6px] border border-slate-200 bg-[#f4f6f9] px-3 py-2 text-[10.5px] leading-relaxed"
            >
              <div className={`flex items-center gap-1 font-semibold ${severityColor[h.severity] || 'text-slate-600'}`}>
                {severityIcon[h.severity] ?? <span>•</span>} {h.type}
              </div>
              <div className="mt-1 text-slate-500">{h.message}</div>
              {h.value !== undefined && (
                <div className="mt-1 font-mono text-[9px] text-slate-400">
                  {typeof h.value === 'number' ? h.value.toFixed(1) : String(h.value)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
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

  // Live audio capture state
  const [isCapturing, setIsCapturing] = useState(false)
  const [liveHeuristics, setLiveHeuristics] = useState<Heuristic[]>([])
  const [captureError, setCaptureError] = useState<string | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const mountedRef = useRef(true)

  // Start/stop audio capture
  const toggleAudioCapture = async (): Promise<void> => {
    try {
      if (isCapturing) {
        await window.wf.soundCheck.stopAudioCapture()
        if (mountedRef.current) setIsCapturing(false)
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      } else {
        await window.wf.soundCheck.startAudioCapture()
        if (mountedRef.current) setIsCapturing(true)
        // Poll live heuristics every 100ms
        pollIntervalRef.current = setInterval(async () => {
          try {
            const heuristics = await window.wf.soundCheck.getLiveHeuristics()
            if (mountedRef.current) setLiveHeuristics(heuristics)
          } catch (err) {
            console.error('[LiveView] Failed to poll live heuristics:', err)
          }
        }, 100)
      }
      if (mountedRef.current) setCaptureError(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const context = isCapturing ? 'stop audio capture' : 'start audio capture'
      console.error(`[LiveView] Failed to ${context}:`, err)
      if (mountedRef.current) setCaptureError(`Failed to ${context}: ${msg}`)
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      if (isCapturing) {
        window.wf.soundCheck
          .stopAudioCapture()
          .catch((err) => console.error('[LiveView] Failed to stop audio on unmount:', err))
      }
    }
  }, [isCapturing])

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
            <p className="m-0 py-2 text-[11.5px] text-slate-500">No channels loaded.</p>
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
          {controlError && <p className="m-0 mt-2 text-[11.5px] text-red-600">{controlError}</p>}
        </Panel>
        <div className="flex flex-col gap-2.5">
          <button
            onClick={toggleAudioCapture}
            disabled={!!captureError}
            className="inline-flex items-center justify-center gap-1.5 rounded-[6px] border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-blue-700 hover:bg-blue-500/10 disabled:opacity-50"
          >
            {isCapturing ? <CircleStop size={13} /> : <Play size={13} />}
            {isCapturing ? 'Stop Capture' : 'Start Capture'}
          </button>
          {captureError && <p className="m-0 text-[10px] text-red-600">{captureError}</p>}
          <RecommendationsPanel heuristics={liveHeuristics} isCapturing={isCapturing} />
        </div>
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
    <div className="min-h-full bg-[#e9ecf1] p-3.5 text-xs text-slate-700">
      <Head mode={mode} onRefresh={onRefresh} />
      {mode === 'setup' ? <SetupView channels={channels} /> : <LiveView channels={channels} onRefresh={onRefresh} />}
    </div>
  )
}

export default EngineerDashboard
