import type { ComponentType, ButtonHTMLAttributes } from 'react'
import { cn } from './ui/cn'

type IconType = ComponentType<{ size?: number | string; className?: string }>

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconType
  size?: number
}

// Icon-only button with the shared hover/press treatment. No existing .btn*
// class in main.css covers a bare icon-only square button, so this is a
// small dedicated primitive rather than a one-off style per call site —
// see the 2026-08-11 visual-redesign design spec's Section 2. First
// consumer: TopBar's "?" help button.
function IconButton({ icon: Icon, size = 15, className, ...rest }: IconButtonProps): JSX.Element {
  return (
    <button
      className={cn(
        'flex items-center justify-center rounded-lg border border-border bg-panel p-1.5 text-content-secondary transition-colors hover:bg-panel-raised hover:text-content-primary',
        className
      )}
      {...rest}
    >
      <Icon size={size} />
    </button>
  )
}

export default IconButton
