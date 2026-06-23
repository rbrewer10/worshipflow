import { useState } from 'react'
import type { ScriptureResult } from '../../shared/types'

const QUICK = ['John 3:16', 'Psalm 23', 'Romans 8:28', 'Philippians 4:6-7', 'Proverbs 3:5-6']

function ScriptureLookup(): JSX.Element {
  const [ref, setRef] = useState('')
  const [result, setResult] = useState<ScriptureResult | null>(null)
  const [loading, setLoading] = useState(false)

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
    <div className="flex h-full min-h-0 flex-col p-4">
      <div className="mb-3 flex gap-2">
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && lookup()}
          placeholder='Type a reference — e.g. "John 3:16", "Psalm 23", "Romans 8:28-30"'
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-4 py-2.5 text-sm outline-none focus:border-blue-500"
        />
        <button
          onClick={() => lookup()}
          disabled={!ref.trim() || loading}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold hover:bg-blue-500 disabled:opacity-40"
        >
          {loading ? 'Looking…' : 'Look up'}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button
            key={q}
            onClick={() => lookup(q)}
            className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-slate-300 hover:bg-white/[0.1]"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-white/[0.07] bg-[#1a1a1d] p-5">
        {!result && (
          <p className="py-10 text-center text-sm text-slate-500">
            Look up any passage in the King James Version.
          </p>
        )}
        {result && !result.ok && (
          <p className="py-10 text-center text-sm text-amber-400">{result.error}</p>
        )}
        {result && result.ok && (
          <>
            <h2 className="mb-4 text-lg font-semibold text-white">{result.reference}</h2>
            <div className="space-y-2 leading-relaxed">
              {result.verses!.map((v) => (
                <p key={v.n} className="text-slate-200">
                  <sup className="mr-1 font-mono text-xs text-blue-400">{v.n}</sup>
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
