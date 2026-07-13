import { memo, useState } from 'react'
import { Play } from 'lucide-react'

interface ScripturePanelProps {
  scriptureRef: string
  bibleTranslation: 'kjv' | 'web' | 'bbe'
  onReferenceChange: (ref: string) => void
  onGoLive: () => void
  onTranslationChange: (t: 'kjv' | 'web' | 'bbe') => void
}

export const ScripturePanel = memo(function ScripturePanel({
  scriptureRef,
  bibleTranslation,
  onReferenceChange,
  onGoLive,
  onTranslationChange
}: ScripturePanelProps): JSX.Element {
  return (
    <section className="surface">
      <h2 className="section-header">Quick Scripture</h2>
      <div className="flex gap-2">
        <input type="text" value={scriptureRef} onChange={(e) => onReferenceChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onGoLive()} placeholder="John 3:16" />
        <button onClick={onGoLive} className="btn-primary"><Play size={13} /> Go</button>
      </div>
      <div className="mt-2 flex gap-1">
        {([['kjv', 'KJV'], ['web', 'WEB'], ['bbe', 'BBE']] as const).map(([t, label]) => (
          <button key={t} onClick={() => onTranslationChange(t)}
            className={`flex-1 btn text-xs ${bibleTranslation === t ? 'bg-blue-600 border-blue-500 text-white' : ''}`}>{label}</button>
        ))}
      </div>
      <div className="mt-1 text-[10px] text-slate-500">KJV offline · WEB & BBE need internet</div>
    </section>
  )
})
