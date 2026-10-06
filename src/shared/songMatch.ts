// Duplicate-song detection rules (QA A-H5). Pure so they can be unit-tested
// without the database.

/**
 * Normalise a CCLI song number to a single digit token.
 *  - "6158927", "CCLI# 6158927", "CCLI Song # 6158927" → "6158927"
 *  - "6 158 927" / "6,158,927" (only digits + separators) → "6158927"
 *  - "6158927, License 123456" → "6158927" (the first number, not the two
 *    concatenated — the old digits-only normalisation produced "6158927123456",
 *    which never matched anything)
 */
export function normalizeCcli(raw: string | null | undefined): string {
  const s = (raw ?? '').trim()
  if (!s) return ''
  if (/^[\d\s,.-]+$/.test(s)) return s.replace(/\D/g, '')
  const runs = s.match(/\d+/g) ?? []
  const first = runs.find((r) => r.length >= 3) ?? runs[0] ?? ''
  return first
}

function people(author: string | null | undefined): string[] {
  return (author ?? '')
    .toLowerCase()
    .split(/\s*(?:,|&|\/|;|\band\b|\|)\s*/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/** True when two author strings share at least one person (or either is blank). */
export function authorsCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = people(a)
  const pb = people(b)
  if (pa.length === 0 || pb.length === 0) return true
  return pa.some((p) => pb.includes(p))
}

export interface SongIdentity { ccli?: string | null; author?: string | null }

/**
 * Given a song that matched by TITLE, is it the same song?
 *  - both have CCLI numbers → same only if the numbers are equal
 *  - otherwise → same unless both list authors with nobody in common
 * Many worship songs share titles ("Holy Spirit", "Forever", "Glorious"), and
 * telling the operator a different song is "already in your library" puts the
 * wrong lyrics up on Sunday.
 */
export function titleMatchIsSameSong(incoming: SongIdentity, existing: SongIdentity): boolean {
  const a = normalizeCcli(incoming.ccli)
  const b = normalizeCcli(existing.ccli)
  if (a && b) return a === b
  return authorsCompatible(incoming.author, existing.author)
}
