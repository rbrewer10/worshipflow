// QA B12-N2: a .wfbundle/.wfservice double-clicked in Explorer is imported by
// main; this says how it went and opens the new service — unless the operator
// is running a service (Live / volunteer), where only the toast appears and
// nothing on screen changes.
import { useEffect, useRef } from 'react'
import { useService } from './ServiceContext'
import { reportServiceImport } from './serviceFileActions'

export default function ServiceFileOpener({ openView }: { openView: (() => void) | null }): null {
  const { refreshServices, selectService } = useService()
  const latest = useRef({ openView, refreshServices, selectService })
  latest.current = { openView, refreshServices, selectService }
  useEffect(() => window.wf.onServiceFileOpened((res) => {
    reportServiceImport(res, (id) => {
      const { openView: go, refreshServices: refresh, selectService: select } = latest.current
      refresh()
      if (go) { select(id); go() }
    })
  }), [])
  return null
}
