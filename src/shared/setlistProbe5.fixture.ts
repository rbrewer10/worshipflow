// QA retest5 "new variant" setlist probe (b-extra/retest5/setlist-probe5-new.ts),
// cases array kept verbatim as a fixture: [pasted line, expected kind, expected
// title substring?]. kind: element|song|scripture|sermon|skip (no entry)|? (info only).
// The 0.20.3 candidate 757e53a failed 27 of the 62 graded (B5-N7).
export const SETLIST_PROBE5_CASES: [string, string, string?][] = [
  // Methodist / liturgical elements
  ['Prayer of Confession and Assurance of Pardon', 'element'], ['Words of Assurance', 'element'], ['Prayers of the People', 'element'],
  ['Concerns and Celebrations', 'element'], ['A Modern Affirmation (UMH 885)', 'element'], ['The Nicene Creed', 'element'],
  ['The Great Thanksgiving', 'element'], ['Invitation to the Table', 'element'], ['Presentation of Tithes and Offerings', 'element'],
  ['Prayer of Dedication', 'element'], ['Time with Young Disciples', 'element'], ['Choral Introit', 'element'],
  ['Chiming of the Hour', 'element'], ['Extinguishing of the Candles', 'element'], ['Commissioning', 'element'],
  ['Litany of Thanksgiving', 'element'], ['Collect for Purity', 'element'], ['Prayer of the Day', 'element'],
  ["Sharing Christ's Peace", 'element'], ['Gospel Acclamation', 'element'], ['Ringing of the Bell', 'element'],
  // reading forms
  ['Old Testament: Isaiah 55:1\u20139', 'scripture', 'Isaiah 55:1'], ['New Testament Lesson \u2014 1 Corinthians 13:1-13', 'scripture', '1 Corinthians 13'],
  ['The Holy Gospel according to St. John 1:1-14', 'scripture', 'John 1:1'], ['Psalter Reading: Psalm 103:1-5 (UMH 824)', 'scripture', 'Psalm 103'],
  ['Responsorial Psalm 98', 'scripture', 'Psalm 98'], ['Lesson: II Kings 2:1-12', 'scripture', 'Kings 2:1'],
  ['Scripture Readings: Joel 2:23-32; Luke 18:9-14', 'scripture', 'Joel 2:23'], ['Gospel: Matt 5:1\u201312', 'scripture', '5:1'],
  ['Old Testament Reading ~ Micah 6:6-8', 'scripture', 'Micah 6:6'], ['Reading: Psalm 23, 24', 'scripture', 'Psalm 23'],
  ['Jude 3', 'scripture', 'Jude 3'], ['Romans 8:28; 12:1-2', 'scripture', 'Romans 8:28'], ['John 3:35\u20144:3', 'scripture', 'John 3:35'],
  // sermon forms
  ['Sermon Title: \u201cLiving Water\u201d', 'sermon', 'Living Water'], ["Message from God's Word: Grace Upon Grace", 'sermon', 'Grace Upon Grace'],
  ['Sermon \u2013 \u201cWho Is My Neighbor?\u201d \u2013 Rev. Dr. Ann Lee', 'sermon', 'Who Is My Neighbor'], ['The Sermon', 'sermon'],
  ['Morning Message', 'sermon'], ['Proclaiming the Word', 'sermon'], ['Sermon (Luke 15:11-32) \u201cThe Waiting Father\u201d', 'sermon', 'The Waiting Father'],
  // rubric lines
  ['*Congregation standing', 'skip'], ['** Please rise in body or spirit', 'skip'], ['(Please silence your cell phones)', 'skip'],
  ['Bold print indicates congregational response', 'skip'], ['Large print bulletins are available from the ushers', 'skip'],
  ['+ Denotes standing', 'skip'], ['Leader: The Lord be with you.', 'skip'], ['People: And also with you.', 'skip'],
  ['First United Methodist Church of Springfield', 'skip'],
  // songs that must stay songs (traps: Peace / Word / Psalm / Holy / Communion inside titles)
  ['Let There Be Peace on Earth', 'song'], ['Word of God, Speak', 'song'], ['Thy Word', 'song'], ['Lord, Prepare Me', 'song'],
  ['Gather Us In', 'song'], ['Morning Has Broken', 'song'], ['Spirit of the Living God', 'song'], ["The Church's One Foundation", 'song'],
  ['Holy Ground', 'song'], ['Ancient Words', 'song'], ['Hymn of the Day: A Mighty Fortress Is Our God', 'song', 'A Mighty Fortress'],
  ['Bless the Lord, O My Soul', 'song'],
  // info only
  ['Kyrie', '?'], ["Children's Sermon", '?'], ['Recessional', '?'], ['Psalm 23 (I Will Not Be Shaken)', '?'], ['Lay Reader: Mrs. Ann Lee', '?'],
]
