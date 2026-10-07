// QA retest2 setlist probe (b-extra/retest2/setlist-probe.ts), kept verbatim as
// a fixture: [pasted line, expected kind]. '?' = no fixed expectation (INFO).
// The QA build failed 32 of these 106 (B2-N6).
export const SETLIST_PROBE_CASES: [string, string][] = [
  // B-N3 core four
  ['Tithes & Offerings', 'element'], ['Tithes and Offerings', 'element'], ['Offerings', 'element'], ['Call to Worship', 'element'], ['Scripture Reading', 'element'],
  // case / punctuation variants
  ['TITHES & OFFERINGS', 'element'], ['tithes & offerings', 'element'], ['Tithes &amp; Offerings', 'element'], ['Tithes&Offerings', 'element'], ['Tithes + Offerings', 'element'],
  ['Tithes & Offering', 'element'], ['Tithe & Offering', 'element'], ['Tithes, Offerings', 'element'], ['Tithes & Offerings:', 'element'], ['Offering:', 'element'],
  ['Call to Worship:', 'element'], ['Call To Worship', 'element'], ['CALL TO WORSHIP', 'element'], ['Call to Worship (Responsive)', 'element'], ['Call to Worship – Psalm 95', '?'],
  ['Call to Worship: Psalm 95:1-7', '?'], ['Scripture Reading:', 'element'], ['Scripture Reading: John 3:16-17', 'scripture'], ['Scripture Reading – John 3:16', 'scripture'],
  ['Scripture Reading — Romans 8:28', 'scripture'], ['Scripture Reading (Romans 8)', 'scripture'], ['Scripture Readings', 'element'], ['Old Testament Reading', 'element'], ['New Testament Reading', 'element'],
  ['Gospel Reading', 'element'], ['Responsive Reading', 'element'], ['Reading: Psalm 23', 'scripture'], ['Scripture: Isaiah 40:31', 'scripture'],
  // numbering / bullets / times / tabs
  ['1. Call to Worship', 'element'], ['2) Tithes & Offerings', 'element'], ['• Offerings', 'element'], ['- Scripture Reading', 'element'], ['* Call to Worship', 'element'],
  ['10:30 Call to Worship', 'element'], ['10:45 AM  Tithes & Offerings', 'element'], ['Call to Worship\t\tPastor Jim', 'element'], ['Offering\u00A0', 'element'], ['  Offerings  ', 'element'],
  ['a. Call to Worship', 'element'], ['Call to Worship ......... Pastor Jim', 'element'], ['Call to Worship - Pastor Jim', 'element'], ['Offertory Prayer', 'element'], ['Offertory', 'element'],
  ['Offering / Offertory', 'element'], ['Offering & Prayer', 'element'], ['Prayer & Offering', 'element'], ['Tithes, Offerings & Prayer', 'element'], ['Offering (Special Music)', '?'],
  // other common bulletin elements
  ['Prelude', 'element'], ['Postlude', 'element'], ['Welcome & Announcements', 'element'], ['Announcements', 'element'], ['Greeting', 'element'], ['Passing of the Peace', 'element'], ['Passing the Peace', 'element'],
  ['Opening Prayer', 'element'], ['Pastoral Prayer', 'element'], ["The Lord's Prayer", 'element'], ['Lord\u2019s Prayer', 'element'], ['Prayer Requests', 'element'], ['Joys and Concerns', 'element'],
  ["Children's Sermon", 'element'], ['Children\u2019s Moment', 'element'], ['Special Music', 'element'], ['Choir Anthem', 'element'], ['Affirmation of Faith', 'element'], ["Apostles' Creed", 'element'],
  ['Gloria Patri', '?'], ['Doxology', 'song'], ['Benediction', 'element'], ['Altar Call', 'element'], ['Invitation', 'element'], ['Hymn of Invitation', '?'], ['Communion', 'element'], ["Lord's Supper", 'element'],
  ['Sermon', 'sermon'], ['Sermon: Faith That Moves', 'sermon'], ['Message — Pastor Jim', 'sermon'], ['Moment of Silence', 'element'], ['Benediction & Dismissal', 'element'], ['Welcome / Call to Worship', 'element'],
  // songs that must stay songs
  ['Word of God Speak', 'song'], ['Message of the Cross', 'song'], ['Offering (Paul Baloche)', 'song'], ['The Offering', 'song'], ['Call Upon the Lord', 'song'], ['Here I Am to Worship', 'song'],
  ['Come Now Is the Time to Worship', 'song'], ['Amazing Grace', 'song'], ['Holy, Holy, Holy', 'song'], ['Great Is Thy Faithfulness', 'song'], ['Blessed Assurance', 'song'], ['Way Maker', 'song'],
  ['Response', 'element'], ['Reckless Love', 'song'], ['Give Thanks', 'song'], ['Opening Hymn: Holy, Holy, Holy', '?'], ['Hymn #301', '?'], ['Hymn 301', '?'], ['Psalm 23', 'scripture'], ['John 3:16', 'scripture'],
]


export const SETLIST_PROBE_BULLETIN = `Snow Hill CMC — Order of Worship\r\nSunday, October 11, 2026\r\n\r\nPrelude\r\n1. Call to Worship\r\n2. Opening Hymn: Holy, Holy, Holy\r\nWelcome & Announcements\r\n\tTithes & Offerings\r\nDoxology\r\nScripture Reading – Romans 8:28-39\r\nSermon: More Than Conquerors\r\nHymn of Invitation: Just As I Am\r\nBenediction\r\nPostlude`
