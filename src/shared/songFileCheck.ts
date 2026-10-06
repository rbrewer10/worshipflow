import type { ImportedSong } from './lyricImport'

/**
 * Why an imported lyrics file can't become a song (QA M4), or null if it can.
 *  - 'empty':     nothing parseable at all
 *  - 'no-lyrics': parsed, but every section is blank (e.g. a title-only .usr,
 *                 which used to create an empty "Untitled" song, and two such
 *                 files collapsed into the same one)
 */
export function songFileProblem(song: ImportedSong | null): 'empty' | 'no-lyrics' | null {
  if (!song) return 'empty'
  const hasLyrics = song.sections.some((s) => lyricText(s.lyrics ?? '') !== '')
  return hasLyrics ? null : 'no-lyrics'
}

// A .usr with no section bodies falls back to the raw file as one "verse", so
// ignore .usr structure lines ([File], [S A1], [V1], Title=…, CCLI=…) when
// deciding whether there are any actual lyrics.
const USR_STRUCTURE = /^\s*(\[[^\]]*\]|(?:Type|Title|Author|Artist|Copyright|Admin|CCLI|Version|Keys|Themes|Fields|Lang|Key)\s*=.*)\s*$/i

function lyricText(lyrics: string): string {
  return lyrics.split(/\r?\n/).filter((l) => !USR_STRUCTURE.test(l)).join('\n').trim()
}
