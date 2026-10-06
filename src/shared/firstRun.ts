// First-run wizard rules (LaunchSetup.tsx + the db.ts upgrade migration).
//
// QA B1 (0.20.2): the 0.20 first-run wizard was gated only on a brand-new
// `has_completed_setup` flag that nothing set for databases created by 0.19,
// so every booth PC that auto-updated opened to "Set up this booth computer" —
// and every button in it, including "Skip", overwrote the church name with
// the hard-coded default and cleared the CCLI license. These pure helpers hold
// the rules so they're unit-testable without Electron or React.

/**
 * Settings whose presence means a human has already configured this install.
 * Deliberately excludes values the app generates by itself on a fresh launch
 * (tablet_pin, livecall_token, reflow_migration_done), or a fresh install that
 * was closed mid-wizard would be mistaken for an upgrade on its next launch.
 */
export const CONFIGURED_SETTING_KEYS = [
  'church_name',
  'ccli_license',
  'has_seen_onboarding',
  'logo_path',
  'logo_bg',
  'obs_host',
  'zone_scales',
  'zone_scenes',
  'zone_looks'
] as const

export interface InstallFootprint {
  songs: number
  services: number
  announcements: number
  /** Values for CONFIGURED_SETTING_KEYS (missing keys count as unset). */
  settings: Partial<Record<string, string | null>>
}

/**
 * True when the database already belongs to a church that has been using the
 * app (an upgrade from 0.19 or earlier), so the first-run wizard must not
 * appear. A truly fresh install has no songs, services, announcements or
 * configured settings — the wizard only writes on Finish/Skip, so quitting it
 * half-way through still leaves a fresh profile and the wizard shows again.
 */
export function isExistingInstall(f: InstallFootprint): boolean {
  if (f.songs > 0 || f.services > 0 || f.announcements > 0) return true
  return CONFIGURED_SETTING_KEYS.some((k) => {
    const v = f.settings[k]
    return v != null && String(v).trim() !== ''
  })
}

export interface SetupFinishInput {
  /** What's saved right now (null = never set). */
  savedChurchName: string | null
  savedCcliLicense: string | null
  /** What the operator typed (the fields are pre-filled with the saved values). */
  enteredChurchName: string
  enteredCcliLicense: string
  /** "Skip — I already know this": only mark setup done, change nothing else. */
  skip: boolean
  /** "Load sample Sunday" was chosen. */
  seedSample: boolean
  /** A service is already the active one (don't steal it for Sample Sunday). */
  hasActiveService: boolean
}

export interface SetupFinishPlan {
  /** New church name to save, or undefined to leave the setting untouched. */
  churchName?: string
  /** New CCLI license to save, or undefined to leave it untouched. Never null: the wizard never clears a license. */
  ccliLicense?: string
  seedSample: boolean
  /** Make the seeded Sample Sunday the active service. */
  activateSample: boolean
}

export const DEFAULT_CHURCH_NAME = 'Snow Hill Church'

export function planSetupFinish(i: SetupFinishInput): SetupFinishPlan {
  if (i.skip) return { seedSample: false, activateSample: false }
  const plan: SetupFinishPlan = { seedSample: i.seedSample, activateSample: i.seedSample && !i.hasActiveService }
  const church = i.enteredChurchName.trim()
  const savedChurch = (i.savedChurchName ?? '').trim()
  if (church && church !== savedChurch) plan.churchName = church
  // Brand-new install where the operator cleared the field: keep the old
  // behaviour of naming the logo screen with the default rather than nothing.
  else if (!church && !savedChurch) plan.churchName = DEFAULT_CHURCH_NAME
  const ccli = i.enteredCcliLicense.trim()
  const savedCcli = (i.savedCcliLicense ?? '').trim()
  // An empty field never clears an existing license (CCLI compliance footer).
  if (ccli && ccli !== savedCcli) plan.ccliLicense = ccli
  return plan
}
