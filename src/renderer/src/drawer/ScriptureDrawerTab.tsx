import { useState } from 'react'
import { ScripturePanel } from '../ScripturePanel'
import { useService } from '../ServiceContext'
import { addAndGoLive } from './addAndGoLive'

export default function ScriptureDrawerTab({ onDone }: { onDone: () => void }): JSX.Element {
  const { activeServiceId, reloadActiveService } = useService()
  const [scriptureRef, setScriptureRef] = useState('')
  const [bibleTranslation, setBibleTranslation] = useState<'kjv' | 'web' | 'bbe'>('kjv')
  const [busy, setBusy] = useState(false)

  const goLive = async (): Promise<void> => {
    if (busy) return
    const ref = scriptureRef.trim()
    if (!ref) return
    setBusy(true)
    try {
      const ok = await addAndGoLive(
        activeServiceId,
        { type: 'scripture', payload: { reference: ref } },
        reloadActiveService
      )
      if (ok) {
        setScriptureRef('')
        onDone()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScripturePanel
      scriptureRef={scriptureRef}
      bibleTranslation={bibleTranslation}
      onReferenceChange={setScriptureRef}
      onGoLive={() => void goLive()}
      onTranslationChange={(t) => { setBibleTranslation(t); window.wf.featuresSetBibleTranslation(t) }}
    />
  )
}
