// src/renderer/src/zones/LooksPanel.tsx
// Saved zone-pin presets ("Looks") + the safety-reset button — both live here
// on the Live tab since they're meant for in-the-moment use, unlike pinning
// itself, which stays a Setup-only action (see ZoneLiveGrid.tsx / ZonePanel.tsx).
import { useCallback, useEffect, useState } from 'react'
import { ShieldAlert, X } from 'lucide-react'
import type { Look } from '../../../shared/zoneLooks'

function LooksPanel(): JSX.Element {
  const [looks, setLooks] = useState<Look[]>([])

  const refresh = useCallback((): void => { void window.wf.looksList().then(setLooks) }, [])

  useEffect(() => { refresh() }, [refresh])

  const applyLook = (lookId: string): void => {
    void window.wf.looksApply(lookId)
  }

  const deleteLook = (lookId: string): void => {
    void window.wf.looksDelete(lookId).then(refresh)
  }

  const safetyReset = (): void => {
    void window.wf.zoneSafetyReset()
  }

  return (
    <div className="space-y-2 p-2">
      <button
        onClick={safetyReset}
        title="Force all 4 zones to the logo — screens only, doesn't touch audio"
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-2 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"
      >
        <ShieldAlert size={13} /> Safety Reset
      </button>

      {looks.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Looks</div>
          {looks.map((look) => (
            <div key={look.id} className="group flex items-center gap-1">
              <button
                onClick={() => applyLook(look.id)}
                className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50"
              >
                {look.name}
              </button>
              <button
                onClick={() => deleteLook(look.id)}
                title={`Delete "${look.name}"`}
                aria-label={`Delete "${look.name}"`}
                className="hidden shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 group-hover:block"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default LooksPanel
