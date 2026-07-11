// Self-contained HTML pages served to Raspberry Pis for each display zone.
// Each page opens a WebSocket, listens for {type:'zones'} messages, and renders its zone.
// Features: video backgrounds, Ken Burns on images, crossfade, text fade-up transitions.

// ── Shared utilities injected into every zone page ────────────────────────────
const SHARED_JS = `
  function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function isVid(p){return /\\.(mp4|webm|mov|m4v)$/i.test(p||'');}
  function fileUrl(p){
    if(!p) return '';
    if(/^https?:\\/\\//i.test(p)) return p;
    return 'http://'+location.host+'/file?path='+encodeURIComponent(p);
  }
`

function zoneBase(zoneId: number, css: string, body: string, script: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Zone ${zoneId}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#000;color:#fff;font-family:system-ui,sans-serif}
${css}
</style>
</head>
<body>
${body}
<script>
(function(){
  var ZONE=${zoneId};
  var state={mode:'off',line:'',next:'',title:'',index:0,total:0,background:null,themeColors:null,fontScale:6,secondsLeft:0,stageMessage:null,imagePath:null,bgColor:null,bgOverlay:null,textAlign:null,textPosition:null};
  var ws,reconnectTimer;
  function connect(){
    ws=new WebSocket('ws://'+location.host);
    ws.onopen=function(){ ws.send(JSON.stringify({type:'hello',zone:ZONE})); };
    ws.onmessage=function(e){
      try{
        var msg=JSON.parse(e.data);
        if(msg.type==='zones'&&msg.states&&msg.states[ZONE]){
          state=msg.states[ZONE];
          render();
        }
      }catch(ex){}
    };
    ws.onclose=function(){ reconnectTimer=setTimeout(connect,2000); };
    ws.onerror=function(){ ws.close(); };
  }
  ${SHARED_JS}
  ${script}
  connect();
})();
<\/script>
</body>
</html>`
}

// ── Zone 3: Congregation Lyrics ───────────────────────────────────────────────
// Full-bleed video or Ken-Burns image background, smooth text transitions.
const LYRICS_CSS = `
#root{width:100vw;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;overflow:hidden}
#bgvid{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 1.2s ease}
#bgimg{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;transition:opacity 1.2s ease;will-change:transform}
#gradient{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,0.15) 0%,rgba(0,0,0,0.65) 100%);opacity:0;transition:opacity 0.6s ease}
#line{position:relative;z-index:2;text-align:center;padding:0 8vw;width:100%}
#title{position:absolute;bottom:5vh;left:0;right:0;text-align:center;z-index:2}
#slidenum{position:absolute;bottom:1.5vh;right:3vw;z-index:2;font-size:1.5vw;color:rgba(255,255,255,0.25)}
@keyframes kb1{0%{transform:scale(1) translate(0%,0%)}100%{transform:scale(1.12) translate(-3%,-2%)}}
@keyframes kb2{0%{transform:scale(1.1) translate(2%,0%)}100%{transform:scale(1) translate(-1%,2%)}}
@keyframes kb3{0%{transform:scale(1) translate(-2%,1%)}100%{transform:scale(1.12) translate(2%,-1%)}}
@keyframes kb4{0%{transform:scale(1.08) translate(-1%,-2%)}100%{transform:scale(1) translate(1%,1%)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
.fade-up{animation:fadeUp 0.5s cubic-bezier(0.22,1,0.36,1) both}
@keyframes gradDrift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
@keyframes blobFloat{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(4vw,-6vh) scale(1.08)}66%{transform:translate(-3vw,4vh) scale(0.95)}}
@keyframes blobFloat2{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(-5vw,5vh) scale(0.92)}66%{transform:translate(6vw,-3vh) scale(1.06)}}
#blob1,#blob2{position:absolute;border-radius:50%;filter:blur(80px);pointer-events:none;z-index:0}
#blob1{width:60vw;height:60vw;top:-15vw;left:-15vw;animation:blobFloat 18s ease-in-out infinite}
#blob2{width:50vw;height:50vw;bottom:-10vw;right:-10vw;animation:blobFloat2 22s ease-in-out infinite}
`

const LYRICS_BODY_INNER = `<div id="root"><video id="bgvid" autoplay muted loop playsinline></video><div id="bgimg"></div><div id="blob1"></div><div id="blob2"></div><div id="gradient"></div><div id="line"></div><div id="title"></div><div id="slidenum"></div></div>`

const LYRICS_SCRIPT = `
  var bgvid=document.getElementById('bgvid');
  var bgimg=document.getElementById('bgimg');
  var blob1=document.getElementById('blob1');
  var blob2=document.getElementById('blob2');
  var gradient=document.getElementById('gradient');
  var lineEl=document.getElementById('line');
  var titleEl=document.getElementById('title');
  var slideNum=document.getElementById('slidenum');
  var prevBg=null,prevGradKey='',prevLine=null,kbIdx=0;
  var KB=['kb1 28s ease-in-out infinite alternate','kb2 32s ease-in-out infinite alternate','kb3 26s ease-in-out infinite alternate','kb4 30s ease-in-out infinite alternate'];

  function applyBg(bg){
    if(bg&&bg===prevBg) return;
    prevBg=bg;
    if(!bg){
      bgvid.style.opacity='0';
      var tc=state.themeColors;
      var c1=(tc&&tc.primary)||'#0c1a3a';
      var c2=(tc&&tc.secondary)||'#1a0a3a';
      var gradKey=c1+'|'+c2;
      if(gradKey!==prevGradKey){
        prevGradKey=gradKey;
        bgimg.style.backgroundImage='linear-gradient(135deg,'+c1+' 0%,'+c2+' 50%,'+c1+' 100%)';
        bgimg.style.backgroundSize='300% 300%';
        bgimg.style.animation='none';
        void bgimg.offsetHeight;
        bgimg.style.animation='gradDrift 20s ease infinite';
        blob1.style.background=c1;
        blob2.style.background=c2;
        blob1.style.opacity='0.55';
        blob2.style.opacity='0.45';
      }
      bgimg.style.opacity='1';
      setTimeout(function(){if(bgvid.style.opacity==='0'){bgvid.src='';bgvid.load();}},1300);
      return;
    }
    prevGradKey='';
    blob1.style.opacity='0';blob2.style.opacity='0';
    bgimg.style.backgroundSize='cover';
    bgimg.style.animation='none';
    if(isVid(bg)){
      bgvid.src=fileUrl(bg);bgvid.loop=true;bgvid.load();bgvid.play().catch(function(){});
      bgvid.style.opacity='1';bgimg.style.opacity='0';
    } else {
      bgimg.style.backgroundImage='url('+fileUrl(bg)+')';
      bgimg.style.opacity='1';bgvid.style.opacity='0';
      bgimg.style.animation='none';
      void bgimg.offsetHeight;
      kbIdx=(kbIdx+1)%4;
      bgimg.style.animation=KB[kbIdx];
    }
  }

  function render(){
    var m=state.mode;
    if(m==='black'||m==='off'){
      document.body.style.background='#000';
      bgvid.style.opacity='0';bgimg.style.opacity='0';gradient.style.opacity='0';
      blob1.style.opacity='0';blob2.style.opacity='0';
      root.style.justifyContent='center';root.style.paddingTop='0';root.style.paddingBottom='0';
      lineEl.innerHTML='';titleEl.innerHTML='';slideNum.innerHTML='';
      prevBg=null;prevGradKey='';prevLine=null;return;
    }
    if(m==='logo'){
      document.body.style.background='linear-gradient(135deg,#0c1a3a 0%,#0a1628 100%)';
      bgvid.style.opacity='0';bgimg.style.opacity='0';gradient.style.opacity='0';
      blob1.style.opacity='0';blob2.style.opacity='0';
      lineEl.innerHTML='<div style="font-size:18vw;font-weight:900;color:rgba(255,255,255,0.75)">\\u271d</div>';
      titleEl.innerHTML='';slideNum.innerHTML='';return;
    }
    if(m==='countdown'){
      document.body.style.background='#050a14';
      bgvid.style.opacity='0';bgimg.style.opacity='0';gradient.style.opacity='1';
      blob1.style.opacity='0';blob2.style.opacity='0';
      var mins=Math.floor(state.secondsLeft/60),secs=state.secondsLeft%60;
      lineEl.innerHTML='<div style="font-size:25vw;font-weight:900;color:#fff;font-variant-numeric:tabular-nums;letter-spacing:-0.03em">'+mins+':'+(secs<10?'0':'')+secs+'</div>';
      titleEl.innerHTML=state.title?'<span style="font-size:2.5vw;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.2em">'+esc(state.title)+'</span>':'';
      slideNum.innerHTML='';return;
    }
    if(m==='image'){
      gradient.style.opacity='0';lineEl.innerHTML='';titleEl.innerHTML='';slideNum.innerHTML='';
      blob1.style.opacity='0';blob2.style.opacity='0';
      if(state.imagePath) applyBg(state.imagePath);
      return;
    }
    // lyrics / text
    document.body.style.background='#000';
    applyBg(state.background);
    // Solid bg color when no file background
    if(!state.background && state.bgColor){
      document.body.style.background=state.bgColor;
    }
    // Overlay opacity: explicit setting > smart default by context
    var ovl=state.bgOverlay!=null?state.bgOverlay:state.background?0.9:state.bgColor?0.15:0;
    gradient.style.opacity=String(ovl);
    // Text position (vertical)
    var pos=state.textPosition||'center';
    root.style.justifyContent=pos==='top'?'flex-start':pos==='bottom'?'flex-end':'center';
    root.style.paddingTop=pos==='top'?'10vh':'0';
    root.style.paddingBottom=pos==='bottom'?'10vh':'0';
    // Text
    var align=state.textAlign||'center';
    var fs=Math.max(3,Math.min(state.fontScale||6,14));
    var lineChanged=state.line!==prevLine;prevLine=state.line;
    var shadow='text-shadow:0 4px 32px rgba(0,0,0,0.9),0 1px 0 rgba(0,0,0,0.5);';
    lineEl.innerHTML='<div class="'+(lineChanged?'fade-up':'')+'" style="font-size:'+fs+'vw;font-weight:900;line-height:1.2;color:#fff;white-space:pre-line;text-align:'+align+';'+shadow+'">'+esc(state.line)+'</div>';
    titleEl.innerHTML=state.title?'<span style="font-size:'+(fs*0.28)+'vw;color:#fff;opacity:0.5;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;display:block;text-align:'+align+'">'+esc(state.title)+'</span>':'';
    slideNum.innerHTML=state.total>1?(state.index+1)+' / '+state.total:'';
  }
  render();
`

// ── Zones 1 & 2: Flexible display ─────────────────────────────────────────────
// Same video/Ken-Burns background engine, center-stage content.
const FLEX_CSS = `
#root{width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
#bgvid{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 1.2s ease}
#bgimg{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;transition:opacity 1.2s ease;will-change:transform}
#overlay{position:absolute;inset:0;background:rgba(0,0,0,0.42);opacity:0;transition:opacity 0.6s ease}
#content{position:relative;z-index:2;text-align:center;padding:48px;max-width:90vw}
@keyframes kb1{0%{transform:scale(1) translate(0%,0%)}100%{transform:scale(1.12) translate(-3%,-2%)}}
@keyframes kb2{0%{transform:scale(1.1) translate(2%,0%)}100%{transform:scale(1) translate(-1%,2%)}}
@keyframes kb3{0%{transform:scale(1) translate(-2%,1%)}100%{transform:scale(1.12) translate(2%,-1%)}}
@keyframes kb4{0%{transform:scale(1.08) translate(-1%,-2%)}100%{transform:scale(1) translate(1%,1%)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
.fade-up{animation:fadeUp 0.5s cubic-bezier(0.22,1,0.36,1) both}
@keyframes gradDrift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
@keyframes blobFloat{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(4vw,-6vh) scale(1.08)}66%{transform:translate(-3vw,4vh) scale(0.95)}}
@keyframes blobFloat2{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(-5vw,5vh) scale(0.92)}66%{transform:translate(6vw,-3vh) scale(1.06)}}
#blob1,#blob2{position:absolute;border-radius:50%;filter:blur(80px);pointer-events:none;z-index:0;opacity:0}
#blob1{width:70vw;height:70vw;top:-20vw;left:-20vw;animation:blobFloat 18s ease-in-out infinite}
#blob2{width:60vw;height:60vw;bottom:-15vw;right:-15vw;animation:blobFloat2 22s ease-in-out infinite}
`

const FLEX_SCRIPT = `
  var root=document.getElementById('root');
  var bgvid=document.getElementById('bgvid');
  var bgimg=document.getElementById('bgimg');
  var blob1=document.getElementById('blob1');
  var blob2=document.getElementById('blob2');
  var overlay=document.getElementById('overlay');
  var content=document.getElementById('content');
  var prevBg=null,prevLine=null,kbIdx=0;
  var KB=['kb1 28s ease-in-out infinite alternate','kb2 32s ease-in-out infinite alternate','kb3 26s ease-in-out infinite alternate','kb4 30s ease-in-out infinite alternate'];

  function applyBg(bg,showOverlay){
    if(bg===prevBg) return;
    prevBg=bg;
    overlay.style.opacity=(bg&&showOverlay)?'1':'0';
    if(!bg){
      bgvid.style.opacity='0';bgimg.style.opacity='0';
      setTimeout(function(){if(bgvid.style.opacity==='0'){bgvid.src='';bgvid.load();}},1300);
      return;
    }
    bgimg.style.backgroundSize='cover';bgimg.style.animation='none';
    if(isVid(bg)){
      bgvid.src=fileUrl(bg);bgvid.loop=true;bgvid.load();bgvid.play().catch(function(){});
      bgvid.style.opacity='1';bgimg.style.opacity='0';
    } else {
      bgimg.style.backgroundImage='url('+fileUrl(bg)+')';
      bgimg.style.opacity='1';bgvid.style.opacity='0';
      void bgimg.offsetHeight;
      kbIdx=(kbIdx+1)%4;
      bgimg.style.animation=KB[kbIdx];
    }
  }

  function render(){
    var m=state.mode;
    if(m==='black'||m==='off'){
      root.style.background='#000';bgvid.style.opacity='0';bgimg.style.opacity='0';overlay.style.opacity='0';
      blob1.style.opacity='0';blob2.style.opacity='0';
      content.innerHTML='';prevBg=null;prevLine=null;return;
    }
    if(m==='logo'){
      overlay.style.opacity='0';
      if(state.background){
        if(state.background!==prevBg){
          prevBg=state.background;
          blob1.style.opacity='0';blob2.style.opacity='0';
          bgimg.style.backgroundSize='cover';bgimg.style.animation='none';
          if(isVid(state.background)){
            bgvid.src=fileUrl(state.background);bgvid.loop=true;bgvid.load();bgvid.play().catch(function(){});
            bgvid.style.opacity='1';bgimg.style.opacity='0';
          } else {
            bgimg.style.backgroundImage='url('+fileUrl(state.background)+')';
            bgimg.style.opacity='1';bgvid.style.opacity='0';
            void bgimg.offsetHeight;kbIdx=(kbIdx+1)%4;bgimg.style.animation=KB[kbIdx];
          }
        }
      } else if(prevBg!=='__logo_grad__'){
        prevBg='__logo_grad__';
        bgvid.style.opacity='0';
        bgimg.style.backgroundImage='linear-gradient(135deg,#54585f 0%,#3a3d43 100%)';
        bgimg.style.backgroundSize='300% 300%';
        bgimg.style.animation='none';void bgimg.offsetHeight;
        bgimg.style.animation='gradDrift 20s ease infinite';
        bgimg.style.opacity='1';
        blob1.style.background='#5a5f68';blob2.style.background='#4a4e54';
        blob1.style.opacity='0.45';blob2.style.opacity='0.35';
        root.style.background='#000';
      }
      content.innerHTML=state.imagePath
        ?'<img src="'+fileUrl(state.imagePath)+'" style="max-width:55vw;max-height:45vh;object-fit:contain;filter:drop-shadow(0 0 80px rgba(0,0,0,0.7));display:block;position:relative;z-index:2">'
        :'<div style="font-size:15vw;font-weight:900;color:rgba(255,255,255,0.75);letter-spacing:-0.02em;position:relative;z-index:2">\\u271d</div>';
      return;
    }
    if(m==='lyrics'||m==='text'){
      applyBg(state.background,true);
      var tc=state.themeColors;
      if(!state.background) root.style.background=(tc&&tc.primary)||'#0a1628';
      var textColor=state.background?'#fff':(tc&&tc.text)||'#fff';
      var shadow=state.background?'text-shadow:0 2px 24px rgba(0,0,0,0.8);':'';
      var fs=Math.max(3,Math.min(state.fontScale||6,12));
      var lineChanged=state.line!==prevLine;prevLine=state.line;
      content.innerHTML='<div class="'+(lineChanged?'fade-up':'')+'" style="font-size:'+fs+'vw;font-weight:800;line-height:1.25;color:'+textColor+';white-space:pre-line;'+shadow+'">'+esc(state.line)+'</div>'
        +(state.title?'<div style="margin-top:2vw;font-size:'+(fs*0.3)+'vw;color:'+textColor+';opacity:0.5;font-weight:600;letter-spacing:0.15em;text-transform:uppercase">'+esc(state.title)+'</div>':'');
      return;
    }
    if(m==='countdown'){
      root.style.background='#050a14';bgvid.style.opacity='0';bgimg.style.opacity='0';overlay.style.opacity='0';
      var mins=Math.floor(state.secondsLeft/60),secs=state.secondsLeft%60;
      content.innerHTML='<div style="font-size:22vw;font-weight:900;font-variant-numeric:tabular-nums;color:#fff;letter-spacing:-0.04em">'+mins+':'+(secs<10?'0':'')+secs+'</div>'
        +(state.title?'<div style="font-size:3vw;color:rgba(255,255,255,0.4);margin-top:1vw;text-transform:uppercase;letter-spacing:0.2em">'+esc(state.title)+'</div>':'');
      return;
    }
    if(m==='image'){
      overlay.style.opacity='0';content.innerHTML='';
      if(state.imagePath) applyBg(state.imagePath,false);
      return;
    }
    content.innerHTML='';
  }
  render();
`

// ── Zone 4: Stage Monitor ─────────────────────────────────────────────────────
// Black bg, white text, next-slide preview, live clock, stage messages.
// No visual effects — clarity is paramount for the worship team.
const STAGE_CSS = `
#wrap{width:100vw;height:100vh;display:flex;flex-direction:column;background:#000;overflow:hidden}
#topbar{display:flex;align-items:center;justify-content:space-between;padding:1.5vh 3vw;border-bottom:1px solid rgba(255,255,255,0.08)}
#songtitle{font-size:2vw;font-weight:700;color:rgba(255,255,255,0.5);letter-spacing:0.05em}
#clock{font-size:2.5vw;font-weight:700;color:rgba(255,255,255,0.35);font-variant-numeric:tabular-nums}
#stagemsg{display:none;padding:1.5vh 3vw;background:#7c2d00;border-bottom:2px solid #f97316}
#stagemsg span{font-size:2.2vw;font-weight:800;color:#fed7aa}
#current{flex:1;display:flex;align-items:center;justify-content:center;padding:3vw 5vw;text-align:center}
#divider{height:1px;background:rgba(255,255,255,0.08);margin:0 3vw}
#nextsection{padding:2vh 3vw;min-height:18vh;display:flex;flex-direction:column;justify-content:center}
#nextlabel{font-size:1.2vw;font-weight:700;color:rgba(255,255,255,0.25);text-transform:uppercase;letter-spacing:0.2em;margin-bottom:1vh}
#nextline{font-size:3vw;font-weight:700;color:rgba(255,255,255,0.45);line-height:1.3;white-space:pre-line}
#slidecounter{padding:1vh 3vw;text-align:right;font-size:1.5vw;color:rgba(255,255,255,0.2)}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.fade-in{animation:fadeIn 0.3s ease both}
`

const STAGE_SCRIPT = `
  var songTitle=document.getElementById('songtitle');
  var clockEl=document.getElementById('clock');
  var stageMsg=document.getElementById('stagemsg');
  var current=document.getElementById('current');
  var nextLine=document.getElementById('nextline');
  var slideCounter=document.getElementById('slidecounter');
  var prevLine=null;
  function tick(){
    var now=new Date();
    var h=now.getHours()%12||12,m=now.getMinutes(),ap=now.getHours()<12?'AM':'PM';
    clockEl.textContent=h+':'+(m<10?'0':'')+m+' '+ap;
  }
  tick();setInterval(tick,1000);
  function render(){
    var m=state.mode;
    if(state.stageMessage){
      stageMsg.style.display='block';
      stageMsg.querySelector('span').textContent=state.stageMessage;
    } else {
      stageMsg.style.display='none';
    }
    songTitle.textContent=state.title||'';
    if(m==='off'){
      current.innerHTML='<div style="font-size:3vw;font-weight:700;color:rgba(255,255,255,0.1)">Standby</div>';
      nextLine.textContent='';slideCounter.textContent='';return;
    }
    if(m==='black'){
      current.innerHTML='<div style="font-size:4vw;font-weight:700;color:rgba(255,255,255,0.15)">Screen Off</div>';
      nextLine.textContent='';slideCounter.textContent='';return;
    }
    if(m==='logo'){
      current.innerHTML='<div style="font-size:4vw;font-weight:700;color:rgba(255,255,255,0.15)">\\u271d Logo</div>';
      nextLine.textContent='';slideCounter.textContent='';return;
    }
    if(m==='countdown'){
      var mins=Math.floor(state.secondsLeft/60),secs=state.secondsLeft%60;
      current.innerHTML='<div style="font-size:18vw;font-weight:900;color:#fff;font-variant-numeric:tabular-nums;letter-spacing:-0.03em">'+mins+':'+(secs<10?'0':'')+secs+'</div>';
      nextLine.textContent='';slideCounter.textContent='';return;
    }
    var fs=Math.max(5,Math.min(state.fontScale||6,12));
    var lineChanged=state.line!==prevLine;prevLine=state.line;
    current.innerHTML='<div class="'+(lineChanged?'fade-in':'')+'" style="font-size:'+fs+'vw;font-weight:900;line-height:1.2;color:#fff;white-space:pre-line">'+esc(state.line||'\\u2014')+'</div>';
    nextLine.textContent=state.next||'';
    slideCounter.textContent=state.total>1?'Slide '+(state.index+1)+' of '+state.total:'';
  }
  render();
`

// ── Assemble ──────────────────────────────────────────────────────────────────
const FLEX_BODY = `<div id="root"><video id="bgvid" autoplay muted loop playsinline></video><div id="bgimg"></div><div id="blob1"></div><div id="blob2"></div><div id="overlay"></div><div id="content"></div></div>`
const STAGE_BODY = `<div id="wrap"><div id="topbar"><div id="songtitle"></div><div id="clock"></div></div><div id="stagemsg"><span></span></div><div id="current"></div><div id="divider"></div><div id="nextsection"><div id="nextlabel">Next</div><div id="nextline"></div></div><div id="slidecounter"></div></div>`

export const ZONE_HTML: Record<number, string> = {
  1: zoneBase(1, FLEX_CSS,   FLEX_BODY,       FLEX_SCRIPT),
  2: zoneBase(2, FLEX_CSS,   FLEX_BODY,       FLEX_SCRIPT),
  3: zoneBase(3, LYRICS_CSS, LYRICS_BODY_INNER, LYRICS_SCRIPT),
  4: zoneBase(4, STAGE_CSS,  STAGE_BODY,      STAGE_SCRIPT),
}
