// Every background/logo/icon path the app stores is the raw absolute path a
// file dialog (or upload) returned at the moment it was picked — e.g.
// `C:\Users\ryan\AppData\Roaming\worshipflow\backgrounds\uploads\xyz.png`.
// That's fine as long as the database only ever runs on the machine (and
// under the Windows user account) it was created on, but this app has real
// reasons to move: sharing a song library + backgrounds with another church
// on a fresh install, or just a new PC. Copy the database and the
// `backgrounds`/`imported-media` folders over, and every stored path still
// literally says the OLD username — the file exists, right there, just not
// at that exact path — so the background silently fails to load with no
// error anywhere.
//
// This relocates a stored path onto the CURRENT machine's userData folder
// when the original no longer resolves, by finding a known WorshipFlow data
// subfolder (`backgrounds`, `imported-media`) inside the stored path and
// rebuilding everything from there under the current userData root. Pure and
// side-effect-free (the `exists` check is injected) so it's unit-testable
// without a real filesystem or Electron.

const KNOWN_DATA_SUBFOLDERS = ['backgrounds', 'imported-media']

// `icon:<key>` (a built-in announcement icon) and motion-theme markers like
// `theme:<id>` aren't real paths at all — never attempt to relocate them.
function looksLikeRealPath(value: string): boolean {
  return !value.startsWith('theme:') && !value.startsWith('icon:')
}

export function relocateStoredPath(
  storedPath: string | null | undefined,
  currentUserDataDir: string,
  exists: (path: string) => boolean
): string | null {
  if (!storedPath) return storedPath ?? null
  if (!looksLikeRealPath(storedPath)) return storedPath
  // Already resolves right where it is — the common case on the same
  // machine — so there's nothing to relocate.
  if (exists(storedPath)) return storedPath

  // Stored paths are normally Windows paths (`\`), but accept `/` too so a
  // library copied from (or tested on) a POSIX machine relocates the same way.
  // The rebuilt path uses the CURRENT root's own separator.
  const sep = currentUserDataDir.includes('\\') ? '\\' : '/'
  for (const marker of KNOWN_DATA_SUBFOLDERS) {
    const match = new RegExp(`[\\\\/]${marker}[\\\\/]`).exec(storedPath)
    if (!match) continue
    // Keep the marker folder itself (`backgrounds\uploads\xyz.png`, not just
    // `uploads\xyz.png`) so it rejoins the current userData root correctly.
    const relative = storedPath.slice(match.index + 1).split(/[\\/]/).join(sep)
    const candidate = `${currentUserDataDir}${sep}${relative}`
    if (exists(candidate)) return candidate
  }
  // Couldn't find it anywhere sensible — leave the original path alone
  // rather than guess. It'll still show as "missing", which is honest;
  // silently pointing it at the wrong file would be worse.
  return storedPath
}
