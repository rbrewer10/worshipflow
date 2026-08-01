import { useEffect, useReducer, useRef } from 'react'
import type { ComponentType, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { navMenuReducer, initialNavMenuState } from './navMenuState'
import type { NavMenuAction, NavMenuState } from './navMenuState'

type IconType = ComponentType<{ size?: number | string; className?: string }>

export interface NavMenuItem<T extends string> {
  id: T
  label: string
  Icon: IconType
}

// A top-bar dropdown. Destinations the operator enters deliberately (libraries,
// setup) live in here rather than as flat tabs, so the bar stays readable —
// see the 2026-08-01 spec. Live-critical controls are never put behind one of
// these: a dropdown costs a click, and mid-service that matters.
function NavMenu<T extends string>({ label, items, activeId, onSelect }: {
  label: string
  items: NavMenuItem<T>[]
  activeId: T | null
  onSelect: (id: T) => void
}): JSX.Element {
  const [state, dispatch] = useReducer(
    (s: NavMenuState, a: NavMenuAction) => navMenuReducer(s, a, items.length),
    initialNavMenuState
  )
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (!state.open) return
    const onMouseDown = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) dispatch({ type: 'close' })
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [state.open])

  // DOM focus follows the reducer's highlight, so screen readers announce the
  // right item and Enter/Space activate it natively.
  useEffect(() => {
    if (state.open && state.highlighted >= 0) itemRefs.current[state.highlighted]?.focus()
  }, [state.open, state.highlighted])

  const close = (returnFocus: boolean): void => {
    dispatch({ type: 'close' })
    if (returnFocus) triggerRef.current?.focus()
  }

  const choose = (id: T): void => {
    onSelect(id)
    close(true)
  }

  const onTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); dispatch({ type: 'openAtFirst' }) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); dispatch({ type: 'openAtLast' }) }
    else if (e.key === 'Escape' && state.open) { e.preventDefault(); close(false) }
  }

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); dispatch({ type: 'next' }) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); dispatch({ type: 'prev' }) }
    else if (e.key === 'Home') { e.preventDefault(); dispatch({ type: 'first' }) }
    else if (e.key === 'End') { e.preventDefault(); dispatch({ type: 'last' }) }
    else if (e.key === 'Escape') { e.preventDefault(); close(true) }
    // Focus the trigger BEFORE closing: Tab's default action resolves against
    // whatever is focused right now, and the item under focus is about to be
    // unmounted — leaving focus to fall back to <body> instead of moving on.
    else if (e.key === 'Tab') { triggerRef.current?.focus(); dispatch({ type: 'close' }) }
  }

  const containsActive = items.some((it) => it.id === activeId)

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        ref={triggerRef}
        onClick={() => dispatch({ type: 'toggle' })}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="menu"
        aria-expanded={state.open}
        className={`flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
          containsActive
            ? 'bg-blue-600 font-medium text-white'
            : 'font-normal text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
        }`}
      >
        {label}
        <ChevronDown size={14} className="flex-shrink-0" />
      </button>

      {state.open && (
        <div
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          className="absolute left-0 top-full z-50 mt-1 min-w-[13rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {items.map((item, i) => (
            <button
              key={item.id}
              ref={(el) => { itemRefs.current[i] = el }}
              role="menuitem"
              onClick={() => choose(item.id)}
              onMouseEnter={() => dispatch({ type: 'highlight', index: i })}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                item.id === activeId ? 'font-medium text-blue-700' : 'text-slate-700'
              } ${state.highlighted === i ? 'bg-slate-100' : 'hover:bg-slate-100'}`}
            >
              <item.Icon size={15} className="flex-shrink-0 text-slate-500" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default NavMenu
