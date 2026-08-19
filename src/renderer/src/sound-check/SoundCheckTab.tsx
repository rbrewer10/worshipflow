// Real Sound Check tab — role toggle (Volunteer/Engineer) + Setup/Live sub-toggle,
// wired to window.wf.soundCheck.* IPC. Adapts the switcher-bar UX from the throwaway
// preview (see ./preview/SoundCheckPreviewTab.tsx) but drives real channel state here
// and passes it down to the two role views.
//
// Task 7: a soft PIN gate sits in front of the Engineer toggle. It's a lightweight
// local passcode (fail-open when none is set), NOT authentication — see EngineerGate.tsx
// for the plaintext-soft-gate rationale. Gate STATE (isUnlocked, pin status) lives here
// since this component owns the role toggle; the PIN-entry screen and manage-passcode
// form live in EngineerGate.tsx to keep this file focused.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Channel } from '../../../main/types/sound-check-types'
import VolunteerCheck from './VolunteerCheck'
import EngineerDashboard from './EngineerDashboard'
import { ENGINEER_PIN_KEY, EngineerPinPrompt, ManagePasscodePanel } from './EngineerGate'

type Role = 'volunteer' | 'engineer'
export type ViewMode = 'setup' | 'live'

// Per-device "reopen to the role you last used" persistence. Not security-relevant.
const ROLE_STORAGE_KEY = 'soundCheckRole'

function readStoredRole(): Role {
  try {
    return localStorage.getItem(ROLE_STORAGE_KEY) === 'engineer' ? 'engineer' : 'volunteer'
  } catch {
    return 'volunteer'
  }
}

// Async PIN read is in-flight until this resolves. While 'loading' we must NOT flash
// the dashboard if the persisted role is engineer — we render a gate/loading state
// until the stored PIN status is known.
type PinStatus = 'loading' | 'unset' | 'set'

const ROLES: { id: Role; label: string; hint: string }[] = [
  { id: 'volunteer', label: 'Volunteer', hint: 'Guided step-by-step check' },
  { id: 'engineer', label: 'Engineer', hint: 'Full mixer dashboard' }
]

type ConnectionState =
  | { status: 'connecting' }
  | { status: 'connected'; channels: Channel[] }
  | { status: 'error'; message: string }

function SoundCheckTab(): JSX.Element {
  const [role, setRole] = useState<Role>(readStoredRole)
  const [mode, setMode] = useState<ViewMode>('setup')

  // Soft-gate state. `pinStatus` mirrors whether a non-empty PIN is stored; `storedPin`
  // holds the value for the plain-string-equality unlock check (soft gate — see
  // EngineerGate.tsx). `engineerUnlocked` is session-scoped: it resets on full remount /
  // app restart, so a restart re-prompts (correct soft-gate behavior). Toggling
  // Volunteer<->Engineer within a session never re-prompts once unlocked.
  const [pinStatus, setPinStatus] = useState<PinStatus>('loading')
  const [storedPin, setStoredPin] = useState<string>('')
  const [engineerUnlocked, setEngineerUnlocked] = useState(false)
  const [managingPin, setManagingPin] = useState(false)

  // Persist last-selected role per-device.
  useEffect(() => {
    try {
      localStorage.setItem(ROLE_STORAGE_KEY, role)
    } catch {
      // localStorage may be unavailable (e.g. private mode); role persistence is a
      // nicety, not load-bearing, so ignore.
    }
  }, [role])

  // Load PIN status once on mount. Fail-open: null/empty stored value => 'unset'
  // (Engineer not gated). A non-empty value => 'set' (gate active until unlocked).
  const loadPinStatus = useCallback((): void => {
    window.wf
      .settingGet(ENGINEER_PIN_KEY)
      .then((value) => {
        if (!mountedRef.current) return
        const pin = value ?? ''
        setStoredPin(pin)
        setPinStatus(pin.trim() === '' ? 'unset' : 'set')
      })
      .catch(() => {
        if (!mountedRef.current) return
        // If the read fails, fail open rather than locking the user out of a soft gate.
        setStoredPin('')
        setPinStatus('unset')
      })
  }, [])

  useEffect(() => {
    loadPinStatus()
  }, [loadPinStatus])

  const savePin = useCallback(async (pin: string): Promise<void> => {
    await window.wf.settingSet(ENGINEER_PIN_KEY, pin)
    setStoredPin(pin)
    setPinStatus('set')
    // Setting a PIN while already in the Engineer view (the fail-open first-run case)
    // must NOT immediately lock the owner out — keep them unlocked for the session.
    setEngineerUnlocked(true)
  }, [])

  const removePin = useCallback(async (): Promise<void> => {
    // null deletes the setting (setSetting DELETEs on null), reverting to fail-open.
    await window.wf.settingSet(ENGINEER_PIN_KEY, null)
    setStoredPin('')
    setPinStatus('unset')
  }, [])

  const [connection, setConnection] = useState<ConnectionState>({ status: 'connecting' })
  const [manualIp, setManualIp] = useState('')
  // Tracks an in-flight connect() call independent of connection.status: once status
  // flips to 'connecting' the render swaps away from ConnectionErrorState entirely, so
  // this flag's only real job is disabling the retry form for the brief window between
  // a click and that re-render (e.g. a physical double-click on the submit button).
  const [isConnecting, setIsConnecting] = useState(false)

  // Guards setState-after-unmount for the in-flight init()/getChannels() calls below.
  // Flipped to false in the cleanup effect; checked before every setConnection call
  // whose promise may resolve after this component is gone.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const connect = useCallback((ip?: string) => {
    setIsConnecting(true)
    setConnection({ status: 'connecting' })
    window.wf.soundCheck
      .init(ip || undefined)
      .then((channels) => {
        if (!mountedRef.current) return
        setIsConnecting(false)
        setConnection({ status: 'connected', channels })
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return
        setIsConnecting(false)
        const message = err instanceof Error ? err.message : String(err)
        setConnection({ status: 'error', message })
      })
  }, [])

  // Auto-discover on first mount only; retries go through the manual-IP form.
  useEffect(() => {
    connect()
  }, [])

  // Returns the in-flight promise so callers (e.g. the Engineer fader commit) can await
  // the canonical channel refresh before dropping their local draft state.
  const refreshChannels = useCallback((): Promise<void> => {
    return window.wf.soundCheck
      .getChannels()
      .then((channels) => {
        if (!mountedRef.current) return
        setConnection({ status: 'connected', channels })
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return
        const message = err instanceof Error ? err.message : String(err)
        setConnection({ status: 'error', message })
      })
  }, [])

  // Engineer view is reachable when there's no PIN (fail-open) or the session is
  // unlocked. While pinStatus is still 'loading' this is false, so we hold on a
  // loading state instead of flashing the dashboard for a persisted engineer role.
  const engineerAccessible = role === 'engineer' && (pinStatus === 'unset' || engineerUnlocked)
  // The manage-passcode control only makes sense once inside the unlocked Engineer view.
  const canManagePin = engineerAccessible

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Persistent switcher bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-panel px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-content-secondary">
          Sound check
        </span>
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-panel-raised p-0.5">
          {ROLES.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setRole(r.id)
                // Leaving the Engineer view closes any open passcode panel so it
                // doesn't linger under a role where the control is hidden.
                if (r.id !== 'engineer') setManagingPin(false)
              }}
              aria-pressed={role === r.id}
              title={r.hint}
              className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                role === r.id
                  ? 'bg-blue-500/15 font-semibold text-blue-400 ring-1 ring-inset ring-blue-500/40'
                  : 'font-medium text-content-secondary hover:bg-border-strong hover:text-content-primary'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {canManagePin && (
          <button
            type="button"
            onClick={() => setManagingPin((v) => !v)}
            aria-pressed={managingPin}
            className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              managingPin
                ? 'bg-border-strong text-content-primary'
                : 'text-content-secondary hover:bg-panel-raised hover:text-content-primary'
            }`}
          >
            {pinStatus === 'set' ? 'Passcode ✓' : 'Set passcode'}
          </button>
        )}
        <div className="ml-auto flex gap-1 rounded-lg border border-border bg-panel-raised p-0.5">
          {(['setup', 'live'] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                mode === m
                  ? 'bg-border-strong font-semibold text-content-primary'
                  : 'font-medium text-content-secondary hover:text-content-primary'
              }`}
            >
              {m === 'setup' ? 'Setup' : 'Live'}
            </button>
          ))}
        </div>
      </div>

      {/* Manage-passcode panel — only in the unlocked Engineer view */}
      {canManagePin && managingPin && (
        <div className="border-b border-border bg-app px-3 py-2">
          <ManagePasscodePanel
            hasPin={pinStatus === 'set'}
            onSave={savePin}
            onRemove={removePin}
            onClose={() => setManagingPin(false)}
          />
        </div>
      )}

      {/* Selected role's UI fills the tab. The Engineer branch is gated: a set PIN and
          an un-unlocked session render the PIN prompt (or a brief loading state while
          the PIN status resolves) instead of the dashboard. Volunteer is never gated. */}
      <div className="min-h-0 flex-1 overflow-auto">
        {role === 'engineer' && !engineerAccessible ? (
          pinStatus === 'loading' ? (
            <ConnectingState />
          ) : (
            <EngineerPinPrompt storedPin={storedPin} onUnlock={() => setEngineerUnlocked(true)} />
          )
        ) : connection.status === 'connecting' ? (
          <ConnectingState />
        ) : connection.status === 'error' ? (
          <ConnectionErrorState
            message={connection.message}
            manualIp={manualIp}
            setManualIp={setManualIp}
            onRetry={() => connect(manualIp)}
            retrying={isConnecting}
          />
        ) : role === 'volunteer' ? (
          <VolunteerCheck mode={mode} channels={connection.channels} onChannelsChanged={refreshChannels} />
        ) : (
          <EngineerDashboard mode={mode} channels={connection.channels} onRefresh={refreshChannels} />
        )}
      </div>
    </div>
  )
}

function ConnectingState(): JSX.Element {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 px-4 text-center">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-500" />
      <p className="text-sm text-content-secondary">Looking for the Yamaha TF-Rack on the network…</p>
    </div>
  )
}

function ConnectionErrorState({
  message,
  manualIp,
  setManualIp,
  onRetry,
  retrying
}: {
  message: string
  manualIp: string
  setManualIp: (v: string) => void
  onRetry: () => void
  retrying: boolean
}): JSX.Element {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="max-w-[440px] rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-5">
        <p className="mb-1 text-sm font-semibold text-red-400">Couldn&rsquo;t connect to the mixer</p>
        <p className="m-0 text-[13px] leading-relaxed text-content-secondary">
          Check that it&rsquo;s powered on and on the same network.
        </p>
        {message && (
          <details className="mt-2 text-left">
            <summary className="cursor-pointer text-[11px] font-semibold text-content-tertiary hover:text-content-secondary">
              Details
            </summary>
            <p className="m-0 mt-1 break-words text-[11px] leading-relaxed text-content-tertiary">{message}</p>
          </details>
        )}
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          onRetry()
        }}
      >
        <input
          type="text"
          placeholder="192.168.1.100"
          value={manualIp}
          onChange={(e) => setManualIp(e.target.value)}
          disabled={retrying}
          className="w-[160px] rounded-lg border border-border bg-panel-raised px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary focus:border-blue-500 focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={retrying}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {retrying ? 'Connecting…' : 'Connect'}
        </button>
      </form>
      <p className="text-xs text-content-secondary">
        Or leave the field blank and press Connect to retry auto-discovery.
      </p>
    </div>
  )
}

export default SoundCheckTab
