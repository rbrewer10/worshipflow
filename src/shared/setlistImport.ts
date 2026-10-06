export type SetlistKind = 'song' | 'scripture' | 'sermon' | 'placeholder' | 'element'

export interface SetlistEntry {
  kind: SetlistKind
  title: string
}

// "John 3:16", "Psalm 23", "1 Corinthians 13:4-7", "Romans 8"
const SCRIPTURE = /^(?:(?:[1-3]|I{1,3})\s+)?[A-Za-z][A-Za-z]+\.?\s+\d+(?::\d+(?:\s*[–-]\s*\d+)?)?(?:\s*[;,&].*)?$/

// "John 3:16 (KJV)" / "John 3:16 NIV" — the translation is not part of the
// reference the lookup reads (QA B3-N6).
const TRANSLATION = /\s*[([]?\s*(?:KJV|NKJV|NIV|ESV|NASB|NLT|CSB|HCSB|RSV|NRSV|NRSVUE|CEB|MSG|AMP|CEV|GNT|NET|WEB|ASV|NIrV)\s*[)\]]?$/

// "Scripture Reading: …", "Old Testament Lesson – …" (B3-N6: lesson wording).
const LESSON = '(?:(?:scripture|old testament|new testament|gospel|epistle|first|second) )?lessons?'
// B4-N3: "Responsive Psalm: Psalm 46", "Reading from the Psalter: Psalm 121".
const PSALTER_LABEL = '(?:responsive|responsorial|the|unison) psalm|psalm reading|(?:reading from )?the psalter|psalter(?: reading)?'
const READING_LABEL = `scripture readings?|scripture|readings?|bible|(?:old|new) testament reading|gospel reading|epistle reading|${LESSON}|${PSALTER_LABEL}`
const READING_LABEL_PREFIX = new RegExp(`^(?:${READING_LABEL})\\s*[:.\\-–—~]\\s*`, 'i')

function stripTranslation(ref: string): string {
  return ref.replace(TRANSLATION, '').trim()
}

function isScripture(line: string): boolean {
  const t = stripTranslation(line.replace(READING_LABEL_PREFIX, '').trim())
  return SCRIPTURE.test(t)
}

// A chapter:verse reference anywhere in the line ("Responsive Psalm 95:1-7").
// QA B3-N6: at minimum, a line holding one must never become a song
// placeholder (a placeholder blocks readiness).
const EMBEDDED_REFERENCE = /((?:(?:[1-3]|I{1,3})\s+)?[A-Z][A-Za-z]+\.?(?:\s+of\s+[A-Z][a-z]+)?\s+\d+:\d+(?:\s*[–-]\s*\d+(?::\d+)?)?)/

// QA B16: a bare word prefix made "Word of God Speak" and "Message of the
// Cross" (songs) into sermon cards. A sermon line now needs a separator
// ("Sermon: The Cross", "Message - Hope") or to be the bare word on its own.
const SERMON_PREFIX = /^(sermon series|sermon|message|homily|word|(?:today'?s|pastor'?s|the) (?:message|sermon))\s*[:.\-–—]\s*/i
const SERMON_ALONE = /^(sermon|message|homily|the word|teaching|(?:today'?s|pastor'?s|the|morning) (?:message|sermon)|message from (?:the )?pastor|(?:the )?word (?:proclaimed|preached)|(?:the )?(?:proclamation|preaching) of (?:the|god'?s) word)$/i

function isSermon(line: string): boolean {
  return SERMON_PREFIX.test(line) || SERMON_ALONE.test(line)
}

// Common non-song service elements. These become section headers (labels in
// the run sheet) instead of "Song: Communion" placeholders that block the
// readiness check (QA B16). Matched against a line already normalised by
// cleanLine (straight quotes, "&amp;" decoded, no trailing ":").
const ELEMENT_WORDS = [
  'welcome', 'announcements?', 'greeting', 'meet (?:and|&) greet', 'communion', "the lord'?s supper", "lord'?s supper",
  'offerings?', 'offertory', 'tithes?(?: (?:and|&) offerings?)?', 'giving', 'call to worship', 'scripture readings?',
  '(?:opening |closing |pastoral |congregational |offertory |silent )?prayer(?: (?:of|for) [a-z ]+)?', 'prayer time',
  'benediction', 'dismissal', 'baptism', 'teaching moment', "children'?s (?:moment|time|sermon|message|church)", 'kids (?:moment|dismissal)',
  'altar call', 'invitation', 'response', 'reflection', 'video', 'meditation', 'moment of silence', 'passing (?:of )?the peace', 'the peace',
  // QA B2-N6: the rest of a typical printed bulletin.
  'prelude', 'postlude', "(?:the )?lord'?s prayer", 'prayer requests?', 'prayers of the people', 'joys? (?:and|&) concerns',
  'special music', '(?:choir |choral )?anthem', 'affirmation of faith', "(?:the )?apostles'? creed", '(?:the )?nicene creed',
  'responsive reading', '(?:old|new) testament reading', 'gospel reading', 'epistle reading', 'readings?', 'invocation',
  'confession(?: of sin)?', 'assurance of pardon', 'words of institution', 'sending', 'charge(?: (?:and|&) benediction)?',
  // QA B3-N6: more wordings from real bulletins.
  LESSON, 'holy communion', '(?:gathering|unison|morning|intercessory|offering|dedication) prayer', 'prayer of (?:dedication|illumination|confession|thanksgiving)',
  'moment for missions?', 'missions? moment', 'sharing of (?:our )?joys(?: (?:and|&) concerns)?', 'praise (?:and|&) worship', 'musical offering',
  "children'?s (?:church|sermon|moment|time) (?:dismissal|dismissed)", "children'?s dismissal", 'greeting (?:and|&) announcements',
  // QA B4-N3: Methodist / Lutheran / Presbyterian bulletin wording.
  '(?:the )?lighting of the (?:advent (?:wreath|candles?)|candles?|christ candle|chalice|unity candle)', 'acolyte lighting', '(?:the )?lighting of the candles?',
  '(?:greeting|exchange|passing|sharing|sign) of (?:the )?peace', 'silent meditation', '(?:the )?sacrament of (?:holy communion|the lord\'?s supper|baptism)',
  '(?:the )?celebration of (?:holy )?communion', 'recognition of (?:visitors|guests|visitors (?:and|&) guests)', 'birthdays?', 'anniversaries',
  'sending forth', '(?:the )?invitation to (?:christian )?(?:discipleship|membership)',
]
const ELEMENT = new RegExp(`^(?:${ELEMENT_WORDS.join('|')})$`, 'i')

// QA B-N3: the whole line is tried first — splitting on "&" / " and " made
// "Tithes & Offerings" two parts, so the tithes-and-offerings pattern could
// never match and the line became a "Song:" placeholder.
function isServiceElement(line: string): boolean {
  if (ELEMENT.test(line.trim())) return true
  const parts = line.split(/\s*(?:\/|&| and |\+|,)\s*/i).map((p) => p.trim()).filter(Boolean)
  return parts.length > 0 && parts.every((p) => ELEMENT.test(p))
}

// "(Responsive)", "(Unison)", "(please stand)" after an element name — a
// stage direction, not a song's artist: "Offering (Paul Baloche)" stays a song.
const QUALIFIER = /^(?:responsive(?:ly)?|read responsively|unison|in unison|congregational|congregation|all|standing|all standing|please stand|optional|spoken|sung|together|seated|kneeling|choir|led by .+|pastor .+|rev\.? .+|debts|trespasses|sins|see (?:insert|back|bulletin|page \d+|screen|over)|insert|on screen|in (?:the )?bulletin|p(?:age|g)?\.? ?\d+|(?:no\.?|#) ?\d+[a-z]?|(?:umh|tfws|elw|lbw|bcp|glh|bh|w&p) ?#? ?\d+[a-z]?)$/i

// Element words that are also well-known song titles ("Offering", "Response"…).
const SONG_TITLE_TOO = /^(?:the )?(?:offerings?|response|invitation|reflection|meditation|giving|communion|benediction|the peace|baptism|video|welcome|prelude|anthem)$/i
// Who leads it: "- Pastor Jim", "— Worship Team", "— Choir".
const ROLE = /^(?:(?:the )?(?:pastor|rev(?:erend)?\.?|elder|deacon|deaconess|bishop|father|fr\.|minister|choir|praise team|worship team|youth|children|kids|congregation|liturgist|lay leader|leader|ushers?|all)\b.*|dr\.? .+|mr\.? .+|mrs\.? .+|ms\.? .+)$/i

// "Scripture Reading – John 3:16", "Old Testament Reading: Isaiah 40",
// "Scripture Reading (Romans 8)". (B2-N6: – and — were not accepted.)
const READING_PREFIX = new RegExp(`^(${READING_LABEL})\\s*(?:[:.\\-–—~]\\s*(.*)|\\(\\s*(.+?)\\s*\\))$`, 'i')

// "Opening Hymn: Holy, Holy, Holy" / "Hymn of Invitation – Just As I Am" →
// the song is the part after the label, so it can match the library.
const HYMN_LABEL_WORDS = '(?:(?:opening|closing|gathering|sending|offertory|communion|response|responsive|final)\\s+)?(?:hymn|song)(?:\\s+of\\s+(?:invitation|response|praise|preparation|sending|the day))?'
// B3-N6: "Opening Hymn #89 – Joyful, Joyful" — a hymnal number may sit between the label and the title.
const HYMN_LABEL = new RegExp(`^${HYMN_LABEL_WORDS}(?:\\s*(?:no\\.?|#)\\s*\\d+[a-z]?)?\\s*(?:[:\\-–—]\\s*|\\s+[-–—]\\s+)(.+)$`, 'i')
// "Hymn of Praise<TAB>No. 89<TAB>Joyful, Joyful…" — the bare label, title in the leader columns.
const HYMN_LABEL_ALONE = new RegExp(`^${HYMN_LABEL_WORDS}(?:\\s*(?:no\\.?|#)\\s*\\d+[a-z]?)?$`, 'i')
const HYMNAL_NUMBER_COLUMN = /^(?:(?:no\.?|#|umh|hymn)\s*)?\d+[a-z]?$/i
// "Hymn 301" / "Hymn #301" / "UMH 301" is a hymnal number, not a Bible book.
const HYMN_NUMBER = /^(?:hymn|song|umh|no\.?)\s*#?\s*\d+[a-z]?$/i

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?'
const DATE_LINE = new RegExp(
  `^(?:(?:sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*\\.?,?\\s+)?(?:${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?|\\d{1,2}/\\d{1,2}/\\d{2,4}|\\d{4}-\\d{2}-\\d{2})$`,
  'i'
)

/** Bulletin noise that isn't an item: headings, the church/date lines. */
// "Worship Service – 10:30 AM", "Sunday Morning Worship", "Traditional Service 9:00" (B3-N6).
const SERVICE_TITLE = /^(?:(?:sunday|morning|evening|traditional|contemporary|blended|early|late|main)\s+)*(?:worship service|worship|service)(?:\s*[-–—:,@|]?\s*(?:\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?|sunday|morning|evening))*$/i

// "Snow Hill Congregational Methodist Church", "First Baptist Church of Smyrna",
// "Grace UMC": the church's name at the top of the bulletin (B4-N3).
const DENOMINATION = '(?:methodist|baptist|presbyterian|lutheran|episcopal|congregational|catholic|community|bible|evangelical|reformed|pentecostal|nazarene|wesleyan|moravian|mennonite|brethren|apostolic|christian|united|free will|missionary|umc|pca|elca)'
const CHURCH_NAME = new RegExp(`^(?:[A-Z][\\w.'&-]*\\s+)*?(?:${DENOMINATION}\\s+)(?:[A-Z][\\w.'&-]*\\s+)*?(?:church|chapel|parish|fellowship|congregation)(?:\\s+of\\s+.+)?$|^.+\\s(?:umc|u\\.m\\.c\\.)$`, 'i')

function isHeadingLine(line: string): boolean {
  if (CHURCH_NAME.test(line)) return true
  if (/setlist|^(order|service|songs?|worship)$|order of (worship|service)/i.test(line) || DATE_LINE.test(line)) return true
  // Needs a qualifier or a time, so a bare "Worship" song set label stays as before.
  return SERVICE_TITLE.test(line) && /\d|sunday|morning|evening|traditional|contemporary|blended|early|late|main|service/i.test(line)
}

/**
 * QA B2-N6: normalise a pasted bulletin line before classifying it —
 * "&amp;" and curly quotes from web/Word pastes, non-breaking spaces,
 * bullets / "1." / "a." numbering, and leading service times ("10:30 Welcome").
 */
export function cleanLine(raw: string): string {
  let line = raw
    .replace(/&amp;/gi, '&').replace(/&nbsp;/gi, ' ').replace(/&#0*39;|&apos;|&rsquo;|&lsquo;/gi, "'").replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/[\u2018\u2019\u02BC\u2032]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .trim()
  for (let i = 0; i < 2; i++) {
    if (/^[-*=#•·▪►+†‡–—]/.test(line)) line = line.replace(/^[-*=#•·▪►+†‡–—]+\s*/, '')
    line = line
      .replace(/^(?:\d+|[a-z]|[ivx]+)[.)]\s+/i, '')
      .replace(/^\((?:\d+|[a-z]|[ivx]+)\)\s+/i, '') // "(1) Call to Worship" (B3-N6)
      .replace(/^\d{1,2}:\d{2}\s*(?:[ap]\.?m\.?)?\s+(?=\D)/i, '')
      .trim()
  }
  // Bulletin markup at the end: "Call to Worship*" (* = please stand),
  // "Welcome!", "Call to Worship;" (B3-N6).
  line = line.replace(/\s*[*;!†‡]+$/, '').trim()
  return line
}

/** "Call to Worship ......... Pastor Jim" / "Call to Worship<TAB>Pastor Jim" → [head, trailer]. */
function splitLeader(line: string): [string, string] {
  const m = /^(.*?)(?:\t+|\s*(?:\.\s*){3,}|\s*…+\s*|\s{3,})(.*)$/.exec(line)
  if (!m || !m[1].trim()) return [line, '']
  return [m[1].trim(), m[2].trim()]
}

const RUBRIC = /^(?:[*†‡]+|\(\s*[*†‡]\s*\))\s*(?:please\b|indicates?\b|denotes?\b|means\b|(?:all |those |the congregation )?(?:who are able,? )?(?:may |will |please )?(?:stand|standing|rise|be seated)\b|congregation(?:al)? (?:stands?|standing|response|participation)\b|as (?:you are|we are) able\b|if able\b)/i

const stripColon = (s: string): string => s.replace(/\s*:\s*$/, '').trim()

function classify(line: string): SetlistEntry {
  if (HYMN_NUMBER.test(line)) return { kind: 'song', title: line }
  // "Lord's Prayer (debts)", "Announcements (see insert)": a note, not part of the name.
  const note = /^(.*?)\s*\(([^)]*)\)$/.exec(line)
  const hymnalNumber = note ? /^(?:no\.?|#) ?\d+[a-z]?$/i.test(note[2].trim()) : false
  if (note && note[1] && isServiceElement(note[1]) && QUALIFIER.test(note[2].trim()) && !(hymnalNumber && SONG_TITLE_TOO.test(note[1].trim()))) {
    return { kind: 'element', title: line }
  }
  const hymn = HYMN_LABEL.exec(line)
  if (hymn && hymn[1].trim()) return { kind: 'song', title: hymn[1].trim() }
  if (isSermon(line)) return { kind: 'sermon', title: line.replace(SERMON_PREFIX, '').trim() || line }
  const reading = READING_PREFIX.exec(line)
  if (reading) {
    const ref = stripTranslation((reading[2] ?? reading[3] ?? '').trim())
    // "Scripture Reading:" with nothing after it is a header, not an empty scripture card.
    return ref ? { kind: 'scripture', title: ref } : { kind: 'element', title: reading[1] }
  }
  if (isServiceElement(line)) return { kind: 'element', title: line }
  // "Call to Worship (Responsive)"
  const paren = /^(.*?)\s*\(([^)]*)\)$/.exec(line)
  if (paren && paren[1] && isServiceElement(paren[1]) && (QUALIFIER.test(paren[2].trim()) || isServiceElement(paren[2]))) {
    return { kind: 'element', title: line }
  }
  // "Call to Worship - Pastor Jim", "Call to Worship: Psalm 95:1-7"
  // ("Offering - Paul Baloche" is a song by an artist: an element word that
  // is also a common song title needs a role/scripture/stage-direction trailer.)
  const trailer = /^(.+?)(?:\s+[-–—]\s+|\s*[–—]\s*|:\s+)(.+)$/.exec(line)
  if (trailer && isServiceElement(trailer[1])) {
    const tail = trailer[2].trim()
    if (!SONG_TITLE_TOO.test(trailer[1].trim()) || ROLE.test(tail) || QUALIFIER.test(tail) || isScripture(tail)) {
      return { kind: 'element', title: line }
    }
  }
  // "Psalm 23 — Responsive" / "Psalm 46 (Responsive)": the reading with a stage direction (B4-N3).
  const direction = /^(.+?)(?:\s*[-–—:]\s*|\s*\(\s*)([^()]+?)\)?$/.exec(line)
  if (direction && QUALIFIER.test(direction[2].trim()) && isScripture(direction[1])) {
    return { kind: 'scripture', title: stripTranslation(direction[1].replace(READING_LABEL_PREFIX, '').trim()) }
  }
  if (isScripture(line)) return { kind: 'scripture', title: stripTranslation(line.replace(READING_LABEL_PREFIX, '').trim()) }
  const embedded = EMBEDDED_REFERENCE.exec(line)
  if (embedded) return { kind: 'scripture', title: embedded[1].trim() }
  return { kind: 'song', title: line }
}

export function parseSetlist(raw: string): SetlistEntry[] {
  const out: SetlistEntry[] = []
  for (const rawLine of raw.split(/\r?\n/)) {
    // "* Please stand as you are able", "† indicates standing": the bulletin's
    // key to its own marks, not an item (B4-N3). A "*" in front of an item
    // ("*Hymn: Amazing Grace") is still just a stand mark.
    if (RUBRIC.test(rawLine.trim())) continue
    const line = cleanLine(rawLine)
    if (!line || isHeadingLine(line)) continue
    const [rawHead, tail] = splitLeader(line)
    const head = stripColon(rawHead)
    if (!head) continue
    // "Hymn of Praise<TAB>No. 89<TAB>Joyful, Joyful…": the title is the last
    // column that isn't a hymnal number (B3-N6).
    if (tail && HYMN_LABEL_ALONE.test(head)) {
      const cols = tail.split(/\t+|\s*(?:\.\s*){3,}|\s*…+\s*|\s{3,}/).map((c) => c.trim()).filter((c) => c && !HYMNAL_NUMBER_COLUMN.test(c))
      if (cols.length) { out.push({ kind: 'song', title: cols[cols.length - 1] }); continue }
    }
    const entry = classify(head)
    if (tail) {
      // A reading label with the reference after the leader.
      if (entry.kind === 'element' && READING_PREFIX.test(`${head}:`) && isScripture(tail)) {
        out.push({ kind: 'scripture', title: tail })
        continue
      }
      // Keep who/what for a header ("Call to Worship — Pastor Jim"); for a
      // song the trailer is a credit/leader and would spoil the library match.
      if (entry.kind === 'element') entry.title = `${entry.title} — ${tail}`
    }
    out.push(entry)
  }
  return out
}

export function matchSongTitle(title: string, library: { id: number; title: string }[]): number | null {
  const want = title.trim().toLowerCase()
  const exact = library.find((s) => s.title.trim().toLowerCase() === want)
  if (exact) return exact.id
  const stripped = library.find((s) => s.title.trim().toLowerCase().replace(/[^\w\s]/g, '') === want.replace(/[^\w\s]/g, ''))
  if (stripped) return stripped.id
  // "Offering - Paul Baloche": try the title without an artist/credit trailer.
  const head = title.split(/\s+[-–—]\s+/)[0]
  return head !== title && head.trim() ? matchSongTitle(head, library) : null
}
