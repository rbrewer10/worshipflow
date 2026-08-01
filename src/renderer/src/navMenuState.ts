// Pure keyboard/open-state logic for NavMenu, kept free of React and the DOM so
// it is testable under this repo's Node-only Vitest config (see saveQueue.ts,
// saveRegistry.ts, songDuplicates.ts for the same pattern). NavMenu.tsx owns the
// rendering and focus side effects; every decision about *what* the state
// should become lives here.
export interface NavMenuState {
  open: boolean
  // Index of the item the keyboard is on. -1 means "menu open, but the user
  // arrived by mouse and hasn't chosen a keyboard position yet".
  highlighted: number
}

export type NavMenuAction =
  | { type: 'openAtFirst' }
  | { type: 'openAtLast' }
  | { type: 'close' }
  | { type: 'toggle' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'first' }
  | { type: 'last' }
  | { type: 'highlight'; index: number }

export const initialNavMenuState: NavMenuState = { open: false, highlighted: -1 }

const CLOSED: NavMenuState = { open: false, highlighted: -1 }

export function navMenuReducer(
  state: NavMenuState,
  action: NavMenuAction,
  itemCount: number
): NavMenuState {
  const last = itemCount - 1
  switch (action.type) {
    case 'openAtFirst':
      return { open: true, highlighted: itemCount > 0 ? 0 : -1 }
    case 'openAtLast':
      return { open: true, highlighted: itemCount > 0 ? last : -1 }
    case 'close':
      return CLOSED
    case 'toggle':
      return state.open ? CLOSED : { open: true, highlighted: -1 }
    case 'next':
      if (!state.open || itemCount === 0) return state
      return { open: true, highlighted: state.highlighted >= last ? 0 : state.highlighted + 1 }
    case 'prev':
      if (!state.open || itemCount === 0) return state
      return { open: true, highlighted: state.highlighted <= 0 ? last : state.highlighted - 1 }
    case 'first':
      if (!state.open || itemCount === 0) return state
      return { open: true, highlighted: 0 }
    case 'last':
      if (!state.open || itemCount === 0) return state
      return { open: true, highlighted: last }
    case 'highlight':
      if (!state.open) return state
      if (action.index < 0 || action.index > last) return state
      return { open: true, highlighted: action.index }
    default:
      return state
  }
}
