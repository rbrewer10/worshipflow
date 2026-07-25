# Build Service Slide Filmstrip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an item's real resolved slides in Build Service — a filmstrip of every slide under the four zone screens, where clicking a slide renders that slide's actual text on all four cards.

**Architecture:** The Bible lookup already exists behind `window.wf.serviceSlides(serviceId)`, which returns `{ id, slides: string[] }` per item and is already consumed by the Live tab's `SlideGrid`. Build Service simply never calls it. `ServiceEditor` fetches it, passes the selected item's slides into `ZoneScreenGrid`, which owns a selected-slide index and renders a filmstrip. The selected slide's text flows down to each `ZoneScreenCard` and into `ServiceSlidePreview` via a new optional `overrideLine` prop, so the themed rendering (background, blur, colours) is reused rather than duplicated.

**Tech Stack:** Electron + electron-vite, React 18, TypeScript, Tailwind v3, vitest.

**Approved design decisions:** filmstrip of every slide (not first-slide-only); clicking a thumbnail loads that slide into the four screens.

**Context:** Builds directly on `2026-07-25-build-service-zone-view.md` (Phase 1), which is complete and installed. Branch `feat/build-service-zone-view`.

---

## Why the placeholder exists today

`ServiceSlidePreview`'s `scripture` case renders the reference plus the literal string "Verse text appears on the projector when live". That is because the component is synchronous and reads only `item.payload`; verse text comes from a lookup (`lookupScripture` locally for KJV, `fetchScripture` over the network otherwise) that cannot run during render. `computeItemSlides` in `src/main/index.ts` already performs exactly that lookup and returns one array entry per verse.

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `src/renderer/src/zones/ZoneSlideFilmstrip.tsx` | Horizontal strip of slide thumbnails plus a slide count. Presentational and fully controlled. |

**Modify:**

| File | Change |
|---|---|
| `src/renderer/src/ServiceSlidePreview.tsx` | New optional `overrideLine` prop; when present, scripture/text/announcement render it instead of their placeholder. |
| `src/renderer/src/zones/ZoneScreenCard.tsx` | New optional `slideText` prop, forwarded to `ServiceSlidePreview` as `overrideLine`. |
| `src/renderer/src/zones/ZoneScreenGrid.tsx` | New `slides` prop; owns `selectedSlide` state; renders the filmstrip; passes the selected slide's text to each card. |
| `src/renderer/src/ServiceEditor.tsx` | Fetch `serviceSlides` on load and after every change; pass the selected item's slides to `ZoneScreenGrid`. |

---

## Task 1: `overrideLine` on ServiceSlidePreview

**Files:**
- Modify: `src/renderer/src/ServiceSlidePreview.tsx`

- [ ] **Step 1: Add the prop**

In `ServiceSlidePreviewProps`, add:

```ts
  // Real resolved slide text for this item, when the caller has it (scripture
  // verses come from a Bible lookup that can't run during render, so without
  // this the scripture case can only show a placeholder).
  overrideLine?: string
```

Add `overrideLine` to the destructured parameter list of the component.

- [ ] **Step 2: Use it in the scripture case**

Replace the `case 'scripture':` block's returned JSX so that when `overrideLine` is a non-empty string it renders the verse text as the main line with the reference as a small label above, and otherwise falls back to today's exact placeholder:

```tsx
      case 'scripture': {
        const reference = (payload.reference as string | undefined) || 'Reference'
        return (
          <div className="flex flex-col items-center gap-2 px-6 text-center">
            <div
              className={overrideLine ? 'text-[10px] font-semibold uppercase tracking-[0.2em]' : 'text-3xl font-bold leading-tight'}
              style={overrideLine ? { ...baseTextStyle, opacity: 0.8 } : baseTextStyle}
            >
              {reference}
            </div>
            {overrideLine ? (
              <div className="text-xl font-bold leading-tight" style={baseTextStyle}>
                {overrideLine}
              </div>
            ) : (
              <div className="text-xs" style={{ ...baseTextStyle, opacity: 0.6 }}>
                Verse text appears on the projector when live
              </div>
            )}
          </div>
        )
      }
```

- [ ] **Step 3: Use it in the announcement case**

In `case 'announcement':`, replace `{item.title}` with `{overrideLine || item.title}` so a multi-slide announcement previews its actual body text.

- [ ] **Step 4: Verify**

Run: `cd "C:\Dev\worshipflow" && npm run typecheck && npm test`
Expected: typecheck silent; 137 tests pass across 12 files.

- [ ] **Step 5: Commit**

```bash
cd "C:\Dev\worshipflow" && git add src/renderer/src/ServiceSlidePreview.tsx && git commit -m "feat: ServiceSlidePreview accepts resolved slide text

Scripture verses come from a Bible lookup that can't run during render, so
the scripture case could only ever show a placeholder. Callers that already
have the resolved text can now pass it in.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: ZoneSlideFilmstrip

**Files:**
- Create: `src/renderer/src/zones/ZoneSlideFilmstrip.tsx`

- [ ] **Step 1: Create the component**

```tsx
// Every slide this item will produce, as a clickable strip. Selecting one
// renders it across the four zone screens above, so a long passage can be
// checked slide by slide without going live. Fully controlled.
export default function ZoneSlideFilmstrip({ slides, selected, onSelect }: {
  slides: string[]
  selected: number
  onSelect: (index: number) => void
}): JSX.Element {
  if (slides.length <= 1) return <></>
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {slides.length} slides
      </span>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {slides.map((text, i) => (
          <button
            key={i}
            onClick={() => onSelect(i)}
            title={text}
            className={`flex h-14 w-24 shrink-0 flex-col justify-between rounded-lg border-2 p-1.5 text-left transition-colors ${
              i === selected ? 'border-blue-500 bg-blue-500/10' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <span className="line-clamp-2 text-[9px] leading-tight text-slate-600">{text}</span>
            <span className="text-[9px] font-semibold text-slate-400">{i + 1}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Run: `cd "C:\Dev\worshipflow" && npm run typecheck`
Expected: silent. If `line-clamp-2` is unavailable, replace it with `overflow-hidden` — do not add a Tailwind plugin, this project must stay on Tailwind v3 with its existing config.

- [ ] **Step 3: Commit**

```bash
cd "C:\Dev\worshipflow" && git add src/renderer/src/zones/ZoneSlideFilmstrip.tsx && git commit -m "feat: add ZoneSlideFilmstrip

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Thread slide text through the card

**Files:**
- Modify: `src/renderer/src/zones/ZoneScreenCard.tsx`

- [ ] **Step 1: Add the prop**

Add to the props type:

```ts
  slideText?: string
```

Add `slideText` to the destructured parameter list.

- [ ] **Step 2: Forward it**

In `body()`, change the content branch to pass it through:

```tsx
    if (role === 'content') {
      return <ServiceSlidePreview item={item} serviceTheme={serviceTheme} serviceColors={serviceColors} songFull={songFull} overrideLine={slideText} />
    }
```

- [ ] **Step 3: Verify and commit**

Run: `cd "C:\Dev\worshipflow" && npm run typecheck && npm test`
Expected: typecheck silent; 137 tests pass.

```bash
cd "C:\Dev\worshipflow" && git add src/renderer/src/zones/ZoneScreenCard.tsx && git commit -m "feat: ZoneScreenCard forwards resolved slide text to its preview

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Filmstrip + selected slide in the grid

**Files:**
- Modify: `src/renderer/src/zones/ZoneScreenGrid.tsx`

- [ ] **Step 1: Add the prop and state**

Add to the props type:

```ts
  slides: string[]
```

Add `slides` to the destructured parameter list, and add state plus a reset effect alongside the existing ones:

```tsx
  const [selectedSlide, setSelectedSlide] = useState(0)

  // A different item (or an edit that changes the slide count) must not leave
  // the strip pointing past the end of the new slide list.
  useEffect(() => { setSelectedSlide(0) }, [item.id, slides.length])
```

Import `ZoneSlideFilmstrip from './ZoneSlideFilmstrip'`.

- [ ] **Step 2: Render the filmstrip and pass the slide text**

Directly below the closing `</div>` of the `grid grid-cols-2` block, add:

```tsx
      <ZoneSlideFilmstrip slides={slides} selected={selectedSlide} onSelect={setSelectedSlide} />
```

And on each `ZoneScreenCard`, add:

```tsx
              slideText={slides[selectedSlide]}
```

- [ ] **Step 3: Verify and commit**

Run: `cd "C:\Dev\worshipflow" && npm run typecheck && npm test`
Expected: typecheck silent; 137 tests pass.

```bash
cd "C:\Dev\worshipflow" && git add src/renderer/src/zones/ZoneScreenGrid.tsx && git commit -m "feat: zone grid renders a slide filmstrip

Selecting a slide renders its real text across all four screens, so a long
passage can be checked slide by slide without going live.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Fetch the slides in ServiceEditor

**Files:**
- Modify: `src/renderer/src/ServiceEditor.tsx`

- [ ] **Step 1: Add state and fetch**

Add state alongside the other `useState` declarations:

```tsx
  const [itemSlides, setItemSlides] = useState<Record<number, string[]>>({})
```

Find the existing effect or function that loads the service (the one `reload` drives). After the service is set, fetch slides the same way `SlideGrid.tsx:41` does, and store them keyed by item id:

```tsx
  useEffect(() => {
    if (!service) return
    void window.wf.serviceSlides(service.id).then((rows) => {
      const map: Record<number, string[]> = {}
      for (const r of rows) map[r.id] = r.slides
      setItemSlides(map)
    })
  }, [service])
```

Read `SlideGrid.tsx` around line 41 first and follow whatever shape it actually uses.

- [ ] **Step 2: Pass to the grid**

On the `<ZoneScreenGrid ... />` mount, add:

```tsx
              slides={itemSlides[selectedItem.id] ?? []}
```

- [ ] **Step 3: Verify and commit**

Run: `cd "C:\Dev\worshipflow" && npm run typecheck && npm test`
Expected: typecheck silent; 137 tests pass.

```bash
cd "C:\Dev\worshipflow" && git add src/renderer/src/ServiceEditor.tsx && git commit -m "feat: Build Service resolves real slide text for the zone grid

Calls the same serviceSlides IPC the Live tab's slide grid already uses, so
scripture items preview their actual verses and their real slide count
instead of a placeholder.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Build, install, verify

- [ ] **Step 1:** `cd "C:\Dev\worshipflow" && npm run typecheck && npm test` — expect silence, then 137 tests passing.
- [ ] **Step 2:** `cd "C:\Dev\worshipflow" && npm run dist` — expect it to end at `building block map`.
- [ ] **Step 3:** `taskkill //F //IM "WorshipFlow Pro.exe"`, then launch `C:\Dev\worshipflow\dist-installer\WorshipFlow Pro Setup 0.9.0.exe`. The Install button runs elevated and cannot be clicked by automation — ask Ryan to click Next → Install → Finish.
- [ ] **Step 4:** Confirm the install landed by comparing byte length, not just timestamp:
  `powershell -Command "Get-Item 'C:\Dev\worshipflow\dist-installer\win-unpacked\resources\app.asar' | Select-Object LastWriteTime, Length; Get-Item 'C:\Program Files\WorshipFlow Pro\resources\app.asar' | Select-Object LastWriteTime, Length"`
  Both must match. Do not check until the installer's progress bar has finished.
- [ ] **Step 5: Verify in the app.** Select a scripture item spanning several verses in Build Service and confirm:
  1. The zone cards show the real verse text, not "Verse text appears on the projector when live".
  2. A filmstrip appears below the grid with a "N slides" count matching the verse count.
  3. Clicking slide 3 changes the text on all Content cards to slide 3's verse.
  4. Off-track cards stay dimmed and locked, and still show the selected slide's text.
  5. A single-verse scripture shows no filmstrip (the strip hides at one slide).
  6. Songs still preview their lyrics as before.

---

## Notes for the implementer

- Tailwind must stay on v3.
- Never run a dev server — this is an Electron app, verified via the built installer.
- `window.wf.serviceSlides` already exists in the preload AND in `browserWfMock.ts`. No preload or mock change is needed.
- `computeItemSlides` only returns entries for items that can go live, so `itemSlides[id]` may legitimately be missing — always fall back to `[]`.
