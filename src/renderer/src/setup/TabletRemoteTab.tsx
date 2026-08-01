import { useEffect, useState } from 'react'
import { Tablet } from 'lucide-react'

function TabletRemoteTab(): JSX.Element {
  const [tabletUrl, setTabletUrl] = useState('')
  const [tabletPin, setTabletPin] = useState('')

  useEffect(() => {
    window.wf.getTabletUrl().then(setTabletUrl)
    window.wf.getTabletPin().then(setTabletPin)
  }, [])

  const regenerate = (): void => {
    if (!window.confirm('Generate a new PIN? Any tablet already unlocked will need the new one.')) return
    window.wf.regenerateTabletPin().then(setTabletPin)
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Tablet size={18} className="text-slate-500" /> Tablet remote
        </h1>
        <p className="mb-5 text-sm text-slate-500">
          Open this address on an iPad or phone to use it as a wireless stage monitor.
          Volunteers need the PIN before they can send anything live.
        </p>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Address</div>
          <div className="break-all rounded-lg bg-slate-100 px-3 py-2 text-center font-mono text-sm text-blue-700">
            {tabletUrl || 'Starting server…'}
          </div>

          <div className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Unlock PIN</div>
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-slate-900 px-3 py-1.5 font-mono text-lg tracking-[0.3em] text-emerald-400">
              {tabletPin || '······'}
            </span>
            <button onClick={regenerate} className="btn text-xs">New PIN</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TabletRemoteTab
