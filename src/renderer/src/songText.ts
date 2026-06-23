import type { SectionKind, SongFull, SongSection } from '../../shared/types'

const KNOWN: SectionKind[] = ['verse', 'chorus', 'bridge', 'tag', 'intro', 'ending']

// Parse a lyrics textarea into sections (blank-line separated; a short known-kind
// first line like "Chorus" becomes the section label).
export function parseSections(text: string): SongSection[] {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  return blocks.map((block, i) => {
    const linesArr = block.split('\n')
    const first = linesArr[0].trim()
    const word = first.toLowerCase().replace(/\s*\d+\s*$/, '')
    const matched = KNOWN.find((k) => word === k)
    if (matched && first.length <= 14) {
      return { kind: matched, label: first, ordinal: i, lyrics: linesArr.slice(1).join('\n').trim() }
    }
    return { kind: 'verse', label: null, ordinal: i, lyrics: block }
  })
}

// Render a song's sections back into editable text.
export function sectionsToText(song: SongFull): string {
  return [...song.sections]
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((sec) => (sec.label ? `${sec.label}\n${sec.lyrics}` : sec.lyrics))
    .join('\n\n')
}
