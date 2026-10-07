import { parseScriptureReference } from './scriptureParse'
import { parseReferenceList } from './scriptureRefs'

export type SetlistKind = 'song' | 'scripture' | 'sermon' | 'placeholder' | 'element'

export interface SetlistEntry {
  kind: SetlistKind
  title: string
}

// QA B5-N4: references are read by the app's one reference grammar
// (shared/scriptureParse, the same one the lookup and Review & publish use).
// The importer's own regex knew neither the em dash nor chapter ranges, so a
// bare "Mark 4:35—41" came in as "Mark 4:35" (one verse went live, silently)
// and "Psalm 23-24" / "Psalm 23–24" / "Psalms 23-24" became song placeholders.
//
// A reference only has to be well formed with a real book here: "John 99:1"
// is still a scripture item (Review & publish says what's wrong with it)
// rather than a "Song: John 99:1" placeholder.
const UNREADABLE = /^(?:Could not read|Unknown book|Add a chapter|Enter a reference)/

function readsAsReference(ref: string): boolean {
  // A number is required: a bare "Jude" or "Job" on its own line is more likely a song than a reading.
  if (!/\d/.test(ref)) return false
  const parts = parseReferenceList(ref.replace(/\s+(?:&|and)\s+(?=(?:[1-3]\s*)?[A-Za-z])/g, '; '))
  return parts.length > 0 && parts.every((part) => {
    const parsed = parseScriptureReference(part)
    return parsed.ok || !UNREADABLE.test(parsed.error)
  })
}

// "John 3:16 (KJV)" / "John 3:16 NIV" — the translation is not part of the
// reference the lookup reads (QA B3-N6).
const TRANSLATION = /\s*[([]?\s*(?:KJV|NKJV|NIV|ESV|NASB|NLT|CSB|HCSB|RSV|NRSV|NRSVUE|CEB|MSG|AMP|CEV|GNT|NET|WEB|ASV|NIrV)\s*[)\]]?$/

// "Scripture Reading: …", "Old Testament Lesson – …" (B3-N6: lesson wording).
const LESSON = '(?:(?:scripture|old testament|new testament|gospel|epistle|first|second) )?lessons?'
// B4-N3: "Responsive Psalm: Psalm 46", "Reading from the Psalter: Psalm 121".
const PSALTER_LABEL = '(?:responsive|responsorial|the|unison) psalm|psalm reading|(?:reading from )?the psalter|psalter(?: reading)?'
const READING_LABEL = `scripture readings?|scripture|readings?|bible|(?:old|new) testament reading|gospel reading|epistle reading|${LESSON}|${PSALTER_LABEL}`
const READING_LABEL_PREFIX = new RegExp(`^(?:${READING_LABEL})\\s*[:.\\-–—~]\\s*`, 'i')

// "Psalm 103:1-5 (UMH 824)", "Psalm 46 (Responsive)": a hymnal number or a
// stage direction after the reference isn't part of what the lookup reads.
function stripTranslation(ref: string): string {
  let out = ref.replace(TRANSLATION, '').trim()
  const note = /^(.*?)\s*\(([^()]*)\)$/.exec(out)
  if (note && note[1] && QUALIFIER.test(note[2].trim())) out = note[1].trim()
  return out.replace(/\s+(?:&|and)\s+(?=(?:[1-3]\s*)?[A-Za-z]+\.?\s*\d)/g, '; ')
}

// "Responsorial Psalm 98", "Responsive Psalm 46" — the label runs straight
// into the reading with no separator (B5-N7).
const PSALM_LEAD_IN = /^(?:responsive|responsorial|unison|the)\s+(?=psalms?\s+\d)/i

function referenceText(line: string): string {
  return stripTranslation(line.replace(READING_LABEL_PREFIX, '').replace(PSALM_LEAD_IN, '').trim())
}

function isScripture(line: string): boolean {
  return readsAsReference(referenceText(line))
}

// A chapter:verse reference anywhere in the line ("Responsive Psalm 95:1-7").
// QA B3-N6: at minimum, a line holding one must never become a song
// placeholder (a placeholder blocks readiness).
// B5-N4: em dash and cross-chapter ranges too, and the book has to be a book.
const EMBEDDED_REFERENCE = /((?:(?:[1-3]|I{1,3})\s+)?[A-Z][A-Za-z]+\.?(?:\s+of\s+[A-Z][a-z]+)?\s+\d+:\d+(?:\s*[–—-]\s*\d+(?::\d+)?)?)/g

function embeddedReference(line: string): string | null {
  for (const m of line.matchAll(EMBEDDED_REFERENCE)) {
    if (readsAsReference(m[1])) return m[1].trim()
  }
  return null
}

// QA B16: a bare word prefix made "Word of God Speak" and "Message of the
// Cross" (songs) into sermon cards. A sermon line now needs a separator
// ("Sermon: The Cross", "Message - Hope") or to be the bare word on its own.
// B5-N7: "Sermon Title: …", "Message from God's Word: …", "Proclaiming the Word".
// B6-N2: "Preaching: …", and a quoted title straight after the word with no
// separator ('Sermon Series "Ordinary Saints" — Part 3: Ruth').
const SERMON_PREFIX = /^(sermon series|sermon title|message title|sermon|message|homily|preaching|proclamation|word|(?:today'?s|pastor'?s|the) (?:message|sermon)|message from (?:god'?s|the) word)\s*(?:[:.\-–—]\s*|\s(?=\s*"))\s*/i
const SERMON_ALONE = /^(sermon|message|homily|the word|teaching|(?:today'?s|pastor'?s|the|morning) (?:message|sermon)|message from (?:the )?pastor|(?:the )?word (?:proclaimed|preached)|(?:the )?(?:proclamation|preaching) of (?:the|god'?s) word|proclaiming (?:the|god'?s) word)$/i
// "Sermon (Luke 15:11-32) "The Waiting Father"": the passage in brackets, then the title.
const SERMON_WITH_PASSAGE = /^(?:sermon|message|homily)\s*\(([^)]*)\)\s*[:\-–—]?\s*(.+)$/i

function isSermon(line: string): boolean {
  return SERMON_PREFIX.test(line) || SERMON_ALONE.test(line) || SERMON_WITH_PASSAGE.test(line)
}

const unquote = (s: string): string => s.replace(/^"(.*)"$/, '$1').trim()
// '"Ordinary Saints" — Part 3: Ruth' → 'Ordinary Saints — Part 3: Ruth' (B6-N2).
const unquoteLead = (s: string): string => s.replace(/^"([^"]+)"(?=\s*[-–—:,(]|\s*$)/, '$1').trim()

function sermonTitle(line: string): string {
  const withPassage = SERMON_WITH_PASSAGE.exec(line)
  if (withPassage) return unquote(withPassage[2].trim())
  const title = line.replace(SERMON_PREFIX, '').trim()
  return title ? unquoteLead(unquote(title)) : line
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
  // QA B5-N7: more Methodist / liturgical wording.
  'words of assurance', 'concerns (?:and|&) celebrations', 'celebrations (?:and|&) concerns', '(?:a |the )?(?:modern )?affirmation(?: of faith)?',
  '(?:the )?great thanksgiving', '(?:the )?invitation to the table', 'presentation of (?:our |the )?(?:tithes (?:and|&) offerings|offerings?|gifts|tithes)',
  'time with (?:young disciples|(?:the )?children|kids)', '(?:choral |choir )?introit', '(?:the )?chiming of the hour', '(?:the )?ringing of the bells?',
  '(?:the )?extinguishing of the (?:candles?|christ candle|light)', 'commissioning', 'litany(?: (?:of|for) [a-z\' ]+)?', '(?:the )?collect(?: (?:for|of) [a-z ]+)?',
  "(?:sharing|passing|exchange|greeting) (?:of )?christ'?s peace", 'gospel acclamation',
  // QA B6-N2: retest6 bulletin wording.
  'acts? of (?:praise|worship|adoration|confession|contrition|dedication|commitment|remembrance|thanksgiving|reconciliation|preparation)',
  '(?:silent|quiet|personal|time (?:of|for)) (?:reflection|meditation|confession|prayer)',
  '(?:the )?(?:sacrament of )?(?:holy )?baptisms? of (?:an? )?(?:infants?|children|child|adults?|believers?|youth|candidates?)', '(?:infant|adult|believers?\'?) baptisms?',
  '(?:the )?(?:reception|receiving|welcom(?:e|ing)|recognition) (?:of )?(?:our )?new (?:members|disciples|friends)', 'new members?(?: (?:reception|recognition|welcome))?',
  '(?:the )?breaking of (?:the )?bread', '(?:the )?fraction', '(?:the )?(?:prayer|blessing) (?:after|before|following) (?:holy )?communion', '(?:the )?post-?communion prayer',
  '(?:the )?(?:declaration|assurance|words) of (?:forgiveness|pardon|grace)',
  '(?:ministry|missions?|stewardship|giving|outreach) (?:minute|moment|spotlight|update)',
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
// 'Prelude — "Jesu, Joy of Man's Desiring" (J.S. Bach)': instrumental/choir
// music named after its label is the element, not a song to project (B6-N2).
// "Offering - Paul Baloche" stays a song.
const MUSIC_ONLY = /^(?:the )?(?:prelude|postlude|anthem)$/i
function namedPiece(head: string, tail: string): boolean {
  return MUSIC_ONLY.test(head.trim()) && /^"[^"]+"(?:\s*\([^()]+\))?$/.test(tail.trim())
}
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
  // B6-N2: "Sunday, Oct. 4 • 9:00 AM" — a service time after the date.
  `^(?:(?:sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*\\.?,?\\s+)?(?:${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?|\\d{1,2}/\\d{1,2}/\\d{2,4}|\\d{4}-\\d{2}-\\d{2})(?:\\s*[•·|,@–—-]?\\s*(?:at\\s+)?\\d{1,2}(?::\\d{2})?\\s*[ap]\\.?m\\.?)?$`,
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

const RUBRIC = /^(?:[*†‡+]+|\(\s*[*†‡+]\s*\))\s*(?:please\b|indicates?\b|denotes?\b|means\b|(?:all |those |the congregation )?(?:who are able,? )?(?:may |will |please )?(?:stand|standing|rise|be seated)\b|congregation(?:al)? (?:stands?|standing|response|participation)\b|as (?:you are|we are) able\b|if able\b)/i

// B5-N7: the rest of a bulletin's small print, and the spoken parts of a
// litany ("Leader: The Lord be with you." / "People: And also with you.").
const SMALL_PRINT = [
  /^\(\s*please\b[^)]*\)$/i,
  /^(?:(?:bold(?:ed)?|italic(?:s|ized)?|large|underlined)\s+)?(?:print|type|text|words?|lines?|items?)\s+(?:in (?:bold|italics?)\s+)?(?:indicates?|denotes?|means|marks?)\b/i,
  /\b(?:large[- ]print|braille|hearing (?:assistance|assist|devices?|loops?))\b.*\b(?:available|ask|provided)\b/i,
  /^(?:leader|people|all|congregation|one|many|minister|celebrant|reader|l|p|c)\s*:\s+.*[.!?]$/i,
  // B6-N2: house-keeping sentences, and the church's web/e-mail address.
  /^(?:ushers?|greeters?|latecomers?|those (?:arriving|who arrive) late)\b.*\b(?:will|may|are|please)\b/i,
  /\b(?:will|may|are (?:invited|welcome) to|please)\b.*\bat this time\.?$/i,
  /^(?:https?:\/\/|www\.)\S+$/i,
  /^[\w.+-]+@[\w-]+(?:\.[\w-]+)+$/,
  /^[\w-]+(?:\.[\w-]+)*\.(?:org|com|net|church|us|info|edu)(?:\/\S*)?$/i,
]
const isSmallPrint = (line: string): boolean => SMALL_PRINT.some((re) => re.test(line))

// "Liturgist: Rev. Ann Lee", "Organist — Tom Hart": who is serving today, not
// an item (B6-N2; these became blocking song placeholders). "Reader: Ruth 1:16"
// still reads as the scripture it names.
const PERSONNEL = /^(?:(?:the )?(?:liturgist|preacher|organist|pianist|accompanist|keyboardist|worship leader|song leader|lay (?:reader|leader|liturgist)|lector|acolytes?|crucifers?|cantor|music director|director of music|choir director|sound|media|projection|nursery(?: attendants?)?|ushers|greeters|ministers))\s*(?::|\s[-–—])\s*(.+)$/i
const isPersonnelLine = (line: string): boolean => {
  const m = PERSONNEL.exec(line)
  return !!m && !isScripture(m[1]) && !/\d+:\d+/.test(m[1])
}

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
  if (isSermon(line)) return { kind: 'sermon', title: sermonTitle(line) }
  const reading = READING_PREFIX.exec(line)
  if (reading) {
    const ref = stripTranslation((reading[2] ?? reading[3] ?? '').trim())
    // "Scripture Reading:" with nothing after it is a header, not an empty scripture card.
    return ref ? { kind: 'scripture', title: ref } : { kind: 'element', title: reading[1] }
  }
  if (isServiceElement(line)) return { kind: 'element', title: line }
  // "Call to Worship (Responsive)"
  const paren = /^(.*?)\s*\(([^)]*)\)$/.exec(line)
  if (paren && paren[1] && isServiceElement(paren[1]) && (QUALIFIER.test(paren[2].trim()) || isServiceElement(paren[2]) || isScripture(paren[2]))) {
    return { kind: 'element', title: line }
  }
  // "Call to Worship - Pastor Jim", "Call to Worship: Psalm 95:1-7"
  // ("Offering - Paul Baloche" is a song by an artist: an element word that
  // is also a common song title needs a role/scripture/stage-direction trailer.)
  const trailer = /^(.+?)(?:\s+[-–—]\s+|\s*[–—]\s*|:\s+)(.+)$/.exec(line)
  if (trailer && isServiceElement(trailer[1])) {
    const tail = trailer[2].trim()
    if (!SONG_TITLE_TOO.test(trailer[1].trim()) || ROLE.test(tail) || QUALIFIER.test(tail) || isScripture(tail) || namedPiece(trailer[1], tail)) {
      return { kind: 'element', title: line }
    }
  }
  // "Psalm 23 — Responsive" / "Psalm 46 (Responsive)": the reading with a stage direction (B4-N3).
  const direction = /^(.+?)(?:\s*[-–—:,]\s*|\s*\(\s*)([^()]+?)\)?$/.exec(line)
  if (direction && QUALIFIER.test(direction[2].trim()) && isScripture(direction[1])) {
    return { kind: 'scripture', title: referenceText(direction[1]) }
  }
  if (isScripture(line)) return { kind: 'scripture', title: referenceText(line) }
  const embedded = embeddedReference(line)
  if (embedded) return { kind: 'scripture', title: embedded }
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
    if (!line || isHeadingLine(line) || isSmallPrint(line) || isPersonnelLine(line)) continue
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
        out.push({ kind: 'scripture', title: referenceText(tail) })
        continue
      }
      // Keep who/what for a header ("Call to Worship — Pastor Jim"); for a
      // song the trailer is a credit/leader and would spoil the library match.
      if (entry.kind === 'element') entry.title = `${entry.title} — ${tail}`
      // 'Sermon ........ "A Lamp Unto My Feet" ........ Rev. Kim': the title is
      // in the leader columns, the preacher after it (B6-N2).
      if (entry.kind === 'sermon' && SERMON_ALONE.test(head)) {
        const title = tail.split(/\t+|\s*(?:\.\s*){3,}|\s*…+\s*|\s{3,}/).map((c) => c.trim()).find((c) => c && !ROLE.test(c) && !QUALIFIER.test(c))
        if (title) entry.title = unquoteLead(unquote(title))
      }
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
