// Chord-over-lyric sheets (QA B7): a line made only of chord names sits above
// the lyric it belongs to. Projected, it reads "G          C        G" — and the
// first one also became the song title. Detect and drop those lines.

const CHORD = /^[A-G](?:#|b|♯|♭)?(?:maj|min|dim|aug|sus|add|m|M|°|ø|\+)?\d{0,2}(?:(?:sus|add|maj|b|#|no)\d{1,2})*(?:\/[A-G](?:#|b|♯|♭)?)?$/
const FILLER = /^(?:\||\/|-|–|—|\.|x\d+|\(x?\d+x?\)|N\.?C\.?|\(|\))$/i

/** True when every token on the line is a chord name (or bar/repeat filler). */
export function isChordLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  const tokens = trimmed.split(/\s+/)
  const chords = tokens.filter((t) => CHORD.test(t.replace(/^\(|\)$/g, '')))
  if (chords.length === 0) return false
  if (!tokens.every((t) => CHORD.test(t.replace(/^\(|\)$/g, '')) || FILLER.test(t))) return false
  // A lone bare letter ("A", "C") could be a real word on its own line; only
  // call it a chord line when it's clearly a chord chart: several chords, wide
  // spacing, or a chord with a quality/extension/bass note.
  if (chords.length >= 2) return true
  if (/\S\s{2,}\S/.test(trimmed) || /^\s{2,}/.test(line)) return true
  return chords.some((c) => c.length > 1)
}

/** Remove chord-only lines (keeping blank-line slide breaks intact). */
export function stripChordOnlyLines(text: string): string {
  return text.split('\n').filter((l) => !isChordLine(l)).join('\n')
}
