// The pastor's pulpit tablet: notes + verse when a sermon is live, the same
// content the Stage Monitor TV shows otherwise. Reuses the existing tablet
// WebSocket protocol (auth, state push, intent) wholesale — see tabletHtml.ts
// for the pattern this borrows: PIN gate, cached PIN in localStorage, the
// same {type:'auth'}/{type:'intent'} messages.
function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function pulpitHtml(churchName: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>${escHtml(churchName)} — Pulpit</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-user-select:none;user-select:none}
html,body{width:100%;height:100%;background:#0a0d10;color:#e8ebed;font-family:-apple-system,system-ui,sans-serif;overflow:hidden}
#root{display:flex;flex-direction:column;width:100vw;height:100vh}
#header{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 20px;font-size:14px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a939c;border-bottom:1px solid #1c2226}
#headerTitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#dot{width:9px;height:9px;border-radius:50%;background:#ef4444;transition:background .3s;flex-shrink:0}
#dot.ok{background:#60a5fa}
#split{flex:1;display:flex;min-height:0;transition:opacity .3s}
#notes,#verse{flex:1;padding:24px;overflow:auto;white-space:pre-line}
#notes{background:#12171b;border-right:2px solid #1c2226;font-size:22px;line-height:1.5}
#verse{background:#0a0d10;font-size:26px;line-height:1.55;font-weight:600}
#verseRef{font-size:15px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#8a939c;margin-bottom:12px}
#stage{flex:1;display:none;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center;transition:opacity .3s}
#stage.on{display:flex}
#split.hidden{display:none}
#stageLine{font-size:34px;font-weight:800;line-height:1.35}
#stageNext{margin-top:20px;font-size:18px;color:#8a939c}
#footer{flex:0 0 auto;display:flex;align-items:center;justify-content:center;gap:16px;padding:16px;border-top:1px solid #1c2226}
button.nav{font-size:18px;font-weight:700;padding:16px 32px;border-radius:12px;border:none;background:#1a2126;color:#e8ebed}
button.nav:active{background:#2a3238}
#progress{font-size:13px;color:#8a939c}
#pingate{position:fixed;inset:0;background:rgba(6,9,18,.96);display:none;align-items:center;justify-content:center;flex-direction:column;gap:14px;z-index:50;padding:20px}
#pingate.on{display:flex}
#pingate h2{font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8a939c}
#pin-input{font-size:30px;letter-spacing:.3em;text-align:center;width:220px;padding:14px 10px;border-radius:12px;border:2px solid #2a3238;background:#12171b;color:#fff}
#pin-err{color:#f87171;font-size:13px;min-height:16px}
#pin-go{padding:14px 40px;border-radius:12px;border:none;background:#34d399;color:#052e1d;font-weight:800;font-size:16px}
</style>
</head>
<body>
<div id="root">
  <div id="header">
    <span id="headerTitle">Not connected</span>
    <div id="dot" title="Connection status"></div>
  </div>
  <div id="split">
    <div id="notes"></div>
    <div id="verse"><div id="verseRef"></div><div id="verseText"></div></div>
  </div>
  <div id="stage">
    <div id="stageLine"></div>
    <div id="stageNext"></div>
  </div>
  <div id="footer">
    <button class="nav" onclick="send('prev')">&larr; Prev</button>
    <span id="progress"></span>
    <button class="nav" onclick="send('next')">Next &rarr;</button>
  </div>
</div>

<div id="pingate">
  <h2>Enter Pulpit PIN</h2>
  <input id="pin-input" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;" onkeydown="if(event.key==='Enter') submitPin()">
  <div id="pin-err"></div>
  <button id="pin-go" onclick="submitPin()">Unlock</button>
</div>

<script>
var ws = null
var authed = false
var cachedPin = localStorage.getItem('wf_pulpit_pin') || ''
var latestItems = []
var elDot = document.getElementById('dot')
var elSplit = document.getElementById('split')
var elStage = document.getElementById('stage')

// Marks the notes/verse content as possibly stale while disconnected — this is
// the pastor's own working tool, so (unlike the sanctuary zone screens) a
// frozen last-known frame must not read as live.
function setStale(isStale) {
  elSplit.style.opacity = isStale ? '0.4' : ''
  elStage.style.opacity = isStale ? '0.4' : ''
}
setStale(true)

function showPinGate(err) {
  document.getElementById('pingate').className = 'on'
  document.getElementById('pin-err').textContent = err || ''
  document.getElementById('pin-input').value = ''
  document.getElementById('pin-input').focus()
}
function hidePinGate() {
  document.getElementById('pingate').className = ''
}
function submitPin() {
  var v = document.getElementById('pin-input').value.trim()
  if (!v) return
  cachedPin = v
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'auth', pin: v }))
}

function send(intent) {
  if (!authed) { showPinGate(); return }
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'intent', intent: intent }))
}

function apply(msg) {
  if (msg.type === 'authResult') {
    if (msg.ok) {
      authed = true
      localStorage.setItem('wf_pulpit_pin', cachedPin)
      hidePinGate()
    } else {
      authed = false
      localStorage.removeItem('wf_pulpit_pin')
      showPinGate(msg.lockedOutMs ? 'Too many attempts — try again shortly' : 'Incorrect PIN')
    }
    return
  }
  if (msg.type !== 'state') return
  latestItems = msg.items || []
  var s = msg.state || {}
  var liveItem = latestItems.find(function (it) { return it.id === s.liveServiceItemId })
  var isSermon = !!liveItem && liveItem.type === 'sermon'
  document.getElementById('headerTitle').textContent = s.songTitle || 'Not live'
  document.getElementById('split').className = isSermon ? '' : 'hidden'
  document.getElementById('stage').className = isSermon ? '' : 'on'
  if (isSermon) {
    document.getElementById('notes').textContent = s.sermonNotes || ''
    document.getElementById('verseRef').textContent = s.sermonReference || ''
    document.getElementById('verseText').textContent = s.line || ''
    document.getElementById('progress').textContent = s.total > 1 ? (s.index + 1) + ' of ' + s.total : ''
  } else {
    document.getElementById('stageLine').textContent = s.line || ''
    document.getElementById('stageNext').textContent = s.next || ''
    document.getElementById('progress').textContent = ''
  }
}

function connect() {
  var proto = location.protocol === 'https:' ? 'wss' : 'ws'
  ws = new WebSocket(proto + '://' + location.host + '/')
  ws.onopen = function () {
    elDot.className = 'ok'
    setStale(false)
    if (cachedPin) ws.send(JSON.stringify({ type: 'auth', pin: cachedPin }))
    else showPinGate()
  }
  ws.onclose = function () {
    elDot.className = ''
    setStale(true)
    setTimeout(connect, 2000)
  }
  ws.onerror = function () {
    elDot.className = ''
    setStale(true)
    ws.close()
  }
  ws.onmessage = function (ev) {
    try { apply(JSON.parse(ev.data)) } catch (e) { /* ignore malformed */ }
  }
}
connect()
</script>
</body>
</html>`
}
