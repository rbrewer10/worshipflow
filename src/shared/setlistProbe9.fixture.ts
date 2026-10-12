// QA retest9 break probe (b-extra/retest9/probe9-break.ts), library and
// sections kept verbatim as a fixture. 8be25a7: role coverage narrowed
// (B9-N1), hymnal-number tails unlinked (B9-N2), colon credits unlinked
// (B9-N3), date / heading / colon-role lines rescued as library songs (B9-N4).
export const PROBE9_LIBRARY: { id: number; title: string }[] = [
  'Lord of Hosts', 'Promise Keeper', 'Holy, Holy, Holy', 'Amazing Grace', 'Great Is Thy Faithfulness', 'Be Thou My Vision',
  'Leader of the Band', "Pastor's Heart", 'Shepherd', 'Sound of Heaven', 'Flowers', 'Security', 'Greeters', 'Media',
  'Worship Leader', 'Song Leader', 'Easter Sunday', 'Christ the King', 'Order of Worship', 'Sunday', 'Prayer Team', 'Readers',
  'The Steward', 'Ushers', 'Way Maker', 'Hosanna', 'Slides', 'Live Stream', 'Choir', 'Gentle Shepherd',
].map((title, i) => ({ id: i + 1, title }))
export const PROBE9_SECTIONS: [string, string[]][] = [
  ['A. songs whose titles start with / are role words (want song)', [
    'Shepherd: A Song of Psalm 23', "Pastor's Heart", 'Leader of the Band', 'Leader of the Band – Dan Fogelberg', 'Sound of Heaven – Hillsong',
    'Security – Brandon Lake', 'Flowers – Hymn Choir', 'Greeters – Jim Smith', 'Media – The Band', 'Readers – Choir', 'Slides – Hillsong Young & Free',
    'Prayer Team – Chancel Choir', 'The Steward – Choir', 'Ushers – Shane & Shane', 'Live Stream – Chris Tomlin', 'Choir: Amazing Grace',
    'Song Leader – Hillsong', 'Worship Leader – Hillsong', 'Pastor – Rev. Smith Band', 'Hosanna – Hillsong', 'Gentle Shepherd – Gaither',
    'Sound – Jesus Culture', 'Lector – Taizé', 'Cantor: Kyrie Eleison', 'Organist: Prelude in C (Bach)',
  ]],
  ['B. real personnel (want skip)', [
    'Pastor: Ryan Brewer', 'Pastor – Ryan Brewer', 'Senior Pastor: Ryan Brewer', 'Pastor: Rev. Ryan Brewer', 'Guest Speaker: Dr. Ann Lee', 'Speaker: Jim Price',
    'Worship Team: Jim, Ann, Bob', 'Praise Team: Jim & Ann', 'Choir Leader: Ann Lee', 'Youth Leader: Jim Price', 'Bible Study Leader: Ann', 'Prayer Leader: Jim Price',
    'Youth Director: Jim', "Children's Director: Mrs. Davis", 'Sunday School Director: Ann', 'Counter: Bob Wells', 'Teller: Jan Wells', 'Usher Captain: Tom Baker',
    'Ushers & Greeters: The Wells', 'Ushers/Greeters: The Wells', 'Usher(s): Tom Baker', 'Greeters (Front Door): The Smiths', 'Worship Leaders: Jim & Ann',
    'Song Leaders: Jim & Ann', 'Music: Ann Lee', 'Musicians: Jim, Ann', 'Pianist: Ann Lee', 'Organ: Jan Wells', 'Piano: Ann Lee', 'Soloist: Mary Hill',
    'Deacon: Jim Price', 'Elder: Jim Price', 'Deacon on Duty: Jim Price', 'Acolyte: Timmy Lee', 'Candle Lighter: Timmy Lee', 'Cross Bearer: Tim Lee',
    'Crucifer: Tim Lee', 'Banner Bearer: Sue Ward', 'Flag Bearer: Sue Ward', 'Door Keeper: Earl Dunn', 'Doorkeeper: Earl Dunn', 'Parking Attendant: Earl Dunn',
    'Altar Attendant: Ann', 'Board Operator: Ryan', 'Projector Operator: Ryan', 'Camera Operator: Ryan', 'Sound/Media: Ryan Brewer', 'Sound & Video: Ryan Brewer',
    'Audio: Ryan Brewer', 'Video: Ryan Brewer', 'Lights: Ben Cole', 'Camera: Ben Cole', 'Coffee: The Smiths', 'Hostess: Mary Hill', 'Host: The Lees',
    'Server: Jim', 'Servers: Jim & Ann', 'Volunteer: Ann', 'Volunteers: Ann & Bob', 'Coordinator: Ann', 'Assistant: Ann', 'Nursery: Mrs. Davis',
    'Greeter: Mary Hill', 'Usher: Tom Baker', 'Sound Tech: Ryan Brewer', 'Communion Stewards: Gail Moore', 'Lay Leader: Ann Lee', 'Head Usher — Carl Mims',
    'Trustee on Duty: Ray', 'Bell Ringer: Sue', 'Liturgist: Rev. Sarah Park', 'Preacher: Rev. Jim Smith', 'Livestream: Ryan', 'Security Team: Dan',
  ]],
  ['C. library rescue false positives (skip-reason lines whose left side is a library title; want skip)', [
    'Easter Sunday — April 5, 2026', 'Easter Sunday — April 5, 2026 — 10:30 AM', 'Christ the King Sunday — November 22, 2026', 'Order of Worship',
    'Security: Officer Dan Miles', 'Greeters: The Smiths', 'Media: Ryan Brewer', 'Flowers: given by the Smith family', 'Prayer Team – The Elders',
    'Slides: Ben Cole', 'Live Stream: Ryan Brewer', 'Ushers: Tom & Bill', 'Readers: Ann & Jim', 'Worship Leader – Jim Price', 'Song Leader: Ann Lee',
    'Sunday, October 11, 2026', 'Sunday — October 11, 2026',
  ]],
  ['D. hymnal numbers / leader notes (want song, linked)', [
    'Amazing Grace No. 378', 'Amazing Grace, No. 378', 'Amazing Grace p. 378', 'Amazing Grace pg. 378', 'Amazing Grace Hymn 378', 'Amazing Grace #378',
    'Amazing Grace UMH 378', 'Amazing Grace (378)', 'Amazing Grace – 378', '378 Amazing Grace', 'Hymn 378 Amazing Grace', 'No. 378 Amazing Grace',
    'Holy, Holy, Holy (Leader: Jim Price)', 'Holy, Holy, Holy (led by the Youth)', 'Holy, Holy, Holy (Choir)', 'Holy, Holy, Holy (Solo: Mary Hill)',
    'Holy, Holy, Holy (Leader: Jim Price) (UMH 64)', 'Holy, Holy, Holy (UMH 64) (Leader: Jim Price)', 'Holy, Holy, Holy – Leader: Jim Price',
    'Holy, Holy, Holy [Leader: Jim Price]', 'Way Maker (feat. Leeland)', 'Way Maker (Leeland)', 'Choir (Leader: Ann)', 'Hymn: Holy, Holy, Holy (Leader: Jim)',
    '"Holy, Holy, Holy" (Leader: Jim Price)', 'Symphony No. 9', 'Psalm 23 (I Am Not Alone)', 'Mass No. 2 in G', 'Canon in D (Choir)',
  ]],
]
