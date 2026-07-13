// Sound Check tab — role-based UI. Volunteer role runs the guided checklist
// (Variant C); Engineer role gets the Mission Control dashboard (Variant D).
// Pure presentational for now, hardcoded demo data, no IPC.

import { useState } from 'react'
import VariantC from './VariantC'
import VariantD from './VariantD'
import type { ViewMode } from './demoData'

type Role = 'volunteer' | 'engineer'

const ROLES: { id: Role; label: string; hint: string }[] = [
  { id: 'volunteer', label: 'Volunteer', hint: 'Guided step-by-step check' },
  { id: 'engineer', label: 'Engineer', hint: 'Full mixer dashboard' }
]

// Shared subtle animations for the meters/waveforms; disabled when the user
// prefers reduced motion.
const SHARED_CSS = `
@keyframes scp-pulse-y {0%,100%{transform:scaleY(1);}50%{transform:scaleY(.86);}}
@keyframes scp-pulse-x {0%,100%{transform:scaleX(1);}50%{transform:scaleX(.94);}}
.scp-pulse-y{animation:scp-pulse-y 1.6s ease-in-out infinite;transform-origin:bottom;}
.scp-pulse-x{animation:scp-pulse-x 1.9s ease-in-out infinite;transform-origin:left;}
@media (prefers-reduced-motion: reduce){.scp-pulse-y,.scp-pulse-x{animation:none;}}
`

function SoundCheckPreviewTab(): JSX.Element {
  const [role, setRole] = useState<Role>('volunteer')
  const [mode, setMode] = useState<ViewMode>('live')

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#0e0e11]">
      <style>{SHARED_CSS}</style>

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
                  ? 'bg-blue-500/20 font-semibold text-blue-300 shadow-[inset_0_0_0_1px_rgba(16,185,129,.4)]'
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
        {role === 'volunteer' ? <VariantC mode={mode} /> : <VariantD mode={mode} />}
      </div>
    </div>
  )
}

export default SoundCheckPreviewTab
