# WorshipFlow Pro — Keyboard Shortcuts Reference

These shortcuts work on the **Live Control** tab (and the core ones in **Volunteer mode**, below). They deliberately do nothing on other tabs — so typing or using the arrow keys while editing a song or a service can never black or advance the projectors — and they are ignored while you're typing in a text box, dropdown, or text area. They are ignored if Ctrl, Cmd/Windows, or Alt is held down at the same time, so they won't collide with normal app shortcuts.

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
| `S` | Return to normal lyrics/slides (un-clears layers) |
| `C` | Clear lyrics — background stays (ProPresenter “clear slide”). Press again to bring them back. |
| `G` | Clear background — lyrics stay. Press again to bring it back. |
| `X` | Clear the lower-third overlay |

---

### Notes

- Source of truth: the handler in `src/renderer/src/AppShell.tsx` (`handleKeyDown`), which is only mounted while the Live tab is showing.
- Going live on a new item always brings the lyrics back (a `C` from the previous item doesn't carry over). A cleared background (`G`) does stay cleared until you press `G` or `S`.
- While lyrics or the background are hidden, the CURRENT preview says so ("Lyrics hidden on the screens").
- Volunteer mode (`src/renderer/src/VolunteerView.tsx`) wires up its own copy of the core shortcuts (Space/→ next, ← previous, `B` black, `L` logo, `S` show lyrics + background again) so they behave identically there.
- The Live tab's right-hand panel (`src/renderer/src/LiveTools.tsx`) shows a small on-screen cheat sheet with the same keys (Space/→, ←, B, L, and a note that `S` returns to lyrics) as a quick visual reminder while you work.
- Clicking a slide thumbnail directly, or clicking a service item in the left rail, also changes what's live — these keyboard shortcuts are shortcuts for the same underlying "go live" actions, not a separate system.
