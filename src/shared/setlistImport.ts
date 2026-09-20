export type SetlistKind = 'song' | 'scripture' | 'sermon' | 'placeholder'

export interface SetlistEntry {
  kind: SetlistKind
  title: string
}

// "John 3:16", "Psalm 23", "1 Corinthians 13:4-7", "Romans 8"
const SCRIPTURE = /^(?:(?:[1-3]|I{1,3})\s+)?[A-Za-z][A-Za-z]+\s+\d+(?::\d+(?:\s*[–-]\s*\d+)?)?(?:\s*[;,&].*)?$/

function isScripture(line: string): boolean {
  const t = line.replace(/^(scripture|reading|bible)\s*[:.-]\s*/i, '').trim()
  return SCRIPTURE.test(t)
}

function isSermon(line: string): boolean {
  return /^(sermon|message|homily|teaching|word)\b/i.test(line)
}

export function parseSetlist(raw: string): SetlistEntry[] {
  const out: SetlistEntry[] = []
  for (const rawLine of raw.split(/\r?\n/)) {
    let line = rawLine.trim()
    if (!line) continue
    if (/^[-*=#]/.test(line)) line = line.replace(/^[-*=#]+\s*/, '')
    line = line.replace(/^\d+[.)]\s+/, '').replace(/^[-•]\s+/, '').trim()
    if (!line || /setlist|^(order|service|songs?|worship)$/i.test(line)) continue

    if (isSermon(line)) {
      const title = line.replace(/^(sermon|message|homily|teaching|word)\s*[:.-]\s*/i, '').trim() || line
      out.push({ kind: 'sermon', title })
      continue
    }
    if (isScripture(line) || /^(scripture|reading|bible)\s*[:.-]/i.test(line)) {
      const title = line.replace(/^(scripture|reading|bible)\s*[:.-]\s*/i, '').trim()
      out.push({ kind: 'scripture', title })
      continue
    }
    out.push({ kind: 'song', title: line })
  }
  return out
}

export function matchSongTitle(title: string, library: { id: number; title: string }[]): number | null {
  const want = title.trim().toLowerCase()
  const exact = library.find((s) => s.title.trim().toLowerCase() === want)
  if (exact) return exact.id
  const stripped = library.find((s) => s.title.trim().toLowerCase().replace(/[^\w\s]/g, '') === want.replace(/[^\w\s]/g, ''))
  return stripped ? stripped.id : null
}
