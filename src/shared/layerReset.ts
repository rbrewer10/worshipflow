// When a new item goes live, should a "Clear lyrics" (C) be undone? (QA B2, A-N4)
//
// B2: a C pressed for the PREVIOUS item used to carry over to the next Go
// Live, so the room got no words. Loaders now clear it — but an async load
// (an online Bible translation can take up to 4 s per reference) cleared a C
// the operator pressed AFTER Go Live, while the verse was still on its way,
// and the verse then appeared anyway (A-N4).
//
// Each track counts loads (loadGeneration, bumped when a load starts). C
// records the count at the moment it was pressed. A load clears it only if C
// was pressed before that load started.
export function shouldClearHiddenText(hiddenAtGeneration: number, loadStartGeneration: number): boolean {
  return hiddenAtGeneration < loadStartGeneration
}

// QA A2-N2, same idea for Black (B) and Logo (L): pressed while an online verse
// is still on its way, they used to be undone when it landed, because the
// loader set mode 'lyrics' unconditionally. Black/Logo record the generation
// they were pressed at; an async load keeps the operator's Black/Logo if it was
// pressed after that load started (the content still loads, so un-blanking
// shows the new verse). Black pressed BEFORE Go Live is still cleared by the
// new item, as before.
export function modeAfterAsyncLoad<M extends string>(currentMode: M | 'black' | 'logo', blankedAtGeneration: number, loadStartGeneration: number): M | 'black' | 'logo' | 'lyrics' {
  if ((currentMode === 'black' || currentMode === 'logo') && blankedAtGeneration >= loadStartGeneration) return currentMode
  return 'lyrics'
}

// QA B2-N11: C ("Clear lyrics") during a countdown lit "Lyrics off" but changed
// nothing on screen (the countdown/picture has no lyric layer), then the hidden
// state silently carried into the next lyric item. C now only applies where
// there are words to hide; elsewhere it's ignored with a short notice.
//
// QA B3-N5: deciding by mode alone missed pictures (they run in mode 'lyrics'),
// the sermon card (mode 'logo') and announcements (their own card, which the
// output never hides) — so it is decided by the live item's type too.
export type TextHideBlocker = 'countdown' | 'picture' | 'sermon' | 'announcement' | 'call'

export function textHideBlocker(mode: string, itemType?: string | null): TextHideBlocker | null {
  if (mode === 'countdown' || itemType === 'countdown' || itemType === 'welcome') return 'countdown'
  if (mode === 'image' || itemType === 'image' || itemType === 'video') return 'picture'
  if (itemType === 'sermon') return 'sermon'
  if (mode === 'announcement' || itemType === 'announcement') return 'announcement'
  if (mode === 'livecall' || itemType === 'livecall') return 'call'
  return null
}

export function textHideApplies(mode: string, itemType?: string | null): boolean {
  return textHideBlocker(mode, itemType) === null
}

const BLOCKER_TEXT: Record<TextHideBlocker, string> = {
  countdown: 'a countdown has none',
  picture: 'a picture or video has none',
  sermon: 'the sermon card has none',
  announcement: 'an announcement is shown as its own card',
  call: 'a live call has none',
}

export function textHideNotice(blocker: TextHideBlocker): string {
  return `C hides lyrics — ${BLOCKER_TEXT[blocker]}. Press B for black or L for the logo.`
}
