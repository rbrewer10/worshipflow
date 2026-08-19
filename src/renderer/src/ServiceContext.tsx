import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { ServiceFull, ServiceSummary } from '../../shared/types'

interface ServiceCtx {
  services: ServiceSummary[]
  activeServiceId: number | null
  activeService: ServiceFull | null
  selectService: (id: number | null) => void
  reloadActiveService: () => void
  refreshServices: () => void
  // Which item is selected in the Build Service builder right now (null when
  // nothing's selected, or when the builder isn't the active screen). Mirrored
  // one-way from ServiceEditor's own local selection state — see useOptionalService().
  selectedItemId: number | null
  setSelectedItemId: (id: number | null) => void
  // Bumped every time reloadActiveService() runs, so components that keep their
  // own separate copy of service data (like ServiceEditor) know to re-fetch.
  itemsChangedTick: number
}

const Ctx = createContext<ServiceCtx | null>(null)

export function ServiceProvider({ children }: { children: ReactNode }): JSX.Element {
  const [services, setServices] = useState<ServiceSummary[]>([])
  const [activeServiceId, setActiveServiceId] = useState<number | null>(null)
  const [activeService, setActiveService] = useState<ServiceFull | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [itemsChangedTick, setItemsChangedTick] = useState(0)

  const refreshServices = (): void => { window.wf.servicesList().then(setServices) }
  const reloadActiveService = (): void => {
    if (activeServiceId != null) {
      // Keep the main-process live-routing cache in sync with edits (add/remove,
      // template load, reorder) — otherwise newly added items can't go live.
      window.wf.serviceRefreshActiveItems(activeServiceId)
      window.wf.serviceGet(activeServiceId).then(setActiveService)
    }
    setItemsChangedTick((t) => t + 1)
  }
  const selectService = (id: number | null): void => {
    setActiveServiceId(id)
    window.wf.setActiveService(id)
    if (id == null) setActiveService(null)
    else window.wf.serviceGet(id).then(setActiveService)
  }

  useEffect(() => {
    window.wf.servicesList().then((list) => {
      setServices(list)
      if (list.length > 0) selectService(list[0].id)
    })
  }, [])

  return (
    <Ctx.Provider value={{
      services, activeServiceId, activeService, selectService, reloadActiveService, refreshServices,
      selectedItemId, setSelectedItemId, itemsChangedTick
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useService(): ServiceCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useService must be used within ServiceProvider')
  return v
}

// Same as useService(), but returns null instead of throwing when there's no
// ServiceProvider ancestor. For components used in BOTH contexts — e.g.
// ServiceEditor, which is also rendered standalone (no provider) by the
// pop-out Build Service window (App.tsx's #/service route).
export function useOptionalService(): ServiceCtx | null {
  return useContext(Ctx)
}
