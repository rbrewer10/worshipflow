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
export function textHideApplies(mode: string): boolean {
  return mode !== 'countdown' && mode !== 'image'
}
