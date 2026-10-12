// QA retest7 "new variant" setlist probe (b-extra/retest7/setlist-probe7-new.ts),
// cases array kept verbatim as a fixture: [pasted line, expected kind, expected
// title substring?]. kind: element|song|scripture|sermon|skip (no entry)|? (info only).
// The 0.20.3 candidate 57bc413 passed 25 of the 39 QA graded (B7-N2: who's
// serving 16/30 skipped, the rest — and two-time / church-year dates — became
// blocking song placeholders). QA's probe skips 7 lines already seen in
// earlier fixtures; the test grades 45 (see SUNG in setlistProbe7.test.ts).
export const SETLIST_PROBE7_CASES: [string, string, string?][] = [
  // who's serving (not items: want skip)
  ['Usher: Tom Baker', 'skip'], ['Ushers: Tom Baker, Bill Ray', 'skip'], ['Head Usher \u2014 Carl Mims', 'skip'],
  ['Acolyte: Emma Lane', 'skip'], ['Acolytes: Noah & Ava Smith', 'skip'], ['Greeters: The Johnson Family', 'skip'],
  ['Greeter: Mary Hill', 'skip'], ['Nursery: Linda Fox', 'skip'], ['Nursery Attendants \u2014 Kim & Jo Reed', 'skip'],
  ['Organist: Dr. Ruth Hale', 'skip'], ['Pianist \u2013 Sue Ward', 'skip'], ['Sound Tech: Ryan Brewer', 'skip'],
  ['Projection: Ben Cole', 'skip'], ['Scripture Reader: Ann Lee', 'skip'], ['Lector \u2014 Paul Grant', 'skip'],
  ['Deacon of the Month: Jim Price', 'skip'], ['Counters: Bob & Jan Wells', 'skip'], ['Communion Stewards: Gail and Ed Moore', 'skip'],
  ['Preacher: Rev. Kim Ortiz', 'skip'], ['Worship Leader \u2013 Jake Moss', 'skip'],
  ['Altar Flowers \u2014 given in memory of Ruth Hale by her family', 'skip'],
  ['Serving Today: Ushers \u2013 Tom Baker, Bill Ray; Greeters \u2013 the Lees', 'skip'],
  ['Reader: Ruth 1:16-18', 'scripture', 'Ruth 1:16'],
  // dates with a service time (want skip)
  ['Sunday, October 11, 2026 \u2014 11:00 AM', 'skip'], ['Sunday, October 11, 2026 at 11:00 a.m.', 'skip'],
  ['October 11, 2026 | 9:30 & 11:00 AM', 'skip'], ['Sunday Morning, October 11, 2026', 'skip'],
  ['10/11/2026 \u2013 11 AM', 'skip'], ['Oct. 11th, 2026 \u00b7 10:45am', 'skip'],
  ['Eighteenth Sunday after Pentecost \u2014 October 11, 2026', 'skip'], ['World Communion Sunday \u2022 October 4, 2026', 'skip'],
  ['11:00 AM Worship Service', '?'],
  // mixed real items
  ['Hymn of Praise #89 \u201cJoyful, Joyful, We Adore Thee\u201d', 'song', 'Joyful, Joyful'],
  ['Opening Hymn \u2014 \u201cHoly, Holy, Holy\u201d (UMH 64)', 'song', 'Holy, Holy, Holy'],
  ['Hymn of Response: \u201cJust As I Am\u201d', 'song', 'Just As I Am'],
  ['Closing Hymn: \u201cBlest Be the Tie That Binds\u201d', 'song', 'Blest Be the Tie'],
  ['Gloria Patri', 'element'], ['Prayers of the People', 'element'], ['Children\u2019s Moment', 'element'],
  ['Presentation of Tithes and Offerings', 'element'], ['Joys and Concerns', 'element'], ['Altar Call', 'element'],
  ['Benediction & Postlude', 'element'], ['Announcements & Welcome', 'element'],
  ['Scripture Lesson: Luke 15:11-32', 'scripture', 'Luke 15:11'], ['Old Testament Lesson \u2014 Isaiah 40:28-31', 'scripture', 'Isaiah 40:28'],
  ['Sermon: \u201cRunning on Empty\u201d \u2014 Rev. Ryan Brewer', 'sermon', 'Running on Empty'],
  ['Special Music: \u201cIt Is Well\u201d \u2014 Snow Hill Choir', '?'], ['Doxology (UMH 95)', '?'],
]
