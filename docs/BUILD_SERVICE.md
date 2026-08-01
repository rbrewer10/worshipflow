# Build Service — how it works

This is the screen where you put Sunday together: the order of worship, what
each item shows on each screen, and how it all looks. Nothing here goes on a
screen in the room — you're preparing, not presenting. Sending things live
happens on the **Live** tab.

Find it in the top bar: **Build service**.

---

## The screen at a glance

Four regions, left to right:

| Region | What it holds |
|---|---|
| **Services list** (far left) | Every service you've saved, plus the buttons for creating and importing them |
| **Item deck** (left, inside the open service) | The order of worship — the running list of items |
| **Screen preview** (middle) | The four room screens, showing what the selected item will look like on each |
| **Edit panel** (right) | Settings for whichever item is selected |

The middle and right regions stay empty until you select an item.

Above them all sits the **theme bar**, which sets the look for the whole
service.

---

## Building a service from scratch

### 1. Create it

In the far-left panel, type a name into **New service name…** and press **Enter**
(or click the **+**).

Use something you'll recognise later — `Sunday 10 Aug` beats `Service 3`.

It opens automatically once created.

### 2. Add your items

At the bottom of the item deck there are three ways to add:

- **Song from library** — a dropdown of every song you've saved. Pick one and
  it's appended to the order.
- **Announcement from library** — same, for saved announcements.
- **Add item** — a button that opens the list of everything else (scripture,
  countdown, text, and so on — see the table below).

Add them in roughly the right order if you can; reordering is easy either way.

### 3. Put them in order

**Drag any item up or down** to move it. Drop it where you want it.

### 4. Set the look

Click any item to select it. Three things happen:

- it highlights blue in the deck,
- the **middle** fills with the four room screens showing that item,
- the **right** panel appears with that item's settings.

Use the right panel to set the background, text style, and which screens the
item goes to. The middle preview updates as you change things, so you can see
what the congregation will actually see before Sunday.

### 5. Add presenter notes (optional)

The right panel has a notes field. Whatever you type there shows up in the
**Presenter notes** box on the Live tab when that item is live — useful for
"pastor speaks over the last verse" or "hold this until the band stops".

### 6. Check the whole thing

Click through your items one at a time and watch the middle preview. This is
the step that catches the embarrassing stuff — a missing background, lyrics
running off the bottom, a countdown pointing at the wrong screen.

That's it. There's no save button — everything saves as you go.

---

## What each item type does

### Things that go on screen

| Type | What it's for |
|---|---|
| **Song** | Lyrics from your Song Library, one slide per section. The most common item. |
| **Scripture** | A Bible passage. Pulls the text in for you. |
| **Announcement** | A saved announcement from your Announcements library. |
| **Sermon** | A sermon title card — the designed backdrop that sits behind the pastor. |
| **Countdown** | A ticking clock down to zero. Use it before the service starts. |
| **Welcome** | A welcome/greeting screen. |
| **Text** | Any free text you type. The catch-all when nothing else fits. |
| **Image/Video** | A picture or video file, full screen. |
| **Ticker** | A line of text that scrolls along the bottom over whatever else is showing. |

### Things that don't go on screen

These two are for organising the list. They never appear on any screen, have no
"go live" button, and no screen settings:

| Type | What it's for |
|---|---|
| **Section header** | A coloured divider row — "Worship", "Offering", "Message". Purely to break up a long list so you can find things fast. |
| **Placeholder (TBD)** | A "we haven't decided yet" row. Holds the slot in the order so you don't forget it. Also what a church-app plan import creates when a song in the plan isn't in your library yet. |

---

## Working with items

**Select one** — click it.

**Select several** — hold **Ctrl** and click each one, or click the first and
**Shift**-click the last to take everything between. A bar appears at the top of
the deck showing how many are selected, with **Delete** and **Clear**.

Multi-select is mouse-only. Keyboard Enter or Space selects a single item.

**Duplicate** — each item has a duplicate button. Handy when two songs share the
same background and styling; copy one and swap the song.

**Delete** — the bin icon. You'll be asked to confirm, and after it's gone a
toast appears with **Undo**. The undo puts the item back with its notes,
styling and screen settings intact — but only while the toast is on screen, so
click it promptly if you deleted the wrong thing.

**Send live** — items have a play button here too. It does the same thing as the
Live tab. Fine while you're setting up; on Sunday, drive from the Live tab.

---

## The theme bar

Sits above everything and sets the default look — colours, fonts, background
style — for the **whole service**.

Set this first, before styling individual items. Changing it later doesn't wipe
per-item settings you've made, but it does change everything you haven't
overridden, so it's a jarring thing to do at the end.

Individual items can override the theme in the right-hand panel.

---

## Starting from something you already have

Five options, all in the far-left panel:

**Import slides as images** — for a PowerPoint you don't need to edit. Export
your slides as PNGs first (in PowerPoint: File → Save As → PNG), then import
the images. They come in as picture items, one per slide. Reliable, but the
text is baked in and can't be changed.

**Import .pptx (editable text)** — imports the PowerPoint file directly. Text
stays editable and backgrounds are pulled out where possible. Better if you
need to fix a typo, but complex slide layouts may not survive intact.

**Load saved service (.wfservice)** — opens a service file exported from another
computer. This is how you move a service between machines.

**Import plan from church app** — imports a `.wfplan` file exported from the
Snow Hill Church planning app. Songs are matched to your library **by title**.
Anything it can't find is added as a **Placeholder** and you'll get a list of
what's missing — add those to your Song Library, then swap the placeholders out.

**Service Templates** — save a service's structure for reuse, or load a saved
one. Good for a standard Sunday shape you rebuild every week.

⚠️ **Loading a template replaces everything currently in the open service.**
Existing items are removed first. Load the template into a fresh service, not
one you've already built.

---

## Sharing, printing, popping out

Three buttons at the top right of the open service:

**Pop out** — opens the service in its own window. Useful on two monitors, so
you can keep the order visible while working elsewhere in the app.

**Save to file** — writes a `.wfservice` file you can back up or move to
another computer. Load it there with **Load saved service**.

**Print** — prints a plain paper running order: item number, type, title and
notes. This is the sheet for the sound desk or the worship leader's music
stand.

---

## Scheduled announcements

If a service has a **date**, a panel appears above the item deck listing
announcements scheduled for that date, each with a one-tap **Add**. Ones already
in the service show as "Added" instead.

**A service only has a date if it came from an "Import plan from church app".**
There is currently no way to set or change the date on a service you build by
hand — so for hand-built services this panel never appears, and the printed
order has no date on it. Add those announcements from the **Announcement from
library** dropdown instead.

---

## Second track

If you use a second output track, a small four-cell badge appears at the top of
the item deck. Click it to choose which of the four room screens follow **Main**
and which follow **Second**.

If you don't use a second track, you won't see this and can ignore it.

---

## Quick reference

| To do this | Do this |
|---|---|
| Create a service | Type a name, press Enter |
| Add a song | **Song from library** dropdown |
| Add anything else | **Add item** button |
| Reorder | Drag the item |
| Select several | Ctrl+click, or Shift+click for a range |
| Change how one item looks | Select it, use the right-hand panel |
| Change how everything looks | The theme bar at the top |
| Recover a deleted item | **Undo** on the toast, before it fades |
| Get it onto another computer | **Save to file**, then **Load saved service** |
| Paper copy for the desk | **Print** |

---

## Related

- [Quick start](QUICK_START.md)
- [Keyboard shortcuts](KEYBOARD_SHORTCUTS.md)
