# Pulpit tablet — design spec

## Problem

The pastor preaches from notes with no connection to what WorshipFlow is doing. He can't see what the congregation is currently looking at (which verse, which slide), and he has no personal reference for what he meant to say about it. Meanwhile a tablet at the pulpit sits idle outside the sermon.

## Scope

**This phase:** a pulpit-facing tablet view inside WorshipFlow itself, plus the sermon-item changes it depends on. Verses and notes are typed directly into Build Service for now.

**Explicitly deferred:** authoring notes/verses in the Snow Hill Church app and syncing them into WorshipFlow. That's a second, independent project — a different app, a new editor, an export/import path — and doesn't block this one. Nothing in this phase should make that harder to add later (verses+notes live on the sermon record either way; a future import path just becomes another way to populate the same fields).

**Also explicitly out of scope:** the existing "Stage Monitor" TV at the back of the church is untouched — it keeps doing what it does today. The pulpit tablet is an *additional* device, not a replacement.

## 1. Sermon items become a verse deck

A sermon item keeps its existing identity fields (title, speaker, passage, background) as an intro card, then carries an ordered list of verses:

```ts
interface SermonVerse {
  reference: string   // e.g. "John 3:16-17" — resolved to text via the existing scripture lookup
  notes: string        // the pastor's own notes for this verse, free text
}
```

The sermon opens on the intro card, then steps forward through each verse in order — same mental model as a scripture-reading deck, just embedded in the sermon rather than a separate item.

## 2. Build Service: a new "Verses" section on sermon items

The sermon editor gains a "Verses" list below the existing Title/Speaker/Passage fields: an "Add verse" button, each row a reference input (auto-resolved via the existing scripture lookup, same as scripture items) plus a notes textarea underneath it, reorderable and deletable like other lists already in the app.

## 3. What the congregation's screens show

Today a sermon renders as one static title card wherever "sermon" zone routing sends it (typically Back Left/Right). With this change, those same screens show the intro card, then step through each verse's reference + resolved text as the pastor advances — the congregation sees exactly the verse he's currently on.

## 4. The pulpit tablet

A new page, PIN-gated (same pattern as Sound Check — a PIN gate, not a login), served over the same local network the sanctuary zone TVs already use, at its own address. A tablet on the pulpit opens this page in kiosk/browser mode.

**Mode-aware rendering**, following whatever's actually live:

- **Song or announcement live:** shows the same content the physical Stage Monitor TV shows — display only, no controls. The pulpit tablet doubles as a second stage monitor outside sermon time.
- **Sermon live:** switches automatically to the split view below. No manual mode switch — it just follows the live item type, same as every other zone already does.

**Sermon split view** (even 50/50 left/right):

- Left: his notes for the *current* verse, following along as he advances
- Right: the same verse text the congregation is currently seeing
- Thin header bar: sermon title
- Bottom: large Next / Prev controls, small progress indicator ("3 of 8")
- Before the sermon goes live: a simple "not live yet" state — no queued-item preview

**Shared control:** the tablet's Next/Prev drives the exact same live position the operator's own controls drive — either can advance, always in sync. Not a separate confidence-only feed; a second clicker on the same deck.

## 5. Physical Next/Prev buttons (future add-on, same phase's design)

The tablet's on-screen Next/Prev and the operator's controls already agree on one thing: advancing the sermon is a single shared action, triggerable by any client. A physical button doesn't need to talk to the tablet — it only needs to trigger that same action directly.

Concretely: expose the sermon advance/back action as a plain network call any device on the church network can hit (in addition to however the tablet's own UI and the operator's controls already trigger it today). A small second Pi (or a cheap WiFi microcontroller) wired to two physical buttons, running a minimal script that fires that call on a press, becomes a third "clicker" — no redesign, just one more caller of an action that already needs to be callable from more than one place. Exact hardware (Pi Zero vs. microcontroller) is a build-time choice, not a design decision.

## Non-goals

- No changes to the physical Stage Monitor TV's own behavior.
- No Snow Hill Church app work in this phase.
- No login system for the pulpit tablet — PIN gate only, matching Sound Check.
- No offline/queued-item preview on the tablet before the sermon goes live.
