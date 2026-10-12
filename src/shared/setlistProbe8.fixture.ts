// QA retest8 "new variant" setlist probe (b-extra/retest8/setlist-probe8-new.ts),
// cases array kept verbatim as a fixture: [pasted line, expected kind, expected
// title substring?]. kind: element|song|scripture|sermon|skip (no entry)|? (info only).
// d98401e passed 23 of QA's 42 graded; worse, B7-N2's role rule silently
// dropped song–artist lines whose title ends in a serving noun (B8-N1).
export const SETLIST_PROBE8_CASES: [string, string, string?][] = [
  // who's serving / notices (want skip)
  ['Ushers This Morning: Tom & Bill Ray', 'skip'], ['Media Team: Josh & Kayla Reed', 'skip'],
  ['Prayer Team \u2013 The Elders', 'skip'], ['Livestream: Ryan Brewer', 'skip'], ['Slides: Ben Cole', 'skip'],
  ['Security: Officer Dan Miles', 'skip'], ['Kitchen Crew \u2013 The Hendersons', 'skip'], ['Elder on Duty: Ray Simms', 'skip'],
  ['Pastor: Rev. Ryan Brewer', 'skip'], ['Choir Director: Ann Lee', 'skip'], ['Bulletin prepared by Sue Ward', 'skip'],
  ['The flowers on the altar are given to the glory of God by the Smith family', 'skip'],
  ['Nursery care is provided for infants through age 3', 'skip'], ['Potluck lunch to follow in the fellowship hall', 'skip'],
  ['Please silence your cell phones', 'skip'], ['Large-print bulletins are available from the ushers', 'skip'],
  ['Van Driver: Earl Dunn', 'skip'], ['Offering Counters \u2014 Jan & Bob Wells', 'skip'],
  // dates / service times (want skip)
  ['Sunday School 9:45 AM \u2022 Worship 11:00 AM', 'skip'], ['Worship at 9:00 and 11:00 a.m.', 'skip'],
  ['Sunday, October 11 \u2022 9:30 am & 11 am', 'skip'], ['Christmas Eve Candlelight Service \u2014 December 24, 2026 \u2014 7:00 PM', 'skip'],
  ['All Saints Sunday \u2014 Nov. 1', 'skip'], ['Reformation Sunday, October 25, 2026 \u2013 10:30 AM', 'skip'],
  ['Laity Sunday | 10.18.2026', 'skip'], ['Third Sunday of Advent', '?'],
  // hymnal numbers: want song with the bare title (bare "Hymn 301" stays as typed)
  ['Hymn 301', 'song', 'Hymn 301'], ['Hymn No. 301', 'song', 'Hymn No. 301'],
  ['\u201cAmazing Grace\u201d (UMH 378)', 'song', 'Amazing Grace'], ['Hymn #378 \u201cAmazing Grace\u201d', 'song', 'Amazing Grace'],
  ['Hymn of Praise \u2013 No. 89 \u2013 Joyful, Joyful, We Adore Thee', 'song', 'Joyful, Joyful'],
  ['Opening Hymn: Great Is Thy Faithfulness (TFWS 2003)', 'song', 'Great Is Thy Faithfulness'],
  ['\u201cHow Great Thou Art\u201d \u2013 p. 77', 'song', 'How Great Thou Art'], ['Be Thou My Vision, No. 451', 'song', 'Be Thou My Vision'],
  ['Great Is Thy Faithfulness - UMH 140', 'song', 'Great Is Thy Faithfulness'], ['Hymn: Christ the Lord Is Risen Today', 'song', 'Christ the Lord Is Risen Today'],
  ['Gloria Patri (UMH 71)', '?'], ['Doxology \u2014 No. 95', '?'],
  // real songs that must NOT be skipped by the broader role rule (want song)
  ['Lord of Hosts \u2013 Shane & Shane', 'song', 'Lord of Hosts'], ['Promise Keeper \u2013 Danny Gokey', 'song', 'Promise Keeper'],
  ['The Servant King', 'song', 'The Servant King'], ['Way Maker (Promise Keeper)', 'song', 'Way Maker'],
  ['Christ Is Risen \u2013 Matt Maher', 'song', 'Christ Is Risen'], ['Keeper of My Heart', 'song', 'Keeper of My Heart'],
  ['Good Good Father \u2013 Chris Tomlin', 'song', 'Good Good Father'],
  // readings after a role still read as scripture
  ['Reader: Isaiah 9:2-7', 'scripture', 'Isaiah 9:2'], ['Scripture Reader \u2013 Luke 2:1-20', 'scripture', 'Luke 2:1'],
  ['Liturgist: Psalm 100', 'scripture', 'Psalm 100'],
  // info
  ['Symphony No. 9', '?'], ['Psalm 23 (I Am Not Alone)', '?'], ['Anthem: \u201cHere I Am\u201d \u2013 Chancel Choir', '?'],
  ['Responsive Reading \u2013 Leader / People', '?'], ['Children\u2019s Church: Mrs. Davis', '?'],
]

// QA's breadth check (b-extra/retest8/probe8-breadth.ts): song–artist lines
// whose title ends in a serving noun. d98401e skipped all 12; every one is a song.
export const SONG_ARTIST_SERVING_NOUN = [
  'Lord of Hosts \u2013 Shane & Shane', 'Lord of Hosts - Shane & Shane', 'Lord of Hosts \u2014 Hillsong',
  'Promise Keeper \u2013 Danny Gokey', 'Promise Keeper - Danny Gokey',
  'Covenant Keeper \u2013 Joe Pace', 'Burden Bearer \u2013 Jason Crabb', 'My Keeper - arr. Mark Hayes',
  'Heavenly Host \u2013 Chancel Choir', 'Lord of Hosts: Shane & Shane', 'Promise Keeper: Danny Gokey',
  'Soul Keeper \u2013 arr. Smith',
]
