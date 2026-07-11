# WorshipFlow Pro — Keyboard Shortcuts Reference

These shortcuts are active anywhere in the main app window (Live control, Volunteer mode, etc.) as long as you're not currently typing in a text box, dropdown, or text area. They are ignored if Ctrl, Cmd/Windows, or Alt is held down at the same time, so they won't collide with normal app shortcuts.

## Slide navigation

| Key | Action |
|---|---|
| `Space` | Go to the next slide/item |
| `→` (Right Arrow) | Go to the next slide/item |
| `←` (Left Arrow) | Go to the previous slide/item |
| `N` | Go to the next slide/item |
| `P` | Go to the previous slide/item |

## Screen control

| Key | Action |
|---|---|
| `B` | Show a black (blank) screen |
| `L` | Show the church logo screen |
| `S` | Return to normal lyrics/slides display |

---

### Notes

- Source of truth: the global handler in `src/renderer/src/AppShell.tsx` (`handleKeyDown`), which is active across the whole app.
- Volunteer mode (`src/renderer/src/VolunteerView.tsx`) wires up its own copy of the same core shortcuts (Space/→ next, ← previous, `B` black, `L` logo) so they behave identically there.
- The Live tab's right-hand panel (`src/renderer/src/LiveTools.tsx`) shows a small on-screen cheat sheet with the same keys (Space/→, ←, B, L, and a note that `S` returns to lyrics) as a quick visual reminder while you work.
- Clicking a slide thumbnail directly, or clicking a service item in the left rail, also changes what's live — these keyboard shortcuts are shortcuts for the same underlying "go live" actions, not a separate system.
