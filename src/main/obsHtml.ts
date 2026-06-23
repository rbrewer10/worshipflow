// Transparent lyrics overlay for OBS. Add as a Browser Source pointing at
// http://<operator-ip>:3691/obs  (set width/height to your canvas, e.g. 1920x1080).
// The current slide text appears as a lower-third, synced to the live output.
export const OBS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WorshipFlow OBS Overlay</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;background:transparent;overflow:hidden;font-family:-apple-system,system-ui,'Segoe UI',sans-serif}
#wrap{position:absolute;left:0;right:0;bottom:7vh;display:flex;flex-direction:column;align-items:center;padding:0 5vw;pointer-events:none}
#box{
  max-width:80vw;display:flex;flex-direction:column;align-items:center;gap:.35em;
  padding:1.5vh 2.5vw;border-radius:14px;
  background:linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,.45) 100%);
  opacity:0;transform:translateY(14px);transition:opacity .35s ease,transform .35s ease
}
#box.on{opacity:1;transform:translateY(0)}
#title{
  font-size:1.2vw;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
  color:#ffd56b;text-shadow:0 2px 6px rgba(0,0,0,.9);display:none
}
#title.on{display:block}
#text{
  text-align:center;color:#fff;font-weight:800;font-size:2.4vw;line-height:1.25;
  white-space:pre-line;word-break:break-word;
  text-shadow:0 3px 8px rgba(0,0,0,.9),0 0 36px rgba(0,0,0,.7)
}
</style>
</head>
<body>
<div id="wrap"><div id="box"><div id="title"></div><div id="text"></div></div></div>
<script>
var elBox = document.getElementById('box')
var elText = document.getElementById('text')
var elTitle = document.getElementById('title')
var ws = null

function apply(msg) {
  if (msg.type !== 'state') return
  var s = msg.state
  // Show lyrics/scripture/text only; hide on black, logo, countdown, or empty.
  var show = (s.mode === 'lyrics') && s.line && s.line.trim() !== ''
  if (show) {
    elText.textContent = s.line
    // Title label (song name / scripture reference), hidden for announcements.
    var title = s.songTitle || ''
    if (title && title !== 'Announcement') {
      elTitle.textContent = title
      elTitle.className = 'on'
    } else {
      elTitle.className = ''
    }
    elBox.className = 'on'
  } else {
    elBox.className = ''
  }
}

function connect() {
  ws = new WebSocket('ws://' + location.host)
  ws.onclose = function() { setTimeout(connect, 2000) }
  ws.onmessage = function(e) { try { apply(JSON.parse(e.data)) } catch(x) {} }
}
connect()
</script>
</body>
</html>`
