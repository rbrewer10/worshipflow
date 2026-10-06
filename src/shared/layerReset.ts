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
