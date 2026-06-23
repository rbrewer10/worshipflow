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
}

const Ctx = createContext<ServiceCtx | null>(null)

export function ServiceProvider({ children }: { children: ReactNode }): JSX.Element {
  const [services, setServices] = useState<ServiceSummary[]>([])
  const [activeServiceId, setActiveServiceId] = useState<number | null>(null)
  const [activeService, setActiveService] = useState<ServiceFull | null>(null)

  const refreshServices = (): void => { window.wf.servicesList().then(setServices) }
  const reloadActiveService = (): void => {
    if (activeServiceId != null) window.wf.serviceGet(activeServiceId).then(setActiveService)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Ctx.Provider value={{ services, activeServiceId, activeService, selectService, reloadActiveService, refreshServices }}>
      {children}
    </Ctx.Provider>
  )
}

export function useService(): ServiceCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useService must be used within ServiceProvider')
  return v
}
