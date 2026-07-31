export interface DuplicateGroup {
  normalizedTitle: string
  songs: { id: number; title: string }[]
}

// Case/whitespace-insensitive title match — the audit found existing
// duplicate/near-duplicate titles already in the library (left over from
// before the New Song draft-gate existed), separate from the new-song-time
// warning that only catches duplicates going forward. Deliberately simple
// (no fuzzy/edit-distance matching): a normalized-exact match is a duplicate
// an operator can confidently act on; a "maybe similar" match would just
// invite second-guessing without enough context to resolve it here.
export function findDuplicateSongTitles(songs: { id: number; title: string }[]): DuplicateGroup[] {
  const groups = new Map<string, { id: number; title: string }[]>()
  for (const song of songs) {
    const key = song.title.trim().toLowerCase().replace(/\s+/g, ' ')
    const list = groups.get(key) ?? []
    list.push(song)
    groups.set(key, list)
  }
  return Array.from(groups.entries())
    .filter(([, list]) => list.length > 1)
    .map(([normalizedTitle, list]) => ({ normalizedTitle, songs: list }))
    .sort((a, b) => a.normalizedTitle.localeCompare(b.normalizedTitle))
}
