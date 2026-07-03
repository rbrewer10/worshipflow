// Real Sound Check tab — role toggle (Volunteer/Engineer) + Setup/Live sub-toggle,
// wired to window.wf.soundCheck.* IPC. Adapts the switcher-bar UX from the throwaway
// preview (see ./preview/SoundCheckPreviewTab.tsx) but drives real channel state here
// and passes it down to the two role views.
//
// No PIN gate yet — Task 7 adds a lock in front of the Engineer toggle. Keeping the
// toggle a single flat button bar (rather than e.g. nesting Engineer behind a modal)
// so Task 7 can slot a gate in without restructuring this component.

import { useCallback, useEffect, useState } from 'react'
import type { Channel } from '../../../main/types/sound-check-types'
import VolunteerCheck from './VolunteerCheck'
import EngineerDashboard from './EngineerDashboard'

type Role = 'volunteer' | 'engineer'
export type ViewMode = 'setup' | 'live'

const ROLES: { id: Role; label: string; hint: string }[] = [
  { id: 'volunteer', label: 'Volunteer', hint: 'Guided step-by-step check' },
  { id: 'engineer', label: 'Engineer', hint: 'Full mixer dashboard' }
]

type ConnectionState =
  | { status: 'connecting' }
  | { status: 'connected'; channels: Channel[] }
  | { status: 'error'; message: string }

function SoundCheckTab(): JSX.Element {
  const [role, setRole] = useState<Role>('volunteer')
  const [mode, setMode] = useState<ViewMode>('setup')
  const [connection, setConnection] = useState<ConnectionState>({ status: 'connecting' })
  const [manualIp, setManualIp] = useState('')

  const connect = useCallback((ip?: string) => {
    setConnection({ status: 'connecting' })
    window.wf.soundCheck
      .init(ip || undefined)
      .then((channels) => setConnection({ status: 'connected', channels }))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        setConnection({ status: 'error', message })
      })
  }, [])

  // Auto-discover on first mount only; retries go through the manual-IP form.
  useEffect(() => {
    connect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshChannels = useCallback(() => {
    window.wf.soundCheck
      .getChannels()
      .then((channels) => setConnection({ status: 'connected', channels }))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        setConnection({ status: 'error', message })
      })
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#0e0e11]">
      {/* Persistent switcher bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/[0.07] bg-[#141418] px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Sound check
        </span>
        <div className="flex flex-wrap gap-1 rounded-lg border border-white/[0.07] bg-white/[0.04] p-0.5">
          {ROLES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRole(r.id)}
              aria-pressed={role === r.id}
              title={r.hint}
              className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                role === r.id
                  ? 'bg-emerald-500/20 font-semibold text-emerald-300 shadow-[inset_0_0_0_1px_rgba(16,185,129,.4)]'
                  : 'font-medium text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1 rounded-lg border border-white/[0.07] bg-white/[0.04] p-0.5">
          {(['setup', 'live'] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                mode === m
                  ? 'bg-white/[0.09] font-semibold text-white'
                  : 'font-medium text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
              }`}
            >
              {m === 'setup' ? 'Setup' : 'Live'}
            </button>
          ))}
        </div>
      </div>

      {/* Selected role's UI fills the tab */}
      <div className="min-h-0 flex-1 overflow-auto">
        {connection.status === 'connecting' ? (
          <ConnectingState />
        ) : connection.status === 'error' ? (
          <ConnectionErrorState
            message={connection.message}
            manualIp={manualIp}
            setManualIp={setManualIp}
            onRetry={() => connect(manualIp)}
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
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-sky-400/30 border-t-sky-400" />
      <p className="text-sm text-[#93a3b8]">Looking for the Yamaha TF-Rack on the network…</p>
    </div>
  )
}

function ConnectionErrorState({
  message,
  manualIp,
  setManualIp,
  onRetry
}: {
  message: string
  manualIp: string
  setManualIp: (v: string) => void
  onRetry: () => void
}): JSX.Element {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="max-w-[440px] rounded-2xl border border-red-400/30 bg-red-400/[0.06] px-6 py-5">
        <p className="mb-1 text-sm font-semibold text-red-300">Couldn&rsquo;t connect to the mixer</p>
        <p className="m-0 text-[13px] leading-relaxed text-[#c3d0e0]">{message}</p>
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
          inputMode="numeric"
          placeholder="192.168.1.100"
          value={manualIp}
          onChange={(e) => setManualIp(e.target.value)}
          className="w-[160px] rounded-lg border border-[#2c3849] bg-[#1a2230] px-3 py-2 text-sm text-[#dbe3ee] placeholder:text-[#5d6d82] focus:border-sky-400 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-[#03131c] hover:bg-sky-400"
        >
          Connect
        </button>
      </form>
      <p className="text-xs text-[#5d6d82]">
        Or leave the field blank and press Connect to retry auto-discovery.
      </p>
    </div>
  )
}

export default SoundCheckTab
