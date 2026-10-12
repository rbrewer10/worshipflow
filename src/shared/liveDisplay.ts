import type { LiveState } from './types'

// What the audience output should draw for a broadcast LiveState. Pure so the
// decision Output.tsx makes on every broadcast is unit-testable.
//
// QA A-C1 (regression from PR #1): the ticker was detected with
// `mode === 'lyrics' && songTitle === 'Announcement'`, but doLoadText defaulted
// EVERY untitled text item's title to 'Announcement' — so PowerPoint-imported
// slides, Replace-item cards and any untitled card showed only a scrolling
// strip on an empty projector. The ticker is now an explicit flag.
export type AudienceKind = 'countdown' | 'ticker' | 'lyrics' | 'announcement' | 'other'

export function audienceKind(s: Pick<LiveState, 'mode' | 'isTicker'>): AudienceKind {
  if (s.mode === 'countdown') return 'countdown'
  if (s.mode === 'lyrics' && s.isTicker === true) return 'ticker'
  if (s.mode === 'lyrics') return 'lyrics'
  if (s.mode === 'announcement') return 'announcement'
  return 'other'
}

/** Slides for a text card: optional title slide, then one per blank-line paragraph. */
export function textCardSlides(title: string, body: string): string[] {
  const lines: string[] = []
  if (title) lines.push(title)
  body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).forEach((b) => lines.push(b))
  return lines.length ? lines : [title]
}

/**
 * The single scrolling line for a ticker announcement: the BODY, whitespace
 * collapsed (QA A-H2: it used to scroll the title slide, i.e. the literal word
 * "Announcement", until someone pressed Next).
 */
export function tickerLine(body: string): string {
  return body.replace(/\s+/g, ' ').trim()
}

/**
 * The NEXT preview text (stage, Volunteer, tablet, pulpit). When the next slide
 * belongs under a different heading — the next announcement in a block — its
 * title leads, so "Next" never shows one announcement's body as if it were
 * part of the current one (QA B5-N1).
 */
export function nextPreview(s: Pick<LiveState, 'next' | 'songTitle' | 'nextTitle'>): string {
  const next = s.next ?? ''
  if (!next) return ''
  const title = s.nextTitle ?? ''
  return title && title !== s.songTitle ? `${title} — ${next}` : next
}
