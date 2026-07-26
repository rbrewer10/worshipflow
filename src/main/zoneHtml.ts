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
  // Shrink-to-fit: keep the desired font size when it fits, otherwise binary-search
  // the largest size (down to minVw) whose rendered text fits within availW x availH.
  // Prevents oversized slides (whole verse+chorus on one slide) from clipping.
  function fitText(el,maxVw,minVw,availW,availH){
    if(!el) return;
    el.style.fontSize=maxVw+'vw';
    if(el.scrollHeight<=availH+1 && el.scrollWidth<=availW+1) return;
    var lo=minVw, hi=maxVw;
    for(var i=0;i<16;i++){
      var mid=(lo+hi)/2;
      el.style.fontSize=mid+'vw';
      if(el.scrollHeight<=availH+1 && el.scrollWidth<=availW+1){ lo=mid; } else { hi=mid; }
    }
    el.style.fontSize=lo+'vw';
  }
  // ── Sermon backdrop (mode 'sermon') ─────────────────────────────────────────
  // The designed title card that sits behind the pastor. Markup is rebuilt only
  // when the content key changes, so the 0.6s entrance plays once per sermon and
  // not again on every broadcast tick.
  var prevSermonKey='';
  function sermonKey(s){return [s.title||'',s.line||'',s.speaker||'',s.passage||''].join('|');}
  // Prefer the explicit fields; fall back to splitting the "speaker\\npassage" line.
  function sermonParts(s){
    var sp=s.speaker||'',ps=s.passage||'';
    if(!sp&&!ps){var parts=(s.line||'').split('\\n');sp=(parts[0]||'').trim();ps=(parts[1]||'').trim();}
    return {speaker:sp,passage:ps};
  }
  // Theme colours land in style attributes, so only accept real hex values.
  function safeColor(c,fallback){return (typeof c==='string'&&/^#[0-9a-fA-F]{3,8}$/.test(c))?c:fallback;}
  function sermonHtml(s){
    var tc=s.themeColors||{};
    var accent=safeColor(tc.secondary,'#c8102e');
    var ink=safeColor(tc.text,'#ffffff');
    var p=sermonParts(s);
    var h='<div class="s-wash"></div><div class="s-vig"></div>'
      +'<div class="s-type" style="color:'+ink+'">'
      +'<span class="s-rule s-in" style="background:'+accent+'"></span>'
      +'<span class="s-kicker s-in s-d1">Today&rsquo;s Message</span>'
      +'<div class="s-title s-in s-d2" style="color:'+ink+'">'+esc(s.title||'')+'</div>'
      +'<div class="s-hair s-in s-d3"></div>'
      +(p.speaker?'<div class="s-speaker s-in s-d3">'+esc(p.speaker)+'</div>':'')
      +(p.passage?'<div class="s-passage s-in s-d4">'+esc(p.passage)+'</div>':'')
      +'</div>';
    // Optional identity mark — text, because the wordmark PNG is black+red and
    // disappears on the dark wash. Nothing renders when the name is absent.
    if(s.churchName) h+='<div class="s-mark">'+esc(s.churchName)+'</div>';
    return h;
  }
`

// ── Sermon backdrop styling (zones 1-3) ───────────────────────────────────────
// Ported from docs/superpowers/specs/2026-07-25-sermon-backdrop-preview.html
// (PORTABLE BLOCK). One unit knob --u:1vw; the background image itself is the
// existing #bgimg / #bgvid layer, which the render branch grades and drifts.
// System fonts only — zone pages embed no webfonts and Pis can't reach Google.
const SERMON_CSS = `
#sermon{
  --u:1vw;
  --wf-accent:#c8102e;
  --wf-ink:#ffffff;
  --wf-wash:4,7,13;
  position:absolute;inset:0;overflow:hidden;
  font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
  z-index:3;
}
/* The dark glass: an asymmetric left-heavy wash that buries the type side, plus
   a bottom-up grounding gradient. */
#sermon .s-wash{position:absolute;inset:0;background:
  linear-gradient(100deg,
     rgba(var(--wf-wash),.94) 0%,
     rgba(var(--wf-wash),.88) 30%,
     rgba(var(--wf-wash),.66) 58%,
     rgba(var(--wf-wash),.50) 78%,
     rgba(var(--wf-wash),.72) 100%),
  linear-gradient(to top,
     rgba(var(--wf-wash),.86) 0%,
     rgba(var(--wf-wash),.16) 42%,
     rgba(var(--wf-wash),0) 64%)}
#sermon .s-vig{position:absolute;inset:0;background:
  radial-gradient(122% 92% at 62% 40%, rgba(0,0,0,0) 36%, rgba(0,0,0,.58) 100%)}
/* Type block: left-anchored, optically above centre. */
#sermon .s-type{position:absolute;left:calc(var(--u) * 7.8);top:50%;
  width:calc(var(--u) * 60);max-width:calc(100% - var(--u) * 15.6);
  transform:translateY(-54%);
  animation:wfSermonSettle 300s ease-in-out infinite alternate;
  color:var(--wf-ink);text-shadow:0 calc(var(--u) * .1) calc(var(--u) * 1.3) rgba(0,0,0,.6)}
#sermon .s-rule{display:block;width:calc(var(--u) * 3.5);height:calc(var(--u) * .2);
  background:var(--wf-accent);border-radius:calc(var(--u) * .1)}
#sermon .s-kicker{display:block;margin-top:calc(var(--u) * 1.15);
  font-size:calc(var(--u) * 1.32);font-weight:700;text-transform:uppercase;
  letter-spacing:.42em;color:rgba(255,255,255,.66)}
#sermon .s-title{margin-top:calc(var(--u) * 2.1);
  font-family:Georgia,'Times New Roman','Liberation Serif','DejaVu Serif','Nimbus Roman',serif;
  font-size:calc(var(--u) * 9);
  font-weight:700;line-height:1.03;letter-spacing:-.006em;color:var(--wf-ink)}
#sermon .s-hair{margin-top:calc(var(--u) * 2.9);width:calc(var(--u) * 22);height:1px;
  background:linear-gradient(90deg,rgba(255,255,255,.45) 0%,rgba(255,255,255,0) 100%)}
#sermon .s-speaker{margin-top:calc(var(--u) * 2.3);
  font-size:calc(var(--u) * 2.5);font-weight:600;letter-spacing:.005em;color:rgba(255,255,255,.93)}
#sermon .s-passage{margin-top:calc(var(--u) * .85);
  font-size:calc(var(--u) * 1.5);font-weight:600;text-transform:uppercase;
  letter-spacing:.26em;color:rgba(255,255,255,.56)}
#sermon .s-mark{position:absolute;right:calc(var(--u) * 6.25);bottom:calc(var(--u) * 6.25);
  font-size:calc(var(--u) * 1.12);font-weight:700;text-transform:uppercase;letter-spacing:.3em;
  color:rgba(255,255,255,.3)}
/* Entrance only — one 0.6s move when the sermon goes live, then dead still. */
@keyframes wfSermonIn{from{opacity:0;transform:translateY(calc(var(--u) * .9))}to{opacity:1;transform:none}}
#sermon .s-in{animation:wfSermonIn .6s cubic-bezier(.22,1,.36,1) both}
#sermon .s-d1{animation-delay:.06s}#sermon .s-d2{animation-delay:.14s}
#sermon .s-d3{animation-delay:.2s}#sermon .s-d4{animation-delay:.26s}
/* Imperceptible over 40 min; transform-only so a Pi composites it for free.
   Also nudges pixels so nothing burns into the same phosphor all hour. */
@keyframes wfSermonDrift{from{transform:scale(1.02) translate3d(0,0,0)}
                         to{transform:scale(1.08) translate3d(-1.2%,-.8%,0)}}
@keyframes wfSermonSettle{from{transform:translateY(-54%)}to{transform:translateY(-51.4%)}}
`

/**
 * Live Call viewer, shared by every zone page.
 *
 * The relay (the control renderer) offers us a video-only stream over the LAN
 * and we answer. Muted on purpose and with no audio track to begin with: the
 * control machine is the single audio source, because several screens playing
 * the same voice milliseconds apart is comb-filtered mush.
 */
const LIVECALL_VIEWER_JS = String.raw`
var lcPc=null,lcWs=null,lcRetry=0,lcTimer=null;
var lcVideo=document.createElement('video');
lcVideo.autoplay=true;lcVideo.playsInline=true;lcVideo.muted=true;
lcVideo.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;display:none;z-index:50';
document.body.appendChild(lcVideo);

function lcApplyMode(){
  lcVideo.style.display = (state.mode==='livecall') ? 'block' : 'none';
}

function lcConnect(){
  if(lcTimer){clearTimeout(lcTimer);lcTimer=null;}
  var proto = location.protocol==='https:' ? 'wss' : 'ws';
  lcWs = new WebSocket(proto+'://'+location.host+'/livecall');
  lcWs.onopen=function(){
    lcRetry=0;
    lcWs.send(JSON.stringify({type:'hello',token:LIVECALL_TOKEN,role:'viewer',room:LIVECALL_ROOM}));
  };
  lcWs.onmessage=function(e){
    var m;
    try{ m=JSON.parse(e.data); }catch(ex){ return; }
    if(m.type==='offer'){
      // A fresh offer means the relay rebuilt our connection; drop the old one.
      if(lcPc) lcPc.close();
      lcPc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
      // ev.streams is EMPTY when the relay pre-negotiated this connection with
      // addTransceiver and filled it later via replaceTrack — no stream id was
      // ever associated. Trusting ev.streams[0] alone leaves the screen black
      // for exactly the case the pre-negotiation was meant to speed up.
      lcPc.ontrack=function(ev){
        var s = ev.streams[0] || new MediaStream([ev.track]);
        if(lcVideo.srcObject !== s) lcVideo.srcObject = s;
      };
      lcPc.onicecandidate=function(ev){
        if(ev.candidate&&lcWs&&lcWs.readyState===1) lcWs.send(JSON.stringify({type:'ice-candidate',candidate:ev.candidate}));
      };
      lcPc.setRemoteDescription({type:'offer',sdp:m.sdp})
        .then(function(){ return lcPc.createAnswer(); })
        .then(function(ans){ return lcPc.setLocalDescription(ans).then(function(){ return ans; }); })
        .then(function(ans){ if(lcWs&&lcWs.readyState===1) lcWs.send(JSON.stringify({type:'answer',sdp:ans.sdp})); })
        .catch(function(){});
    } else if(m.type==='ice-candidate'&&lcPc&&m.candidate){
      lcPc.addIceCandidate(m.candidate).catch(function(){});
    }
  };
  lcWs.onclose=function(){
    lcRetry++;
    lcTimer=setTimeout(lcConnect, Math.min(1000*Math.pow(2,lcRetry),15000));
  };
  lcWs.onerror=function(){ try{ lcWs.close(); }catch(ex){} };
}
lcConnect();
`

function zoneBase(
  zoneId: number,
  css: string,
  body: string,
  script: string,
  livecallToken: string,
  livecallRoom: string
): string {
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
  var state={mode:'off',line:'',next:'',title:'',index:0,total:0,background:null,themeColors:null,fontScale:6,secondsLeft:0,stageMessage:null,imagePath:null,bgColor:null,bgOverlay:null,textAlign:null,textPosition:null,blurBehindText:false};
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
          lcApplyMode();
        }
      }catch(ex){}
    };
    ws.onclose=function(){ reconnectTimer=setTimeout(connect,2000); };
    ws.onerror=function(){ ws.close(); };
  }
  var LIVECALL_TOKEN=${JSON.stringify(livecallToken)};
  var LIVECALL_ROOM=${JSON.stringify(livecallRoom)};
  ${SHARED_JS}
  ${script}
  ${LIVECALL_VIEWER_JS}
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
${SERMON_CSS}
`

const LYRICS_BODY_INNER = `<div id="root"><video id="bgvid" autoplay muted loop playsinline></video><div id="bgimg"></div><div id="blob1"></div><div id="blob2"></div><div id="gradient"></div><div id="sermon" style="display:none"></div><div id="line"></div><div id="title"></div><div id="slidenum"></div></div>`

const LYRICS_SCRIPT = `
  var root=document.getElementById('root');
  var bgvid=document.getElementById('bgvid');
  var bgimg=document.getElementById('bgimg');
  var blob1=document.getElementById('blob1');
  var blob2=document.getElementById('blob2');
  var gradient=document.getElementById('gradient');
  var lineEl=document.getElementById('line');
  var titleEl=document.getElementById('title');
  var slideNum=document.getElementById('slidenum');
  var sermon=document.getElementById('sermon');
  var prevBg=null,prevGradKey='',prevLine=null,kbIdx=0,sermonOn=false;
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
    lineEl.style.backdropFilter='none';lineEl.style.webkitBackdropFilter='none';lineEl.style.background='transparent';lineEl.style.padding='0 8vw';
    // Sermon teardown: hide the backdrop and undo the grade/drift it puts on the
    // bg layers. Guarded so a normal render never stomps applyBg's Ken Burns.
    if(m!=='sermon'){
      sermon.style.display='none';
      if(sermonOn){
        sermonOn=false;prevSermonKey='';
        bgimg.style.filter='';bgvid.style.filter='';bgimg.style.animation='none';
        document.body.style.background='#000';prevBg='__sermon__';prevGradKey='';
      }
    }
    if(m==='black'||m==='off'){
      document.body.style.background='#000';
      bgvid.style.opacity='0';bgimg.style.opacity='0';gradient.style.opacity='0';
      blob1.style.opacity='0';blob2.style.opacity='0';
      root.style.justifyContent='center';root.style.paddingTop='0';root.style.paddingBottom='0';
      lineEl.innerHTML='';titleEl.innerHTML='';slideNum.innerHTML='';
      prevBg=null;prevGradKey='';prevLine=null;return;
    }
    if(m==='logo'){
      // Mirrors the back screens' logo branch: honour the configured logo
      // backdrop when there is one, else the SAME charcoal they use. This zone
      // used to ignore state.background and paint its own dark navy, so the
      // Lyrics TVs looked black next to the back screens and a configured logo
      // background never appeared on them at all.
      gradient.style.opacity='0';
      if(state.background){
        if(state.background!==prevBg){
          prevBg=state.background;
          document.body.style.background='#000';
          blob1.style.opacity='0';blob2.style.opacity='0';
          bgimg.style.backgroundSize='cover';bgimg.style.animation='none';
          if(isVid(state.background)){
            bgvid.src=fileUrl(state.background);bgvid.loop=true;bgvid.load();bgvid.play().catch(function(){});
            bgvid.style.opacity='1';bgimg.style.opacity='0';
          } else {
            bgimg.style.backgroundImage='url('+fileUrl(state.background)+')';
            bgimg.style.opacity='1';bgvid.style.opacity='0';
          }
        }
      } else {
        if(prevBg!=='__logo_grad__'){
          prevBg='__logo_grad__';
          bgvid.style.opacity='0';bgimg.style.opacity='0';
          blob1.style.opacity='0';blob2.style.opacity='0';
        }
        document.body.style.background='linear-gradient(135deg,#54585f 0%,#3a3d43 100%)';
      }
      lineEl.innerHTML=state.imagePath
        ?'<img src="'+fileUrl(state.imagePath)+'" style="max-width:60vw;max-height:55vh;object-fit:contain;filter:drop-shadow(0 0 80px rgba(0,0,0,0.7))"/>'
        :'<div style="font-size:18vw;font-weight:900;color:rgba(255,255,255,0.75)">\\u271d</div>';
      titleEl.innerHTML='';slideNum.innerHTML='';return;
    }
    if(m==='countdown'){
      document.body.style.background='#050a14';
      bgvid.style.opacity='0';bgimg.style.opacity='0';gradient.style.opacity='1';
      blob1.style.opacity='0';blob2.style.opacity='0';
      if(state.blurBehindText){lineEl.style.backdropFilter='blur(10px)';lineEl.style.webkitBackdropFilter='blur(10px)';lineEl.style.background='rgba(20,20,30,.3)';lineEl.style.padding='2vh 8vw';}
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
    if(m==='sermon'){
      // Same designed backdrop as zones 1-2 (a pinned Lyrics TV can hold it).
      gradient.style.opacity='0';blob1.style.opacity='0';blob2.style.opacity='0';
      lineEl.innerHTML='';titleEl.innerHTML='';slideNum.innerHTML='';prevLine=null;
      if(state.background){
        document.body.style.background='#000';
        applyBg(state.background);
      } else {
        // Skip applyBg's animated theme gradient + blobs here — they fight the
        // sermon grade. A static themed stand-in sits behind the wash instead.
        prevBg='__sermon__';prevGradKey='';
        bgvid.style.opacity='0';bgimg.style.opacity='0';
        var stc=state.themeColors;
        var sc1=(stc&&stc.primary)||'#1b2c4d';
        document.body.style.background='radial-gradient(58% 46% at 74% 22%,rgba(255,205,140,.30) 0%,rgba(0,0,0,0) 72%),'
          +'linear-gradient(160deg,'+sc1+' 0%,#152238 42%,#2a2b34 72%,#4a3a2c 100%)';
      }
      var sf='saturate(.68) brightness(.62) contrast(1.06)';
      bgimg.style.filter=sf;bgvid.style.filter=sf;
      bgimg.style.animation='wfSermonDrift 240s ease-in-out infinite alternate';
      sermon.style.display='block';sermonOn=true;
      var skey=sermonKey(state);
      if(skey!==prevSermonKey){
        prevSermonKey=skey;
        sermon.innerHTML=sermonHtml(state);
        fitText(sermon.querySelector('.s-title'),9,4.2,window.innerWidth*0.60,window.innerWidth*0.19);
      }
      return;
    }
    // lyrics / text
    document.body.style.background='#000';
    applyBg(state.background);
    if(state.blurBehindText){lineEl.style.backdropFilter='blur(10px)';lineEl.style.webkitBackdropFilter='blur(10px)';lineEl.style.background='rgba(20,20,30,.3)';lineEl.style.padding='2vh 8vw';}
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
    // Shrink to fit: reserve vertical room for the bottom title and any top/bottom offset.
    var reservedFrac=(state.title?0.14:0.06)+(pos!=='center'?0.10:0);
    fitText(lineEl.firstChild,fs,2,window.innerWidth*0.84,window.innerHeight*(1-reservedFrac));
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
${SERMON_CSS}
`

const FLEX_SCRIPT = `
  var root=document.getElementById('root');
  var bgvid=document.getElementById('bgvid');
  var bgimg=document.getElementById('bgimg');
  var blob1=document.getElementById('blob1');
  var blob2=document.getElementById('blob2');
  var overlay=document.getElementById('overlay');
  var content=document.getElementById('content');
  var sermon=document.getElementById('sermon');
  var prevBg=null,prevLine=null,kbIdx=0,sermonOn=false;
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
    content.style.backdropFilter='none';content.style.webkitBackdropFilter='none';content.style.background='transparent';content.style.width='';content.style.maxWidth='';content.style.padding='';
    // Sermon teardown: every other mode starts with the backdrop hidden and the
    // grade/drift this branch put on the bg layers undone. Guarded so a normal
    // render never stomps the Ken Burns animation applyBg is running.
    if(m!=='sermon'){
      sermon.style.display='none';
      if(sermonOn){
        sermonOn=false;prevSermonKey='';
        bgimg.style.filter='';bgvid.style.filter='';bgimg.style.animation='none';
        root.style.background='#000';prevBg='__sermon__';
      }
    }
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
          root.style.background='#000';
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
      } else {
        // No logo background set → grey charcoal painted on the ROOT element itself,
        // applied every render. Unlike the old bgimg-layer approach it can never fall
        // through to black regardless of prior opacity/prevBg state.
        if(prevBg!=='__logo_grad__'){
          prevBg='__logo_grad__';
          bgvid.style.opacity='0';bgimg.style.opacity='0';
          blob1.style.opacity='0';blob2.style.opacity='0';
        }
        root.style.background='linear-gradient(135deg,#54585f 0%,#3a3d43 100%)';
      }
      content.innerHTML=state.imagePath
        ?'<img src="'+fileUrl(state.imagePath)+'" style="max-width:55vw;max-height:45vh;object-fit:contain;filter:drop-shadow(0 0 80px rgba(0,0,0,0.7));display:block;position:relative;z-index:2">'
        :'<div style="font-size:15vw;font-weight:900;color:rgba(255,255,255,0.75);letter-spacing:-0.02em;position:relative;z-index:2">\\u271d</div>';
      return;
    }
    if(m==='sermon'){
      // Designed sermon title card behind the pastor: the real background photo,
      // graded and drifting, under a dark left-heavy wash carrying the type.
      overlay.style.opacity='0';blob1.style.opacity='0';blob2.style.opacity='0';
      content.innerHTML='';prevLine=null;
      applyBg(state.background,false);
      if(state.background){
        root.style.background='#000';
      } else {
        // No background file → a themed stand-in for the photo, seen through the wash.
        var stc=state.themeColors;
        var sc1=(stc&&stc.primary)||'#1b2c4d';
        root.style.background='radial-gradient(58% 46% at 74% 22%,rgba(255,205,140,.30) 0%,rgba(0,0,0,0) 72%),'
          +'linear-gradient(160deg,'+sc1+' 0%,#152238 42%,#2a2b34 72%,#4a3a2c 100%)';
      }
      var sf='saturate(.68) brightness(.62) contrast(1.06)';
      bgimg.style.filter=sf;bgvid.style.filter=sf;
      bgimg.style.animation='wfSermonDrift 240s ease-in-out infinite alternate';
      sermon.style.display='block';sermonOn=true;
      var skey=sermonKey(state);
      if(skey!==prevSermonKey){
        prevSermonKey=skey;
        sermon.innerHTML=sermonHtml(state);
        fitText(sermon.querySelector('.s-title'),9,4.2,window.innerWidth*0.60,window.innerWidth*0.19);
      }
      return;
    }
    if(m==='lyrics'||m==='text'){
      applyBg(state.background,true);
      if(state.blurBehindText){content.style.backdropFilter='blur(10px)';content.style.webkitBackdropFilter='blur(10px)';content.style.background='rgba(20,20,30,.3)';content.style.width='100%';content.style.maxWidth='100%';content.style.padding='24px 48px';}
      var tc=state.themeColors;
      if(!state.background) root.style.background=(tc&&tc.primary)||'#0a1628';
      var textColor=state.background?'#fff':(tc&&tc.text)||'#fff';
      var shadow=state.background?'text-shadow:0 2px 24px rgba(0,0,0,0.8);':'';
      var fs=Math.max(3,Math.min(state.fontScale||6,12));
      var lineChanged=state.line!==prevLine;prevLine=state.line;
      content.innerHTML='<div class="'+(lineChanged?'fade-up':'')+'" style="font-size:'+fs+'vw;font-weight:800;line-height:1.25;color:'+textColor+';white-space:pre-line;'+shadow+'">'+esc(state.line)+'</div>'
        +(state.title?'<div style="margin-top:2vw;font-size:'+(fs*0.3)+'vw;color:'+textColor+';opacity:0.5;font-weight:600;letter-spacing:0.15em;text-transform:uppercase">'+esc(state.title)+'</div>':'');
      // Reserve the actual title block height (title + its 2vw top margin) so a long
      // titled slide shrinks to fit both, not just the line.
      var titleH=content.children.length>1?content.children[1].getBoundingClientRect().height+window.innerWidth*0.02:0;
      fitText(content.firstChild,fs,2,window.innerWidth*0.82,window.innerHeight*0.90-titleH);
      return;
    }
    if(m==='countdown'){
      root.style.background='#050a14';bgvid.style.opacity='0';bgimg.style.opacity='0';overlay.style.opacity='0';
      if(state.blurBehindText){content.style.backdropFilter='blur(10px)';content.style.webkitBackdropFilter='blur(10px)';content.style.background='rgba(20,20,30,.3)';content.style.width='100%';content.style.maxWidth='100%';content.style.padding='24px 48px';}
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
      current.innerHTML=state.imagePath
        ?'<img src="'+fileUrl(state.imagePath)+'" style="max-width:40vw;max-height:40vh;object-fit:contain;opacity:0.85"/>'
        :'<div style="font-size:4vw;font-weight:700;color:rgba(255,255,255,0.15)">\\u271d Logo</div>';
      nextLine.textContent='';slideCounter.textContent='';return;
    }
    if(m==='countdown'){
      var mins=Math.floor(state.secondsLeft/60),secs=state.secondsLeft%60;
      current.innerHTML='<div style="font-size:18vw;font-weight:900;color:#fff;font-variant-numeric:tabular-nums;letter-spacing:-0.03em">'+mins+':'+(secs<10?'0':'')+secs+'</div>';
      nextLine.textContent='';slideCounter.textContent='';return;
    }
    if(m==='sermon'){
      // The back screens are showing the designed title card — the team just
      // needs to know which message is up, and who is preaching what.
      var sp=sermonParts(state);
      var sub=[sp.speaker,sp.passage].filter(Boolean).join('  \\u2022  ');
      // #current is a flex row — wrap both lines so they stack instead of sitting side by side.
      current.innerHTML='<div style="width:100%">'
        +'<div style="font-size:7vw;font-weight:900;line-height:1.15;color:#fff">'+esc(state.title||'')+'</div>'
        +(sub?'<div style="margin-top:2vh;font-size:2.4vw;font-weight:700;letter-spacing:0.06em;color:rgba(255,255,255,0.45)">'+esc(sub)+'</div>':'')
        +'</div>';
      var wrap=current.firstChild;
      var subH=wrap.children.length>1?wrap.children[1].getBoundingClientRect().height+window.innerHeight*0.02:0;
      fitText(wrap.firstChild,7,3,current.clientWidth-window.innerWidth*0.10,current.clientHeight-subH-window.innerWidth*0.06);
      nextLine.textContent='';slideCounter.textContent='';return;
    }
    var fs=Math.max(5,Math.min(state.fontScale||6,12));
    var lineChanged=state.line!==prevLine;prevLine=state.line;
    current.innerHTML='<div class="'+(lineChanged?'fade-in':'')+'" style="font-size:'+fs+'vw;font-weight:900;line-height:1.2;color:#fff;white-space:pre-line">'+esc(state.line||'\\u2014')+'</div>';
    // #current is a bounded flex:1 box (padding 3vw 5vw) — fit within its real content area.
    fitText(current.firstChild,fs,3,current.clientWidth-window.innerWidth*0.10,current.clientHeight-window.innerWidth*0.06);
    nextLine.textContent=state.next||'';
    slideCounter.textContent=state.total>1?'Slide '+(state.index+1)+' of '+state.total:'';
  }
  render();
`

// ── Assemble ──────────────────────────────────────────────────────────────────
const FLEX_BODY = `<div id="root"><video id="bgvid" autoplay muted loop playsinline></video><div id="bgimg"></div><div id="blob1"></div><div id="blob2"></div><div id="overlay"></div><div id="sermon" style="display:none"></div><div id="content"></div></div>`
const STAGE_BODY = `<div id="wrap"><div id="topbar"><div id="songtitle"></div><div id="clock"></div></div><div id="stagemsg"><span></span></div><div id="current"></div><div id="divider"></div><div id="nextsection"><div id="nextlabel">Next</div><div id="nextline"></div></div><div id="slidecounter"></div></div>`

const ZONE_PARTS: Record<number, [string, string, string]> = {
  1: [FLEX_CSS,   FLEX_BODY,         FLEX_SCRIPT],
  2: [FLEX_CSS,   FLEX_BODY,         FLEX_SCRIPT],
  3: [LYRICS_CSS, LYRICS_BODY_INNER, LYRICS_SCRIPT],
  4: [STAGE_CSS,  STAGE_BODY,        STAGE_SCRIPT],
}

/**
 * Build a zone page. Rendered per request rather than once at import, because
 * the Live Call token is generated lazily and does not exist yet at module load.
 * Returns null for an unknown zone id.
 */
export function zoneHtmlFor(zoneId: number, livecallToken: string, livecallRoom: string): string | null {
  const parts = ZONE_PARTS[zoneId]
  if (!parts) return null
  return zoneBase(zoneId, parts[0], parts[1], parts[2], livecallToken, livecallRoom)
}

export const ZONE_IDS = [1, 2, 3, 4]
