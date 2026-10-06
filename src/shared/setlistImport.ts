export type SetlistKind = 'song' | 'scripture' | 'sermon' | 'placeholder' | 'element'

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

// QA B16: a bare word prefix made "Word of God Speak" and "Message of the
// Cross" (songs) into sermon cards. A sermon line now needs a separator
// ("Sermon: The Cross", "Message - Hope") or to be the bare word on its own.
const SERMON_PREFIX = /^(sermon|message|homily|word)\s*[:.\-–—]\s*/i
const SERMON_ALONE = /^(sermon|message|homily|the word|teaching)$/i

function isSermon(line: string): boolean {
  return SERMON_PREFIX.test(line) || SERMON_ALONE.test(line)
}

// Common non-song service elements. These become section headers (labels in
// the run sheet) instead of "Song: Communion" placeholders that block the
// readiness check (QA B16).
const ELEMENT_WORDS = [
  'welcome', 'announcements?', 'greeting', 'meet (?:and|&) greet', 'communion', "the lord'?s supper", "lord'?s supper",
  'offering', 'offertory', 'tithes?(?: (?:and|&) offerings?)?', 'giving',
  '(?:opening |closing |pastoral |congregational |offertory )?prayer(?: (?:of|for) [a-z ]+)?', 'prayer time',
  'benediction', 'dismissal', 'baptism', 'teaching moment', "children'?s (?:moment|time|sermon)", 'kids (?:moment|dismissal)',
  'altar call', 'invitation', 'response', 'reflection', 'video', 'meditation', 'moment of silence', 'passing of the peace', 'the peace',
]
const ELEMENT = new RegExp(`^(?:${ELEMENT_WORDS.join('|')})$`, 'i')

function isServiceElement(line: string): boolean {
  const parts = line.split(/\s*(?:\/|&| and |\+|,)\s*/i).map((p) => p.trim()).filter(Boolean)
  return parts.length > 0 && parts.every((p) => ELEMENT.test(p))
}

export function parseSetlist(raw: string): SetlistEntry[] {
  const out: SetlistEntry[] = []
  for (const rawLine of raw.split(/\r?\n/)) {
    let line = rawLine.trim()
    if (!line) continue
    if (/^[-*=#]/.test(line)) line = line.replace(/^[-*=#]+\s*/, '')
    line = line.replace(/^\d+[.)]\s+/, '').replace(/^[-•]\s+/, '').trim()
    if (!line || /setlist|^(order|service|songs?|worship)$|^order of (worship|service)$/i.test(line)) continue

    if (isSermon(line)) {
      const title = line.replace(SERMON_PREFIX, '').trim() || line
      out.push({ kind: 'sermon', title })
      continue
    }
    if (isServiceElement(line)) {
      out.push({ kind: 'element', title: line })
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
