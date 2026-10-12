// QA retest6 "new variant" setlist probe (b-extra/retest6/setlist-probe6-new.ts),
// cases array kept verbatim as a fixture: [pasted line, expected kind, expected
// title substring?]. kind: element|song|scripture|sermon|skip (no entry)|? (info only).
// The 0.20.3 candidate f923be2 passed 31 of the 47 QA graded (B6-N2: elements
// 3/13, sermon 2/5, skip 3/6 — each miss a blocking song placeholder). QA's
// probe skips 5 lines already seen in earlier fixtures; all 51 graded here.
export const SETLIST_PROBE6_CASES: [string, string, string?][] = [
  // elements
  ['Act of Praise', 'element'], ['Silent Reflection', 'element'], ['Lighting of the Advent Wreath', 'element'],
  ['Baptism of Infants', 'element'], ['Reception of New Members', 'element'], ['Words of Institution', 'element'],
  ['Breaking of the Bread', 'element'], ['Prayer After Communion', 'element'], ['The Apostles\u2019 Creed', 'element'],
  ['Declaration of Forgiveness', 'element'], ['Unison Prayer', 'element'], ['Ministry Minute', 'element'],
  ['Prelude \u2014 \u201cJesu, Joy of Man\u2019s Desiring\u201d (J.S. Bach)', 'element'], ['Postlude: Toccata in F (Widor)', 'element'],
  ['Call to Worship (Psalm 100)', 'element'], ['Prayer for Illumination', 'element'],
  // scripture
  ['First Reading: Genesis 12:1\u20134a', 'scripture', 'Genesis 12:1'], ['Second Reading \u2014 Romans 4:1-5, 13-17', 'scripture', 'Romans 4:1'],
  ['Gospel Reading: Jn 3:1-17', 'scripture', '3:1'], ['Psalm 121 (read responsively)', 'scripture', 'Psalm 121'],
  ['Epistle: Phil. 2:5\u201311', 'scripture', '2:5'], ['Ps 51:1-17', 'scripture', '51:1'],
  ['Reading from the Prophets: Jeremiah 31:31-34', 'scripture', 'Jeremiah 31:31'], ['Scripture: 1 Jn 4:7\u201312', 'scripture', '4:7'],
  ['Hebrew Bible Reading: Exodus 3:1\u201315', 'scripture', 'Exodus 3:1'], ['Acts 2:1-21', 'scripture', 'Acts 2:1'],
  ['Rev 21:1-6', 'scripture', '21:1'], ['Song of Solomon 2:8-13', 'scripture', '2:8'], ['Song of Songs 2:8\u201313', 'scripture', '2:8'],
  ['Lamentations 3:22-23', 'scripture', 'Lamentations 3:22'], ['Matthew 5:1-12 (pew Bible p. 803)', 'scripture', 'Matthew 5:1'],
  ['Psalm 46\u201347', 'scripture', 'Psalm 46'],
  // sermon
  ['Sermon Series \u201cOrdinary Saints\u201d \u2014 Part 3: Ruth', 'sermon'], ['Preaching: \u201cWhen the Wine Runs Out\u201d', 'sermon', 'When the Wine Runs Out'],
  ['Message \u2014 Pastor Jim Hale', 'sermon'], ['Sermon ............ \u201cA Lamp Unto My Feet\u201d ............ Rev. Kim', 'sermon', 'A Lamp Unto My Feet'],
  ['Homily \u2013 \u201cSalt and Light\u201d', 'sermon', 'Salt and Light'],
  // rubric / skip
  ['Ushers will seat latecomers at this time', 'skip'], ['\u2020 Please stand as you are able', 'skip'], ['All: Thanks be to God.', 'skip'],
  ['Hearing assistance devices are available in the narthex', 'skip'], ['www.fumcspringfield.org', 'skip'],
  ['Sunday, October 11, 2026 \u2022 10:30 AM', 'skip'],
  // songs that must stay songs
  ['Here I Am, Lord', 'song'], ['In Christ Alone', 'song'], ['Before the Throne of God Above', 'song'],
  ['Gospel Song: Blessed Assurance', 'song', 'Blessed Assurance'], ['Song of Response \u2014 \u201cI Surrender All\u201d', 'song', 'I Surrender All'],
  ['Hymn 2008 \u2013 Here I Am, Lord', 'song', 'Here I Am'], ['The Word Became Flesh', 'song'], ['Shepherd Me, O God', 'song'],
  ['Psalm 46 (Be Still)', '?'], ["The Lord's Prayer (sung)", '?'], ['Liturgist: Rev. Sarah Park', '?'],
]
