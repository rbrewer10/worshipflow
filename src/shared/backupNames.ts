// Backup file names shown in Setup → Backups (QA A-M3 remainder).
//
// Two kinds live in userData/backups:
//   worshipflow-20261006T121906.db       — the automatic per-launch snapshot
//   worshipflow-pre-restore-<ms>.db       — the copy taken just before a restore
// The pre-restore copy is what undoes a wrong restore, but 0.20.2 only listed
// (and only allowed restoring) the launch snapshots, so it was unreachable.

export type BackupKind = 'launch' | 'pre-restore'

export interface BackupName {
  kind: BackupKind
  timestamp: number
}

const LAUNCH = /^worshipflow-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.db$/
const PRE_RESTORE = /^worshipflow-pre-restore-(\d{10,15})\.db$/

export function parseBackupFilename(filename: string): BackupName | null {
  const m = filename.match(LAUNCH)
  if (m) {
    const [, y, mo, d, h, mi, s] = m
    const t = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`).getTime()
    return Number.isNaN(t) ? null : { kind: 'launch', timestamp: t }
  }
  const p = filename.match(PRE_RESTORE)
  if (p) {
    const t = Number(p[1])
    return Number.isFinite(t) && t > 0 ? { kind: 'pre-restore', timestamp: t } : null
  }
  return null
}

export const isRestorableBackupName = (filename: string): boolean => parseBackupFilename(filename) != null

/** The confirm text for a restore — says the projectors go dark, louder if something is live. */
export function restoreConfirmText(when: string, kind: BackupKind, liveNow: boolean): string {
  const what = kind === 'pre-restore'
    ? `Undo the last restore — put the database back to how it was just before it (${when})?`
    : `Restore the database to how it was on ${when}?`
  return [
    liveNow ? '⚠ SOMETHING IS LIVE ON THE SCREENS RIGHT NOW.\n' : '',
    what,
    '',
    'Everything added or changed since then will be gone. WorshipFlow restarts automatically, and ' +
      'every projector and screen goes dark until it is back (usually 10–20 seconds). Your current ' +
      'database is backed up first, just in case.'
  ].filter((l, i) => i !== 0 || l).join('\n')
}

/** Modes where a restart would visibly blank service content. */
export const isShowingContent = (mode: string | undefined): boolean => mode === 'lyrics' || mode === 'countdown' || mode === 'announcement' || mode === 'livecall'
