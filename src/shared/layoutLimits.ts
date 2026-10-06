// Operator window size floor (QA B17). Must stay below the narrowest laptop
// screen we support (1280 px) so a maximized window never pushes the right
// edge of the TopBar off-screen.
export const OPERATOR_MIN_WIDTH = 1180
export const SMALLEST_SUPPORTED_SCREEN_WIDTH = 1280

// Song library (QA B18): the import/licensing blocks (CCLI, SongSelect,
// PowerPoint, Paste, Export) used to fill the left column so the song list was
// about one row tall at the default window size. They now live in a
// collapsible "Import & CCLI" section: the operator's choice is remembered;
// with no saved choice it starts open only for an empty library.
export function songToolsOpen(saved: string | null, songCount: number, searching: boolean): boolean {
  if (saved === '1') return true
  if (saved === '0') return false
  return songCount === 0 && !searching
}
