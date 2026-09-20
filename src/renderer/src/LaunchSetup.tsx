import { useState } from 'react'
import { Church, Monitor, Music2, Play } from 'lucide-react'
import { notifyLocal } from './NotifyToasts'

function LaunchSetup({ onDone }: { onDone: () => void }): JSX.Element {
  const [step, setStep] = useState(0)
  const [church, setChurch] = useState('Snow Hill Church')
  const [ccli, setCcli] = useState('')
  const [busy, setBusy] = useState(false)

  const finish = async (seed: boolean): Promise<void> => {
    setBusy(true)
    try {
      await window.wf.settingSet('church_name', church.trim() || 'Snow Hill Church')
      await window.wf.ccliSetLicense(ccli.trim() || null)
      if (seed) {
        const res = await window.wf.seedSampleSunday()
        await window.wf.setActiveService(res.serviceId)
        notifyLocal(res.created ? 'Sample Sunday is in Build service' : 'Sample Sunday was already in the library', 'info')
      }
      await window.wf.settingSet('has_completed_setup', '1')
      await window.wf.settingSet('has_seen_onboarding', '1')
      onDone()
    } catch (err) {
      notifyLocal(err instanceof Error ? err.message : 'Setup failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-[#0b0f17] p-6 text-content-primary">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-panel p-6 shadow-2xl">
        {step === 0 && (
          <>
            <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-blue-400">WorshipFlow Pro</div>
            <h1 className="mb-2 text-2xl font-semibold">Set up this booth computer</h1>
            <p className="mb-5 text-sm text-content-secondary">
              Four TVs, a stage monitor, and a volunteer who has never opened this app. We’ll name the church, load a practice Sunday, and show you SongSelect.
            </p>
            <button onClick={() => setStep(1)} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500">
              Start
            </button>
            <button onClick={() => void finish(false)} className="mt-2 w-full rounded-lg px-4 py-2 text-xs text-content-tertiary hover:text-content-secondary">
              Skip — I already know this
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Church size={16} /> Church</div>
            <label className="mb-1 block text-[11px] text-content-tertiary">Name on the logo screen</label>
            <input
              value={church}
              onChange={(e) => setChurch(e.target.value)}
              className="mb-3 w-full rounded-lg border border-border bg-panel-raised px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <label className="mb-1 block text-[11px] text-content-tertiary">CCLI license # (footer on song slides)</label>
            <input
              value={ccli}
              onChange={(e) => setCcli(e.target.value)}
              placeholder="e.g. 1234567"
              className="mb-5 w-full rounded-lg border border-border bg-panel-raised px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <button onClick={() => setStep(2)} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500">
              Continue
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Music2 size={16} /> Sample Sunday</div>
            <p className="mb-4 text-sm text-content-secondary">
              Three public-domain hymns, a countdown, John 3:16, and a sermon card. Use it to learn Go Live, Space, C/G/X layers, and Volunteer mode. You can delete it later.
            </p>
            <button disabled={busy} onClick={() => void finish(true)} className="mb-2 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40">
              {busy ? 'Loading…' : 'Load sample Sunday'}
            </button>
            <button disabled={busy} onClick={() => void finish(false)} className="w-full rounded-lg border border-border px-4 py-2 text-sm text-content-secondary hover:bg-panel-raised">
              Skip sample
            </button>
          </>
        )}

        {step === 0 ? null : (
          <div className="mt-4 flex items-center justify-center gap-4 text-[11px] text-content-tertiary">
            <span className="inline-flex items-center gap-1"><Monitor size={12} /> Screens live in Setup → Screens & zones</span>
            <span className="inline-flex items-center gap-1"><Play size={12} /> SongSelect is in Song library</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default LaunchSetup
