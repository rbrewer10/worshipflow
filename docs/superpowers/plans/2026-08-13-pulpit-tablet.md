# Pulpit Tablet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the pastor a pulpit-side tablet view that shows his notes alongside the sermon verse the congregation is currently seeing, doubles as a stage monitor during songs/announcements, and lets him advance through verses himself.

**Architecture:** Sermon items gain an ordered list of `{reference, notes}` verses, resolved into slide text via the existing scripture lookup. A new `sermonSlides` field on the live track carries the resolved reference+text+notes per slide, riding the *existing* `t.index`/next-prev machinery — no new advance mechanism needed. A new browser-servable page (`/pulpit`) reuses the tablet remote's existing WebSocket protocol (state push + PIN-gated `intent` messages) wholesale; it needs no new server-side auth or advance code, only new HTML/CSS/JS to render it as a two-pane view instead of a remote control.

**Tech Stack:** Electron main process (Node `http`/`ws`), vanilla-JS server-rendered pages (no React on the wire), React/TypeScript renderer for Build Service, Vitest for pure-logic tests.

---

## File Structure

- **Create** `src/shared/sermonVerses.ts` — pure logic: given an intro line, a list of `{reference, notes}`, and a lookup function, produces the resolved slide array. No Electron dependency, fully unit-testable.
- **Create** `src/shared/sermonVerses.test.ts` — tests for the above.
- **Modify** `src/shared/types.ts` — add `sermonReference`/`sermonNotes` to `LiveState`.
- **Modify** `src/main/index.ts` — add `sermonSlides` to `LiveTrackState` + its initializer, wire `buildSermonSlides` into `doLoadSermon`, add the two new fields to `renderState()`, register the `/pulpit` HTTP route.
- **Create** `src/main/pulpitHtml.ts` — the pulpit page itself (HTML/CSS/vanilla JS), modeled on `src/main/tabletHtml.ts`'s PIN-gate + WebSocket pattern.
- **Create** `src/renderer/src/editors/SermonVersesEditor.tsx` — Build Service UI for adding/reordering/deleting verse+notes rows on a sermon item, modeled on `src/renderer/src/AnnouncementItemEditor.tsx`.
- **Modify** `src/renderer/src/ItemEditor.tsx` — render `SermonVersesEditor` alongside the existing `SermonEditor` for sermon items.

---

### Task 1: Pure sermon-slide resolution logic

**Files:**
- Create: `src/shared/sermonVerses.ts`
- Test: `src/shared/sermonVerses.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/shared/sermonVerses.test.ts
import { describe, it, expect } from 'vitest'
import { buildSermonSlides } from './sermonVerses'

describe('buildSermonSlides', () => {
  it('always starts with the intro slide, no reference or notes', () => {
    const slides = buildSermonSlides('He\'s Alive\nJohn 3:16-22', [], () => ({ ok: false }))
    expect(slides).toEqual([{ text: 'He\'s Alive\nJohn 3:16-22', reference: null, notes: null }])
  })

  it('resolves a verse reference into slide text via the lookup function', () => {
    const lookup = (ref: string) => ref === 'John 3:16'
      ? { ok: true, verses: [{ n: 16, text: 'For God so loved the world...' }] }
      : { ok: false }
    const slides = buildSermonSlides('Intro', [{ reference: 'John 3:16', notes: 'Point one' }], lookup)
    expect(slides).toEqual([
      { text: 'Intro', reference: null, notes: null },
      { text: 'For God so loved the world...', reference: 'John 3:16', notes: 'Point one' }
    ])
  })

  it('joins multiple verses from one reference into a single slide of text', () => {
    const lookup = () => ({
      ok: true,
      verses: [{ n: 16, text: 'Verse sixteen.' }, { n: 17, text: 'Verse seventeen.' }]
    })
    const slides = buildSermonSlides('Intro', [{ reference: 'John 3:16-17', notes: '' }], lookup)
    expect(slides[1].text).toBe('Verse sixteen. Verse seventeen.')
  })

  it('falls back to a readable placeholder when a reference fails to resolve', () => {
    const lookup = () => ({ ok: false })
    const slides = buildSermonSlides('Intro', [{ reference: 'Not A Real Book 1:1', notes: '' }], lookup)
    expect(slides[1].text).toBe("(couldn't find Not A Real Book 1:1)")
  })

  it('falls back to the placeholder when lookup succeeds but returns no verses', () => {
    const lookup = () => ({ ok: true, verses: [] })
    const slides = buildSermonSlides('Intro', [{ reference: 'Empty 1:1', notes: '' }], lookup)
    expect(slides[1].text).toBe("(couldn't find Empty 1:1)")
  })

  it('preserves verse order and keeps notes attached to the right slide', () => {
    const lookup = (ref: string) => ({ ok: true, verses: [{ n: 1, text: ref }] })
    const slides = buildSermonSlides('Intro', [
      { reference: 'A', notes: 'first' },
      { reference: 'B', notes: 'second' }
    ], lookup)
    expect(slides[1]).toEqual({ text: 'A', reference: 'A', notes: 'first' })
    expect(slides[2]).toEqual({ text: 'B', reference: 'B', notes: 'second' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/shared/sermonVerses.test.ts`
Expected: FAIL — `Cannot find module './sermonVerses'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// src/shared/sermonVerses.ts
// A sermon's live "deck": an intro slide followed by one slide per verse the
// pastor preaches through, each carrying his own notes. Kept pure (a lookup
// function is passed in, never imported) so it's testable without Electron —
// see the matching comment convention in src/main/backgroundFolders.ts.

export interface SermonVerse {
  reference: string
  notes: string
}

export interface SermonSlide {
  text: string
  reference: string | null
  notes: string | null
}

export interface ScriptureLookupResult {
  ok: boolean
  verses?: { n: number; text: string }[]
}

export function buildSermonSlides(
  introLine: string,
  verses: SermonVerse[],
  lookup: (reference: string) => ScriptureLookupResult
): SermonSlide[] {
  const slides: SermonSlide[] = [{ text: introLine, reference: null, notes: null }]
  for (const verse of verses) {
    const result = lookup(verse.reference)
    const text = result.ok && result.verses && result.verses.length > 0
      ? result.verses.map((v) => v.text).join(' ')
      : `(couldn't find ${verse.reference})`
    slides.push({ text, reference: verse.reference, notes: verse.notes })
  }
  return slides
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/shared/sermonVerses.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/shared/sermonVerses.ts src/shared/sermonVerses.test.ts
git commit -m "feat: pure sermon-slide resolution logic"
```

---

### Task 2: Wire sermon slides into the live track

**Files:**
- Modify: `src/shared/types.ts:25-60` (the `LiveState` interface)
- Modify: `src/main/index.ts:246-296` (the `LiveTrackState` interface)
- Modify: `src/main/index.ts:298-329` (`createTrackState`)
- Modify: `src/main/index.ts:636-674` (`renderState`)
- Modify: `src/main/index.ts:1210-1233` (`doLoadSermon`)

- [ ] **Step 1: Add the two new fields to `LiveState`**

In `src/shared/types.ts`, the `LiveState` interface currently ends:

```ts
  rehearsal?: boolean
}
```

Change to:

```ts
  rehearsal?: boolean
  // The current sermon slide's scripture reference and the pastor's own notes
  // for it — null on the intro slide (index 0) and for every non-sermon item.
  // Populated by renderState() from the live track's sermonSlides array.
  sermonReference?: string | null
  sermonNotes?: string | null
}
```

- [ ] **Step 2: Add `sermonSlides` to `LiveTrackState` and its initializer**

In `src/main/index.ts`, add the import at the top with the other shared imports (near line 108, alongside the existing `lookupScripture` import):

```ts
import { buildSermonSlides, type SermonVerse, type SermonSlide } from '../shared/sermonVerses'
```

In the `LiveTrackState` interface (ends at line 296 with `deckScripture: Map<string, string>`), change the closing to:

```ts
  deckScripture: Map<string, string>
  // The current sermon's resolved slides (intro + one per verse), when the
  // live item is a sermon with verses. Index-aligned with t.song.lines/t.index
  // — see buildSermonSlides. null for every non-sermon item.
  sermonSlides: SermonSlide[] | null
}
```

In `createTrackState` (ends at line 328 with `deckScripture: new Map()`), change the closing to:

```ts
    deckScripture: new Map(),
    sermonSlides: null
  }
}
```

- [ ] **Step 3: Expose the current slide's reference/notes from `renderState`**

In `src/main/index.ts`, `renderState` (lines 636-674) currently ends:

```ts
    blurBehindText: t.blurBehindText,
    rehearsal: rehearsalMode
  }
}
```

Change to:

```ts
    blurBehindText: t.blurBehindText,
    rehearsal: rehearsalMode,
    sermonReference: t.hasLiveContent ? (t.sermonSlides?.[t.index]?.reference ?? null) : null,
    sermonNotes: t.hasLiveContent ? (t.sermonSlides?.[t.index]?.notes ?? null) : null
  }
}
```

- [ ] **Step 4: Resolve verses when a sermon goes live**

In `src/main/index.ts`, `doLoadSermon` (lines 1210-1233) currently reads:

```ts
function doLoadSermon(track: TrackId, title: string, speaker: string, passage: string, background?: string | null, blurBehindText?: boolean, item?: ServiceItem | null, bgFit?: 'cover' | 'contain'): void {
  const t = tracks[track]
  t.loadGeneration++
  t.hasLiveContent = true
  clearCountdown(track); clearAutoAdvance(track)
  t.songId = null; t.scriptureRef = null
  clearSongMeta(track)
  t.bgFit = bgFit ?? 'cover'
  t.deckSlides = null
  const line = [speaker, passage].filter(Boolean).join('\n')
  t.song = { title, lines: [line], background: background ?? null }
  t.songTextColor = null; t.songFont = null
  t.blurBehindText = blurBehindText ?? false
  t.mode = 'logo'
  t.index = 0
  if (item) void loadDeckOnto(track, item, t.loadGeneration)
}
```

Change to:

```ts
function doLoadSermon(track: TrackId, title: string, speaker: string, passage: string, background?: string | null, blurBehindText?: boolean, item?: ServiceItem | null, bgFit?: 'cover' | 'contain'): void {
  const t = tracks[track]
  t.loadGeneration++
  t.hasLiveContent = true
  clearCountdown(track); clearAutoAdvance(track)
  t.songId = null; t.scriptureRef = null
  clearSongMeta(track)
  t.bgFit = bgFit ?? 'cover'
  t.deckSlides = null
  const line = [speaker, passage].filter(Boolean).join('\n')
  const verses = (item?.payload.verses as SermonVerse[] | undefined) ?? []
  const slides = buildSermonSlides(line, verses, lookupScripture)
  t.song = { title, lines: slides.map((s) => s.text), background: background ?? null }
  t.sermonSlides = slides
  t.songTextColor = null; t.songFont = null
  t.blurBehindText = blurBehindText ?? false
  t.mode = 'logo'
  t.index = 0
  if (item) void loadDeckOnto(track, item, t.loadGeneration)
}
```

(`lookupScripture(input: string): ScriptureResult` is already imported at `src/main/index.ts:108` and is structurally compatible with the `ScriptureLookupResult` parameter type — no adapter needed.)

- [ ] **Step 5: Typecheck and run the full test suite**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

Run: `npm test`
Expected: all existing tests still pass (this task adds no new tests of its own — `doLoadSermon`/`renderState` are Electron-coupled orchestration code, untestable under this project's `vitest.config.ts`, which is `node`-environment/pure-`.ts`-only by design; Task 1's tests cover the actual new logic).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/index.ts
git commit -m "feat: resolve sermon verses into live track slides"
```

---

### Task 3: Build Service — "Verses" editor on sermon items

**Files:**
- Create: `src/renderer/src/editors/SermonVersesEditor.tsx`
- Modify: `src/renderer/src/ItemEditor.tsx:188-197`

- [ ] **Step 1: Write the editor component**

```tsx
// src/renderer/src/editors/SermonVersesEditor.tsx
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import type { SermonVerse } from '../../../shared/sermonVerses'

// Add/reorder/delete rows of {reference, notes} on a sermon item — same
// add/reorder-in-place shape as AnnouncementItemEditor's refIds list, just
// with richer rows (an object per verse instead of a bare id).
export function SermonVersesEditor({ verses, onChange }: {
  verses: SermonVerse[]
  onChange: (verses: SermonVerse[]) => void
}): JSX.Element {
  const addVerse = (): void => {
    onChange([...verses, { reference: '', notes: '' }])
  }

  const updateVerse = (index: number, next: Partial<SermonVerse>): void => {
    onChange(verses.map((v, i) => (i === index ? { ...v, ...next } : v)))
  }

  const removeVerse = (index: number): void => {
    onChange(verses.filter((_, i) => i !== index))
  }

  const move = (index: number, delta: number): void => {
    const target = index + delta
    if (target < 0 || target >= verses.length) return
    const next = [...verses]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="section-header">Verses</span>
        <button type="button" onClick={addVerse} className="btn-pill text-xs">
          <Plus size={12} /> Add verse
        </button>
      </div>

      {verses.length === 0 && (
        <p className="text-[11px] leading-snug text-slate-400">
          No verses yet — his pulpit tablet will just show the title card until you add some.
        </p>
      )}

      <ol className="space-y-2">
        {verses.map((verse, index) => (
          <li key={index} className="card space-y-2 p-2">
            <div className="flex items-center gap-2">
              <input
                value={verse.reference}
                placeholder="e.g. John 3:16-17"
                onChange={(e) => updateVerse(index, { reference: e.target.value })}
                aria-label={`Verse ${index + 1} reference`}
                className="flex-1"
              />
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0}
                aria-label={`Move verse ${index + 1} up`} className="btn-icon">
                <ChevronUp size={14} />
              </button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === verses.length - 1}
                aria-label={`Move verse ${index + 1} down`} className="btn-icon">
                <ChevronDown size={14} />
              </button>
              <button type="button" onClick={() => removeVerse(index)}
                aria-label={`Remove verse ${index + 1}`} className="btn-icon">
                <Trash2 size={14} />
              </button>
            </div>
            <textarea
              value={verse.notes}
              placeholder="Notes for this verse"
              onChange={(e) => updateVerse(index, { notes: e.target.value })}
              aria-label={`Verse ${index + 1} notes`}
              rows={2}
              className="w-full"
            />
          </li>
        ))}
      </ol>
    </div>
  )
}
```

- [ ] **Step 2: Wire it into `ItemEditor.tsx`**

In `src/renderer/src/ItemEditor.tsx`, add the import alongside the other editor imports (near line 13):

```tsx
import { SermonVersesEditor } from './editors/SermonVersesEditor'
```

And add `SermonVerse` to the existing type import from `sermonVerses` (new import line, since `../../shared/types` doesn't carry it):

```tsx
import type { SermonVerse } from '../../shared/sermonVerses'
```

Then change the sermon block (lines 188-197) from:

```tsx
      {item.type === 'sermon' && (
        <SermonEditor
          title={(payload.title as string) ?? ''}
          speaker={(payload.speaker as string) ?? ''}
          passage={(payload.passage as string) ?? ''}
          onTitleChange={(title) => savePayload({ ...payload, title })}
          onSpeakerChange={(speaker) => savePayload({ ...payload, speaker })}
          onPassageChange={(passage) => savePayload({ ...payload, passage })}
        />
      )}
```

to:

```tsx
      {item.type === 'sermon' && (
        <>
          <SermonEditor
            title={(payload.title as string) ?? ''}
            speaker={(payload.speaker as string) ?? ''}
            passage={(payload.passage as string) ?? ''}
            onTitleChange={(title) => savePayload({ ...payload, title })}
            onSpeakerChange={(speaker) => savePayload({ ...payload, speaker })}
            onPassageChange={(passage) => savePayload({ ...payload, passage })}
          />
          <SermonVersesEditor
            verses={(payload.verses as SermonVerse[] | undefined) ?? []}
            onChange={(verses) => savePayload({ ...payload, verses })}
          />
        </>
      )}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Manually verify in the running app**

Build and launch the app (`npm run build && npm run start`, or your usual dev workflow), open Build Service, select a sermon item, and confirm:
- A "Verses" section appears below the existing Title/Speaker/Passage fields.
- "Add verse" appends a blank reference+notes row.
- Typing in the reference/notes fields, and using the up/down/trash buttons, all persist (check the item still shows the same verses after switching to another item and back).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/editors/SermonVersesEditor.tsx src/renderer/src/ItemEditor.tsx
git commit -m "feat: add a Verses editor to sermon items in Build Service"
```

---

### Task 4: The pulpit tablet page

**Files:**
- Create: `src/main/pulpitHtml.ts`
- Modify: `src/main/index.ts:1804-1906` (`startTabletServer`'s request handler)

This task reuses the *existing* tablet WebSocket protocol wholesale — the same `wss` server, the same `{type:'auth',pin}` → `authResult` handshake, the same `{type:'state',...}` push, and the same `{type:'intent',intent}` → `processIntent('main', ...)` control path that `src/main/tabletHtml.ts` and the tablet remote already use (`src/main/index.ts:1938-1992`). No new server-side auth, advance, or broadcast code is needed — only a new page.

- [ ] **Step 1: Write the pulpit page**

```ts
// src/main/pulpitHtml.ts
// The pastor's pulpit tablet: notes + verse when a sermon is live, the same
// content the Stage Monitor TV shows otherwise. Reuses the existing tablet
// WebSocket protocol (auth, state push, intent) wholesale — see tabletHtml.ts
// for the pattern this borrows: PIN gate, cached PIN in localStorage, the
// same {type:'auth'}/{type:'intent'} messages.
export function pulpitHtml(churchName: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>${churchName} — Pulpit</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-user-select:none;user-select:none}
html,body{width:100%;height:100%;background:#0a0d10;color:#e8ebed;font-family:-apple-system,system-ui,sans-serif;overflow:hidden}
#root{display:flex;flex-direction:column;width:100vw;height:100vh}
#header{flex:0 0 auto;padding:10px 20px;font-size:14px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a939c;border-bottom:1px solid #1c2226}
#split{flex:1;display:flex;min-height:0}
#notes,#verse{flex:1;padding:24px;overflow:auto;white-space:pre-line}
#notes{background:#12171b;border-right:2px solid #1c2226;font-size:22px;line-height:1.5}
#verse{background:#0a0d10;font-size:26px;line-height:1.55;font-weight:600}
#verseRef{font-size:15px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#8a939c;margin-bottom:12px}
#stage{flex:1;display:none;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center}
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
  <div id="header">Not connected</div>
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

function esc(s) {
  var d = document.createElement('div')
  d.textContent = s == null ? '' : s
  return d.innerHTML
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
  document.getElementById('header').textContent = s.songTitle || 'Not live'
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
    if (cachedPin) ws.send(JSON.stringify({ type: 'auth', pin: cachedPin }))
    else showPinGate()
  }
  ws.onclose = function () { setTimeout(connect, 2000) }
  ws.onerror = function () { ws.close() }
  ws.onmessage = function (ev) {
    try { apply(JSON.parse(ev.data)) } catch (e) { /* ignore malformed */ }
  }
}
connect()
</script>
</body>
</html>`
}
```

- [ ] **Step 2: Register the `/pulpit` route**

In `src/main/index.ts`, add the import near the other `*Html` imports (alongside wherever `tabletHtml` is imported from):

```ts
import { pulpitHtml } from './pulpitHtml'
```

In `startTabletServer`'s request handler (`src/main/index.ts:1804-1906`), the routing currently checks `path === '/phone'`, `path === '/room-feed'`, `path === '/file'`, then falls through to the default tablet-remote page. Add a branch for `/pulpit` right after the `/room-feed` branch (before `/file`) — i.e. change:

```ts
    } else if (path === '/room-feed') {
      const host = req.headers.host ?? `localhost:${boundTabletPort}`
      const proto = req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws'
      res.writeHead(200, htmlHeaders)
      res.end(roomFeedViewerHtml(`${proto}://${host}/livecall`, livecallToken(), 'room-feed'))
    } else if (path === '/file') {
```

to:

```ts
    } else if (path === '/room-feed') {
      const host = req.headers.host ?? `localhost:${boundTabletPort}`
      const proto = req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws'
      res.writeHead(200, htmlHeaders)
      res.end(roomFeedViewerHtml(`${proto}://${host}/livecall`, livecallToken(), 'room-feed'))
    } else if (path === '/pulpit') {
      res.writeHead(200, htmlHeaders)
      res.end(pulpitHtml(getSetting('church_name')?.trim() || 'Snow Hill Church'))
    } else if (path === '/file') {
```

The page's WebSocket connects to `/` (the same default `wss` the tablet remote uses — see `pulpitHtml`'s `connect()`), so it lands on the exact same `wss.on('connection', ...)` handler already wired for auth (`{type:'auth'}` → `authedTabletClients`, `src/main/index.ts:1965-1984`) and intents (`{type:'intent'}` → `processIntent('main', ...)`, `src/main/index.ts:1991-1992`). No changes are needed there.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Manually verify**

With the app running and the tablet server started, open `http://localhost:3691/pulpit` in a browser and confirm:
- The PIN gate appears; entering the wrong PIN shows "Incorrect PIN"; the correct PIN (set via the existing tablet-remote PIN setting) unlocks it.
- With nothing live, the header reads "Not live" and the stage pane is empty.
- Go live with a song or announcement in the operator app — the page shows that item's content in the single stage-monitor-style pane (matching what the physical Stage Monitor TV shows).
- Go live with a sermon that has verses added (from Task 3) — the page switches to the split view: left pane shows the current verse's notes, right pane shows its reference + text.
- Click Next/Prev on the pulpit page and confirm the operator's own Live view advances in lockstep (same live position, either side can drive it) — and that the notes/verse pane updates to match.

- [ ] **Step 5: Commit**

```bash
git add src/main/pulpitHtml.ts src/main/index.ts
git commit -m "feat: add the pulpit tablet page"
```

---

## Physical Next/Prev buttons (not a task — no new code)

Per the design spec, this is deliberately not a build task here: the pulpit page's own Next/Prev already work by opening a WebSocket to the tablet server and sending `{type:'auth',pin}` then `{type:'intent',intent:'next'}` (see `pulpitHtml.ts`'s `send()`). A future physical-button device (a small Pi or WiFi microcontroller) is simply another client speaking that same existing protocol — no new server-side endpoint, and no changes to this plan's code, are needed to support it later.

## Self-Review

**Spec coverage:**
1. Sermon items become a verse deck → Task 1 (resolution logic) + Task 2 (wiring). ✓
2. Build Service "Verses" section → Task 3. ✓
3. Congregation screens — explicitly deferred to a follow-up design pass per the mid-brainstorm agreement; not a gap, a scoped-out non-goal for this plan. ✓ (noted, not silently dropped)
4. The pulpit tablet (mode-aware, PIN-gated, split view, shared control) → Task 4. ✓
5. Physical buttons → intentionally no new code; documented above. ✓

**Placeholder scan:** No TBD/TODO; every step has complete, real code. Task 3's "manually verify" and Task 4's "manually verify" steps are legitimate (no renderer/HTML test harness exists in this codebase — `vitest.config.ts` is `node`-environment, `.ts`-only by design), not a stand-in for a real test that should have been written.

**Type consistency:** `SermonVerse`/`SermonSlide` defined once in `src/shared/sermonVerses.ts` (Task 1) and imported by name everywhere else (Task 2's `doLoadSermon`, Task 3's editor and `ItemEditor.tsx`) — no redefinition, no drift.
