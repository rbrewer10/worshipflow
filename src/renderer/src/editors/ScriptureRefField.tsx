import { useEffect, useState } from 'react'
import { Check, AlertTriangle } from 'lucide-react'
import type { ScriptureRefCheck } from '../../../shared/types'
import { parseReferenceList } from '../../../shared/scriptureRefs'

// The scripture reference field, with the passage list confirmed back as it is
// typed.
//
// Before this, the field was a bare text input holding exactly one reference.
// A typo ("Jhon 3:16") resolved to nothing, computeItemSourceSlides returned an
// empty array, and the item silently produced no slides — a failure the
// operator discovered as a blank screen mid-service. Now every passage reports
// whether it resolved and how many verses it found, while there is still time
// to fix it.
//
// Validation is debounced rather than per-keystroke because it crosses IPC, and
// a half-typed reference is expected to be invalid — showing an error on every
// character would train the operator to ignore it.
export default function ScriptureRefField({ reference, onReferenceChange }: {
  reference: string
  onReferenceChange: (ref: string) => void
}): JSX.Element {
  const [checks, setChecks] = useState<ScriptureRefCheck[]>([])

  useEffect(() => {
    const refs = parseReferenceList(reference)
    if (refs.length === 0) { setChecks([]); return }
    let cancelled = false
    const t = setTimeout(() => {
      window.wf.scriptureValidate(reference)
        .then((result) => { if (!cancelled) setChecks(result) })
        .catch(() => { if (!cancelled) setChecks([]) })
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [reference])

  const found = checks.filter((c) => c.ok)
  const missing = checks.filter((c) => !c.ok)
  const totalVerses = found.reduce((n, c) => n + c.verseCount, 0)

  return (
    <div>
      <label htmlFor="scripture-ref" className="section-header mb-2 block">Scripture reference</label>
      <textarea
        id="scripture-ref"
        value={reference}
        rows={2}
        placeholder="John 3:16-18; Romans 8:1"
        onChange={(e) => onReferenceChange(e.target.value)}
        aria-label="Scripture reference — separate several passages with a semicolon or a new line"
        className="w-full resize-y rounded-lg border border-border bg-panel px-2 py-1.5 text-sm text-content-primary"
      />
      <p className="mt-1 text-[11px] text-content-secondary">
        Separate passages with <span className="font-mono">;</span> or a new line to read several in a row.
      </p>

      {checks.length > 0 && (
        <div className="mt-2 space-y-1" role="status" aria-live="polite">
          {found.length > 0 && (
            <p className="flex items-center gap-1.5 text-[11px] text-content-secondary">
              <Check size={12} className="shrink-0 text-blue-400" />
              {found.length} passage{found.length === 1 ? '' : 's'} · {totalVerses} verse{totalVerses === 1 ? '' : 's'}
            </p>
          )}
          {missing.map((c) => (
            <p key={c.reference} className="flex items-center gap-1.5 text-[11px] text-amber-400">
              <AlertTriangle size={12} className="shrink-0" />
              Couldn&apos;t find &ldquo;{c.reference}&rdquo;
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
