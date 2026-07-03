// Option B — "Console": the hardware desk, on glass.
// Skeuomorphic chrome (LED ladders, fader rails, engraved panel type, amber LCD)
// lives in a scoped <style> block — Tailwind can't express these gradients/glows.
// Throwaway design preview: hardcoded demo data, no IPC.

import { CHANNELS } from './demoData'
import type { DemoChannel, ViewMode } from './demoData'

const MIC = '#ffd23f'
const INST = '#7fe3c0'
const TRK = '#c9a6ff'

function stripColor(c: DemoChannel): string {
  if (c.kind === 'mic') return MIC
  if (c.kind === 'track') return TRK
  return INST
}

const SEGS = 18

function LedLadder({ lvl, hot }: { lvl: number; hot?: boolean }): JSX.Element {
  const lit = Math.round(lvl * SEGS)
  const segs: JSX.Element[] = []
  for (let i = 0; i < SEGS; i++) {
    let cls = ''
    if (i < lit) cls = i >= 15 ? 'r' : i >= 12 ? 'y' : 'g'
    if (hot && i >= 16) cls = 'r'
    segs.push(<i key={i} className={cls} />)
  }
  return (
    <span className="vb-led" aria-hidden="true">
      {segs}
    </span>
  )
}

function Strip({ c }: { c: DemoChannel }): JSX.Element {
  const faderPct = c.muted ? 6 : Math.round(8 + c.lvl * 72)
  return (
    <div className={`vb-strip${c.muted ? ' muted' : ''}`}>
      <span className="vb-scribble" style={{ background: stripColor(c) }}>{c.shortName}</span>
      <span className="vb-db">{c.dbConsole}</span>
      <span className="vb-meterwrap">
        <LedLadder lvl={c.lvl} hot={c.hot} />
        <span className="vb-rail">
          <span className="vb-cap" style={{ bottom: `${faderPct}%` }} />
        </span>
      </span>
      <span className={`vb-mute${c.muted ? ' lit' : ''}`}>MUTE</span>
      <span className="vb-db" style={{ color: '#6e7880' }}>CH {c.ch}</span>
    </div>
  )
}

function PatchModule({ c }: { c: DemoChannel }): JSX.Element {
  const isMic = c.kind === 'mic'
  const isTrk = c.kind === 'track'
  return (
    <div className="vb-mod">
      <p className="nm" style={{ margin: 0 }}>{c.name}</p>
      <p className="ch" style={{ margin: '2px 0 8px' }}>CH {c.ch} · TF-RACK</p>
      <span className="vb-sw">
        <span className={`vb-swb${isMic ? ' lit' : ''}`}>MIC</span>
        <span className={`vb-swb${isTrk ? ' lit trk' : ''}`}>TRK</span>
        <span className="vb-swb">LINE</span>
      </span>
    </div>
  )
}

function TopBar({ mode }: { mode: ViewMode }): JSX.Element {
  return (
    <div className="vb-top">
      <span className="vb-brand">Sound Check</span>
      <div className="vb-modes">
        <span className={`vb-modebtn${mode === 'setup' ? ' on' : ''}`}>Setup</span>
        <span className={`vb-modebtn${mode === 'live' ? ' on' : ''}`}>Sound Check</span>
        <span className="vb-modebtn">Auto</span>
      </div>
      <span className="vb-lcd">
        <i />TF-RACK · 192.168.1.100 · CONNECTED{mode === 'live' ? ' · STEP 3/8' : ''}
      </span>
    </div>
  )
}

function SetupDeck(): JSX.Element {
  return (
    <div className="vb-deck">
      <div style={{ flex: 1 }}>
        <p className="vb-etch">Patch bay — classify each channel</p>
        <div className="vb-patch">
          {CHANNELS.map((c) => (
            <PatchModule key={c.ch} c={c} />
          ))}
        </div>
      </div>
      <div className="vb-master">
        <div className="vb-panel">
          <p className="vb-etch">Reference deck</p>
          <span className="vb-rec"><i />Record Reference Mix — 5:00</span>
          <div className="vb-amber" style={{ marginTop: 9 }}>
            REF 01 &nbsp;JUN 28 2026<br />
            <span className="dim">“GOOD SUNDAY AM — FULL BAND”</span><br />
            LEN 05:00 &nbsp;AGE 4 DAYS &nbsp;<span>OK</span>
          </div>
        </div>
        <div className="vb-panel">
          <p className="vb-etch">Scene map</p>
          <div className="vb-amber">
            SONG&nbsp;&nbsp;&nbsp;&nbsp;&gt; SCN “WORSHIP”<br />
            ANNOUNCE&nbsp;&gt; MUTE TRK L/R<br />
            SCRIPTURE&gt; SCN “SPEECH”<br />
            PRAYER&nbsp;&nbsp;&gt; ALL −4 dB
          </div>
        </div>
        <div className="vb-panel">
          <p className="vb-etch">Sync</p>
          <div className="vb-amber">
            <span className="dim">CHANNELS IMPORTED FROM iPAD SETUP</span><br />
            11 CH &nbsp;·&nbsp; LAST SYNC 09:12:04
          </div>
        </div>
      </div>
    </div>
  )
}

function LiveDeck(): JSX.Element {
  return (
    <div className="vb-deck">
      <div className="vb-strips">
        {CHANNELS.map((c) => (
          <Strip key={c.ch} c={c} />
        ))}
      </div>
      <div className="vb-master">
        <div className="vb-panel">
          <p className="vb-etch">Alarm lamps</p>
          <div className="vb-lamps">
            <span className="vb-lamp red"><i /><b>FEEDBACK</b></span>
            <span className="vb-lamp yel"><i /><b>CLIP</b></span>
            <span className="vb-lamp grn"><i /><b>LEVEL OK</b></span>
          </div>
        </div>
        <div className="vb-panel" style={{ flex: 1 }}>
          <p className="vb-etch">Advisor</p>
          <div className="vb-amber">
            <span className="hot">! FEEDBACK 2.4 kHz</span><br />
            &nbsp;&nbsp;WORSHIP LDR VOX — CUT −3 dB<br />
            <span className="hot">! CLIP TRACKS L</span> <span className="dim">2.3% SMP</span><br />
            &nbsp;&nbsp;LOWER TRIM CH 09<br />
            <span className="dim">— REF COMPARE ——————</span><br />
            BASS +28% VS REF<br />
            &nbsp;&nbsp;PULL BASS DI −2 dB<br />
            PASTOR MIC −8% <span className="dim">@2 kHz</span><br />
            &nbsp;&nbsp;RAISE +1 dB
          </div>
        </div>
        <div className="vb-panel">
          <p className="vb-etch">Step 3 — Pastor Mic</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="vb-modebtn on" style={{ flex: 1, textAlign: 'center' }}>Pass</span>
            <span className="vb-modebtn" style={{ flex: 1, textAlign: 'center' }}>Fail</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const VB_CSS = `
.vb{background:linear-gradient(180deg,#12151a 0%,#0b0d10 55%,#08090b 100%);color:#cfd6d3;font-size:12px;min-height:100%;}
.vb *{box-sizing:border-box;}
.vb-top{display:flex;align-items:center;gap:18px;padding:12px 18px;border-bottom:1px solid #000;
  background:linear-gradient(180deg,#1b2027,#12151a);box-shadow:0 1px 0 rgba(255,255,255,.05) inset;}
.vb-brand{font-size:12px;font-weight:800;letter-spacing:.28em;color:#8d979f;text-transform:uppercase;
  text-shadow:0 1px 0 rgba(0,0,0,.9),0 -1px 0 rgba(255,255,255,.08);}
.vb-lcd{margin-left:auto;background:#141a10;border:1px solid #000;border-radius:5px;padding:6px 12px;
  box-shadow:inset 0 2px 8px rgba(0,0,0,.85),0 1px 0 rgba(255,255,255,.05);
  color:#a8e063;font-family:ui-monospace,"Cascadia Mono",Consolas,monospace;font-size:11.5px;letter-spacing:.06em;
  text-shadow:0 0 6px rgba(168,224,99,.45);font-variant-numeric:tabular-nums;}
.vb-lcd i{display:inline-block;width:7px;height:7px;border-radius:99px;background:#a8e063;box-shadow:0 0 8px rgba(168,224,99,.9);margin-right:7px;}
.vb-modes{display:flex;gap:10px;}
.vb-modebtn{position:relative;padding:8px 18px 13px;border-radius:6px;border:1px solid #05070a;
  background:linear-gradient(180deg,#2a3038,#181c22);color:#9aa4ad;font-size:11px;font-weight:700;
  letter-spacing:.18em;text-transform:uppercase;box-shadow:0 2px 3px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.09);
  text-shadow:0 1px 0 rgba(0,0,0,.8);}
.vb-modebtn::after{content:"";position:absolute;left:50%;transform:translateX(-50%);bottom:4px;width:22px;height:3px;border-radius:2px;background:#20262b;box-shadow:inset 0 1px 2px rgba(0,0,0,.8);}
.vb-modebtn.on{color:#ffd479;background:linear-gradient(180deg,#33393f,#1c2126);}
.vb-modebtn.on::after{background:#ffb340;box-shadow:0 0 8px rgba(255,179,64,.9);}
.vb-deck{display:flex;gap:14px;padding:16px 18px 20px;align-items:stretch;}
.vb-strips{display:flex;gap:5px;flex:1;background:linear-gradient(180deg,#14171c,#0e1013);border:1px solid #05070a;border-radius:8px;padding:12px 10px;
  box-shadow:inset 0 2px 12px rgba(0,0,0,.7);overflow-x:auto;}
.vb-strip{width:70px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:7px;
  background:linear-gradient(180deg,#1c2027,#14171c);border:1px solid #05070a;border-radius:6px;padding:8px 5px 10px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05);}
.vb-strip.muted{opacity:.55;}
.vb-scribble{width:100%;text-align:center;font-size:9px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;
  border-radius:3px;padding:4px 2px;line-height:1.25;color:#0b0d10;min-height:32px;display:flex;align-items:center;justify-content:center;}
.vb-db{font-family:ui-monospace,Consolas,monospace;font-size:10.5px;color:#d7dee4;font-variant-numeric:tabular-nums;
  background:#0a0c0e;border:1px solid #000;border-radius:3px;padding:2px 4px;width:100%;text-align:center;
  box-shadow:inset 0 1px 4px rgba(0,0,0,.8);}
.vb-meterwrap{display:flex;gap:7px;align-items:flex-end;height:170px;}
.vb-led{display:flex;flex-direction:column-reverse;gap:2px;width:12px;height:170px;background:#08090b;border:1px solid #000;border-radius:3px;padding:3px 2px;box-shadow:inset 0 1px 5px rgba(0,0,0,.9);}
.vb-led i{display:block;height:6px;border-radius:1px;background:#161a1e;}
.vb-led i.g{background:#37c96b;box-shadow:0 0 4px rgba(55,201,107,.55);}
.vb-led i.y{background:#ffd23f;box-shadow:0 0 4px rgba(255,210,63,.55);}
.vb-led i.r{background:#ff4d4d;box-shadow:0 0 5px rgba(255,77,77,.7);}
.vb-rail{width:24px;height:170px;position:relative;border-radius:3px;
  background:linear-gradient(90deg,#0e1013 38%,#04050a 50%,#0e1013 62%);}
.vb-rail::before{content:"";position:absolute;left:50%;top:6px;bottom:6px;width:3px;transform:translateX(-50%);
  background:#020304;border-radius:2px;box-shadow:0 0 0 1px rgba(255,255,255,.04);}
.vb-cap{position:absolute;left:50%;transform:translateX(-50%);width:24px;height:26px;border-radius:3px;
  background:linear-gradient(180deg,#3a4149,#20252b 45%,#151a1f 55%,#2a3036);border:1px solid #000;
  box-shadow:0 3px 5px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.14);}
.vb-cap::after{content:"";position:absolute;left:3px;right:3px;top:12px;height:2px;background:#e8edf0;border-radius:1px;}
.vb-mute{width:100%;text-align:center;font-size:8.5px;font-weight:800;letter-spacing:.14em;padding:4px 0;border-radius:3px;
  border:1px solid #05070a;background:linear-gradient(180deg,#262c33,#171b20);color:#7d868e;
  box-shadow:0 1px 2px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.07);}
.vb-mute.lit{color:#fff;background:linear-gradient(180deg,#c23434,#8f1f1f);box-shadow:0 0 10px rgba(255,60,60,.55),inset 0 1px 0 rgba(255,255,255,.2);}
.vb-master{width:270px;flex-shrink:0;display:flex;flex-direction:column;gap:10px;}
.vb-panel{background:linear-gradient(180deg,#1a1e24,#12151a);border:1px solid #05070a;border-radius:8px;padding:11px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05);}
.vb-etch{font-size:9px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:#6e7880;margin:0 0 8px;
  text-shadow:0 1px 0 rgba(0,0,0,.9),0 -1px 0 rgba(255,255,255,.06);}
.vb-amber{background:#1c1206;border:1px solid #000;border-radius:5px;padding:9px 11px;box-shadow:inset 0 2px 10px rgba(0,0,0,.85);
  font-family:ui-monospace,"Cascadia Mono",Consolas,monospace;font-size:11px;line-height:1.55;color:#ffb340;
  text-shadow:0 0 6px rgba(255,179,64,.4);}
.vb-amber .dim{color:#8a6120;} .vb-amber .hot{color:#ff6a3d;text-shadow:0 0 7px rgba(255,106,61,.6);}
.vb-lamps{display:flex;gap:8px;}
.vb-lamp{flex:1;text-align:center;border-radius:5px;border:1px solid #05070a;padding:7px 4px 6px;
  background:linear-gradient(180deg,#20252b,#14181d);box-shadow:inset 0 1px 0 rgba(255,255,255,.06);}
.vb-lamp b{display:block;font-size:8px;font-weight:800;letter-spacing:.16em;color:#6e7880;margin-top:4px;}
.vb-lamp i{display:block;width:14px;height:14px;border-radius:99px;margin:0 auto;background:#1a1e23;border:1px solid #000;}
.vb-lamp.red i{background:#ff4d4d;box-shadow:0 0 12px rgba(255,77,77,.85);}
.vb-lamp.yel i{background:#ffd23f;box-shadow:0 0 12px rgba(255,210,63,.8);}
.vb-lamp.grn i{background:#37c96b;box-shadow:0 0 10px rgba(55,201,107,.8);}
.vb-rec{display:flex;align-items:center;gap:10px;border-radius:6px;border:1px solid #05070a;padding:9px 12px;width:100%;
  background:linear-gradient(180deg,#2a3038,#181c22);color:#cfd6d3;font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;
  box-shadow:0 2px 3px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.09);}
.vb-rec i{width:13px;height:13px;border-radius:99px;background:#ff4d4d;border:2px solid #5a1010;box-shadow:0 0 8px rgba(255,77,77,.6);}
.vb-patch{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;flex:1;}
.vb-mod{background:linear-gradient(180deg,#1c2027,#14171c);border:1px solid #05070a;border-radius:6px;padding:9px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05);}
.vb-mod .nm{font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#d7dee4;}
.vb-mod .ch{font-family:ui-monospace,Consolas,monospace;font-size:9.5px;color:#6e7880;margin-bottom:8px;}
.vb-sw{display:flex;gap:6px;}
.vb-swb{flex:1;font-size:8.5px;font-weight:800;letter-spacing:.1em;padding:5px 0;text-align:center;border-radius:3px;
  border:1px solid #05070a;background:linear-gradient(180deg,#262c33,#171b20);color:#7d868e;
  box-shadow:0 1px 2px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.07);}
.vb-swb.lit{color:#0b0d10;background:linear-gradient(180deg,#ffd23f,#e0a71f);box-shadow:0 0 9px rgba(255,210,63,.45),inset 0 1px 0 rgba(255,255,255,.4);}
.vb-swb.lit.trk{background:linear-gradient(180deg,#5fd3ff,#2ba3d4);box-shadow:0 0 9px rgba(95,211,255,.4),inset 0 1px 0 rgba(255,255,255,.4);}
`

function VariantB({ mode }: { mode: ViewMode }): JSX.Element {
  return (
    <div className="vb min-h-full">
      <style>{VB_CSS}</style>
      <TopBar mode={mode} />
      {mode === 'setup' ? <SetupDeck /> : <LiveDeck />}
    </div>
  )
}

export default VariantB
