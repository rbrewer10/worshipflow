// QA retest3 "new variant" setlist probe (b-extra/retest3/setlist-probe3-new.ts),
// kept verbatim as a fixture: [pasted line, expected kind, expected title
// substring?]. kind: element|song|scripture|sermon|skip (no entry)|? (info only).
// The 0.20.3 candidate 8e30460 failed 23 of these 65 (B3-N6).
export const SETLIST_PROBE3_CASES: [string, string, string?][] = [
  // elements not in the fixture
  ['Scripture Lesson', 'element'], ['Scripture Lesson: Luke 2:1-20', 'scripture', 'Luke 2:1-20'], ['Old Testament Lesson – Isaiah 9:2-7', 'scripture', 'Isaiah 9:2-7'],
  ['Gathering Prayer', 'element'], ['Unison Prayer', 'element'], ['Prayer of Confession', 'element'], ['Holy Communion', 'element'],
  ['Moment for Mission', 'element'], ['Sharing of Joys and Concerns', 'element'], ['Praise & Worship', 'element'], ['Musical Offering', 'element'],
  ["Children\u2019s Church Dismissal", 'element'], ['Welcome and Greeting', 'element'], ['Announcements & Welcome', 'element'],
  ['Call to Worship;', 'element'], ['Welcome!', 'element'], ['Call to Worship*', 'element'], ["Lord's Prayer (debts)", 'element'],
  ['Announcements (see insert)', 'element'], ['Postlude ............ Mrs. Smith, piano', 'element'], ['11:00 a.m. Prelude', 'element'], ['10:30am Welcome', 'element'],
  ['III. Call to Worship', 'element'], ['(1) Call to Worship', 'element'], ['Call to Worship \u2013 Rev. Ann Lee', 'element'],
  // songs with labels / bulletin markup
  ['*Hymn: Amazing Grace', 'song', 'Amazing Grace'], ['Offertory Hymn: Jesus Paid It All', 'song', 'Jesus Paid It All'], ['Closing Song \u2014 Victory in Jesus', 'song', 'Victory in Jesus'],
  ['Hymn of Praise\tNo. 89\tJoyful, Joyful, We Adore Thee', 'song', 'Joyful'], ['Opening Hymn #89 \u2013 Joyful, Joyful', 'song', 'Joyful'], ['+ Doxology', 'song', 'Doxology'],
  ['Amazing Grace*', 'song', 'Amazing Grace'], ['Amazing Grace \u2014 Chris Tomlin', 'song'], ['Amazing Grace (My Chains Are Gone)', 'song'],
  // songs that must stay songs
  ['The Blessing', 'song'], ['Goodness of God', 'song'], ['Revelation Song', 'song'], ['Lord, I Need You', 'song'], ['Welcome to Our World', 'song'],
  ['Christ the Lord Is Risen Today', 'song'], ['Graves into Gardens', 'song'], ['Build My Life', 'song'], ['Way Maker \u2013 Sinach', 'song'],
  // scripture
  ['Scripture Reading: 1 Cor. 13:4-7', 'scripture', '1 Cor'], ['Scripture Reading: Ps 23', 'scripture'], ['John 3:16 (KJV)', 'scripture'], ['II Timothy 3:16', 'scripture'],
  ['Matthew 5:3\u201312', 'scripture'], ['1 John 4:7-12', 'scripture'], ['Scripture Reading: Song of Solomon 2:10', 'scripture'], ['Reading: John 3:16, 17', 'scripture'],
  // sermon
  ['Sermon \u2014 \u201cFaith Over Fear\u201d', 'sermon', 'Faith Over Fear'], ['Message: "Hope" \u2013 Pastor Jim', 'sermon'], ['Sermon Series: Hope', 'sermon'], ["Today's Message", 'sermon'], ["Pastor's Message", 'sermon'],
  // headings / noise
  ['Sunday, October 11, 2026', 'skip'], ['October 11th', 'skip'], ['Order of Worship', 'skip'], ['Worship Service \u2013 10:30 AM', 'skip'],
  ['Snow Hill Congregational Methodist Church', '?'], ['Pastor: Rev. Jim Smith', '?'], ['Psalm 23 (I Am Not Alone)', '?'], ['Hymn No. 301', '?'], ['Doxology (No. 95)', '?'],
]
