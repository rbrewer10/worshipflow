/**
 * Live Call — room feed viewer page.
 *
 * What the preacher's second tablet loads: a full-bleed video of the room,
 * nothing else. Joins the 'room-feed' room as a viewer — the same role a
 * zone screen already plays for the outbound call — and plays whatever
 * track arrives. No camera, no microphone; the only control is mute, and
 * audio starts muted because mobile browsers block autoplay-with-sound
 * without a user gesture regardless, so defaulting to muted avoids a silent
 * failure reading as "this is broken."
 */

const VIEWER_CSS = `
* { box-sizing: border-box; }
html, body {
  margin: 0; height: 100%; background: #000; overflow: hidden;
  -webkit-user-select: none; user-select: none;
  font-family: -apple-system, system-ui, "Segoe UI", sans-serif;
}
#app { height: 100dvh; position: relative; }
video#feed { width: 100%; height: 100%; object-fit: contain; background: #000; }
.waiting {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: #8b909c; font-size: 15px; text-align: center; padding: 0 32px;
}
.mute-btn {
  position: absolute; right: max(16px, env(safe-area-inset-right)); bottom: max(16px, env(safe-area-inset-bottom));
  padding: 10px 16px; border-radius: 12px; border: none; background: rgba(255,255,255,.14);
  color: #e8e9ec; font-size: 13px; font-weight: 600; -webkit-tap-highlight-color: transparent;
}
.hidden { display: none !important; }
`

const VIEWER_MARKUP = `
<div id="app">
  <video id="feed" autoplay playsinline muted></video>
  <div id="waiting" class="waiting">Waiting for the room feed to start&hellip;</div>
  <button id="btn-mute" class="mute-btn" aria-pressed="true">Unmute</button>
</div>
`

const VIEWER_JS = String.raw`
const els = {
  feed: document.getElementById('feed'),
  waiting: document.getElementById('waiting'),
  btnMute: document.getElementById('btn-mute'),
};

let config = null;
let ws = null;
let pc = null;
let attempt = 0;
let timer = null;

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
];

function connect() {
  if (timer) { clearTimeout(timer); timer = null; }
  ws = new WebSocket(config.url);

  ws.addEventListener('open', () => {
    attempt = 0;
    ws.send(JSON.stringify({ type: 'hello', token: config.token, role: 'viewer', room: config.room }));
  });

  ws.addEventListener('message', async (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'offer') {
      if (pc) pc.close();
      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      pc.addEventListener('track', (e) => {
        els.feed.srcObject = e.streams[0] || new MediaStream([e.track]);
        els.waiting.classList.add('hidden');
      });
      pc.addEventListener('icecandidate', (e) => {
        if (e.candidate) sendSignal({ type: 'ice-candidate', candidate: e.candidate });
      });

      try {
        await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({ type: 'answer', sdp: answer.sdp });
      } catch (e) { /* the sender will re-offer */ }
    } else if (msg.type === 'ice-candidate' && pc && msg.candidate) {
      try { await pc.addIceCandidate(msg.candidate); } catch (e) { /* benign */ }
    }
  });

  ws.addEventListener('close', () => {
    attempt++;
    timer = setTimeout(connect, Math.min(1000 * Math.pow(2, attempt), 15000));
  });
}

function sendSignal(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

els.btnMute.addEventListener('click', () => {
  const nowMuted = !els.feed.muted;
  els.feed.muted = nowMuted;
  els.btnMute.setAttribute('aria-pressed', String(nowMuted));
  els.btnMute.textContent = nowMuted ? 'Unmute' : 'Mute';
});

(function boot() {
  config = { url: __ROOMFEED_URL__, token: __ROOMFEED_TOKEN__, room: __ROOMFEED_ROOM__ };
  connect();
})();

if ('wakeLock' in navigator) {
  let wakeLock = null;
  const requestWakeLock = async () => {
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* ignore */ }
  };
  requestWakeLock();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestWakeLock();
  });
}
`

export function roomFeedViewerHtml(url: string, token: string, room: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#000000">
<title>WorshipFlow Room Feed</title>
<style>${VIEWER_CSS}</style>
</head>
<body>
${VIEWER_MARKUP}
<script>
const __ROOMFEED_URL__ = ${JSON.stringify(url)};
const __ROOMFEED_TOKEN__ = ${JSON.stringify(token)};
const __ROOMFEED_ROOM__ = ${JSON.stringify(room)};
${VIEWER_JS}
</script>
</body>
</html>`
}
