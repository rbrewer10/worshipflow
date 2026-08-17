import { X } from 'lucide-react'
import Modal from './Modal'

interface OnboardingHelpProps {
  onClose: () => void
  onGoToVolunteer: () => void
}

// First-run overlay + on-demand help (via TopBar's "?" button). Explains the
// three modes an unfamiliar operator will actually touch, and the one thing
// that trips people up most: Volunteer Mode only works once someone else has
// already built the service — see the 2026-08-16 audit finding this exists
// to close (no onboarding/help surface existed anywhere in the app before).
// Built on Modal (not a hand-rolled overlay) so it gets the same
// Escape-to-close/focus-trap/aria-dialog behavior every other dialog in the
// app already has — this being the one dialog aimed at an unfamiliar
// operator is exactly the wrong place to skip that.
function OnboardingHelp({ onClose, onGoToVolunteer }: OnboardingHelpProps): JSX.Element {
  return (
    <Modal onClose={onClose} label="Quick start" className="w-full max-w-md rounded-2xl bg-panel p-5 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-content-primary">Quick start</h2>
        <button onClick={onClose} className="rounded p-1 text-content-tertiary hover:bg-panel-raised hover:text-content-secondary">
          <X size={16} />
        </button>
      </div>

      <div className="space-y-3 text-sm text-content-secondary">
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
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium text-content-secondary hover:bg-panel-raised">
          Close
        </button>
        <button
          onClick={onGoToVolunteer}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Take me to Volunteer Mode
        </button>
      </div>
    </Modal>
  )
}

export default OnboardingHelp
