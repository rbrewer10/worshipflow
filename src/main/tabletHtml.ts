export const TABLET_PORT = 3691

export const TABLET_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no, viewport-fit=cover">
<title>WorshipFlow Stage</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#060912;color:#fff;font-family:-apple-system,system-ui,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow:hidden;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
body{display:flex;flex-direction:column}

#hdr{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#0d1420;border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0}
#hdr-l{display:flex;flex-direction:column;gap:1px}
#hdr-title{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#475569}
#hdr-sub{font-size:14px;font-weight:600;color:#cbd5e1}
#hdr-r{display:flex;align-items:center;gap:10px}
#clock{font-family:monospace;font-size:16px;font-weight:700;color:#94a3b8}
#dot{width:9px;height:9px;border-radius:50%;background:#ef4444;transition:background .3s;flex-shrink:0}
#dot.ok{background:#60a5fa}

#msg{display:none;align-items:center;gap:12px;padding:14px 18px;background:#fbbf24;color:#000;flex-shrink:0;animation:msgpulse 1.1s ease-in-out infinite}
#msg.on{display:flex}
#msg-icon{font-size:26px;animation:msgblink .9s step-start infinite;flex-shrink:0}
#msg-txt{flex:1;font-size:22px;font-weight:800;line-height:1.2;word-break:break-word}
#msg-x{flex-shrink:0;background:rgba(0,0,0,.22);border:none;color:#000;font-size:15px;font-weight:800;padding:8px 14px;border-radius:8px;cursor:pointer}
@keyframes msgpulse{0%,100%{box-shadow:inset 0 0 0 0 rgba(0,0,0,0)}50%{box-shadow:inset 0 0 0 5px rgba(0,0,0,.4)}}
@keyframes msgblink{0%,100%{opacity:1}50%{opacity:.12}}

#cur-wrap{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;overflow:hidden}
#cur{font-size:clamp(26px,8vw,64px);font-weight:800;line-height:1.25;color:#fff;white-space:pre-line;word-break:break-word}
#cur.dim{color:#1e293b}
#cur.logo-mode{color:#60a5fa;font-size:clamp(22px,6vw,44px)}

#nxt-wrap{flex-shrink:0;padding:10px 20px 12px;border-top:1px solid rgba(255,255,255,.07);background:#0a0f1a}
#nxt-lbl{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#334155;margin-bottom:4px}
#nxt{font-size:clamp(14px,4vw,22px);color:#475569;white-space:pre-line;word-break:break-word}

#notes-wrap{flex-shrink:0;padding:10px 20px;background:rgba(245,158,11,.07);border-top:1px solid rgba(245,158,11,.18);display:none}
#notes-wrap.on{display:block}
#notes-lbl{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#b45309;margin-bottom:4px}
#notes{font-size:clamp(13px,3.5vw,19px);color:#fcd34d;white-space:pre-wrap}

#strip{flex-shrink:0;display:flex;gap:6px;overflow-x:auto;padding:8px 10px;border-top:1px solid rgba(255,255,255,.07);background:rgba(0,0,0,.2);scrollbar-width:none}
#strip::-webkit-scrollbar{display:none}
.si{flex-shrink:0;padding:6px 13px;border-radius:22px;font-size:12px;font-weight:600;white-space:nowrap;cursor:pointer;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.03);color:#475569;user-select:none;transition:background .1s}
.si.live{background:rgba(52,211,153,.12);border-color:rgba(52,211,153,.25);color:#60a5fa}
.si:active{opacity:.65}

#ctrl{flex-shrink:0;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:12px 14px;padding-bottom:max(16px,env(safe-area-inset-bottom));background:#0d1420;border-top:1px solid rgba(255,255,255,.08)}
.cb{padding:24px 10px;border-radius:16px;border:2px solid rgba(255,255,255,.1);background:rgba(255,255,255,.07);color:#fff;font-size:20px;font-weight:800;cursor:pointer;text-align:center;user-select:none;transition:transform .1s,background .1s,border-color .1s;-webkit-tap-highlight-color:transparent;min-height:60px;display:flex;align-items:center;justify-content:center}
.cb:active{transform:scale(.96);background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.2)}
.cb-next{background:rgba(52,211,153,.15);border-color:rgba(52,211,153,.3);color:#3b82f6;font-weight:900}
.cb-next:active{background:rgba(52,211,153,.25);border-color:rgba(52,211,153,.4)}
.cb-black{background:rgba(0,0,0,.6);border-color:rgba(0,0,0,.4);font-size:18px}
.cb-black:active{background:rgba(0,0,0,.7)}
.cb-logo{background:rgba(59,130,246,.15);border-color:rgba(59,130,246,.3);color:#3b82f6;font-size:18px}
.cb-logo:active{background:rgba(59,130,246,.25);border-color:rgba(59,130,246,.4)}
</style>
</head>
<body>

<div id="hdr">
  <div id="hdr-l">
    <div id="hdr-title">Snow Hill Church</div>
    <div id="hdr-sub">WorshipFlow</div>
  </div>
  <div id="hdr-r">
    <div id="clock">--:-- --</div>
    <div id="dot" title="Connection status"></div>
  </div>
</div>

<div id="msg">
  <span id="msg-icon">&#128226;</span>
  <span id="msg-txt"></span>
  <button id="msg-x" onclick="dismissMsg()">Got it</button>
</div>

<div id="cur-wrap">
  <div id="cur">Connecting&#8230;</div>
</div>

<div id="nxt-wrap">
  <div id="nxt-lbl">Next</div>
  <div id="nxt">&#8212;</div>
</div>

<div id="notes-wrap">
  <div id="notes-lbl">&#128203; Notes</div>
  <div id="notes"></div>
</div>

<div id="strip"></div>

<div id="ctrl">
  <button class="cb" onclick="send('prev')">&#9664; Prev</button>
  <button class="cb cb-next" onclick="send('next')">Next &#9654;</button>
  <button class="cb cb-black" onclick="send('black')">&#9632; Black</button>
  <button class="cb cb-logo" onclick="send('logo')">&#10013; Logo</button>
</div>

<script>
var elCur = document.getElementById('cur')
var elNxt = document.getElementById('nxt')
var elNxtW = document.getElementById('nxt-wrap')
var elNotes = document.getElementById('notes')
var elNotesW = document.getElementById('notes-wrap')
var elStrip = document.getElementById('strip')
var elSub = document.getElementById('hdr-sub')
var elClock = document.getElementById('clock')
var elDot = document.getElementById('dot')
var elMsg = document.getElementById('msg')
var elMsgTxt = document.getElementById('msg-txt')
var liveId = null
var ws = null
var msgDismissed = null

function dismissMsg() {
  msgDismissed = elMsgTxt.textContent
  elMsg.className = ''
  // Clear the message everywhere (operator screen, stage window, all tablets).
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'clearStageMessage' }))
}

function pad(n) { return String(n).padStart(2, '0') }
function tick() {
  var d = new Date()
  var h = d.getHours(), m = d.getMinutes(), s = d.getSeconds()
  var ap = h >= 12 ? 'PM' : 'AM'
  elClock.textContent = (h % 12 || 12) + ':' + pad(m) + ':' + pad(s) + ' ' + ap
}
tick()
setInterval(tick, 1000)

function connect() {
  var wsUrl = 'ws://' + location.host
  console.log('[tablet] connecting to:', wsUrl)
  ws = new WebSocket(wsUrl)
  ws.onopen = function() {
    console.log('[tablet] connected!')
    elDot.className = 'ok'
  }
  ws.onclose = function() {
    console.log('[tablet] disconnected, reconnecting in 2s...')
    elDot.className = ''
    setTimeout(connect, 2000)
  }
  ws.onerror = function(err) {
    console.log('[tablet] error:', err)
    elDot.className = ''
  }
  ws.onmessage = function(e) {
    try { apply(JSON.parse(e.data)) } catch(x) { console.log('[tablet] parse error:', x) }
  }
}

function apply(msg) {
  if (msg.type !== 'state') return
  var s = msg.state
  console.log('[tablet] state update:', { mode: s.mode, index: s.index, line: s.line, total: s.total })
  liveId = s.liveServiceItemId

  var mode = s.mode
  if (mode === 'black') {
    elCur.textContent = 'Screen is black'
    elCur.className = 'dim'
  } else if (mode === 'logo') {
    elCur.textContent = '+ SNOW HILL'
    elCur.className = 'logo-mode'
  } else if (mode === 'countdown') {
    elCur.textContent = s.line || ''
    elCur.className = ''
  } else {
    elCur.textContent = s.line || '—'
    elCur.className = ''
  }

  var showNext = mode !== 'black' && mode !== 'logo' && mode !== 'countdown'
  elNxtW.style.display = showNext ? '' : 'none'
  elNxt.textContent = s.next || '—'

  var title = s.songTitle || 'WorshipFlow'
  var prog = (s.total > 0) ? (' · ' + (s.index + 1) + ' of ' + s.total) : ''
  elSub.textContent = title + prog

  var notes = msg.notes || ''
  elNotes.textContent = notes
  elNotesW.className = notes ? 'on' : ''

  // Stage message banner — auto-shows new messages, stays dismissed until it changes.
  var sm = s.stageMessage || ''
  if (msgDismissed !== sm) msgDismissed = null
  elMsgTxt.textContent = sm
  elMsg.className = (sm && sm !== msgDismissed) ? 'on' : ''

  renderStrip(msg.items || [])
}

function renderStrip(items) {
  elStrip.innerHTML = ''
  for (var i = 0; i < items.length; i++) {
    var item = items[i]
    var btn = document.createElement('button')
    btn.className = 'si' + (item.id === liveId ? ' live' : '')
    btn.dataset.id = item.id
    var icon = item.type === 'song' ? '🎵' :
               item.type === 'scripture' ? '📖' :
               item.type === 'text' ? '📝' :
               item.type === 'countdown' ? '⏱' : '🖼'
    btn.textContent = icon + ' ' + item.title
    ;(function(id) { btn.onclick = function() { loadItem(id) } })(item.id)
    elStrip.appendChild(btn)
  }
  var active = elStrip.querySelector('.live')
  if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
}

function send(intent) {
  if (ws && ws.readyState === 1) {
    console.log('[tablet] sending intent:', intent)
    ws.send(JSON.stringify({ type: 'intent', intent: intent }))
  } else {
    console.log('[tablet] NOT connected, ws:', ws, 'readyState:', ws?.readyState)
  }
}

function loadItem(id) {
  if (ws && ws.readyState === 1) {
    console.log('[tablet] loading item:', id)
    ws.send(JSON.stringify({ type: 'loadItem', itemId: id }))
  }
}

connect()
</script>
</body>
</html>`
