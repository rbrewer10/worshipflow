import { memo, useEffect, useState } from 'react'
import { Pencil, Check, X, Plus } from 'lucide-react'

interface StagePanelProps {
  inputValue: string
  liveMessage: string | null
  msgSent: boolean
  onInputChange: (msg: string) => void
  onSendMessage: (preset?: string) => void
  onClearMessage: () => void
}

const STAGE_PRESETS = [
  '5 minutes left', '2 minutes left', 'Time to wrap up', 'Slow down',
  'Speak up', 'Repeat chorus', 'Move to closing song', 'Pray now'
]

export const StageMessagePanel = memo(function StageMessagePanel({
  inputValue,
  liveMessage,
  msgSent,
  onInputChange,
  onSendMessage,
  onClearMessage
}: StagePanelProps): JSX.Element {
  const [presets, setPresets] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('wf-stage-presets')
      if (saved) return JSON.parse(saved) as string[]
    } catch { /* ignore bad data */ }
    return STAGE_PRESETS
  })
  const [editingPresets, setEditingPresets] = useState(false)
  const [newPreset, setNewPreset] = useState('')

  const addPreset = (): void => {
    const p = newPreset.trim()
    if (!p) return
    setPresets((cur) => [...cur, p])
    setNewPreset('')
  }

  const deletePreset = (i: number): void => setPresets((cur) => cur.filter((_, idx) => idx !== i))
  const editPreset = (i: number, val: string): void => setPresets((cur) => cur.map((p, idx) => (idx === i ? val : p)))

  // Persist presets to localStorage when they change (not during render).
  useEffect(() => {
    localStorage.setItem('wf-stage-presets', JSON.stringify(presets))
  }, [presets])

  return (
    <section className="surface">
      <h2 className="section-header">
        Stage Message
        {liveMessage && <span className="ml-2 inline-block badge badge-warning">LIVE</span>}
        {msgSent && <span className="ml-2 inline-flex items-center gap-1 badge animate-[fade-in_0.2s_ease-out]"><Check size={11} /> Sent</span>}
      </h2>
      <div className="flex gap-2">
        <input type="text" value={inputValue} onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSendMessage()} placeholder="Message to worship leader / pastor..." />
        <button onClick={() => onSendMessage()} className="btn-warning">Send</button>
        <button onClick={onClearMessage} className="btn">Clear</button>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="section-header inline-block">Quick Messages</span>
        <button onClick={() => setEditingPresets((v) => !v)} className={`btn-pill ${editingPresets ? 'bg-emerald-600 text-white' : ''}`}>
          {editingPresets ? <><Check size={11} /> Done Editing</> : <><Pencil size={11} /> Edit</>}
        </button>
      </div>

      {!editingPresets ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {presets.length === 0 && <span className="text-xs text-slate-400">No quick messages — tap Edit to add some.</span>}
          {presets.map((p, i) => (
            <button key={i} onClick={() => onInputChange(p)} className="btn-pill text-xs hover:bg-amber-500/30">{p}</button>
          ))}
        </div>
      ) : (
        <div className="mt-2 space-y-2 p-2 rounded-lg bg-white border border-slate-200">
          {presets.map((p, i) => (
            <div key={i} className="flex gap-2">
              <input type="text" value={p} onChange={(e) => editPreset(i, e.target.value)} className="flex-1" />
              <button onClick={() => deletePreset(i)} className="btn-danger" title="Delete"><X size={13} /></button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <input type="text" value={newPreset} onChange={(e) => setNewPreset(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPreset()} placeholder="New quick message…" />
            <button onClick={addPreset} className="btn-primary"><Plus size={13} /> Add</button>
          </div>
        </div>
      )}
    </section>
  )
})
