/**
 * Live Call — phone client page.
 *
 * The preacher's PWA, served from WorshipFlow's own HTTP server. Adapted from
 * the worshipflow-livecall drop-in package with the three-field setup screen
 * removed: the token is 64 hex characters and this is a phone keyboard, so the
 * config is baked in and the phone is provisioned by scanning a QR code.
 *
 * The reconnect/ICE-restart logic below is deliberately untouched from the
 * original — it is the reason this survives hotel wifi, and it is the part
 * least worth "improving" without a bad network to test against.
 */

const PHONE_CSS = `
:root {
  --bg: #14161a;
  --panel: #1c1f26;
  --panel-border: #2a2e38;
  --ink: #e8e9ec;
  --ink-dim: #8b909c;
  --live: #e5484d;
  --connecting: #f2a93b;
  --idle: #565c68;
  --mono: ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace;
  --sans: -apple-system, system-ui, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
html, body {
  margin: 0; height: 100%;
  background: var(--bg); color: var(--ink);
  font-family: var(--sans);
  overscroll-behavior: none;
  -webkit-user-select: none; user-select: none;
}
#app { height: 100dvh; display: flex; flex-direction: column; }
.statusbar {
  display: flex; align-items: center; gap: 10px;
  padding: max(12px, env(safe-area-inset-top)) 16px 10px;
  background: var(--panel); border-bottom: 1px solid var(--panel-border);
}
.tally { width: 12px; height: 12px; border-radius: 50%; background: var(--idle); flex-shrink: 0; }
.tally.connecting { background: var(--connecting); animation: pulse 1s ease-in-out infinite; }
.tally.live { background: var(--live); box-shadow: 0 0 8px 1px rgba(229,72,77,.6); }
@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
.status-text { font-size: 15px; font-weight: 600; letter-spacing: .01em; }
.elapsed { margin-left: auto; font-family: var(--mono); font-size: 14px; color: var(--ink-dim); }
.preview-wrap { flex: 1; position: relative; background: #000; overflow: hidden; }
video#local-preview { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
.no-camera {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: var(--ink-dim); font-size: 14px; text-align: center; padding: 0 32px;
}
.controls {
  background: var(--panel); border-top: 1px solid var(--panel-border);
  padding: 14px 16px max(14px, env(safe-area-inset-bottom));
  display: flex; flex-direction: column; gap: 12px;
}
.row { display: flex; gap: 10px; }
button { font-family: var(--sans); border: none; border-radius: 12px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.btn-toggle { flex: 1; background: #262a33; color: var(--ink); padding: 14px 0; font-size: 15px; font-weight: 500; }
.btn-toggle[aria-pressed="true"] { background: #3a3020; color: #f2c66d; }
.btn-main { width: 100%; padding: 18px 0; font-size: 17px; font-weight: 700; letter-spacing: .02em; background: var(--live); color: #fff; }
.btn-main.connecting { background: var(--connecting); color: #14161a; }
.btn-main.live { background: #3a1f21; color: var(--live); border: 1px solid var(--live); }
.btn-main:disabled { opacity: .6; }
.telemetry { font-family: var(--mono); font-size: 11px; color: var(--ink-dim); padding-top: 2px; min-height: 14px; }
.hidden { display: none !important; }
`

const PHONE_MARKUP = `
<div id="app">
  <div id="call-screen">
    <div class="statusbar">
      <div id="tally" class="tally"></div>
      <div id="status-text" class="status-text">Standby</div>
      <div id="elapsed" class="elapsed"></div>
    </div>
    <div class="preview-wrap">
      <video id="local-preview" autoplay playsinline muted></video>
      <div id="no-camera" class="no-camera hidden">Camera off</div>
    </div>
    <div class="controls">
      <div class="row">
        <button id="btn-mic" class="btn-toggle" aria-pressed="false">Mic on</button>
        <button id="btn-cam" class="btn-toggle" aria-pressed="false">Camera on</button>
        <button id="btn-flip" class="btn-toggle">Flip</button>
      </div>
      <button id="btn-main" class="btn-main">Go live</button>
      <div id="telemetry" class="telemetry"></div>
    </div>
  </div>
</div>
`

const PHONE_JS = String.raw`
const els = {
  tally: document.getElementById('tally'),
  statusText: document.getElementById('status-text'),
  elapsed: document.getElementById('elapsed'),
  preview: document.getElementById('local-preview'),
  noCamera: document.getElementById('no-camera'),
  btnMic: document.getElementById('btn-mic'),
  btnCam: document.getElementById('btn-cam'),
  btnFlip: document.getElementById('btn-flip'),
  btnMain: document.getElementById('btn-main'),
  telemetry: document.getElementById('telemetry'),
};

let config = null;
let ws = null;
let wsReconnectAttempt = 0;
let wsReconnectTimer = null;
let intentionallyClosing = false;

let pc = null;
let localStream = null;
let currentFacingMode = 'user';
let micEnabled = true;
let camEnabled = true;

let liveStartedAt = null;
let elapsedTimer = null;
let statsTimer = null;

let isCallActive = false;

const ICE_SERVERS = [
  // Tailscale host candidates are the real path; this STUN entry is just a
  // best-effort fallback and is not required for the tailnet to work.
  { urls: 'stun:stun.l.google.com:19302' },
];

// --------------------------------------------------------------- status --

function setStatus(state, text) {
  els.tally.className = 'tally ' + state;
  els.statusText.textContent = text;
  els.btnMain.className = 'btn-main ' + (state === 'live' ? 'live' : state === 'connecting' ? 'connecting' : '');
  els.btnMain.textContent = state === 'live' ? 'End call' : state === 'connecting' ? 'Connecting…' : 'Go live';

  if (state === 'live') {
    if (!liveStartedAt) liveStartedAt = Date.now();
    startElapsedTimer();
  } else {
    liveStartedAt = null;
    stopElapsedTimer();
    els.elapsed.textContent = '';
  }
}

function startElapsedTimer() {
  stopElapsedTimer();
  elapsedTimer = setInterval(() => {
    const secs = Math.floor((Date.now() - liveStartedAt) / 1000);
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    els.elapsed.textContent = m + ':' + s;
  }, 500);
}

function stopElapsedTimer() {
  if (elapsedTimer) clearInterval(elapsedTimer);
  elapsedTimer = null;
}

function setTelemetry(text) {
  els.telemetry.textContent = text;
}

// --------------------------------------------------------------- camera --

async function initCamera() {
  // Browsers delete navigator.mediaDevices entirely on an insecure origin, so
  // calling getUserMedia there throws "undefined is not an object" — a message
  // that tells the preacher nothing. Check first and say what is actually wrong.
  if (!window.isSecureContext || !navigator.mediaDevices) {
    els.noCamera.classList.remove('hidden');
    els.noCamera.innerHTML =
      '<div style="max-width:280px"><b>The camera cannot be used on this address.</b><br><br>' +
      'This page is open over <code>' + location.protocol + '//</code>, and phones only allow ' +
      'camera access over <b>https</b>.<br><br>' +
      'Open the Tailscale address instead (it starts with <code>https://</code>). ' +
      'On the church computer run:<br><code>tailscale serve --bg ' + (location.port || '3691') + '</code></div>';
    els.btnMain.disabled = true;
    return;
  }
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: currentFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    els.preview.srcObject = localStream;
    els.noCamera.classList.add('hidden');
  } catch (err) {
    els.noCamera.classList.remove('hidden');
    els.noCamera.textContent = 'Camera/mic access failed: ' + err.message;
  }
}

async function flipCamera() {
  currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
  const oldStream = localStream;
  try {
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: currentFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    const newVideoTrack = newStream.getVideoTracks()[0];

    if (pc) {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) await sender.replaceTrack(newVideoTrack);
    }

    const audioTrack = oldStream.getAudioTracks()[0];
    localStream = new MediaStream([newVideoTrack, audioTrack]);
    els.preview.srcObject = localStream;
    oldStream.getVideoTracks().forEach((t) => t.stop());
  } catch (err) {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user'; // revert
    alert('Could not flip camera: ' + err.message);
  }
}

els.btnMic.addEventListener('click', () => {
  micEnabled = !micEnabled;
  if (localStream) localStream.getAudioTracks().forEach((t) => (t.enabled = micEnabled));
  els.btnMic.setAttribute('aria-pressed', String(!micEnabled));
  els.btnMic.textContent = micEnabled ? 'Mic on' : 'Mic muted';
});

els.btnCam.addEventListener('click', () => {
  camEnabled = !camEnabled;
  if (localStream) localStream.getVideoTracks().forEach((t) => (t.enabled = camEnabled));
  els.btnCam.setAttribute('aria-pressed', String(!camEnabled));
  els.btnCam.textContent = camEnabled ? 'Camera on' : 'Camera off';
});

els.btnFlip.addEventListener('click', flipCamera);

els.btnMain.addEventListener('click', () => {
  if (isCallActive) { endCall(); } else { startCall(); }
});

// ------------------------------------------------------------ signaling --

function connectSignaling() {
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }

  ws = new WebSocket(config.url);

  ws.addEventListener('open', () => {
    wsReconnectAttempt = 0;
    ws.send(JSON.stringify({ type: 'hello', token: config.token, role: 'caller', room: config.room }));
  });

  ws.addEventListener('message', async (event) => {
    const msg = JSON.parse(event.data);

    switch (msg.type) {
      case 'joined':
        setTelemetry('signaling: joined room "' + config.room + '"' + (msg.peerPresent ? ' — console online' : ' — waiting for console'));
        if (msg.peerPresent && isCallActive) await createAndSendOffer();
        break;

      case 'peer-joined':
        setTelemetry('signaling: console came online');
        if (isCallActive) await createAndSendOffer();
        break;

      case 'peer-left':
        setTelemetry('signaling: console went offline — will retry when it returns');
        break;

      case 'answer':
        if (pc) await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
        break;

      case 'ice-candidate':
        if (pc && msg.candidate) {
          try { await pc.addIceCandidate(msg.candidate); } catch (e) { /* benign if call already ended */ }
        }
        break;

      case 'replaced':
        break;

      case 'error':
        setTelemetry('signaling error: ' + msg.reason);
        break;
    }
  });

  ws.addEventListener('close', () => {
    if (intentionallyClosing) return;
    scheduleWsReconnect();
  });

  ws.addEventListener('error', () => { /* 'close' fires right after */ });
}

function scheduleWsReconnect() {
  wsReconnectAttempt++;
  const delay = Math.min(1000 * Math.pow(2, wsReconnectAttempt), 15000);
  setTelemetry('signaling: disconnected — retrying in ' + Math.round(delay / 1000) + 's');
  wsReconnectTimer = setTimeout(connectSignaling, delay);
}

function sendSignal(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

// -------------------------------------------------------------- webrtc --

function createPeerConnection() {
  const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  localStream.getTracks().forEach((track) => conn.addTrack(track, localStream));

  conn.addEventListener('icecandidate', (event) => {
    if (event.candidate) sendSignal({ type: 'ice-candidate', candidate: event.candidate });
  });

  conn.addEventListener('connectionstatechange', () => {
    setTelemetry('webrtc: ' + conn.connectionState);

    if (conn.connectionState === 'connected') {
      setStatus('live', 'Live');
      startStatsPolling(conn);
    } else if (conn.connectionState === 'disconnected') {
      // Network blip — try ICE restart before treating this as a hard failure.
      setStatus('connecting', 'Reconnecting…');
      attemptIceRestart(conn);
    } else if (conn.connectionState === 'failed') {
      setStatus('connecting', 'Reconnecting…');
      stopStatsPolling();
      renegotiateFromScratch();
    } else if (conn.connectionState === 'closed') {
      stopStatsPolling();
    }
  });

  return conn;
}

let iceRestartAttempted = false;

async function attemptIceRestart(conn) {
  if (iceRestartAttempted) return;
  iceRestartAttempted = true;
  try {
    const offer = await conn.createOffer({ iceRestart: true });
    await conn.setLocalDescription(offer);
    sendSignal({ type: 'offer', sdp: offer.sdp });
  } catch (e) {
    renegotiateFromScratch();
  }
  setTimeout(() => { iceRestartAttempted = false; }, 5000);
}

async function renegotiateFromScratch() {
  if (!isCallActive) return;
  if (pc) pc.close();
  pc = createPeerConnection();
  await createAndSendOffer();
}

async function createAndSendOffer() {
  if (!pc) pc = createPeerConnection();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  sendSignal({ type: 'offer', sdp: offer.sdp });
}

function startStatsPolling(conn) {
  stopStatsPolling();
  let prevBytes = null, prevTime = null;
  statsTimer = setInterval(async () => {
    try {
      const stats = await conn.getStats();
      let outboundKbps = null;
      let rtt = null;
      stats.forEach((report) => {
        if (report.type === 'outbound-rtp' && report.kind === 'video' && report.bytesSent != null) {
          if (prevBytes != null && prevTime != null) {
            const bytesDelta = report.bytesSent - prevBytes;
            const timeDelta = (report.timestamp - prevTime) / 1000;
            if (timeDelta > 0) outboundKbps = Math.round((bytesDelta * 8) / timeDelta / 1000);
          }
          prevBytes = report.bytesSent;
          prevTime = report.timestamp;
        }
        if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.currentRoundTripTime != null) {
          rtt = Math.round(report.currentRoundTripTime * 1000);
        }
      });
      const parts = [];
      if (outboundKbps != null) parts.push(outboundKbps + ' kbps out');
      if (rtt != null) parts.push(rtt + 'ms rtt');
      if (parts.length) setTelemetry(parts.join(' · '));
    } catch (e) { /* stats can throw briefly during renegotiation */ }
  }, 3000);
}

function stopStatsPolling() {
  if (statsTimer) clearInterval(statsTimer);
  statsTimer = null;
}

// ---------------------------------------------------------- call control --

async function startCall() {
  if (!localStream) await initCamera();
  if (!localStream) return; // camera/mic permission failed

  isCallActive = true;
  setStatus('connecting', 'Connecting…');
  intentionallyClosing = false;
  connectSignaling();
  // Offer gets sent once signaling confirms the console is present.
}

function endCall() {
  isCallActive = false;
  intentionallyClosing = true;

  sendSignal({ type: 'bye' });

  if (pc) { pc.close(); pc = null; }
  stopStatsPolling();

  if (ws) { ws.close(); ws = null; }
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }

  setStatus('idle', 'Standby');
  setTelemetry('');
}

// ------------------------------------------------------------------ boot --

(function boot() {
  config = { url: __LIVECALL_URL__, token: __LIVECALL_TOKEN__, room: __LIVECALL_ROOM__ };
  initCamera();
})();

// Keep the screen awake while this tab is open, where supported.
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

export function phoneClientHtml(url: string, token: string, room: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#14161a">
<title>WorshipFlow Live Call</title>
<style>${PHONE_CSS}</style>
</head>
<body>
${PHONE_MARKUP}
<script>
const __LIVECALL_URL__ = ${JSON.stringify(url)};
const __LIVECALL_TOKEN__ = ${JSON.stringify(token)};
const __LIVECALL_ROOM__ = ${JSON.stringify(room)};
${PHONE_JS}
</script>
</body>
</html>`
}
