import { useEffect, useState } from 'react'

// The church name shown on logo/idle screens. Stored as a setting (editable in
// Logo & Background settings) instead of being hardcoded, so the app isn't tied
// to one church. Defaults to the current church until changed.
const DEFAULT_CHURCH_NAME = 'Snow Hill Church'

export function useChurchName(): string {
  const [name, setName] = useState<string>(DEFAULT_CHURCH_NAME)
  useEffect(() => {
    window.wf.settingGet('church_name').then((v) => {
      if (v != null && v.trim()) setName(v.trim())
    })
  }, [])
  return name
}
