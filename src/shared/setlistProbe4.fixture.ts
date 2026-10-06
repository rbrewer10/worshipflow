// QA retest4 "new variant" setlist probe (b-extra/retest4/setlist-probe4-new.ts),
// kept verbatim as a fixture: [pasted line, expected kind, expected title
// substring?]. kind: element|song|scripture|sermon|skip (no entry)|? (info only).
// The 0.20.3 candidate f97c017 failed 24 of the 61 graded (B4-N3).
export const SETLIST_PROBE4_CASES: [string, string, string?][] = [
  // liturgy elements
  ['Lighting of the Advent Wreath', 'element'], ['Lighting of the Candles', 'element'], ['Acolyte Lighting', 'element'],
  ['Silent Meditation', 'element'], ["Pastoral Prayer & Lord's Prayer", 'element'], ['Welcome / Announcements', 'element'],
  ['Greeting of Peace', 'element'], ['Exchange of Peace', 'element'], ['Sacrament of Holy Communion', 'element'],
  ["The Sacrament of the Lord's Supper", 'element'], ['Celebration of Communion', 'element'], ['Recognition of Visitors', 'element'],
  ['Birthdays & Anniversaries', 'element'], ['Sending Forth', 'element'], ['Benediction & Sending Forth', 'element'],
  ['Closing Prayer & Benediction', 'element'], ['Invitation to Discipleship', 'element'], ['Special Music – The Johnson Family', 'element'],
  ['Prayer for Illumination', 'element'], ["Apostles' Creed (UMH 881)", 'element'],
  // formatting noise
  ['CALL TO WORSHIP', 'element'], ['OFFERTORY', 'element'], ['Call\u00a0to\u00a0Worship', 'element'], ['• Prelude', 'element'],
  ['– Benediction', 'element'], ['1) Welcome', 'element'],
  // labelled songs
  ['Hymn of Invitation: Just As I Am', 'song', 'Just As I Am'], ['Hymn of Response – Here I Am, Lord', 'song', 'Here I Am, Lord'],
  ['Prayer Chorus: Sweet Hour of Prayer', 'song', 'Sweet Hour of Prayer'], ['Song of Praise – How Great Thou Art', 'song', 'How Great Thou Art'],
  ['Congregational Hymn No. 203 \u201cBlessed Assurance\u201d', 'song', 'Blessed Assurance'], ['Hymn 368 – Great Is Thy Faithfulness', 'song', 'Great Is Thy Faithfulness'],
  ['UMH 378 Amazing Grace', 'song', 'Amazing Grace'], ['Communion Hymn: Let Us Break Bread Together', 'song', 'Let Us Break Bread Together'],
  ['Benediction Song: The Blessing', 'song', 'The Blessing'],
  // songs that must stay songs
  ['Here I Am to Worship', 'song'], ['Come, Now Is the Time to Worship', 'song'], ['Revive Us Again', 'song'], ['Open the Eyes of My Heart', 'song'],
  ['Blessed Be Your Name', 'song'], ['Speak, O Lord', 'song'], ['This Is Amazing Grace', 'song'], ['Holy Spirit', 'song'],
  // scripture
  ['Responsive Psalm: Psalm 46', 'scripture', 'Psalm 46'], ['Epistle Lesson – Romans 8:28-39', 'scripture', 'Romans 8:28-39'],
  ['Gospel Lesson: Mark 4:35\u201341', 'scripture', 'Mark 4:35'], ['First Reading: Genesis 1:1-5', 'scripture', 'Genesis 1:1-5'],
  ['Second Reading \u2014 Acts 2:1\u20134', 'scripture', 'Acts 2:1'], ['Reading from the Psalter: Psalm 121', 'scripture', 'Psalm 121'],
  ['Scripture: Rom. 12:1-2 (NIV)', 'scripture', 'Rom'], ['Luke 15:11-32 NRSV', 'scripture', 'Luke 15:11-32'], ['Ps. 46:1-3, 10', 'scripture', '46'],
  ['Psalm 23 \u2014 Responsive', 'scripture', 'Psalm 23'],
  // sermon
  ['Sermon: \u201cPeace, Be Still\u201d (Mark 4:35-41)', 'sermon', 'Peace, Be Still'], ['Homily: Bread for the Journey', 'sermon', 'Bread for the Journey'],
  ['The Word Proclaimed', 'sermon'], ['Proclamation of the Word', 'sermon'], ['Preaching of the Word', 'sermon'], ['SERMON: FAITH OVER FEAR', 'sermon', 'FAITH OVER FEAR'],
  // rubrics / headings
  ['* Please stand as you are able', 'skip'], ['\u2020 indicates standing', 'skip'],
  // info only (no fixed expectation)
  ['Gloria Patri', '?'], ['Gloria Patri (p. 70)', '?'], ['Message \u2014 Pastor Jim Smith', '?'], ['Worship in Song', '?'], ['Choir Special: \u201cI\u2019ll Fly Away\u201d', '?'],
  ['Ushers Come Forward', '?'], ['WE GATHER', '?'], ['~ We Respond ~', '?'], ['Fellowship Hall Potluck Following Worship', '?'], ["The Lord's Prayer (Malotte)", '?'],
  ['Prayer of St. Francis', '?'], ['Psalm 46 (Be Still)', '?'], ['Welcome Home', '?'], ['Hymn #301 (red hymnal)', '?'], ['Offering & Doxology', '?'],
]
