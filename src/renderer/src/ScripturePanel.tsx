import { memo, useState } from 'react'
import { Play, Plus } from 'lucide-react'

interface ScripturePanelProps {
  scriptureRef: string
  bibleTranslation: 'kjv' | 'web' | 'bbe'
  onReferenceChange: (ref: string) => void
  onGoLive: () => void
  buildMode?: boolean
  onTranslationChange: (t: 'kjv' | 'web' | 'bbe') => void
}

export const ScripturePanel = memo(function ScripturePanel({
  scriptureRef,
  bibleTranslation,
  onReferenceChange,
  onGoLive,
  onTranslationChange,
  buildMode = false
}: ScripturePanelProps): JSX.Element {
  return (
    <section className="surface">
      <h2 className="section-header">Quick Scripture</h2>
      <div className="flex gap-2">
        <input type="text" value={scriptureRef} onChange={(e) => onReferenceChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onGoLive()} placeholder="John 3:16" />
        <button onClick={onGoLive} className="btn-primary">{buildMode ? <Plus size={13} /> : <Play size={13} />} {buildMode ? 'Add' : 'Go'}</button>
      </div>
      <div className="mt-2 flex gap-1">
        {([['kjv', 'KJV'], ['web', 'WEB'], ['bbe', 'BBE']] as const).map(([t, label]) => (
          <button key={t} onClick={() => onTranslationChange(t)}
            className={`flex-1 btn text-xs ${bibleTranslation === t ? 'bg-blue-600 border-blue-500 text-white' : ''}`}>{label}</button>
        ))}
      </div>
      <div className="mt-1 text-[10px] text-content-secondary">KJV offline · WEB & BBE need internet</div>
    </section>
  )
})
