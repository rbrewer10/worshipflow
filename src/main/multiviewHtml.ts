import { ZONE_NAMES } from '../shared/types'

export const MULTIVIEW_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>WorshipFlow — Zone Multiview</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#0c0c10;color:#fff;font-family:system-ui,sans-serif}
#header{height:38px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;background:#141418;border-bottom:1px solid rgba(255,255,255,0.07);flex-shrink:0}
#header-left{display:flex;align-items:center;gap:8px}
#header-left .logo{width:22px;height:22px;background:#10b981;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#052e16}
#header-left span{font-size:13px;font-weight:600;color:#fff}
#clock{font-size:12px;font-variant-numeric:tabular-nums;color:rgba(255,255,255,0.35)}
#grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:5px;padding:5px;height:calc(100% - 38px)}
.cell{display:flex;flex-direction:column;border-radius:5px;overflow:hidden;border:1px solid rgba(255,255,255,0.07);background:#000}
.cell-bar{height:26px;display:flex;align-items:center;justify-content:space-between;padding:0 10px;background:#1a1a1d;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0}
.cell-bar .name{font-size:11px;font-weight:600;color:rgba(255,255,255,0.5);letter-spacing:0.05em}
.cell-bar .zid{font-size:10px;font-weight:700;color:rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);padding:1px 6px;border-radius:3px}
.cell iframe{flex:1;border:none;width:100%;display:block}
</style>
</head>
<body>
<div id="header">
  <div id="header-left">
    <div class="logo">✝</div>
    <span>Zone Multiview</span>
  </div>
  <div id="clock"></div>
</div>
<div id="grid">
  <div class="cell">
    <div class="cell-bar"><span class="name">${ZONE_NAMES[1]}</span><span class="zid">Z1</span></div>
    <iframe src="/zone/1"></iframe>
  </div>
  <div class="cell">
    <div class="cell-bar"><span class="name">${ZONE_NAMES[2]}</span><span class="zid">Z2</span></div>
    <iframe src="/zone/2"></iframe>
  </div>
  <div class="cell">
    <div class="cell-bar"><span class="name">${ZONE_NAMES[3]}</span><span class="zid">Z3</span></div>
    <iframe src="/zone/3"></iframe>
  </div>
  <div class="cell">
    <div class="cell-bar"><span class="name">${ZONE_NAMES[4]}</span><span class="zid">Z4</span></div>
    <iframe src="/zone/4"></iframe>
  </div>
</div>
<script>
  function tick(){
    var now=new Date(),h=now.getHours()%12||12,m=now.getMinutes(),ap=now.getHours()<12?'AM':'PM';
    document.getElementById('clock').textContent=h+':'+(m<10?'0':'')+m+' '+ap;
  }
  tick();setInterval(tick,1000);
<\/script>
</body>
</html>`
