// Next/Prev decision table for one live track (processIntent in index.ts).
// Pure so every mode's behaviour is pinned by liveNav.test.ts.
//
// QA B3: Prev during a countdown matched the generic "un-blank" branch
// (mode !== 'lyrics'), which cleared the timer and flipped the track to
// 'lyrics' — freezing "4:57" on every screen. Next already had a countdown
// branch; Prev now mirrors it.

export interface NavInput {
  mode: string
  hasDeck: boolean
  hasSermonSlides: boolean
  index: number
  lastIndex: number
  /** Nothing has gone live on this track yet this session (QA B2-N3). */
  pristine?: boolean
}

export type NavAction =
  /** Move within the current item's slides. */
  | { kind: 'step'; delta: 1 | -1 }
  /** Black/logo were operator-blanked: back to the slide (clears any countdown). */
  | { kind: 'unblank' }
  /** Go to the adjacent go-live item; if there is none, `fallback`. */
  | { kind: 'adjacent'; dir: 1 | -1; fallback: 'logo' | 'logo-after-countdown' | 'none' }
  /** Nothing live yet: Next starts the service on its first go-live item. */
  | { kind: 'start' }
  /** Nothing to do (Prev with nothing live). */
  | { kind: 'none' }

export function planNav(dir: 1 | -1, s: NavInput): NavAction {
  // QA B2-N3: with nothing live yet, Space/N/→ did nothing visible while the
  // hidden index of the startup placeholder crept up (0→11), so the first
  // "Next" of the morning was swallowed. Next now starts the service; Prev
  // does nothing (and neither touches the index).
  if (s.pristine) return dir === 1 ? { kind: 'start' } : { kind: 'none' }
  // A countdown/welcome is one continuous view. Next moves on; with nothing
  // after it, go to the logo rather than strand the frozen timer value as a
  // lyric slide. Prev moves back; with nothing before it, the press is ignored
  // and the countdown keeps running.
  if (s.mode === 'countdown') return { kind: 'adjacent', dir, fallback: dir === 1 ? 'logo-after-countdown' : 'none' }
  // A live call is one continuous view too (see processIntent's comment).
  if (s.mode === 'livecall') return { kind: 'adjacent', dir, fallback: 'logo' }
  // QA B3-N8: an announcement card is content, not a blank — the "un-blank"
  // branch below redrew it as a lyric slide (title dropped) and ate the press.
  // It is one card: move on, or stay put at the end of the service.
  // QA B4-N2: but an announcement BLOCK (several announcements, one item)
  // loads a generated deck — that steps through its slides like any deck
  // (below) and only moves on after the last one. Checking the mode alone
  // skipped every announcement after the first while the stage showed NEXT.
  if (s.mode === 'announcement' && !s.hasDeck && !s.hasSermonSlides) return { kind: 'adjacent', dir, fallback: 'none' }
  // Decks and verses-sermons advance on their own index regardless of mode
  // (a sermon deliberately sits at 'logo'), so only plain blanked content
  // un-blanks here.
  if (s.mode !== 'lyrics' && !s.hasDeck && !s.hasSermonSlides) return { kind: 'unblank' }
  if (dir === 1 && s.index < s.lastIndex) return { kind: 'step', delta: 1 }
  if (dir === -1 && s.index > 0) return { kind: 'step', delta: -1 }
  return { kind: 'adjacent', dir, fallback: 'none' }
}
