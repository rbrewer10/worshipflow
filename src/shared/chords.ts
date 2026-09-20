// ChordPro-style [G] markers in lyric lines. Audience screens strip them;
// the stage monitor shows a chord line above the words.

const CHORD_TOKEN = /\[[^\]]+\]/g

export function hasChords(text: string): boolean {
  return /\[[^\]]+\]/.test(text)
}

export function stripChords(text: string): string {
  return text.replace(CHORD_TOKEN, '').replace(/[ \t]{2,}/g, ' ').replace(/ *\n */g, '\n').trim()
}

// " [G]Amazing [C]grace " → chord line "G       C" over "Amazing grace"
export function formatChordLyric(text: string): { chordLine: string; lyricLine: string } {
  const lyricLine = stripChords(text)
  if (!hasChords(text)) return { chordLine: '', lyricLine }

  let chords = ''
  let lyrics = ''
  let i = 0
  while (i < text.length) {
    if (text[i] === '[') {
      const end = text.indexOf(']', i)
      if (end < 0) {
        lyrics += text[i]
        i++
        continue
      }
      const chord = text.slice(i + 1, end)
      while (chords.length < lyrics.length) chords += ' '
      chords += chord
      i = end + 1
      continue
    }
    lyrics += text[i]
    i++
  }
  return { chordLine: chords.trimEnd(), lyricLine: lyrics.replace(/[ \t]{2,}/g, ' ').trim() }
}

export function formatSlideChords(text: string): { chordLine: string | null; lyricLine: string } {
  if (!hasChords(text)) return { chordLine: null, lyricLine: text }
  const parts = text.split('\n').map(formatChordLyric)
  return {
    chordLine: parts.map((p) => p.chordLine).join('\n'),
    lyricLine: parts.map((p) => p.lyricLine).join('\n'),
  }
}
