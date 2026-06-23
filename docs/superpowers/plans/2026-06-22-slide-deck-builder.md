# Slide-Deck Builder + Per-Item Design (Stage 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the form-based service builder with a visual deck of item cards (live previews, add-buttons, drag-to-reorder, click-to-edit) where each card can override the service theme with its own theme + colors.

**Architecture:** A new `ServiceDeck` (cards + drag-reorder) and `CardEditPanel` (content + per-item design) replace the form list inside `ServiceBuilder`. Per-item style lives in a new `service_item.style` JSON column; the main process resolves the live theme per item (item override → else service baseline) and broadcasts it to the unchanged Stage-1-aware `Output`.

**Tech Stack:** Electron + React 18 + TypeScript, sql.js, Tailwind v3, Vite. Native HTML5 drag-and-drop (no new dependency).

**Verification note:** No unit-test framework. Pure logic verified with throwaway Node scripts; UI/rendering via `npm run typecheck` + booting (`npm run dev`) + manual check. Commits to current branch.

---

### Task 1: Data model — `ItemStyle` type + `service_item.style` column

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/db.ts`

- [ ] **Step 1: Add `ItemStyle` and extend `ServiceItem` in `types.ts`**

After the `ThemeColors` re-export near the top, the type is available. Add the interface and field:
```ts
export interface ItemStyle {
  theme?: string
  colors?: ThemeColors
}
```
And add to `ServiceItem`:
```ts
export interface ServiceItem {
  id: number
  ordinal: number
  type: ServiceItemType
  ref_id: number | null
  payload: Record<string, unknown>
  title: string
  notes: string | null
  style: ItemStyle | null
}
```

- [ ] **Step 2: Add the column + migration in `db.ts`**

In the `SCHEMA` constant's `service_item` table, add `style TEXT` before `payload_json` (column order is cosmetic):
```sql
CREATE TABLE IF NOT EXISTS service_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER NOT NULL REFERENCES service(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  type TEXT NOT NULL,
  ref_id INTEGER,
  payload_json TEXT
);
```
(Leave the existing CREATE as-is if changing it risks existing DBs — the migration below is what matters.) Add next to the other `ALTER TABLE` migrations in `initDb`:
```ts
try { db.run('ALTER TABLE service_item ADD COLUMN style TEXT') } catch { /* already exists */ }
```

- [ ] **Step 3: Read `style` in `getService`**

Change the items query and the row mapping in `getService`:
```ts
const stmt = db.prepare(
  'SELECT id, ordinal, type, ref_id, payload_json, notes, style FROM service_item WHERE service_id = ? ORDER BY ordinal'
)
```
In the loop, extend the row type with `style: string | null` and the pushed item with:
```ts
style: r.style ? (JSON.parse(r.style) as ItemStyle) : null
```
Add `ItemStyle` to the `from '../shared/types'` import in `db.ts`.

- [ ] **Step 4: Typecheck**

Run: `cd C:\Dev\worshipflow; npm run typecheck`
Expected: errors only where other code constructs `ServiceItem` without `style` (the tablet item-summary mapping uses a narrowed shape, not full `ServiceItem`, so should be fine). Fix any full-`ServiceItem` constructions by adding `style: null`. Re-run until clean.

---

### Task 2: DB functions — set style, set payload, reorder

**Files:**
- Modify: `src/main/db.ts`

- [ ] **Step 1: Add three functions** (append near `updateServiceItemNotes`)

```ts
export function setServiceItemStyle(itemId: number, style: ItemStyle | null): void {
  db.run('UPDATE service_item SET style = ? WHERE id = ?', [style ? JSON.stringify(style) : null, itemId])
  persist()
}

export function setServiceItemPayload(itemId: number, payload: Record<string, unknown>): void {
  db.run('UPDATE service_item SET payload_json = ? WHERE id = ?', [JSON.stringify(payload ?? {}), itemId])
  persist()
}

export function reorderServiceItems(serviceId: number, orderedIds: number[]): void {
  db.run('BEGIN')
  try {
    orderedIds.forEach((id, i) => {
      db.run('UPDATE service_item SET ordinal = ? WHERE id = ? AND service_id = ?', [i, id, serviceId])
    })
    db.run('COMMIT')
    persist()
  } catch (e) {
    db.run('ROLLBACK')
    throw e
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` → no new errors.

---

### Task 3: IPC + preload for the new DB functions

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Import the new DB functions** (add to the `from './db'` import list)

```ts
  setServiceItemStyle,
  setServiceItemPayload,
  reorderServiceItems,
```

- [ ] **Step 2: Add IPC handlers** (near the other `wf:services:*` handlers)

```ts
ipcMain.handle('wf:services:setItemStyle', (_e, itemId: number, style: import('../shared/types').ItemStyle | null) => {
  setServiceItemStyle(itemId, style)
})
ipcMain.handle('wf:services:setItemPayload', (_e, itemId: number, payload: Record<string, unknown>) => {
  setServiceItemPayload(itemId, payload)
})
ipcMain.handle('wf:services:reorder', (_e, serviceId: number, orderedIds: number[]) => {
  reorderServiceItems(serviceId, orderedIds)
})
```

- [ ] **Step 3: Add preload APIs** (next to `serviceUpdateItemNotes`)

```ts
  serviceSetItemStyle: (itemId: number, style: import('../shared/types').ItemStyle | null): Promise<void> =>
    ipcRenderer.invoke('wf:services:setItemStyle', itemId, style),
  serviceSetItemPayload: (itemId: number, payload: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke('wf:services:setItemPayload', itemId, payload),
  serviceReorder: (serviceId: number, orderedIds: number[]): Promise<void> =>
    ipcRenderer.invoke('wf:services:reorder', serviceId, orderedIds),
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck` → no errors.

---

### Task 4: Per-item theme resolution in the main process

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Add a service-baseline pair** (next to the Stage-1 `liveSlideTheme` vars)

```ts
let serviceSlideTheme: string = DEFAULT_THEME_ID       // service-level baseline
let serviceSlideThemeColors: ThemeColors | null = null
```

- [ ] **Step 2: Add a resolver** (near the other live helpers, e.g. after `clearSongMeta`)

```ts
// Effective projector theme = the live item's override, else the service baseline.
function applyItemTheme(item: ServiceItem | undefined): void {
  if (item?.style?.theme) {
    liveSlideTheme = item.style.theme
    liveSlideThemeColors = item.style.colors ?? null
  } else {
    liveSlideTheme = serviceSlideTheme
    liveSlideThemeColors = serviceSlideThemeColors
  }
}
```

- [ ] **Step 3: Set the baseline in `wf:setActiveService`**

Replace the Stage-1 lines that set `liveSlideTheme`/`liveSlideThemeColors` in that handler with baseline assignments, then resolve for the current item:
```ts
serviceSlideTheme = (svc as { theme?: string | null } | null)?.theme || DEFAULT_THEME_ID
serviceSlideThemeColors = (svc as { themeColors?: ThemeColors | null } | null)?.themeColors ?? null
applyItemTheme(activeServiceItems.find((it) => it.id === liveServiceItemId))
```

- [ ] **Step 4: Resolve per item when the live item id is set**

In `wf:live:setItemId`, after computing `liveItemNotes`, add:
```ts
applyItemTheme(item)
```
In `handleTabletLoadItem`, after `liveServiceItemId = item.id` / `liveItemNotes = item.notes ?? null`, add:
```ts
applyItemTheme(item)
```

- [ ] **Step 5: Update the Stage-1 `wf:service:setTheme` handler to set the baseline**

Change its body so the service theme updates the baseline and re-resolves the current item:
```ts
ipcMain.handle('wf:service:setTheme', (_e, serviceId: number, themeId: string | null, colors: ThemeColors | null) => {
  setServiceTheme(serviceId, themeId, colors)
  serviceSlideTheme = themeId || DEFAULT_THEME_ID
  serviceSlideThemeColors = colors
  applyItemTheme(activeServiceItems.find((it) => it.id === liveServiceItemId))
  broadcast()
})
```

- [ ] **Step 6: Typecheck + boot smoke test**

Run: `npm run typecheck` → no errors.
Run: `npm run dev`. Confirm boot with no errors. (Per-item override has no UI yet; full check in Task 9.)

---

### Task 5: Extract `ThemeChooser` from `ThemePicker`

**Files:**
- Modify: `src/renderer/src/ThemePicker.tsx`
- Create: `src/renderer/src/ThemeChooser.tsx`

- [ ] **Step 1: Create `ThemeChooser.tsx`** (the swatch grid + color pickers, theme-agnostic about what it targets)

```tsx
import { THEMES, getTheme, resolveColors, staticBackgroundCss } from '../../shared/themes'
import type { ThemeColors } from '../../shared/types'

function ThemeChooser({ themeId, colors, onPickTheme, onSetColor, onReset }: {
  themeId: string | null
  colors: ThemeColors | null
  onPickTheme: (id: string) => void
  onSetColor: (key: keyof ThemeColors, val: string) => void
  onReset: () => void
}): JSX.Element {
  const active = getTheme(themeId)
  const c = resolveColors(active, colors)
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        {THEMES.map((t) => {
          const tc = resolveColors(t, t.id === active.id ? colors : null)
          const swatch = t.kind === 'static' ? staticBackgroundCss(t, tc) : `linear-gradient(120deg, ${tc.primary}, ${tc.secondary})`
          return (
            <button key={t.id} onClick={() => onPickTheme(t.id)}
              className={`rounded-md p-1 text-left ${t.id === active.id ? 'ring-2 ring-blue-500' : 'ring-1 ring-white/10'}`}>
              <div className="h-7 w-full rounded" style={{ background: swatch }} />
              <span className="mt-0.5 block text-[10px] text-slate-400">{t.kind === 'motion' ? '✨ ' : ''}{t.name}</span>
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-3 border-t border-white/10 pt-2">
        <label className="flex items-center gap-1 text-[11px] text-slate-400">Primary
          <input type="color" value={c.primary} onChange={(e) => onSetColor('primary', e.target.value)} className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0" /></label>
        <label className="flex items-center gap-1 text-[11px] text-slate-400">Second
          <input type="color" value={c.secondary} onChange={(e) => onSetColor('secondary', e.target.value)} className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0" /></label>
        <label className="flex items-center gap-1 text-[11px] text-slate-400">Text
          <input type="color" value={c.text} onChange={(e) => onSetColor('text', e.target.value)} className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0" /></label>
        <button onClick={onReset} className="ml-auto text-[11px] text-slate-500 hover:text-slate-300">Reset</button>
      </div>
    </div>
  )
}

export default ThemeChooser
```

- [ ] **Step 2: Make `ThemePicker` use `ThemeChooser`**

Replace the swatch-grid + color-picker JSX inside `ThemePicker`'s `open` block with:
```tsx
<ThemeChooser
  themeId={active.id}
  colors={colors}
  onPickTheme={setTheme}
  onSetColor={setColor}
  onReset={resetColors}
/>
```
Add `import ThemeChooser from './ThemeChooser'`. Keep `ThemePicker`'s existing `setTheme`/`setColor`/`resetColors` handlers (they call `window.wf.serviceSetTheme`).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` → no errors. (Service theme picker should look identical to before.)

---

### Task 6: `SlideThumb` — card mini-preview

**Files:**
- Create: `src/renderer/src/SlideThumb.tsx`

- [ ] **Step 1: Create `SlideThumb.tsx`**

```tsx
import { getTheme, resolveColors, staticBackgroundCss, FONT_FAMILY } from '../../shared/themes'
import type { ItemStyle } from '../../shared/types'

// 16:9 preview of an item using its effective theme (item override else service theme).
function SlideThumb({ label, itemStyle, serviceTheme, serviceColors }: {
  label: string
  itemStyle: ItemStyle | null
  serviceTheme: string | null
  serviceColors: { primary?: string; secondary?: string; text?: string } | null
}): JSX.Element {
  const themeId = itemStyle?.theme ?? serviceTheme
  const overrides = itemStyle?.theme ? itemStyle.colors ?? null : serviceColors
  const theme = getTheme(themeId)
  const colors = resolveColors(theme, overrides)
  const bg = theme.kind === 'static'
    ? staticBackgroundCss(theme, colors)
    : `linear-gradient(120deg, ${colors.primary}, ${colors.secondary})`
  return (
    <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-md px-2 text-center"
      style={{ background: bg }}>
      <span className="line-clamp-2 text-[11px] font-semibold leading-tight"
        style={{ fontFamily: FONT_FAMILY[theme.font], color: colors.text }}>
        {label}
      </span>
    </div>
  )
}

export default SlideThumb
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` → no errors.

---

### Task 7: `ServiceDeck` — cards, add-buttons, drag-reorder

**Files:**
- Create: `src/renderer/src/ServiceDeck.tsx`

- [ ] **Step 1: Create `ServiceDeck.tsx`**

```tsx
import { useState } from 'react'
import type { ServiceFull, ServiceItem } from '../../shared/types'
import SlideThumb from './SlideThumb'

const ICON: Record<ServiceItem['type'], string> = {
  song: '🎵', scripture: '📖', text: '📝', countdown: '⏱', image: '🖼', welcome: '👋', ticker: '📰'
}

const ADD_TYPES: { type: ServiceItem['type']; label: string }[] = [
  { type: 'song', label: '🎵 Song' }, { type: 'scripture', label: '📖 Scripture' },
  { type: 'text', label: '📝 Text' }, { type: 'image', label: '🖼 Image' },
  { type: 'countdown', label: '⏱ Countdown' }, { type: 'welcome', label: '👋 Welcome' },
  { type: 'ticker', label: '📰 Ticker' }
]

function ServiceDeck({ service, liveItemId, selectedId, onSelect, onAdd, onGoLive, onReordered }: {
  service: ServiceFull
  liveItemId: number | null
  selectedId: number | null
  onSelect: (id: number) => void
  onAdd: (type: ServiceItem['type']) => void
  onGoLive: (item: ServiceItem) => void
  onReordered: () => void
}): JSX.Element {
  const [dragId, setDragId] = useState<number | null>(null)
  const items = service.items

  const onDrop = (targetId: number): void => {
    if (dragId == null || dragId === targetId) return
    const ids = items.map((i) => i.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    ids.splice(to, 0, ids.splice(from, 1)[0])
    setDragId(null)
    window.wf.serviceReorder(service.id, ids).then(onReordered)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {ADD_TYPES.map((a) => (
          <button key={a.type} onClick={() => onAdd(a.type)}
            className="rounded-lg border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-xs font-semibold hover:bg-white/[0.12]">
            + {a.label}
          </button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-auto pr-1 sm:grid-cols-3">
        {items.length === 0 && <p className="col-span-full py-8 text-center text-sm text-slate-500">Empty service — add items above.</p>}
        {items.map((it, i) => (
          <div key={it.id} draggable
            onDragStart={() => setDragId(it.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(it.id)}
            onClick={() => onSelect(it.id)}
            className={`cursor-pointer rounded-lg border p-1.5 transition-colors ${
              selectedId === it.id ? 'border-blue-500 ring-1 ring-blue-500/40' : 'border-white/10 hover:border-white/25'
            } ${dragId === it.id ? 'opacity-50' : ''}`}>
            <SlideThumb label={it.type === 'song' ? it.title : (it.title || ICON[it.type])}
              itemStyle={it.style} serviceTheme={service.theme} serviceColors={service.themeColors} />
            <div className="mt-1 flex items-center gap-1">
              <span className="w-4 text-center text-[10px] text-slate-500">{i + 1}</span>
              <span className="text-xs">{ICON[it.type]}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">{it.title}</span>
              {liveItemId === it.id
                ? <span className="text-[10px] font-bold text-emerald-400">● LIVE</span>
                : <button onClick={(e) => { e.stopPropagation(); onGoLive(it) }}
                    className="text-[11px] text-slate-500 hover:text-emerald-300" title="Go live">▶</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ServiceDeck
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` → no errors.

---

### Task 8: `CardEditPanel` — content + per-item design

**Files:**
- Create: `src/renderer/src/CardEditPanel.tsx`

- [ ] **Step 1: Create `CardEditPanel.tsx`**

This panel edits one item's content (by type) and its design. Content edits update the item payload via `serviceSetItemPayload`; the song picker sets `ref_id` — since there is no payload field for `ref_id`, songs are edited by re-adding (out of scope here): for song cards the panel shows the linked song name read-only with a note. All other types edit their payload fields.

```tsx
import { useEffect, useState } from 'react'
import type { ServiceItem, ItemStyle, SongSummary, ThemeColors } from '../../shared/types'
import ThemeChooser from './ThemeChooser'

function CardEditPanel({ item, songs, onClose, onChanged, onDelete }: {
  item: ServiceItem
  songs: SongSummary[]
  onClose: () => void
  onChanged: () => void
  onDelete: (item: ServiceItem) => void
}): JSX.Element {
  const [p, setP] = useState<Record<string, unknown>>(item.payload ?? {})
  const [notes, setNotes] = useState(item.notes ?? '')
  const override = item.style?.theme != null
  useEffect(() => { setP(item.payload ?? {}); setNotes(item.notes ?? '') }, [item.id])

  const savePayload = (next: Record<string, unknown>): void => {
    setP(next)
    window.wf.serviceSetItemPayload(item.id, next).then(onChanged)
  }
  const saveNotes = (): void => { window.wf.serviceUpdateItemNotes(item.id, notes.trim() || null).then(onChanged) }

  const setStyle = (style: ItemStyle | null): void => { window.wf.serviceSetItemStyle(item.id, style).then(onChanged) }
  const setOverride = (on: boolean): void => setStyle(on ? { theme: 'sanctuary' } : null)
  const pickTheme = (id: string): void => setStyle({ theme: id, colors: item.style?.colors })
  const setColor = (key: keyof ThemeColors, val: string): void =>
    setStyle({ theme: item.style?.theme ?? 'sanctuary', colors: { ...(item.style?.colors ?? {}), [key]: val } })
  const resetColors = (): void => setStyle({ theme: item.style?.theme ?? 'sanctuary' })

  return (
    <div className="flex w-80 shrink-0 flex-col gap-3 overflow-auto rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold capitalize">{item.type}</h3>
        <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300">✕ Close</button>
      </div>

      {/* Content fields by type */}
      {item.type === 'scripture' && (
        <input value={(p.reference as string) ?? ''} placeholder="John 3:16"
          onChange={(e) => savePayload({ ...p, reference: e.target.value })}
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-blue-500" />
      )}
      {item.type === 'text' && (
        <>
          <input value={(p.title as string) ?? ''} placeholder="Title"
            onChange={(e) => savePayload({ ...p, title: e.target.value })}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-blue-500" />
          <textarea value={(p.body as string) ?? ''} placeholder="Body" rows={4}
            onChange={(e) => savePayload({ ...p, body: e.target.value })}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-blue-500" />
        </>
      )}
      {item.type === 'ticker' && (
        <input value={(p.text as string) ?? ''} placeholder="Announcement text"
          onChange={(e) => savePayload({ ...p, text: e.target.value })}
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-blue-500" />
      )}
      {(item.type === 'countdown' || item.type === 'welcome') && (
        <label className="text-xs text-slate-400">Minutes
          <input type="number" value={Math.round(((p.seconds as number) ?? 300) / 60)}
            onChange={(e) => savePayload({ ...p, seconds: Math.max(1, Number(e.target.value)) * 60 })}
            className="ml-2 w-20 rounded border border-white/10 bg-black/30 px-2 py-1 text-sm" /></label>
      )}
      {item.type === 'song' && (
        <p className="text-xs text-slate-500">Linked song: <span className="text-slate-300">{songs.find((s) => s.id === item.ref_id)?.title ?? item.title}</span>. Edit lyrics in the Songs tab.</p>
      )}
      {item.type === 'image' && (
        <p className="text-xs text-slate-500 break-all">Image: {(p.path as string) ?? '—'}</p>
      )}

      {/* Notes */}
      <div>
        <label className="text-[11px] uppercase tracking-wider text-slate-500">Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} rows={2}
          placeholder="Notes for operator / pastor…"
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs outline-none focus:border-blue-500" />
      </div>

      {/* Per-item design */}
      <div className="border-t border-white/10 pt-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <input type="checkbox" checked={!override} onChange={(e) => setOverride(!e.target.checked)} className="h-4 w-4" />
          Use service theme
        </label>
        {override && (
          <div className="mt-2">
            <ThemeChooser themeId={item.style?.theme ?? 'sanctuary'} colors={item.style?.colors ?? null}
              onPickTheme={pickTheme} onSetColor={setColor} onReset={resetColors} />
          </div>
        )}
      </div>

      <button onClick={() => onDelete(item)} className="mt-auto rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20">
        🗑 Delete item
      </button>
    </div>
  )
}

export default CardEditPanel
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` → no errors.

---

### Task 9: Wire the deck + edit panel into `ServiceBuilder`

**Files:**
- Modify: `src/renderer/src/ServiceBuilder.tsx`

- [ ] **Step 1: Import the new components**

```tsx
import ServiceDeck from './ServiceDeck'
import CardEditPanel from './CardEditPanel'
```

- [ ] **Step 2: Add selection state + handlers** (inside the component)

```tsx
const [selectedId, setSelectedId] = useState<number | null>(null)
const selectedItem = service?.items.find((it) => it.id === selectedId) ?? null

const addCard = async (type: ServiceItem['type']): Promise<void> => {
  if (openId == null) return
  // song needs a ref_id; if a song is picked elsewhere keep existing add flow. Here add empty content cards:
  const payload: Record<string, unknown> =
    type === 'countdown' || type === 'welcome' ? { seconds: 300 } : {}
  const id = await window.wf.serviceAddItem(openId, { type, payload })
  reload()
  setSelectedId(id)
}
```
(For `song` cards, keep using the existing song-add control in the sidebar if present; `addCard('song')` creates a song card with no `ref_id` that the operator links via that control. If the existing builder already has a song picker that calls `serviceAddItem` with `ref_id`, reuse it for the Song add-button instead of `addCard('song')`.)

- [ ] **Step 3: Replace the form-list block with the deck + panel**

Find the `service ? ( … item list … )` block (the `<div className="mb-4 min-h-0 flex-1 …">` items list and the add-form sections below it) and replace the **items list + add forms** with:
```tsx
<div className="flex min-h-0 flex-1 gap-3">
  <ServiceDeck
    service={service}
    liveItemId={live?.liveServiceItemId ?? null}
    selectedId={selectedId}
    onSelect={setSelectedId}
    onAdd={addCard}
    onGoLive={(it) => sendItemLive(it)}
    onReordered={reload}
  />
  {selectedItem && (
    <CardEditPanel
      item={selectedItem}
      songs={songs}
      onClose={() => setSelectedId(null)}
      onChanged={reload}
      onDelete={(it) => delItem(it.id, it.title)}
    />
  )}
</div>
```
Keep the header (name + print), the Stage-1 `ThemePicker`, and the import buttons. Remove the old per-item up/down move buttons and the inline add-form sections (their fields now live in `CardEditPanel`). If `sendItemLive`, `delItem`, and `live` are not already in scope in `ServiceBuilder`, add: subscribe to `window.wf.onState` for `live`; import/define `sendItemLive` mirroring `LiveView`'s (or call `window.wf.liveLoadSong` etc. by type); and use the existing delete handler. (`ServiceBuilder` already has a delete confirm flow — reuse `confirmDelete`/`delItem`.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`. Fix any missing-scope errors (e.g. add a `live` state + `onState` subscription if absent; ensure `sendItemLive` exists). Re-run until clean.

- [ ] **Step 5: Boot + full visual check**

Run: `npm run dev`. In the Service tab:
- Open a service → the deck of cards shows with previews; add-buttons appear above.
- Click each add-button → a card appears and its edit panel opens; enter content (scripture ref, text, minutes) → the card preview/title updates.
- Drag a card onto another → order changes and persists (reopen the service to confirm).
- Click a card → edit panel; toggle off "Use service theme", pick Aurora, change a color → the card preview updates.
- Go live on that item → projector uses the item's Aurora; go live on another → projector uses the service theme.
- Delete a card via the panel → confirm dialog → removed.
- Confirm notes, tablet, and go-live still work.

---

### Task 10: Final verification pass

- [ ] **Step 1: Full typecheck** — `npm run typecheck` → no errors.
- [ ] **Step 2: Cold-boot migration** — `npm run dev` boots against existing `worshipflow.db`; existing services open and show as cards.
- [ ] **Step 3: Acceptance (per spec):** build a whole service using only the deck; per-item override renders correctly live; existing features (go-live, notes, tablet, OBS, CCLI, PowerPoint import) all still work.

---

## Self-Review Notes (addressed)

- **Spec coverage:** card model + thumbnails (Tasks 6–7), add/drag/click-edit (Tasks 7–9), per-item design override (Tasks 1–5, 8), per-item theme resolution (Task 4), data model + DB/IPC/preload (Tasks 1–3), ServiceBuilder integration replacing the form list (Task 9). All covered.
- **Naming:** `ItemStyle` ({theme, colors}); `service_item.style`; DB `setServiceItemStyle`/`setServiceItemPayload`/`reorderServiceItems`; preload `serviceSetItemStyle`/`serviceSetItemPayload`/`serviceReorder`; IPC `wf:services:setItemStyle`/`setItemPayload`/`reorder`. `serviceSlideTheme`/`serviceSlideThemeColors` (baseline) vs `liveSlideTheme`/`liveSlideThemeColors` (effective). Consistent across tasks.
- **Resolution precedence:** `applyItemTheme` (item override → service baseline) called wherever the live item id changes (setItemId, handleTabletLoadItem, setActiveService, service setTheme).
- **Known limitation (in-scope-acceptable):** linking a *new* song to a song card is left to the existing song-add control; `CardEditPanel` shows the linked song read-only. Editing lyrics stays in the Songs tab.
