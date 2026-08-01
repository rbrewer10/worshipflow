// Whether the room feed (camera + mixer audio to the remote preacher's
// tablet) is currently capturing. A plain module-level flag, deliberately
// kept out of SoundCheckState: the two features' arbitration rule is "room
// feed always wins, unconditionally" — see the 2026-08-01 design spec for
// why this doesn't try to prove the two capture paths are fighting over the
// literal same device. sound-check-ipc.ts reads this to block Sound Check's
// own start; index.ts's wf:roomfeed:notifyCapturing handler is the only writer.
let roomFeedActive = false

export function setRoomFeedActive(active: boolean): void {
  roomFeedActive = active
}

export function isRoomFeedActive(): boolean {
  return roomFeedActive
}
