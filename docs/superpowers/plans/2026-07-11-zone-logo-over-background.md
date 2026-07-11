# Zone Back-Screens: Logo Over Live Background — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** During a song, Zones 1 & 2 ("Back Left" / "Back Right") render the church logo composited over the same live background the congregation sees (song video/image, or the animated theme gradient), instead of a flat dark logo screen.

**Architecture:** The zone screens are standalone HTML pages ([`src/main/zoneHtml.ts`](../../../src/main/zoneHtml.ts)) fed a `ZoneState` over WebSocket by `computeZoneStates()` in [`src/main/index.ts`](../../../src/main/index.ts). The Zone 1 & 2 renderer (`FLEX_SCRIPT`) already draws a file background behind the logo when `state.background` is set, but `computeZoneStates()` supplies a static `logoBg` in `'logo'` mode. Fix = (1) feed the live background/theme into the `'logo'` branch when something is live, and (2) teach `FLEX_SCRIPT`'s `'logo'` branch to draw an animated **theme-color** gradient when there's no file background (theme-only songs).

**Tech Stack:** Electron main process (TypeScript), vanilla-JS zone pages (template strings), WebSocket broadcast, SQL.js. No React on this path.

**Testing note:** The zone path is imperative DOM inside HTML strings and has no existing unit tests; verification is `tsc` + build + manual multiview check, per the existing pattern for this subsystem.

---

### Task 1: Feed the live background into the zone `logo` branch

**Files:**
- Modify: `src/main/index.ts` (the `else if (mode === 'logo')` branch inside `computeZoneStates()`, currently lines 400-403)

- [ ] **Step 1: Replace the logo branch**

Find this block (currently `src/main/index.ts:400-403`):

```ts
    } else if (mode === 'logo') {
      base.imagePath = logoPath
      base.background = logoBg
    }
```

Replace with:

```ts
    } else if (mode === 'logo') {
      base.imagePath = logoPath
      // Show the logo over the live background (song video/image, or the theme
      // gradient) whenever real content is live; fall back to the static logo
      // backdrop when idle or blacked out. Mirrors the 'lyrics'/'text' branch:
      // zones can't load `theme:<id>` files, so resolve themes to colors and let
      // the zone draw an animated gradient; file backgrounds pass through as-is.
      if (liveServiceItemId != null && live.mode !== 'black' && live.mode !== 'logo') {
        const isThemeBg = live.background?.startsWith('theme:') ?? false
        const themeId = isThemeBg ? live.background!.slice(6) : (live.slideTheme ?? null)
        base.background = isThemeBg ? null : live.background
        base.themeColors = resolveColors(getTheme(themeId), live.slideThemeColors)
      } else {
        base.background = logoBg
      }
    }
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:node`
Expected: PASS (no output errors). Confirms `resolveColors`, `getTheme`, `live.slideTheme`, `live.slideThemeColors` are all in scope here (they are — the `'lyrics'`/`'text'` branch above uses the same calls).

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(zones): feed live background into zone logo mode"
```

---

### Task 2: Draw the theme gradient behind the logo (theme-only songs)

**Files:**
- Modify: `src/main/zoneHtml.ts` (the `if(m==='logo'){...}` block inside `FLEX_SCRIPT`, currently lines 261-293)

Context: today the logo branch draws a file background if `state.background` is set, else a hardcoded dark gradient (`__logo_grad__`). It ignores `state.themeColors`. For a theme-only song, `computeZoneStates()` now passes `background=null` + `themeColors` set, so we add a middle case that paints an animated gradient from those colors — the same approach `LYRICS_SCRIPT.applyBg()` uses (lines 103-118).

- [ ] **Step 1: Replace the logo branch in FLEX_SCRIPT**

Find this block (currently `src/main/zoneHtml.ts:261-293`):

```js
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
        bgimg.style.backgroundImage='linear-gradient(135deg,#0c1a3a 0%,#0a1628 100%)';
        bgimg.style.backgroundSize='300% 300%';
        bgimg.style.animation='none';void bgimg.offsetHeight;
        bgimg.style.animation='gradDrift 20s ease infinite';
        bgimg.style.opacity='1';
        blob1.style.background='#0c1a3a';blob2.style.background='#162d6e';
        blob1.style.opacity='0.45';blob2.style.opacity='0.35';
        root.style.background='#000';
      }
      content.innerHTML=state.imagePath
        ?'<img src="'+fileUrl(state.imagePath)+'" style="max-width:55vw;max-height:45vh;object-fit:contain;filter:drop-shadow(0 0 80px rgba(0,0,0,0.7));display:block;position:relative;z-index:2">'
        :'<div style="font-size:15vw;font-weight:900;color:rgba(255,255,255,0.75);letter-spacing:-0.02em;position:relative;z-index:2">\\u271d</div>';
      return;
    }
```

Replace with (adds the `else if(state.themeColors)` middle case; the file-background and idle-gradient cases are unchanged):

```js
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
      } else if(state.themeColors){
        var tc=state.themeColors;
        var c1=tc.primary||'#0c1a3a',c2=tc.secondary||'#162d6e';
        var themeKey='__theme__'+c1+'|'+c2;
        if(prevBg!==themeKey){
          prevBg=themeKey;
          bgvid.style.opacity='0';
          bgimg.style.backgroundImage='linear-gradient(135deg,'+c1+' 0%,'+c2+' 50%,'+c1+' 100%)';
          bgimg.style.backgroundSize='300% 300%';
          bgimg.style.animation='none';void bgimg.offsetHeight;
          bgimg.style.animation='gradDrift 20s ease infinite';
          bgimg.style.opacity='1';
          blob1.style.background=c1;blob2.style.background=c2;
          blob1.style.opacity='0.45';blob2.style.opacity='0.35';
          root.style.background='#000';
        }
      } else if(prevBg!=='__logo_grad__'){
        prevBg='__logo_grad__';
        bgvid.style.opacity='0';
        bgimg.style.backgroundImage='linear-gradient(135deg,#0c1a3a 0%,#0a1628 100%)';
        bgimg.style.backgroundSize='300% 300%';
        bgimg.style.animation='none';void bgimg.offsetHeight;
        bgimg.style.animation='gradDrift 20s ease infinite';
        bgimg.style.opacity='1';
        blob1.style.background='#0c1a3a';blob2.style.background='#162d6e';
        blob1.style.opacity='0.45';blob2.style.opacity='0.35';
        root.style.background='#000';
      }
      content.innerHTML=state.imagePath
        ?'<img src="'+fileUrl(state.imagePath)+'" style="max-width:55vw;max-height:45vh;object-fit:contain;filter:drop-shadow(0 0 80px rgba(0,0,0,0.7));display:block;position:relative;z-index:2">'
        :'<div style="font-size:15vw;font-weight:900;color:rgba(255,255,255,0.75);letter-spacing:-0.02em;position:relative;z-index:2">\\u271d</div>';
      return;
    }
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:node`
Expected: PASS. (`zoneHtml.ts` is a plain template string, so this mainly confirms nothing else broke.)

- [ ] **Step 3: Commit**

```bash
git add src/main/zoneHtml.ts
git commit -m "feat(zones): draw theme gradient behind logo on zones 1 and 2"
```

---

### Task 3: Build and manual verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both PASS with no errors.

- [ ] **Step 2: Manual multiview check**

Run the app (`npm run dev`), open the multiview (`/multiview`), and confirm on Zones 1 & 2:

- [ ] Song with a **video** background live → logo sits over the playing video.
- [ ] Song with an **image** background live → logo sits over the Ken-Burns image.
- [ ] Song using a **theme only** (no file background) live → logo sits over the animated theme-color gradient (not the old flat dark screen).
- [ ] **Black** mode → Zones 1 & 2 go dark (logo backdrop), background suppressed.
- [ ] **Idle** (no item live) → Zones 1 & 2 show the logo on the static dark gradient (unchanged from before).
- [ ] Zone 3 (Lyrics TVs) and Zone 4 (Stage) are visually unchanged from before.

- [ ] **Step 3: Commit (if any tweak was needed during verification)**

```bash
git add -A
git commit -m "fix(zones): verification tweaks for logo-over-background"
```

---

## Self-Review

- **Spec coverage:** Feature A success criteria — logo over video ✓ (Task 2 file-bg case, unchanged), logo over image ✓ (same), logo over theme gradient ✓ (Task 1 supplies themeColors + Task 2 new middle case), black fully blacks out ✓ (Task 1 gate excludes `live.mode==='black'`; Task 2 black branch unchanged). Idle unchanged ✓ (Task 1 `else` keeps `logoBg`; Task 2 `__logo_grad__` case unchanged).
- **Placeholders:** none.
- **Type consistency:** `resolveColors`, `getTheme`, `live.slideTheme`, `live.slideThemeColors`, `liveServiceItemId`, `live.mode`, `logoPath`, `logoBg` all already used in `computeZoneStates()`. `state.themeColors`, `state.background`, `state.imagePath`, `prevBg`, `bgimg`, `bgvid`, `blob1/2`, `KB`, `kbIdx`, `isVid`, `fileUrl` all already defined in `FLEX_SCRIPT`/`SHARED_JS`. No new identifiers introduced beyond local `tc`/`c1`/`c2`/`themeKey`.
