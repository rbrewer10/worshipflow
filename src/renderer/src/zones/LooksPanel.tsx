// src/renderer/src/zones/LooksPanel.tsx
// Saved zone-pin presets ("Looks") — lives here on the Live tab since it's
// meant for in-the-moment use, unlike pinning itself, which stays a Setup-only
// action (see ZoneLiveGrid.tsx / ZonePanel.tsx). Safety Reset relocated to
// LiveTools.tsx — more prominent, always visible, not tucked in this panel.
import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
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

  return (
    <div className="space-y-2 p-2">
      {looks.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-content-secondary">Looks</div>
          {looks.map((look) => (
            <div key={look.id} className="group flex items-center gap-1">
              <button
                onClick={() => applyLook(look.id)}
                className="min-w-0 flex-1 truncate rounded-lg border border-border bg-panel-raised px-2 py-1.5 text-left text-xs font-medium text-content-primary hover:border-blue-400 hover:bg-blue-500/10"
              >
                {look.name}
              </button>
              <button
                onClick={() => deleteLook(look.id)}
                title={`Delete "${look.name}"`}
                aria-label={`Delete "${look.name}"`}
                className="hidden shrink-0 rounded p-1 text-content-tertiary hover:bg-panel-raised hover:text-content-primary group-hover:block"
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
