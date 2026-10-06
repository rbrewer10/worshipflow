// Pure decisions for crash recovery, kept out of index.ts so they're unit-tested.
import { existsSync, readFileSync, renameSync, statSync } from 'fs'

export interface RecoveredLayers {
  /** Put the screens on this after reloading the item, or leave the item showing (null). */
  screen: 'black' | 'logo' | null
  textHidden: boolean
  bgHidden: boolean
}

/**
 * QA A3-N2: a crash while the operator had pressed Black, Logo or C used to
 * relaunch with the lyrics back on the projectors — restoreTrack only looked at
 * the item and slide. Bring back what the room was actually seeing.
 *
 * `loadedMode` is the mode the item lands in when reloaded: a sermon card
 * deliberately loads at 'logo', so a 'logo' snapshot of a sermon is the sermon
 * itself, not the operator's Logo.
 */
export function recoveredLayers(
  snap: { mode?: string; textHidden?: boolean; bgHidden?: boolean } | null | undefined,
  loadedMode: string
): RecoveredLayers {
  const mode = snap?.mode
  const screen = mode === 'black' ? 'black' : mode === 'logo' && loadedMode !== 'logo' ? 'logo' : null
  return { screen, textHidden: snap?.textHidden === true, bgHidden: snap?.bgHidden === true }
}

/**
 * QA A3-N3: a zero-byte or half-written recovery.json made electron-store
 * throw on every read AND write (conf's clearInvalidConfig defaults to false),
 * so crash recovery stayed off for good with no log line. Move a bad file
 * aside (kept for support) so a fresh one is created. Returns the new name of
 * the bad file, or null when there was nothing wrong / nothing there.
 */
export function quarantineCorruptJson(filePath: string, now = Date.now()): string | null {
  try {
    if (!existsSync(filePath) || !statSync(filePath).isFile()) return null
    const text = readFileSync(filePath, 'utf8')
    try {
      const parsed: unknown = JSON.parse(text)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return null
    } catch { /* fall through: corrupt */ }
    const aside = `${filePath}.corrupt-${now}`
    renameSync(filePath, aside)
    return aside
  } catch {
    return null
  }
}
