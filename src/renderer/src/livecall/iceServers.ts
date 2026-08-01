// Shared by every WebRTC peer connection in Live Call and the room feed.
// Tailscale host candidates are the real path for both features; this STUN
// entry is a best-effort fallback and is not required for the tailnet to work.
export const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
