// Soft PIN gate for the Engineer role. This is deliberately NOT authentication —
// it's a lightweight local passcode so an untrained Sunday volunteer doesn't
// accidentally land in the mixer dashboard. The PIN is stored in plaintext via
// window.wf.settingSet (key `sound_check_engineer_pin`), exactly like every other
// setting in this app (ccli_license, logo_path, etc.). Storing it plaintext and
// comparing with plain string equality is intentional for a soft gate — do NOT
// "harden" this with hashing/crypto; that would be cargo-culted security that this
// feature explicitly does not need. See Task 7 spec.

import { useState } from 'react'

export const ENGINEER_PIN_KEY = 'sound_check_engineer_pin'

// PIN-entry screen shown when a PIN is set and the Engineer role is still locked.
export function EngineerPinPrompt({
  storedPin,
  onUnlock
}: {
  storedPin: string
  onUnlock: () => void
}): JSX.Element {
  const [entry, setEntry] = useState('')
  const [error, setError] = useState<string | null>(null)

  const attempt = (): void => {
    // Empty / whitespace-only entry is "no attempt" — never unlock, no error noise.
    if (entry.trim() === '') return
    if (entry === storedPin) {
      onUnlock()
      return
    }
    setError('Incorrect passcode')
    setEntry('')
  }

  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="w-full max-w-[360px] rounded-2xl border border-border bg-panel px-6 py-6">
        <p className="mb-1 text-[13px] font-semibold text-content-primary">Engineer view is locked</p>
        <p className="m-0 mb-4 text-[12px] leading-relaxed text-content-secondary">
          Enter the passcode to open the mixer dashboard.
        </p>
        <form
          className="flex flex-col items-stretch gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            attempt()
          }}
        >
          <input
            type="password"
            inputMode="numeric"
            // This gate only renders because the operator just navigated to
            // the mixer dashboard — autofocusing the passcode field is the
            // deliberate continuation of that action, not an unexpected focus
            // steal.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            placeholder="Passcode"
            value={entry}
            onChange={(e) => {
              setEntry(e.target.value)
              if (error) setError(null)
            }}
            className="w-full rounded-lg border border-border bg-panel-raised px-3 py-2 text-center text-sm tracking-widest text-content-primary placeholder:tracking-normal placeholder:text-content-tertiary focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Unlock
          </button>
        </form>
        {error && <p className="mt-2 text-[12px] font-medium text-red-600">{error}</p>}
      </div>
    </div>
  )
}

// Manage-passcode panel, reachable only from the unlocked Engineer view. Handles
// set (no PIN yet), change (PIN exists — being unlocked is enough authority to
// change it), and remove (reverts to fail-open).
export function ManagePasscodePanel({
  hasPin,
  onSave,
  onRemove,
  onClose
}: {
  hasPin: boolean
  onSave: (pin: string) => Promise<void>
  onRemove: () => Promise<void>
  onClose: () => void
}): JSX.Element {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async (): Promise<void> => {
    // Reject empty / whitespace-only PINs — a blank PIN would silently mean
    // "no PIN" (fail-open), which is confusing when the user meant to set one.
    if (value.trim() === '') {
      setError('Enter a passcode first')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave(value)
      setValue('')
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await onRemove()
      setValue('')
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full max-w-[360px] rounded-xl border border-border bg-panel p-3">
      <div className="mb-2 flex items-center">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-widest text-content-secondary">
          {hasPin ? 'Change passcode' : 'Set passcode'}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded px-1.5 text-[13px] leading-none text-content-secondary hover:text-content-primary"
          aria-label="Close passcode settings"
        >
          ×
        </button>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <input
          type="password"
          inputMode="numeric"
          placeholder={hasPin ? 'New passcode' : 'Choose a passcode'}
          value={value}
          disabled={busy}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError(null)
          }}
          className="min-w-0 flex-1 rounded-lg border border-border bg-panel-raised px-3 py-1.5 text-[13px] tracking-widest text-content-primary placeholder:tracking-normal placeholder:text-content-tertiary focus:border-blue-500 focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          Save
        </button>
      </form>
      {hasPin && (
        <button
          type="button"
          onClick={() => void remove()}
          disabled={busy}
          className="mt-2 text-[12px] font-medium text-red-400 hover:text-red-300 disabled:opacity-60"
        >
          Remove passcode (unlocks Engineer for everyone)
        </button>
      )}
      {error && <p className="mt-2 text-[12px] font-medium text-red-600">{error}</p>}
    </div>
  )
}
