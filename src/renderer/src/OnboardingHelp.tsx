import { X } from 'lucide-react'

interface OnboardingHelpProps {
  onClose: () => void
  onGoToVolunteer: () => void
}

// First-run overlay + on-demand help (via TopBar's "?" button). Explains the
// three modes an unfamiliar operator will actually touch, and the one thing
// that trips people up most: Volunteer Mode only works once someone else has
// already built the service — see the 2026-08-16 audit finding this exists
// to close (no onboarding/help surface existed anywhere in the app before).
function OnboardingHelp({ onClose, onGoToVolunteer }: OnboardingHelpProps): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Quick start</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 text-sm text-slate-700">
          <p>
            Every screen shows one of three things: <strong>Lyrics</strong> (whatever slide is live —
            a song, sermon point, or announcement), <strong>Logo</strong> (the church logo, for
            between-service quiet), or <strong>Black</strong> (nothing at all).
          </p>
          <p>
            A service has to already be built — songs, sermon, announcements added in order — before
            anyone can run it live. If you&rsquo;re filling in and unsure what to do, use{' '}
            <strong>Volunteer Mode</strong>: it only shows Prev/Next and the Black/Logo/Lyrics buttons,
            and it needs someone else to have built the service first.
          </p>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100">
            Close
          </button>
          <button
            onClick={onGoToVolunteer}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Take me to Volunteer Mode
          </button>
        </div>
      </div>
    </div>
  )
}

export default OnboardingHelp
