// Live-state broadcasts carry a sequence number (main's broadcastSeq). A
// window must never draw an older payload over a newer one it has already
// drawn — QA B6-N1: webContents.send can drain the microtask queue, so a
// loader that finishes inside one broadcast's send loop (loadDeckOnto right
// after a clicked Go live) delivered its numbered deck text first and the
// outer, pre-deck payload last; the projector, the Stage window and the tablet
// then kept the un-numbered first slide until the operator moved.
//
// Returns a filter for one window: true = draw it, false = stale, drop it.
// Payloads without a seq (older main process, browser mock) always pass.
// Equal seqs pass, so several listeners in one window all see the same payload.
export function stateOrderGuard(): (seq: number | undefined) => boolean {
  let last = -Infinity
  return (seq) => {
    if (typeof seq !== 'number' || !Number.isFinite(seq)) return true
    if (seq < last) return false
    last = seq
    return true
  }
}
