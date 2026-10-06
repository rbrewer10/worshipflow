import { describe, expect, it } from 'vitest'
import { isRestorableBackupName, parseBackupFilename, restoreConfirmText } from './backupNames'

describe('backup names (QA A-M3)', () => {
  it('parses launch snapshots as UTC timestamps', () => {
    expect(parseBackupFilename('worshipflow-20261006T121906.db')).toEqual({ kind: 'launch', timestamp: Date.UTC(2026, 9, 6, 12, 19, 6) })
  })
  it('lists the pre-restore copy so a wrong restore can be undone', () => {
    expect(parseBackupFilename('worshipflow-pre-restore-1791300000000.db')).toEqual({ kind: 'pre-restore', timestamp: 1791300000000 })
    expect(isRestorableBackupName('worshipflow-pre-restore-1791300000000.db')).toBe(true)
  })
  it('rejects anything else (path tricks, stray files)', () => {
    for (const f of ['../worshipflow.db', 'worshipflow-pre-restore-abc.db', 'worshipflow.db.bak', 'worshipflow-20261306T999999.db', 'x.db']) {
      expect(isRestorableBackupName(f)).toBe(false)
    }
  })
  it('the confirm says the projectors go dark, and shouts when something is live', () => {
    const calm = restoreConfirmText('10/6 8:00 AM', 'launch', false)
    expect(calm).toMatch(/projector and screen goes dark/)
    expect(calm).not.toMatch(/LIVE/)
    expect(restoreConfirmText('10/6 8:00 AM', 'launch', true)).toMatch(/^⚠ SOMETHING IS LIVE/)
    expect(restoreConfirmText('10/6 8:00 AM', 'pre-restore', false)).toMatch(/^Undo the last restore/)
  })
})
