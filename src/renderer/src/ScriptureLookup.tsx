import { useState } from 'react'
import { ListPlus, Play } from 'lucide-react'
import type { ScriptureResult } from '../../shared/types'
import { useService } from './ServiceContext'
import { notifyLocal } from './NotifyToasts'

const QUICK = ['John 3:16', 'Psalm 23', 'Romans 8:28', 'Philippians 4:6-7', 'Proverbs 3:5-6']

function ScriptureLookup(): JSX.Element {
  const { activeServiceId, reloadActiveService } = useService()
  const [ref, setRef] = useState('')
  const [result, setResult] = useState<ScriptureResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState(false)

  // Use the reference the lookup settled on, not the raw typed text — "john
  // 3 16" resolves fine but is not what should be stored on the item.
  const canonical = (): string => (result?.ok ? (result.reference ?? ref) : ref).trim()

  const addToService = async (): Promise<void> => {
    if (activeServiceId == null) return
    setBusy(true)
    try {
      await window.wf.serviceAddItem(activeServiceId, {
        type: 'scripture',
        ref_id: null,
        payload: { reference: canonical() }
      })
      reloadActiveService()
      setAdded(true)
      setTimeout(() => setAdded(false), 2500)
    } catch (err) {
      notifyLocal(`Couldn't add to the service: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const sendLive = async (): Promise<void> => {
    setBusy(true)
    try {
      const ok = await window.wf.liveLoadScripture('main', canonical())
      if (!ok) { notifyLocal('That passage could not be sent live.', 'warn'); return }
      window.wf.liveSetItemId('main', null)
    } finally {
      setBusy(false)
    }
  }

  const lookup = async (q = ref): Promise<void> => {
    if (!q.trim()) return
    setLoading(true)
    setRef(q)
    try {
      const r = await window.wf.scriptureLookup(q)
      setResult(r)
    } catch (err) {
      setResult({ ok: false, error: `Lookup failed: ${err instanceof Error ? err.message : String(err)}` })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-4 text-slate-900">
      <h1 className="sr-only">Scripture Lookup</h1>
      <div className="mb-3 flex gap-2">
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && lookup()}
          placeholder='Type a reference — e.g. "John 3:16", "Psalm 23", "Romans 8:28-30"'
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:border-blue-500"
        />
        <button
          onClick={() => lookup()}
          disabled={!ref.trim() || loading}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Looking…' : 'Look up'}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button
            key={q}
            onClick={() => lookup(q)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-[#f4f6f9] p-5">
        {!result && (
          <p className="py-10 text-center text-sm text-slate-500">
            Look up any passage in the King James Version.
          </p>
        )}
        {result && !result.ok && (
          <p className="py-10 text-center text-sm text-amber-700">{result.error}</p>
        )}
        {result && result.ok && (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{result.reference}</h2>
              {/* This screen could look a passage up but not put it anywhere,
                  so finding a verse and using it were two unconnected jobs.
                  Adding appends to the loaded service; sending skips the
                  service entirely for something the pastor just called out. */}
              <div className="flex shrink-0 gap-2">
                <button onClick={addToService} disabled={activeServiceId == null || busy} className="btn text-xs disabled:opacity-40"
                  title={activeServiceId == null ? 'Open a service in Build service first' : 'Add this passage to the end of the loaded service'}>
                  <ListPlus size={13} /> {added ? 'Added' : 'Add to service'}
                </button>
                <button onClick={sendLive} disabled={busy} className="btn-primary text-xs"
                  title="Put this passage on the screens now, without adding it to the service">
                  <Play size={13} /> Send live
                </button>
              </div>
            </div>
            <div className="space-y-2 leading-relaxed">
              {result.verses!.map((v) => (
                <p key={v.n} className="text-slate-900">
                  <sup className="mr-1 font-mono text-xs text-blue-700">{v.n}</sup>
                  {v.text}
                </p>
              ))}
            </div>
            <p className="mt-5 text-xs text-slate-500">
              {result.verses!.length} verse{result.verses!.length === 1 ? '' : 's'} · King James Version
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default ScriptureLookup
